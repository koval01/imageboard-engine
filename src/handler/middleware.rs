use std::sync::Arc;
use axum::{
    extract::{ConnectInfo, Extension, Request, State},
    http::{HeaderMap, HeaderValue, StatusCode},
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
use chrono::Utc;

use crate::{model::SessionClaims, security::{get_client_ip, get_user_agent}, service::{self, Privileges}, AppState};

#[derive(Clone, Debug)]
pub struct CurrentSession {
    pub id: String,
    pub role: i32,
    pub version: i32,
    pub admin_id: i32,
    pub username: String,
    pub privileges: Privileges,
    pub hours_active: bool,
}

impl CurrentSession {
    pub fn guest(id: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            role: 0,
            version: 0,
            admin_id: 0,
            username: String::new(),
            privileges: Privileges::none(),
            hours_active: true,
        }
    }
}

/// Coarse latency bucket so the header is useful without leaking exact timing.
pub(crate) fn approximate_processing_time(ms: f64) -> &'static str {
    if ms < 10.0 {
        "<10ms"
    } else if ms < 50.0 {
        "<50ms"
    } else if ms < 100.0 {
        "<100ms"
    } else if ms < 250.0 {
        "<250ms"
    } else if ms < 500.0 {
        "<500ms"
    } else {
        ">500ms"
    }
}

pub async fn response_time_middleware(request: Request, next: Next) -> Response {
    let start = std::time::Instant::now();
    let response = next.run(request).await;
    let time_str = approximate_processing_time(start.elapsed().as_secs_f64() * 1000.0);

    let (mut parts, body) = response.into_parts();
    parts.headers.remove("server");
    parts.headers.remove("x-powered-by");
    if let Ok(val) = HeaderValue::from_str(time_str) {
        parts.headers.insert("x-processing-time", val);
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

fn forwarded_https(headers: &HeaderMap) -> bool {
    headers
        .get("x-forwarded-proto")
        .and_then(|v| v.to_str().ok())
        .map(|v| {
            v.split(',')
                .next()
                .unwrap_or(v)
                .trim()
                .eq_ignore_ascii_case("https")
        })
        .unwrap_or(false)
}

pub async fn session_middleware(
    cookie_jar: CookieJar,
    State(state): State<Arc<RwLock<AppState>>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    mut req: Request,
    next: Next,
) -> Result<Response, Response> {
    // 0. Performance Optimization & Safety
    // Ensure we ALWAYS insert the extension, even for static files.
    if req.uri().path().starts_with("/assets") || req.uri().path().ends_with(".webp") || req.uri().path().ends_with(".ico") {
        req.extensions_mut().insert(CurrentSession::guest("static_guest"));
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
    let mut admin_id = 0;
    let mut username = String::new();
    let mut privileges = Privileges::none();
    let mut hours_active = true;

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

            // IP & UA binding check
            if claims.ip == current_ip && claims.ua == current_ua {
                let mut version_check_pass = true;
                if claims.role > 0 {
                    let admin_opt = service::find_staff_for_token(db, claims.aid, claims.role, claims.v).await;
                    if let Some(admin) = admin_opt {
                        version = admin.token_version;
                        admin_id = admin.id;
                        username = admin.username.clone();
                        let settings = service::load_settings(&state_read.kv).await;
                        hours_active = service::hours_active_for(&admin, &settings);
                        privileges = service::apply_hours_gate(
                            service::effective_privileges(&admin),
                            hours_active,
                            service::is_super_admin(&admin),
                        );
                    } else {
                        version_check_pass = false;
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

    // 2. Create New Session if Invalid or Missing
    if !is_valid_token {
        session_id = Uuid::new_v4().to_string();
        role = 0;
        version = 1;
        admin_id = 0;
        username.clear();
        privileges = Privileges::none();
        hours_active = true;
        needs_refresh = true;
    } else if let Some(c) = claims_opt {
        // Sliding Window: refresh if older than 24h
        let now = Utc::now().timestamp() as usize;
        if (now - c.iat) > 86400 {
            needs_refresh = true;
        }
    }

    // 3. Inject Session into Request
    let current_session = CurrentSession {
        id: session_id.clone(),
        role,
        version,
        admin_id,
        username: username.clone(),
        privileges: privileges.clone(),
        hours_active,
    };
    req.extensions_mut().insert(current_session.clone());

    // 4. Process Request
    let response = next.run(req).await;

    // 5. Post-Processing: Re-Sign Token if needed
    let final_session = response.extensions().get::<CurrentSession>().cloned().unwrap_or(current_session);

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
            aid: final_session.admin_id,
            uname: final_session.username.clone(),
            iat,
            exp,
        };

        let token = encode(
            &Header::new(Algorithm::HS384),
            &claims,
            &EncodingKey::from_secret(jwt_secret)
        ).unwrap();

        #[allow(unused_mut)]
        let mut jwt_cookie = Cookie::build(("session_id", token))
            .path("/")
            .max_age(Duration::days(365))
            .http_only(true)
            .same_site(if config.cors_origin.is_some() { SameSite::None } else { SameSite::Lax });

        #[allow(unused_mut)]
        let mut key_cookie = Cookie::build(("client_key", final_session.id.clone()))
            .path("/")
            .max_age(Duration::days(365))
            .http_only(false)
            .same_site(if config.cors_origin.is_some() { SameSite::None } else { SameSite::Lax });

        if config.cors_origin.is_some() || config.cookie_secure || forwarded_https(&headers) {
            jwt_cookie = jwt_cookie.secure(true);
            key_cookie = key_cookie.secure(true);
        } else {
            jwt_cookie = jwt_cookie.secure(false);
            key_cookie = key_cookie.secure(false);
        }

        response_jar = response_jar.add(jwt_cookie.build());
        response_jar = response_jar.add(key_cookie.build());
    }

    let mut response = (response_jar, response).into_response();
    if let Ok(val) = HeaderValue::from_str(&final_session.id) {
        response.headers_mut().insert("x-client-key", val);
    }
    Ok(response)
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

        let jar = CookieJar::from_headers(headers);
        let session_id = if let Some(cookie) = jar.get("client_key") {
            cookie.value().to_string()
        } else {
            return Err((StatusCode::FORBIDDEN, "Немає cookie клієнтського ключа").into_response());
        };

        if nonce.is_empty() || salt.is_empty() {
            return Err((
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Відсутні заголовки Proof of Work. Увімкніть JavaScript." }))
            ).into_response());
        }

        let state_read = state.read().await;
        let cache_key = format!("pow:{}", salt);
        if !state_read.kv.set_nx(&cache_key, "1", 300).await {
            return Err((
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Повторне надсилання форми заборонено." }))
            ).into_response());
        }

        let input = format!("{}{}{}", session_id, salt, nonce);
        let mut hasher = Sha256::new();
        hasher.update(input.as_bytes());
        let result = hasher.finalize();

        if result[0] != 0 || result[1] != 0 {
            return Err((
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Невірне обчислення Proof of Work." }))
            ).into_response());
        }
    }

    Ok(next.run(req).await)
}

pub async fn require_staff_session(
    Extension(session): Extension<CurrentSession>,
    req: Request,
    next: Next,
) -> Result<Response, Response> {
    if session.role < 1 {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Немає доступу" })),
        )
            .into_response());
    }
    Ok(next.run(req).await)
}

#[cfg(test)]
mod processing_time_tests {
    use super::approximate_processing_time;

    #[test]
    fn buckets_are_coarse() {
        assert_eq!(approximate_processing_time(0.0), "<10ms");
        assert_eq!(approximate_processing_time(9.99), "<10ms");
        assert_eq!(approximate_processing_time(10.0), "<50ms");
        assert_eq!(approximate_processing_time(49.9), "<50ms");
        assert_eq!(approximate_processing_time(50.0), "<100ms");
        assert_eq!(approximate_processing_time(99.0), "<100ms");
        assert_eq!(approximate_processing_time(100.0), "<250ms");
        assert_eq!(approximate_processing_time(249.0), "<250ms");
        assert_eq!(approximate_processing_time(250.0), "<500ms");
        assert_eq!(approximate_processing_time(499.0), "<500ms");
        assert_eq!(approximate_processing_time(500.0), ">500ms");
        assert_eq!(approximate_processing_time(2500.0), ">500ms");
    }
}

