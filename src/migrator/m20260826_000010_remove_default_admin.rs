use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Remove the well-known default admin seeded in m20260205_000005.
        // Production admins are created via ADMIN_BOOTSTRAP_USER / ADMIN_BOOTSTRAP_KEY.
        manager
            .get_connection()
            .execute_unprepared(
                "DELETE FROM admins WHERE username = 'root' AND service_key = 'a871036047681927683b9612d7c5fd403c7ac2dcb3e8c863cface537ad5b3903'",
            )
            .await?;
        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Ok(())
    }
}
