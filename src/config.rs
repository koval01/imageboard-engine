#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub jwt_expires_in: String,
    pub jwt_maxage: i32,
    pub cdn_url: String,
}

impl Config {
    pub fn init() -> Self {
        Self {
            database_url: std::env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            jwt_secret: std::env::var("JWT_SECRET").expect("JWT_SECRET must be set"),
            jwt_expires_in: std::env::var("JWT_EXPIRED_IN").expect("JWT_EXPIRED_IN must be set"),
            jwt_maxage: std::env::var("JWT_MAXAGE")
                .expect("JWT_MAXAGE must be set")
                .parse::<i32>()
                .unwrap(),
            // Load the CDN URL here
            cdn_url: std::env::var("S3_PUBLIC_URL").expect("S3_PUBLIC_URL must be set"),
        }
    }
}
