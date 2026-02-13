use anyhow::{Context, Result};
use sea_orm::{ConnectOptions, Database, DatabaseConnection};
use std::time::Duration;

pub async fn connect(pool_url: &str) -> Result<DatabaseConnection> {
    let url = if pool_url.starts_with("sqlite:") && !pool_url.contains("mode=rwc") {
        if pool_url.contains('?') {
            format!("{}&mode=rwc", pool_url)
        } else {
            format!("{}?mode=rwc", pool_url)
        }
    } else {
        pool_url.to_owned()
    };

    let mut opt = ConnectOptions::new(url);
    // HIGH LOAD TUNING:
    // Increase max_connections significantly.
    // For Postgres: 50-100 is often good.
    // For SQLite (WAL): high read concurrency is fine, writes are serialized.
    opt.max_connections(100)
        .min_connections(10)
        .connect_timeout(Duration::from_secs(8))
        .acquire_timeout(Duration::from_secs(8)) // Fast fail if pool is full
        .idle_timeout(Duration::from_secs(8))
        .max_lifetime(Duration::from_secs(8 * 60))
        .sqlx_logging(false); // Disable logging in production for performance

    Database::connect(opt)
        .await
        .context("Error: unable to connect to database")
}
