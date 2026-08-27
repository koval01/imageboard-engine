use regex::Regex;
use rustrict::{CensorStr, Type};
use std::collections::HashSet;
use std::sync::OnceLock;

pub const LINK_REMOVED: &str = "[посилання видалено]";
pub const EMAIL_REMOVED: &str = "[пошта видалено]";
pub const PHONE_REMOVED: &str = "[телефон видалено]";

const MULTI_SUFFIX: &[&str] = &[
    "ac.uk", "co.uk", "gov.uk", "ltd.uk", "me.uk", "net.uk", "org.uk", "plc.uk",
    "com.au", "net.au", "org.au", "edu.au", "gov.au",
    "co.jp", "or.jp", "ne.jp", "ac.jp", "go.jp",
    "co.kr", "or.kr", "ne.kr", "go.kr", "ac.kr",
    "co.nz", "net.nz", "org.nz", "govt.nz", "ac.nz",
    "co.in", "net.in", "org.in", "gov.in", "ac.in", "res.in",
    "com.br", "net.br", "org.br", "gov.br",
    "com.mx", "org.mx", "gob.mx",
    "com.ar", "org.ar", "gob.ar",
    "com.tr", "org.tr", "gov.tr",
    "co.za", "org.za", "gov.za", "ac.za",
    "com.tw", "org.tw", "gov.tw",
    "com.hk", "org.hk", "gov.hk",
    "com.sg", "org.sg", "gov.sg", "edu.sg",
    "com.ua", "org.ua", "net.ua", "gov.ua", "in.ua", "edu.ua",
    "co.il", "org.il", "gov.il", "ac.il",
    "com.pl", "org.pl", "gov.pl",
    "com.cn", "org.cn", "gov.cn", "edu.cn",
    "com.vn", "gov.vn",
];

const ALLOWED_GTLD: &[&str] = &["com", "net", "org", "gov", "edu", "mil", "int", "bank"];

/// Registrable (eTLD+1) hosts that may be linked without a warning.
const TRUSTED_HOSTS: &[&str] = &[
    "kryivka.org",
    "google.com", "google.com.ua", "google.co.uk", "google.de", "google.fr", "google.pl",
    "youtube.com", "youtu.be", "gmail.com", "googleapis.com", "gstatic.com",
    "github.com", "githubusercontent.com", "gitlab.com", "bitbucket.org", "codeberg.org",
    "microsoft.com", "live.com", "outlook.com", "office.com", "office365.com", "xbox.com",
    "bing.com", "linkedin.com",
    "apple.com", "icloud.com", "itunes.com",
    "amazon.com", "amazon.co.uk", "amazon.de", "aws.amazon.com",
    "cloudflare.com", "workers.dev",
    "mozilla.org", "firefox.com", "mdn.dev",
    "wikipedia.org", "wikimedia.org", "mediawiki.org",
    "stackoverflow.com", "stackexchange.com", "serverfault.com", "superuser.com", "askubuntu.com",
    "reddit.com", "ycombinator.com",
    "twitter.com", "x.com", "facebook.com", "instagram.com", "whatsapp.com", "messenger.com",
    "telegram.org", "t.me", "discord.com", "discord.gg", "twitch.tv",
    "netflix.com", "spotify.com", "vimeo.com", "dailymotion.com",
    "dropbox.com", "box.com", "adobe.com",
    "oracle.com", "ibm.com", "intel.com", "nvidia.com", "amd.com",
    "docker.com", "kubernetes.io", "cncf.io", "linuxfoundation.org",
    "rust-lang.org", "crates.io", "docs.rs",
    "npmjs.com", "nodejs.org", "python.org", "pypi.org", "golang.org", "go.dev",
    "debian.org", "ubuntu.com", "canonical.com", "kernel.org", "gnu.org", "fsf.org",
    "apache.org", "ietf.org", "w3.org", "iana.org", "icann.org", "letsencrypt.org",
    "vercel.com", "netlify.com", "heroku.com", "digitalocean.com", "linode.com",
    "ovh.com", "hetzner.com", "fastly.com", "akamai.com", "jsdelivr.net", "unpkg.com",
    "jquery.com", "react.dev", "reactjs.org", "vuejs.org", "angular.io", "typescriptlang.org",
    "bbc.com", "bbc.co.uk", "reuters.com", "apnews.com", "nytimes.com", "theguardian.com",
    "cnn.com", "dw.com", "aljazeera.com", "npr.org", "wsj.com", "ft.com", "economist.com",
    "nature.com", "sciencemag.org", "nih.gov", "who.int", "un.org", "europa.eu",
    "nasa.gov", "noaa.gov", "cdc.gov", "gov.uk", "gov.ua", "usa.gov", "whitehouse.gov",
    "archive.org", "archive.ph", "archive.is", "web.archive.org",
    "paypal.com", "stripe.com", "visa.com", "mastercard.com",
    "zoom.us", "slack.com", "notion.so", "figma.com", "canva.com",
    "imdb.com", "rottentomatoes.com", "metacritic.com",
    "steamcommunity.com", "steampowered.com", "epicgames.com",
    "ukr.net", "pravda.com.ua", "liga.net", "unian.net", "lb.ua", "espreso.tv",
    "suspilne.media", "radiosvoboda.org", "nv.ua", "censor.net", "epravda.com.ua",
    "kyivindependent.com", "kyivpost.com", "mil.gov.ua", "president.gov.ua", "kmu.gov.ua",
    "mon.gov.ua", "moz.gov.ua", "bank.gov.ua", "rada.gov.ua",
];

const TRUSTED_BRANDS: &[&str] = &[
    "google", "youtube", "gmail", "microsoft", "github", "gitlab", "apple", "icloud",
    "amazon", "cloudflare", "mozilla", "wikipedia", "wikimedia", "facebook", "instagram",
    "whatsapp", "twitter", "linkedin", "reddit", "netflix", "spotify", "adobe", "oracle",
    "nvidia", "intel", "docker", "python", "nodejs", "debian", "ubuntu", "paypal", "stripe",
    "bbc", "reuters", "nytimes", "theguardian", "nasa", "nih",
];

const BLOCKED_HOSTS: &[&str] = &[
    "bit.ly", "t.co", "tinyurl.com", "goo.gl", "ow.ly", "is.gd", "buff.ly", "cutt.ly",
    "rb.gy", "tiny.cc", "shorturl.at", "rebrand.ly", "lnkd.in", "spoti.fi", "adf.ly",
    "bc.vc", "soo.gd", "s.id", "v.gd", "qr.ae", "bl.ink",
];

const PROFANE_EXTRA: &[&str] = &[
    "бля", "блять", "блядь", "бляд", "сука", "сучара", "хуй", "хуя", "хує", "хуйов",
    "нахуй", "нахуя", "пізд", "пизд", "піздєц", "пиздец", "єб", "ебать", "ёб", "ёба",
    "йоб", "йоба", "мудак", "мудил", "підар", "пидор", "підор", "педик", "чмо",
    "гнида", "дроч", "залуп", "шлюх", "падл", "тварю", "уйобок", "уебок", "долбоёб",
    "долбоеб", "виїб", "впизд", "срат", "говно", "гівно", "мразь", "мразот",
];

#[derive(Clone, Copy)]
enum HitKind {
    Email,
    Phone,
    DangerScheme,
    Link,
}

struct Hit {
    start: usize,
    end: usize,
    kind: HitKind,
}

fn set(words: &[&'static str]) -> HashSet<&'static str> {
    words.iter().copied().collect()
}

fn trusted_hosts() -> &'static HashSet<&'static str> {
    static S: OnceLock<HashSet<&'static str>> = OnceLock::new();
    S.get_or_init(|| set(TRUSTED_HOSTS))
}

fn trusted_brands() -> &'static HashSet<&'static str> {
    static S: OnceLock<HashSet<&'static str>> = OnceLock::new();
    S.get_or_init(|| set(TRUSTED_BRANDS))
}

fn blocked_hosts() -> &'static HashSet<&'static str> {
    static S: OnceLock<HashSet<&'static str>> = OnceLock::new();
    S.get_or_init(|| set(BLOCKED_HOSTS))
}

fn extra_profane() -> &'static HashSet<String> {
    static S: OnceLock<HashSet<String>> = OnceLock::new();
    S.get_or_init(|| PROFANE_EXTRA.iter().map(|w| (*w).to_string()).collect())
}

fn re(pat: &'static str) -> Regex {
    Regex::new(pat).expect("content-filter regex")
}

/// Strip zero-width / soft-hyphen camouflage and undo common link disguises.
pub fn normalize_obfuscation(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for c in input.chars() {
        if matches!(c, '\u{200B}' | '\u{200C}' | '\u{200D}' | '\u{FEFF}' | '\u{00AD}' | '\u{2060}') {
            continue;
        }
        let mapped = match c {
            '。' | '．' | '｡' => '.',
            '＠' => '@',
            '／' => '/',
            '：' => ':',
            _ => c,
        };
        out.push(mapped);
    }
    let s = re(r"(?i)\[\s*(?:dot|\.)\s*\]").replace_all(&out, ".");
    let s = re(r"(?i)\(\s*(?:dot|\.)\s*\)").replace_all(&s, ".");
    let s = re(r"(?i)\{\s*(?:dot|\.)\s*\}").replace_all(&s, ".");
    let s = re(r"(?i)\[\s*at\s*\]").replace_all(&s, "@");
    let s = re(r"(?i)\(\s*at\s*\)").replace_all(&s, "@");
    let s = re(r"(?i)\bhxxp(s?)\b").replace_all(&s, "http$1");
    let s = re(r"(?i)([a-z0-9])\s*\.\s*([a-z0-9])").replace_all(&s, "$1.$2");
    s.into_owned()
}

fn puny_host(host: &str) -> String {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    match idna::domain_to_unicode(&host) {
        (unicode, Ok(())) => unicode,
        _ => host,
    }
}

fn is_ipv4(host: &str) -> bool {
    let parts: Vec<&str> = host.split('.').collect();
    parts.len() == 4 && parts.iter().all(|p| p.parse::<u8>().is_ok())
}

fn etld1(host: &str) -> String {
    let host = puny_host(host);
    if is_ipv4(&host) || host.contains(':') {
        return host;
    }
    let labels: Vec<&str> = host.split('.').filter(|s| !s.is_empty()).collect();
    if labels.len() < 2 {
        return host;
    }
    let last2 = format!("{}.{}", labels[labels.len() - 2], labels[labels.len() - 1]);
    if MULTI_SUFFIX.iter().any(|s| *s == last2) && labels.len() >= 3 {
        return format!("{}.{last2}", labels[labels.len() - 3]);
    }
    last2
}

fn tld_allowed(host_etld1: &str) -> bool {
    if MULTI_SUFFIX.iter().any(|s| host_etld1 == *s || host_etld1.ends_with(&format!(".{s}"))) {
        return true;
    }
    let last = host_etld1.rsplit('.').next().unwrap_or("");
    if last.len() == 2 && last.bytes().all(|b| b.is_ascii_alphabetic()) {
        return true;
    }
    ALLOWED_GTLD.iter().any(|t| *t == last)
}

enum LinkClass {
    Trusted,
    Warn,
    Remove,
}

fn classify_host(host: &str) -> LinkClass {
    let host = puny_host(host).trim_start_matches("www.").to_string();
    if host.is_empty() || is_ipv4(&host) || host.contains(':') {
        return LinkClass::Remove;
    }
    let e = etld1(&host);
    if blocked_hosts().contains(e.as_str()) {
        return LinkClass::Remove;
    }
    if trusted_hosts().contains(e.as_str()) {
        return LinkClass::Trusted;
    }
    let brand = e.split('.').next().unwrap_or("");
    if trusted_brands().contains(brand) && tld_allowed(&e) {
        return LinkClass::Trusted;
    }
    if tld_allowed(&e) {
        return LinkClass::Warn;
    }
    LinkClass::Remove
}

fn host_of(urlish: &str) -> Option<String> {
    let mut s = urlish.trim();
    s = s.trim_end_matches(|c: char| {
        matches!(c, '.' | ',' | ';' | ':' | ')' | ']' | '!' | '?' | '\'' | '"')
    });
    s = s.trim_start_matches(|c: char| matches!(c, '(' | '[' | '<' | '"' | '\''));
    let rest = s
        .strip_prefix("https://")
        .or_else(|| s.strip_prefix("http://"))
        .or_else(|| s.strip_prefix("//"))
        .unwrap_or(s);
    let host = rest.split(['/', '?', '#']).next().unwrap_or(rest);
    let host = host.split('@').next_back().unwrap_or(host);
    let host = host.split(':').next().unwrap_or(host);
    if host.is_empty() || !host.contains('.') {
        return None;
    }
    Some(host.to_string())
}

fn to_href(raw: &str) -> Option<String> {
    let mut s = raw.trim().to_string();
    s = s
        .trim_end_matches(|c: char| matches!(c, '.' | ',' | ';' | ')' | ']' | '!' | '?' | '\'' | '"'))
        .to_string();
    if s.starts_with("//") {
        s = format!("https:{s}");
    } else if !s.starts_with("http://") && !s.starts_with("https://") {
        s = format!("https://{s}");
    }
    if !(s.starts_with("https://") || s.starts_with("http://")) {
        return None;
    }
    host_of(&s)?;
    Some(s)
}

fn protected_ranges(s: &str) -> Vec<(usize, usize)> {
    let mut ranges = Vec::new();
    for (open, close) in [
        ("[url]", "[/url]"),
        ("[urlw]", "[/urlw]"),
        ("[mask]", "[/mask]"),
    ] {
        let mut from = 0;
        while let Some(i) = s[from..].find(open) {
            let start = from + i;
            let inner = start + open.len();
            if let Some(j) = s[inner..].find(close) {
                let end = inner + j + close.len();
                ranges.push((start, end));
                from = end;
            } else {
                break;
            }
        }
    }
    ranges
}

fn covered(ranges: &[(usize, usize)], start: usize, end: usize) -> bool {
    ranges.iter().any(|(a, b)| start >= *a && end <= *b)
}

fn digit_count(s: &str) -> usize {
    s.chars().filter(|c| c.is_ascii_digit()).count()
}

fn collect_hits(s: &str) -> Vec<Hit> {
    let protected = protected_ranges(s);
    let mut hits = Vec::new();

    let email = re(r"(?i)[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,24}");
    let phone = re(r"(?:(?:\+|00)\d{1,3}[\s\-.]?)?(?:\(?\d{2,4}\)?[\s\-.]?){2,4}\d{2,4}");
    let danger = re(r"(?i)(?:javascript|data|vbscript|file):[^\s]+");
    let url = re(
        r"(?ix)
        (?:https?://[^\s<>\[\]\{\}]+)
        | (?:www\.(?:[a-z0-9\-]+\.)+[a-z]{2,24}(?::\d{2,5})?(?:/[^\s<>\[\]\{\}]*)?)
        | (?:[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?\.)+[a-z]{2,24}(?::\d{2,5})?(?:/[^\s<>\[\]\{\}]*)?",
    );

    for cap in email.find_iter(s) {
        if !covered(&protected, cap.start(), cap.end()) {
            hits.push(Hit { start: cap.start(), end: cap.end(), kind: HitKind::Email });
        }
    }
    for cap in danger.find_iter(s) {
        if !covered(&protected, cap.start(), cap.end()) {
            hits.push(Hit { start: cap.start(), end: cap.end(), kind: HitKind::DangerScheme });
        }
    }
    for cap in phone.find_iter(s) {
        let n = digit_count(cap.as_str());
        if n < 10 || n > 15 {
            continue;
        }
        if !covered(&protected, cap.start(), cap.end()) {
            hits.push(Hit { start: cap.start(), end: cap.end(), kind: HitKind::Phone });
        }
    }
    for cap in url.find_iter(s) {
        let m = cap.as_str();
        if m.contains('@') {
            continue;
        }
        if host_of(m).is_none() {
            continue;
        }
        if !covered(&protected, cap.start(), cap.end()) {
            hits.push(Hit { start: cap.start(), end: cap.end(), kind: HitKind::Link });
        }
    }

    hits.sort_by_key(|h| h.start);
    let mut out = Vec::new();
    let mut cursor = 0;
    for h in hits {
        if h.start >= cursor && h.end > h.start {
            cursor = h.end;
            out.push(h);
        }
    }
    out
}

fn render_link(raw: &str) -> String {
    let Some(href) = to_href(raw) else {
        return LINK_REMOVED.to_string();
    };
    let Some(host) = host_of(&href) else {
        return LINK_REMOVED.to_string();
    };
    match classify_host(&host) {
        LinkClass::Trusted => format!("[url]{href}[/url]"),
        LinkClass::Warn => format!("[urlw]{href}[/urlw]"),
        LinkClass::Remove => LINK_REMOVED.to_string(),
    }
}

fn rewrite_contacts_and_links(s: &str) -> String {
    let hits = collect_hits(s);
    if hits.is_empty() {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut last = 0;
    for h in hits {
        out.push_str(&s[last..h.start]);
        let slice = &s[h.start..h.end];
        match h.kind {
            HitKind::Email => out.push_str(EMAIL_REMOVED),
            HitKind::Phone => out.push_str(PHONE_REMOVED),
            HitKind::DangerScheme => out.push_str(LINK_REMOVED),
            HitKind::Link => out.push_str(&render_link(slice)),
        }
        last = h.end;
    }
    out.push_str(&s[last..]);
    out
}

fn is_profane_token(token: &str) -> bool {
    if token.chars().count() < 3 {
        return false;
    }
    let lower = token.to_lowercase();
    if extra_profane().iter().any(|w| lower == *w || lower.starts_with(w.as_str())) {
        return true;
    }
    lower.is(Type::PROFANE | Type::OFFENSIVE | Type::SEXUAL)
}

fn mask_profanity(s: &str) -> String {
    let protected = protected_ranges(s);
    let mut out = String::with_capacity(s.len());
    let mut token = String::new();
    let mut token_start = 0;

    let flush = |token: &mut String, start: usize, out: &mut String, protected: &[(usize, usize)]| {
        if token.is_empty() {
            return;
        }
        let end = start + token.len();
        if covered(protected, start, end) {
            out.push_str(token);
        } else if is_profane_token(token) {
            out.push_str("[mask]");
            out.push_str(token);
            out.push_str("[/mask]");
        } else {
            out.push_str(token);
        }
        token.clear();
    };

    for (idx, c) in s.char_indices() {
        if c.is_alphabetic() {
            if token.is_empty() {
                token_start = idx;
            }
            token.push(c);
        } else {
            flush(&mut token, token_start, &mut out, &protected);
            out.push(c);
        }
    }
    flush(&mut token, token_start, &mut out, &protected);
    out
}

/// Rewrite emails, phones, disguised/untrusted links, and wrap insults for click-to-reveal.
pub fn filter_user_text(raw: &str) -> String {
    let s = normalize_obfuscation(raw);
    let s = rewrite_contacts_and_links(&s);
    mask_profanity(&s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trusted_hosts_are_sorted_unique() {
        let mut v = TRUSTED_HOSTS.to_vec();
        v.sort();
        v.dedup();
        // uniqueness is enough; binary_search not required
        assert_eq!(v.len(), TRUSTED_HOSTS.len());
    }

    #[test]
    fn trusted_google_wrapped() {
        let out = filter_user_text("see google.com please");
        assert!(out.contains("[url]https://google.com[/url]"), "{out}");
        assert!(!out.contains(LINK_REMOVED));
    }

    #[test]
    fn warn_generic_com() {
        let out = filter_user_text("visit example.com now");
        assert!(out.contains("[urlw]https://example.com[/urlw]"), "{out}");
    }

    #[test]
    fn spam_tld_removed() {
        let out = filter_user_text("http://evil.xyz/phish");
        assert!(out.contains(LINK_REMOVED), "{out}");
        assert!(!out.contains("evil.xyz"));
    }

    #[test]
    fn disguised_spaces_and_brackets() {
        let out = filter_user_text("go google . com and also google[.]com");
        assert_eq!(out.matches("[url]https://google.com[/url]").count(), 2, "{out}");
    }

    #[test]
    fn hxxp_and_dot_obfuscation() {
        let out = filter_user_text("hxxps://youtube.com/watch");
        assert!(out.contains("[url]https://youtube.com/watch[/url]"), "{out}");
    }

    #[test]
    fn email_and_phone_stripped() {
        let out = filter_user_text("mail me@gmail.com or +380671234567");
        assert!(out.contains(EMAIL_REMOVED), "{out}");
        assert!(out.contains(PHONE_REMOVED), "{out}");
        assert!(!out.contains("me@gmail.com"));
        assert!(!out.contains("380671234567"));
    }

    #[test]
    fn javascript_removed() {
        let out = filter_user_text("javascript:alert(1)");
        assert!(out.contains(LINK_REMOVED), "{out}");
        assert!(!out.contains("alert"));
    }

    #[test]
    fn shortener_removed() {
        let out = filter_user_text("https://bit.ly/abcd");
        assert!(out.contains(LINK_REMOVED), "{out}");
    }

    #[test]
    fn profanity_masked_not_deleted() {
        let out = filter_user_text("what the fuck dude");
        assert!(out.contains("[mask]fuck[/mask]"), "{out}");
        assert!(out.contains("dude"));
    }

    #[test]
    fn ua_insult_masked() {
        let out = filter_user_text("ти хуй");
        assert!(out.contains("[mask]хуй[/mask]"), "{out}");
    }

    #[test]
    fn bbcode_kept() {
        let out = filter_user_text("[b]жирний[/b]");
        assert_eq!(out, "[b]жирний[/b]");
    }
}
