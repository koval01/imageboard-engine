mod auth_handler;
mod middleware;
mod todo_handler;

pub use auth_handler::{
    handler_404, home_handler, login_page_handler, login_user_handler, logout_handler,
    register_page_handler, register_user_handler,
};
pub use middleware::auth_middleware;
pub use todo_handler::{
    todo_add_handler, todo_create_handler, todo_delete_handler, todo_edit_handler,
    todo_list_handler, todo_patch_handler,
};

use askama::Template;
use axum::{
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    Json,
};
use axum_messages::Messages;
use chrono::{Local, NaiveDateTime, TimeZone};
use chrono_tz::{Tz, UTC};
use tower_sessions::Session;
use crate::model::Todo;

const FROM_PROTECTED_KEY: &str = "from_protected";
const TZONE_KEY: &str = "time_zone";

pub async fn health_checker_handler() -> impl IntoResponse {
    let json_response = serde_json::json!({
        "status": "success",
        "message": "Full stack Web App using Rust's Axum framework, Askama, HTMX, JWT & SQLITE3"
    });

    Json(json_response)
}

async fn set_flag_in_session(session: &Session, from_protected: bool) {
    session
        .insert(FROM_PROTECTED_KEY, from_protected)
        .await
        .unwrap();
}

async fn set_tzone_in_session(session: &Session, tzone: String) {
    session.insert(TZONE_KEY, tzone).await.unwrap();
}

fn get_messages(messages: Messages) -> (String, String) {
    let mut messages_str = messages
        .into_iter()
        .map(|message| format!("{}: {}", message.level, message))
        .collect::<Vec<_>>()
        .join(", ");
    let mut messages_status = String::new();

    if !messages_str.is_empty() {
        if messages_str.contains("Success") {
            messages_status = messages_str[..7].to_string();
            messages_str = messages_str[9..].to_string();
        } else if messages_str.contains("Error") {
            messages_status = messages_str[..5].to_string();
            messages_str = messages_str[7..].to_string();
        }
    }

    (messages_status, messages_str)
}

pub fn convert_datetime(tzone: &str, dt: NaiveDateTime) -> String {
    let tz = tzone.parse::<Tz>().unwrap_or(UTC);
    let converted = Local.from_utc_datetime(&dt);
    let dttz = converted.with_timezone(&tz).to_rfc2822();

    let chars = dttz.chars().collect::<Vec<_>>();
    let first_part = chars[5..22].iter().collect::<String>();
    let last_part = chars[25..].iter().collect::<String>();

    format!("{}{}", first_part, last_part)
}

struct HtmlTemplate<T>(T);

impl<T> IntoResponse for HtmlTemplate<T>
where
    T: Template,
{
    fn into_response(self) -> Response {
        match self.0.render() {
            Ok(html) => Html(html).into_response(),
            Err(err) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to render template. Error: {}", err),
            )
                .into_response(),
        }
    }
}

#[derive(Default, Template)]
#[template(path = "auth/home.html")]
struct HomeTemplate {
    title: String,
    username: String,
    messages_status: String,
    messages: String,
    from_protected: bool,
    is_error: bool,
}

#[derive(Default, Template)]
#[template(path = "auth/register.html")]
struct RegisterTemplate {
    title: String,
    username: String,
    messages_status: String,
    messages: String,
    from_protected: bool,
    is_error: bool,
}

#[derive(Default, Template)]
#[template(path = "auth/login.html")]
struct LoginTemplate {
    title: String,
    username: String,
    messages_status: String,
    messages: String,
    from_protected: bool,
    is_error: bool,
}

#[derive(Default, Template)]
#[template(path = "todos/todo_list.html")]
struct TodoListTemplate {
    title: String,
    title_page: String,
    username: String,
    todos: Vec<Todo>,
    messages_status: String,
    messages: String,
    from_protected: bool,
    is_error: bool,
}

#[derive(Default, Template)]
#[template(path = "partials/todo_creation_modal.html")]
struct TodoCreationModalTemplate;

#[derive(Default, Template)]
#[template(path = "partials/todo_update_modal.html")]
struct TodoUpdateModalTemplate {
    todo: Todo,
    datetime: String,
    is_error: bool,
    reason: String,
}

#[derive(Default, Template)]
#[template(path = "error/error_400.html")]
struct Error400Template {
    title: String,
    username: String,
    reason: String,
    messages_status: String,
    messages: String,
    from_protected: bool,
    is_error: bool,
}

#[derive(Default, Template)]
#[template(path = "error/error_401.html")]
struct Error401Template {
    title: String,
    username: String,
    reason: String,
    messages_status: String,
    messages: String,
    from_protected: bool,
    is_error: bool,
}

#[derive(Default, Template)]
#[template(path = "error/error_404.html")]
struct Error404Template {
    title: String,
    username: String,
    reason: String,
    link: String,
    messages_status: String,
    messages: String,
    from_protected: bool,
    is_error: bool,
}

#[derive(Default, Template)]
#[template(path = "error/error_500.html")]
struct Error500Template {
    title: String,
    username: String,
    reason: String,
    link: String,
    messages_status: String,
    messages: String,
    from_protected: bool,
    is_error: bool,
}
