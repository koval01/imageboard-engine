use std::sync::Arc;
use anyhow::Result;
use axum::{
    middleware::{self, from_fn_with_state},
    routing::{get, post},
    Router,
    response::{Response, IntoResponse},
    http::{header::HeaderName, HeaderValue, Method, StatusCode},
    body::Body,
    extract::State,
    Json,
};
use tokio::sync::RwLock;
use tower_http::{
    cors::{AllowOrigin, Any, CorsLayer},
    services::ServeDir,
    set_header::SetResponseHeaderLayer,
    trace::TraceLayer,
    catch_panic::CatchPanicLayer,
};
use axum::http::header::CACHE_CONTROL;
use serde_json::json;

use crate::{
    handler::{
        admin_ui,
        board::{home_handler, view_board_handler, view_thread_handler, create_thread_handler, reply_handler, poll_new_posts_handler, get_single_post_handler},
        middleware::{session_middleware, bot_guard_middleware, response_time_middleware, require_staff_session},
        admin::{create_report, resolve_report},
        staff,
    },
    AppState,
};
use crate::handler::admin::{api_ban_user, api_delete_content, api_get_logs, api_get_reports, api_get_stats, api_investigate, api_visual_search, api_search_content};

async fn sanitize_error_response(req: axum::extract::Request, next: middleware::Next) -> Response {
    let response = next.run(req).await;
    if response.status() == StatusCode::INTERNAL_SERVER_ERROR {
        #[cfg(debug_assertions)]
        { return response; }
        #[cfg(not(debug_assertions))]
        {
            let (parts, _) = response.into_parts();
            return Response::from_parts(parts, Body::from("Внутрішня помилка сервера"));
        }
    }
    response
}

async fn spa_fallback(State(state): State<Arc<RwLock<AppState>>>) -> impl IntoResponse {
    let dist = state.read().await.config.frontend_dist.clone();
    let index = format!("{dist}/index.html");
    match tokio::fs::read_to_string(&index).await {
        Ok(html) => Response::builder()
            .header("content-type", "text/html")
            .body(Body::from(html))
            .unwrap(),
        Err(_) => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from("Фронтенд не знайдено"))
            .unwrap(),
    }
}

async fn health_handler(State(state): State<Arc<RwLock<AppState>>>) -> impl IntoResponse {
    let db = &state.read().await.pool;
    match db.ping().await {
        Ok(()) => (StatusCode::OK, Json(json!({"status": "ok"}))),
        Err(_) => (StatusCode::SERVICE_UNAVAILABLE, Json(json!({"status": "db"}))),
    }
}

pub fn create_router(app_state: Arc<RwLock<AppState>>) -> Router {
    let api_router = Router::new()
        .route("/home", get(home_handler))
        .route("/{slug}", get(view_board_handler))
        .route("/{slug}/submit", post(create_thread_handler))
        .route("/{slug}/thread/{id}", get(view_thread_handler))
        .route("/{slug}/thread/{id}/reply", post(reply_handler))
        .route("/{slug}/thread/{id}/poll", get(poll_new_posts_handler))
        .route("/post/{id}", get(get_single_post_handler))
        .route("/report", post(create_report))
        .route("/me/restriction", get(staff::api_me_restriction))
        .route("/admin/setup", post(staff::api_setup))
        .route("/admin/status", get(staff::api_check_admin))
        .route("/admin/login", post(staff::admin_login_action))
        .route("/admin/logout", post(staff::admin_logout_action))
        .route("/admin/password", post(staff::api_change_password))
        .route("/admin/stats", get(api_get_stats))
        .route("/admin/logs", get(api_get_logs))
        .route("/admin/reports", get(api_get_reports))
        .route("/admin/investigate", get(api_investigate))
        .route("/admin/search", get(api_search_content))
        .route("/admin/visual-search", post(api_visual_search))
        .route("/admin/ban", post(api_ban_user))
        .route("/admin/ban-preview", post(staff::api_ban_preview))
        .route("/admin/bans", get(staff::api_list_bans))
        .route("/admin/unban", post(staff::api_unban))
        .route("/admin/delete", post(api_delete_content))
        .route("/admin/hide", post(staff::api_hide_content))
        .route("/admin/resolve", post(resolve_report))
        .route("/admin/staff", get(staff::api_list_staff).post(staff::api_create_staff))
        .route("/admin/staff/{id}", post(staff::api_update_staff))
        .route("/admin/staff/{id}/password", post(staff::api_reset_staff_password))
        .route("/admin/staff/{id}/delete", post(staff::api_delete_staff))
        .route("/admin/settings", get(staff::api_get_settings).post(staff::api_put_settings))
        .layer(from_fn_with_state(app_state.clone(), bot_guard_middleware));

    let mut router = Router::new()
        .route("/api/health", get(health_handler))
        .route("/admin", get(admin_ui::admin_entry))
        .route("/admin/", get(admin_ui::admin_entry))
        .route("/admin/gate.js", get(admin_ui::admin_gate_js))
        .nest("/api", api_router);

    let admin_dist = app_state
        .try_read()
        .map(|g| g.config.admin_dist.clone())
        .unwrap_or_else(|_| "client/dist-admin".to_string());
    let admin_assets = format!("{admin_dist}/assets");
    let assets = Router::new()
        .fallback_service(ServeDir::new(admin_assets))
        .layer(SetResponseHeaderLayer::overriding(
            CACHE_CONTROL,
            admin_ui::no_store_cache(),
        ))
        .layer(middleware::from_fn(require_staff_session));
    router = router.nest("/admin/assets", assets);

    let serve_frontend = {
        // Tests and Docker set this on AppState before the router is built.
        // We cannot await here; read via try_read with default true if poisoned.
        app_state.try_read().map(|g| g.config.serve_frontend).unwrap_or(true)
    };
    let frontend_dist = app_state
        .try_read()
        .map(|g| g.config.frontend_dist.clone())
        .unwrap_or_else(|_| "client/dist".to_string());

    if serve_frontend {
        let assets = format!("{frontend_dist}/assets");
        router = router
            .nest_service("/assets", ServeDir::new(assets))
            .fallback(spa_fallback);
    }

    router
        .layer(middleware::from_fn(sanitize_error_response))
        .layer(CatchPanicLayer::new())
        .layer(from_fn_with_state(app_state.clone(), session_middleware))
        .layer(middleware::from_fn(response_time_middleware))
        .layer(TraceLayer::new_for_http())
        .with_state(app_state)
}

pub async fn serve(app_state: Arc<RwLock<AppState>>) -> Result<()> {
    let (port, cors_origin) = {
        let g = app_state.read().await;
        (8082_u16, g.config.cors_origin.clone())
    };

    let mut app = create_router(app_state);

    if let Some(origin) = cors_origin {
        let origin_header = origin.parse::<HeaderValue>()?;
        let cors = CorsLayer::new()
            .allow_origin(AllowOrigin::exact(origin_header))
            .allow_credentials(true)
            .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
            .allow_headers(Any)
            .expose_headers([
                HeaderName::from_static("x-client-key"),
                HeaderName::from_static("x-processing-time"),
            ]);
        app = app.layer(cors);
    }

    let address = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;

    println!("Server running on http://0.0.0.0:{}", port);
    axum::serve(address, app.into_make_service_with_connect_info::<std::net::SocketAddr>()).await?;

    Ok(())
}
