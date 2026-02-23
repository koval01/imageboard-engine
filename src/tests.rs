use crate::{AppState, config::Config, db, migrator::Migrator, route::create_router, service::StorageService, config::StorageType, model::admins};
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
        media_path: "./test_media".to_string(), // Ensure this dir exists or is ignored
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

// --- Tests ---

#[tokio::test]
async fn test_public_access() {
    let (app, _, _) = setup_app().await;

    // 1. Home Page
    let response = app.clone().oneshot(
        Request::builder().uri("/api/home").body(Body::empty()).unwrap()
    ).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    // 2. View Board (m)
    let response = app.clone().oneshot(
        Request::builder().uri("/api/m").body(Body::empty()).unwrap()
    ).await.unwrap();
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
    let response = app.clone().oneshot(
        Request::builder().uri("/api/home").body(Body::empty()).unwrap()
    ).await.unwrap();

    let client_key_cookie = get_cookie(&response, "client_key").expect("No client_key cookie");
    let session_id_cookie = get_cookie(&response, "session_id").expect("No session_id cookie");
    let session_id_val = get_cookie_value(&client_key_cookie);

    // 3. Attempt Login (Fail)
    let (nonce, salt) = generate_pow_headers(&session_id_val);
    let payload = json!({ "key": "wrong_key" });

    let response = app.clone().oneshot(
        Request::builder()
            .uri("/api/admin/login")
            .method("POST")
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, format!("{}; {}", client_key_cookie, session_id_cookie))
            .header("X-PoW-Nonce", &nonce)
            .header("X-PoW-Salt", &salt)
            .body(Body::from(serde_json::to_string(&payload).unwrap()))
            .unwrap()
    ).await.unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    // 4. Attempt Login (Success)
    let (nonce, salt) = generate_pow_headers(&session_id_val); // Re-generate/use new nonce if cache prevents replay
    // Note: In local test environment, rate limit might block same salt replay, so generate fresh.
    let payload = json!({ "key": admin_key_raw });

    let response = app.clone().oneshot(
        Request::builder()
            .uri("/api/admin/login")
            .method("POST")
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, format!("{}; {}", client_key_cookie, session_id_cookie))
            .header("X-PoW-Nonce", &nonce)
            .header("X-PoW-Salt", &salt)
            .body(Body::from(serde_json::to_string(&payload).unwrap()))
            .unwrap()
    ).await.unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Verify we got a NEW session cookie with admin privileges
    let new_session_cookie = get_cookie(&response, "session_id").expect("Should update session cookie");

    // 5. Verify Admin Access (Check Status)
    let response = app.clone().oneshot(
        Request::builder()
            .uri("/api/admin/status")
            .header(header::COOKIE, format!("{}; {}", client_key_cookie, new_session_cookie))
            .body(Body::empty())
            .unwrap()
    ).await.unwrap();

    let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body_json: Value = serde_json::from_slice(&body_bytes).unwrap();

    assert_eq!(body_json["status"], "ok");
    assert_eq!(body_json["role"], 3);
}

#[tokio::test]
async fn test_security_holes() {
    let (app, db, _) = setup_app().await;

    // 1. Get Guest Session
    let response = app.clone().oneshot(
        Request::builder().uri("/api/home").body(Body::empty()).unwrap()
    ).await.unwrap();
    let client_key = get_cookie(&response, "client_key").unwrap();
    let session_id = get_cookie(&response, "session_id").unwrap();
    let sess_val = get_cookie_value(&client_key);

    // 2. Try to access Admin Stats (Should Fail)
    let response = app.clone().oneshot(
        Request::builder()
            .uri("/api/admin/stats")
            .header(header::COOKIE, format!("{}; {}", client_key, session_id))
            .body(Body::empty())
            .unwrap()
    ).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    // 3. Try to Delete Content (Should Fail)
    let (nonce, salt) = generate_pow_headers(&sess_val);
    let payload = json!({ "id": 1, "type_": "post" });

    let response = app.clone().oneshot(
        Request::builder()
            .uri("/api/admin/delete")
            .method("POST")
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, format!("{}; {}", client_key, session_id))
            .header("X-PoW-Nonce", &nonce)
            .header("X-PoW-Salt", &salt)
            .body(Body::from(serde_json::to_string(&payload).unwrap()))
            .unwrap()
    ).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    // 4. Try to Ban User (Should Fail)
    let (nonce, salt) = generate_pow_headers(&sess_val);
    let payload = json!({
        "ip": "127.0.0.1",
        "reason": "test",
        "duration": 24,
        "delete_content": false
    });

    let response = app.clone().oneshot(
        Request::builder()
            .uri("/api/admin/ban")
            .method("POST")
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, format!("{}; {}", client_key, session_id))
            .header("X-PoW-Nonce", &nonce)
            .header("X-PoW-Salt", &salt)
            .body(Body::from(serde_json::to_string(&payload).unwrap()))
            .unwrap()
    ).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn test_bot_guard_missing_headers() {
    let (app, _, _) = setup_app().await;

    // Get session
    let response = app.clone().oneshot(
        Request::builder().uri("/api/home").body(Body::empty()).unwrap()
    ).await.unwrap();
    let client_key = get_cookie(&response, "client_key").unwrap();
    let session_id = get_cookie(&response, "session_id").unwrap();

    // Try to post without PoW headers
    let payload = json!({ "post_id": 1, "reason": "spam" });

    let response = app.clone().oneshot(
        Request::builder()
            .uri("/api/report")
            .method("POST")
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, format!("{}; {}", client_key, session_id))
            .body(Body::from(serde_json::to_string(&payload).unwrap()))
            .unwrap()
    ).await.unwrap();

    // Should be Forbidden because PoW is missing
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}
