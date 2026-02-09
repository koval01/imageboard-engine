use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Boards::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Boards::Slug).string().not_null().primary_key())
                    .col(ColumnDef::new(Boards::Name).string().not_null())
                    .col(ColumnDef::new(Boards::Description).string().not_null())
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Threads::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Threads::Id).integer().not_null().auto_increment().primary_key())
                    .col(ColumnDef::new(Threads::BoardSlug).string().not_null())
                    .col(ColumnDef::new(Threads::Subject).string().null())
                    .col(ColumnDef::new(Threads::Content).string().not_null())
                    .col(ColumnDef::new(Threads::SessionId).string().not_null())
                    .col(ColumnDef::new(Threads::CreatedAt).timestamp().not_null().default(Expr::current_timestamp()))
                    .col(ColumnDef::new(Threads::UpdatedAt).timestamp().not_null().default(Expr::current_timestamp()))
                    .foreign_key(
                        ForeignKey::create()
                            .from(Threads::Table, Threads::BoardSlug)
                            .to(Boards::Table, Boards::Slug)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Posts::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Posts::Id).integer().not_null().auto_increment().primary_key())
                    .col(ColumnDef::new(Posts::ThreadId).integer().not_null())
                    .col(ColumnDef::new(Posts::Content).string().not_null())
                    .col(ColumnDef::new(Posts::SessionId).string().not_null())
                    .col(ColumnDef::new(Posts::CreatedAt).timestamp().not_null().default(Expr::current_timestamp()))
                    .foreign_key(
                        ForeignKey::create()
                            .from(Posts::Table, Posts::ThreadId)
                            .to(Threads::Table, Threads::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // Translated Seed Data
        let board_insert = Query::insert()
            .into_table(Boards::Table)
            .columns([Boards::Slug, Boards::Name, Boards::Description])
            .values_panic(["m".into(), "Маячня".into(), "Все підряд без правил".into()])
            .values_panic(["pol".into(), "Політика".into(), "Тут знаходяться ті самі дивани".into()])
            .values_panic(["tech".into(), "Технології".into(), "Комп'ютери, софт та залізо".into()])
            .values_panic(["a".into(), "Аніме".into(), "Японська анімація та культура".into()])
            .values_panic(["sex".into(), "Секс".into(), "Ми шануємо дрочунів".into()])
            .to_owned();

        manager.exec_stmt(board_insert).await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager.drop_table(Table::drop().table(Posts::Table).to_owned()).await?;
        manager.drop_table(Table::drop().table(Threads::Table).to_owned()).await?;
        manager.drop_table(Table::drop().table(Boards::Table).to_owned()).await
    }
}

#[derive(DeriveIden)]
enum Boards {
    Table,
    Slug,
    Name,
    Description,
}

#[derive(DeriveIden)]
enum Threads {
    Table,
    Id,
    BoardSlug,
    Subject,
    Content,
    SessionId,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum Posts {
    Table,
    Id,
    ThreadId,
    Content,
    SessionId,
    CreatedAt,
}