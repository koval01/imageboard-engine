use std::sync::Arc;
use anyhow::Result;
use axum::{
    middleware::{self, from_fn_with_state},
    routing::{get, post},
    Router,
    response::Response,
    http::StatusCode,
};
use tokio::sync::RwLock;
use tower_http::{services::ServeDir, trace::TraceLayer, catch_panic::CatchPanicLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter, fmt};

use crate::{
    handler::{
        board::{home_handler, view_board_handler, view_thread_handler, create_thread_handler, reply_handler, about_handler, rules_handler, poll_new_posts_handler},
        middleware::{session_middleware, bot_guard_middleware, response_time_middleware},
        admin::{create_report, resolve_report},
    },
    AppState,
};
use crate::handler::admin::{admin_login_action, admin_login_page, admin_logout_action, admin_panel_view, api_ban_user, api_delete_content, api_get_logs, api_get_reports, api_get_stats, api_investigate, api_visual_search};

async fn sanitize_error_response(req: axum::extract::Request, next: axum::middleware::Next) -> Response {
    let response = next.run(req).await;
    if response.status() == StatusCode::INTERNAL_SERVER_ERROR {
        #[cfg(debug_assertions)]
        { return response; }
        #[cfg(not(debug_assertions))]
        {
            use axum::body::Body;
            let (parts, _) = response.into_parts();
            return Response::from_parts(parts, Body::from("Internal Server Error"));
        }
    }
    response
}

pub async fn serve(app_state: Arc<RwLock<AppState>>) -> Result<()> {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(fmt::layer())
        .init();

    let assets_path = std::env::current_dir()?;
    let port = 8082_u16;
    let address = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;

    let app = Router::new()
        .route("/", get(home_handler))
        .route("/about", get(about_handler))
        .route("/rules", get(rules_handler))
        .route("/{slug}", get(view_board_handler))
        .route("/{slug}/submit", post(create_thread_handler))
        .route("/{slug}/thread/{id}", get(view_thread_handler))
        .route("/{slug}/thread/{id}/reply", post(reply_handler))
        .route("/{slug}/thread/{id}/poll", get(poll_new_posts_handler))
        .route("/report", post(create_report))

        // Admin Routes
        .route("/admin", get(admin_login_page))
        .route("/admin/login", post(admin_login_action))
        .route("/admin/logout", post(admin_logout_action))

        // SPA Entry
        .route("/admin/panel", get(admin_panel_view))

        // Admin JSON API
        .route("/api/admin/stats", get(api_get_stats))
        .route("/api/admin/logs", get(api_get_logs))
        .route("/api/admin/reports", get(api_get_reports))
        .route("/api/admin/investigate", get(api_investigate))
        .route("/api/admin/visual-search", post(api_visual_search))
        .route("/api/admin/ban", post(api_ban_user))
        .route("/api/admin/delete", post(api_delete_content))
        .route("/api/admin/resolve", post(resolve_report))

        .nest_service("/assets", ServeDir::new(format!("{}/assets", assets_path.to_str().unwrap())))
        .layer(middleware::from_fn(sanitize_error_response))
        .layer(CatchPanicLayer::new())
        .layer(from_fn_with_state(app_state.clone(), bot_guard_middleware))
        .layer(from_fn_with_state(app_state.clone(), session_middleware))
        .layer(middleware::from_fn(response_time_middleware))
        .layer(TraceLayer::new_for_http())
        .with_state(app_state);

    println!("Server running on http://0.0.0.0:{}", port);
    axum::serve(address, app.into_make_service_with_connect_info::<std::net::SocketAddr>()).await?;

    Ok(())
}
