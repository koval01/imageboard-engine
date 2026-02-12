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
            // Default to "./media" for dev, but can be set to "/srv/media" in prod env
            media_path: std::env::var("MEDIA_ROOT").unwrap_or_else(|_| "./media".to_string()),
            media_port: std::env::var("MEDIA_PORT")
                .unwrap_or_else(|_| "8083".to_string())
                .parse::<u16>()
                .expect("MEDIA_PORT must be a number"),
        }
    }
}
