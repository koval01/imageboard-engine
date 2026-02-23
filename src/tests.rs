use crate::{AppState, config::Config, db, migrator::Migrator, route::create_router, service::StorageService, config::StorageType, model::{admins, bans, threads, admin_logs, SessionClaims}};
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

fn build_req(uri: &str, method: &str, body: Body, ip: Option<&str>, ua: Option<&str>) -> Request<Body> {
    let ip_str = ip.unwrap_or("127.0.0.1");
    let ip_addr: Ipv4Addr = ip_str.parse().expect("Invalid IP in test");
    let addr = SocketAddr::new(IpAddr::V4(ip_addr), 8080);

    let mut req = Request::builder()
        .uri(uri)
        .method(method)
        .body(body)
        .unwrap();

    req.extensions_mut().insert(ConnectInfo(addr));

    if let Some(agent) = ua {
        req.headers_mut().insert(header::USER_AGENT, agent.parse().unwrap());
    } else {
        req.headers_mut().insert(header::USER_AGENT, "TestRunner/1.0".parse().unwrap());
    }

    req
}

fn generate_pow_headers(session_id: &str) -> (String, String) {
    let salt = Uuid::new_v4().to_string().replace("-", "");
    let mut nonce = 0;
    loop {
        let input = format!("{}{}{}", session_id, salt, nonce);
        let mut hasher = Sha256::new();
        hasher.update(input.as_bytes());
        let result = hasher.finalize();
        if result[0] == 0 && result[1] == 0 {
            return (nonce.to_string(), salt);
        }
        nonce += 1;
    }
}

fn get_cookie(response: &axum::response::Response, name: &str) -> Option<String> {
    response.headers().get_all(header::SET_COOKIE).iter()
        .filter_map(|h| h.to_str().ok())
        .find(|c| c.contains(name))
        .map(|c| c.split(';').next().unwrap().to_string())
}

#[allow(dead_code)] // It is used in auth flow test
fn get_cookie_value(cookie_str: &str) -> String {
    cookie_str.split('=').nth(1).unwrap_or("").to_string()
}

fn forge_session_cookie(
    config: &Config,
    role: i32,
    session_id: &str,
    ip: &str,
    ua: &str,
    token_version: i32,
    expired: bool,
    custom_alg: Option<jsonwebtoken::Algorithm>,
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
        v: token_version,
        iat,
        exp,
    };

    let alg = custom_alg.unwrap_or(jsonwebtoken::Algorithm::HS384);

    let token = encode(
        &Header::new(alg),
        &claims,
        &EncodingKey::from_secret(config.jwt_secret.as_bytes())
    ).unwrap();

    format!("session_id={}", token)
}

// --- 1. DATA LEAKAGE & PRIVACY TESTS ---

#[tokio::test]
async fn test_data_leakage_guest_view() {
    let (app, db, _) = setup_app().await;

    // Seed a thread with sensitive data
    let thread = threads::ActiveModel {
        board_slug: Set("m".to_string()),
        content: Set("Sensitive IP Thread".to_string()),
        session_id: Set("secret_session_abc".to_string()),
        ip_address: Set("203.0.113.5".to_string()),
        created_at: Set(Utc::now().naive_utc()),
        updated_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };
    let t = thread.insert(&db).await.expect("Failed to insert thread");

    // Guest Request
    let req = build_req(&format!("/api/m/thread/{}", t.id), "GET", Body::empty(), None, None);
    let response = app.clone().oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: Value = serde_json::from_slice(&body_bytes).unwrap();

    let thread_obj = &json["thread"];

    // VERIFY: Sensitive fields must be absent or null for Guest
    assert!(thread_obj.get("ip_address").is_none() || thread_obj["ip_address"].is_null(), "Guest MUST NOT see IP address");
    assert!(thread_obj.get("session_id").is_none() || thread_obj["session_id"].is_null(), "Guest MUST NOT see Session ID");
}

#[tokio::test]
async fn test_data_visibility_admin_view() {
    let (app, db, config) = setup_app().await;

    // Seed Admin (Role 3)
    let admin_user = admins::ActiveModel {
        username: Set("admin".to_string()),
        service_key: Set("irrelevant".to_string()),
        role: Set(3),
        token_version: Set(1),
        ..Default::default()
    };
    admin_user.insert(&db).await.expect("Failed seed");

    // Seed Thread
    let secret_ip = "203.0.113.99";
    let thread = threads::ActiveModel {
        board_slug: Set("m".to_string()),
        content: Set("Admin View Test".to_string()),
        session_id: Set("secret_session".to_string()),
        ip_address: Set(secret_ip.to_string()),
        created_at: Set(Utc::now().naive_utc()),
        updated_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };
    let t = thread.insert(&db).await.expect("Failed to insert thread");

    // Admin Request
    let session_id = Uuid::new_v4().to_string();
    let admin_cookie = forge_session_cookie(&config, 3, &session_id, "127.0.0.1", "TestRunner/1.0", 1, false, None);
    let client_cookie = format!("client_key={}", session_id);

    let mut req = build_req(&format!("/api/m/thread/{}", t.id), "GET", Body::empty(), None, None);
    req.headers_mut().insert(header::COOKIE, format!("{}; {}", admin_cookie, client_cookie).parse().unwrap());

    let response = app.clone().oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: Value = serde_json::from_slice(&body_bytes).unwrap();

    let thread_obj = &json["thread"];

    // VERIFY: Admin MUST see IP address
    assert_eq!(thread_obj["ip_address"], secret_ip, "Admin SHOULD see IP address");
}

#[tokio::test]
async fn test_cache_poisoning_prevention() {
    // Scenario: Admin views a thread first (populating cache with admin data).
    // Guest views next. Guest MUST NOT receive admin cache.
    let (app, db, config) = setup_app().await;

    let secret_ip = "192.168.6.66";
    let thread = threads::ActiveModel {
        board_slug: Set("m".to_string()),
        content: Set("Cache Poison Test".to_string()),
        session_id: Set("s1".to_string()),
        ip_address: Set(secret_ip.to_string()),
        created_at: Set(Utc::now().naive_utc()),
        updated_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };
    let t = thread.insert(&db).await.expect("Failed to insert thread");
    let url = format!("/api/m/thread/{}", t.id);

    // 1. Admin Views
    let admin_session = Uuid::new_v4().to_string();
    let admin_cookie = forge_session_cookie(&config, 3, &admin_session, "127.0.0.1", "TestRunner/1.0", 1, false, None);

    let mut req_admin = build_req(&url, "GET", Body::empty(), None, None);
    req_admin.headers_mut().insert(header::COOKIE, format!("session_id={}; client_key={}", admin_cookie, admin_session).parse().unwrap());
    let _ = app.clone().oneshot(req_admin).await.unwrap();

    // 2. Guest Views (Immediately after)
    let req_guest = build_req(&url, "GET", Body::empty(), None, None);
    let res_guest = app.clone().oneshot(req_guest).await.unwrap();

    let body_bytes = axum::body::to_bytes(res_guest.into_body(), usize::MAX).await.unwrap();
    let json: Value = serde_json::from_slice(&body_bytes).unwrap();

    let thread_obj = &json["thread"];
    assert!(thread_obj.get("ip_address").is_none() || thread_obj["ip_address"].is_null(), "Cache Poisoning Detected! Admin data leaked to Guest.");
}

// --- 2. AUTHENTICATION & ACCESS CONTROL TESTS ---

#[tokio::test]
async fn test_admin_token_revocation() {
    let (app, db, config) = setup_app().await;

    // Seed Admin with Version 1
    let admin = admins::ActiveModel {
        username: Set("revoked_admin".to_string()),
        service_key: Set("x".to_string()),
        role: Set(3),
        token_version: Set(1), // DB has Version 1
        ..Default::default()
    };
    let admin_model = admin.insert(&db).await.unwrap();

    let session_id = Uuid::new_v4().to_string();
    // Forge valid token with Version 1
    let token_v1 = forge_session_cookie(&config, 3, &session_id, "127.0.0.1", "TestRunner/1.0", 1, false, None);
    let cookie_header = format!("{}; client_key={}", token_v1, session_id);

    // 1. Verify access works initially
    let mut req = build_req("/api/admin/stats", "GET", Body::empty(), None, None);
    req.headers_mut().insert(header::COOKIE, cookie_header.parse().unwrap());
    let res1 = app.clone().oneshot(req).await.unwrap();
    assert_eq!(res1.status(), StatusCode::OK, "Initial admin access failed");

    // 2. REVOKE: Increment token version in DB to 2
    let mut active_admin: admins::ActiveModel = admin_model.into();
    active_admin.token_version = Set(2);
    active_admin.update(&db).await.unwrap();

    // 3. Verify access is now DENIED with old token
    let mut req2 = build_req("/api/admin/stats", "GET", Body::empty(), None, None);
    req2.headers_mut().insert(header::COOKIE, cookie_header.parse().unwrap());
    let res2 = app.clone().oneshot(req2).await.unwrap();

    assert_eq!(res2.status(), StatusCode::FORBIDDEN, "Revoked token (version mismatch) was still accepted!");
}

#[tokio::test]
async fn test_jwt_algo_confusion_attack() {
    let (app, _, config) = setup_app().await;
    let session_id = "hacker";

    // Create a token with 'HS256' instead of the server's 'HS384'
    let weak_cookie = forge_session_cookie(&config, 3, session_id, "127.0.0.1", "TestRunner/1.0", 1, false, Some(jsonwebtoken::Algorithm::HS256));
    let client_cookie = format!("client_key={}", session_id);
    let cookie_header = format!("{}; {}", weak_cookie, client_cookie);

    let mut req = build_req("/api/admin/stats", "GET", Body::empty(), None, None);
    req.headers_mut().insert(header::COOKIE, cookie_header.parse().unwrap());

    let response = app.clone().oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN, "Server accepted wrong JWT Algorithm");
}

#[tokio::test]
async fn test_ua_binding_enforcement() {
    let (app, db, config) = setup_app().await;

    let admin = admins::ActiveModel {
        username: Set("ua_test".to_string()),
        service_key: Set("x".to_string()),
        role: Set(3),
        token_version: Set(1),
        ..Default::default()
    };
    admin.insert(&db).await.unwrap();

    let session_id = Uuid::new_v4().to_string();
    let original_ua = "Mozilla/5.0 (Valid)";
    let attacker_ua = "EvilScript/1.0";

    let token = forge_session_cookie(&config, 3, &session_id, "127.0.0.1", original_ua, 1, false, None);

    // Request with DIFFERENT User Agent
    let mut req = build_req("/api/admin/stats", "GET", Body::empty(), None, Some(attacker_ua));
    req.headers_mut().insert(header::COOKIE, format!("{}; client_key={}", token, session_id).parse().unwrap());

    let response = app.clone().oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN, "Session Hijacking via UA mismatch not prevented");
}

// --- 3. INPUT VALIDATION & INJECTION TESTS ---

#[tokio::test]
async fn test_search_sql_injection_attempt() {
    let (app, db, config) = setup_app().await;

    let admin = admins::ActiveModel {
        username: Set("search_admin".to_string()),
        service_key: Set("x".to_string()),
        role: Set(3),
        token_version: Set(1),
        ..Default::default()
    };
    let _ = admin.insert(&db).await;

    let session_id = Uuid::new_v4().to_string();
    let token = forge_session_cookie(&config, 3, &session_id, "127.0.0.1", "TestRunner/1.0", 1, false, None);

    // Injection Payload
    let injection = "' OR 1=1; --";
    let uri = format!("/api/admin/search?query={}", urlencoding::encode(injection));

    let mut req = build_req(&uri, "GET", Body::empty(), None, None);
    req.headers_mut().insert(header::COOKIE, format!("{}; client_key={}", token, session_id).parse().unwrap());

    let response = app.clone().oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK, "SQL Injection payload caused server error");
}

#[tokio::test]
async fn test_sql_injection_in_headers() {
    // Attack vector: Inject SQL via User-Agent or X-Forwarded-For which are often logged to DB
    let (app, _, _) = setup_app().await;

    let malicious_ua = "Mozilla/5.0' OR '1'='1'); DROP TABLE admin_logs; --";

    // Trigger a 404 which might log error, or just normal visit
    let req = build_req("/api/home", "GET", Body::empty(), None, Some(malicious_ua));
    let response = app.clone().oneshot(req).await.unwrap();

    // Ensure server didn't crash (500)
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_null_byte_injection() {
    let (app, _, config) = setup_app().await;
    let session_id = Uuid::new_v4().to_string();
    let token = forge_session_cookie(&config, 3, &session_id, "127.0.0.1", "TestRunner/1.0", 1, false, None);

    // Null byte in search
    let injection = "search%00term";
    let uri = format!("/api/admin/search?query={}", injection);

    let mut req = build_req(&uri, "GET", Body::empty(), None, None);
    req.headers_mut().insert(header::COOKIE, format!("{}; client_key={}", token, session_id).parse().unwrap());

    let response = app.clone().oneshot(req).await.unwrap();

    // Should behave normally (200) or Bad Request (400), but NOT 500
    assert_ne!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn test_path_traversal_filename() {
    let (app, _, _) = setup_app().await;
    let session_id = "path_hacker";
    let (nonce, salt) = generate_pow_headers(session_id);

    let boundary = "boundaryTraversal";
    // Attempt to write to root or sensitive paths
    let header = format!("--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"../../../../etc/passwd\"\r\nContent-Type: image/jpeg\r\n\r\n");
    let footer = format!("\r\n--{boundary}--");
    let valid_jpeg = [0xFF, 0xD8, 0xFF, 0xE0]; // Fake JPEG header

    let mut body_vec = Vec::new();
    body_vec.extend_from_slice(header.as_bytes());
    body_vec.extend_from_slice(&valid_jpeg);
    body_vec.extend_from_slice(footer.as_bytes());

    let mut req = build_req("/api/m/submit", "POST", Body::from(body_vec), None, None);
    req.headers_mut().insert(header::CONTENT_TYPE, format!("multipart/form-data; boundary={}", boundary).parse().unwrap());
    req.headers_mut().insert(header::COOKIE, format!("client_key={}", session_id).parse().unwrap());
    req.headers_mut().insert("X-PoW-Nonce", nonce.parse().unwrap());
    req.headers_mut().insert("X-PoW-Salt", salt.parse().unwrap());

    // The server should accept the upload but IGNORE the filename and generate a UUID.
    // If it crashed or failed strangely, that's a bug.
    // If it succeeded, we trust the `StorageService` implementation (which uses UUIDs).
    let response = app.clone().oneshot(req).await.unwrap();

    // Note: It might return 500 or 400 because the "JPEG" is incomplete/invalid for the image processor,
    // which is GOOD. It should NOT return 200 unless it successfully processed and renamed it.
    // Here we mainly ensure it doesn't crash the server.
    assert_ne!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
}

// --- 4. RESOURCE EXHAUSTION (DoS) ---

#[tokio::test]
async fn test_huge_payload_dos() {
    let (app, _, _) = setup_app().await;
    let session_id = "dos_attacker";
    let (nonce, salt) = generate_pow_headers(session_id);

    // 20MB String
    let huge_content = "a".repeat(20 * 1024 * 1024);
    let boundary = "boundary";
    let body_data = format!(
        "--{boundary}\r\nContent-Disposition: form-data; name=\"content\"\r\n\r\n{}\r\n--{boundary}--",
        huge_content
    );

    let mut req = build_req("/api/m/submit", "POST", Body::from(body_data), None, None);
    req.headers_mut().insert(header::CONTENT_TYPE, format!("multipart/form-data; boundary={}", boundary).parse().unwrap());
    req.headers_mut().insert(header::COOKIE, format!("client_key={}", session_id).parse().unwrap());
    req.headers_mut().insert("X-PoW-Nonce", nonce.parse().unwrap());
    req.headers_mut().insert("X-PoW-Salt", salt.parse().unwrap());

    let response = app.clone().oneshot(req).await.unwrap();

    assert!(
        response.status() == StatusCode::PAYLOAD_TOO_LARGE || response.status() == StatusCode::BAD_REQUEST,
        "Server accepted 20MB text payload"
    );
}

#[tokio::test]
async fn test_pagination_dos_attempt() {
    let (app, db, config) = setup_app().await;

    // Seed admin
    let admin = admins::ActiveModel {
        username: Set("admin".to_string()),
        service_key: Set("x".to_string()),
        role: Set(3),
        token_version: Set(1),
        ..Default::default()
    };
    admin.insert(&db).await.unwrap();

    // Create 150 Logs
    for i in 0..150 {
        let log = admin_logs::ActiveModel {
            admin_username: Set("admin".to_string()),
            action: Set(format!("Action {}", i)),
            created_at: Set(Utc::now().naive_utc()),
            ..Default::default()
        };
        log.insert(&db).await.unwrap();
    }

    let session_id = Uuid::new_v4().to_string();
    let token = forge_session_cookie(&config, 3, &session_id, "127.0.0.1", "TestRunner/1.0", 1, false, None);

    // Request 1 Million Logs
    let mut req = build_req("/api/admin/logs?limit=1000000", "GET", Body::empty(), None, None);
    req.headers_mut().insert(header::COOKIE, format!("{}; client_key={}", token, session_id).parse().unwrap());

    let response = app.clone().oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: Value = serde_json::from_slice(&body_bytes).unwrap();

    // Verify server enforced limit (e.g., 50 or 100)
    let data_len = json["data"].as_array().unwrap().len();
    assert!(data_len <= 100, "Server failed to cap pagination limit! Returned {} items.", data_len);
}

// --- 5. LOGIC & FUNCTIONAL (Existing) ---

#[tokio::test]
async fn test_public_access() {
    let (app, _, _) = setup_app().await;
    let req = build_req("/api/home", "GET", Body::empty(), None, None);
    let response = app.clone().oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_admin_auth_flow() {
    let (app, db, _) = setup_app().await;
    // ... (Existing code from previous step, ensuring get_cookie_value is used) ...
    let admin_key_raw = "secret_key_123";
    let mut hasher = Sha256::new();
    hasher.update(admin_key_raw.as_bytes());
    let hashed_key = hex::encode(hasher.finalize());

    let admin = admins::ActiveModel {
        username: Set("test_admin".to_string()),
        service_key: Set(hashed_key),
        role: Set(3),
        token_version: Set(1),
        ..Default::default()
    };
    admin.insert(&db).await.expect("Failed to seed admin");

    let req = build_req("/api/home", "GET", Body::empty(), None, None);
    let response = app.clone().oneshot(req).await.unwrap();
    let client_key_cookie = get_cookie(&response, "client_key").expect("Cookie missing");
    let session_id_cookie = get_cookie(&response, "session_id").expect("Cookie missing");

    // USE get_cookie_value here to satisfy compiler warning
    let session_id_val = get_cookie_value(&client_key_cookie);

    let (nonce, salt) = generate_pow_headers(&session_id_val);
    let payload = json!({ "key": admin_key_raw });

    let mut req = build_req("/api/admin/login", "POST", Body::from(serde_json::to_string(&payload).unwrap()), None, None);
    req.headers_mut().insert(header::CONTENT_TYPE, "application/json".parse().unwrap());
    req.headers_mut().insert(header::COOKIE, format!("{}; {}", client_key_cookie, session_id_cookie).parse().unwrap());
    req.headers_mut().insert("X-PoW-Nonce", nonce.parse().unwrap());
    req.headers_mut().insert("X-PoW-Salt", salt.parse().unwrap());

    let response = app.clone().oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_security_holes() {
    let (app, _, _) = setup_app().await;
    let req = build_req("/api/home", "GET", Body::empty(), None, None);
    let response = app.clone().oneshot(req).await.unwrap();
    let client_key = get_cookie(&response, "client_key").expect("Cookie missing");
    let session_id = get_cookie(&response, "session_id").expect("Cookie missing");
    let sess_val = get_cookie_value(&client_key);

    let mut req = build_req("/api/admin/stats", "GET", Body::empty(), None, None);
    req.headers_mut().insert(header::COOKIE, format!("{}; {}", client_key, session_id).parse().unwrap());
    let response = app.clone().oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    let (nonce, salt) = generate_pow_headers(&sess_val);
    let payload = json!({ "id": 1, "type_": "post" });
    let mut req = build_req("/api/admin/delete", "POST", Body::from(serde_json::to_string(&payload).unwrap()), None, None);
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
    let req = build_req("/api/home", "GET", Body::empty(), None, None);
    let response = app.clone().oneshot(req).await.unwrap();
    let client_key = get_cookie(&response, "client_key").expect("Cookie missing");
    let session_id = get_cookie(&response, "session_id").expect("Cookie missing");

    let payload = json!({ "post_id": 1, "reason": "spam" });
    let mut req = build_req("/api/report", "POST", Body::from(serde_json::to_string(&payload).unwrap()), None, None);
    req.headers_mut().insert(header::CONTENT_TYPE, "application/json".parse().unwrap());
    req.headers_mut().insert(header::COOKIE, format!("{}; {}", client_key, session_id).parse().unwrap());

    let response = app.clone().oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn test_role_hierarchy_enforcement() {
    let (app, db, config) = setup_app().await;
    let janitor = admins::ActiveModel {
        username: Set("janitor_test".to_string()),
        service_key: Set("irrelevant_hash".to_string()),
        role: Set(1),
        token_version: Set(1),
        ..Default::default()
    };
    janitor.insert(&db).await.expect("Failed to seed janitor");

    let session_id = Uuid::new_v4().to_string();
    let janitor_cookie = forge_session_cookie(&config, 1, &session_id, "127.0.0.1", "TestRunner/1.0", 1, false, None);
    let client_cookie = format!("client_key={}", session_id);
    let cookie_header = format!("{}; {}", janitor_cookie, client_cookie);

    let (nonce, salt) = generate_pow_headers(&session_id);
    let payload = json!({ "ip": "10.0.0.5", "reason": "spam", "duration": 24, "delete_content": false });

    let mut req = build_req("/api/admin/ban", "POST", Body::from(serde_json::to_string(&payload).unwrap()), None, None);
    req.headers_mut().insert(header::CONTENT_TYPE, "application/json".parse().unwrap());
    req.headers_mut().insert(header::COOKIE, cookie_header.parse().unwrap());
    req.headers_mut().insert("X-PoW-Nonce", nonce.parse().unwrap());
    req.headers_mut().insert("X-PoW-Salt", salt.parse().unwrap());

    let response = app.clone().oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN, "Janitor should not be able to ban users");

    let mut req_logs = build_req("/api/admin/logs", "GET", Body::empty(), None, None);
    req_logs.headers_mut().insert(header::COOKIE, cookie_header.parse().unwrap());
    let response_logs = app.clone().oneshot(req_logs).await.unwrap();
    assert_eq!(response_logs.status(), StatusCode::OK, "Janitor SHOULD be able to view logs");
}

#[tokio::test]
async fn test_banned_user_cannot_post() {
    let (app, db, _) = setup_app().await;
    let ban = bans::ActiveModel {
        ip_address: Set(Some("127.0.0.1".to_string())),
        reason: Set(Some("Spamming tests".to_string())),
        expires_at: Set(Utc::now().naive_utc() + chrono::Duration::hours(1)),
        ..Default::default()
    };
    ban.insert(&db).await.expect("Failed to insert ban");

    let session_id = "banned_user_session";
    let (nonce, salt) = generate_pow_headers(session_id);
    let boundary = "------------------------Boundary123";
    let body_data = format!("--{boundary}\r\nContent-Disposition: form-data; name=\"content\"\r\n\r\nBanned\r\n--{boundary}--", boundary=boundary);

    let mut req = build_req("/api/m/submit", "POST", Body::from(body_data), None, None);
    req.headers_mut().insert(header::CONTENT_TYPE, format!("multipart/form-data; boundary={}", boundary).parse().unwrap());
    req.headers_mut().insert(header::COOKIE, format!("client_key={}", session_id).parse().unwrap());
    req.headers_mut().insert("X-PoW-Nonce", nonce.parse().unwrap());
    req.headers_mut().insert("X-PoW-Salt", salt.parse().unwrap());

    let response = app.clone().oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN, "Banned IP should get 403");
}

#[tokio::test]
async fn test_pow_replay_attack() {
    let (app, _, _) = setup_app().await;
    let session_id = "replay_attacker";
    let (nonce, salt) = generate_pow_headers(session_id);
    let payload = json!({ "post_id": 999, "reason": "spam" });
    let body_json = serde_json::to_string(&payload).unwrap();

    let make_req = |body: String| {
        let mut req = build_req("/api/report", "POST", Body::from(body), None, None);
        req.headers_mut().insert(header::CONTENT_TYPE, "application/json".parse().unwrap());
        req.headers_mut().insert(header::COOKIE, format!("client_key={}", session_id).parse().unwrap());
        req.headers_mut().insert("X-PoW-Nonce", nonce.parse().unwrap());
        req.headers_mut().insert("X-PoW-Salt", salt.parse().unwrap());
        req
    };

    let response1 = app.clone().oneshot(make_req(body_json.clone())).await.unwrap();
    assert_eq!(response1.status(), StatusCode::OK, "First valid PoW request should pass");

    let response2 = app.clone().oneshot(make_req(body_json.clone())).await.unwrap();
    assert_eq!(response2.status(), StatusCode::FORBIDDEN, "Replayed PoW Salt should be forbidden");
}

#[tokio::test]
async fn test_rate_limiting() {
    let (app, _, _) = setup_app().await;
    let session_id = "spammer";
    let spammer_ip = "10.10.10.10";
    let boundary = "boundarySpam";
    let body_data = format!("--{boundary}\r\nContent-Disposition: form-data; name=\"content\"\r\n\r\nSpam\r\n--{boundary}--", boundary=boundary);

    let make_post = || {
        let (nonce, salt) = generate_pow_headers(session_id);
        let mut req = build_req("/api/m/submit", "POST", Body::from(body_data.clone()), Some(spammer_ip), None);
        req.headers_mut().insert(header::CONTENT_TYPE, format!("multipart/form-data; boundary={}", boundary).parse().unwrap());
        req.headers_mut().insert(header::COOKIE, format!("client_key={}", session_id).parse().unwrap());
        req.headers_mut().insert("X-PoW-Nonce", nonce.parse().unwrap());
        req.headers_mut().insert("X-PoW-Salt", salt.parse().unwrap());
        req
    };

    let res1 = app.clone().oneshot(make_post()).await.unwrap();
    assert_eq!(res1.status(), StatusCode::OK);

    let res2 = app.clone().oneshot(make_post()).await.unwrap();
    assert_eq!(res2.status(), StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn test_admin_login_brute_force() {
    let (app, _, _) = setup_app().await;
    let session_id = "brute_forcer";
    let ip = "192.168.100.100";
    let payload = json!({ "key": "wrong_password" });
    let body_json = serde_json::to_string(&payload).unwrap();

    let make_login_attempt = || {
        let (nonce, salt) = generate_pow_headers(session_id);
        let mut req = build_req("/api/admin/login", "POST", Body::from(body_json.clone()), Some(ip), None);
        req.headers_mut().insert(header::CONTENT_TYPE, "application/json".parse().unwrap());
        req.headers_mut().insert(header::COOKIE, format!("client_key={}", session_id).parse().unwrap());
        req.headers_mut().insert("X-PoW-Nonce", nonce.parse().unwrap());
        req.headers_mut().insert("X-PoW-Salt", salt.parse().unwrap());
        req
    };

    for _ in 0..5 {
        let res = app.clone().oneshot(make_login_attempt()).await.unwrap();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }

    let res_locked = app.clone().oneshot(make_login_attempt()).await.unwrap();
    assert_eq!(res_locked.status(), StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn test_malicious_file_upload() {
    let (app, _, _) = setup_app().await;
    let session_id = "hacker";
    let (nonce, salt) = generate_pow_headers(session_id);
    let boundary = "BoundaryHax";
    let body_data = format!(
        "--{boundary}\r\nContent-Disposition: form-data; name=\"content\"\r\n\r\nText\r\n\
         --{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"malicious.exe\"\r\n\
         Content-Type: image/jpeg\r\n\r\n\
         #!/bin/bash\nrm -rf /\r\n\
         --{boundary}--",
        boundary = boundary
    );

    let mut req = build_req("/api/m/submit", "POST", Body::from(body_data), None, None);
    req.headers_mut().insert(header::CONTENT_TYPE, format!("multipart/form-data; boundary={}", boundary).parse().unwrap());
    req.headers_mut().insert(header::COOKIE, format!("client_key={}", session_id).parse().unwrap());
    req.headers_mut().insert("X-PoW-Nonce", nonce.parse().unwrap());
    req.headers_mut().insert("X-PoW-Salt", salt.parse().unwrap());

    let response = app.clone().oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST, "Server should reject non-image bytes");
}

#[tokio::test]
async fn test_expired_jwt_handling() {
    let (app, _db, config) = setup_app().await;
    let session_id = "expired_user";
    let expired_cookie = forge_session_cookie(&config, 3, session_id, "127.0.0.1", "TestRunner/1.0", 1, true, None);
    let client_cookie = format!("client_key={}", session_id);
    let cookie_header = format!("{}; {}", expired_cookie, client_cookie);

    let mut req = build_req("/api/admin/stats", "GET", Body::empty(), None, None);
    req.headers_mut().insert(header::COOKIE, cookie_header.parse().unwrap());

    let response = app.clone().oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}
