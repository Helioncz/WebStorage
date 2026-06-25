// Cloud sync přes Supabase — end-to-end šifrovaný snapshot celého trezoru.
//
// Princip: celý vault (vault.db + vault.salt + objects/) se zazipuje a zašifruje
// AES-256-GCM klíčem odvozeným z master hesla a *sync-salt* (sdíleného mezi
// zařízeními přes Supabase). Do Supabase Storage jde JEN ciphertext — server
// nikdy nevidí hesla ani obsah. Zachovává zero-knowledge model i pro přílohy.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use rand::RngCore;
use serde_json::json;
use std::io::{Read, Write};
use std::path::Path;
use walkdir::WalkDir;

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct CloudConfig {
    pub url: String,
    pub anon_key: String,
    pub email: String,
    pub password: String,
    pub bucket: String,
}

pub struct Session {
    pub access_token: String,
    pub user_id: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct SnapshotMeta {
    pub sync_salt: String,   // hex, sdílený mezi zařízeními (není tajný)
    pub updated_at: String,
    pub device: String,
    pub size: u64,
}

// ----------------------------- Šifrování ---------------------------------

/// Odvodí 32B klíč pro AES-GCM z hesla a sync-salt (Argon2id, viz crypto.rs).
pub fn derive_sync_key(password: &str, salt_hex: &str) -> Result<[u8; 32], String> {
    let salt = hex::decode(salt_hex).map_err(|e| format!("sync_salt: {e}"))?;
    let hex_key = crate::crypto::derive_key_hex(password, &salt)?;
    let bytes = hex::decode(hex_key).map_err(|e| e.to_string())?;
    let mut key = [0u8; 32];
    key.copy_from_slice(&bytes);
    Ok(key)
}

/// nonce(12) || ciphertext
fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| "šifrování selhalo".to_string())?;
    let mut out = Vec::with_capacity(12 + ct.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ct);
    Ok(out)
}

fn decrypt(key: &[u8; 32], blob: &[u8]) -> Result<Vec<u8>, String> {
    if blob.len() < 12 {
        return Err("poškozený snapshot".into());
    }
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(&blob[..12]);
    cipher
        .decrypt(nonce, &blob[12..])
        .map_err(|_| "dešifrování selhalo (špatné heslo?)".to_string())
}

// ----------------------------- ZIP trezoru -------------------------------

/// Zazipuje vault do paměti: vault.db (z konzistentní kopie), vault.salt, objects/.
pub fn zip_vault(vault_dir: &Path, db_snapshot: &Path) -> Result<Vec<u8>, String> {
    let mut cursor = std::io::Cursor::new(Vec::new());
    {
        let mut zip = zip::ZipWriter::new(&mut cursor);
        let opts = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        let add = |zip: &mut zip::ZipWriter<_>, name: &str, path: &Path| -> Result<(), String> {
            let mut f = std::fs::File::open(path).map_err(|e| format!("{name}: {e}"))?;
            let mut buf = Vec::new();
            f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            zip.start_file(name, opts).map_err(|e| e.to_string())?;
            zip.write_all(&buf).map_err(|e| e.to_string())?;
            Ok(())
        };

        add(&mut zip, "vault.db", db_snapshot)?;
        let salt = vault_dir.join("vault.salt");
        if salt.exists() {
            add(&mut zip, "vault.salt", &salt)?;
        }
        let objects = vault_dir.join("objects");
        if objects.is_dir() {
            for entry in WalkDir::new(&objects).into_iter().filter_map(|e| e.ok()) {
                if entry.file_type().is_file() {
                    let rel = entry
                        .path()
                        .strip_prefix(vault_dir)
                        .map_err(|e| e.to_string())?
                        .to_string_lossy()
                        .replace('\\', "/");
                    add(&mut zip, &rel, entry.path())?;
                }
            }
        }
        zip.finish().map_err(|e| e.to_string())?;
    }
    Ok(cursor.into_inner())
}

/// Rozbalí snapshot do vault_dir (přepíše vault.db, vault.salt, objects/).
pub fn unzip_vault(vault_dir: &Path, bytes: &[u8]) -> Result<(), String> {
    let cursor = std::io::Cursor::new(bytes);
    let mut zip = zip::ZipArchive::new(cursor).map_err(|e| format!("čtení ZIP: {e}"))?;
    let mut has_db = false;
    for i in 0..zip.len() {
        let mut file = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_string();
        // Ochrana proti path traversal.
        if name.contains("..") || name.starts_with('/') {
            continue;
        }
        if name == "vault.db" {
            has_db = true;
        }
        let dest = vault_dir.join(&name);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut buf = Vec::new();
        file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        std::fs::write(&dest, &buf).map_err(|e| e.to_string())?;
    }
    if !has_db {
        return Err("snapshot neobsahuje vault.db".into());
    }
    Ok(())
}

// ----------------------------- Supabase ----------------------------------

fn endpoint(cfg: &CloudConfig, path: &str) -> String {
    format!("{}/{}", cfg.url.trim_end_matches('/'), path.trim_start_matches('/'))
}

fn ureq_err(prefix: &str, e: ureq::Error) -> String {
    match e {
        ureq::Error::Status(code, resp) => {
            let body = resp.into_string().unwrap_or_default();
            format!("{prefix}: HTTP {code} {}", body.chars().take(200).collect::<String>())
        }
        ureq::Error::Transport(t) => format!("{prefix}: spojení {t}"),
    }
}

/// Přihlášení k Supabase Auth (grant_type=password).
pub fn auth(cfg: &CloudConfig) -> Result<Session, String> {
    let url = endpoint(cfg, "auth/v1/token?grant_type=password");
    let resp = ureq::post(&url)
        .set("apikey", &cfg.anon_key)
        .set("Content-Type", "application/json")
        .send_json(json!({ "email": cfg.email, "password": cfg.password }))
        .map_err(|e| ureq_err("přihlášení", e))?;
    let body: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
    let access_token = body
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("přihlášení: chybí access_token")?
        .to_string();
    let user_id = body
        .get("user")
        .and_then(|u| u.get("id"))
        .and_then(|v| v.as_str())
        .ok_or("přihlášení: chybí user id")?
        .to_string();
    Ok(Session { access_token, user_id })
}

fn storage_url(cfg: &CloudConfig, sess: &Session, name: &str) -> String {
    endpoint(
        cfg,
        &format!("storage/v1/object/{}/{}/{}", cfg.bucket, sess.user_id, name),
    )
}

pub fn upload(cfg: &CloudConfig, sess: &Session, name: &str, bytes: &[u8], content_type: &str) -> Result<(), String> {
    let url = storage_url(cfg, sess, name);
    ureq::post(&url)
        .set("apikey", &cfg.anon_key)
        .set("Authorization", &format!("Bearer {}", sess.access_token))
        .set("Content-Type", content_type)
        .set("x-upsert", "true")
        .send_bytes(bytes)
        .map_err(|e| ureq_err("nahrání", e))?;
    Ok(())
}

/// Stáhne objekt; vrací None při 404 (ještě neexistuje).
pub fn download(cfg: &CloudConfig, sess: &Session, name: &str) -> Result<Option<Vec<u8>>, String> {
    let url = storage_url(cfg, sess, name);
    match ureq::get(&url)
        .set("apikey", &cfg.anon_key)
        .set("Authorization", &format!("Bearer {}", sess.access_token))
        .call()
    {
        Ok(resp) => {
            let mut buf = Vec::new();
            resp.into_reader()
                .read_to_end(&mut buf)
                .map_err(|e| e.to_string())?;
            Ok(Some(buf))
        }
        Err(ureq::Error::Status(400 | 404, _)) => Ok(None),
        Err(e) => Err(ureq_err("stažení", e)),
    }
}

// ----------------------------- Vyšší operace -----------------------------

pub struct PushResult {
    pub size: u64,
    pub updated_at: String,
}

/// Zašifruje a nahraje snapshot. `password` = master heslo (k odvození sync klíče).
#[allow(clippy::too_many_arguments)]
pub fn push(
    cfg: &CloudConfig,
    vault_dir: &Path,
    db_snapshot: &Path,
    password: &str,
    sync_salt_hex: &str,
    device: &str,
    now: &str,
) -> Result<PushResult, String> {
    let sess = auth(cfg)?;
    let plain = zip_vault(vault_dir, db_snapshot)?;
    let key = derive_sync_key(password, sync_salt_hex)?;
    let cipher = encrypt(&key, &plain)?;
    let size = cipher.len() as u64;
    upload(cfg, &sess, "snapshot.enc", &cipher, "application/octet-stream")?;
    let meta = SnapshotMeta {
        sync_salt: sync_salt_hex.to_string(),
        updated_at: now.to_string(),
        device: device.to_string(),
        size,
    };
    let meta_json = serde_json::to_vec(&meta).map_err(|e| e.to_string())?;
    upload(cfg, &sess, "snapshot.meta.json", &meta_json, "application/json")?;
    Ok(PushResult { size, updated_at: now.to_string() })
}

/// Stáhne metadata snapshotu (None pokud v cloudu zatím nic není).
pub fn fetch_meta(cfg: &CloudConfig) -> Result<Option<SnapshotMeta>, String> {
    let sess = auth(cfg)?;
    match download(cfg, &sess, "snapshot.meta.json")? {
        Some(bytes) => {
            let meta: SnapshotMeta = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
            Ok(Some(meta))
        }
        None => Ok(None),
    }
}

/// Stáhne a dešifruje snapshot a rozbalí ho do vault_dir. Vrací false pokud
/// v cloudu nic není. `password` = master heslo.
pub fn pull(cfg: &CloudConfig, vault_dir: &Path, password: &str) -> Result<bool, String> {
    let sess = auth(cfg)?;
    let meta_bytes = match download(cfg, &sess, "snapshot.meta.json")? {
        Some(b) => b,
        None => return Ok(false),
    };
    let meta: SnapshotMeta = serde_json::from_slice(&meta_bytes).map_err(|e| e.to_string())?;
    let cipher = download(cfg, &sess, "snapshot.enc")?
        .ok_or("v cloudu chybí snapshot.enc")?;
    let key = derive_sync_key(password, &meta.sync_salt)?;
    let plain = decrypt(&key, &cipher)?;
    unzip_vault(vault_dir, &plain)?;
    Ok(true)
}
