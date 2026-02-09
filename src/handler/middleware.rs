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
use base64::Engine;
use tokio::sync::RwLock;
use uuid::Uuid;
use time::Duration;

use crate::{model::SessionClaims, security::{get_client_ip, get_user_agent}, AppState};

#[derive(Clone)]
pub struct CurrentSession {
    pub id: String,
}

pub async fn session_middleware(
    cookie_jar: CookieJar,
    State(state): State<Arc<RwLock<AppState>>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    mut req: Request,
    next: Next,
) -> Result<Response, Response> {
    let config = &state.read().await.config;
    let jwt_secret = config.jwt_secret.as_bytes();
    let current_ip = get_client_ip(&headers, &addr);
    let current_ua = get_user_agent(&headers);

    let mut session_id = String::new();
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
                is_new_session = false;
            }
        }
    }

    let response_jar = if is_new_session {
        session_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now();
        let iat = now.timestamp() as usize;
        let exp = (now + chrono::Duration::days(365)).timestamp() as usize;

        let claims = SessionClaims {
            sess: session_id.clone(),
            ip: current_ip,
            ua: current_ua,
            iat,
            exp,
        };

        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(jwt_secret),
        ).unwrap();

        let cookie = Cookie::build(("session_id", token))
            .path("/")
            .max_age(Duration::days(365))
            .http_only(true);

        cookie_jar.add(cookie)
    } else {
        cookie_jar
    };

    req.extensions_mut().insert(CurrentSession { id: session_id });

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

        // 2. Look for X-K-Proof header
        let proof = headers.get("X-K-Proof")
            .and_then(|h| h.to_str().ok())
            .unwrap_or("");

        // 3. Get Session ID from extensions (set by session_middleware)
        let session_id = if let Some(sess) = req.extensions().get::<CurrentSession>() {
            sess.id.clone()
        } else {
            return Err((StatusCode::FORBIDDEN, "No Session").into_response());
        };

        // 4. Validate Logic:
        // For simplicity, let's require the client to reverse the session ID string
        // and base64 encode it. In production, use SHA256(session_id + "salt").
        let expected_raw: String = session_id.chars().rev().collect();
        let expected = base64::engine::general_purpose::STANDARD.encode(expected_raw);

        if proof != expected {
            return Err((
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Bot detected. JavaScript required." }))
            ).into_response());
        }
    }

    Ok(next.run(req).await)
}
