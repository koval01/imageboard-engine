use std::sync::Arc;
use axum::{
    extract::{Form, State, Query, Extension, ConnectInfo},
    response::{IntoResponse, Redirect, Response},
    http::header,
};
use axum_extra::extract::cookie::{Cookie, CookieJar};
use sea_orm::*;
use askama::Template;
use serde::Deserialize;
use chrono::{Utc, Duration};
use tokio::sync::RwLock;
use sha2::{Sha256, Digest};
use jsonwebtoken::{encode, Header, EncodingKey};
use std::net::SocketAddr;

use crate::{
    model::{admins, bans, admin_logs, posts, threads, SessionClaims},
    AppState,
    handler::{HtmlTemplate, middleware::CurrentSession},
    security::{get_client_ip, get_user_agent},
};

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

// --- Handlers ---

#[derive(Deserialize)]
pub struct LoginPayload { key: String }

pub async fn admin_login_page() -> impl IntoResponse {
    HtmlTemplate(AdminLoginTemplate { error: None })
}

pub async fn admin_login_action(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    jar: CookieJar,
    headers: axum::http::HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Form(payload): Form<LoginPayload>,
) -> impl IntoResponse {
    let state_read = state.read().await;
    let db = &state_read.pool;
    let config = &state_read.config;
    let jwt_secret = config.jwt_secret.as_bytes();

    let mut hasher = Sha256::new();
    hasher.update(payload.key.as_bytes());
    let hashed_key = hex::encode(hasher.finalize());

    let admin = admins::Entity::find()
        .filter(admins::Column::ServiceKey.eq(&hashed_key))
        .one(db)
        .await
        .unwrap_or(None);

    if let Some(admin) = admin {
        let now = Utc::now();
        let iat = now.timestamp() as usize;
        let exp = (now + Duration::days(365)).timestamp() as usize;

        let claims = SessionClaims {
            sess: session.id,
            ip: get_client_ip(&headers, &addr),
            ua: get_user_agent(&headers),
            role: admin.role,
            iat,
            exp,
        };

        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(jwt_secret),
        ).unwrap();

        let jwt_cookie = Cookie::build(("session_id", token))
            .path("/")
            .max_age(time::Duration::days(365))
            .http_only(true)
            .build();

        return (jar.add(jwt_cookie), Redirect::to("/admin/dashboard")).into_response();
    }

    HtmlTemplate(AdminLoginTemplate { error: Some("Invalid Key".into()) }).into_response()
}

pub async fn admin_dashboard(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
) -> Response {
    if session.role < 1 {
        return Redirect::to("/admin").into_response();
    }

    let state = state.read().await;
    let db = &state.pool;

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

    let role_name = match session.role {
        1 => "Janitor",
        2 => "Moderator",
        3 => "Administrator",
        _ => "Unknown",
    };

    let admin_view_model = admins::Model {
        id: 0,
        username: role_name.to_string(),
        service_key: "".to_string(),
        role: session.role,
        created_at: Utc::now().naive_utc(),
    };

    HtmlTemplate(AdminDashboardTemplate {
        admin: admin_view_model,
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
    Extension(session): Extension<CurrentSession>,
    Form(payload): Form<BanPayload>,
) -> Response {
    if session.role < 2 {
        return "Not authorized".into_response();
    }

    let state = state.read().await;
    let db = &state.pool;

    let expires = Utc::now().naive_utc() + Duration::hours(payload.duration_hours);

    let ban = bans::ActiveModel {
        ip_address: Set(Some(payload.ip.clone())),
        session_id: Set(Some(payload.session.clone())),
        reason: Set(Some(payload.reason)),
        expires_at: Set(expires),
        created_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };

    if let Err(e) = ban.insert(db).await {
        return format!("Database error: {}", e).into_response();
    }

    let log = admin_logs::ActiveModel {
        admin_username: Set(format!("Role_{}", session.role)),
        action: Set("BAN".to_string()),
        target_id: Set(Some(payload.ip)),
        details: Set(Some(format!("Session: {}, Duration: {}h", payload.session, payload.duration_hours))),
        created_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };
    let _ = log.insert(db).await;

    Redirect::to("/admin/dashboard").into_response()
}

#[derive(Deserialize)]
pub struct DeletePayload {
    post_id: i32,
}

pub async fn admin_delete_post_action(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    Form(payload): Form<DeletePayload>,
) -> Response {
    if session.role < 1 {
        return "Not authorized".into_response();
    }

    let state = state.read().await;
    let db = &state.pool;

    let _ = posts::Entity::delete_by_id(payload.post_id).exec(db).await;

    // Log Action
    let log = admin_logs::ActiveModel {
        admin_username: Set(format!("Role_{}", session.role)),
        action: Set("DELETE".to_string()),
        target_id: Set(Some(payload.post_id.to_string())),
        details: Set(Some("Post deleted".to_string())),
        created_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };
    let _ = log.insert(db).await;

    Redirect::to("/admin/dashboard").into_response()
}

#[derive(Deserialize)]
pub struct ExportQuery {
    target_type: String, // "ip" or "session"
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
