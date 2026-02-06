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
use dotenv::dotenv;
use model::Todo;
use sea_orm::DatabaseConnection;
use tokio::sync::RwLock;
use sea_orm_migration::MigratorTrait;

use crate::config::Config;
use crate::migrator::Migrator;

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
    println!("Database migrations applied successfully!");

    let todos: Vec<Todo> = vec![];

    let app_state = Arc::new(RwLock::new(AppState {
        pool,
        config,
        todos,
    }));

    route::serve(app_state).await?;

    Ok(())
}