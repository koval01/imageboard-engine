use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Reports::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Reports::Id).integer().not_null().auto_increment().primary_key())
                    .col(ColumnDef::new(Reports::PostId).integer().not_null())
                    .col(ColumnDef::new(Reports::Reason).string().not_null())
                    .col(ColumnDef::new(Reports::Status).string().not_null().default("OPEN")) // OPEN, RESOLVED, REJECTED
                    .col(ColumnDef::new(Reports::IpAddress).string().not_null())
                    .col(ColumnDef::new(Reports::CreatedAt).timestamp().not_null().default(Expr::current_timestamp()))
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager.drop_table(Table::drop().table(Reports::Table).to_owned()).await
    }
}

#[derive(DeriveIden)]
enum Reports {
    Table,
    Id,
    PostId,
    Reason,
    Status,
    IpAddress,
    CreatedAt,
}