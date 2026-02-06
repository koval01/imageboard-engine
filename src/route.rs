use std::sync::Arc;
use anyhow::Result;
use axum::{
    middleware::from_fn_with_state,
    routing::{get, post},
    Router,
};
use tokio::sync::RwLock;
use tower_http::{services::ServeDir, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::{
    handler::{
        board::{home_handler, view_board_handler, view_thread_handler, create_thread_handler, reply_handler},
        middleware::session_middleware,
    },
    AppState,
};

pub async fn serve(app_state: Arc<RwLock<AppState>>) -> Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "debug".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let assets_path = std::env::current_dir()?;
    let port = 8082_u16;
    let address = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;

    let app = Router::new()
        .route("/", get(home_handler))
        .route("/{slug}", get(view_board_handler))
        .route("/{slug}/submit", post(create_thread_handler))
        .route("/{slug}/thread/{id}", get(view_thread_handler))
        .route("/{slug}/thread/{id}/reply", post(reply_handler))
        .nest_service("/assets", ServeDir::new(format!("{}/assets", assets_path.to_str().unwrap())))
        .layer(from_fn_with_state(app_state.clone(), session_middleware))
        .layer(TraceLayer::new_for_http())
        .with_state(app_state);

    axum::serve(address, app.into_make_service_with_connect_info::<std::net::SocketAddr>()).await?;

    Ok(())
}
