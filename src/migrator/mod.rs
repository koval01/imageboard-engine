use sea_orm_migration::prelude::*;

mod m20260205_000001_create_imageboard;
mod m20260205_000002_create_images;
mod m20260205_000003_add_country_code;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260205_000001_create_imageboard::Migration),
            Box::new(m20260205_000002_create_images::Migration),
            Box::new(m20260205_000003_add_country_code::Migration),
        ]
    }
}
