use crate::{AppState, config::Config, db, migrator::Migrator, route::create_router, service::StorageService, config::StorageType, model::{admins, bans, SessionClaims}};
use axum::{
    body::Body,
    http::{Request, StatusCode, header},
    Router,
};
use sea_orm::{DatabaseConnection, ActiveModelTrait, Set};
use sea_orm_migration::MigratorTrait;
use serde_json::{Value, json};
use std::sync::Arc;
use tokio::sync::RwLock;
use tower::ServiceExt;
use moka::future::Cache;
use sha2::{Sha256, Digest};
use uuid::Uuid;
use std::net::{SocketAddr, IpAddr, Ipv4Addr};
use axum::extract::ConnectInfo;
use jsonwebtoken::{encode, Header, EncodingKey};
use chrono::Utc;

// --- Test Utilities ---

async fn setup_app() -> (Router, DatabaseConnection, Config) {
    // 1. Setup Config
    let config = Config {
        database_url: "sqlite::memory:".to_string(), // In-memory DB
        jwt_secret: "test_secret".to_string(),
        jwt_expires_in: "1d".to_string(),
        jwt_maxage: 3600,
        cdn_url: "http://localhost:8083".to_string(),
        storage_type: StorageType::Local,
        media_path: "./test_media".to_string(),
        media_port: 8083,
    };

    // 2. Setup DB & Migrations
    let pool = db::connect(&config.database_url).await.expect("Failed to connect to in-memory DB");
    Migrator::up(&pool, None).await.expect("Failed to run migrations");

    // 3. Initialize State
    let storage = StorageService::init(&config).await;
    let ip_cache = Cache::builder().build();
    let rate_limit_cache = Cache::builder().build();
    let db_cache = Cache::builder().build();
    let login_attempts = Cache::builder().build();

    // 4. Create App State
    let app_state = Arc::new(RwLock::new(AppState {
        pool: pool.clone(),
        config: config.clone(),
        storage,
        ip_cache,
        rate_limit_cache,
        db_cache,
        login_attempts,
    }));

    // 5. Create Router
    let app = create_router(app_state);

    // Create test media dir if not exists
    let _ = tokio::fs::create_dir_all("./test_media").await;

    (app, pool, config)
}

// Build a request with mocked ConnectInfo.
// Allows specifying IP to test rate limits, bans, and session hijacking.
fn build_req(uri: &str, method: &str, body: Body, ip: Option<&str>) -> Request<Body> {
    let ip_str = ip.unwrap_or("127.0.0.1");
    let ip_addr: Ipv4Addr = ip_str.parse().expect("Invalid IP in test");
    let addr = SocketAddr::new(IpAddr::V4(ip_addr), 8080);

    let mut req = Request::builder()
        .uri(uri)
        .method(method)
        .body(body)
        .unwrap();

    req.extensions_mut().insert(ConnectInfo(addr));
    req
}

// Helper to solve PoW for Bot Guard
fn generate_pow_headers(session_id: &str) -> (String, String) {
    let salt = Uuid::new_v4().to_string().replace("-", "");
    let mut nonce = 0;

    loop {
        let input = format!("{}{}{}", session_id, salt, nonce);
        let mut hasher = Sha256::new();
        hasher.update(input.as_bytes());
        let result = hasher.finalize();

        // Must match bot_guard_middleware logic: first 2 bytes are 0
        if result[0] == 0 && result[1] == 0 {
            return (nonce.to_string(), salt);
        }
        nonce += 1;
    }
}

// Helper to extract cookie from response headers
fn get_cookie(response: &axum::response::Response, name: &str) -> Option<String> {
    response.headers().get_all(header::SET_COOKIE).iter()
        .filter_map(|h| h.to_str().ok())
        .find(|c| c.contains(name))
        .map(|c| c.split(';').next().unwrap().to_string())
}

fn get_cookie_value(cookie_str: &str) -> String {
    cookie_str.split('=').nth(1).unwrap_or("").to_string()
}

// Helper to forge a JWT cookie with specific claims manually
fn forge_session_cookie(
    config: &Config,
    role: i32,
    session_id: &str,
    ip: &str,
    ua: &str,
    expired: bool,
) -> String {
    let now = Utc::now();
    let iat = now.timestamp() as usize;

    let exp = if expired {
        (now - chrono::Duration::hours(1)).timestamp() as usize
    } else {
        (now + chrono::Duration::days(1)).timestamp() as usize
    };

    let claims = SessionClaims {
        sess: session_id.to_string(),
        ip: ip.to_string(),
        ua: ua.to_string(),
        role,
        v: 1,
        iat,
        exp,
    };

    let token = encode(
        &Header::new(jsonwebtoken::Algorithm::HS384),
        &claims,
        &EncodingKey::from_secret(config.jwt_secret.as_bytes())
    ).unwrap();

    format!("session_id={}", token)
}

// --- Functional Tests ---

#[tokio::test]
async fn test_public_access() {
    let (app, _db, _) = setup_app().await;

    // 1. Home Page
    let req = build_req("/api/home", "GET", Body::empty(), None);
    let response = app.clone().oneshot(req).await.unwrap();

    if response.status() != StatusCode::OK {
        let status = response.status();
        let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
        println!("Home error: {:?} - {:?}", status, body);
    } else {
        assert_eq!(response.status(), StatusCode::OK);
    }

    // 2. View Board (m)
    let req = build_req("/api/m", "GET", Body::empty(), None);
    let response = app.clone().oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_admin_auth_flow() {
    let (app, db, _) = setup_app().await;

    // 1. Seed Admin User
    let admin_key_raw = "secret_key_123";
    let mut hasher = Sha256::new();
    hasher.update(admin_key_raw.as_bytes());
    let hashed_key = hex::encode(hasher.finalize());

    let admin = admins::ActiveModel {
        username: Set("test_admin".to_string()),
        service_key: Set(hashed_key),
        role: Set(3), // Full Admin
        token_version: Set(1),
        ..Default::default()
    };
    admin.insert(&db).await.expect("Failed to seed admin");

    // 2. Get initial session (Guest)
    let req = build_req("/api/home", "GET", Body::empty(), None);
    let response = app.clone().oneshot(req).await.unwrap();

    let client_key_cookie = get_cookie(&response, "client_key").expect("No client_key cookie from home");
    let session_id_cookie = get_cookie(&response, "session_id").expect("No session_id cookie from home");
    let session_id_val = get_cookie_value(&client_key_cookie);

    // 3. Attempt Login (Fail)
    let (nonce, salt) = generate_pow_headers(&session_id_val);
    let payload = json!({ "key": "wrong_key" });

    let mut req = build_req("/api/admin/login", "POST", Body::from(serde_json::to_string(&payload).unwrap()), None);
    req.headers_mut().insert(header::CONTENT_TYPE, "application/json".parse().unwrap());
    req.headers_mut().insert(header::COOKIE, format!("{}; {}", client_key_cookie, session_id_cookie).parse().unwrap());
    req.headers_mut().insert("X-PoW-Nonce", nonce.parse().unwrap());
    req.headers_mut().insert("X-PoW-Salt", salt.parse().unwrap());

    let response = app.clone().oneshot(req).await.unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    // 4. Attempt Login (Success)
    // Generate fresh pow headers as cache might block reuse
    let (nonce, salt) = generate_pow_headers(&session_id_val);
    let payload = json!({ "key": admin_key_raw });

    let mut req = build_req("/api/admin/login", "POST", Body::from(serde_json::to_string(&payload).unwrap()), None);
    req.headers_mut().insert(header::CONTENT_TYPE, "application/json".parse().unwrap());
    req.headers_mut().insert(header::COOKIE, format!("{}; {}", client_key_cookie, session_id_cookie).parse().unwrap());
    req.headers_mut().insert("X-PoW-Nonce", nonce.parse().unwrap());
    req.headers_mut().insert("X-PoW-Salt", salt.parse().unwrap());

    let response = app.clone().oneshot(req).await.unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Verify we got a NEW session cookie with admin privileges
    let new_session_cookie = get_cookie(&response, "session_id").expect("Should update session cookie after login");

    // 5. Verify Admin Access (Check Status)
    let mut req = build_req("/api/admin/status", "GET", Body::empty(), None);
    req.headers_mut().insert(header::COOKIE, format!("{}; {}", client_key_cookie, new_session_cookie).parse().unwrap());

    let response = app.clone().oneshot(req).await.unwrap();

    let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_json: Value = serde_json::from_slice(&body_bytes).unwrap();

    assert_eq!(body_json["status"], "ok");
    assert_eq!(body_json["role"], 3);
}

// --- Security Tests ---

#[tokio::test]
async fn test_security_access_controls() {
    let (app, _db, _) = setup_app().await;

    // 1. Get Guest Session
    let req = build_req("/api/home", "GET", Body::empty(), None);
    let response = app.clone().oneshot(req).await.unwrap();

    let client_key = get_cookie(&response, "client_key").expect("Guest client_key missing");
    let session_id = get_cookie(&response, "session_id").expect("Guest session_id missing");
    let sess_val = get_cookie_value(&client_key);

    let (nonce, salt) = generate_pow_headers(&sess_val);

    // 2. Try to access Admin Stats (Should Fail)
    let mut req = build_req("/api/admin/stats", "GET", Body::empty(), None);
    req.headers_mut().insert(header::COOKIE, format!("{}; {}", client_key, session_id).parse().unwrap());
    let response = app.clone().oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    // 3. Try to Delete Content (Should Fail)
    let payload = json!({ "id": 1, "type_": "post" });
    let mut req = build_req("/api/admin/delete", "POST", Body::from(serde_json::to_string(&payload).unwrap()), None);
    req.headers_mut().insert(header::CONTENT_TYPE, "application/json".parse().unwrap());
    req.headers_mut().insert(header::COOKIE, format!("{}; {}", client_key, session_id).parse().unwrap());
    req.headers_mut().insert("X-PoW-Nonce", nonce.parse().unwrap());
    req.headers_mut().insert("X-PoW-Salt", salt.parse().unwrap());
    let response = app.clone().oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    // 4. Try to Ban User (Should Fail)
    let payload = json!({
        "ip": "127.0.0.1",
        "reason": "test",
        "duration": 24,
        "delete_content": false
    });
    let mut req = build_req("/api/admin/ban", "POST", Body::from(serde_json::to_string(&payload).unwrap()), None);
    req.headers_mut().insert(header::CONTENT_TYPE, "application/json".parse().unwrap());
    req.headers_mut().insert(header::COOKIE, format!("{}; {}", client_key, session_id).parse().unwrap());
    req.headers_mut().insert("X-PoW-Nonce", nonce.parse().unwrap());
    req.headers_mut().insert("X-PoW-Salt", salt.parse().unwrap());
    let response = app.clone().oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn test_bot_guard_missing_headers() {
    let (app, _, _) = setup_app().await;

    // Get session
    let req = build_req("/api/home", "GET", Body::empty(), None);
    let response = app.clone().oneshot(req).await.unwrap();
    let client_key = get_cookie(&response, "client_key").expect("Cookie missing");
    let session_id = get_cookie(&response, "session_id").expect("Cookie missing");

    // Try to post without PoW headers
    let payload = json!({ "post_id": 1, "reason": "spam" });

    let mut req = build_req("/api/report", "POST", Body::from(serde_json::to_string(&payload).unwrap()), None);
    req.headers_mut().insert(header::CONTENT_TYPE, "application/json".parse().unwrap());
    req.headers_mut().insert(header::COOKIE, format!("{}; {}", client_key, session_id).parse().unwrap());

    let response = app.clone().oneshot(req).await.unwrap();

    // Should be Forbidden because PoW is missing
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn test_role_hierarchy_enforcement() {
    let (app, db, config) = setup_app().await;

    // Need to seed a Janitor in DB so token_version checks pass
    let janitor = admins::ActiveModel {
        username: Set("janitor_test".to_string()),
        service_key: Set("irrelevant_hash".to_string()),
        role: Set(1),
        token_version: Set(1),
        ..Default::default()
    };
    janitor.insert(&db).await.expect("Failed to seed janitor");

    let session_id = Uuid::new_v4().to_string();
    // Create a Janitor Token (Role 1)
    let janitor_cookie = forge_session_cookie(&config, 1, &session_id, "127.0.0.1", "unknown", false);
    let client_cookie = format!("client_key={}", session_id);
    let cookie_header = format!("{}; {}", janitor_cookie, client_cookie);

    // 1. Janitor tries to Ban User (Requires Role >= 2) -> Should Fail
    let (nonce, salt) = generate_pow_headers(&session_id);
    let payload = json!({
        "ip": "10.0.0.5",
        "reason": "spam",
        "duration": 24,
        "delete_content": false
    });

    let mut req = build_req("/api/admin/ban", "POST", Body::from(serde_json::to_string(&payload).unwrap()), None);
    req.headers_mut().insert(header::CONTENT_TYPE, "application/json".parse().unwrap());
    req.headers_mut().insert(header::COOKIE, cookie_header.parse().unwrap());
    req.headers_mut().insert("X-PoW-Nonce", nonce.parse().unwrap());
    req.headers_mut().insert("X-PoW-Salt", salt.parse().unwrap());

    let response = app.clone().oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN, "Janitor should not be able to ban users");

    // 2. Janitor tries to View Logs (Requires Role >= 1) -> Should Succeed
    let mut req_logs = build_req("/api/admin/logs", "GET", Body::empty(), None);
    req_logs.headers_mut().insert(header::COOKIE, cookie_header.parse().unwrap());

    let response_logs = app.clone().oneshot(req_logs).await.unwrap();
    assert_eq!(response_logs.status(), StatusCode::OK, "Janitor SHOULD be able to view logs");
}

#[tokio::test]
async fn test_session_hijacking_prevention() {
    let (app, _db, config) = setup_app().await;

    let session_id = Uuid::new_v4().to_string();

    // 1. Create a valid Admin Token bound to IP "192.168.1.50"
    let admin_cookie = forge_session_cookie(&config, 3, &session_id, "192.168.1.50", "unknown", false);
    let client_cookie = format!("client_key={}", session_id);
    let cookie_header = format!("{}; {}", admin_cookie, client_cookie);

    // 2. Attacker makes request from "127.0.0.1" (The default mock IP)
    let mut req = build_req("/api/admin/stats", "GET", Body::empty(), None);
    req.headers_mut().insert(header::COOKIE, cookie_header.parse().unwrap());

    let response = app.clone().oneshot(req).await.unwrap();

    // Since session is invalidated, role becomes 0.
    // api_get_stats requires Role >= 1.
    assert_eq!(response.status(), StatusCode::FORBIDDEN, "Session bound to different IP should be rejected");
}

#[tokio::test]
async fn test_banned_user_cannot_post() {
    let (app, db, _) = setup_app().await;

    // 1. Ban an IP "127.0.0.1" in the DB
    let ban = bans::ActiveModel {
        ip_address: Set(Some("127.0.0.1".to_string())),
        reason: Set(Some("Spamming tests".to_string())),
        expires_at: Set(Utc::now().naive_utc() + chrono::Duration::hours(1)),
        ..Default::default()
    };
    ban.insert(&db).await.expect("Failed to insert ban");

    // 2. Prepare a Thread Creation Request
    let session_id = "banned_user_session";
    let (nonce, salt) = generate_pow_headers(session_id);

    // Minimal multipart body
    let boundary = "------------------------Boundary123";
    let body_data = format!(
        "--{boundary}\r\nContent-Disposition: form-data; name=\"content\"\r\n\r\nI am banned but trying to post\r\n--{boundary}--",
        boundary = boundary
    );

    let mut req = build_req("/api/m/submit", "POST", Body::from(body_data), None); // Default IP 127.0.0.1
    req.headers_mut().insert(header::CONTENT_TYPE, format!("multipart/form-data; boundary={}", boundary).parse().unwrap());
    req.headers_mut().insert(header::COOKIE, format!("client_key={}", session_id).parse().unwrap());
    req.headers_mut().insert("X-PoW-Nonce", nonce.parse().unwrap());
    req.headers_mut().insert("X-PoW-Salt", salt.parse().unwrap());

    let response = app.clone().oneshot(req).await.unwrap();

    assert_eq!(response.status(), StatusCode::FORBIDDEN, "Banned IP should get 403");

    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = std::str::from_utf8(&body).unwrap();
    assert!(body_str.contains("BANNED"), "Response should mention ban reason");
}

#[tokio::test]
async fn test_pow_replay_attack() {
    let (app, _, _) = setup_app().await;

    let session_id = "replay_attacker";
    let (nonce, salt) = generate_pow_headers(session_id);

    let payload = json!({ "post_id": 999, "reason": "spam" });
    let body_json = serde_json::to_string(&payload).unwrap();

    let make_req = |body: String| {
        let mut req = build_req("/api/report", "POST", Body::from(body), None);
        req.headers_mut().insert(header::CONTENT_TYPE, "application/json".parse().unwrap());
        req.headers_mut().insert(header::COOKIE, format!("client_key={}", session_id).parse().unwrap());
        req.headers_mut().insert("X-PoW-Nonce", nonce.parse().unwrap());
        req.headers_mut().insert("X-PoW-Salt", salt.parse().unwrap()); // Reuse same salt
        req
    };

    // 1. First Request - Should Succeed
    let response1 = app.clone().oneshot(make_req(body_json.clone())).await.unwrap();
    assert_eq!(response1.status(), StatusCode::OK, "First valid PoW request should pass");

    // 2. Second Request (Replay) - Should Fail via Middleware
    let response2 = app.clone().oneshot(make_req(body_json.clone())).await.unwrap();
    assert_eq!(response2.status(), StatusCode::FORBIDDEN, "Replayed PoW Salt should be forbidden");

    let body = axum::body::to_bytes(response2.into_body(), usize::MAX).await.unwrap();
    let body_str = std::str::from_utf8(&body).unwrap();
    assert!(body_str.contains("Replay attack"), "Error message should indicate replay attack");
}

#[tokio::test]
async fn test_rate_limiting() {
    let (app, _, _) = setup_app().await;
    let session_id = "spammer";
    let spammer_ip = "10.10.10.10";

    let boundary = "------------------------BoundarySpam";
    let body_data = format!(
        "--{boundary}\r\nContent-Disposition: form-data; name=\"content\"\r\n\r\nSpam Post\r\n--{boundary}--",
        boundary = boundary
    );

    let make_post = || {
        let (nonce, salt) = generate_pow_headers(session_id); // Generate fresh PoW each time
        let mut req = build_req("/api/m/submit", "POST", Body::from(body_data.clone()), Some(spammer_ip));
        req.headers_mut().insert(header::CONTENT_TYPE, format!("multipart/form-data; boundary={}", boundary).parse().unwrap());
        req.headers_mut().insert(header::COOKIE, format!("client_key={}", session_id).parse().unwrap());
        req.headers_mut().insert("X-PoW-Nonce", nonce.parse().unwrap());
        req.headers_mut().insert("X-PoW-Salt", salt.parse().unwrap());
        req
    };

    // 1. First Post - Success
    let res1 = app.clone().oneshot(make_post()).await.unwrap();
    assert_eq!(res1.status(), StatusCode::OK, "First post should succeed");

    // 2. Second Post (Immediate) - Fail (Rate Limit)
    let res2 = app.clone().oneshot(make_post()).await.unwrap();
    assert_eq!(res2.status(), StatusCode::TOO_MANY_REQUESTS, "Rapid posting should be rate limited");
}

#[tokio::test]
async fn test_admin_login_brute_force() {
    let (app, _, _) = setup_app().await;
    let session_id = "brute_forcer";
    let ip = "192.168.100.100";

    // Build payload with wrong key
    let payload = json!({ "key": "wrong_password" });
    let body_json = serde_json::to_string(&payload).unwrap();

    let make_login_attempt = || {
        let (nonce, salt) = generate_pow_headers(session_id);
        let mut req = build_req("/api/admin/login", "POST", Body::from(body_json.clone()), Some(ip));
        req.headers_mut().insert(header::CONTENT_TYPE, "application/json".parse().unwrap());
        req.headers_mut().insert(header::COOKIE, format!("client_key={}", session_id).parse().unwrap());
        req.headers_mut().insert("X-PoW-Nonce", nonce.parse().unwrap());
        req.headers_mut().insert("X-PoW-Salt", salt.parse().unwrap());
        req
    };

    // MAX_LOGIN_ATTEMPTS is 5
    for _ in 0..5 {
        let res = app.clone().oneshot(make_login_attempt()).await.unwrap();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED, "Wrong password should return 401");
    }

    // 6th Attempt - Should be locked out
    let res_locked = app.clone().oneshot(make_login_attempt()).await.unwrap();
    assert_eq!(res_locked.status(), StatusCode::TOO_MANY_REQUESTS, "Should lock out after 5 attempts");
}

#[tokio::test]
async fn test_malicious_file_upload() {
    let (app, _, _) = setup_app().await;
    let session_id = "hacker";
    let (nonce, salt) = generate_pow_headers(session_id);

    // Create a body that looks like a file upload but contains text (fake executable script)
    let boundary = "------------------------BoundaryHax";
    let body_data = format!(
        "--{boundary}\r\nContent-Disposition: form-data; name=\"content\"\r\n\r\nText\r\n\
         --{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"malicious.exe\"\r\n\
         Content-Type: image/jpeg\r\n\r\n\
         #!/bin/bash\nrm -rf /\r\n\
         --{boundary}--",
        boundary = boundary
    );

    let mut req = build_req("/api/m/submit", "POST", Body::from(body_data), None);
    req.headers_mut().insert(header::CONTENT_TYPE, format!("multipart/form-data; boundary={}", boundary).parse().unwrap());
    req.headers_mut().insert(header::COOKIE, format!("client_key={}", session_id).parse().unwrap());
    req.headers_mut().insert("X-PoW-Nonce", nonce.parse().unwrap());
    req.headers_mut().insert("X-PoW-Salt", salt.parse().unwrap());

    let response = app.clone().oneshot(req).await.unwrap();

    // The server attempts to decode it with image::load_from_memory
    // This should fail because it's not a valid image.
    // The handler maps this error to 400 Bad Request usually.
    assert_eq!(response.status(), StatusCode::BAD_REQUEST, "Server should reject non-image bytes");

    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_str = std::str::from_utf8(&body).unwrap();
    // Assuming the error message contains something about upload error
    assert!(body_str.contains("error") || body_str.contains("Upload"), "Should contain error message");
}

#[tokio::test]
async fn test_expired_jwt_handling() {
    let (app, _db, config) = setup_app().await;
    let session_id = "expired_user";

    // 1. Forge an EXPIRED Admin Token
    let expired_cookie = forge_session_cookie(&config, 3, session_id, "127.0.0.1", "unknown", true);
    let client_cookie = format!("client_key={}", session_id);
    let cookie_header = format!("{}; {}", expired_cookie, client_cookie);

    // 2. Try to access Admin Stats
    let mut req = build_req("/api/admin/stats", "GET", Body::empty(), None);
    req.headers_mut().insert(header::COOKIE, cookie_header.parse().unwrap());

    let response = app.clone().oneshot(req).await.unwrap();

    // The middleware should detect expiration, discard the session, create a new Guest session.
    // Guest accessing stats -> 403 Forbidden.
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    // Check if the server sent a Set-Cookie header to replace the expired one
    let cookies = response.headers().get_all(header::SET_COOKIE);
    let has_session_cookie = cookies.iter().any(|c| c.to_str().unwrap().contains("session_id"));
    assert!(has_session_cookie, "Server should issue a new session cookie for expired tokens");
}
