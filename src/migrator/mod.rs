use sea_orm_migration::prelude::*;

mod m20260205_000001_create_imageboard;
mod m20260205_000002_create_images;
mod m20260205_000003_add_country_code;
mod m20260205_000004_add_image_hash;
mod m20260205_000005_admin_and_tracking;
mod m20260205_000006_create_reports;
mod m20260205_000007_add_exif_data;
mod m20260205_000008_add_admin_version;
mod m20260205_000009_add_phash;
mod m20260826_000010_remove_default_admin;
mod m20260827_000011_staff_rbac;

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
            Box::new(m20260205_000007_add_exif_data::Migration),
            Box::new(m20260205_000008_add_admin_version::Migration),
            Box::new(m20260205_000009_add_phash::Migration),
            Box::new(m20260826_000010_remove_default_admin::Migration),
            Box::new(m20260827_000011_staff_rbac::Migration),
        ]
    }
}
