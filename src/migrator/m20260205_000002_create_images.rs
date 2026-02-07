use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Images::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Images::Id).integer().not_null().auto_increment().primary_key())
                    .col(ColumnDef::new(Images::ThreadId).integer().null()) // Nullable: Image belongs to thread OR post
                    .col(ColumnDef::new(Images::PostId).integer().null())
                    .col(ColumnDef::new(Images::Url).string().not_null())
                    .col(ColumnDef::new(Images::ThumbnailUrl).string().not_null())
                    .col(ColumnDef::new(Images::Filename).string().not_null()) // Original filename
                    .col(ColumnDef::new(Images::StorageKey).string().not_null()) // S3 Key
                    .col(ColumnDef::new(Images::Width).integer().not_null())
                    .col(ColumnDef::new(Images::Height).integer().not_null())
                    .col(ColumnDef::new(Images::Size).integer().not_null()) // In bytes
                    .col(ColumnDef::new(Images::CreatedAt).timestamp().not_null().default(Expr::current_timestamp()))
                    .foreign_key(
                        ForeignKey::create()
                            .from(Images::Table, Images::ThreadId)
                            .to(Threads::Table, Threads::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Images::Table, Images::PostId)
                            .to(Posts::Table, Posts::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager.drop_table(Table::drop().table(Images::Table).to_owned()).await
    }
}

#[derive(DeriveIden)]
enum Images {
    Table,
    Id,
    ThreadId,
    PostId,
    Url,
    ThumbnailUrl,
    Filename,
    StorageKey,
    Width,
    Height,
    Size,
    CreatedAt,
}

#[derive(DeriveIden)]
enum Threads { Table, Id }
#[derive(DeriveIden)]
enum Posts { Table, Id }
