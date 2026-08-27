mod config;
mod db;
mod handler;
mod migrator;
mod model;
mod route;
mod security;
mod service;

#[cfg(test)]
mod tests;

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use config::{Config, StorageType};
use migrator::Migrator;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, IntoActiveModel, QueryFilter,
    Set,
};
use sea_orm_migration::MigratorTrait;
use service::{KvStore, StorageService, validate_password_for};
use sha2::{Digest, Sha256};
use tokio::sync::RwLock;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use crate::handler::board::CacheData;
use crate::model::admins;

#[cfg(all(not(target_env = "msvc"), not(target_env = "musl")))]
use tikv_jemallocator::Jemalloc;

#[cfg(all(not(target_env = "msvc"), not(target_env = "musl")))]
#[global_allocator]
static GLOBAL: Jemalloc = Jemalloc;

pub struct AppState {
    pub pool: DatabaseConnection,
    pub config: Config,
    pub storage: StorageService,
    pub ip_cache: moka::future::Cache<String, String>,
    pub db_cache: moka::future::Cache<String, CacheData>,
    pub kv: KvStore,
    pub password_crypto: std::sync::Arc<service::PasswordCrypto>,
}

async fn bootstrap_staff(
    pool: &DatabaseConnection,
    username: &str,
    key: &str,
    role: i32,
) -> Result<()> {
    if let Err(msg) = validate_password_for(key, Some(username)) {
        tracing::error!("Skipping staff bootstrap for '{username}': {msg}");
        return Ok(());
    }

    let mut hasher = Sha256::new();
    hasher.update(key.as_bytes());
    let hashed_key = hex::encode(hasher.finalize());

    let existing = admins::Entity::find()
        .filter(admins::Column::Username.eq(username))
        .one(pool)
        .await?;

    if let Some(existing) = existing {
        if existing.service_key != hashed_key || existing.role != role {
            let mut model = existing.into_active_model();
            model.service_key = Set(hashed_key);
            model.role = Set(role);
            model.update(pool).await?;
            tracing::info!("Updated bootstrap staff user '{username}' (role {role})");
        }
        return Ok(());
    }

    let admin = admins::ActiveModel {
        username: Set(username.to_string()),
        service_key: Set(hashed_key),
        role: Set(role),
        token_version: Set(1),
        created_at: Set(chrono::Utc::now().naive_utc()),
        ..Default::default()
    };
    admin.insert(pool).await?;
    tracing::info!("Bootstrapped staff user '{username}' (role {role})");
    Ok(())
}

async fn bootstrap_admins(pool: &DatabaseConnection, config: &Config) -> Result<()> {
    if let Some(key) = config.admin_bootstrap_key.as_ref() {
        if config
            .admin_bootstrap_user
            .as_deref()
            .is_some_and(|u| !u.eq_ignore_ascii_case("admin"))
        {
            tracing::warn!("ADMIN_BOOTSTRAP_USER is ignored; super-admin username is always 'admin'");
        }
        bootstrap_staff(pool, "admin", key, 3).await?;
    }
    if let (Some(username), Some(key)) = (
        config.janitor_bootstrap_user.as_ref(),
        config.janitor_bootstrap_key.as_ref(),
    ) {
        if username.eq_ignore_ascii_case("admin") {
            tracing::warn!("JANITOR_BOOTSTRAP_USER cannot be 'admin'; skipped");
        } else {
            bootstrap_staff(pool, username, key, 1).await?;
        }
    }
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    let _ = dotenvy::from_path(Path::new(".env.local"));
    let _ = dotenvy::dotenv();

    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(fmt::layer())
        .init();

    let config = Config::init();
    let pool = db::connect(&config.database_url).await?;

    Migrator::up(&pool, None).await?;
    bootstrap_admins(&pool, &config).await?;

    let storage = StorageService::init(&config).await;
    let kv = KvStore::connect(config.redis_url.as_deref()).await?;

    let ip_cache = moka::future::Cache::builder()
        .max_capacity(10_000)
        .time_to_live(Duration::from_secs(60 * 60 * 24))
        .build();

    let db_cache = moka::future::Cache::builder()
        .max_capacity(1000)
        .time_to_live(Duration::from_secs(5))
        .build();

    if config.storage_type == StorageType::Local {
        #[cfg(debug_assertions)]
        {
            use axum::Router;
            use tower_http::cors::CorsLayer;
            use tower_http::services::ServeDir;
            use tower_http::trace::TraceLayer;

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
        db_cache,
        kv,
        password_crypto: Arc::new(service::PasswordCrypto::generate()),
    }));

    {
        let state = app_state.clone();
        tokio::spawn(async move {
            let secs = state.read().await.config.purge_interval_secs.max(60);
            let mut ticker = tokio::time::interval(Duration::from_secs(secs));
            loop {
                ticker.tick().await;
                let guard = state.read().await;
                match service::purge_inactive_threads(
                    &guard.pool,
                    &guard.storage,
                    guard.config.thread_age_limit_days,
                )
                .await
                {
                    Ok(0) => {}
                    Ok(n) => tracing::info!("purged {n} inactive threads"),
                    Err(e) => tracing::error!("inactive thread purge failed: {e:#}"),
                }
                match service::purge_expired_media(
                    &guard.pool,
                    &guard.storage,
                    guard.config.media_ttl_days,
                )
                .await
                {
                    Ok(0) => {}
                    Ok(n) => tracing::info!("purged {n} expired media files"),
                    Err(e) => tracing::error!("expired media purge failed: {e:#}"),
                }
            }
        });
    }

    route::serve(app_state).await?;

    Ok(())
}
