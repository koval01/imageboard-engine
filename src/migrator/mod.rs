use sea_orm_migration::prelude::*;

mod m20260205_000001_create_imageboard;
mod m20260205_000002_create_images;
mod m20260205_000003_add_country_code;
mod m20260205_000004_add_image_hash;
mod m20260205_000005_admin_and_tracking;
mod m20260205_000006_create_reports;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260205_000001_create_imageboard::Migration),
            Box::new(m20260205_000002_create_images::Migration),
            Box::new(m20260205_000003_add_country_code::Migration),
            Box::new(m20260205_000004_add_image_hash::Migration),
            Box::new(m20260205_000005_admin_and_tracking::Migration),
            Box::new(m20260205_000006_create_reports::Migration),
        ]
    }
}