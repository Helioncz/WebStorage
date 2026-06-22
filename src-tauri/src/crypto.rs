use argon2::{Algorithm, Argon2, Params, Version};
use rand::RngCore;

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
