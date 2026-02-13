use std::sync::Arc;
use anyhow::Result;
use axum::{
    middleware::from_fn_with_state,
    routing::{get, post},
    Router,
};
use tokio::sync::RwLock;
use tower_http::{services::ServeDir, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter, fmt};

use crate::{
    handler::{
        board::{home_handler, view_board_handler, view_thread_handler, create_thread_handler, reply_handler, about_handler, rules_handler, poll_new_posts_handler},
        middleware::{session_middleware, bot_guard_middleware},
        admin::{create_report, resolve_report},
    },
    AppState,
};

pub async fn serve(app_state: Arc<RwLock<AppState>>) -> Result<()> {
    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| {
                    #[cfg(debug_assertions)]
                    {
                        "debug".into()
                    }
                    #[cfg(not(debug_assertions))]
                    {
                        "error".into()
                    }
                }),
        )
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
        .route("/{slug}/thread/{id}/poll", get(poll_new_posts_handler)) // Polling Route
        .route("/report", post(create_report))
        .route("/admin", get(crate::handler::admin::admin_login_page))
        .route("/admin/login", post(crate::handler::admin::admin_login_action))
        .route("/admin/dashboard", get(crate::handler::admin::admin_dashboard))
        .route("/admin/ban", post(crate::handler::admin::admin_ban_action))
        .route("/admin/delete", post(crate::handler::admin::admin_delete_post_action))
        .route("/admin/report/resolve", post(resolve_report))
        .route("/admin/export", get(crate::handler::admin::admin_export_logs))
        .route("/admin/logs", get(crate::handler::admin::admin_logs_view))
        .route("/admin/reports", get(crate::handler::admin::admin_reports_view))
        .nest_service("/assets", ServeDir::new(format!("{}/assets", assets_path.to_str().unwrap())))
        .layer(from_fn_with_state(app_state.clone(), bot_guard_middleware))
        .layer(from_fn_with_state(app_state.clone(), session_middleware))
        .layer(TraceLayer::new_for_http())
        .with_state(app_state);

    println!("Server running on http://0.0.0.0:{}", port);
    axum::serve(address, app.into_make_service_with_connect_info::<std::net::SocketAddr>()).await?;

    Ok(())
}
