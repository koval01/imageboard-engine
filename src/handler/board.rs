use std::sync::Arc;
use axum::{
    extract::{Path, State, Extension},
    response::{IntoResponse, Redirect},
    Form,
};
use sea_orm::{EntityTrait, QueryOrder, Set, ActiveModelTrait, ModelTrait, QueryFilter, ColumnTrait, QuerySelect};
use tokio::sync::RwLock;
use askama::Template;
use chrono::Utc;

use crate::{
    model::{boards, threads, posts, CreateThreadSchema, CreatePostSchema},
    AppState,
    handler::middleware::CurrentSession,
    handler::HtmlTemplate,
};

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
                posts: posts
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
    Form(payload): Form<CreateThreadSchema>,
) -> impl IntoResponse {
    if payload.content.trim().is_empty() {
        return Redirect::to(&format!("/{}", slug)).into_response();
    }

    let db = &state.read().await.pool;
    let new_thread = threads::ActiveModel {
        board_slug: Set(slug.clone()),
        subject: Set(payload.subject.map(|s| if s.is_empty() { None } else { Some(s) }).flatten()),
        content: Set(payload.content),
        session_id: Set(session.id),
        created_at: Set(Utc::now().naive_utc()),
        updated_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };

    if let Ok(_) = new_thread.insert(db).await {
        return Redirect::to(&format!("/{}", slug)).into_response();
    }

    Redirect::to(&format!("/{}", slug)).into_response()
}

pub async fn reply_handler(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    Path((slug, thread_id)): Path<(String, i32)>,
    Form(payload): Form<CreatePostSchema>,
) -> impl IntoResponse {
    if payload.content.trim().is_empty() {
        return Redirect::to(&format!("/{}/thread/{}", slug, thread_id)).into_response();
    }

    let db = &state.read().await.pool;
    let new_post = posts::ActiveModel {
        thread_id: Set(thread_id),
        content: Set(payload.content),
        session_id: Set(session.id),
        created_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };

    if let Ok(_) = new_post.insert(db).await {
        let thread = threads::ActiveModel {
            id: Set(thread_id),
            updated_at: Set(Utc::now().naive_utc()),
            ..Default::default()
        };
        let _ = thread.update(db).await;
    }

    Redirect::to(&format!("/{}/thread/{}", slug, thread_id)).into_response()
}