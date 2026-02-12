use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Images::Table)
                    .add_column(ColumnDef::new(Images::Hash).string().not_null().default(""))
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .table(Images::Table)
                    .name("idx_images_hash")
                    .col(Images::Hash)
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_index(Index::drop().name("idx_images_hash").table(Images::Table).to_owned())
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Images::Table)
                    .drop_column(Images::Hash)
                    .to_owned(),
            )
            .await
    }
}

#[derive(DeriveIden)]
enum Images {
    Table,
    Hash,
}