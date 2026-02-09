use serde::Deserialize;
use std::time::Duration;
use moka::future::Cache;

#[derive(Deserialize, Debug)]
struct IpApiResponse {
    status: String,
    #[serde(rename = "countryCode")]
    country_code: Option<String>,
}

pub async fn resolve_country_code(mut ip: String, cache: &Cache<String, String>) -> String {
    // 1. Handle Localhost / Dev Environment
    // If we are on localhost, we fetch the REAL public IP so we can get a flag.
    // We cache this mapping (127.0.0.1 -> UA) so we don't hit ident.me constantly.
    if ip == "127.0.0.1" || ip == "::1" {
        // Check cache for "127.0.0.1" first to avoid hitting ident.me repeatedly
        if let Some(cached_code) = cache.get(&ip).await {
            return cached_code;
        }

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap_or_default();

        // Fetch external IP
        match client.get("https://4.ident.me").send().await {
            Ok(resp) => {
                if let Ok(public_ip) = resp.text().await {
                    // Update 'ip' variable to the public one, so the logic below
                    // queries ip-api.com for the public IP, not 127.0.0.1
                    ip = public_ip;
                }
            }
            Err(_) => {
                // If no internet in dev mode, return XX
                return "XX".to_string();
            }
        }
    }

    // 2. Check Cache (Normal flow)
    // If we swapped 127.0.0.1 for a real IP above, we now check cache for that real IP
    if let Some(cached_code) = cache.get(&ip).await {
        return cached_code;
    }

    // 3. Skip Private Ranges (192.168.x.x, 10.x.x.x)
    // We only skip these if we haven't already resolved a Public IP in step 1
    if ip.starts_with("192.168.") || ip.starts_with("10.") {
        return "XX".to_string();
    }

    // 4. Fetch from ip-api.com
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

    // 5. Insert into Cache
    // If the original request was 127.0.0.1, we want to cache that 127.0.0.1 maps to the result
    // so we don't call ident.me again.
    // However, here 'ip' might have been changed to the public IP.
    // It is safer to cache the *resolved* value against the *actual* IP used for lookup.
    cache.insert(ip, country_code.clone()).await;

    // Optional: If we are in dev mode, also map 127.0.0.1 to this result explicitly
    // so step 1 returns immediately next time.
    cache.insert("127.0.0.1".to_string(), country_code.clone()).await;
    cache.insert("::1".to_string(), country_code.clone()).await;

    country_code
}
