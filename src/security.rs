use axum::http::HeaderMap;
use std::net::SocketAddr;

pub fn get_user_agent(headers: &HeaderMap) -> String {
    headers
        .get("user-agent")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("unknown")
        .to_string()
}

pub fn get_client_ip(addr: &SocketAddr) -> String {
    addr.ip().to_string()
}
