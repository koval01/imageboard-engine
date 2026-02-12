use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // 1. Add IP Address to Threads
        manager.alter_table(
            Table::alter()
                .table(Threads::Table)
                .add_column(ColumnDef::new(Threads::IpAddress).string().not_null().default("0.0.0.0"))
                .to_owned()
        ).await?;

        // 2. Add IP Address to Posts
        manager.alter_table(
            Table::alter()
                .table(Posts::Table)
                .add_column(ColumnDef::new(Posts::IpAddress).string().not_null().default("0.0.0.0"))
                .to_owned()
        ).await?;

        // 3. Create Admins Table (Service Keys)
        manager.create_table(
            Table::create()
                .table(Admins::Table)
                .if_not_exists()
                .col(ColumnDef::new(Admins::Id).integer().not_null().auto_increment().primary_key())
                .col(ColumnDef::new(Admins::Username).string().not_null().unique_key())
                .col(ColumnDef::new(Admins::ServiceKey).string().not_null()) // The login key
                .col(ColumnDef::new(Admins::Role).integer().not_null()) // 1=Janitor, 2=Mod, 3=Admin
                .col(ColumnDef::new(Admins::CreatedAt).timestamp().not_null().default(Expr::current_timestamp()))
                .to_owned()
        ).await?;

        // 4. Create Bans Table
        manager.create_table(
            Table::create()
                .table(Bans::Table)
                .if_not_exists()
                .col(ColumnDef::new(Bans::Id).integer().not_null().auto_increment().primary_key())
                .col(ColumnDef::new(Bans::IpAddress).string().null()) // Ban by IP
                .col(ColumnDef::new(Bans::SessionId).string().null()) // Ban by Session
                .col(ColumnDef::new(Bans::Reason).string().null())
                .col(ColumnDef::new(Bans::ExpiresAt).timestamp().not_null())
                .col(ColumnDef::new(Bans::CreatedAt).timestamp().not_null().default(Expr::current_timestamp()))
                .to_owned()
        ).await?;

        // 5. Create Admin Logs Table (Audit trail)
        manager.create_table(
            Table::create()
                .table(AdminLogs::Table)
                .if_not_exists()
                .col(ColumnDef::new(AdminLogs::Id).integer().not_null().auto_increment().primary_key())
                .col(ColumnDef::new(AdminLogs::AdminUsername).string().not_null())
                .col(ColumnDef::new(AdminLogs::Action).string().not_null()) // "DELETE", "BAN", "EXPORT"
                .col(ColumnDef::new(AdminLogs::TargetId).string().null()) // ID of post/thread or IP
                .col(ColumnDef::new(AdminLogs::Details).string().null())
                .col(ColumnDef::new(AdminLogs::CreatedAt).timestamp().not_null().default(Expr::current_timestamp()))
                .to_owned()
        ).await?;

        // Seed a default admin (Key: "admin_secret_123")
        // In production, change this immediately or seed via ENV
        let insert = Query::insert()
            .into_table(Admins::Table)
            .columns([Admins::Username, Admins::ServiceKey, Admins::Role])
            .values_panic(["root".into(), "admin_secret_123".into(), 3.into()])
            .to_owned();

        manager.exec_stmt(insert).await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager.drop_table(Table::drop().table(AdminLogs::Table).to_owned()).await?;
        manager.drop_table(Table::drop().table(Bans::Table).to_owned()).await?;
        manager.drop_table(Table::drop().table(Admins::Table).to_owned()).await?;
        manager.alter_table(Table::alter().table(Posts::Table).drop_column(Posts::IpAddress).to_owned()).await?;
        manager.alter_table(Table::alter().table(Threads::Table).drop_column(Threads::IpAddress).to_owned()).await
    }
}

#[derive(DeriveIden)]
enum Threads { Table, IpAddress }
#[derive(DeriveIden)]
enum Posts { Table, IpAddress }
#[derive(DeriveIden)]
enum Admins { Table, Id, Username, ServiceKey, Role, CreatedAt }
#[derive(DeriveIden)]
enum Bans { Table, Id, IpAddress, SessionId, Reason, ExpiresAt, CreatedAt }
#[derive(DeriveIden)]
enum AdminLogs { Table, Id, AdminUsername, Action, TargetId, Details, CreatedAt }