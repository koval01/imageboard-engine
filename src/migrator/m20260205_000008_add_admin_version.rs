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
                    .add_column(ColumnDef::new(Admins::TokenVersion).integer().not_null().default(1))
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Admins::Table)
                    .drop_column(Admins::TokenVersion)
                    .to_owned(),
            )
            .await
    }
}

#[derive(DeriveIden)]
enum Admins {
    Table,
    TokenVersion,
}
