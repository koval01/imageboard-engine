use ammonia::Builder;
use html_escape::decode_html_entities;
use std::collections::HashSet;

pub const MAX_POST_CHARS: usize = 15_000;
pub const MAX_SUBJECT_CHARS: usize = 200;
pub const MAX_REASON_CHARS: usize = 500;
pub const MAX_FILENAME_CHARS: usize = 80;
pub const MAX_EXIF_CHARS: usize = 200;
pub const MAX_TEXT_BYTES: usize = 64 * 1024;

fn strip_controls(s: &str, keep_newlines: bool) -> String {
    s.chars()
        .filter(|c| {
            if *c == '\0' {
                return false;
            }
            if keep_newlines && matches!(*c, '\n' | '\r' | '\t') {
                return true;
            }
            !c.is_control()
        })
        .collect()
}

fn strip_html(input: &str) -> String {
    let cleaned = Builder::default()
        .tags(HashSet::new())
        .generic_attributes(HashSet::new())
        .url_schemes(HashSet::new())
        .clean(input)
        .to_string();
    decode_html_entities(&cleaned).into_owned()
}

fn truncate_chars(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

/// Strip HTML/XSS payloads, keep BBCode and plain text, enforce length.
pub fn sanitize_post_body(raw: &str) -> String {
    let s = strip_controls(raw, true);
    let s = strip_html(&s);
    let s = s.replace("\r\n", "\n").replace('\r', "\n");
    let s = crate::service::filter_user_text(&s);
    truncate_chars(&s, MAX_POST_CHARS)
}

pub fn sanitize_subject(raw: &str) -> Option<String> {
    let s = strip_controls(raw, false);
    let s = strip_html(&s);
    let s = crate::service::filter_user_text(&s);
    let s = truncate_chars(s.trim(), MAX_SUBJECT_CHARS);
    if s.is_empty() { None } else { Some(s) }
}

pub fn sanitize_reason(raw: &str) -> String {
    let s = strip_controls(raw, false);
    let s = strip_html(&s);
    let s = crate::service::filter_user_text(&s);
    truncate_chars(s.trim(), MAX_REASON_CHARS)
}

pub fn sanitize_exif_value(raw: &str) -> String {
    let s = strip_controls(raw, false);
    let s = strip_html(&s);
    truncate_chars(s.trim(), MAX_EXIF_CHARS)
}

pub fn sanitize_filename(raw: &str) -> String {
    let base = raw.replace('\\', "/");
    let base = base.rsplit('/').next().unwrap_or("image");
    let mut out = String::new();
    for c in base.chars() {
        if out.chars().count() >= MAX_FILENAME_CHARS {
            break;
        }
        if c.is_alphanumeric() || matches!(c, '.' | '-' | '_') {
            out.push(c);
        }
    }
    let out = out.trim_matches('.').to_string();
    if out.is_empty() {
        return "image.webp".into();
    }
    let ext = out
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    if matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "gif" | "webp") {
        out
    } else {
        format!("{out}.webp")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_script_and_keeps_text() {
        let out = sanitize_post_body("<script>alert(1)</script>привіт");
        assert!(!out.to_lowercase().contains("<script"));
        assert!(!out.contains('<'));
        assert!(out.contains("привіт"));
    }

    #[test]
    fn keeps_bbcode() {
        assert_eq!(sanitize_post_body("[b]жирний[/b]"), "[b]жирний[/b]");
    }

    #[test]
    fn strips_img_onerror() {
        let out = sanitize_post_body("<img src=x onerror=alert(1)>ok");
        assert!(!out.to_lowercase().contains("onerror"));
        assert!(out.contains("ok"));
    }

    #[test]
    fn filename_drops_path() {
        assert_eq!(sanitize_filename("../../etc/passwd"), "passwd.webp");
        assert_eq!(sanitize_filename("pic.PNG"), "pic.PNG");
        assert_eq!(sanitize_filename("<script>.jpg"), "script.jpg");
    }

    #[test]
    fn subject_none_when_empty_html() {
        assert!(sanitize_subject("<b></b>").is_none());
    }
}
