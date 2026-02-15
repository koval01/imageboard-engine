use std::sync::Arc;
use axum::{
    extract::{Form, State, Query, Extension, ConnectInfo},
    response::{IntoResponse, Redirect, Response},
    http::header,
};
use sea_orm::*;
use askama::Template;
use serde::Deserialize;
use chrono::{Utc, Duration};
use tokio::sync::RwLock;
use sha2::{Sha256, Digest};
use std::net::SocketAddr;
use sea_orm::sea_query::Expr;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter, ActiveModelTrait, Set, PaginatorTrait, QueryOrder};
use crate::{
    model::{admins, bans, admin_logs, posts, threads, images, reports},
    AppState,
    handler::{HtmlTemplate, middleware::CurrentSession},
    security::get_client_ip,
};

// --- Templates ---

#[derive(Template)]
#[template(path = "admin/login.html")]
struct AdminLoginTemplate { error: Option<String> }

#[derive(Template)]
#[template(path = "admin/dashboard.html")]
struct AdminDashboardTemplate {
    admin: admins::Model,
    reports: Vec<(reports::Model, Option<posts::Model>)>,
    logs: Vec<admin_logs::Model>,
    total_posts: u64,
    total_bans: u64,
    total_reports: u64,
}

#[derive(Template)]
#[template(path = "admin/logs.html")]
struct AdminLogsTemplate {
    logs: Vec<admin_logs::Model>,
}

#[derive(Template)]
#[template(path = "admin/reports.html")]
struct AdminReportsTemplate {
    reports: Vec<(reports::Model, Option<posts::Model>, Vec<images::Model>)>,
    cdn_url: String,
}

// --- Handlers ---

#[derive(Deserialize)]
pub struct LoginPayload { key: String }

// SECURITY FIX: Redirect if already logged in
pub async fn admin_login_page(
    Extension(session): Extension<CurrentSession>,
) -> Response {
    if session.role > 0 {
        return Redirect::to("/admin/dashboard").into_response();
    }
    HtmlTemplate(AdminLoginTemplate { error: None }).into_response()
}

pub async fn admin_login_action(
    State(state): State<Arc<RwLock<AppState>>>,
    // We take the current session so we can upgrade it
    Extension(mut session): Extension<CurrentSession>,
    Form(payload): Form<LoginPayload>,
) -> Response {
    let state_read = state.read().await;
    let db = &state_read.pool;

    let mut hasher = Sha256::new();
    hasher.update(payload.key.as_bytes());
    let hashed_key = hex::encode(hasher.finalize());

    let admin = admins::Entity::find()
        .filter(admins::Column::ServiceKey.eq(&hashed_key))
        .one(db)
        .await
        .unwrap_or(None);

    if let Some(admin) = admin {
        // Update session state. The middleware will detect this change and issue the new cookie.
        session.role = admin.role;
        session.version = admin.token_version;

        let mut response = Redirect::to("/admin/dashboard").into_response();
        // IMPORTANT: We must re-insert the modified extension into the response
        // so the middleware (which runs after this returns) sees the updated values.
        response.extensions_mut().insert(session);
        return response;
    }

    HtmlTemplate(AdminLoginTemplate { error: Some("Invalid Key".into()) }).into_response()
}

pub async fn admin_logout_action(
    Extension(mut session): Extension<CurrentSession>,
) -> Response {
    // Downgrade session
    session.role = 0;
    session.version = 1;

    let mut response = Redirect::to("/admin").into_response();
    response.extensions_mut().insert(session);
    response
}

#[derive(Deserialize)]
pub struct DashboardQuery {
    search: Option<String>,
}

pub async fn admin_dashboard(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    Query(query): Query<DashboardQuery>,
) -> Response {
    if session.role < 1 {
        return Redirect::to("/admin").into_response();
    }

    let state = state.read().await;
    let db = &state.pool;

    // Get Active Reports
    let reports_raw = reports::Entity::find()
        .filter(reports::Column::Status.eq("OPEN"))
        .find_also_related(posts::Entity)
        .order_by_asc(reports::Column::CreatedAt)
        .all(db)
        .await
        .unwrap_or_default();

    // Get Logs (with search)
    let mut logs_query = admin_logs::Entity::find()
        .order_by_desc(admin_logs::Column::CreatedAt)
        .limit(100);

    if let Some(s) = query.search {
        if !s.is_empty() {
            logs_query = logs_query.filter(
                admin_logs::Column::TargetId.contains(&s)
                    .or(admin_logs::Column::Details.contains(&s))
                    .or(admin_logs::Column::Action.contains(&s))
            );
        }
    }

    let logs = logs_query.all(db).await.unwrap_or_default();

    let total_posts = posts::Entity::find().count(db).await.unwrap_or(0);
    let total_bans = bans::Entity::find().count(db).await.unwrap_or(0);
    let total_reports = reports::Entity::find().count(db).await.unwrap_or(0);

    let role_name = match session.role {
        1 => "Вартовий (L1)",
        2 => "Модератор (L2)",
        3 => "Адміністратор (L3)",
        _ => "Гість",
    };

    let admin_view_model = admins::Model {
        id: 0,
        username: role_name.to_string(),
        service_key: "".to_string(),
        role: session.role,
        token_version: 0,
        created_at: Utc::now().naive_utc(),
    };

    HtmlTemplate(AdminDashboardTemplate {
        admin: admin_view_model,
        reports: reports_raw,
        logs,
        total_posts,
        total_bans,
        total_reports,
    }).into_response()
}

#[derive(Deserialize)]
pub struct BanPayload {
    ip: String,
    session: String,
    reason: String,
    duration_hours: i64,
    delete_posts: Option<bool>,
    report_id: Option<i32>,
}

pub async fn admin_ban_action(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    Form(payload): Form<BanPayload>,
) -> Response {
    if session.role < 3 {
        return "Недостатньо прав (потрібен L3)".into_response();
    }

    let state = state.read().await;
    let db = &state.pool;
    let storage = &state.storage;

    // 1. Insert Ban
    let expires = Utc::now().naive_utc() + Duration::hours(payload.duration_hours);
    let ban = bans::ActiveModel {
        ip_address: Set(Some(payload.ip.clone())),
        session_id: Set(Some(payload.session.clone())),
        reason: Set(Some(payload.reason.clone())),
        expires_at: Set(expires),
        created_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };

    if let Err(e) = ban.insert(db).await {
        return format!("Database error: {}", e).into_response();
    }

    // 2. Delete posts from this IP if requested
    if payload.delete_posts.unwrap_or(false) {
        let posts_to_del = posts::Entity::find()
            .filter(posts::Column::IpAddress.eq(&payload.ip))
            .all(db).await.unwrap_or_default();

        for p in posts_to_del {
            let imgs = images::Entity::find().filter(images::Column::PostId.eq(p.id)).all(db).await.unwrap_or_default();
            for img in imgs {
                let _ = storage.delete_file(&img.url).await;
                let _ = storage.delete_file(&img.thumbnail_url).await;
            }
            let _ = posts::Entity::delete_by_id(p.id).exec(db).await;
        }

        let threads_to_del = threads::Entity::find()
            .filter(threads::Column::IpAddress.eq(&payload.ip))
            .all(db).await.unwrap_or_default();

        for t in threads_to_del {
            let imgs = images::Entity::find().filter(images::Column::ThreadId.eq(t.id)).all(db).await.unwrap_or_default();
            for img in imgs {
                let _ = storage.delete_file(&img.url).await;
                let _ = storage.delete_file(&img.thumbnail_url).await;
            }
            let _ = threads::Entity::delete_by_id(t.id).exec(db).await;
        }
    }

    // 3. Close Report if exists
    if let Some(rid) = payload.report_id {
        let _ = reports::Entity::update_many()
            .col_expr(reports::Column::Status, Expr::value("RESOLVED"))
            .filter(reports::Column::Id.eq(rid))
            .exec(db).await;
    }

    let _ = reports::Entity::update_many()
        .col_expr(reports::Column::Status, Expr::value("RESOLVED"))
        .filter(reports::Column::IpAddress.eq(&payload.ip))
        .exec(db).await;

    // 4. Log
    let log = admin_logs::ActiveModel {
        admin_username: Set(format!("L{}", session.role)),
        action: Set("BAN".to_string()),
        target_id: Set(Some(payload.ip)),
        details: Set(Some(format!("Del: {:?}, Reason: {}", payload.delete_posts, payload.reason))),
        created_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };
    let _ = log.insert(db).await;

    "".into_response()
}

#[derive(Deserialize)]
pub struct DeletePayload {
    post_id: Option<i32>,
    thread_id: Option<i32>,
    report_id: Option<i32>,
}

pub async fn admin_delete_post_action(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    Form(payload): Form<DeletePayload>,
) -> Response {
    if session.role < 2 {
        return "Недостатньо прав (потрібен L2)".into_response();
    }

    let state = state.read().await;
    let db = &state.pool;
    let storage = &state.storage;

    let mut image_keys_to_check = Vec::new();
    let mut log_target = String::new();

    if let Some(pid) = payload.post_id {
        log_target = format!("Post {}", pid);
        if let Ok(Some(_)) = posts::Entity::find_by_id(pid).one(db).await {
            let imgs = images::Entity::find().filter(images::Column::PostId.eq(pid)).all(db).await.unwrap_or_default();
            for img in imgs {
                image_keys_to_check.push((img.storage_key, img.url, img.thumbnail_url));
            }
            let _ = posts::Entity::delete_by_id(pid).exec(db).await;

            // Close associated reports
            let _ = reports::Entity::update_many()
                .col_expr(reports::Column::Status, Expr::value("RESOLVED"))
                .filter(reports::Column::PostId.eq(pid))
                .exec(db).await;
        }
    }  else if let Some(tid) = payload.thread_id {
        log_target = format!("Thread {}", tid);
        if let Ok(Some(_)) = threads::Entity::find_by_id(tid).one(db).await {
            let op_imgs = images::Entity::find()
                .filter(images::Column::ThreadId.eq(tid))
                .all(db).await.unwrap_or_default();
            for img in op_imgs {
                image_keys_to_check.push((img.storage_key, img.url, img.thumbnail_url));
            }
            let posts = posts::Entity::find()
                .filter(posts::Column::ThreadId.eq(tid))
                .all(db).await.unwrap_or_default();
            for p in posts {
                let p_imgs = images::Entity::find()
                    .filter(images::Column::PostId.eq(p.id))
                    .all(db).await.unwrap_or_default();
                for img in p_imgs {
                    image_keys_to_check.push((img.storage_key, img.url, img.thumbnail_url));
                }
            }
            let _ = threads::Entity::delete_by_id(tid).exec(db).await;
        }
    }

    if let Some(rid) = payload.report_id {
        let _ = reports::Entity::update_many()
            .col_expr(reports::Column::Status, Expr::value("RESOLVED"))
            .filter(reports::Column::Id.eq(rid))
            .exec(db).await;
    }

    for (key, main_url, thumb_url) in image_keys_to_check {
        let count = images::Entity::find()
            .filter(images::Column::StorageKey.eq(&key))
            .count(db).await.unwrap_or(0);

        if count == 0 {
            let _ = storage.delete_file(&main_url).await;
            let _ = storage.delete_file(&thumb_url).await;
        }
    }

    let log = admin_logs::ActiveModel {
        admin_username: Set(format!("L{}", session.role)),
        action: Set("DELETE".to_string()),
        target_id: Set(Some(log_target)),
        details: Set(Some("Content deleted".to_string())),
        created_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };
    let _ = log.insert(db).await;

    "".into_response()
}

#[derive(Deserialize)]
pub struct ReportPayload {
    post_id: i32,
    reason: String,
}

pub async fn create_report(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(_session): Extension<CurrentSession>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: axum::http::HeaderMap,
    Form(payload): Form<ReportPayload>,
) -> Response {
    let state_read = state.read().await;
    let db = &state_read.pool;
    let ip = get_client_ip(&headers, &addr);

    let exists = reports::Entity::find()
        .filter(reports::Column::PostId.eq(payload.post_id))
        .filter(reports::Column::IpAddress.eq(&ip))
        .count(db).await.unwrap_or(0);

    if exists > 0 {
        return "Вже надіслано".into_response();
    }

    let report = reports::ActiveModel {
        post_id: Set(payload.post_id),
        reason: Set(payload.reason),
        ip_address: Set(ip),
        created_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };

    let _ = report.insert(db).await;

    "Дякуємо!".into_response()
}

#[derive(Deserialize)]
pub struct ResolveReportPayload {
    report_id: i32,
    status: String,
}

pub async fn resolve_report(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    Form(payload): Form<ResolveReportPayload>,
) -> Response {
    if session.role < 1 { return "".into_response(); }

    let state = state.read().await;
    let db = &state.pool;

    let _ = reports::Entity::update_many()
        .col_expr(reports::Column::Status, Expr::value(payload.status.clone()))
        .filter(reports::Column::Id.eq(payload.report_id))
        .exec(db).await;

    "".into_response()
}

#[derive(Deserialize)]
pub struct ExportQuery {
    target_type: String,
    value: String,
}

pub async fn admin_export_logs(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    Query(query): Query<ExportQuery>,
) -> Response {
    if session.role < 3 {
        return "Admin only".into_response();
    }

    let state = state.read().await;
    let db = &state.pool;

    let mut csv_data = String::from("Type,ID,Content,Date,IP,Session\n");

    let threads = match query.target_type.as_str() {
        "ip" => threads::Entity::find().filter(threads::Column::IpAddress.eq(&query.value)).all(db).await.unwrap(),
        _ => threads::Entity::find().filter(threads::Column::SessionId.eq(&query.value)).all(db).await.unwrap(),
    };

    for t in threads {
        csv_data.push_str(&format!("THREAD,{},\"{}\",{},{},{}\n",
                                   t.id, t.content.replace("\"", "\"\""), t.created_at, t.ip_address, t.session_id));
    }

    let posts = match query.target_type.as_str() {
        "ip" => posts::Entity::find().filter(posts::Column::IpAddress.eq(&query.value)).all(db).await.unwrap(),
        _ => posts::Entity::find().filter(posts::Column::SessionId.eq(&query.value)).all(db).await.unwrap(),
    };

    for p in posts {
        csv_data.push_str(&format!("POST,{},\"{}\",{},{},{}\n",
                                   p.id, p.content.replace("\"", "\"\""), p.created_at, p.ip_address, p.session_id));
    }

    let log = admin_logs::ActiveModel {
        admin_username: Set("Admin".to_string()),
        action: Set("EXPORT".to_string()),
        target_id: Set(Some(query.value)),
        details: Set(Some(query.target_type)),
        created_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };
    let _ = log.insert(db).await;

    ([(header::CONTENT_TYPE, "text/csv"),
         (header::CONTENT_DISPOSITION, "attachment; filename=\"investigation.csv\"")],
     csv_data).into_response()
}

pub async fn admin_logs_view(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
) -> Response {
    if session.role < 3 {
        return "Unauthorized. Level 3 access required.".into_response();
    }

    let state = state.read().await;
    let db = &state.pool;

    let logs = admin_logs::Entity::find()
        .order_by_desc(admin_logs::Column::CreatedAt)
        .limit(100)
        .all(db)
        .await
        .unwrap_or_default();

    HtmlTemplate(AdminLogsTemplate { logs }).into_response()
}

pub async fn admin_reports_view(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
) -> Response {
    if session.role < 1 {
        return Redirect::to("/admin").into_response();
    }

    let state = state.read().await;
    let db = &state.pool;
    let cdn_url = state.config.cdn_url.clone();

    let reports_raw = reports::Entity::find()
        .filter(reports::Column::Status.eq("OPEN"))
        .order_by_asc(reports::Column::CreatedAt)
        .all(db)
        .await
        .unwrap_or_default();

    let mut full_reports = Vec::new();

    for report in reports_raw {
        let post = posts::Entity::find_by_id(report.post_id).one(db).await.unwrap_or(None);
        let mut imgs = Vec::new();
        if let Some(ref p) = post {
            imgs = images::Entity::find()
                .filter(images::Column::PostId.eq(p.id))
                .all(db)
                .await
                .unwrap_or_default();
        }
        full_reports.push((report, post, imgs));
    }

    HtmlTemplate(AdminReportsTemplate {
        reports: full_reports,
        cdn_url,
    }).into_response()
}
