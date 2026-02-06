use std::sync::Arc;
use anyhow::Result;
use axum::{
    middleware::from_fn_with_state,
    routing::{delete, get, post},
    Router,
};
use axum_messages::MessagesManagerLayer;
use tokio::sync::RwLock;
use tower_http::{services::ServeDir, trace::TraceLayer};
use tower_sessions::{MemoryStore, SessionManagerLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::{
    handler::{
        auth_middleware, handler_404, health_checker_handler, home_handler, login_page_handler,
        login_user_handler, logout_handler, register_page_handler, register_user_handler,
        todo_add_handler, todo_create_handler, todo_delete_handler, todo_edit_handler,
        todo_list_handler, todo_patch_handler,
    },
    AppState,
};

pub async fn serve(app_state: Arc<RwLock<AppState>>) -> Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "rust_axum_askama_htmx=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let session_store = MemoryStore::default();
    let session_layer = SessionManagerLayer::new(session_store).with_secure(false);
    let assets_path = std::env::current_dir()?;
    let port = 8082_u16;
    let address = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port))
        .await?;

    let app = Router::new()
        .route("/", get(home_handler))
        .route(
            "/register",
            get(register_page_handler).post(register_user_handler),
        )
        .route("/login", get(login_page_handler).post(login_user_handler))
        .route(
            "/todo/list",
            get(todo_list_handler)
                .route_layer(from_fn_with_state(app_state.clone(), auth_middleware)),
        )
        .route(
            "/logout",
            post(logout_handler)
                .route_layer(from_fn_with_state(app_state.clone(), auth_middleware)),
        )
        .route(
            "/create",
            get(todo_create_handler)
                .post(todo_add_handler)
                .route_layer(from_fn_with_state(app_state.clone(), auth_middleware)),
        )
        .route(
            "/edit",
            get(todo_edit_handler)
                .patch(todo_patch_handler)
                .route_layer(from_fn_with_state(app_state.clone(), auth_middleware)),
        )
        .route("/delete", delete(todo_delete_handler))
        .route("/healthchecker", get(health_checker_handler))
        .nest_service(
            "/assets",
            ServeDir::new(format!("{}/assets", assets_path.to_str().unwrap())),
        )
        .with_state(app_state)
        .fallback(handler_404)
        .layer(MessagesManagerLayer)
        .layer(session_layer)
        .layer(TraceLayer::new_for_http());

    axum::serve(address, app.into_make_service()).await?;

    Ok(())
}
