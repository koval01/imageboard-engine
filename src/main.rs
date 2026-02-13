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

use crate::handler::board::CacheData;

pub struct AppState {
    pub pool: DatabaseConnection,
    pub config: Config,
    pub storage: StorageService,
    pub ip_cache: Cache<String, String>,
    pub rate_limit_cache: Cache<String, u64>,
    pub db_cache: Cache<String, CacheData>,
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenv::from_path(Path::new(".env.local")).ok();

    let config = Config::init();
    let pool = db::connect(&config.database_url).await?;

    Migrator::up(&pool, None).await?;

    let storage = StorageService::init(&config).await;

    let ip_cache = Cache::builder()
        .max_capacity(10_000)
        .time_to_live(Duration::from_secs(60 * 60 * 24))
        .build();

    let rate_limit_cache = Cache::builder()
        .max_capacity(10_000)
        .time_to_live(Duration::from_secs(60 * 5))
        .build();

    let db_cache = Cache::builder()
        .max_capacity(1000)
        .time_to_live(Duration::from_secs(5))
        .build();

    if config.storage_type == StorageType::Local {
        // ONLY run the internal media server in Debug mode.
        // In Release mode, Nginx/Apache should serve the /media folder.
        #[cfg(debug_assertions)]
        {
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

        #[cfg(not(debug_assertions))]
        {
            println!("Info: Local Storage selected but running in RELEASE mode.");
            println!("      Internal media server is DISABLED.");
            println!("      Ensure your reverse proxy serves directory: {}", config.media_path);
        }
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
