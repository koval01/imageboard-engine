use sea_orm::PaginatorTrait;
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
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde_json::json;
use std::net::SocketAddr;
use tokio::sync::RwLock;
use uuid::Uuid;
use time::Duration;
use sha2::{Sha256, Digest};
use sea_orm::{EntityTrait, QueryFilter, ColumnTrait};
use chrono::Utc;

use crate::{model::{SessionClaims, admins, bans}, security::{get_client_ip, get_user_agent}, AppState};

#[derive(Clone, Debug)]
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
        // Limit response buffering to 1MB to prevent DoS
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
    // 0. Performance Optimization: Skip logic for static assets
    if req.uri().path().starts_with("/assets") || req.uri().path().ends_with(".webp") || req.uri().path().ends_with(".ico") {
        return Ok(next.run(req).await);
    }

    let state_read = state.read().await;
    let config = &state_read.config;
    let jwt_secret = config.jwt_secret.as_bytes();
    let current_ip = get_client_ip(&headers, &addr);
    let current_ua = get_user_agent(&headers);
    let db = &state_read.pool;

    let mut session_id = String::new();
    let mut role = 0;
    let mut version = 1;

    // Flags to determine if we need to issue a NEW cookie
    let mut is_valid_token = false;
    let mut needs_refresh = false;
    let mut claims_opt: Option<SessionClaims> = None;

    // 1. Validate Existing Token
    if let Some(cookie) = cookie_jar.get("session_id") {
        let token = cookie.value();
        // SECURITY: Validate using HS384
        let mut validation = Validation::new(Algorithm::HS384);
        validation.validate_exp = true;

        if let Ok(token_data) = decode::<SessionClaims>(
            token,
            &DecodingKey::from_secret(jwt_secret),
            &validation,
        ) {
            let claims = token_data.claims;

            // IP & UA binding check (Anti-hijacking)
            if claims.ip == current_ip && claims.ua == current_ua {
                // SECURITY: Global Ban/Revocation Check
                // We check if this specific Session ID or IP has an active ban in the DB.
                // Note: For high performance, you might want to cache this check,
                // but checking DB on page loads is generally acceptable for this scale.

                let is_banned = bans::Entity::find()
                    .filter(
                        sea_orm::Condition::any()
                            .add(bans::Column::SessionId.eq(&claims.sess))
                            .add(bans::Column::IpAddress.eq(&claims.ip))
                    )
                    .filter(bans::Column::ExpiresAt.gt(Utc::now().naive_utc()))
                    .count(db)
                    .await
                    .unwrap_or(0);

                if is_banned > 0 {
                    // Force invalidation
                    is_valid_token = false;
                } else {
                    // Admin Specific Security Check
                    let mut version_check_pass = true;
                    if claims.role > 0 {
                        // Check DB for admin token version to allow global logout/revocation
                        let admin_opt = admins::Entity::find()
                            .filter(admins::Column::Role.eq(claims.role)) // In a real app, bind to ID in claims
                            .one(db).await.unwrap_or(None);

                        if let Some(admin) = admin_opt {
                            if admin.token_version != claims.v {
                                version_check_pass = false; // Version changed (revoked)
                            } else {
                                version = admin.token_version;
                            }
                        } else {
                            version_check_pass = false; // Admin record missing
                        }
                    } else {
                        version = claims.v;
                    }

                    if version_check_pass {
                        session_id = claims.sess.clone();
                        role = claims.role;
                        is_valid_token = true;
                        claims_opt = Some(claims);
                    }
                }
            }
        }
    }

    // 2. Create New Session if Invalid or Missing
    if !is_valid_token {
        session_id = Uuid::new_v4().to_string();
        role = 0;
        version = 1;
        needs_refresh = true; // Must write cookie
    } else if let Some(c) = claims_opt {
        // Sliding Window: If token is valid but > 24 hours old, re-issue to extend life
        let now = Utc::now().timestamp() as usize;
        if (now - c.iat) > 86400 {
            needs_refresh = true;
        }
    }

    // 3. Inject Session into Request Context
    let current_session = CurrentSession { id: session_id.clone(), role, version };
    req.extensions_mut().insert(current_session.clone());

    // 4. Process Request (Handlers run here)
    let response = next.run(req).await;

    // 5. Post-Processing: Re-Sign Token ONLY if state changed or new
    // We check extensions again in case the handler (Login/Logout) modified the session
    let final_session = response.extensions().get::<CurrentSession>().cloned().unwrap_or(current_session);

    // Check if handler changed the state (Login/Logout event)
    if final_session.role != role || final_session.version != version || final_session.id != session_id {
        needs_refresh = true;
    }

    let mut response_jar = cookie_jar;

    if needs_refresh {
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

        // SECURITY: Sign with HS384
        let token = encode(
            &Header::new(Algorithm::HS384),
            &claims,
            &EncodingKey::from_secret(jwt_secret)
        ).unwrap();

        // Cookie Security Settings
        #[allow(unused_mut)]
        let mut jwt_cookie = Cookie::build(("session_id", token))
            .path("/")
            .max_age(Duration::days(365))
            .http_only(true)
            .same_site(SameSite::Lax);

        #[allow(unused_mut)]
        let mut key_cookie = Cookie::build(("client_key", final_session.id))
            .path("/")
            .max_age(Duration::days(365))
            .http_only(false); // Exposed to JS for PoW

        #[cfg(not(debug_assertions))]
        {
            jwt_cookie = jwt_cookie.secure(true);
            key_cookie = key_cookie.secure(true);
        }

        response_jar = response_jar.add(jwt_cookie.build());
        response_jar = response_jar.add(key_cookie.build());
    }

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

        // We try to get client_key from cookie directly as extension might vary based on middleware order
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
