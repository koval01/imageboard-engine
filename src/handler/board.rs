use std::sync::Arc;
use axum::{
    extract::{Path, State, Extension, Multipart},
    response::{IntoResponse, Redirect}
};
use sea_orm::{EntityTrait, QueryOrder, Set, ActiveModelTrait, ModelTrait, QueryFilter, ColumnTrait, QuerySelect};
use tokio::sync::RwLock;
use askama::Template;
use chrono::Utc;

use crate::{
    model::{boards, threads, posts, images},
    AppState,
    handler::middleware::CurrentSession,
    handler::HtmlTemplate,
    service::storage::{ProcessedImage, StorageService},
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

#[derive(Template)]
#[template(path = "home.html")]
struct HomeTemplate {
    boards: Vec<boards::Model>,
}

#[derive(Template)]
#[template(path = "board.html")]
struct BoardTemplate {
    board: boards::Model,
    threads: Vec<ThreadWithPosts>,
}

#[derive(Template)]
#[template(path = "thread.html")]
struct ThreadTemplate {
    board: boards::Model,
    thread: threads::Model,
    posts: Vec<posts::Model>,
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
        // Find threads
        let threads_raw = threads::Entity::find()
            .filter(threads::Column::BoardSlug.eq(&slug))
            .order_by_desc(threads::Column::UpdatedAt)
            .limit(10)
            .all(db)
            .await
            .unwrap();

        // Populate posts for each thread (N+1 query mostly, optimizing later is fine)
        let mut threads_with_posts = Vec::new();
        for t in threads_raw {
            // Get last 5 posts for preview
            let posts = posts::Entity::find()
                .filter(posts::Column::ThreadId.eq(t.id))
                .order_by_asc(posts::Column::CreatedAt)
                .all(db)
                .await
                .unwrap();

            threads_with_posts.push(ThreadWithPosts {
                thread: t,
                posts
            });
        }

        return HtmlTemplate(BoardTemplate { board, threads: threads_with_posts }).into_response();
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
            let posts = thread.find_related(posts::Entity).all(db).await.unwrap();
            return HtmlTemplate(ThreadTemplate { board, thread, posts }).into_response();
        }
    }

    Redirect::to(&format!("/{}", slug)).into_response()
}

pub async fn create_thread_handler(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    Path(slug): Path<String>,
    multipart: Multipart, // Changed from Form
) -> impl IntoResponse {
    let state_read = state.read().await;
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
    Path((slug, thread_id)): Path<(String, i32)>,
    multipart: Multipart, // Changed from Form
) -> impl IntoResponse {
    let state_read = state.read().await;
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
