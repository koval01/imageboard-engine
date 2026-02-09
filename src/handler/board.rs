use std::sync::Arc;
use std::net::SocketAddr;
use axum::{
    extract::{Path, State, Extension, Multipart, ConnectInfo},
    response::{IntoResponse, Redirect}
};
use sea_orm::{EntityTrait, QueryOrder, Set, ActiveModelTrait, ModelTrait, QueryFilter, ColumnTrait, QuerySelect, LoaderTrait};
use tokio::sync::RwLock;
use askama::Template;
use chrono::Utc;

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

struct ThreadWithPosts {
    thread: threads::Model,
    posts: Vec<posts::Model>,
}

pub struct PostItem {
    pub model: posts::Model,
    pub images: Vec<images::Model>,
}

pub struct ThreadItem {
    pub model: threads::Model,
    pub images: Vec<images::Model>,
    pub replies: Vec<PostItem>,
}

#[derive(Template)]
#[template(path = "home.html")]
struct HomeTemplate {
    boards: Vec<boards::Model>,
}

#[derive(Template)]
#[template(path = "board.html")]
struct BoardTemplate {
    board: boards::Model,
    threads: Vec<ThreadItem>,
}

#[derive(Template)]
#[template(path = "thread.html")]
struct ThreadTemplate {
    board: boards::Model,
    thread: threads::Model,
    images: Vec<images::Model>, // OP Images
    posts: Vec<PostItem>,       // Replies with images
}

async fn parse_multipart_form(
    mut multipart: Multipart,
    storage: &StorageService
) -> Result<ParsedForm, String> {
    let mut subject = None;
    let mut content = String::new();
    let mut processed_images = Vec::new();

    let max_file_size = 2 * 1024 * 1024; // 2 MB
    let max_files = 5;

    // Explicitly handle the error type to help inference
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

            // Explicit error mapping for bytes()
            let data = field.bytes().await.map_err(|e| e.body_text())?;

            if data.len() > max_file_size {
                return Err(format!("File {} is too large (max 2MB)", filename));
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

pub async fn home_handler(State(state): State<Arc<RwLock<AppState>>>) -> impl IntoResponse {
    let boards = boards::Entity::find().all(&state.read().await.pool).await.unwrap_or_default();
    HtmlTemplate(HomeTemplate { boards })
}

pub async fn view_board_handler(
    State(state): State<Arc<RwLock<AppState>>>,
    Path(slug): Path<String>,
) -> impl IntoResponse {
    let db = &state.read().await.pool;
    let board = boards::Entity::find_by_id(&slug).one(db).await.unwrap();

    if let Some(board) = board {
        // 1. Fetch Threads
        let threads_raw = threads::Entity::find()
            .filter(threads::Column::BoardSlug.eq(&slug))
            .order_by_desc(threads::Column::UpdatedAt)
            .limit(10)
            .all(db)
            .await
            .unwrap();

        // 2. Load OP Images for these threads
        let thread_images = threads_raw.load_many(images::Entity, db).await.unwrap();

        let mut thread_items = Vec::new();

        // 3. Loop threads to fetch preview posts
        // Note: doing this in a loop is N+1, optimized approach uses window functions or separate aggregations
        for (i, thread) in threads_raw.into_iter().enumerate() {
            // Fetch last 3 posts
            let posts_raw = posts::Entity::find()
                .filter(posts::Column::ThreadId.eq(thread.id))
                .order_by_asc(posts::Column::CreatedAt)
                .all(db)
                .await
                .unwrap();

            // Keep only last 3 for preview (in a real app, you'd limit in SQL, but sqlite is tricky with limit per group)
            let preview_posts_raw = posts_raw.into_iter().rev().take(3).rev().collect::<Vec<_>>();

            // Load images for these preview posts
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

        return HtmlTemplate(BoardTemplate { board, threads: thread_items }).into_response();
    }

    Redirect::to("/").into_response()
}

pub async fn view_thread_handler(
    State(state): State<Arc<RwLock<AppState>>>,
    Path((slug, thread_id)): Path<(String, i32)>,
) -> impl IntoResponse {
    let db = &state.read().await.pool;
    let board = boards::Entity::find_by_id(&slug).one(db).await.unwrap();

    if let Some(board) = board {
        let thread = threads::Entity::find_by_id(thread_id).one(db).await.unwrap();
        if let Some(thread) = thread {
            // Load OP Images
            let op_images = thread.find_related(images::Entity).all(db).await.unwrap();

            // Load Posts
            let posts_raw = thread.find_related(posts::Entity).all(db).await.unwrap();

            // Load Post Images
            let post_images_vec = posts_raw.load_many(images::Entity, db).await.unwrap();

            let mut posts_with_images = Vec::new();
            for (i, post) in posts_raw.into_iter().enumerate() {
                posts_with_images.push(PostItem {
                    model: post,
                    images: post_images_vec[i].clone(),
                });
            }

            return HtmlTemplate(ThreadTemplate {
                board,
                thread,
                images: op_images,
                posts: posts_with_images
            }).into_response();
        }
    }

    Redirect::to(&format!("/{}", slug)).into_response()
}


pub async fn create_thread_handler(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(slug): Path<String>,
    multipart: Multipart,
) -> impl IntoResponse {
    let state_read = state.read().await;

    // Resolve Country
    let ip = get_client_ip(&addr);
    let country_code = resolve_country_code(&ip, &state_read.ip_cache).await;

    let parsed = match parse_multipart_form(multipart, &state_read.storage).await {
        Ok(p) => p,
        Err(e) => return HtmlTemplate(crate::handler::ErrorTemplate { message: e }).into_response(),
    };

    if parsed.content.trim().is_empty() && parsed.images.is_empty() {
        return Redirect::to(&format!("/{}", slug)).into_response();
    }

    let db = &state_read.pool;

    // Insert Thread
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
        // Insert Images linked to Thread
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
    Path((slug, thread_id)): Path<(String, i32)>,
    multipart: Multipart,
) -> impl IntoResponse {
    let state_read = state.read().await;

    // Resolve Country
    let ip = get_client_ip(&addr);
    let country_code = resolve_country_code(&ip, &state_read.ip_cache).await;

    let parsed = match parse_multipart_form(multipart, &state_read.storage).await {
        Ok(p) => p,
        Err(e) => return HtmlTemplate(crate::handler::ErrorTemplate { message: e }).into_response(),
    };

    if parsed.content.trim().is_empty() && parsed.images.is_empty() {
        return Redirect::to(&format!("/{}/thread/{}", slug, thread_id)).into_response();
    }

    let db = &state_read.pool;

    // Insert Post
    let new_post = posts::ActiveModel {
        thread_id: Set(thread_id),
        content: Set(parsed.content),
        session_id: Set(session.id),
        country_code: Set(Some(country_code)),
        created_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };

    if let Ok(post) = new_post.insert(db).await {
        // Insert Images linked to Post
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
