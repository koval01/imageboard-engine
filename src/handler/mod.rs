use axum::{
    response::{Html, IntoResponse, Response},
    http::StatusCode,
};
use askama::Template;

pub mod middleware;
pub mod board;

#[derive(Template)]
#[template(path = "layout/error.html")]
struct ErrorTemplate {
    message: String,
}

pub struct HtmlTemplate<T>(pub T);

impl<T> IntoResponse for HtmlTemplate<T>
where
    T: Template,
{
    fn into_response(self) -> Response {
        match self.0.render() {
            Ok(html) => Html(html).into_response(),
            Err(err) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Template error: {}", err),
            )
                .into_response(),
        }
    }
}