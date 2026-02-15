use std::sync::Arc;
use axum::{
    extract::{ConnectInfo, Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    body::{Body, to_bytes},
    Json
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde_json::json;
use std::net::SocketAddr;
use tokio::sync::RwLock;
use uuid::Uuid;
use time::Duration;
use sha2::{Sha256, Digest};
use sea_orm::{EntityTrait, QueryFilter, ColumnTrait};

use crate::{model::{SessionClaims, admins}, security::{get_client_ip, get_user_agent}, AppState};

#[derive(Clone)]
pub struct CurrentSession {
    pub id: String,
    pub role: i32,
    pub version: i32,
}

pub async fn response_time_middleware(request: Request, next: Next) -> Response {
    let start = std::time::Instant::now();
    let response = next.run(request).await;
    let elapsed = start.elapsed();
    let time_ms = elapsed.as_secs_f64() * 1000.0;
    let time_str = format!("{:.3}ms", time_ms);

    let (mut parts, body) = response.into_parts();

    if let Ok(val) = time_str.parse() {
        parts.headers.insert("X-Processing-Time", val);
    }

    let is_html = parts.headers.get(axum::http::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.starts_with("text/html"))
        .unwrap_or(false);

    if is_html {
        match to_bytes(body, 1024 * 1024).await {
            Ok(bytes) => {
                if let Ok(content) = std::str::from_utf8(&bytes) {
                    let marker = "<!-- PROC_TIME -->";
                    if content.contains(marker) {
                        let new_content = content.replace(marker, &format!("Processed in {}", time_str));
                        return Response::from_parts(parts, Body::from(new_content));
                    }
                }
                return Response::from_parts(parts, Body::from(bytes));
            }
            Err(_) => {
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
    let state_read = state.read().await;
    let config = &state_read.config;
    let jwt_secret = config.jwt_secret.as_bytes();
    let current_ip = get_client_ip(&headers, &addr);
    let current_ua = get_user_agent(&headers);
    let db = &state_read.pool;

    let mut session_id = String::new();
    let mut role = 0;
    let mut version = 1;
    let mut is_valid_token = false;

    // 1. Validate Existing Token
    if let Some(cookie) = cookie_jar.get("session_id") {
        let token = cookie.value();
        let validation = Validation::default();

        if let Ok(token_data) = decode::<SessionClaims>(
            token,
            &DecodingKey::from_secret(jwt_secret),
            &validation,
        ) {
            let claims = token_data.claims;

            // IP & UA binding check
            if claims.ip == current_ip && claims.ua == current_ua {
                // SECURITY: Check Token Version against DB for Admins
                let mut version_check_pass = true;

                if claims.role > 0 {
                    // Logic fixed here: We actually check the DB result now
                    let admin_opt = admins::Entity::find()
                        .filter(admins::Column::Role.eq(claims.role))
                        .one(db).await.unwrap_or(None);

                    if let Some(admin) = admin_opt {
                        // If the version in DB is different from token, invalidate
                        if admin.token_version != claims.v {
                            version_check_pass = false;
                        } else {
                            // Update local version to match DB (though they are equal here)
                            version = admin.token_version;
                        }
                    } else {
                        // Admin role claimed but no record found (deleted admin?)
                        version_check_pass = false;
                    }
                } else {
                    // Regular user, verify claimed version (usually 1)
                    version = claims.v;
                }

                if version_check_pass {
                    session_id = claims.sess;
                    role = claims.role;
                    is_valid_token = true;
                }
            }
        }
    }

    // 2. Create New Session if Invalid
    if !is_valid_token {
        session_id = Uuid::new_v4().to_string();
        role = 0;
        version = 1;
    }

    // 3. Inject Session into Request
    let current_session = CurrentSession { id: session_id.clone(), role, version };
    req.extensions_mut().insert(current_session.clone());

    // 4. Process Request
    let response = next.run(req).await;

    // 5. Re-Sign Token & Handle Cookies
    // We fetch extensions again because the Handler (Login/Logout) might have updated the session
    let final_session = response.extensions().get::<CurrentSession>().cloned().unwrap_or(current_session);

    let now = chrono::Utc::now();
    let iat = now.timestamp() as usize;
    let exp = (now + chrono::Duration::days(365)).timestamp() as usize;

    let claims = SessionClaims {
        sess: final_session.id.clone(),
        ip: current_ip,
        ua: current_ua,
        role: final_session.role,
        v: final_session.version,
        iat,
        exp,
    };

    let token = encode(&Header::default(), &claims, &EncodingKey::from_secret(jwt_secret)).unwrap();

    // NOTE: #[allow(unused_mut)] suppresses warnings in Dev mode where .secure(true) is not called.
    #[allow(unused_mut)]
    let mut jwt_cookie = Cookie::build(("session_id", token))
        .path("/")
        .max_age(Duration::days(365))
        .http_only(true)
        .same_site(SameSite::Lax);

    #[cfg(not(debug_assertions))]
    {
        jwt_cookie = jwt_cookie.secure(true);
    }

    #[allow(unused_mut)]
    let mut key_cookie = Cookie::build(("client_key", final_session.id))
        .path("/")
        .max_age(Duration::days(365))
        .http_only(false); // Exposed to JS for PoW

    #[cfg(not(debug_assertions))]
    {
        key_cookie = key_cookie.secure(true);
    }

    // Overwrite cookies to prevent layering (ensure only one Set-Cookie header per key)
    let mut response_jar = cookie_jar;
    response_jar = response_jar.add(jwt_cookie.build());
    response_jar = response_jar.add(key_cookie.build());

    Ok((response_jar, response).into_response())
}

pub async fn bot_guard_middleware(
    State(state): State<Arc<RwLock<AppState>>>,
    req: Request,
    next: Next,
) -> Result<Response, Response> {
    if req.method() == axum::http::Method::POST {
        let headers = req.headers();

        let nonce = headers.get("X-PoW-Nonce")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");

        let salt = headers.get("X-PoW-Salt")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");

        // We use the cookie directly here because extensions might not be populated yet depending on middleware order
        let jar = CookieJar::from_headers(headers);
        let session_id = if let Some(cookie) = jar.get("client_key") {
            cookie.value().to_string()
        } else {
            return Err((StatusCode::FORBIDDEN, "No Client Key Cookie").into_response());
        };

        if nonce.is_empty() || salt.is_empty() {
            return Err((
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Missing Proof of Work headers. Enable JS." }))
            ).into_response());
        }

        let state_read = state.read().await;
        let cache_key = format!("pow:{}", salt);
        if state_read.rate_limit_cache.get(&cache_key).await.is_some() {
            return Err((
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Replay attack detected. Do not resubmit forms." }))
            ).into_response());
        }

        let input = format!("{}{}{}", session_id, salt, nonce);
        let mut hasher = Sha256::new();
        hasher.update(input.as_bytes());
        let result = hasher.finalize();

        if result[0] != 0 || result[1] != 0 {
            return Err((
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Invalid Proof of Work computation." }))
            ).into_response());
        }

        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
        state_read.rate_limit_cache.insert(cache_key, now).await;
    }

    Ok(next.run(req).await)
}
