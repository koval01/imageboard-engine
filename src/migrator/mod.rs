use sea_orm_migration::prelude::*;

mod m20260205_000001_create_imageboard;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260205_000001_create_imageboard::Migration),
        ]
    }
}
