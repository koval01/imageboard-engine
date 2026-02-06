mod config;
mod db;
mod handler;
mod migrator;
mod model;
mod route;
mod serialization;
mod service;

use std::sync::Arc;
use anyhow::Result;
use config::Config;
use dotenv::dotenv;
use migrator::Migrator;
use model::Todo;
use sea_orm::DatabaseConnection;
use sea_orm_migration::MigratorTrait;
use tokio::sync::RwLock;

pub struct AppState {
    pub pool: DatabaseConnection,
    pub config: Config,
    pub todos: Vec<Todo>,
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenv().ok();

    let config = Config::init();
    let pool = db::connect(&config.database_url).await?;

    Migrator::up(&pool, None).await?;

    let app_state = Arc::new(RwLock::new(AppState {
        pool,
        config,
        todos: vec![],
    }));

    route::serve(app_state).await?;

    Ok(())
}
