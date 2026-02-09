use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Add country_code to threads
        manager
            .alter_table(
                Table::alter()
                    .table(Threads::Table)
                    .add_column(ColumnDef::new(Threads::CountryCode).string().null())
                    .to_owned(),
            )
            .await?;

        // Add country_code to posts
        manager
            .alter_table(
                Table::alter()
                    .table(Posts::Table)
                    .add_column(ColumnDef::new(Posts::CountryCode).string().null())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Threads::Table)
                    .drop_column(Threads::CountryCode)
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Posts::Table)
                    .drop_column(Posts::CountryCode)
                    .to_owned(),
            )
            .await
    }
}

#[derive(DeriveIden)]
enum Threads {
    Table,
    CountryCode,
}

#[derive(DeriveIden)]
enum Posts {
    Table,
    CountryCode,
}
