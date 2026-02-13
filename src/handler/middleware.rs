use std::sync::Arc;
use axum::{
    extract::{ConnectInfo, Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    body::{Body, to_bytes}, // Import Body utilities
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

pub async fn response_time_middleware(request: Request, next: Next) -> Response {
    let start = std::time::Instant::now();
    let response = next.run(request).await;
    let elapsed = start.elapsed();
    let time_ms = elapsed.as_secs_f64() * 1000.0;
    let time_str = format!("{:.3}ms", time_ms);

    let (mut parts, body) = response.into_parts();

    // 1. Add Custom Header (X-Processing-Time)
    // Useful for HTMX Javascript to update the footer dynamically on partial reloads
    if let Ok(val) = time_str.parse() {
        parts.headers.insert("X-Processing-Time", val);
    }

    // 2. Server-Side Injection (SSR)
    // Check if the response is HTML. If so, read the body, find the placeholder,
    // and replace it with the actual time. This ensures the time is visible
    // immediately on first paint, without waiting for client-side JS.
    let is_html = parts.headers.get(axum::http::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.starts_with("text/html"))
        .unwrap_or(false);

    if is_html {
        // Buffer body (limit 1MB to be safe)
        match to_bytes(body, 1024 * 1024).await {
            Ok(bytes) => {
                // Try to parse as UTF-8 string to perform replacement
                if let Ok(content) = std::str::from_utf8(&bytes) {
                    let marker = "<!-- PROC_TIME -->";
                    if content.contains(marker) {
                        let new_content = content.replace(marker, &format!("Processed in {}", time_str));
                        return Response::from_parts(parts, Body::from(new_content));
                    }
                }
                // Return original if not text or marker not found
                return Response::from_parts(parts, Body::from(bytes));
            }
            Err(_) => {
                // Body read error
                return Response::builder()
                    .status(StatusCode::INTERNAL_SERVER_ERROR)
                    .body(Body::empty())
                    .unwrap();
            }
        }
    }

    Response::from_parts(parts, body)
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
    State(state): State<Arc<RwLock<AppState>>>,
    req: Request,
    next: Next,
) -> Result<Response, Response> {
    // 1. Only check POST requests
    if req.method() == axum::http::Method::POST {
        let headers = req.headers();

        // 2. Get the PoW Data
        let nonce = headers.get("X-PoW-Nonce")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");

        let salt = headers.get("X-PoW-Salt")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");

        // 3. Get Session ID (client_key)
        let session_id = if let Some(sess) = req.extensions().get::<CurrentSession>() {
            sess.id.clone()
        } else {
            // Wait, extensions might not be populated yet if this middleware runs BEFORE session middleware
            // But usually custom middleware runs inside out. Let's assume order is correct.
            // If Session Middleware hasn't run, we can't verify properly.
            // *Correction*: In src/route.rs, we layered bot_guard *before* session.
            // Axum middleware executes Top -> Bottom for request, Bottom -> Top for response.
            // We need session ID here.
            // **We rely on the Cookie directly here because extension isn't set yet.**
            let jar = CookieJar::from_headers(headers);
            if let Some(cookie) = jar.get("client_key") {
                cookie.value().to_string()
            } else {
                return Err((StatusCode::FORBIDDEN, "No Client Key Cookie").into_response());
            }
        };

        if nonce.is_empty() || salt.is_empty() {
            return Err((
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Missing Proof of Work headers. Enable JS." }))
            ).into_response());
        }

        // 4. Replay Attack Check (Uniqueness)
        let state_read = state.read().await;
        let cache_key = format!("pow:{}", salt);
        if state_read.rate_limit_cache.get(&cache_key).await.is_some() {
            return Err((
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Replay attack detected. Do not resubmit forms." }))
            ).into_response());
        }

        // 5. Verify Proof of Work
        // Input: session_id + salt + nonce
        // Target: Starts with 0x00, 0x00 (16 zero bits)
        let input = format!("{}{}{}", session_id, salt, nonce);
        let mut hasher = Sha256::new();
        hasher.update(input.as_bytes());
        let result = hasher.finalize();

        // Check difficulty
        if result[0] != 0 || result[1] != 0 {
            return Err((
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Invalid Proof of Work computation." }))
            ).into_response());
        }

        // 6. Mark Salt as Used (Prevent Replay)
        // Store current timestamp, expire in 10 mins
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
        state_read.rate_limit_cache.insert(cache_key, now).await;
    }

    Ok(next.run(req).await)
}
