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
use image_hasher::{ImageHash, HasherConfig};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use sea_orm::sea_query::Expr;
use serde_json::json;
use crate::{
    handler::middleware::CurrentSession,
    handler::staff::{actor_name, guard_action, prepare_ban_fields},
    model::{bans, admin_logs, posts, images, reports, threads},
    AppState,
    security::get_client_ip,
    service::{self, audit},
};

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
    board_slug: Option<String>,
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

// --- Query Structs ---

#[derive(Deserialize)]
pub struct LogsQuery {
    page: Option<u64>,
    limit: Option<u64>,
    search: Option<String>,
}

#[derive(Deserialize)]
pub struct ReportsQuery {
    status: Option<String>, // "OPEN", "RESOLVED", "REJECTED", or null for all
    page: Option<u64>,
    limit: Option<u64>,
}

#[derive(Deserialize)]
pub struct ContentSearchQuery {
    query: String,
    limit: Option<u64>,
}

fn reporter_ip(session: &CurrentSession, ip: String) -> String {
    if session.privileges.view_ip {
        ip
    } else {
        String::new()
    }
}

fn fix_image_urls(imgs: &mut Vec<images::Model>, cdn_url: &str) {
    for img in imgs {
        if !img.url.starts_with("http") {
            img.url = format!("{}/{}", cdn_url, img.url);
        }
        if !img.thumbnail_url.starts_with("http") {
            img.thumbnail_url = format!("{}/{}", cdn_url, img.thumbnail_url);
        }
    }
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
    Query(query): Query<LogsQuery>,
) -> Response {
    if session.role < 1 { return StatusCode::FORBIDDEN.into_response(); }
    let db = &state.read().await.pool;

    let page = query.page.unwrap_or(0);
    let limit = query.limit.unwrap_or(50).min(100);

    let mut condition = Condition::all();
    if let Some(s) = query.search {
        if !s.is_empty() {
            condition = condition.add(
                Condition::any()
                    .add(admin_logs::Column::Details.contains(&s))
                    .add(admin_logs::Column::Action.contains(&s))
                    .add(admin_logs::Column::TargetId.contains(&s))
                    .add(admin_logs::Column::AdminUsername.contains(&s))
            );
        }
    }

    let paginator = admin_logs::Entity::find()
        .filter(condition)
        .order_by_desc(admin_logs::Column::CreatedAt)
        .paginate(db, limit);

    let logs = paginator.fetch_page(page).await.unwrap_or_default();
    let total = paginator.num_pages().await.unwrap_or(0);

    Json(json!({
        "data": logs,
        "total_pages": total,
        "current_page": page
    })).into_response()
}

pub async fn api_get_reports(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    Query(query): Query<ReportsQuery>,
) -> Response {
    if session.role < 1 { return StatusCode::FORBIDDEN.into_response(); }
    let state_read = state.read().await;
    let db = &state_read.pool;
    let cdn_url = &state_read.config.cdn_url;

    let page = query.page.unwrap_or(0);
    let limit = query.limit.unwrap_or(20).min(100);

    let mut select = reports::Entity::find();

    if let Some(status) = query.status {
        if !status.is_empty() && status != "ALL" {
            select = select.filter(reports::Column::Status.eq(status));
        }
    }

    let paginator = select
        .order_by_asc(reports::Column::Status) // Open first
        .order_by_desc(reports::Column::CreatedAt)
        .paginate(db, limit);

    let reports_raw = paginator.fetch_page(page).await.unwrap_or_default();
    let total = paginator.num_pages().await.unwrap_or(0);

    let mut result = Vec::new();
    for r in reports_raw {
        let mut post = posts::Entity::find_by_id(r.post_id).one(db).await.unwrap_or(None);
        let mut board_slug = None;
        let mut imgs = vec![];

        // OP reports use the thread id (there is no posts row for the opening post).
        if post.is_none() {
            if let Ok(Some(t)) = threads::Entity::find_by_id(r.post_id).one(db).await {
                board_slug = Some(t.board_slug.clone());
                imgs = images::Entity::find()
                    .filter(images::Column::ThreadId.eq(t.id))
                    .all(db)
                    .await
                    .unwrap_or_default();
                post = Some(posts::Model {
                    id: t.id,
                    thread_id: t.id,
                    content: t.content,
                    session_id: t.session_id,
                    ip_address: t.ip_address,
                    country_code: t.country_code,
                    created_at: t.created_at,
                    is_hidden: t.is_hidden,
                });
            }
        }

        if let Some(ref mut p) = post {
            if !session.privileges.view_ip {
                p.ip_address = String::new();
                p.session_id = String::new();
            }
            if imgs.is_empty() {
                imgs = images::Entity::find().filter(images::Column::PostId.eq(p.id)).all(db).await.unwrap_or_default();
                if let Ok(Some(t)) = threads::Entity::find_by_id(p.thread_id).one(db).await {
                    board_slug = Some(t.board_slug);
                }
            }
            fix_image_urls(&mut imgs, cdn_url);
        }

        result.push(ApiReport {
            id: r.id,
            reason: r.reason,
            status: r.status,
            reporter_ip: reporter_ip(&session, r.ip_address),
            created_at: r.created_at,
            post,
            images: imgs,
            board_slug,
        });
    }

    Json(json!({
        "data": result,
        "total_pages": total,
        "current_page": page
    })).into_response()
}

pub async fn api_search_content(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    Query(query): Query<ContentSearchQuery>,
) -> Response {
    if !session.privileges.view_ip { return StatusCode::FORBIDDEN.into_response(); }
    let db = &state.read().await.pool;
    let limit = query.limit.unwrap_or(50).min(100);

    // Search posts by content or IP
    let posts = posts::Entity::find()
        .filter(
            Condition::any()
                .add(posts::Column::Content.contains(&query.query))
                .add(posts::Column::IpAddress.eq(&query.query))
                .add(posts::Column::SessionId.eq(&query.query))
        )
        .order_by_desc(posts::Column::CreatedAt)
        .limit(limit)
        .all(db)
        .await
        .unwrap_or_default();

    Json(posts).into_response()
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
    if !session.privileges.view_ip { return StatusCode::FORBIDDEN.into_response(); }
    let state_read = state.read().await;
    let db = &state_read.pool;
    let cdn_url = &state_read.config.cdn_url;
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
    let mut imgs = images::Entity::find()
        .filter(images::Column::PostId.is_in(post_ids.clone()))
        .all(db)
        .await
        .unwrap_or_default();

    // Fix URLs for direct investigation results
    fix_image_urls(&mut imgs, cdn_url);
    images_found.extend(imgs.clone());

    // 4. FIND SIMILAR IMAGES
    let all_images_with_hash = images::Entity::find()
        .filter(images::Column::Phash.ne(""))
        .all(db)
        .await
        .unwrap_or_default();

    for source_img in &imgs {
        if source_img.phash.is_empty() { continue; }
        if let Ok(src_hash_bytes) = BASE64.decode(&source_img.phash) {
            if let Ok(src_hash) = ImageHash::<Box<[u8]>>::from_bytes(&src_hash_bytes) {
                for target_img in &all_images_with_hash {
                    if target_img.id == source_img.id { continue; }
                    if target_img.phash.is_empty() { continue; }

                    if let Ok(tgt_hash_bytes) = BASE64.decode(&target_img.phash) {
                        if let Ok(tgt_hash) = ImageHash::<Box<[u8]>>::from_bytes(&tgt_hash_bytes) {
                            let dist = src_hash.dist(&tgt_hash);
                            if dist <= threshold {
                                if let Some(pid) = target_img.post_id {
                                    let thumb_full = format!("{}/{}", cdn_url, target_img.thumbnail_url);
                                    similar_images.push((pid, dist as f32, thumb_full));

                                    // Expand network
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
    audit(
        db,
        &actor_name(&session),
        "INVESTIGATE",
        Some(query.target.clone()),
        Some(format!("Знайдено {} пов'язаних IP, {} сесій", ips.len(), sessions.len())),
        None,
    ).await;

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
    if !session.privileges.view_ip { return StatusCode::FORBIDDEN.into_response(); }
    let state_read = state.read().await;
    let db = &state_read.pool;
    let cdn_url = &state_read.config.cdn_url;

    while let Some(field) = multipart.next_field().await.unwrap() {
        if field.name() == Some("file") {
            let data = field.bytes().await.unwrap();

            let hasher = HasherConfig::new().hash_alg(image_hasher::HashAlg::Mean).to_hasher();
            if let Ok(img) = image::load_from_memory(&data) {
                let hash = hasher.hash_image(&img);

                let all_images = images::Entity::find()
                    .filter(images::Column::Phash.ne(""))
                    .all(db)
                    .await
                    .unwrap_or_default();

                let mut matches = Vec::new();

                for mut db_img in all_images {
                    if let Ok(db_hash_bytes) = BASE64.decode(&db_img.phash) {
                        if let Ok(db_hash) = ImageHash::<Box<[u8]>>::from_bytes(&db_hash_bytes) {
                            let dist = hash.dist(&db_hash);
                            if dist < 15 {
                                // Fix URLs here
                                db_img.url = format!("{}/{}", cdn_url, db_img.url);
                                db_img.thumbnail_url = format!("{}/{}", cdn_url, db_img.thumbnail_url);
                                matches.push((db_img, dist));
                            }
                        }
                    }
                }

                matches.sort_by(|a, b| a.1.cmp(&b.1));

                let mut results = Vec::new();
                for (img, dist) in matches.into_iter().take(50) {
                    let post = if let Some(pid) = img.post_id {
                        posts::Entity::find_by_id(pid).one(db).await.unwrap_or(None)
                    } else { None };

                    let board_slug = if let Some(p) = &post {
                        if let Ok(Some(t)) = threads::Entity::find_by_id(p.thread_id).one(db).await {
                            Some(t.board_slug)
                        } else { None }
                    } else { None };

                    results.push(json!({
                        "image": img,
                        "distance": dist,
                        "post": post,
                        "board_slug": board_slug
                    }));
                }

                return Json(results).into_response();
            }
        }
    }

    Json(json!({"error": "Не завантажено дійсне зображення"})).into_response()
}

// --- STANDARD ACTIONS (Ban, Delete, Resolve) ---

#[derive(Deserialize)]
pub struct BanPayload {
    ip: String,
    session: Option<String>,
    reason: String,
    duration: i64,
    delete_content: bool,
    cidr: Option<String>,
    scope: Option<String>,
    board_slug: Option<String>,
    kind: Option<String>,
}

pub async fn api_ban_user(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<BanPayload>,
) -> Response {
    let state = state.read().await;
    let actor = match guard_action(&state, &session, session.privileges.ban, "Немає права банити").await {
        Ok(a) => a,
        Err(r) => return r,
    };
    let db = &state.pool;
    let storage = &state.storage;
    let ip_raw = payload.cidr.as_deref().unwrap_or(&payload.ip);
    let (store_ip, store_cidr) = match prepare_ban_fields(ip_raw).await {
        Ok(v) => v,
        Err(msg) => return service::bad_request(&msg),
    };
    let scope = payload.scope.as_deref().unwrap_or("site");
    if scope != "site" && scope != "board" {
        return service::bad_request("Невірний scope");
    }
    if scope == "board" && payload.board_slug.as_deref().unwrap_or("").is_empty() {
        return service::bad_request("Для бану дошки вкажіть board_slug");
    }
    let kind = payload.kind.as_deref().unwrap_or("post");
    if kind != "post" && kind != "view" {
        return service::bad_request("Невірний тип бану");
    }

    let hours = payload.duration.max(1);
    let expires = Utc::now().naive_utc() + chrono::Duration::hours(hours);
    let ban = bans::ActiveModel {
        ip_address: Set(Some(store_ip.clone())),
        session_id: Set(payload.session.clone()),
        reason: Set(Some(payload.reason.clone())),
        expires_at: Set(expires),
        created_at: Set(Utc::now().naive_utc()),
        cidr: Set(store_cidr.clone()),
        scope: Set(scope.to_string()),
        board_slug: Set(payload.board_slug.clone()),
        kind: Set(kind.to_string()),
        created_by: Set(Some(actor.username.clone())),
        ..Default::default()
    };
    let _ = ban.insert(db).await;

    if payload.delete_content {
        let wipe_ip = if store_cidr.as_deref().is_some_and(|c| c.ends_with("/32") || c.ends_with("/128")) {
            store_ip.clone()
        } else if !payload.ip.contains('/') {
            payload.ip.clone()
        } else {
            String::new()
        };
        if !wipe_ip.is_empty() {
            if let Err(e) = crate::service::purge_author_content(
                db,
                storage,
                &wipe_ip,
                payload.session.as_deref(),
            )
            .await
            {
                tracing::error!("ban wipe failed: {e:#}");
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": format!("Не вдалося фізично видалити файли: {e}")})),
                )
                    .into_response();
            }
            state.db_cache.invalidate_all();
        }
    }

    audit(
        db,
        &actor.username,
        "BAN",
        Some(store_cidr.clone().unwrap_or(store_ip)),
        Some(format!(
            "Причина: {}, вид: {kind}, scope: {scope}, Видалення: {}",
            payload.reason, payload.delete_content
        )),
        Some(get_client_ip(&headers, &addr)),
    )
    .await;

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
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<AdminDeletePayload>,
) -> Response {
    let state = state.read().await;
    let actor = match guard_action(&state, &session, session.privileges.delete, "Немає права видаляти").await {
        Ok(a) => a,
        Err(r) => return r,
    };
    let db = &state.pool;
    let storage = &state.storage;

    let mut board_slug: Option<String> = None;
    let mut cached_thread_id: Option<i32> = None;

    if payload.type_ == "post" {
        if let Ok(Some(post)) = posts::Entity::find_by_id(payload.id).one(db).await {
            cached_thread_id = Some(post.thread_id);
            if let Ok(Some(t)) = threads::Entity::find_by_id(post.thread_id).one(db).await {
                board_slug = Some(t.board_slug);
            }
            if let Err(e) = crate::service::purge_post(db, storage, payload.id).await {
                tracing::error!("post purge failed: {e:#}");
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": format!("Не вдалося видалити пост: {e}")})),
                )
                    .into_response();
            }
        }
    } else if let Ok(Some(t)) = threads::Entity::find_by_id(payload.id).one(db).await {
        board_slug = Some(t.board_slug);
        cached_thread_id = Some(t.id);
        if let Err(e) = crate::service::purge_thread(db, storage, payload.id).await {
            tracing::error!("thread purge failed: {e:#}");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("Не вдалося видалити тред: {e}")})),
            )
                .into_response();
        }
    }

    state.db_cache.invalidate("home_view").await;
    if let Some(slug) = &board_slug {
        state.db_cache.invalidate(&format!("board_{slug}")).await;
    }
    if let Some(tid) = cached_thread_id {
        state.db_cache.invalidate(&format!("thread_{tid}")).await;
    }

    audit(
        db,
        &actor.username,
        "DELETE",
        Some(format!("{}:{}", payload.type_, payload.id)),
        None,
        Some(get_client_ip(&headers, &addr)),
    )
    .await;

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
        return (StatusCode::CONFLICT, Json(json!({"error": "Вже поскаржилися"}))).into_response();
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
    if !session.hours_active && session.role < 3 {
        return service::forbidden("Поза робочими годинами — дії вимкнено");
    }
    let state = state.read().await;
    let db = &state.pool;

    let _ = reports::Entity::update_many()
        .col_expr(reports::Column::Status, Expr::value(payload.status))
        .filter(reports::Column::Id.eq(payload.report_id))
        .exec(db).await;

    Json(json!({"status": "ok"})).into_response()
}
