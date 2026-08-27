//! NaCl-compatible `crypto_box_seal` so the browser can encrypt staff passwords
//! without SubtleCrypto (needed on plain HTTP hosts such as the e2e stack).

use base64::Engine;
use blake2::digest::{Update, VariableOutput};
use blake2::Blake2bVar;
use crypto_box::aead::{Aead, OsRng};
use crypto_box::{PublicKey, SalsaBox, SecretKey};

const PK_LEN: usize = 32;
const NONCE_LEN: usize = 24;
const MAC_LEN: usize = 16;

pub struct PasswordCrypto {
    secret: SecretKey,
    public: PublicKey,
}

impl PasswordCrypto {
    pub fn generate() -> Self {
        let secret = SecretKey::generate(&mut OsRng);
        let public = secret.public_key();
        Self { secret, public }
    }

    pub fn public_hex(&self) -> String {
        hex::encode(self.public.as_bytes())
    }

    pub fn seal_b64(&self, plaintext: &[u8]) -> String {
        base64::engine::general_purpose::STANDARD.encode(seal(&self.public, plaintext))
    }

    pub fn open_b64(&self, ciphertext_b64: &str) -> Result<String, String> {
        let raw = base64::engine::general_purpose::STANDARD
            .decode(ciphertext_b64.trim())
            .map_err(|_| "bad encoding".to_string())?;
        let pt = open(&self.secret, &raw)?;
        String::from_utf8(pt).map_err(|_| "invalid utf-8".to_string())
    }
}

#[allow(deprecated)]
fn seal_nonce(
    ephemeral_pk: &[u8],
    recipient_pk: &[u8],
) -> crypto_box::aead::generic_array::GenericArray<u8, crypto_box::aead::generic_array::typenum::U24> {
    let mut hasher = Blake2bVar::new(NONCE_LEN).expect("blake2b 24");
    hasher.update(ephemeral_pk);
    hasher.update(recipient_pk);
    let mut nonce = [0u8; NONCE_LEN];
    hasher.finalize_variable(&mut nonce).expect("nonce");
    crypto_box::aead::generic_array::GenericArray::clone_from_slice(&nonce)
}

fn seal(recipient: &PublicKey, plaintext: &[u8]) -> Vec<u8> {
    let ephemeral = SecretKey::generate(&mut OsRng);
    let eph_pk = ephemeral.public_key();
    let nonce = seal_nonce(eph_pk.as_bytes(), recipient.as_bytes());
    let boxed = SalsaBox::new(recipient, &ephemeral);
    let ct = boxed.encrypt(&nonce, plaintext).expect("seal");
    let mut out = Vec::with_capacity(PK_LEN + ct.len());
    out.extend_from_slice(eph_pk.as_bytes());
    out.extend_from_slice(&ct);
    out
}

fn open(recipient_sk: &SecretKey, sealed: &[u8]) -> Result<Vec<u8>, String> {
    if sealed.len() < PK_LEN + MAC_LEN {
        return Err("short ciphertext".into());
    }
    let eph_bytes: [u8; PK_LEN] = sealed[..PK_LEN]
        .try_into()
        .map_err(|_| "bad ephemeral key".to_string())?;
    let eph_pk = PublicKey::from(eph_bytes);
    let recipient_pk = recipient_sk.public_key();
    let nonce = seal_nonce(eph_pk.as_bytes(), recipient_pk.as_bytes());
    let boxed = SalsaBox::new(&eph_pk, recipient_sk);
    boxed
        .decrypt(&nonce, &sealed[PK_LEN..])
        .map_err(|_| "decrypt failed".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let crypto = PasswordCrypto::generate();
        let sealed = crypto.seal_b64(b"Typical_M0use!-7");
        assert_eq!(crypto.open_b64(&sealed).unwrap(), "Typical_M0use!-7");
    }
}
