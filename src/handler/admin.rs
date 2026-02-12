use std::sync::Arc;
use axum::{
    extract::{Form, State, Query},
    response::{IntoResponse, Redirect, Response},
    http::header,
};
use axum_extra::extract::cookie::{Cookie, CookieJar};
use sea_orm::*;
use askama::Template;
use serde::Deserialize;
use chrono::{Utc, Duration};
use tokio::sync::RwLock;
use crate::{model::{admins, bans, admin_logs, posts, threads}, AppState, handler::HtmlTemplate};

// --- Templates ---

#[derive(Template)]
#[template(path = "admin/login.html")]
struct AdminLoginTemplate { error: Option<String> }

#[derive(Template)]
#[template(path = "admin/dashboard.html")]
struct AdminDashboardTemplate {
    admin: admins::Model,
    recent_posts: Vec<(posts::Model, String)>, // Post + BoardSlug
    recent_bans: Vec<bans::Model>,
}

#[derive(Template)]
#[template(path = "admin/logs.html")]
struct AdminLogsTemplate {
    logs: Vec<admin_logs::Model>,
}

// --- Auth Middleware Helper ---
pub async fn admin_check(jar: CookieJar, db: &DatabaseConnection) -> Option<admins::Model> {
    if let Some(cookie) = jar.get("admin_session") {
        let key = cookie.value();
        return admins::Entity::find()
            .filter(admins::Column::ServiceKey.eq(key))
            .one(db).await.unwrap_or(None);
    }
    None
}

// --- Handlers ---

#[derive(Deserialize)]
pub struct LoginPayload { key: String }

pub async fn admin_login_page() -> impl IntoResponse {
    HtmlTemplate(AdminLoginTemplate { error: None })
}

pub async fn admin_login_action(
    State(state): State<Arc<RwLock<AppState>>>,
    jar: CookieJar,
    Form(payload): Form<LoginPayload>,
) -> impl IntoResponse {
    let state = state.read().await;
    let db = &state.pool;

    let admin = admins::Entity::find()
        .filter(admins::Column::ServiceKey.eq(&payload.key))
        .one(db)
        .await
        .unwrap_or(None);

    if let Some(_) = admin {
        let cookie = Cookie::build(("admin_session", payload.key))
            .path("/")
            .http_only(true)
            .build();
        return (jar.add(cookie), Redirect::to("/admin/dashboard")).into_response();
    }

    HtmlTemplate(AdminLoginTemplate { error: Some("Invalid Key".into()) }).into_response()
}

pub async fn admin_dashboard(
    State(state): State<Arc<RwLock<AppState>>>,
    jar: CookieJar,
) -> Response {
    let state = state.read().await;
    let db = &state.pool;

    let admin = match admin_check(jar, db).await {
        Some(a) => a,
        None => return Redirect::to("/admin").into_response(),
    };

    // Fetch last 50 posts with board info
    // Note: This requires a join. For simplicity in raw sql or seaorm:
    let posts = posts::Entity::find()
        .find_also_related(threads::Entity)
        .order_by_desc(posts::Column::CreatedAt)
        .limit(50)
        .all(db)
        .await
        .unwrap();

    let recent_posts: Vec<(posts::Model, String)> = posts.into_iter().map(|(p, t)| {
        let slug = t.map(|th| th.board_slug).unwrap_or("?".to_string());
        (p, slug)
    }).collect();

    let recent_bans = bans::Entity::find()
        .order_by_desc(bans::Column::CreatedAt)
        .limit(20)
        .all(db)
        .await
        .unwrap();

    HtmlTemplate(AdminDashboardTemplate {
        admin,
        recent_posts,
        recent_bans
    }).into_response()
}

#[derive(Deserialize)]
pub struct BanPayload {
    ip: String,
    session: String,
    reason: String,
    duration_hours: i64,
}

pub async fn admin_ban_action(
    State(state): State<Arc<RwLock<AppState>>>,
    jar: CookieJar,
    Form(payload): Form<BanPayload>,
) -> Response {
    let state = state.read().await;
    let db = &state.pool;

    let admin = match admin_check(jar, db).await {
        Some(a) => a,
        None => return Redirect::to("/admin").into_response(),
    };

    if admin.role < 2 { // Require Moderator (2) or Admin (3)
        return "Not authorized".into_response();
    }

    let expires = Utc::now().naive_utc() + Duration::hours(payload.duration_hours);

    let ban = bans::ActiveModel {
        ip_address: Set(Some(payload.ip.clone())),
        session_id: Set(Some(payload.session.clone())),
        reason: Set(Some(payload.reason)),
        expires_at: Set(expires),
        created_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };

    ban.insert(db).await.unwrap();

    // Log Action
    let log = admin_logs::ActiveModel {
        admin_username: Set(admin.username),
        action: Set("BAN".to_string()),
        target_id: Set(Some(payload.ip)),
        details: Set(Some(format!("Session: {}, Duration: {}h", payload.session, payload.duration_hours))),
        created_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };
    log.insert(db).await.unwrap();

    Redirect::to("/admin/dashboard").into_response()
}

#[derive(Deserialize)]
pub struct ExportQuery {
    target_type: String, // "ip" or "session"
    value: String,
}

pub async fn admin_export_logs(
    State(state): State<Arc<RwLock<AppState>>>,
    jar: CookieJar,
    Query(query): Query<ExportQuery>,
) -> Response {
    let state = state.read().await;
    let db = &state.pool;

    let admin = match admin_check(jar, db).await {
        Some(a) => a,
        None => return Redirect::to("/admin").into_response(),
    };

    if admin.role < 3 { return "Admin only".into_response(); }

    let mut csv_data = String::from("Type,ID,Content,Date,IP,Session\n");

    // Fetch Threads
    let threads = match query.target_type.as_str() {
        "ip" => threads::Entity::find().filter(threads::Column::IpAddress.eq(&query.value)).all(db).await.unwrap(),
        _ => threads::Entity::find().filter(threads::Column::SessionId.eq(&query.value)).all(db).await.unwrap(),
    };

    for t in threads {
        csv_data.push_str(&format!("THREAD,{},\"{}\",{},{},{}\n",
                                   t.id, t.content.replace("\"", "\"\""), t.created_at, t.ip_address, t.session_id));
    }

    // Fetch Posts
    let posts = match query.target_type.as_str() {
        "ip" => posts::Entity::find().filter(posts::Column::IpAddress.eq(&query.value)).all(db).await.unwrap(),
        _ => posts::Entity::find().filter(posts::Column::SessionId.eq(&query.value)).all(db).await.unwrap(),
    };

    for p in posts {
        csv_data.push_str(&format!("POST,{},\"{}\",{},{},{}\n",
                                   p.id, p.content.replace("\"", "\"\""), p.created_at, p.ip_address, p.session_id));
    }

    // Log the export action
    let log = admin_logs::ActiveModel {
        admin_username: Set(admin.username),
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
    jar: CookieJar,
) -> Response {
    let state = state.read().await;
    let db = &state.pool;

    // 1. Auth Check
    let admin = match admin_check(jar, db).await {
        Some(a) => a,
        None => return Redirect::to("/admin").into_response(),
    };

    // 2. Role Check: Only Admins (Level 3) should see audit logs
    if admin.role < 3 {
        return "Unauthorized. Level 3 access required.".into_response();
    }

    // 3. Fetch Logs (Limit 100 most recent)
    let logs = admin_logs::Entity::find()
        .order_by_desc(admin_logs::Column::CreatedAt)
        .limit(100)
        .all(db)
        .await
        .unwrap_or_default();

    HtmlTemplate(AdminLogsTemplate { logs }).into_response()
}