mod config;
mod db;
mod handler;
mod migrator;
mod model;
mod route;
mod security;
mod service;

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use config::{Config, StorageType};
use dotenv;

use migrator::Migrator;
use service::StorageService;

use sea_orm::DatabaseConnection;
use sea_orm_migration::MigratorTrait;

use tokio::sync::RwLock;
use moka::future::Cache;

use axum::Router;
use tower_http::{services::ServeDir, trace::TraceLayer};
use tower_http::cors::CorsLayer;

// Import the Cache Enum definition
use crate::handler::board::CacheData;

pub struct AppState {
    pub pool: DatabaseConnection,
    pub config: Config,
    pub storage: StorageService,
    pub ip_cache: Cache<String, String>,
    // Key: "IP_TYPE" (e.g. "127.0.0.1_thread"), Value: Timestamp (u64)
    pub rate_limit_cache: Cache<String, u64>,

    // NEW: Application Data Cache (RAM)
    // Caches heavy view structures for a few seconds
    pub db_cache: Cache<String, CacheData>,
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenv::from_path(Path::new(".env.local")).ok();

    let config = Config::init();
    let pool = db::connect(&config.database_url).await?;

    Migrator::up(&pool, None).await?;

    let storage = StorageService::init(&config).await;

    // Cache for IP Geolocation
    let ip_cache = Cache::builder()
        .max_capacity(10_000)
        .time_to_live(Duration::from_secs(60 * 60 * 24))
        .build();

    // Cache for Rate Limiting
    let rate_limit_cache = Cache::builder()
        .max_capacity(10_000)
        .time_to_live(Duration::from_secs(60 * 5))
        .build();

    // Cache for Heavy DB Queries (TTL: 5 seconds)
    // This allows serving thousands of requests per second
    // while only hitting the DB once every 5 seconds per view.
    let db_cache = Cache::builder()
        .max_capacity(1000)
        .time_to_live(Duration::from_secs(5))
        .build();

    if config.storage_type == StorageType::Local {
        let media_path = config.media_path.clone();
        let media_port = config.media_port;

        tokio::spawn(async move {
            let app = Router::new()
                .fallback_service(ServeDir::new(media_path))
                .layer(TraceLayer::new_for_http())
                .layer(CorsLayer::permissive());

            let addr = format!("0.0.0.0:{}", media_port);
            println!("Media Server running on http://{}", addr);

            let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
            axum::serve(listener, app).await.unwrap();
        });
    }

    let app_state = Arc::new(RwLock::new(AppState {
        pool,
        config,
        storage,
        ip_cache,
        rate_limit_cache,
        db_cache,
    }));

    route::serve(app_state).await?;

    Ok(())
}
