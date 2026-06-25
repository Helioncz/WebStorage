use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use rand::RngCore;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

const OBJECT_MAGIC: &[u8] = b"HANGAROBJ1";

/// Vypocita SHA-256 obsahu a vrati hex.
pub fn hash_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

/// Cesta k blobu v content-addressable storage: objects/<aa>/<hash>.
pub fn object_path(vault_dir: &Path, hash: &str) -> PathBuf {
    let prefix = &hash[0..2];
    vault_dir.join("objects").join(prefix).join(hash)
}

fn encrypt_object(key: &[u8; 32], bytes: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = cipher
        .encrypt(nonce, bytes)
        .map_err(|_| "šifrování souboru selhalo".to_string())?;
    let mut out = Vec::with_capacity(OBJECT_MAGIC.len() + nonce_bytes.len() + ct.len());
    out.extend_from_slice(OBJECT_MAGIC);
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ct);
    Ok(out)
}

fn decrypt_object(key: &[u8; 32], bytes: &[u8]) -> Result<Vec<u8>, String> {
    if !bytes.starts_with(OBJECT_MAGIC) {
        // Kompatibilita se staršími importy, které byly uložené jako plaintext.
        return Ok(bytes.to_vec());
    }
    let offset = OBJECT_MAGIC.len();
    if bytes.len() < offset + 12 {
        return Err("poškozený šifrovaný objekt".into());
    }
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(&bytes[offset..offset + 12]);
    cipher
        .decrypt(nonce, &bytes[offset + 12..])
        .map_err(|_| "dešifrování souboru selhalo".to_string())
}

/// Ulozi bajty do CAS (pokud jeste neexistuji) a vrati hash.
pub fn store_object(vault_dir: &Path, bytes: &[u8], key: &[u8; 32]) -> Result<String, String> {
    let hash = hash_bytes(bytes);
    let dest = object_path(vault_dir, &hash);
    if !dest.exists() {
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("create objects dir: {e}"))?;
        }
        let encrypted = encrypt_object(key, bytes)?;
        fs::write(&dest, encrypted).map_err(|e| format!("write object: {e}"))?;
    } else if let Ok(existing) = fs::read(&dest) {
        if !existing.starts_with(OBJECT_MAGIC) {
            let encrypted = encrypt_object(key, bytes)?;
            fs::write(&dest, encrypted).map_err(|e| format!("rewrite object: {e}"))?;
        }
    }
    Ok(hash)
}

/// Nacte blob z CAS.
pub fn read_object(vault_dir: &Path, hash: &str, key: &[u8; 32]) -> Result<Vec<u8>, String> {
    let path = object_path(vault_dir, hash);
    let bytes = fs::read(&path).map_err(|e| format!("read object: {e}"))?;
    decrypt_object(key, &bytes)
}
