// Cloud (Supabase) — hostovaný majitelem appky. Uživatelé se registrují/přihlašují
// emailem+heslem; jejich trezor se synchronizuje end-to-end šifrovaný. Server vidí
// jen ciphertext a odvozené `auth_password` (NE skutečné heslo ani šifrovací klíč).

use crate::cloud_config as cfg;
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use rand::RngCore;
use serde_json::json;
use std::io::{Read, Write};
use std::path::Path;
use walkdir::WalkDir;

#[derive(Clone)]
pub struct Session {
    pub access_token: String,
    pub user_id: String,
    pub email: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct SnapshotMeta {
    pub updated_at: String,
    pub device: String,
    pub size: u64,
}

// ----------------------------- Šifrování ---------------------------------

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

pub fn zip_vault(vault_dir: &Path, db_snapshot: &Path) -> Result<Vec<u8>, String> {
    let mut cursor = std::io::Cursor::new(Vec::new());
    {
        let mut zip = zip::ZipWriter::new(&mut cursor);
        let opts = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        let add = |zip: &mut zip::ZipWriter<_>, name: &str, path: &Path| -> Result<(), String> {
            let mut buf = Vec::new();
            std::fs::File::open(path)
                .map_err(|e| format!("{name}: {e}"))?
                .read_to_end(&mut buf)
                .map_err(|e| e.to_string())?;
            zip.start_file(name, opts).map_err(|e| e.to_string())?;
            zip.write_all(&buf).map_err(|e| e.to_string())?;
            Ok(())
        };
        add(&mut zip, "vault.db", db_snapshot)?;
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

pub fn unzip_vault(vault_dir: &Path, bytes: &[u8]) -> Result<(), String> {
    let cursor = std::io::Cursor::new(bytes);
    let mut zip = zip::ZipArchive::new(cursor).map_err(|e| format!("čtení ZIP: {e}"))?;
    let mut has_db = false;
    for i in 0..zip.len() {
        let mut file = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_string();
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

fn endpoint(path: &str) -> String {
    format!("{}/{}", cfg::SUPABASE_URL.trim_end_matches('/'), path.trim_start_matches('/'))
}

fn ureq_err(prefix: &str, e: ureq::Error) -> String {
    match e {
        ureq::Error::Status(code, resp) => {
            let body = resp.into_string().unwrap_or_default();
            let msg = serde_json::from_str::<serde_json::Value>(&body)
                .ok()
                .and_then(|v| {
                    v.get("error_description")
                        .or_else(|| v.get("msg"))
                        .or_else(|| v.get("message"))
                        .and_then(|x| x.as_str())
                        .map(|s| s.to_string())
                })
                .unwrap_or_else(|| body.chars().take(160).collect());
            format!("{prefix}: {msg} (HTTP {code})")
        }
        ureq::Error::Transport(t) => format!("{prefix}: spojení selhalo ({t})"),
    }
}

fn session_from_json(body: &serde_json::Value, email: &str) -> Result<Session, String> {
    let access_token = body
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("odpověď bez access_token (je u účtu vyžadováno potvrzení e-mailu?)")?
        .to_string();
    let user_id = body
        .get("user")
        .and_then(|u| u.get("id"))
        .and_then(|v| v.as_str())
        .ok_or("odpověď bez user id")?
        .to_string();
    Ok(Session { access_token, user_id, email: email.to_string() })
}

/// Registrace nového účtu. `auth_password` = odvozené heslo (ne skutečné).
pub fn sign_up(email: &str, auth_password: &str) -> Result<Session, String> {
    let resp = ureq::post(&endpoint("auth/v1/signup"))
        .set("apikey", cfg::SUPABASE_ANON_KEY)
        .set("Content-Type", "application/json")
        .send_json(json!({ "email": email, "password": auth_password }))
        .map_err(|e| ureq_err("registrace", e))?;
    let body: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
    session_from_json(&body, email)
}

/// Přihlášení existujícího účtu.
pub fn sign_in(email: &str, auth_password: &str) -> Result<Session, String> {
    let resp = ureq::post(&endpoint("auth/v1/token?grant_type=password"))
        .set("apikey", cfg::SUPABASE_ANON_KEY)
        .set("Content-Type", "application/json")
        .send_json(json!({ "email": email, "password": auth_password }))
        .map_err(|e| ureq_err("přihlášení", e))?;
    let body: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
    session_from_json(&body, email)
}

fn storage_url(sess: &Session, name: &str) -> String {
    endpoint(&format!(
        "storage/v1/object/{}/{}/{}",
        cfg::STORAGE_BUCKET,
        sess.user_id,
        name
    ))
}

fn upload(sess: &Session, name: &str, bytes: &[u8], content_type: &str) -> Result<(), String> {
    ureq::post(&storage_url(sess, name))
        .set("apikey", cfg::SUPABASE_ANON_KEY)
        .set("Authorization", &format!("Bearer {}", sess.access_token))
        .set("Content-Type", content_type)
        .set("x-upsert", "true")
        .send_bytes(bytes)
        .map_err(|e| ureq_err("nahrání", e))?;
    Ok(())
}

fn download(sess: &Session, name: &str) -> Result<Option<Vec<u8>>, String> {
    match ureq::get(&storage_url(sess, name))
        .set("apikey", cfg::SUPABASE_ANON_KEY)
        .set("Authorization", &format!("Bearer {}", sess.access_token))
        .call()
    {
        Ok(resp) => {
            let mut buf = Vec::new();
            resp.into_reader().read_to_end(&mut buf).map_err(|e| e.to_string())?;
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

/// Zašifruje a nahraje snapshot trezoru.
pub fn push(
    sess: &Session,
    enc_key: &[u8; 32],
    vault_dir: &Path,
    db_snapshot: &Path,
    device: &str,
    now: &str,
) -> Result<PushResult, String> {
    let plain = zip_vault(vault_dir, db_snapshot)?;
    let cipher = encrypt(enc_key, &plain)?;
    let size = cipher.len() as u64;
    upload(sess, "snapshot.enc", &cipher, "application/octet-stream")?;
    let meta = SnapshotMeta { updated_at: now.to_string(), device: device.to_string(), size };
    upload(
        sess,
        "snapshot.meta.json",
        &serde_json::to_vec(&meta).map_err(|e| e.to_string())?,
        "application/json",
    )?;
    Ok(PushResult { size, updated_at: now.to_string() })
}

pub fn fetch_meta(sess: &Session) -> Result<Option<SnapshotMeta>, String> {
    match download(sess, "snapshot.meta.json")? {
        Some(b) => Ok(Some(serde_json::from_slice(&b).map_err(|e| e.to_string())?)),
        None => Ok(None),
    }
}

/// Stáhne a dešifruje snapshot do vault_dir. Vrací false, pokud v cloudu nic není.
pub fn pull(sess: &Session, enc_key: &[u8; 32], vault_dir: &Path) -> Result<bool, String> {
    let cipher = match download(sess, "snapshot.enc")? {
        Some(b) => b,
        None => return Ok(false),
    };
    let plain = decrypt(enc_key, &cipher)?;
    unzip_vault(vault_dir, &plain)?;
    Ok(true)
}
