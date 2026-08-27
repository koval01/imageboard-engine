use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    extract::{ConnectInfo, Extension, Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, Set,
};
use serde::Deserialize;
use serde_json::json;
use tokio::sync::RwLock;

use crate::{
    handler::middleware::CurrentSession,
    model::{admins, bans, posts, threads},
    security::get_client_ip,
    service::{
        self, audit, bad_request, consume_rate_limit, effective_privileges, forbidden,
        hash_password, hours_active_for, is_super_admin, load_settings, match_restrictions,
        parse_cidr, preview_cidr, reserved_username, save_settings,
        staff_public_json, unauthorized, validate_password_for, Privileges, ROLE_ADMIN, ROLE_MOD,
        ROLE_SUPER, SUPER_USERNAME,
    },
    AppState,
};

fn open_password(crypto: &crate::service::PasswordCrypto, enc: &str) -> Result<String, Response> {
    crypto
        .open_b64(enc)
        .map_err(|_| bad_request("Не вдалося розшифрувати пароль"))
}

fn require_staff(session: &CurrentSession) -> Result<(), Response> {
    if session.role < 1 {
        Err(forbidden("Немає доступу"))
    } else {
        Ok(())
    }
}

async fn load_actor(
    db: &sea_orm::DatabaseConnection,
    session: &CurrentSession,
) -> Result<admins::Model, Response> {
    require_staff(session)?;
    admins::Entity::find_by_id(session.admin_id)
        .one(db)
        .await
        .ok()
        .flatten()
        .filter(|a| !a.disabled)
        .ok_or_else(|| forbidden("Немає доступу"))
}

fn require_priv(session: &CurrentSession, ok: bool, msg: &str) -> Result<(), Response> {
    require_staff(session)?;
    if !ok {
        if session.role >= 1 && !session.hours_active && session.role < ROLE_SUPER {
            return Err(forbidden("Поза робочими годинами — дії вимкнено"));
        }
        return Err(forbidden(msg));
    }
    Ok(())
}

#[derive(Deserialize)]
pub struct SetupPayload {
    password_enc: String,
}

#[derive(Deserialize)]
pub struct LoginPayload {
    username: String,
    password_enc: String,
}

#[derive(Deserialize)]
pub struct PasswordPayload {
    current_enc: String,
    new_password_enc: String,
}

#[derive(Deserialize)]
pub struct CreateStaffPayload {
    username: String,
    password_enc: String,
    role: i32,
}

#[derive(Deserialize, Debug)]
pub struct UpdateStaffPayload {
    role: Option<i32>,
    privileges: Option<serde_json::Value>,
    work_start: Option<String>,
    work_end: Option<String>,
    timezone: Option<String>,
    rate_limit_per_hour: Option<i32>,
    disabled: Option<bool>,
}

#[derive(Deserialize)]
pub struct ResetPasswordPayload {
    password_enc: String,
}

#[derive(Deserialize)]
pub struct SettingsPayload {
    default_rate_limit_per_hour: Option<u32>,
    default_work_start: Option<String>,
    default_work_end: Option<String>,
    timezone: Option<String>,
}

#[derive(Deserialize)]
pub struct HidePayload {
    id: i32,
    type_: String,
    hidden: bool,
}

#[derive(Deserialize)]
pub struct BanPreviewPayload {
    cidr: String,
}

#[derive(Deserialize)]
pub struct UnbanPayload {
    id: i32,
}

#[derive(Deserialize)]
pub struct RestrictionQuery {
    board: Option<String>,
}

const MAX_LOGIN_ATTEMPTS: u32 = 5;

pub async fn api_setup(
    State(state): State<Arc<RwLock<AppState>>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<SetupPayload>,
) -> Response {
    let state_read = state.read().await;
    let db = &state_read.pool;
    let ip = get_client_ip(&headers, &addr);

    let exists = admins::Entity::find()
        .filter(admins::Column::Role.eq(ROLE_SUPER))
        .one(db)
        .await
        .ok()
        .flatten();
    if exists.is_some() {
        return forbidden("Супер-адміна вже налаштовано");
    }
    let password = match open_password(&state_read.password_crypto, &payload.password_enc) {
        Ok(p) => p,
        Err(r) => return r,
    };
    if let Err(msg) = validate_password_for(&password, Some(SUPER_USERNAME)) {
        return bad_request(&msg);
    }

    let admin = admins::ActiveModel {
        username: Set(SUPER_USERNAME.to_string()),
        service_key: Set(hash_password(&password)),
        role: Set(ROLE_SUPER),
        token_version: Set(1),
        privileges: Set("{}".into()),
        timezone: Set("Europe/Kyiv".into()),
        disabled: Set(false),
        created_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };
    match admin.insert(db).await {
        Ok(_) => {
            audit(db, SUPER_USERNAME, "SETUP", None, Some("Створено супер-адміна".into()), Some(ip)).await;
            Json(json!({ "status": "ok" })).into_response()
        }
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Не вдалося створити обліковий запис" })),
        )
            .into_response(),
    }
}

pub async fn admin_login_action(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(mut session): Extension<CurrentSession>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<LoginPayload>,
) -> Response {
    let state_read = state.read().await;
    let db = &state_read.pool;
    let ip = get_client_ip(&headers, &addr);

    let attempts = state_read
        .kv
        .get(&format!("login:{ip}"))
        .await
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(0);

    if attempts >= MAX_LOGIN_ATTEMPTS {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({"error": "Забагато невдалих спроб. Блокування на 1 годину."})),
        )
            .into_response();
    }

    let username = if payload.username.trim().eq_ignore_ascii_case(SUPER_USERNAME) {
        SUPER_USERNAME.to_string()
    } else {
        payload.username.trim().to_string()
    };
    let password = state_read
        .password_crypto
        .open_b64(&payload.password_enc)
        .unwrap_or_default();
    let hashed = hash_password(&password);

    let admin = admins::Entity::find()
        .filter(admins::Column::Username.eq(&username))
        .one(db)
        .await
        .unwrap_or(None);

    let ok = admin
        .as_ref()
        .is_some_and(|a| a.service_key == hashed && !a.disabled);

    if let (true, Some(admin)) = (ok, admin) {
        state_read.kv.del(&format!("login:{ip}")).await;
        let settings = load_settings(&state_read.kv).await;
        let hours = hours_active_for(&admin, &settings);
        session.role = admin.role;
        session.version = admin.token_version;
        session.admin_id = admin.id;
        session.username = admin.username.clone();
        session.hours_active = hours;
        session.privileges = service::apply_hours_gate(
            effective_privileges(&admin),
            hours,
            is_super_admin(&admin),
        );

        let mut model: admins::ActiveModel = admin.clone().into();
        model.last_login_at = Set(Some(Utc::now().naive_utc()));
        model.last_login_ip = Set(Some(ip.clone()));
        let _ = model.update(db).await;

        audit(db, &admin.username, "LOGIN", None, Some("Успішний вхід".into()), Some(ip)).await;

        let mut response = Json(json!({
            "status": "ok",
            "role": admin.role,
            "username": admin.username,
            "privileges": session.privileges,
            "hours_active": hours,
        }))
        .into_response();
        response.extensions_mut().insert(session);
        return response;
    }

    state_read
        .kv
        .set(&format!("login:{ip}"), &(attempts + 1).to_string(), 3600)
        .await;
    let remaining = MAX_LOGIN_ATTEMPTS.saturating_sub(attempts + 1);
    audit(
        db,
        &username,
        "LOGIN_FAIL",
        None,
        Some("Невдала спроба входу".into()),
        Some(ip),
    )
    .await;

    (
        StatusCode::UNAUTHORIZED,
        Json(json!({"error": "Невірний пароль", "remaining_attempts": remaining})),
    )
        .into_response()
}

pub async fn admin_logout_action(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(mut session): Extension<CurrentSession>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Response {
    let ip = get_client_ip(&headers, &addr);
    if session.role > 0 {
        let db = &state.read().await.pool;
        let name = if session.username.is_empty() {
            format!("Role-{}", session.role)
        } else {
            session.username.clone()
        };
        audit(db, &name, "LOGOUT", None, None, Some(ip)).await;
    }
    session.role = 0;
    session.version = 1;
    session.admin_id = 0;
    session.username.clear();
    session.privileges = Privileges::none();
    session.hours_active = true;
    let mut response = Json(json!({"status": "logged_out"})).into_response();
    response.extensions_mut().insert(session);
    response
}

pub async fn api_check_admin(Extension(session): Extension<CurrentSession>) -> Response {
    Json(json!({
        "status": if session.role > 0 { "ok" } else { "guest" },
        "role": session.role,
        "username": session.username,
        "hours_active": session.hours_active,
        "privileges": session.privileges,
    }))
    .into_response()
}

pub async fn api_me_restriction(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Query(query): Query<RestrictionQuery>,
) -> Response {
    let state_read = state.read().await;
    let ip = get_client_ip(&headers, &addr);
    let restriction = match_restrictions(
        &state_read.pool,
        &ip,
        &session.id,
        query.board.as_deref(),
    )
    .await;
    Json(restriction).into_response()
}

pub async fn api_change_password(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(mut session): Extension<CurrentSession>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<PasswordPayload>,
) -> Response {
    let state_read = state.read().await;
    let db = &state_read.pool;
    let ip = get_client_ip(&headers, &addr);
    let admin = match load_actor(db, &session).await {
        Ok(a) => a,
        Err(r) => return r,
    };
    let current = match open_password(&state_read.password_crypto, &payload.current_enc) {
        Ok(p) => p,
        Err(r) => return r,
    };
    let new_password = match open_password(&state_read.password_crypto, &payload.new_password_enc) {
        Ok(p) => p,
        Err(r) => return r,
    };
    if hash_password(&current) != admin.service_key {
        return unauthorized("Невірний поточний пароль");
    }
    if let Err(msg) = validate_password_for(&new_password, Some(&admin.username)) {
        return bad_request(&msg);
    }
    let new_ver = admin.token_version + 1;
    let mut model: admins::ActiveModel = admin.clone().into();
    model.service_key = Set(hash_password(&new_password));
    model.token_version = Set(new_ver);
    if model.update(db).await.is_err() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Не вдалося змінити пароль" })),
        )
            .into_response();
    }
    session.version = new_ver;
    audit(db, &admin.username, "PASSWORD", None, Some("Змінено власний пароль".into()), Some(ip)).await;
    let mut response = Json(json!({ "status": "ok" })).into_response();
    response.extensions_mut().insert(session);
    response
}

pub async fn api_list_staff(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
) -> Response {
    if let Err(r) = require_priv(&session, session.privileges.manage_staff, "Немає права керувати персоналом") {
        return r;
    }
    let db = &state.read().await.pool;
    let rows = admins::Entity::find()
        .order_by_asc(admins::Column::Id)
        .all(db)
        .await
        .unwrap_or_default();
    Json(json!({ "data": rows.iter().map(staff_public_json).collect::<Vec<_>>() })).into_response()
}

pub async fn api_create_staff(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<CreateStaffPayload>,
) -> Response {
    if let Err(r) = require_priv(&session, session.privileges.manage_staff, "Немає права керувати персоналом") {
        return r;
    }
    let state_read = state.read().await;
    let db = &state_read.pool;
    let actor = match load_actor(db, &session).await {
        Ok(a) => a,
        Err(r) => return r,
    };
    let settings = load_settings(&state_read.kv).await;
    if let Err(r) = consume_rate_limit(&state_read.kv, &actor, &settings).await {
        return r;
    }
    let username = payload.username.trim().to_string();
    if username.len() < 2 {
        return bad_request("Імʼя закоротке");
    }
    if reserved_username(&username) {
        return bad_request("Імʼя admin зарезервоване");
    }
    if payload.role != ROLE_MOD && payload.role != ROLE_ADMIN {
        return bad_request("Можна призначити лише модератора або адміністратора");
    }
    let password = match open_password(&state_read.password_crypto, &payload.password_enc) {
        Ok(p) => p,
        Err(r) => return r,
    };
    if let Err(msg) = validate_password_for(&password, Some(&username)) {
        return bad_request(&msg);
    }
    if admins::Entity::find()
        .filter(admins::Column::Username.eq(&username))
        .one(db)
        .await
        .ok()
        .flatten()
        .is_some()
    {
        return bad_request("Таке імʼя вже зайняте");
    }
    let admin = admins::ActiveModel {
        username: Set(username.clone()),
        service_key: Set(hash_password(&password)),
        role: Set(payload.role),
        token_version: Set(1),
        privileges: Set("{}".into()),
        timezone: Set("Europe/Kyiv".into()),
        disabled: Set(false),
        created_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };
    match admin.insert(db).await {
        Ok(created) => {
            let ip = get_client_ip(&headers, &addr);
            audit(
                db,
                &actor.username,
                "STAFF_CREATE",
                Some(created.id.to_string()),
                Some(format!("role={}", payload.role)),
                Some(ip),
            )
            .await;
            Json(json!({ "status": "ok", "staff": staff_public_json(&created) })).into_response()
        }
        Err(_) => bad_request("Не вдалося створити обліковий запис"),
    }
}

pub async fn api_update_staff(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<i32>,
    Json(payload): Json<UpdateStaffPayload>,
) -> Response {
    if let Err(r) = require_priv(&session, session.privileges.manage_staff, "Немає права керувати персоналом") {
        return r;
    }
    let state_read = state.read().await;
    let db = &state_read.pool;
    let actor = match load_actor(db, &session).await {
        Ok(a) => a,
        Err(r) => return r,
    };
    let settings = load_settings(&state_read.kv).await;
    if let Err(r) = consume_rate_limit(&state_read.kv, &actor, &settings).await {
        return r;
    }
    let target = match admins::Entity::find_by_id(id).one(db).await.ok().flatten() {
        Some(t) => t,
        None => return (StatusCode::NOT_FOUND, Json(json!({ "error": "Не знайдено" }))).into_response(),
    };
    if is_super_admin(&target) {
        return forbidden("Супер-адміна не можна змінювати або обмежувати");
    }
    let mut model: admins::ActiveModel = target.clone().into();
    if let Some(role) = payload.role {
        if role != ROLE_MOD && role != ROLE_ADMIN {
            return bad_request("Неприпустимий рівень");
        }
        model.role = Set(role);
    }
    if let Some(ref privs) = payload.privileges {
        let mut clean = json!({});
        for key in ["hide", "delete", "ban", "view_ip"] {
            if let Some(v) = privs.get(key) {
                clean[key] = v.clone();
            }
        }
        model.privileges = Set(clean.to_string());
    }
    if let Some(v) = payload.work_start {
        model.work_start = Set(if v.is_empty() { None } else { Some(v) });
    }
    if let Some(v) = payload.work_end {
        model.work_end = Set(if v.is_empty() { None } else { Some(v) });
    }
    if let Some(v) = payload.timezone {
        if !v.is_empty() {
            model.timezone = Set(v);
        }
    }
    if let Some(v) = payload.rate_limit_per_hour {
        model.rate_limit_per_hour = Set(if v <= 0 { None } else { Some(v) });
    }
    if let Some(v) = payload.disabled {
        model.disabled = Set(v);
        if v {
            model.token_version = Set(target.token_version + 1);
        }
    }
    match model.update(db).await {
        Ok(updated) => {
            audit(
                db,
                &actor.username,
                "STAFF_UPDATE",
                Some(id.to_string()),
                Some("Оновлено обліковий запис персоналу".into()),
                Some(get_client_ip(&headers, &addr)),
            )
            .await;
            Json(json!({ "status": "ok", "staff": staff_public_json(&updated) })).into_response()
        }
        Err(_) => bad_request("Не вдалося оновити"),
    }
}

pub async fn api_reset_staff_password(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<i32>,
    Json(payload): Json<ResetPasswordPayload>,
) -> Response {
    if let Err(r) = require_priv(&session, session.privileges.manage_staff, "Немає права керувати персоналом") {
        return r;
    }
    let (db, crypto) = {
        let g = state.read().await;
        (g.pool.clone(), g.password_crypto.clone())
    };
    let actor = match load_actor(&db, &session).await {
        Ok(a) => a,
        Err(r) => return r,
    };
    let target = match admins::Entity::find_by_id(id).one(&db).await.ok().flatten() {
        Some(t) => t,
        None => return (StatusCode::NOT_FOUND, Json(json!({ "error": "Не знайдено" }))).into_response(),
    };
    if is_super_admin(&target) && target.id != actor.id {
        return forbidden("Пароль супер-адміна може змінити лише він сам");
    }
    let password = match open_password(&crypto, &payload.password_enc) {
        Ok(p) => p,
        Err(r) => return r,
    };
    if let Err(msg) = validate_password_for(&password, Some(&target.username)) {
        return bad_request(&msg);
    }
    let mut model: admins::ActiveModel = target.clone().into();
    model.service_key = Set(hash_password(&password));
    model.token_version = Set(target.token_version + 1);
    if model.update(&db).await.is_err() {
        return bad_request("Не вдалося змінити пароль");
    }
    audit(
        &db,
        &actor.username,
        "STAFF_PASSWORD",
        Some(id.to_string()),
        None,
        Some(get_client_ip(&headers, &addr)),
    )
    .await;
    Json(json!({ "status": "ok" })).into_response()
}

pub async fn api_delete_staff(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Response {
    if let Err(r) = require_priv(&session, session.privileges.manage_staff, "Немає права керувати персоналом") {
        return r;
    }
    let db = &state.read().await.pool;
    let actor = match load_actor(db, &session).await {
        Ok(a) => a,
        Err(r) => return r,
    };
    let target = match admins::Entity::find_by_id(id).one(db).await.ok().flatten() {
        Some(t) => t,
        None => return (StatusCode::NOT_FOUND, Json(json!({ "error": "Не знайдено" }))).into_response(),
    };
    if is_super_admin(&target) {
        return forbidden("Супер-адміна не можна видалити");
    }
    if admins::Entity::delete_by_id(id).exec(db).await.is_err() {
        return bad_request("Не вдалося видалити");
    }
    audit(
        db,
        &actor.username,
        "STAFF_DELETE",
        Some(id.to_string()),
        Some(target.username),
        Some(get_client_ip(&headers, &addr)),
    )
    .await;
    Json(json!({ "status": "ok" })).into_response()
}

pub async fn api_get_settings(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
) -> Response {
    if let Err(r) = require_staff(&session) {
        return r;
    }
    let kv = &state.read().await.kv;
    Json(load_settings(kv).await).into_response()
}

pub async fn api_put_settings(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<SettingsPayload>,
) -> Response {
    if let Err(r) = require_priv(&session, session.privileges.manage_staff, "Немає права змінювати налаштування") {
        return r;
    }
    let state_read = state.read().await;
    let mut settings = load_settings(&state_read.kv).await;
    if let Some(v) = payload.default_rate_limit_per_hour {
        settings.default_rate_limit_per_hour = v;
    }
    if let Some(v) = payload.default_work_start {
        settings.default_work_start = if v.is_empty() { None } else { Some(v) };
    }
    if let Some(v) = payload.default_work_end {
        settings.default_work_end = if v.is_empty() { None } else { Some(v) };
    }
    if let Some(v) = payload.timezone {
        if !v.is_empty() {
            settings.timezone = v;
        }
    }
    save_settings(&state_read.kv, &settings).await;
    audit(
        &state_read.pool,
        &session.username,
        "SETTINGS",
        None,
        Some("Оновлено глобальні налаштування персоналу".into()),
        Some(get_client_ip(&headers, &addr)),
    )
    .await;
    Json(json!({ "status": "ok", "settings": settings })).into_response()
}

pub async fn api_hide_content(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<HidePayload>,
) -> Response {
    if let Err(r) = require_priv(&session, session.privileges.hide, "Немає права приховувати контент") {
        return r;
    }
    let state_read = state.read().await;
    let db = &state_read.pool;
    let actor = match load_actor(db, &session).await {
        Ok(a) => a,
        Err(r) => return r,
    };
    let settings = load_settings(&state_read.kv).await;
    if let Err(r) = consume_rate_limit(&state_read.kv, &actor, &settings).await {
        return r;
    }

    let mut board_slug: Option<String> = None;
    let mut thread_id: Option<i32> = None;

    if payload.type_ == "post" {
        if let Ok(Some(post)) = posts::Entity::find_by_id(payload.id).one(db).await {
            thread_id = Some(post.thread_id);
            if let Ok(Some(t)) = threads::Entity::find_by_id(post.thread_id).one(db).await {
                board_slug = Some(t.board_slug);
            }
            let mut model: posts::ActiveModel = post.into();
            model.is_hidden = Set(payload.hidden);
            let _ = model.update(db).await;
        }
    } else if let Ok(Some(t)) = threads::Entity::find_by_id(payload.id).one(db).await {
        board_slug = Some(t.board_slug.clone());
        thread_id = Some(t.id);
        let mut model: threads::ActiveModel = t.into();
        model.is_hidden = Set(payload.hidden);
        let _ = model.update(db).await;
    }

    state_read.db_cache.invalidate("home_view").await;
    if let Some(slug) = &board_slug {
        state_read.db_cache.invalidate(&format!("board_{slug}")).await;
    }
    if let Some(tid) = thread_id {
        state_read.db_cache.invalidate(&format!("thread_{tid}")).await;
    }

    audit(
        db,
        &actor.username,
        if payload.hidden { "HIDE" } else { "UNHIDE" },
        Some(format!("{}:{}", payload.type_, payload.id)),
        None,
        Some(get_client_ip(&headers, &addr)),
    )
    .await;
    Json(json!({ "status": "ok" })).into_response()
}

pub async fn api_list_bans(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
) -> Response {
    if let Err(r) = require_staff(&session) {
        return r;
    }
    let db = &state.read().await.pool;
    let now = Utc::now().naive_utc();
    let rows = bans::Entity::find()
        .filter(bans::Column::ExpiresAt.gt(now))
        .order_by_desc(bans::Column::CreatedAt)
        .all(db)
        .await
        .unwrap_or_default();
    Json(json!({ "data": rows })).into_response()
}

pub async fn api_ban_preview(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    Json(payload): Json<BanPreviewPayload>,
) -> Response {
    if let Err(r) = require_priv(&session, session.privileges.ban, "Немає права банити") {
        return r;
    }
    let _ = state;
    match preview_cidr(&payload.cidr).await {
        Ok(preview) => Json(preview).into_response(),
        Err(msg) => bad_request(&msg),
    }
}

pub async fn api_unban(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(payload): Json<UnbanPayload>,
) -> Response {
    if let Err(r) = require_priv(&session, session.privileges.ban, "Немає права банити") {
        return r;
    }
    let state_read = state.read().await;
    let db = &state_read.pool;
    let actor = match load_actor(db, &session).await {
        Ok(a) => a,
        Err(r) => return r,
    };
    if bans::Entity::delete_by_id(payload.id).exec(db).await.is_err() {
        return bad_request("Не вдалося зняти бан");
    }
    audit(
        db,
        &actor.username,
        "UNBAN",
        Some(payload.id.to_string()),
        None,
        Some(get_client_ip(&headers, &addr)),
    )
    .await;
    Json(json!({ "status": "ok" })).into_response()
}

pub async fn prepare_ban_fields(payload_ip: &str) -> Result<(String, Option<String>), String> {
    let net = parse_cidr(payload_ip)?;
    let cidr = net.to_string();
    let ip = net.network().to_string();
    Ok((ip, Some(cidr)))
}

pub fn actor_name(session: &CurrentSession) -> String {
    if session.username.is_empty() {
        format!("Role-{}", session.role)
    } else {
        session.username.clone()
    }
}

pub async fn guard_action(
    state: &AppState,
    session: &CurrentSession,
    allowed: bool,
    msg: &str,
) -> Result<admins::Model, Response> {
    require_priv(session, allowed, msg)?;
    let admin = load_actor(&state.pool, session).await?;
    let settings = load_settings(&state.kv).await;
    consume_rate_limit(&state.kv, &admin, &settings).await?;
    Ok(admin)
}
