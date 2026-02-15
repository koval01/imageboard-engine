use chrono::NaiveDateTime;
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct SessionClaims {
    pub sess: String,
    pub ip: String,
    pub ua: String,
    pub role: i32,
    pub v: i32,
    pub exp: usize,
    pub iat: usize,
}

pub mod boards {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Deserialize, Serialize)]
    #[sea_orm(table_name = "boards")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub slug: String,
        pub name: String,
        pub description: String,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(has_many = "super::threads::Entity")]
        Threads,
    }
    impl Related<super::threads::Entity> for Entity {
        fn to() -> RelationDef { Relation::Threads.def() }
    }
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod threads {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Deserialize, Serialize)]
    #[sea_orm(table_name = "threads")]
    pub struct Model {
        #[sea_orm(primary_key)]
        pub id: i32,
        pub board_slug: String,
        pub subject: Option<String>,
        pub content: String,
        pub session_id: String,
        pub country_code: Option<String>,
        pub ip_address: String,
        pub created_at: NaiveDateTime,
        pub updated_at: NaiveDateTime,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(belongs_to = "super::boards::Entity", from = "Column::BoardSlug", to = "super::boards::Column::Slug", on_update = "NoAction", on_delete = "Cascade")]
        Board,
        #[sea_orm(has_many = "super::posts::Entity")]
        Posts,
        #[sea_orm(has_many = "super::images::Entity")]
        Images,
    }
    impl Related<super::boards::Entity> for Entity { fn to() -> RelationDef { Relation::Board.def() } }
    impl Related<super::posts::Entity> for Entity { fn to() -> RelationDef { Relation::Posts.def() } }
    impl Related<super::images::Entity> for Entity { fn to() -> RelationDef { Relation::Images.def() } }
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod posts {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Deserialize, Serialize)]
    #[sea_orm(table_name = "posts")]
    pub struct Model {
        #[sea_orm(primary_key)]
        pub id: i32,
        pub thread_id: i32,
        pub content: String,
        pub session_id: String,
        pub ip_address: String,
        pub country_code: Option<String>,
        pub created_at: NaiveDateTime,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(belongs_to = "super::threads::Entity", from = "Column::ThreadId", to = "super::threads::Column::Id", on_update = "NoAction", on_delete = "Cascade")]
        Thread,
        #[sea_orm(has_many = "super::images::Entity")]
        Images,
        #[sea_orm(has_many = "super::reports::Entity")]
        Reports,
    }
    impl Related<super::threads::Entity> for Entity { fn to() -> RelationDef { Relation::Thread.def() } }
    impl Related<super::images::Entity> for Entity { fn to() -> RelationDef { Relation::Images.def() } }
    impl Related<super::reports::Entity> for Entity { fn to() -> RelationDef { Relation::Reports.def() } }
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod images {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Deserialize, Serialize)]
    #[sea_orm(table_name = "images")]
    pub struct Model {
        #[sea_orm(primary_key)]
        pub id: i32,
        pub thread_id: Option<i32>,
        pub post_id: Option<i32>,
        pub url: String,
        pub thumbnail_url: String,
        pub filename: String,
        pub storage_key: String,
        pub hash: String,
        pub width: i32,
        pub height: i32,
        pub size: i64,
        pub exif: Option<serde_json::Value>, // Added field
        pub created_at: NaiveDateTime,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(belongs_to = "super::threads::Entity", from = "Column::ThreadId", to = "super::threads::Column::Id", on_update = "NoAction", on_delete = "Cascade")]
        Thread,
        #[sea_orm(belongs_to = "super::posts::Entity", from = "Column::PostId", to = "super::posts::Column::Id", on_update = "NoAction", on_delete = "Cascade")]
        Post,
    }
    impl Related<super::threads::Entity> for Entity { fn to() -> RelationDef { Relation::Thread.def() } }
    impl Related<super::posts::Entity> for Entity { fn to() -> RelationDef { Relation::Post.def() } }
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod admins {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Deserialize, Serialize)]
    #[sea_orm(table_name = "admins")]
    pub struct Model {
        #[sea_orm(primary_key)]
        pub id: i32,
        pub username: String,
        pub service_key: String,
        pub role: i32,
        pub token_version: i32,
        pub created_at: NaiveDateTime,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod bans {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Deserialize, Serialize)]
    #[sea_orm(table_name = "bans")]
    pub struct Model {
        #[sea_orm(primary_key)]
        pub id: i32,
        pub ip_address: Option<String>,
        pub session_id: Option<String>,
        pub reason: Option<String>,
        pub expires_at: NaiveDateTime,
        pub created_at: NaiveDateTime,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod admin_logs {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Deserialize, Serialize)]
    #[sea_orm(table_name = "admin_logs")]
    pub struct Model {
        #[sea_orm(primary_key)]
        pub id: i32,
        pub admin_username: String,
        pub action: String,
        pub target_id: Option<String>,
        pub details: Option<String>,
        pub created_at: NaiveDateTime,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}

pub mod reports {
    use super::*;
    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Deserialize, Serialize)]
    #[sea_orm(table_name = "reports")]
    pub struct Model {
        #[sea_orm(primary_key)]
        pub id: i32,
        pub post_id: i32,
        pub reason: String,
        pub status: String,
        pub ip_address: String,
        pub created_at: NaiveDateTime,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(belongs_to = "super::posts::Entity", from = "Column::PostId", to = "super::posts::Column::Id", on_update = "NoAction", on_delete = "Cascade")]
        Post,
    }
    impl Related<super::posts::Entity> for Entity { fn to() -> RelationDef { Relation::Post.def() } }
    impl ActiveModelBehavior for ActiveModel {}
}
