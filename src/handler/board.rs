use std::sync::Arc;
use std::net::SocketAddr;
use axum::{
    extract::{Path, State, Extension, Multipart, ConnectInfo, Query},
    response::{IntoResponse, Redirect, Response},
    http::HeaderMap,
};
use sea_orm::{EntityTrait, QueryOrder, Set, ActiveModelTrait, ModelTrait, QueryFilter, ColumnTrait, QuerySelect, LoaderTrait, PaginatorTrait, RelationTrait, DatabaseConnection};
use tokio::sync::RwLock;
use askama::Template;
use chrono::Utc;
use serde::Deserialize;

use crate::{
    model::{boards, threads, posts, images},
    AppState,
    handler::middleware::CurrentSession,
    handler::HtmlTemplate,
    service::{ProcessedImage, StorageService, resolve_country_code},
    security::get_client_ip,
};

struct ParsedForm {
    subject: Option<String>,
    content: String,
    images: Vec<ProcessedImage>,
}

#[derive(Clone)]
pub struct PostItem {
    pub model: posts::Model,
    pub images: Vec<images::Model>,
    pub cdn_url: String,
    pub admin_role: i32,
    pub board_slug: String,
}

#[derive(Clone)]
pub struct ThreadItem {
    pub model: threads::Model,
    pub images: Vec<images::Model>,
    pub replies: Vec<PostItem>,
    pub reply_count: usize,
    pub image_count: usize,
    pub omitted_posts: usize,
    pub omitted_images: usize,
}

// --- Home Page Structs ---
pub struct BoardStat {
    pub model: boards::Model,
    pub post_count: u64,
}

#[derive(Template)]
#[template(path = "home.html")]
struct HomeTemplate {
    boards: Vec<BoardStat>,
    recent_images: Vec<(images::Model, String)>, // Image + Thread ID
    recent_threads: Vec<threads::Model>,
    cdn_url: String,
    admin_role: i32,
}

#[derive(Template)]
#[template(path = "about.html")]
struct AboutTemplate {}

#[derive(Template)]
#[template(path = "rules.html")]
struct RulesTemplate {}

// --- Board & Thread Templates ---
#[derive(Template)]
#[template(path = "board.html")]
struct BoardTemplate {
    board: boards::Model,
    threads: Vec<ThreadItem>,
    cdn_url: String,
    admin_role: i32,
}

#[derive(Template)]
#[template(path = "thread.html")]
struct ThreadTemplate {
    board: boards::Model,
    thread: threads::Model,
    op_images: Vec<images::Model>,
    replies: Vec<PostItem>,
    cdn_url: String,
    admin_role: i32,
    last_post_id: i32, // Added to fix template logic error
}

// --- Partial Templates (HTMX Responses) ---
#[derive(Template)]
#[template(path = "partials/post.html")]
struct PostPartialTemplate {
    post: PostItem,
}

#[derive(Template)]
#[template(path = "partials/posts_list.html")]
struct PostsListPartialTemplate {
    posts: Vec<PostItem>,
}

async fn parse_multipart_form(
    mut multipart: Multipart,
    storage: &StorageService,
    db: &DatabaseConnection,
) -> Result<ParsedForm, String> {
    let mut subject = None;
    let mut content = String::new();
    let mut processed_images = Vec::new();

    let max_file_size = 5 * 1024 * 1024; // 5 MB
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
                return Err(format!("Файл {} завеликий (макс 5MB)", filename));
            }

            if !data.is_empty() {
                match storage.upload_image(data, filename, db).await {
                    Ok(img) => processed_images.push(img),
                    Err(e) => return Err(format!("Помилка завантаження: {}", e)),
                }
            }
        }
    }

    Ok(ParsedForm { subject, content, images: processed_images })
}

// Rate Limiter: 1 post per 60 seconds per IP
async fn check_rate_limit(ip: &str, cache: &moka::future::Cache<String, u64>) -> Result<(), String> {
    let key = format!("rate_limit:{}", ip);
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();

    if let Some(last_post) = cache.get(&key).await {
        if now < last_post + 60 {
            let wait = (last_post + 60) - now;
            return Err(format!("Зачекайте ще {} сек.", wait));
        }
    }

    cache.insert(key, now).await;
    Ok(())
}


// --- HANDLERS ---

pub async fn home_handler(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
) -> impl IntoResponse {
    let state = state.read().await;
    let db = &state.pool;
    let cdn_url = state.config.cdn_url.clone();

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

    let mut recent_images = Vec::new();
    for img in recent_images_raw {
        let thread_id = if let Some(tid) = img.thread_id {
            tid.to_string()
        } else if let Some(pid) = img.post_id {
            let post = posts::Entity::find_by_id(pid).one(db).await.unwrap();
            post.map(|p| p.thread_id.to_string()).unwrap_or_default()
        } else {
            "0".to_string()
        };
        recent_images.push((img, thread_id));
    }

    let recent_threads = threads::Entity::find()
        .order_by_desc(threads::Column::UpdatedAt)
        .limit(10)
        .all(db)
        .await
        .unwrap_or_default();

    HtmlTemplate(HomeTemplate {
        boards: boards_stats,
        recent_images,
        recent_threads,
        cdn_url,
        admin_role: session.role,
    })
}

pub async fn about_handler() -> impl IntoResponse {
    HtmlTemplate(AboutTemplate {})
}

pub async fn rules_handler() -> impl IntoResponse {
    HtmlTemplate(RulesTemplate {})
}

pub async fn view_board_handler(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    Path(slug): Path<String>,
) -> impl IntoResponse {
    let state = state.read().await;
    let db = &state.pool;
    let cdn_url = state.config.cdn_url.clone();

    let board = boards::Entity::find_by_id(&slug).one(db).await.unwrap();

    if let Some(board) = board {
        let threads_raw = threads::Entity::find()
            .filter(threads::Column::BoardSlug.eq(&slug))
            .order_by_desc(threads::Column::UpdatedAt)
            .limit(10)
            .all(db)
            .await
            .unwrap();

        let thread_images = threads_raw.load_many(images::Entity, db).await.unwrap();
        let mut thread_items = Vec::new();

        for (i, thread) in threads_raw.into_iter().enumerate() {
            let posts_raw = posts::Entity::find()
                .filter(posts::Column::ThreadId.eq(thread.id))
                .order_by_asc(posts::Column::CreatedAt)
                .all(db)
                .await
                .unwrap();

            let reply_count = posts_raw.len();
            let post_images_raw = posts_raw.load_many(images::Entity, db).await.unwrap();
            let mut image_count = 0;
            for imgs in &post_images_raw {
                image_count += imgs.len();
            }

            // Preview last 3 posts
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

            let mut replies = Vec::new();
            for j in start_idx..reply_count {
                replies.push(PostItem {
                    model: posts_raw[j].clone(),
                    images: post_images_raw[j].clone(),
                    cdn_url: cdn_url.clone(),
                    admin_role: session.role,
                    board_slug: slug.clone(),
                });
            }

            thread_items.push(ThreadItem {
                model: thread,
                images: thread_images[i].clone(),
                replies,
                reply_count,
                image_count,
                omitted_posts,
                omitted_images
            });
        }

        return HtmlTemplate(BoardTemplate {
            board,
            threads: thread_items,
            cdn_url,
            admin_role: session.role,
        }).into_response();
    }

    Redirect::to("/").into_response()
}

pub async fn view_thread_handler(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    Path((slug, thread_id)): Path<(String, i32)>,
) -> impl IntoResponse {
    let state = state.read().await;
    let db = &state.pool;
    let cdn_url = state.config.cdn_url.clone();

    let board = boards::Entity::find_by_id(&slug).one(db).await.unwrap();

    if let Some(_board) = board {
        let thread = threads::Entity::find_by_id(thread_id).one(db).await.unwrap();
        if let Some(thread) = thread {
            let op_images = thread.find_related(images::Entity).all(db).await.unwrap();

            let posts_raw = thread.find_related(posts::Entity)
                .order_by_asc(posts::Column::CreatedAt)
                .all(db)
                .await
                .unwrap();

            let last_post_id = posts_raw.last().map(|p| p.id).unwrap_or(0);

            let post_images_vec = posts_raw.load_many(images::Entity, db).await.unwrap();

            let mut posts_with_images = Vec::new();
            for (i, post) in posts_raw.into_iter().enumerate() {
                posts_with_images.push(PostItem {
                    model: post,
                    images: post_images_vec[i].clone(),
                    cdn_url: cdn_url.clone(),
                    admin_role: session.role,
                    board_slug: slug.clone(),
                });
            }

            return HtmlTemplate(ThreadTemplate {
                board: _board,
                thread,
                op_images,
                replies: posts_with_images,
                cdn_url,
                admin_role: session.role,
                last_post_id,
            }).into_response();
        }
    }

    Redirect::to(&format!("/{}", slug)).into_response()
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
        return HtmlTemplate(crate::handler::ErrorTemplate { message: msg }).into_response();
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
        return HtmlTemplate(crate::handler::ErrorTemplate {
            message: format!("БАН. Причина: {}. Спливає: {}",
                             ban.reason.unwrap_or_default(), ban.expires_at)
        }).into_response();
    }

    let country_code = resolve_country_code(ip.clone(), &state_read.ip_cache).await;

    let parsed = match parse_multipart_form(multipart, &state_read.storage, db).await {
        Ok(p) => p,
        Err(e) => return HtmlTemplate(crate::handler::ErrorTemplate { message: e }).into_response(),
    };

    if parsed.content.trim().is_empty() && parsed.images.is_empty() {
        return HtmlTemplate(crate::handler::ErrorTemplate { message: "Порожній тред".into() }).into_response();
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
                width: Set(img.width),
                height: Set(img.height),
                size: Set(img.size),
                created_at: Set(Utc::now().naive_utc()),
                ..Default::default()
            };
            let _ = image_model.insert(db).await;
        }
        return Redirect::to(&format!("/{}/thread/{}", slug, thread.id)).into_response();
    }

    HtmlTemplate(crate::handler::ErrorTemplate { message: "Помилка створення треду".into() }).into_response()
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
        return (
            axum::http::StatusCode::TOO_MANY_REQUESTS,
            HtmlTemplate(crate::handler::ErrorTemplate { message: msg })
        ).into_response();
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
        return HtmlTemplate(crate::handler::ErrorTemplate {
            message: format!("БАН. Причина: {}. Спливає: {}",
                             ban.reason.unwrap_or_default(), ban.expires_at)
        }).into_response();
    }

    let country_code = resolve_country_code(ip.clone(), &state_read.ip_cache).await;

    let parsed = match parse_multipart_form(multipart, &state_read.storage, db).await {
        Ok(p) => p,
        Err(e) => return HtmlTemplate(crate::handler::ErrorTemplate { message: e }).into_response(),
    };

    if parsed.content.trim().is_empty() && parsed.images.is_empty() {
        return HtmlTemplate(crate::handler::ErrorTemplate { message: "Порожній пост".into() }).into_response();
    }

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
                    width: Set(img.width),
                    height: Set(img.height),
                    size: Set(img.size),
                    created_at: Set(Utc::now().naive_utc()),
                    ..Default::default()
                };
                if let Ok(m) = image_model.insert(db).await {
                    saved_images.push(m);
                }
            }

            let thread = threads::ActiveModel {
                id: Set(thread_id),
                updated_at: Set(Utc::now().naive_utc()),
                ..Default::default()
            };
            let _ = thread.update(db).await;

            HtmlTemplate(PostPartialTemplate {
                post: PostItem {
                    model: post,
                    images: saved_images,
                    cdn_url: state_read.config.cdn_url.clone(),
                    admin_role: session.role,
                    board_slug: slug,
                }
            }).into_response()
        },
        Err(e) => {
            HtmlTemplate(crate::handler::ErrorTemplate { message: format!("Database error: {}", e) }).into_response()
        }
    }
}

#[derive(Deserialize)]
pub struct PollQuery {
    after: i32,
}

pub async fn poll_new_posts_handler(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    Path((slug, thread_id)): Path<(String, i32)>,
    Query(query): Query<PollQuery>,
) -> impl IntoResponse {
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
        return "".into_response();
    }

    let post_images_vec = new_posts.load_many(images::Entity, db).await.unwrap();
    let mut posts_with_images = Vec::new();

    for (i, post) in new_posts.into_iter().enumerate() {
        posts_with_images.push(PostItem {
            model: post,
            images: post_images_vec[i].clone(),
            cdn_url: cdn_url.clone(),
            admin_role: session.role,
            board_slug: slug.clone(),
        });
    }

    HtmlTemplate(PostsListPartialTemplate {
        posts: posts_with_images
    }).into_response()
}
