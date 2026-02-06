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
    opt.max_connections(10)
        .min_connections(5)
        .connect_timeout(Duration::from_secs(8))
        .idle_timeout(Duration::from_secs(8))
        .sqlx_logging(true);

    let db = Database::connect(opt)
        .await
        .context("Error: unable to connect to database!")?;

    println!("Successfully connected to database!");

    Ok(db)
}