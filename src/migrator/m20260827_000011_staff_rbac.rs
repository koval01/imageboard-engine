use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Admins::Table)
                    .add_column(ColumnDef::new(Admins::Privileges).text().not_null().default("{}"))
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Admins::Table)
                    .add_column(ColumnDef::new(Admins::WorkStart).string())
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Admins::Table)
                    .add_column(ColumnDef::new(Admins::WorkEnd).string())
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Admins::Table)
                    .add_column(ColumnDef::new(Admins::Timezone).string().not_null().default("Europe/Kyiv"))
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Admins::Table)
                    .add_column(ColumnDef::new(Admins::RateLimitPerHour).integer())
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Admins::Table)
                    .add_column(ColumnDef::new(Admins::Disabled).boolean().not_null().default(false))
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Admins::Table)
                    .add_column(ColumnDef::new(Admins::LastLoginAt).timestamp())
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Admins::Table)
                    .add_column(ColumnDef::new(Admins::LastLoginIp).string())
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(AdminLogs::Table)
                    .add_column(ColumnDef::new(AdminLogs::IpAddress).string())
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Bans::Table)
                    .add_column(ColumnDef::new(Bans::Cidr).string())
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Bans::Table)
                    .add_column(ColumnDef::new(Bans::Scope).string().not_null().default("site"))
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Bans::Table)
                    .add_column(ColumnDef::new(Bans::BoardSlug).string())
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Bans::Table)
                    .add_column(ColumnDef::new(Bans::Kind).string().not_null().default("post"))
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Bans::Table)
                    .add_column(ColumnDef::new(Bans::CreatedBy).string())
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Posts::Table)
                    .add_column(ColumnDef::new(Posts::IsHidden).boolean().not_null().default(false))
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Threads::Table)
                    .add_column(ColumnDef::new(Threads::IsHidden).boolean().not_null().default(false))
                    .to_owned(),
            )
            .await?;

        manager
            .get_connection()
            .execute_unprepared(
                "UPDATE admins SET username = 'admin' WHERE role = 3 AND username <> 'admin' AND NOT EXISTS (SELECT 1 FROM admins a2 WHERE a2.username = 'admin')",
            )
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        for (table, col) in [
            (Admins::Table.into_iden(), Admins::Privileges.into_iden()),
            (Admins::Table.into_iden(), Admins::WorkStart.into_iden()),
            (Admins::Table.into_iden(), Admins::WorkEnd.into_iden()),
            (Admins::Table.into_iden(), Admins::Timezone.into_iden()),
            (Admins::Table.into_iden(), Admins::RateLimitPerHour.into_iden()),
            (Admins::Table.into_iden(), Admins::Disabled.into_iden()),
            (Admins::Table.into_iden(), Admins::LastLoginAt.into_iden()),
            (Admins::Table.into_iden(), Admins::LastLoginIp.into_iden()),
        ] {
            let _ = manager
                .alter_table(Table::alter().table(table).drop_column(col).to_owned())
                .await;
        }
        Ok(())
    }
}

#[derive(DeriveIden)]
enum Admins {
    Table,
    Privileges,
    WorkStart,
    WorkEnd,
    Timezone,
    RateLimitPerHour,
    Disabled,
    LastLoginAt,
    LastLoginIp,
}

#[derive(DeriveIden)]
enum AdminLogs {
    Table,
    IpAddress,
}

#[derive(DeriveIden)]
enum Bans {
    Table,
    Cidr,
    Scope,
    BoardSlug,
    Kind,
    CreatedBy,
}

#[derive(DeriveIden)]
enum Posts {
    Table,
    IsHidden,
}

#[derive(DeriveIden)]
enum Threads {
    Table,
    IsHidden,
}
