use std::sync::Arc;
use std::net::SocketAddr;
use axum::{
    extract::{Path, State, Extension, Multipart, ConnectInfo},
    response::{IntoResponse, Redirect},
    http::HeaderMap,
};
use sea_orm::{EntityTrait, QueryOrder, Set, ActiveModelTrait, ModelTrait, QueryFilter, ColumnTrait, QuerySelect, LoaderTrait, PaginatorTrait, RelationTrait};
use tokio::sync::RwLock;
use askama::Template;
use chrono::Utc;

use crate::{
    model::{boards, threads, posts, images},
    AppState,
    handler::middleware::CurrentSession,
    handler::HtmlTemplate,
    service::{ProcessedImage, StorageService, Obfuscator, resolve_country_code},
    security::get_client_ip,
};

struct ParsedForm {
    subject: Option<String>,
    content: String,
    images: Vec<ProcessedImage>,
}

#[derive(serde::Serialize)]
pub struct PostItem {
    pub model: posts::Model,
    pub images: Vec<images::Model>,
}

#[derive(serde::Serialize)]
pub struct ThreadItem {
    pub model: threads::Model,
    pub images: Vec<images::Model>,
    pub replies: Vec<PostItem>,
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
    recent_images: Vec<images::Model>,
    recent_threads: Vec<threads::Model>,
    cdn_url: String,
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
    payload: String,
    cdn_url: String,
}

#[derive(Template)]
#[template(path = "thread.html")]
struct ThreadTemplate {
    board: boards::Model,
    thread: threads::Model,
    payload: String,
    cdn_url: String,
}

async fn parse_multipart_form(
    mut multipart: Multipart,
    storage: &StorageService
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
                return Err(format!("File {} is too large (max 5MB)", filename));
            }

            if !data.is_empty() {
                match storage.upload_image(data, filename).await {
                    Ok(img) => processed_images.push(img),
                    Err(e) => return Err(format!("Upload failed: {}", e)),
                }
            }
        }
    }

    Ok(ParsedForm { subject, content, images: processed_images })
}

// --- HANDLERS ---

pub async fn home_handler(State(state): State<Arc<RwLock<AppState>>>) -> impl IntoResponse {
    let state = state.read().await;
    let db = &state.pool;
    let cdn_url = state.config.cdn_url.clone();

    // 1. Fetch all boards
    let boards_models = boards::Entity::find().all(db).await.unwrap_or_default();

    // 2. Calculate post counts (Threads + Posts in board)
    let mut boards_stats = Vec::new();
    for board in boards_models {
        // Count threads in this board
        let thread_count = threads::Entity::find()
            .filter(threads::Column::BoardSlug.eq(&board.slug))
            .count(db)
            .await
            .unwrap_or(0);

        // Count posts in threads belonging to this board
        // Join Posts -> Threads where Threads.board_slug = board.slug
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

    // 3. Fetch Recent Images (Across all boards)
    let recent_images = images::Entity::find()
        .order_by_desc(images::Column::CreatedAt)
        .limit(12)
        .all(db)
        .await
        .unwrap_or_default();

    // 4. Fetch Recent Threads (Bumped or Created)
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
        cdn_url
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
    Path(slug): Path<String>,
    Extension(session): Extension<CurrentSession>
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

            let preview_posts_raw = posts_raw.into_iter().rev().take(3).rev().collect::<Vec<_>>();
            let post_images = preview_posts_raw.load_many(images::Entity, db).await.unwrap();

            let mut replies = Vec::new();
            for (j, post) in preview_posts_raw.into_iter().enumerate() {
                replies.push(PostItem {
                    model: post,
                    images: post_images[j].clone(),
                });
            }

            thread_items.push(ThreadItem {
                model: thread,
                images: thread_images[i].clone(),
                replies,
            });
        }

        let payload = Obfuscator::pack(&thread_items, &session.id);

        return HtmlTemplate(BoardTemplate {
            board, payload, cdn_url
        }).into_response();
    }

    Redirect::to("/").into_response()
}

pub async fn view_thread_handler(
    State(state): State<Arc<RwLock<AppState>>>,
    Path((slug, thread_id)): Path<(String, i32)>,
    Extension(session): Extension<CurrentSession>
) -> impl IntoResponse {
    let state = state.read().await;
    let db = &state.pool;
    let cdn_url = state.config.cdn_url.clone();

    let board = boards::Entity::find_by_id(&slug).one(db).await.unwrap();

    if let Some(board) = board {
        let thread = threads::Entity::find_by_id(thread_id).one(db).await.unwrap();
        if let Some(thread) = thread {
            let op_images = thread.find_related(images::Entity).all(db).await.unwrap();
            let posts_raw = thread.find_related(posts::Entity).all(db).await.unwrap();
            let post_images_vec = posts_raw.load_many(images::Entity, db).await.unwrap();

            let mut posts_with_images = Vec::new();
            for (i, post) in posts_raw.into_iter().enumerate() {
                posts_with_images.push(PostItem {
                    model: post,
                    images: post_images_vec[i].clone(),
                });
            }

            #[derive(serde::Serialize)]
            struct ThreadPayload {
                images: Vec<images::Model>,
                posts: Vec<PostItem>
            }

            let data = ThreadPayload {
                images: op_images,
                posts: posts_with_images
            };

            let payload = Obfuscator::pack(&data, &session.id);

            return HtmlTemplate(ThreadTemplate {
                board,
                thread,
                payload,
                cdn_url
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
) -> impl IntoResponse {
    let state_read = state.read().await;
    let ip = get_client_ip(&headers, &addr);
    let country_code = resolve_country_code(ip, &state_read.ip_cache).await;

    let parsed = match parse_multipart_form(multipart, &state_read.storage).await {
        Ok(p) => p,
        Err(e) => return HtmlTemplate(crate::handler::ErrorTemplate { message: e }).into_response(),
    };

    if parsed.content.trim().is_empty() && parsed.images.is_empty() {
        return Redirect::to(&format!("/{}", slug)).into_response();
    }

    let db = &state_read.pool;

    let new_thread = threads::ActiveModel {
        board_slug: Set(slug.clone()),
        subject: Set(parsed.subject),
        content: Set(parsed.content),
        session_id: Set(session.id),
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
                width: Set(img.width),
                height: Set(img.height),
                size: Set(img.size),
                created_at: Set(Utc::now().naive_utc()),
                ..Default::default()
            };
            let _ = image_model.insert(db).await;
        }
        return Redirect::to(&format!("/{}", slug)).into_response();
    }

    Redirect::to(&format!("/{}", slug)).into_response()
}

pub async fn reply_handler(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path((slug, thread_id)): Path<(String, i32)>,
    multipart: Multipart,
) -> impl IntoResponse {
    let state_read = state.read().await;
    let ip = get_client_ip(&headers, &addr);
    let country_code = resolve_country_code(ip, &state_read.ip_cache).await;

    let parsed = match parse_multipart_form(multipart, &state_read.storage).await {
        Ok(p) => p,
        Err(e) => return HtmlTemplate(crate::handler::ErrorTemplate { message: e }).into_response(),
    };

    if parsed.content.trim().is_empty() && parsed.images.is_empty() {
        return Redirect::to(&format!("/{}/thread/{}", slug, thread_id)).into_response();
    }

    let db = &state_read.pool;

    let new_post = posts::ActiveModel {
        thread_id: Set(thread_id),
        content: Set(parsed.content),
        session_id: Set(session.id),
        country_code: Set(Some(country_code)),
        created_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };

    if let Ok(post) = new_post.insert(db).await {
        for img in parsed.images {
            let image_model = images::ActiveModel {
                post_id: Set(Some(post.id)),
                url: Set(img.url),
                thumbnail_url: Set(img.thumbnail_url),
                filename: Set(img.filename),
                storage_key: Set(img.storage_key),
                width: Set(img.width),
                height: Set(img.height),
                size: Set(img.size),
                created_at: Set(Utc::now().naive_utc()),
                ..Default::default()
            };
            let _ = image_model.insert(db).await;
        }

        // Bump Thread
        let thread = threads::ActiveModel {
            id: Set(thread_id),
            updated_at: Set(Utc::now().naive_utc()),
            ..Default::default()
        };
        let _ = thread.update(db).await;
    }

    Redirect::to(&format!("/{}/thread/{}", slug, thread_id)).into_response()
}
