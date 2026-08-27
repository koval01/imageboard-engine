use crate::config::Config;
use serde::Deserialize;

#[derive(Deserialize)]
struct Siteverify {
    success: bool,
}

pub fn turnstile_enabled(config: &Config) -> bool {
    config.turnstile_secret_key.is_some() && config.turnstile_site_key.is_some()
}

pub async fn verify_turnstile(config: &Config, token: Option<&str>, ip: &str) -> Result<(), String> {
    if !turnstile_enabled(config) {
        return Ok(());
    }
    let secret = config.turnstile_secret_key.as_deref().unwrap();
    let token = token.map(str::trim).filter(|t| !t.is_empty()).ok_or_else(|| {
        "Підтвердіть, що ви не робот.".to_string()
    })?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|_| "Не вдалося перевірити Turnstile.".to_string())?;

    let mut form = vec![
        ("secret", secret.to_string()),
        ("response", token.to_string()),
    ];
    if !ip.is_empty() {
        form.push(("remoteip", ip.to_string()));
    }

    let resp = client
        .post("https://challenges.cloudflare.com/turnstile/v0/siteverify")
        .form(&form)
        .send()
        .await
        .map_err(|_| "Не вдалося перевірити Turnstile.".to_string())?;

    let body: Siteverify = resp
        .json()
        .await
        .map_err(|_| "Не вдалося перевірити Turnstile.".to_string())?;

    if body.success {
        Ok(())
    } else {
        Err("Підтвердіть, що ви не робот.".to_string())
    }
}
