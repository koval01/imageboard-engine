use std::sync::Arc;

use axum::{
    body::Body,
    extract::{Extension, State},
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use tokio::sync::RwLock;

use crate::{
    handler::middleware::CurrentSession,
    model::admins,
    service::{ROLE_SUPER, SUPER_USERNAME},
    AppState,
};

async fn super_admin_exists(state: &AppState) -> bool {
    admins::Entity::find()
        .filter(admins::Column::Role.eq(ROLE_SUPER))
        .one(&state.pool)
        .await
        .ok()
        .flatten()
        .is_some()
}

pub async fn admin_entry(
    State(state): State<Arc<RwLock<AppState>>>,
    Extension(session): Extension<CurrentSession>,
) -> Response {
    let guard = state.read().await;
    if session.role >= 1 {
        return serve_admin_spa(&guard).await;
    }
    let setup = !super_admin_exists(&guard).await;
    serve_gate(&guard, setup)
}

async fn serve_admin_spa(state: &AppState) -> Response {
    let index = format!("{}/index.html", state.config.admin_dist);
    match tokio::fs::read_to_string(&index).await {
        Ok(html) => {
            let pk = state.password_crypto.public_hex();
            let html = if html.contains("__PW_PK__") {
                html.replace("__PW_PK__", &pk)
            } else {
                let boot = format!(
                    "<script>window.__PW_PK__={};</script></head>",
                    serde_json::to_string(&pk).unwrap_or_else(|_| "\"\"".into())
                );
                html.replacen("</head>", &boot, 1)
            };
            html_response(html)
        }
        Err(_) => (
            StatusCode::SERVICE_UNAVAILABLE,
            "Адмін-панель недоступна",
        )
            .into_response(),
    }
}

fn serve_gate(state: &AppState, setup: bool) -> Response {
    let pk = state.password_crypto.public_hex();
    let mode = if setup { "setup" } else { "login" };
    html_response(gate_html(mode, &pk))
}

pub async fn admin_gate_js(State(state): State<Arc<RwLock<AppState>>>) -> Response {
    let path = state.read().await.config.admin_gate_js.clone();
    match tokio::fs::read(&path).await {
        Ok(bytes) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "application/javascript; charset=utf-8")
            .header(header::CACHE_CONTROL, "no-store")
            .header("X-Content-Type-Options", "nosniff")
            .body(Body::from(bytes))
            .unwrap(),
        Err(_) => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, "application/javascript; charset=utf-8")
            .header(header::CACHE_CONTROL, "no-store")
            .body(Body::from("// gate unavailable"))
            .unwrap(),
    }
}

fn html_response(html: String) -> Response {
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .header("Referrer-Policy", "same-origin")
        .body(Body::from(html))
        .unwrap()
}

pub fn no_store_cache() -> HeaderValue {
    HeaderValue::from_static("private, no-store")
}

fn gate_html(mode: &str, pk_hex: &str) -> String {
    let (title, heading, blurb) = if mode == "setup" {
        (
            "Перший запуск",
            "Перший запуск",
            "Створіть супер-адміна. Імʼя <strong>admin</strong> зафіксоване і не змінюється.",
        )
    } else {
        (
            "Вхід",
            "Вхід для адміністратора",
            "Обліковий запис персоналу.",
        )
    };
    format!(
        r##"<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{title} — Криївка</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg"/>
<style>
:root {{ color-scheme: dark; --bg:#15202b; --fg:#ccc; --card:#1c2a38; --border:#3a4a58; --input:#2a3846; --muted:#7d8a96; --primary:#c45c14; --pri-fg:#fff; --err:#c44; }}
html,body {{ margin:0; min-height:100%; background:var(--bg); color:var(--fg); font:15px/1.4 "Trebuchet MS","PT Sans",sans-serif; }}
.wrap {{ min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }}
.card {{ width:100%; max-width:28rem; background:var(--card); border:1px solid var(--border); border-radius:8px; padding:2rem; }}
h1 {{ margin:0 0 .5rem; font-size:1.5rem; text-align:center; }}
.blurb {{ color:var(--muted); font-size:.875rem; text-align:center; margin:0 0 1.5rem; }}
input,button {{ font:inherit; box-sizing:border-box; }}
input {{ width:100%; padding:.5rem; margin-bottom:.75rem; border:1px solid var(--border); border-radius:4px; background:var(--input); color:var(--fg); }}
input:disabled {{ opacity:.7; }}
button {{ width:100%; padding:.6rem; border:0; border-radius:4px; background:var(--primary); color:var(--pri-fg); cursor:pointer; }}
button:disabled {{ opacity:.5; cursor:not-allowed; }}
.err {{ color:var(--err); font-size:.875rem; min-height:1.25rem; margin:.5rem 0; }}
.rules {{ font-size:.75rem; color:var(--muted); display:grid; grid-template-columns:1fr 1fr; gap:.15rem .75rem; margin:.25rem 0 1rem; }}
.rules .ok {{ color:#6c6; }}
.rules .bad {{ color:var(--err); }}
a {{ color:var(--primary); }}
</style>
</head>
<body data-mode="{mode}" data-pk="{pk_hex}" data-user="{super_user}">
<div class="wrap">
  <div class="card">
    <h1>{heading}</h1>
    <p class="blurb">{blurb}</p>
    <form id="gate-form">
      <input name="username" type="text" value="{super_user}" placeholder="Імʼя..." autocomplete="username" aria-label="Імʼя" {user_attrs}/>
      <input name="password" type="password" placeholder="Пароль..." autocomplete="{pw_auto}" aria-label="Пароль" minlength="13" autofocus/>
      {confirm}
      <div id="rules" class="rules" hidden></div>
      <p class="err" id="err" role="alert"></p>
      <button type="submit" id="go">{submit}</button>
    </form>
  </div>
</div>
<script src="/admin/gate.js" defer></script>
</body>
</html>
"##,
        title = title,
        heading = heading,
        blurb = blurb,
        mode = mode,
        pk_hex = pk_hex,
        super_user = SUPER_USERNAME,
        user_attrs = if mode == "setup" {
            "disabled readOnly"
        } else {
            ""
        },
        pw_auto = if mode == "setup" { "new-password" } else { "current-password" },
        confirm = if mode == "setup" {
            r#"<input name="password2" type="password" placeholder="Повторіть пароль..." autocomplete="new-password" aria-label="Повторіть пароль" minlength="13"/>"#
        } else {
            ""
        },
        submit = if mode == "setup" {
            "Створити супер-адміна"
        } else {
            "Увійти"
        },
    )
}
