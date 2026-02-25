use std::sync::Arc;
use std::net::SocketAddr;
use axum::{
    extract::{Path, State, Extension, Multipart, ConnectInfo, Query},
    response::{IntoResponse, Response},
    http::{HeaderMap, StatusCode},
    Json,
};
use sea_orm::{
    EntityTrait, QueryOrder, Set, ActiveModelTrait, ModelTrait,
    QueryFilter, ColumnTrait, QuerySelect, LoaderTrait, PaginatorTrait,
    RelationTrait, DatabaseConnection
};
use tokio::sync::RwLock;
use chrono::{Utc, NaiveDateTime};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    model::{boards, threads, posts, images},
    AppState,
    handler::middleware::CurrentSession,
    service::{ProcessedImage, StorageService, resolve_country_code},
    security::get_client_ip,
    config::{BUMP_LIMIT, THREAD_AGE_LIMIT_DAYS},
};

// --- SAFE DTOs (Data Transfer Objects) ---

#[derive(Clone, Serialize, Deserialize)]
pub struct SafeImage {
    pub id: i32,
    pub url: String,
    pub thumbnail_url: String,
    pub filename: String,
    pub width: i32,
    pub height: i32,
    pub size: i64,
}

impl From<images::Model> for SafeImage {
    fn from(m: images::Model) -> Self {
        Self {
            id: m.id,
            url: m.url,
            thumbnail_url: m.thumbnail_url,
            filename: m.filename,
            width: m.width,
            height: m.height,
            size: m.size,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct SafePost {
    pub id: i32,
    pub thread_id: i32,
    pub content: String,
    pub country_code: Option<String>,
    pub created_at: NaiveDateTime,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ip_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct SafeThread {
    pub id: i32,
    pub board_slug: String,
    pub subject: Option<String>,
    pub content: String,
    pub country_code: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ip_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct PostItem {
    pub model: SafePost,
    pub images: Vec<SafeImage>,
    pub cdn_url: String,
    pub admin_role: i32,
    pub board_slug: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ThreadItem {
    pub model: SafeThread,
    pub images: Vec<SafeImage>,
    pub replies_preview: Vec<PostItem>,
    pub reply_count: usize,
    pub image_count: usize,
    pub omitted_posts: usize,
    pub omitted_images: usize,
    pub is_bump_limit: bool,
    pub is_time_limit: bool,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct BoardStat {
    pub model: boards::Model,
    pub post_count: u64,
}

#[derive(Clone, Serialize, Deserialize)]
pub enum CacheData {
    Home(Vec<BoardStat>, Vec<RecentImageDto>, Vec<SafeThread>),
    Board(Vec<ThreadItem>),
    Thread(SafeThread, Vec<SafeImage>, Vec<PostItem>),
}

// --- API Response Structs ---

#[derive(Serialize)]
pub struct HomeResponse {
    pub boards: Vec<BoardStat>,
    pub recent_images: Vec<RecentImageDto>,
    pub recent_threads: Vec<SafeThread>,
    pub cdn_url: String,
    pub admin_role: i32,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct RecentImageDto {
    #[serde(flatten)]
    pub model: SafeImage,
    pub thread_id: String,
    pub board_slug: String,
}

#[derive(Serialize)]
pub struct BoardResponse {
    pub board: boards::Model,
    pub threads: Vec<ThreadItem>,
    pub cdn_url: String,
    pub admin_role: i32,
}

#[derive(Serialize)]
pub struct ThreadResponse {
    pub board: boards::Model,
    pub thread: SafeThread,
    pub op_images: Vec<SafeImage>,
    pub replies: Vec<PostItem>,
    pub cdn_url: String,
    pub admin_role: i32,
    pub last_post_id: i32,
    pub is_bump_limit: bool,
    pub is_time_limit: bool,
}

#[derive(Serialize)]
pub struct PostsListResponse {
    pub posts: Vec<PostItem>,
    pub next_cursor: Option<i32>,
    pub board_slug: String,
    pub thread_id: i32,
}

#[derive(Serialize)]
pub struct SinglePostResponse {
    pub post: PostItem,
}

#[derive(Deserialize)]
pub struct PollQuery {
    pub after: i32,
}

// --- Helper Functions ---

fn to_safe_post(m: posts::Model, role: i32) -> SafePost {
    SafePost {
        id: m.id,
        thread_id: m.thread_id,
        content: m.content,
        country_code: m.country_code,
        created_at: m.created_at,
        ip_address: if role >= 2 { Some(m.ip_address) } else { None },
        session_id: if role >= 2 { Some(m.session_id) } else { None },
    }
}

fn to_safe_thread(m: threads::Model, role: i32) -> SafeThread {
    SafeThread {
        id: m.id,
        board_slug: m.board_slug,
        subject: m.subject,
        content: m.content,
        country_code: m.country_code,
        created_at: m.created_at,
        updated_at: m.updated_at,
        ip_address: if role >= 2 { Some(m.ip_address) } else { None },
        session_id: if role >= 2 { Some(m.session_id) } else { None },
    }
}

struct ParsedForm {
    subject: Option<String>,
    content: String,
    images: Vec<ProcessedImage>,
}

async fn parse_multipart_form(
    mut multipart: Multipart,
    storage: &StorageService,
    db: &DatabaseConnection,
) -> Result<ParsedForm, String> {
    let mut subject = None;
    let mut content = String::new();
    let mut processed_images = Vec::new();

    let max_file_size = 5 * 1024 * 1024;
    let max_files = 5;

    while let Some(field) = multipart.next_field().await.map_err(|e| e.body_text())? {
        let name = field.name().unwrap_or("").to_string();

        if name == "subject" {
            if let Ok(txt) = field.text().await {
                if !txt.is_empty() { subject = Some(txt); }
            }
        } else if name == "content" {
            if let Ok(txt) = field.text().await {
                content = txt;
            }
        } else if name == "file" {
            if processed_images.len() >= max_files {
                continue;
            }

            let filename = field.file_name().unwrap_or("unknown.jpg").to_string();
            let content_type = field.content_type().unwrap_or("").to_string();

            if !content_type.starts_with("image/") {
                continue;
            }

            let data = field.bytes().await.map_err(|e| e.body_text())?;

            if data.len() > max_file_size {
                return Err(format!("File {} too large (max 5MB)", filename));
            }

            if !data.is_empty() {
                match storage.upload_image(data, filename, db).await {
                    Ok(img) => processed_images.push(img),
                    Err(e) => return Err(format!("Upload error: {}", e)),
                }
            }
        }
    }

    Ok(ParsedForm { subject, content, images: processed_images })
}

async fn check_rate_limit(ip: &str, cache: &moka::future::Cache<String, u64>) -> Result<(), String> {
    let key = format!("rate_limit:{}", ip);
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();

    if let Some(last_post) = cache.get(&key).await {
        if now < last_post + 60 {
            let wait = (last_post + 60) - now;
            return Err(format!("Wait {} seconds.", wait));
        }
    }

    cache.insert(key, now).await;
    Ok(())
}

// --- Handlers ---

pub async fn home_handler(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
) -> Response {
    let state_read = state.read().await;
    let cache_key = "home_view".to_string();

    if let Some(CacheData::Home(c_boards, c_images, c_threads)) = state_read.db_cache.get(&cache_key).await {
        return Json(HomeResponse {
            boards: c_boards,
            recent_images: c_images,
            recent_threads: c_threads,
            cdn_url: state_read.config.cdn_url.clone(),
            admin_role: session.role,
        }).into_response();
    }

    let db = &state_read.pool;
    let cdn_url = state_read.config.cdn_url.clone();

    let boards_models = boards::Entity::find().all(db).await.unwrap_or_default();

    let mut boards_stats = Vec::new();
    for board in boards_models {
        let thread_count = threads::Entity::find()
            .filter(threads::Column::BoardSlug.eq(&board.slug))
            .count(db)
            .await
            .unwrap_or(0);

        let post_count = posts::Entity::find()
            .join(sea_orm::JoinType::InnerJoin, posts::Relation::Thread.def())
            .filter(threads::Column::BoardSlug.eq(&board.slug))
            .count(db)
            .await
            .unwrap_or(0);

        boards_stats.push(BoardStat {
            model: board,
            post_count: thread_count + post_count,
        });
    }

    let recent_images_raw = images::Entity::find()
        .order_by_desc(images::Column::CreatedAt)
        .limit(12)
        .all(db)
        .await
        .unwrap_or_default();

    let mut recent_images_dto = Vec::new();

    for img in recent_images_raw {
        let mut t_id = "0".to_string();
        let mut b_slug = "unknown".to_string();

        if let Some(tid) = img.thread_id {
            if let Ok(Some(thread)) = threads::Entity::find_by_id(tid).one(db).await {
                t_id = tid.to_string();
                b_slug = thread.board_slug;
            }
        } else if let Some(pid) = img.post_id {
            if let Ok(Some(post)) = posts::Entity::find_by_id(pid).one(db).await {
                if let Ok(Some(thread)) = threads::Entity::find_by_id(post.thread_id).one(db).await {
                    t_id = thread.id.to_string();
                    b_slug = thread.board_slug;
                }
            }
        }

        recent_images_dto.push(RecentImageDto {
            model: SafeImage::from(img),
            thread_id: t_id,
            board_slug: b_slug,
        });
    }

    let recent_threads_raw = threads::Entity::find()
        .order_by_desc(threads::Column::UpdatedAt)
        .limit(10)
        .all(db)
        .await
        .unwrap_or_default();

    let recent_threads_safe: Vec<SafeThread> = recent_threads_raw.into_iter()
        .map(|t| to_safe_thread(t, 0))
        .collect();

    state_read.db_cache.insert(
        cache_key,
        CacheData::Home(boards_stats.clone(), recent_images_dto.clone(), recent_threads_safe.clone())
    ).await;

    Json(HomeResponse {
        boards: boards_stats,
        recent_images: recent_images_dto,
        recent_threads: recent_threads_safe,
        cdn_url,
        admin_role: session.role,
    }).into_response()
}

pub async fn view_board_handler(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    Path(slug): Path<String>,
) -> Response {
    let state_read = state.read().await;
    let db = &state_read.pool;
    let cdn_url = state_read.config.cdn_url.clone();
    let cache_key = format!("board_{}", slug);

    let board = match boards::Entity::find_by_id(&slug).one(db).await {
        Ok(Some(b)) => b,
        _ => return StatusCode::NOT_FOUND.into_response(),
    };

    let cached_threads = if let Some(CacheData::Board(items)) = state_read.db_cache.get(&cache_key).await {
        Some(items)
    } else {
        None
    };

    let thread_items = if let Some(items) = cached_threads {
        items
    } else {
        let threads_raw = threads::Entity::find()
            .filter(threads::Column::BoardSlug.eq(&slug))
            .order_by_desc(threads::Column::UpdatedAt)
            .limit(10)
            .all(db)
            .await
            .unwrap();

        let thread_images = threads_raw.load_many(images::Entity, db).await.unwrap();
        let mut items = Vec::new();

        for (i, thread) in threads_raw.into_iter().enumerate() {
            let posts_raw = posts::Entity::find()
                .filter(posts::Column::ThreadId.eq(thread.id))
                .order_by_asc(posts::Column::CreatedAt)
                .all(db)
                .await
                .unwrap();

            let reply_count = posts_raw.len();
            let is_bump_limit = reply_count as u64 >= BUMP_LIMIT;
            let thread_age_days = (Utc::now().naive_utc() - thread.created_at).num_days();
            let is_time_limit = thread_age_days >= THREAD_AGE_LIMIT_DAYS;

            let post_images_raw = posts_raw.load_many(images::Entity, db).await.unwrap();
            let mut image_count = 0;
            for imgs in &post_images_raw {
                image_count += imgs.len();
            }

            let preview_len = 3;
            let start_idx = if reply_count > preview_len { reply_count - preview_len } else { 0 };

            let mut omitted_posts = 0;
            let mut omitted_images = 0;

            if reply_count > preview_len {
                omitted_posts = reply_count - preview_len;
                for k in 0..start_idx {
                    omitted_images += post_images_raw[k].len();
                }
            }

            let mut replies_preview = Vec::new();
            for j in start_idx..reply_count {
                replies_preview.push(PostItem {
                    model: to_safe_post(posts_raw[j].clone(), 0),
                    images: post_images_raw[j].iter().map(|i| SafeImage::from(i.clone())).collect(),
                    cdn_url: cdn_url.clone(),
                    admin_role: 0,
                    board_slug: slug.clone(),
                });
            }

            items.push(ThreadItem {
                model: to_safe_thread(thread, 0),
                images: thread_images[i].iter().map(|i| SafeImage::from(i.clone())).collect(),
                replies_preview,
                reply_count,
                image_count,
                omitted_posts,
                omitted_images,
                is_bump_limit,
                is_time_limit,
            });
        }

        state_read.db_cache.insert(cache_key, CacheData::Board(items.clone())).await;
        items
    };

    let final_threads: Vec<ThreadItem> = thread_items.into_iter().map(|mut t| {
        t.replies_preview.iter_mut().for_each(|r| r.admin_role = session.role);
        t
    }).collect();

    Json(BoardResponse {
        board,
        threads: final_threads,
        cdn_url,
        admin_role: session.role,
    }).into_response()
}

pub async fn view_thread_handler(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    Path((slug, thread_id)): Path<(String, i32)>,
) -> Response {
    let state_read = state.read().await;
    let db = &state_read.pool;
    let cdn_url = state_read.config.cdn_url.clone();
    let cache_key = format!("thread_{}", thread_id);

    let board = match boards::Entity::find_by_id(&slug).one(db).await {
        Ok(Some(b)) => b,
        _ => return StatusCode::NOT_FOUND.into_response(),
    };

    if session.role < 2 {
        if let Some(CacheData::Thread(th, op, reps)) = state_read.db_cache.get(&cache_key).await {
            let final_replies: Vec<PostItem> = reps.into_iter().map(|mut p| {
                p.admin_role = session.role;
                p
            }).collect();

            let last_post_id = final_replies.last().map(|p| p.model.id).unwrap_or(0);
            let post_count = final_replies.len();
            let is_bump_limit = post_count as u64 >= BUMP_LIMIT;
            let thread_age_days = (Utc::now().naive_utc() - th.created_at).num_days();
            let is_time_limit = thread_age_days >= THREAD_AGE_LIMIT_DAYS;

            return Json(ThreadResponse {
                board,
                thread: th,
                op_images: op,
                replies: final_replies,
                cdn_url,
                admin_role: session.role,
                last_post_id,
                is_bump_limit,
                is_time_limit,
            }).into_response();
        }
    }

    let thread = threads::Entity::find_by_id(thread_id).one(db).await.unwrap();
    if let Some(thread) = thread {
        if thread.board_slug != slug {
            return StatusCode::NOT_FOUND.into_response();
        }

        let op_images_raw = thread.find_related(images::Entity).all(db).await.unwrap();
        let op_images: Vec<SafeImage> = op_images_raw.into_iter().map(SafeImage::from).collect();

        let posts_raw = thread.find_related(posts::Entity)
            .order_by_asc(posts::Column::CreatedAt)
            .all(db)
            .await
            .unwrap();

        let post_images_vec = posts_raw.load_many(images::Entity, db).await.unwrap();

        let mut posts_dto = Vec::new();
        for (i, post) in posts_raw.into_iter().enumerate() {
            posts_dto.push(PostItem {
                model: to_safe_post(post, session.role),
                images: post_images_vec[i].iter().map(|img| SafeImage::from(img.clone())).collect(),
                cdn_url: cdn_url.clone(),
                admin_role: session.role,
                board_slug: slug.clone(),
            });
        }

        let safe_thread = to_safe_thread(thread.clone(), session.role);

        if session.role < 2 {
            state_read.db_cache.insert(
                cache_key,
                CacheData::Thread(safe_thread.clone(), op_images.clone(), posts_dto.clone())
            ).await;
        }

        let last_post_id = posts_dto.last().map(|p| p.model.id).unwrap_or(0);
        let post_count = posts_dto.len();
        let is_bump_limit = post_count as u64 >= BUMP_LIMIT;
        let thread_age_days = (Utc::now().naive_utc() - thread.created_at).num_days();
        let is_time_limit = thread_age_days >= THREAD_AGE_LIMIT_DAYS;

        Json(ThreadResponse {
            board,
            thread: safe_thread,
            op_images,
            replies: posts_dto,
            cdn_url,
            admin_role: session.role,
            last_post_id,
            is_bump_limit,
            is_time_limit,
        }).into_response()

    } else {
        StatusCode::NOT_FOUND.into_response()
    }
}

pub async fn get_single_post_handler(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    Path(post_id): Path<i32>,
) -> Response {
    let state_read = state.read().await;
    let db = &state_read.pool;
    let cdn_url = state_read.config.cdn_url.clone();

    let post = match posts::Entity::find_by_id(post_id).one(db).await {
        Ok(Some(p)) => p,
        _ => return StatusCode::NOT_FOUND.into_response(),
    };

    let thread = match threads::Entity::find_by_id(post.thread_id).one(db).await {
        Ok(Some(t)) => t,
        _ => return StatusCode::NOT_FOUND.into_response(),
    };

    let images_raw = images::Entity::find()
        .filter(images::Column::PostId.eq(post.id))
        .all(db)
        .await
        .unwrap_or_default();

    let images_dto: Vec<SafeImage> = images_raw.into_iter().map(SafeImage::from).collect();

    let post_item = PostItem {
        model: to_safe_post(post, session.role),
        images: images_dto,
        cdn_url,
        admin_role: session.role,
        board_slug: thread.board_slug,
    };

    Json(SinglePostResponse { post: post_item }).into_response()
}

pub async fn create_thread_handler(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(slug): Path<String>,
    multipart: Multipart,
) -> Response {
    let state_read = state.read().await;
    let ip = get_client_ip(&headers, &addr);
    let db = &state_read.pool;

    if let Err(msg) = check_rate_limit(&ip, &state_read.rate_limit_cache).await {
        return (StatusCode::TOO_MANY_REQUESTS, Json(json!({"error": msg}))).into_response();
    }

    let is_banned = crate::model::bans::Entity::find()
        .filter(
            sea_orm::Condition::any()
                .add(crate::model::bans::Column::IpAddress.eq(&ip))
                .add(crate::model::bans::Column::SessionId.eq(&session.id))
        )
        .filter(crate::model::bans::Column::ExpiresAt.gt(Utc::now().naive_utc()))
        .one(db).await.unwrap_or(None);

    if let Some(ban) = is_banned {
        return (StatusCode::FORBIDDEN, Json(json!({"error": format!("BANNED. Reason: {}", ban.reason.unwrap_or_default())}))).into_response();
    }

    let country_code = resolve_country_code(ip.clone(), &state_read.ip_cache).await;

    let parsed = match parse_multipart_form(multipart, &state_read.storage, db).await {
        Ok(p) => p,
        Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({"error": e}))).into_response(),
    };

    if parsed.content.trim().is_empty() && parsed.images.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Thread cannot be empty"}))).into_response();
    }

    let new_thread = threads::ActiveModel {
        board_slug: Set(slug.clone()),
        subject: Set(parsed.subject),
        content: Set(parsed.content),
        session_id: Set(session.id),
        ip_address: Set(ip.clone()),
        country_code: Set(Some(country_code)),
        created_at: Set(Utc::now().naive_utc()),
        updated_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };

    let thread_res = new_thread.insert(db).await;

    if let Ok(thread) = thread_res {
        for img in parsed.images {
            let image_model = images::ActiveModel {
                thread_id: Set(Some(thread.id)),
                url: Set(img.url),
                thumbnail_url: Set(img.thumbnail_url),
                filename: Set(img.filename),
                storage_key: Set(img.storage_key),
                hash: Set(img.hash),
                phash: Set(img.phash),
                width: Set(img.width),
                height: Set(img.height),
                size: Set(img.size),
                exif: Set(img.exif),
                created_at: Set(Utc::now().naive_utc()),
                ..Default::default()
            };
            let _ = image_model.insert(db).await;
        }

        state_read.db_cache.invalidate("home_view").await;
        state_read.db_cache.invalidate(&format!("board_{}", slug)).await;

        return Json(json!({ "status": "ok", "thread_id": thread.id })).into_response();
    }

    (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to create thread"}))).into_response()
}

pub async fn reply_handler(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path((slug, thread_id)): Path<(String, i32)>,
    multipart: Multipart,
) -> Response {
    let state_read = state.read().await;
    let ip = get_client_ip(&headers, &addr);
    let db = &state_read.pool;

    if let Err(msg) = check_rate_limit(&ip, &state_read.rate_limit_cache).await {
        return (StatusCode::TOO_MANY_REQUESTS, Json(json!({"error": msg}))).into_response();
    }

    let is_banned = crate::model::bans::Entity::find()
        .filter(
            sea_orm::Condition::any()
                .add(crate::model::bans::Column::IpAddress.eq(&ip))
                .add(crate::model::bans::Column::SessionId.eq(&session.id))
        )
        .filter(crate::model::bans::Column::ExpiresAt.gt(Utc::now().naive_utc()))
        .one(db).await.unwrap_or(None);

    if let Some(ban) = is_banned {
        return (StatusCode::FORBIDDEN, Json(json!({"error": format!("BANNED: {}", ban.reason.unwrap_or_default())}))).into_response();
    }

    let country_code = resolve_country_code(ip.clone(), &state_read.ip_cache).await;

    let parsed = match parse_multipart_form(multipart, &state_read.storage, db).await {
        Ok(p) => p,
        Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({"error": e}))).into_response(),
    };

    if parsed.content.trim().is_empty() && parsed.images.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Post cannot be empty"}))).into_response();
    }

    let thread_model = threads::Entity::find_by_id(thread_id).one(db).await.unwrap();
    let should_bump = if let Some(t) = thread_model {
        let post_count = posts::Entity::find()
            .filter(posts::Column::ThreadId.eq(thread_id))
            .count(db)
            .await
            .unwrap_or(0);

        let age_days = (Utc::now().naive_utc() - t.created_at).num_days();

        post_count < BUMP_LIMIT && age_days < THREAD_AGE_LIMIT_DAYS
    } else {
        false
    };

    let new_post = posts::ActiveModel {
        thread_id: Set(thread_id),
        content: Set(parsed.content),
        session_id: Set(session.id),
        ip_address: Set(ip.clone()),
        country_code: Set(Some(country_code)),
        created_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };

    match new_post.insert(db).await {
        Ok(post) => {
            let mut saved_images = Vec::new();
            for img in parsed.images {
                let image_model = images::ActiveModel {
                    post_id: Set(Some(post.id)),
                    url: Set(img.url.clone()),
                    thumbnail_url: Set(img.thumbnail_url.clone()),
                    filename: Set(img.filename.clone()),
                    storage_key: Set(img.storage_key.clone()),
                    hash: Set(img.hash.clone()),
                    phash: Set(img.phash.clone()),
                    width: Set(img.width),
                    height: Set(img.height),
                    size: Set(img.size),
                    exif: Set(img.exif.clone()),
                    created_at: Set(Utc::now().naive_utc()),
                    ..Default::default()
                };
                if let Ok(m) = image_model.insert(db).await {
                    saved_images.push(SafeImage::from(m));
                }
            }

            if should_bump {
                let thread = threads::ActiveModel {
                    id: Set(thread_id),
                    updated_at: Set(Utc::now().naive_utc()),
                    ..Default::default()
                };
                let _ = thread.update(db).await;
            }

            // Invalidate caches
            state_read.db_cache.invalidate("home_view").await;
            state_read.db_cache.invalidate(&format!("board_{}", slug)).await;
            state_read.db_cache.invalidate(&format!("thread_{}", thread_id)).await;

            Json(PostItem {
                model: to_safe_post(post, session.role),
                images: saved_images,
                cdn_url: state_read.config.cdn_url.clone(),
                admin_role: session.role,
                board_slug: slug.clone(),
            }).into_response()
        },
        Err(e) => {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response()
        }
    }
}

pub async fn poll_new_posts_handler(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    Path((slug, thread_id)): Path<(String, i32)>,
    Query(query): Query<PollQuery>,
) -> Response {
    let state = state.read().await;
    let db = &state.pool;
    let cdn_url = state.config.cdn_url.clone();

    let new_posts = posts::Entity::find()
        .filter(posts::Column::ThreadId.eq(thread_id))
        .filter(posts::Column::Id.gt(query.after))
        .order_by_asc(posts::Column::CreatedAt)
        .all(db)
        .await
        .unwrap_or_default();

    if new_posts.is_empty() {
        return Json(json!({ "posts": [], "next_cursor": query.after })).into_response();
    }

    let last_id = new_posts.last().map(|p| p.id).unwrap_or(query.after);

    let post_images_vec = new_posts.load_many(images::Entity, db).await.unwrap();
    let mut posts_with_images = Vec::new();

    for (i, post) in new_posts.into_iter().enumerate() {
        posts_with_images.push(PostItem {
            model: to_safe_post(post, session.role),
            images: post_images_vec[i].iter().map(|img| SafeImage::from(img.clone())).collect(),
            cdn_url: cdn_url.clone(),
            admin_role: session.role,
            board_slug: slug.clone(),
        });
    }

    Json(PostsListResponse {
        posts: posts_with_images,
        next_cursor: Some(last_id),
        board_slug: slug,
        thread_id: thread_id
    }).into_response()
}
