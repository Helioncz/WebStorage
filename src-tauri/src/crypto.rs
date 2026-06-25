use argon2::{Algorithm, Argon2, Params, Version};
use rand::RngCore;
use sha2::{Digest, Sha256};

/// Delka soli v bajtech.
const SALT_LEN: usize = 16;
/// Delka odvozeneho klice (256 bitu pro SQLCipher).
const KEY_LEN: usize = 32;

/// Vygeneruje novou nahodnou sul.
pub fn generate_salt() -> [u8; SALT_LEN] {
    let mut salt = [0u8; SALT_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    salt
}

/// Odvodi 256bitovy klic z master hesla pomoci Argon2id.
/// Vraci klic jako hex retezec, ktery se predava SQLCipheru jako raw klic.
pub fn derive_key_hex(password: &str, salt: &[u8]) -> Result<String, String> {
    // Rozumne parametry pro desktop: 64 MiB pamet, 3 iterace, paralelita 1.
    let params = Params::new(64 * 1024, 3, 1, Some(KEY_LEN))
        .map_err(|e| format!("argon2 params: {e}"))?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut key = [0u8; KEY_LEN];
    argon
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| format!("argon2 derive: {e}"))?;

    Ok(hex::encode(key))
}

/// Odvozene klice uctu (Bitwarden-style zero-knowledge).
/// Vse deterministicky z emailu+hesla, takze funguje na jakemkoli zarizeni
/// bez ukladani soli. Server (Supabase) nikdy nevidi skutecne heslo ani
/// sifrovaci klic — dostane jen odvozene `auth_password`.
pub struct AccountKeys {
    /// Klic pro SQLCipher (hex) — odemyka lokalni vault.db.
    pub sqlcipher_key_hex: String,
    /// Klic pro AES-256-GCM sifrovani cloud snapshotu (32 B).
    pub enc_key: [u8; 32],
    /// Heslo posilane do Supabase Auth (NE skutecne heslo uzivatele).
    pub auth_password: String,
}

pub fn derive_account(email: &str, password: &str) -> Result<AccountKeys, String> {
    let email_norm = email.trim().to_lowercase();
    // Deterministicka sul = SHA256(email)[..16].
    let salt = {
        let mut h = Sha256::new();
        h.update(email_norm.as_bytes());
        let d = h.finalize();
        d[..16].to_vec()
    };
    // masterKey = Argon2id(password, salt) -> 32 B.
    let master_hex = derive_key_hex(password, &salt)?;
    let master = hex::decode(&master_hex).map_err(|e| e.to_string())?;
    // Subklic = SHA256(masterKey || label).
    let sub = |label: &[u8]| -> [u8; 32] {
        let mut h = Sha256::new();
        h.update(&master);
        h.update(label);
        let d = h.finalize();
        let mut out = [0u8; 32];
        out.copy_from_slice(&d);
        out
    };
    Ok(AccountKeys {
        sqlcipher_key_hex: hex::encode(sub(b"sqlcipher")),
        enc_key: sub(b"enc"),
        auth_password: hex::encode(sub(b"auth")),
    })
}
