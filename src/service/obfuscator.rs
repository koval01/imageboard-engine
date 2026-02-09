use serde::Serialize;
use base64::{Engine as _, engine::general_purpose};

pub struct Obfuscator;

impl Obfuscator {
    /// Encrypts data using a rolling XOR cipher based on the key (session_id)
    pub fn pack<T: Serialize>(data: &T, key: &str) -> String {
        let json = serde_json::to_string(data).unwrap_or_default();
        let key_bytes = key.as_bytes();
        let input_bytes = json.as_bytes();

        let mut output = Vec::with_capacity(input_bytes.len());

        for (i, byte) in input_bytes.iter().enumerate() {
            // Rolling XOR: byte ^ key_char ^ index (adds position dependency)
            let key_byte = key_bytes[i % key_bytes.len()];
            output.push(byte ^ key_byte ^ ((i % 255) as u8));
        }

        // Return Base64 string
        general_purpose::STANDARD.encode(output)
    }
}
