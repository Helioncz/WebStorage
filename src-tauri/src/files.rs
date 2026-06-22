use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

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

/// Ulozi bajty do CAS (pokud jeste neexistuji) a vrati hash.
pub fn store_object(vault_dir: &Path, bytes: &[u8]) -> Result<String, String> {
    let hash = hash_bytes(bytes);
    let dest = object_path(vault_dir, &hash);
    if !dest.exists() {
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("create objects dir: {e}"))?;
        }
        fs::write(&dest, bytes).map_err(|e| format!("write object: {e}"))?;
    }
    Ok(hash)
}

/// Nacte blob z CAS.
pub fn read_object(vault_dir: &Path, hash: &str) -> Result<Vec<u8>, String> {
    let path = object_path(vault_dir, hash);
    fs::read(&path).map_err(|e| format!("read object: {e}"))
}
