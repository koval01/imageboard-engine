use std::sync::Arc;
use anyhow::Result;
use axum::{
    middleware::{self, from_fn_with_state},
    routing::{get, post},
    Router,
    response::{Response, IntoResponse},
    http::StatusCode,
    body::Body,
};
use tokio::sync::RwLock;
use tower_http::{services::ServeDir, trace::TraceLayer, catch_panic::CatchPanicLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter, fmt};

use crate::{
    handler::{
        board::{home_handler, view_board_handler, view_thread_handler, create_thread_handler, reply_handler, poll_new_posts_handler},
        middleware::{session_middleware, bot_guard_middleware, response_time_middleware},
        admin::{create_report, resolve_report},
    },
    AppState,
};
use crate::handler::admin::{admin_login_action, admin_logout_action, api_ban_user, api_delete_content, api_get_logs, api_get_reports, api_get_stats, api_investigate, api_visual_search, api_check_admin, api_search_content};

async fn sanitize_error_response(req: axum::extract::Request, next: middleware::Next) -> Response {
    let response = next.run(req).await;
    if response.status() == StatusCode::INTERNAL_SERVER_ERROR {
        #[cfg(debug_assertions)]
        { return response; }
        #[cfg(not(debug_assertions))]
        {
            let (parts, _) = response.into_parts();
            return Response::from_parts(parts, Body::from("Internal Server Error"));
        }
    }
    response
}

// Fallback handler for SPA: returns index.html for unknown routes
async fn spa_fallback() -> impl IntoResponse {
    match tokio::fs::read_to_string("client/dist/index.html").await {
        Ok(html) => Response::builder()
            .header("content-type", "text/html")
            .body(Body::from(html))
            .unwrap(),
        Err(_) => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from("Frontend not found"))
            .unwrap(),
    }
}

pub async fn serve(app_state: Arc<RwLock<AppState>>) -> Result<()> {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(fmt::layer())
        .init();

    let port = 8082_u16;
    let address = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;

    let api_router = Router::new()
        .route("/home", get(home_handler))
        .route("/{slug}", get(view_board_handler))
        .route("/{slug}/submit", post(create_thread_handler))
        .route("/{slug}/thread/{id}", get(view_thread_handler))
        .route("/{slug}/thread/{id}/reply", post(reply_handler))
        .route("/{slug}/thread/{id}/poll", get(poll_new_posts_handler))
        .route("/report", post(create_report))
        // Admin API
        .route("/admin/status", get(api_check_admin))
        .route("/admin/login", post(admin_login_action))
        .route("/admin/logout", post(admin_logout_action))
        .route("/admin/stats", get(api_get_stats))
        .route("/admin/logs", get(api_get_logs))
        .route("/admin/reports", get(api_get_reports))
        .route("/admin/investigate", get(api_investigate))
        .route("/admin/search", get(api_search_content))
        .route("/admin/visual-search", post(api_visual_search))
        .route("/admin/ban", post(api_ban_user))
        .route("/admin/delete", post(api_delete_content))
        .route("/admin/resolve", post(resolve_report))
        .layer(from_fn_with_state(app_state.clone(), bot_guard_middleware));

    let app = Router::new()
        .nest("/api", api_router)
        .nest_service("/assets", ServeDir::new("client/dist/assets"))
        .fallback(spa_fallback)
        .layer(middleware::from_fn(sanitize_error_response))
        .layer(CatchPanicLayer::new())
        .layer(from_fn_with_state(app_state.clone(), session_middleware))
        .layer(middleware::from_fn(response_time_middleware))
        .layer(TraceLayer::new_for_http())
        .with_state(app_state);

    println!("Server running on http://0.0.0.0:{}", port);
    axum::serve(address, app.into_make_service_with_connect_info::<std::net::SocketAddr>()).await?;

    Ok(())
}
