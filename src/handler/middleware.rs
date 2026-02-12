use std::sync::Arc;
use axum::{
    extract::{ConnectInfo, Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json
};
use axum_extra::extract::cookie::{Cookie, CookieJar};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde_json::json;
use std::net::SocketAddr;
use tokio::sync::RwLock;
use uuid::Uuid;
use time::Duration;
use sha2::{Sha256, Digest};

use crate::{model::SessionClaims, security::{get_client_ip, get_user_agent}, AppState};

#[derive(Clone)]
pub struct CurrentSession {
    pub id: String,
    pub role: i32,
}

pub async fn session_middleware(
    cookie_jar: CookieJar,
    State(state): State<Arc<RwLock<AppState>>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    mut req: Request,
    next: Next,
) -> Result<Response, Response> {
    // ... config setup ...
    let config = &state.read().await.config;
    let jwt_secret = config.jwt_secret.as_bytes();
    let current_ip = get_client_ip(&headers, &addr);
    let current_ua = get_user_agent(&headers);

    let mut session_id = String::new();
    let mut role = 0; // Default: User
    let mut is_new_session = true;

    if let Some(cookie) = cookie_jar.get("session_id") {
        let token = cookie.value();
        let validation = Validation::default();

        if let Ok(token_data) = decode::<SessionClaims>(
            token,
            &DecodingKey::from_secret(jwt_secret),
            &validation,
        ) {
            let claims = token_data.claims;
            if claims.ip == current_ip && claims.ua == current_ua {
                session_id = claims.sess;
                role = claims.role; // Preserve role
                is_new_session = false;
            }
        }
    }

    let response_jar = if is_new_session {
        // ... new session generation ...
        session_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now();
        let iat = now.timestamp() as usize;
        let exp = (now + chrono::Duration::days(365)).timestamp() as usize;

        let claims = SessionClaims {
            sess: session_id.clone(),
            ip: current_ip,
            ua: current_ua,
            role: 0, // Default role
            iat,
            exp,
        };

        // ... encode and set cookies (same as before) ...
        let token = encode(&Header::default(), &claims, &EncodingKey::from_secret(jwt_secret)).unwrap();

        let jwt_cookie = Cookie::build(("session_id", token))
            .path("/")
            .max_age(Duration::days(365))
            .http_only(true);

        let key_cookie = Cookie::build(("client_key", session_id.clone()))
            .path("/")
            .max_age(Duration::days(365))
            .http_only(false);

        cookie_jar.add(jwt_cookie).add(key_cookie)
    } else {
        // If not new, just ensure client_key is synced
        let key_cookie = Cookie::build(("client_key", session_id.clone()))
            .path("/")
            .max_age(Duration::days(365))
            .http_only(false);
        cookie_jar.add(key_cookie)
    };

    // Inject session and ROLE into request context
    req.extensions_mut().insert(CurrentSession { id: session_id, role }); // Update CurrentSession struct too!

    let response = next.run(req).await;
    Ok((response_jar, response).into_response())
}


pub async fn bot_guard_middleware(
    State(_): State<Arc<RwLock<AppState>>>,
    req: Request,
    next: Next,
) -> Result<Response, Response> {
    // 1. Only check POST requests
    if req.method() == axum::http::Method::POST {
        let headers = req.headers();

        // 2. Get the PoW Nonce sent by JS
        let nonce = headers.get("X-PoW-Nonce")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");

        // 3. Get Session ID (client_key)
        let session_id = if let Some(sess) = req.extensions().get::<CurrentSession>() {
            sess.id.clone()
        } else {
            return Err((StatusCode::FORBIDDEN, "No Session").into_response());
        };

        // 4. Verify Proof of Work
        // Difficulty: Hash must start with "0000" (approx 65k iterations, ~200ms for user, expensive for bot)
        // Format: SHA256(session_id + nonce)
        let input = format!("{}{}", session_id, nonce);
        let mut hasher = Sha256::new();
        hasher.update(input.as_bytes());
        let result = hasher.finalize();

        // Check if first 2 bytes are 0 (0x00, 0x00) -> equivalent to hex "0000..."
        if result[0] != 0 || result[1] != 0 {
            return Err((
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Invalid Proof of Work. Please enable JavaScript." }))
            ).into_response());
        }
    }

    Ok(next.run(req).await)
}
