use std::sync::Arc;
use std::net::SocketAddr;
use std::collections::HashSet;
use axum::{
    extract::{State, Query, Extension, ConnectInfo, Multipart},
    response::{IntoResponse, Response},
    http::{HeaderMap, StatusCode},
    Json,
};
use sea_orm::*;
use serde::{Deserialize, Serialize};
use chrono::{Utc, NaiveDateTime};
use tokio::sync::RwLock;
use sha2::{Sha256, Digest};
use image_hasher::{ImageHash, HasherConfig};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use sea_orm::sea_query::Expr;
use serde_json::json;
use crate::{
    model::{admins, bans, admin_logs, posts, images, reports},
    AppState,
    handler::middleware::CurrentSession,
    security::get_client_ip,
};
use crate::model::threads;

// --- Data Structs for JSON API ---

#[derive(Serialize)]
struct DashboardStats {
    total_posts: u64,
    total_bans: u64,
    total_reports: u64,
    open_reports: u64,
}

#[derive(Serialize)]
struct ApiReport {
    id: i32,
    reason: String,
    status: String,
    reporter_ip: String,
    created_at: NaiveDateTime,
    post: Option<posts::Model>,
    images: Vec<images::Model>,
    board_slug: Option<String>, // Added to allow linking to the post
}

#[derive(Serialize)]
struct InvestigationResult {
    initial_target: String,
    related_ips: HashSet<String>,
    related_sessions: HashSet<String>,
    posts_found: Vec<posts::Model>,
    images_found: Vec<images::Model>,
    similar_images: Vec<(i32, f32, String)>, // PostId, Distance, ImageUrl
}

// --- Handlers ---

#[derive(Deserialize)]
pub struct LoginPayload { key: String }

const MAX_LOGIN_ATTEMPTS: u32 = 3;

pub async fn admin_login_action(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(mut session): Extension<CurrentSession>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<LoginPayload>,
) -> Response {
    let state_read = state.read().await;
    let db = &state_read.pool;

    let ip = get_client_ip(&headers, &addr);
    let attempts = state_read.login_attempts.get(&ip).await.unwrap_or(0);

    if attempts >= MAX_LOGIN_ATTEMPTS {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({"error": "Too many failed attempts. Locked for 1 hour."}))
        ).into_response();
    }

    let mut hasher = Sha256::new();
    hasher.update(payload.key.as_bytes());
    let hashed_key = hex::encode(hasher.finalize());

    let admin = admins::Entity::find()
        .filter(admins::Column::ServiceKey.eq(&hashed_key))
        .one(db)
        .await
        .unwrap_or(None);

    if let Some(admin) = admin {
        state_read.login_attempts.invalidate(&ip).await;
        session.role = admin.role;
        session.version = admin.token_version;

        // The middleware will see the updated session and issue a new JWT
        let mut response = Json(json!({"status": "ok", "role": admin.role})).into_response();
        response.extensions_mut().insert(session);
        return response;
    }

    state_read.login_attempts.insert(ip, attempts + 1).await;
    let remaining = MAX_LOGIN_ATTEMPTS - (attempts + 1);

    (
        StatusCode::UNAUTHORIZED,
        Json(json!({"error": "Invalid Key", "remaining_attempts": remaining}))
    ).into_response()
}

pub async fn admin_logout_action(
    Extension(mut session): Extension<CurrentSession>,
) -> Response {
    session.role = 0;
    session.version = 1;
    // Middleware will update the cookie to reflect role 0
    let mut response = Json(json!({"status": "logged_out"})).into_response();
    response.extensions_mut().insert(session);
    response
}

pub async fn api_check_admin(
    Extension(session): Extension<CurrentSession>,
) -> Response {
    // Always return 200 OK so the frontend doesn't throw a console error.
    // The 'role' field determines the UI state.
    Json(json!({
        "status": if session.role > 0 { "ok" } else { "guest" },
        "role": session.role
    })).into_response()
}

// --- JSON APIs ---

pub async fn api_get_stats(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
) -> Response {
    if session.role < 1 { return StatusCode::FORBIDDEN.into_response(); }
    let db = &state.read().await.pool;

    let total_posts = posts::Entity::find().count(db).await.unwrap_or(0);
    let total_bans = bans::Entity::find().count(db).await.unwrap_or(0);
    let total_reports = reports::Entity::find().count(db).await.unwrap_or(0);
    let open_reports = reports::Entity::find().filter(reports::Column::Status.eq("OPEN")).count(db).await.unwrap_or(0);

    Json(DashboardStats { total_posts, total_bans, total_reports, open_reports }).into_response()
}

pub async fn api_get_logs(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
) -> Response {
    if session.role < 1 { return StatusCode::FORBIDDEN.into_response(); }
    let db = &state.read().await.pool;

    let logs = admin_logs::Entity::find()
        .order_by_desc(admin_logs::Column::CreatedAt)
        .limit(100)
        .all(db)
        .await
        .unwrap_or_default();

    Json(logs).into_response()
}

pub async fn api_get_reports(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
) -> Response {
    if session.role < 1 { return StatusCode::FORBIDDEN.into_response(); }
    let db = &state.read().await.pool;

    let reports_raw = reports::Entity::find()
        .filter(reports::Column::Status.eq("OPEN"))
        .order_by_asc(reports::Column::CreatedAt)
        .all(db)
        .await
        .unwrap_or_default();

    let mut result = Vec::new();
    for r in reports_raw {
        let post = posts::Entity::find_by_id(r.post_id).one(db).await.unwrap_or(None);
        let mut board_slug = None;
        let mut imgs = vec![];

        if let Some(ref p) = post {
            imgs = images::Entity::find().filter(images::Column::PostId.eq(p.id)).all(db).await.unwrap_or_default();
            if let Ok(Some(t)) = threads::Entity::find_by_id(p.thread_id).one(db).await {
                board_slug = Some(t.board_slug);
            }
        }

        result.push(ApiReport {
            id: r.id,
            reason: r.reason,
            status: r.status,
            reporter_ip: r.ip_address,
            created_at: r.created_at,
            post,
            images: imgs,
            board_slug,
        });
    }

    Json(result).into_response()
}

// --- INVESTIGATION LOGIC ---

#[derive(Deserialize)]
pub struct InvestigateQuery {
    target: String, // IP or Session
    threshold: Option<u32>, // Hamming distance threshold (default 10)
}

pub async fn api_investigate(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    Query(query): Query<InvestigateQuery>,
) -> Response {
    if session.role < 2 { return StatusCode::FORBIDDEN.into_response(); }
    let db = &state.read().await.pool;
    let threshold = query.threshold.unwrap_or(10);

    let mut ips = HashSet::new();
    let mut sessions = HashSet::new();
    let mut post_ids = HashSet::new();
    let mut posts_found = Vec::new();
    let mut images_found = Vec::new();
    let mut similar_images = Vec::new();

    // 1. Initial Seed
    if query.target.contains('.') || query.target.contains(':') {
        ips.insert(query.target.clone());
    } else {
        sessions.insert(query.target.clone());
    }

    // 2. Expand: Find all posts by these IPs/Sessions
    let initial_posts = posts::Entity::find()
        .filter(
            Condition::any()
                .add(posts::Column::IpAddress.is_in(ips.clone()))
                .add(posts::Column::SessionId.is_in(sessions.clone()))
        )
        .all(db)
        .await
        .unwrap_or_default();

    for p in initial_posts {
        ips.insert(p.ip_address.clone());
        sessions.insert(p.session_id.clone());
        if post_ids.insert(p.id) {
            posts_found.push(p.clone());
        }
    }

    // 3. Find Images uploaded by these posts
    let imgs = images::Entity::find()
        .filter(images::Column::PostId.is_in(post_ids.clone()))
        .all(db)
        .await
        .unwrap_or_default();

    images_found.extend(imgs.clone());

    // 4. FIND SIMILAR IMAGES (The Core Logic)
    let all_images_with_hash = images::Entity::find()
        .filter(images::Column::Phash.ne(""))
        .all(db)
        .await
        .unwrap_or_default();

    for source_img in &imgs {
        if source_img.phash.is_empty() { continue; }
        // Decode source hash
        if let Ok(src_hash_bytes) = BASE64.decode(&source_img.phash) {
            // We use Box<[u8]> to match the default hasher's output type
            if let Ok(src_hash) = ImageHash::<Box<[u8]>>::from_bytes(&src_hash_bytes) {
                for target_img in &all_images_with_hash {
                    if target_img.id == source_img.id { continue; } // Skip self
                    if target_img.phash.is_empty() { continue; }

                    if let Ok(tgt_hash_bytes) = BASE64.decode(&target_img.phash) {
                        if let Ok(tgt_hash) = ImageHash::<Box<[u8]>>::from_bytes(&tgt_hash_bytes) {
                            let dist = src_hash.dist(&tgt_hash);
                            if dist <= threshold {
                                // FOUND A MATCH!
                                if let Some(pid) = target_img.post_id {
                                    similar_images.push((pid, dist as f32, target_img.thumbnail_url.clone()));
                                    // 5. Expand Network based on this match
                                    if let Ok(Some(linked_post)) = posts::Entity::find_by_id(pid).one(db).await {
                                        if !ips.contains(&linked_post.ip_address) || !sessions.contains(&linked_post.session_id) {
                                            ips.insert(linked_post.ip_address.clone());
                                            sessions.insert(linked_post.session_id.clone());
                                            if post_ids.insert(linked_post.id) {
                                                posts_found.push(linked_post);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 6. Log Investigation
    let log = admin_logs::ActiveModel {
        admin_username: Set(format!("Role-{}", session.role)),
        action: Set("INVESTIGATE".to_string()),
        target_id: Set(Some(query.target.clone())),
        details: Set(Some(format!("Found {} linked IPs, {} sessions", ips.len(), sessions.len()))),
        created_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };
    let _ = log.insert(db).await;

    Json(InvestigationResult {
        initial_target: query.target,
        related_ips: ips,
        related_sessions: sessions,
        posts_found,
        images_found,
        similar_images,
    }).into_response()
}

// --- VISUAL SEARCH (Upload & Match) ---

pub async fn api_visual_search(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    mut multipart: Multipart,
) -> Response {
    if session.role < 2 { return StatusCode::FORBIDDEN.into_response(); }
    let db = &state.read().await.pool;

    while let Some(field) = multipart.next_field().await.unwrap() {
        if field.name() == Some("file") {
            let data = field.bytes().await.unwrap();

            // Calculate pHash of uploaded file in memory
            let hasher = HasherConfig::new().hash_alg(image_hasher::HashAlg::Mean).to_hasher();
            if let Ok(img) = image::load_from_memory(&data) {
                let hash = hasher.hash_image(&img); // Inferred as ImageHash<Box<[u8]>>

                // Compare against DB
                let all_images = images::Entity::find()
                    .filter(images::Column::Phash.ne(""))
                    .all(db)
                    .await
                    .unwrap_or_default();

                let mut matches = Vec::new();

                for db_img in all_images {
                    if let Ok(db_hash_bytes) = BASE64.decode(&db_img.phash) {
                        if let Ok(db_hash) = ImageHash::<Box<[u8]>>::from_bytes(&db_hash_bytes) {
                            let dist = hash.dist(&db_hash);
                            if dist < 15 { // Slightly looser threshold for manual search
                                matches.push((db_img, dist));
                            }
                        }
                    }
                }

                matches.sort_by(|a, b| a.1.cmp(&b.1));

                // Fetch associated post details
                let mut results = Vec::new();
                for (img, dist) in matches.into_iter().take(50) {
                    let post = if let Some(pid) = img.post_id {
                        posts::Entity::find_by_id(pid).one(db).await.unwrap_or(None)
                    } else { None };

                    results.push(json!({
                        "image": img,
                        "distance": dist,
                        "post": post
                    }));
                }

                return Json(results).into_response();
            }
        }
    }

    Json(json!({"error": "No valid image uploaded"})).into_response()
}

// --- STANDARD ACTIONS (Ban, Delete, Resolve) ---

#[derive(Deserialize)]
pub struct BanPayload {
    ip: String,
    session: Option<String>,
    reason: String,
    duration: i64,
    delete_content: bool,
}

pub async fn api_ban_user(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    Json(payload): Json<BanPayload>,
) -> Response {
    if session.role < 2 { return StatusCode::FORBIDDEN.into_response(); } // Changed to Role 2 (Mod)
    let state = state.read().await;
    let db = &state.pool;
    let storage = &state.storage;

    let expires = Utc::now().naive_utc() + chrono::Duration::hours(payload.duration);
    let ban = bans::ActiveModel {
        ip_address: Set(Some(payload.ip.clone())),
        session_id: Set(payload.session.clone()),
        reason: Set(Some(payload.reason.clone())),
        expires_at: Set(expires),
        created_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };
    let _ = ban.insert(db).await;

    if payload.delete_content {
        // Delete posts logic
        let posts_to_del = posts::Entity::find()
            .filter(posts::Column::IpAddress.eq(&payload.ip))
            .all(db).await.unwrap_or_default();

        for p in posts_to_del {
            let imgs = images::Entity::find().filter(images::Column::PostId.eq(p.id)).all(db).await.unwrap_or_default();
            for img in imgs {
                let _ = storage.delete_file(&img.url).await;
                let _ = storage.delete_file(&img.thumbnail_url).await;
            }
            let _ = posts::Entity::delete_by_id(p.id).exec(db).await;
        }

        // Also cleanup reports
        let _ = reports::Entity::update_many()
            .col_expr(reports::Column::Status, Expr::value("RESOLVED"))
            .filter(reports::Column::IpAddress.eq(&payload.ip))
            .exec(db).await;
    }

    let log = admin_logs::ActiveModel {
        admin_username: Set(format!("Role-{}", session.role)),
        action: Set("BAN".to_string()),
        target_id: Set(Some(payload.ip)),
        details: Set(Some(format!("Reason: {}, Del: {}", payload.reason, payload.delete_content))),
        created_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };
    let _ = log.insert(db).await;

    Json(json!({"status": "ok"})).into_response()
}

#[derive(Deserialize)]
pub struct AdminDeletePayload {
    id: i32,
    type_: String, // "post" or "thread"
}

pub async fn api_delete_content(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    Json(payload): Json<AdminDeletePayload>,
) -> Response {
    if session.role < 2 { return StatusCode::FORBIDDEN.into_response(); }
    let state = state.read().await;
    let db = &state.pool;
    let storage = &state.storage;

    if payload.type_ == "post" {
        if let Ok(Some(_)) = posts::Entity::find_by_id(payload.id).one(db).await {
            let imgs = images::Entity::find().filter(images::Column::PostId.eq(payload.id)).all(db).await.unwrap_or_default();
            for img in imgs {
                let _ = storage.delete_file(&img.url).await;
                let _ = storage.delete_file(&img.thumbnail_url).await;
            }
            let _ = posts::Entity::delete_by_id(payload.id).exec(db).await;
        }
    } else {
        if let Ok(Some(_)) = threads::Entity::find_by_id(payload.id).one(db).await {
            let _ = threads::Entity::delete_by_id(payload.id).exec(db).await;
        }
    }

    // Log
    let log = admin_logs::ActiveModel {
        admin_username: Set(format!("Role-{}", session.role)),
        action: Set("DELETE".to_string()),
        target_id: Set(Some(format!("{}:{}", payload.type_, payload.id))),
        details: Set(None),
        created_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };
    let _ = log.insert(db).await;

    Json(json!({"status": "ok"})).into_response()
}

#[derive(Deserialize)]
pub struct ReportPayload {
    post_id: i32,
    reason: String,
}

pub async fn create_report(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(_session): Extension<CurrentSession>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<ReportPayload>,
) -> Response {
    let state_read = state.read().await;
    let db = &state_read.pool;
    let ip = get_client_ip(&headers, &addr);

    let exists = reports::Entity::find()
        .filter(reports::Column::PostId.eq(payload.post_id))
        .filter(reports::Column::IpAddress.eq(&ip))
        .count(db).await.unwrap_or(0);

    if exists > 0 {
        return (StatusCode::CONFLICT, Json(json!({"error": "Already reported"}))).into_response();
    }

    let report = reports::ActiveModel {
        post_id: Set(payload.post_id),
        reason: Set(payload.reason),
        ip_address: Set(ip),
        created_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };

    let _ = report.insert(db).await;
    Json(json!({"status": "ok"})).into_response()
}

#[derive(Deserialize)]
pub struct ResolveReportPayload {
    report_id: i32,
    status: String,
}

pub async fn resolve_report(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    Json(payload): Json<ResolveReportPayload>,
) -> Response {
    if session.role < 1 { return StatusCode::FORBIDDEN.into_response(); }
    let state = state.read().await;
    let db = &state.pool;

    let _ = reports::Entity::update_many()
        .col_expr(reports::Column::Status, Expr::value(payload.status))
        .filter(reports::Column::Id.eq(payload.report_id))
        .exec(db).await;

    Json(json!({"status": "ok"})).into_response()
}
