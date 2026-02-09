use serde::Deserialize;
use std::time::Duration;
use moka::future::Cache;

#[derive(Deserialize, Debug)]
struct IpApiResponse {
    status: String,
    #[serde(rename = "countryCode")]
    country_code: Option<String>,
}

pub async fn resolve_country_code(ip: &str, cache: &Cache<String, String>) -> String {
    // 1. Check Reserved/Local IPs first (No need to cache or query API)
    if ip == "127.0.0.1" || ip == "::1" || ip.starts_with("192.168.") || ip.starts_with("10.") {
        return "XX".to_string();
    }

    // 2. Check Cache
    if let Some(cached_code) = cache.get(ip).await {
        return cached_code;
    }

    // 3. Fetch from API
    let url = format!("http://ip-api.com/json/{}", ip);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .unwrap_or_default();

    let country_code = match client.get(&url).send().await {
        Ok(response) => {
            if let Ok(json) = response.json::<IpApiResponse>().await {
                if json.status == "success" {
                    json.country_code.unwrap_or("XX".to_string())
                } else {
                    "XX".to_string()
                }
            } else {
                "XX".to_string()
            }
        }
        Err(e) => {
            eprintln!("Failed to resolve IP {}: {}", ip, e);
            "XX".to_string()
        }
    };

    // 4. Insert into Cache
    cache.insert(ip.to_string(), country_code.clone()).await;

    country_code
}
