use std::collections::BTreeSet;
use std::net::IpAddr;

use axum::{http::StatusCode, response::IntoResponse, Json};
use chrono::{NaiveDateTime, Timelike, Utc};
use ipnet::IpNet;
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};

use crate::model::{admin_logs, admins, bans};
use crate::service::{lookup_ip_meta, KvStore};

pub const SUPER_USERNAME: &str = "admin";
pub const ROLE_MOD: i32 = 1;
pub const ROLE_ADMIN: i32 = 2;
pub const ROLE_SUPER: i32 = 3;
pub const SETTINGS_KEY: &str = "staff:settings";
pub const MIN_PASSWORD_LEN: usize = 13;
pub const MIN_PASSWORD_DIGITS: usize = 2;
pub const MIN_PASSWORD_SPECIAL: usize = 1;
pub const PREFERRED_PASSWORD_SPECIAL: usize = 2;
const PASSWORD_SEQUENCE_RUN: usize = 4;
const PASSWORD_REPEAT_RUN: usize = 4;

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Privileges {
    pub hide: bool,
    pub delete: bool,
    pub ban: bool,
    pub view_ip: bool,
    pub manage_staff: bool,
}

impl Privileges {
    pub fn none() -> Self {
        Self::default()
    }

    pub fn for_role(role: i32) -> Self {
        match role {
            ROLE_SUPER => Self {
                hide: true,
                delete: true,
                ban: true,
                view_ip: true,
                manage_staff: true,
            },
            ROLE_ADMIN => Self {
                hide: true,
                delete: true,
                ban: true,
                view_ip: true,
                manage_staff: false,
            },
            ROLE_MOD => Self {
                hide: true,
                delete: false,
                ban: false,
                view_ip: false,
                manage_staff: false,
            },
            _ => Self::none(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StaffSettings {
    pub default_rate_limit_per_hour: u32,
    pub default_work_start: Option<String>,
    pub default_work_end: Option<String>,
    pub timezone: String,
}

impl Default for StaffSettings {
    fn default() -> Self {
        Self {
            default_rate_limit_per_hour: 120,
            default_work_start: None,
            default_work_end: None,
            timezone: "Europe/Kyiv".into(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct Restriction {
    pub posting_blocked: bool,
    pub viewing_blocked: bool,
    pub reason: Option<String>,
    pub expires_at: Option<NaiveDateTime>,
    pub scope: Option<String>,
    pub board_slug: Option<String>,
    pub kind: Option<String>,
}

impl Restriction {
    pub fn none() -> Self {
        Self {
            posting_blocked: false,
            viewing_blocked: false,
            reason: None,
            expires_at: None,
            scope: None,
            board_slug: None,
            kind: None,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct CidrPreview {
    pub cidr: String,
    pub first_ip: String,
    pub last_ip: String,
    pub address_count: String,
    pub country: Option<String>,
    pub country_code: Option<String>,
    pub isp: Option<String>,
    pub org: Option<String>,
    pub asn: Option<String>,
    pub spillover: bool,
    pub other_isps: Vec<String>,
    pub samples: Vec<CidrSample>,
}

#[derive(Clone, Debug, Serialize)]
pub struct CidrSample {
    pub ip: String,
    pub isp: Option<String>,
    pub asn: Option<String>,
    pub country: Option<String>,
}

pub fn hash_password(password: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn is_super_admin(admin: &admins::Model) -> bool {
    admin.role == ROLE_SUPER && admin.username.eq_ignore_ascii_case(SUPER_USERNAME)
}

pub fn reserved_username(name: &str) -> bool {
    name.trim().eq_ignore_ascii_case(SUPER_USERNAME)
}

pub fn validate_password_for(password: &str, username: Option<&str>) -> Result<(), String> {
    let issues = password_issues(password, username);
    if issues.is_empty() {
        Ok(())
    } else {
        Err(issues.join(". "))
    }
}

fn is_special_char(c: char) -> bool {
    !c.is_alphanumeric() && !c.is_whitespace()
}

fn password_lower(password: &str) -> String {
    password.chars().flat_map(char::to_lowercase).collect()
}

fn has_codepoint_run(password: &str, min_run: usize) -> bool {
    let chars: Vec<char> = password_lower(password).chars().collect();
    if chars.len() < min_run {
        return false;
    }
    let mut asc = 1usize;
    let mut desc = 1usize;
    for pair in chars.windows(2) {
        let a = pair[0] as i32;
        let b = pair[1] as i32;
        if b == a + 1 {
            asc += 1;
            desc = 1;
        } else if b == a - 1 {
            desc += 1;
            asc = 1;
        } else {
            asc = 1;
            desc = 1;
        }
        if asc >= min_run || desc >= min_run {
            return true;
        }
    }
    false
}

fn has_repeated_run(password: &str, min_run: usize) -> bool {
    let mut prev: Option<char> = None;
    let mut count = 0usize;
    for c in password_lower(password).chars() {
        if Some(c) == prev {
            count += 1;
        } else {
            prev = Some(c);
            count = 1;
        }
        if count >= min_run {
            return true;
        }
    }
    false
}

fn contains_common_weak_pattern(password: &str) -> bool {
    const COMMON: &[&str] = &[
        "123456",
        "1234567",
        "12345678",
        "123456789",
        "1234567890",
        "password",
        "qwerty",
        "qwertyui",
        "asdfgh",
        "zxcvbn",
        "abc123",
        "abcdef",
        "letmein",
        "welcome",
        "iloveyou",
        "monkey",
        "dragon",
        "пароль",
        "криївка",
        "kryivka",
    ];
    let lower = password_lower(password);
    COMMON.iter().any(|needle| lower.contains(needle))
}

pub fn password_issues(password: &str, username: Option<&str>) -> Vec<String> {
    let mut issues = Vec::new();
    if password.chars().any(char::is_whitespace) {
        issues.push("Пароль не може містити пробіли".into());
    }
    let len = password.chars().count();
    if len < MIN_PASSWORD_LEN {
        issues.push(format!("Щонайменше {MIN_PASSWORD_LEN} символів"));
    }
    let mut upper = 0usize;
    let mut lower = 0usize;
    let mut digits = 0usize;
    let mut special = 0usize;
    for c in password.chars() {
        if c.is_uppercase() {
            upper += 1;
        } else if c.is_lowercase() {
            lower += 1;
        } else if c.is_ascii_digit() {
            digits += 1;
        } else if is_special_char(c) {
            special += 1;
        }
    }
    if upper == 0 {
        issues.push("Потрібна велика літера".into());
    }
    if lower == 0 {
        issues.push("Потрібна мала літера".into());
    }
    if digits < MIN_PASSWORD_DIGITS {
        issues.push(format!("Потрібно щонайменше {MIN_PASSWORD_DIGITS} цифри"));
    }
    if special < MIN_PASSWORD_SPECIAL {
        issues.push(format!(
            "Потрібен спецсимвол (краще {PREFERRED_PASSWORD_SPECIAL}: !@#$%…)"
        ));
    }
    if has_codepoint_run(password, PASSWORD_SEQUENCE_RUN) || has_repeated_run(password, PASSWORD_REPEAT_RUN)
    {
        issues.push("Уникайте послідовностей на кшталт 123456 чи abcdef".into());
    }
    if contains_common_weak_pattern(password) {
        issues.push("Пароль містить поширений слабкий фрагмент".into());
    }
    if let Some(name) = username.map(str::trim).filter(|n| n.chars().count() >= 3) {
        let name_l = password_lower(name);
        if password_lower(password).contains(&name_l) {
            issues.push("Пароль не повинен містити імʼя облікового запису".into());
        }
    }
    if !issues.is_empty() {
        return issues;
    }

    let mut inputs: Vec<&str> = vec!["kryivka", "криївка", "kryivka.org", SUPER_USERNAME];
    if let Some(name) = username.map(str::trim).filter(|n| !n.is_empty()) {
        inputs.push(name);
    }
    let entropy = zxcvbn::zxcvbn(password, &inputs);
    if matches!(
        entropy.score(),
        zxcvbn::Score::Zero | zxcvbn::Score::One | zxcvbn::Score::Two
    ) {
        issues.push(
            "Пароль занадто слабкий або легко вгадується. Додайте унікальні слова, цифри й спецсимволи."
                .into(),
        );
    }
    issues
}

pub fn parse_privilege_overrides(raw: &str) -> serde_json::Value {
    serde_json::from_str(raw).unwrap_or_else(|_| json!({}))
}

pub fn effective_privileges(admin: &admins::Model) -> Privileges {
    if is_super_admin(admin) {
        return Privileges::for_role(ROLE_SUPER);
    }
    let mut privs = Privileges::for_role(admin.role);
    let overrides = parse_privilege_overrides(&admin.privileges);
    if let Some(v) = overrides.get("hide").and_then(|v| v.as_bool()) {
        privs.hide = v;
    }
    if let Some(v) = overrides.get("delete").and_then(|v| v.as_bool()) {
        privs.delete = v;
    }
    if let Some(v) = overrides.get("ban").and_then(|v| v.as_bool()) {
        privs.ban = v;
    }
    if let Some(v) = overrides.get("view_ip").and_then(|v| v.as_bool()) {
        privs.view_ip = v;
    }
    privs.manage_staff = false;
    privs
}

pub fn apply_hours_gate(privs: Privileges, hours_active: bool, is_super: bool) -> Privileges {
    if hours_active || is_super {
        return privs;
    }
    Privileges {
        hide: false,
        delete: false,
        ban: false,
        view_ip: privs.view_ip,
        manage_staff: false,
    }
}

fn parse_hhmm(s: &str) -> Option<u32> {
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() != 2 {
        return None;
    }
    let h = parts[0].parse::<u32>().ok()?;
    let m = parts[1].parse::<u32>().ok()?;
    if h > 23 || m > 59 {
        return None;
    }
    Some(h * 60 + m)
}

pub fn within_work_hours(start: Option<&str>, end: Option<&str>, tz_name: &str) -> bool {
    let (Some(start), Some(end)) = (start.filter(|s| !s.is_empty()), end.filter(|s| !s.is_empty())) else {
        return true;
    };
    let Some(start_mins) = parse_hhmm(start) else {
        return true;
    };
    let Some(end_mins) = parse_hhmm(end) else {
        return true;
    };
    if start_mins == end_mins {
        return true;
    }
    let tz: chrono_tz::Tz = tz_name.parse().unwrap_or(chrono_tz::Europe::Kyiv);
    let local = Utc::now().with_timezone(&tz);
    let now_mins = local.hour() * 60 + local.minute();
    if start_mins < end_mins {
        now_mins >= start_mins && now_mins < end_mins
    } else {
        now_mins >= start_mins || now_mins < end_mins
    }
}

pub fn hours_active_for(admin: &admins::Model, settings: &StaffSettings) -> bool {
    if is_super_admin(admin) {
        return true;
    }
    let start = admin
        .work_start
        .as_deref()
        .filter(|s| !s.is_empty())
        .or(settings.default_work_start.as_deref());
    let end = admin
        .work_end
        .as_deref()
        .filter(|s| !s.is_empty())
        .or(settings.default_work_end.as_deref());
    let tz = if admin.timezone.is_empty() {
        settings.timezone.as_str()
    } else {
        admin.timezone.as_str()
    };
    within_work_hours(start, end, tz)
}

pub async fn load_settings(kv: &KvStore) -> StaffSettings {
    if let Some(raw) = kv.get(SETTINGS_KEY).await {
        if let Ok(s) = serde_json::from_str(&raw) {
            return s;
        }
    }
    StaffSettings::default()
}

pub async fn save_settings(kv: &KvStore, settings: &StaffSettings) {
    if let Ok(raw) = serde_json::to_string(settings) {
        kv.set(SETTINGS_KEY, &raw, 60 * 60 * 24 * 365).await;
    }
}

pub async fn find_staff_for_token(
    db: &DatabaseConnection,
    aid: i32,
    role: i32,
    version: i32,
) -> Option<admins::Model> {
    if aid > 0 {
        let admin = admins::Entity::find_by_id(aid).one(db).await.ok().flatten()?;
        if admin.token_version == version && !admin.disabled {
            return Some(admin);
        }
        return None;
    }
    let rows = admins::Entity::find()
        .filter(admins::Column::Role.eq(role))
        .all(db)
        .await
        .unwrap_or_default();
    rows.into_iter()
        .find(|a| a.token_version == version && !a.disabled)
}

pub fn parse_cidr(input: &str) -> Result<IpNet, String> {
    let s = input.trim();
    if s.is_empty() {
        return Err("Вкажіть IP або CIDR".into());
    }
    if s.contains('/') {
        s.parse::<IpNet>()
            .map_err(|e| format!("Невірний CIDR: {e}"))
    } else {
        let addr: IpAddr = s
            .parse()
            .map_err(|_| "Невірна IP-адреса".to_string())?;
        Ok(IpNet::from(addr))
    }
}

pub fn cidr_contains(cidr: &str, ip: &str) -> bool {
    match (parse_cidr(cidr), ip.parse::<IpAddr>()) {
        (Ok(net), Ok(addr)) => net.contains(&addr),
        _ => false,
    }
}

pub fn ip_matches_ban(ban: &bans::Model, ip: &str) -> bool {
    if let Some(cidr) = &ban.cidr {
        if cidr_contains(cidr, ip) {
            return true;
        }
    }
    ban.ip_address.as_deref() == Some(ip)
}

pub fn ban_applies(
    ban: &bans::Model,
    ip: &str,
    session_id: &str,
    board: Option<&str>,
) -> bool {
    let identity = ip_matches_ban(ban, ip)
        || ban
            .session_id
            .as_deref()
            .is_some_and(|sid| sid == session_id);
    if !identity {
        return false;
    }
    match ban.scope.as_str() {
        "board" => board.is_some_and(|b| ban.board_slug.as_deref() == Some(b)),
        _ => true,
    }
}

pub async fn match_restrictions(
    db: &DatabaseConnection,
    ip: &str,
    session_id: &str,
    board: Option<&str>,
) -> Restriction {
    let now = Utc::now().naive_utc();
    let rows = bans::Entity::find()
        .filter(bans::Column::ExpiresAt.gt(now))
        .all(db)
        .await
        .unwrap_or_default();

    let mut result = Restriction::none();
    for ban in rows {
        if !ban_applies(&ban, ip, session_id, board) {
            continue;
        }
        let is_view = ban.kind == "view";
        if is_view {
            result.viewing_blocked = true;
            result.posting_blocked = true;
        } else {
            result.posting_blocked = true;
        }
        if result.reason.is_none() {
            result.reason = ban.reason.clone();
            result.expires_at = Some(ban.expires_at);
            result.scope = Some(ban.scope.clone());
            result.board_slug = ban.board_slug.clone();
            result.kind = Some(ban.kind.clone());
        }
        if is_view {
            result.reason = ban.reason.clone().or(result.reason);
            result.expires_at = Some(ban.expires_at);
            result.scope = Some(ban.scope.clone());
            result.board_slug = ban.board_slug.clone();
            result.kind = Some(ban.kind.clone());
        }
    }
    result
}

pub fn posting_error(restriction: &Restriction) -> String {
    let reason = restriction.reason.clone().unwrap_or_default();
    if reason.is_empty() {
        "ЗАБЛОКОВАНО".into()
    } else {
        format!("ЗАБЛОКОВАНО. Причина: {reason}")
    }
}

pub async fn audit(
    db: &DatabaseConnection,
    username: &str,
    action: &str,
    target: Option<String>,
    details: Option<String>,
    ip: Option<String>,
) {
    let log = admin_logs::ActiveModel {
        admin_username: Set(username.to_string()),
        action: Set(action.to_string()),
        target_id: Set(target),
        details: Set(details),
        ip_address: Set(ip),
        created_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };
    let _ = log.insert(db).await;
}

pub fn forbidden(msg: &str) -> axum::response::Response {
    (
        StatusCode::FORBIDDEN,
        Json(json!({ "error": msg })),
    )
        .into_response()
}

pub fn unauthorized(msg: &str) -> axum::response::Response {
    (
        StatusCode::UNAUTHORIZED,
        Json(json!({ "error": msg })),
    )
        .into_response()
}

pub fn bad_request(msg: &str) -> axum::response::Response {
    (
        StatusCode::BAD_REQUEST,
        Json(json!({ "error": msg })),
    )
        .into_response()
}

pub async fn consume_rate_limit(
    kv: &KvStore,
    admin: &admins::Model,
    settings: &StaffSettings,
) -> Result<(), axum::response::Response> {
    if is_super_admin(admin) {
        return Ok(());
    }
    let limit = admin
        .rate_limit_per_hour
        .map(|n| n.max(0) as u32)
        .filter(|n| *n > 0)
        .unwrap_or(settings.default_rate_limit_per_hour);
    if limit == 0 {
        return Ok(());
    }
    let hour = Utc::now().timestamp() / 3600;
    let key = format!("staff:act:{}:{hour}", admin.id);
    let used = kv.incr(&key, 3700).await;
    if used > limit {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({ "error": "Перевищено ліміт адміністративних дій за годину" })),
        )
            .into_response());
    }
    Ok(())
}

fn ipv4_offset(net: ipnet::Ipv4Net, frac_num: u32, frac_den: u32) -> std::net::Ipv4Addr {
    let prefix = net.prefix_len();
    let span = if prefix >= 32 {
        0u32
    } else {
        1u32 << (32 - prefix).min(31)
    };
    let off = if frac_den == 0 {
        0
    } else {
        (span / frac_den).saturating_mul(frac_num)
    };
    let bits = u32::from(net.network()) + off;
    std::net::Ipv4Addr::from(bits)
}

fn cidr_bounds(net: IpNet) -> (String, String, String) {
    let first = net.network().to_string();
    let last = net.broadcast().to_string();
    let count = match net {
        IpNet::V4(n) => {
            if n.prefix_len() == 0 {
                "4294967296".into()
            } else {
                (1u64 << (32 - n.prefix_len())).to_string()
            }
        }
        IpNet::V6(n) => {
            let host_bits = 128u32.saturating_sub(n.prefix_len() as u32);
            if host_bits >= 64 {
                format!("2^{host_bits}")
            } else {
                (1u64 << host_bits).to_string()
            }
        }
    };
    (first, last, count)
}

fn sample_ips(net: IpNet) -> Vec<String> {
    match net {
        IpNet::V4(n) => {
            let mut ips = BTreeSet::new();
            ips.insert(n.network().to_string());
            ips.insert(n.broadcast().to_string());
            if n.prefix_len() < 31 {
                ips.insert(ipv4_offset(n, 1, 4).to_string());
                ips.insert(ipv4_offset(n, 1, 2).to_string());
                ips.insert(ipv4_offset(n, 3, 4).to_string());
            }
            ips.into_iter().collect()
        }
        IpNet::V6(_) => vec![net.network().to_string(), net.broadcast().to_string()],
    }
}

pub async fn preview_cidr(input: &str) -> Result<CidrPreview, String> {
    let net = parse_cidr(input)?;
    let (first_ip, last_ip, address_count) = cidr_bounds(net);
    let samples_ips = sample_ips(net);
    let mut samples = Vec::new();
    let mut isps = BTreeSet::new();
    let mut asns = BTreeSet::new();
    let mut primary_isp = None;
    let mut primary_org = None;
    let mut primary_asn = None;
    let mut primary_country = None;
    let mut primary_cc = None;

    for (i, ip) in samples_ips.iter().enumerate() {
        let meta = lookup_ip_meta(ip).await;
        if i == 0 || primary_isp.is_none() {
            primary_isp = meta.isp.clone();
            primary_org = meta.org.clone();
            primary_asn = meta.asn.clone();
            primary_country = meta.country.clone();
            primary_cc = meta.country_code.clone();
        }
        if let Some(isp) = &meta.isp {
            isps.insert(isp.clone());
        }
        if let Some(asn) = &meta.asn {
            asns.insert(asn.clone());
        }
        samples.push(CidrSample {
            ip: ip.clone(),
            isp: meta.isp,
            asn: meta.asn,
            country: meta.country,
        });
    }

    let spillover = asns.len() > 1 || isps.len() > 1;
    let other_isps = isps
        .into_iter()
        .filter(|isp| primary_isp.as_ref() != Some(isp))
        .collect();

    Ok(CidrPreview {
        cidr: net.to_string(),
        first_ip,
        last_ip,
        address_count,
        country: primary_country,
        country_code: primary_cc,
        isp: primary_isp,
        org: primary_org,
        asn: primary_asn,
        spillover,
        other_isps,
        samples,
    })
}

pub fn staff_public_json(admin: &admins::Model) -> serde_json::Value {
    json!({
        "id": admin.id,
        "username": admin.username,
        "role": admin.role,
        "privileges": effective_privileges(admin),
        "overrides": parse_privilege_overrides(&admin.privileges),
        "work_start": admin.work_start,
        "work_end": admin.work_end,
        "timezone": admin.timezone,
        "rate_limit_per_hour": admin.rate_limit_per_hour,
        "disabled": admin.disabled,
        "last_login_at": admin.last_login_at,
        "last_login_ip": admin.last_login_ip,
        "created_at": admin.created_at,
        "is_super": is_super_admin(admin),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cidr_slash32_contains_self() {
        assert!(cidr_contains("203.0.113.10/32", "203.0.113.10"));
        assert!(!cidr_contains("203.0.113.10/32", "203.0.113.11"));
    }

    #[test]
    fn cidr_slash24_range() {
        assert!(cidr_contains("203.0.113.0/24", "203.0.113.200"));
        assert!(!cidr_contains("203.0.113.0/24", "203.0.114.1"));
    }

    #[test]
    fn parse_bare_ip_is_slash32() {
        let net = parse_cidr("192.0.2.1").unwrap();
        assert_eq!(net.to_string(), "192.0.2.1/32");
    }

    #[test]
    fn reserved_admin_name() {
        assert!(reserved_username("admin"));
        assert!(reserved_username("Admin"));
        assert!(!reserved_username("alice"));
    }

    #[test]
    fn mod_cannot_ban_by_default() {
        let p = Privileges::for_role(ROLE_MOD);
        assert!(p.hide);
        assert!(!p.delete);
        assert!(!p.ban);
        assert!(!p.view_ip);
        assert!(!p.manage_staff);
    }

    #[test]
    fn admin_cannot_manage_staff() {
        let p = Privileges::for_role(ROLE_ADMIN);
        assert!(p.ban && p.delete && p.view_ip);
        assert!(!p.manage_staff);
    }

    #[test]
    fn hours_gate_strips_actions() {
        let p = Privileges::for_role(ROLE_ADMIN);
        let gated = apply_hours_gate(p, false, false);
        assert!(!gated.ban && !gated.delete && !gated.hide);
        assert!(gated.view_ip);
    }

    #[test]
    fn password_rejects_common_and_short() {
        assert!(validate_password_for("123456", None).is_err());
        assert!(validate_password_for("abcdefghijklm", None).is_err());
        assert!(validate_password_for("password", None).is_err());
        assert!(validate_password_for("Password12345", None).is_err());
        assert!(validate_password_for("password1234!", None).is_err());
        assert!(validate_password_for("PASSWORD1234!", None).is_err());
        assert!(validate_password_for("Password!!!!aaa", None).is_err());
        assert!(validate_password_for("Abcdefghijk12!", None).is_err());
        assert!(validate_password_for("Admin-Stormy12!", Some("admin")).is_err());
    }

    #[test]
    fn password_accepts_strong_secret() {
        assert!(validate_password_for("Tr0pical-Storm7!", None).is_ok());
        assert!(validate_password_for("E2e-Staff-Key#42!", Some("admin")).is_ok());
        assert!(validate_password_for("E2e-Mod-Key#42x!", Some("janitor")).is_ok());
        assert!(validate_password_for("ChangeThis-Staff12!", None).is_ok());
    }
}
