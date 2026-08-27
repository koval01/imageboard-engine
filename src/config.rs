#[derive(Debug, Clone, PartialEq)]
pub enum StorageType {
    S3,
    Local,
}

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub jwt_expires_in: String,
    pub jwt_maxage: i32,
    pub cdn_url: String,
    pub storage_type: StorageType,
    pub media_path: String,
    pub media_port: u16,
    pub redis_url: Option<String>,
    pub serve_frontend: bool,
    pub frontend_dist: String,
    pub cors_origin: Option<String>,
    pub cookie_secure: bool,
    pub admin_dist: String,
    pub admin_gate_js: String,
    pub admin_bootstrap_user: Option<String>,
    pub admin_bootstrap_key: Option<String>,
    pub janitor_bootstrap_user: Option<String>,
    pub janitor_bootstrap_key: Option<String>,
    pub thread_age_limit_days: i64,
    pub purge_interval_secs: u64,
    pub rate_limit_secs: u64,
}

pub const BUMP_LIMIT: u64 = 500;
pub const THREAD_AGE_LIMIT_DAYS: i64 = 30;

fn env_bool(key: &str, default: bool) -> bool {
    std::env::var(key)
        .ok()
        .map(|v| matches!(v.to_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(default)
}

impl Config {
    pub fn init() -> Self {
        let storage_type_str = std::env::var("STORAGE_TYPE").unwrap_or_else(|_| "local".to_string());
        let storage_type = match storage_type_str.to_lowercase().as_str() {
            "s3" => StorageType::S3,
            _ => StorageType::Local,
        };

        Self {
            database_url: std::env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            jwt_secret: std::env::var("JWT_SECRET").expect("JWT_SECRET must be set"),
            jwt_expires_in: std::env::var("JWT_EXPIRED_IN").expect("JWT_EXPIRED_IN must be set"),
            jwt_maxage: std::env::var("JWT_MAXAGE")
                .expect("JWT_MAXAGE must be set")
                .parse::<i32>()
                .unwrap(),
            cdn_url: std::env::var("S3_PUBLIC_URL").expect("S3_PUBLIC_URL must be set"),
            storage_type,
            media_path: std::env::var("MEDIA_ROOT").unwrap_or_else(|_| "./media".to_string()),
            media_port: std::env::var("MEDIA_PORT")
                .unwrap_or_else(|_| "8083".to_string())
                .parse::<u16>()
                .expect("MEDIA_PORT must be a number"),
            redis_url: std::env::var("REDIS_URL").ok().filter(|s| !s.is_empty()),
            serve_frontend: env_bool("SERVE_FRONTEND", true),
            frontend_dist: std::env::var("FRONTEND_DIST")
                .unwrap_or_else(|_| "client/dist".to_string()),
            cors_origin: std::env::var("CORS_ORIGIN").ok().filter(|s| !s.is_empty()),
            cookie_secure: env_bool("COOKIE_SECURE", false),
            admin_dist: std::env::var("ADMIN_DIST")
                .unwrap_or_else(|_| "client/dist-admin".to_string()),
            admin_gate_js: std::env::var("ADMIN_GATE_JS")
                .unwrap_or_else(|_| "client/dist-gate/admin-gate.js".to_string()),
            admin_bootstrap_user: std::env::var("ADMIN_BOOTSTRAP_USER")
                .ok()
                .filter(|s| !s.is_empty()),
            admin_bootstrap_key: std::env::var("ADMIN_BOOTSTRAP_KEY")
                .ok()
                .filter(|s| !s.is_empty()),
            janitor_bootstrap_user: std::env::var("JANITOR_BOOTSTRAP_USER")
                .ok()
                .filter(|s| !s.is_empty()),
            janitor_bootstrap_key: std::env::var("JANITOR_BOOTSTRAP_KEY")
                .ok()
                .filter(|s| !s.is_empty()),
            thread_age_limit_days: std::env::var("THREAD_AGE_LIMIT_DAYS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(THREAD_AGE_LIMIT_DAYS),
            purge_interval_secs: std::env::var("PURGE_INTERVAL_SECS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(600),
            rate_limit_secs: std::env::var("RATE_LIMIT_SECS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(60),
        }
    }

    pub fn for_test() -> Self {
        Self {
            database_url: "sqlite::memory:".to_string(),
            jwt_secret: "test_secret".to_string(),
            jwt_expires_in: "1d".to_string(),
            jwt_maxage: 3600,
            cdn_url: "http://localhost:8083".to_string(),
            storage_type: StorageType::Local,
            media_path: "./test_media".to_string(),
            media_port: 8083,
            redis_url: None,
            serve_frontend: false,
            frontend_dist: "client/dist".to_string(),
            cors_origin: None,
            cookie_secure: false,
            admin_dist: "client/dist-admin".to_string(),
            admin_gate_js: "client/dist-gate/admin-gate.js".to_string(),
            admin_bootstrap_user: None,
            admin_bootstrap_key: None,
            janitor_bootstrap_user: None,
            janitor_bootstrap_key: None,
            thread_age_limit_days: THREAD_AGE_LIMIT_DAYS,
            purge_interval_secs: 600,
            rate_limit_secs: 60,
        }
    }
}
