use axum::http::HeaderMap;
use std::net::SocketAddr;

pub fn get_user_agent(headers: &HeaderMap) -> String {
    headers
        .get("user-agent")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("unknown")
        .to_string()
}

pub fn get_client_ip(headers: &HeaderMap, addr: &SocketAddr) -> String {
    // 1. Cloudflare
    if let Some(ip) = headers.get("cf-connecting-ip") {
        if let Ok(ip_str) = ip.to_str() {
            return ip_str.to_string();
        }
    }

    // 2. Standard Forwarded (X-Forwarded-For: client, proxy1, proxy2)
    if let Some(fw) = headers.get("x-forwarded-for") {
        if let Ok(fw_str) = fw.to_str() {
            // We want the first IP in the comma-separated list
            if let Some(real_ip) = fw_str.split(',').next() {
                return real_ip.trim().to_string();
            }
        }
    }

    // 3. Direct Connection (or Localhost)
    addr.ip().to_string()
}
