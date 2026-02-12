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
use config::Config;
use dotenv;

use migrator::Migrator;
use service::StorageService;

use sea_orm::DatabaseConnection;
use sea_orm_migration::MigratorTrait;

use tokio::sync::RwLock;
use moka::future::Cache;

pub struct AppState {
    pub pool: DatabaseConnection,
    pub config: Config,
    pub storage: StorageService,
    pub ip_cache: Cache<String, String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenv::from_path(Path::new(".env.local")).ok();

    let config = Config::init();
    let pool = db::connect(&config.database_url).await?;

    Migrator::up(&pool, None).await?;

    let storage = StorageService::init().await;

    let ip_cache = Cache::builder()
        .max_capacity(10_000)
        .time_to_live(Duration::from_secs(60 * 60 * 24))
        .build();

    let app_state = Arc::new(RwLock::new(AppState {
        pool,
        config,
        storage,
        ip_cache,
    }));

    route::serve(app_state).await?;

    Ok(())
}
