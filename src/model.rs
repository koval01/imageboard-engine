use chrono::NaiveDateTime;
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct SessionClaims {
    pub sess: String,
    pub ip: String,
    pub ua: String,
    pub exp: usize,
    pub iat: usize,
}

#[derive(Debug, Deserialize)]
pub struct CreateThreadSchema {
    pub subject: Option<String>,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct CreatePostSchema {
    pub content: String,
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
        fn to() -> RelationDef {
            Relation::Threads.def()
        }
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
        pub created_at: NaiveDateTime,
        pub updated_at: NaiveDateTime,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(
            belongs_to = "super::boards::Entity",
            from = "Column::BoardSlug",
            to = "super::boards::Column::Slug",
            on_update = "NoAction",
            on_delete = "Cascade"
        )]
        Board,
        #[sea_orm(has_many = "super::posts::Entity")]
        Posts,
    }

    impl Related<super::boards::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Board.def()
        }
    }

    impl Related<super::posts::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Posts.def()
        }
    }

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
        pub created_at: NaiveDateTime,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(
            belongs_to = "super::threads::Entity",
            from = "Column::ThreadId",
            to = "super::threads::Column::Id",
            on_update = "NoAction",
            on_delete = "Cascade"
        )]
        Thread,
    }

    impl Related<super::threads::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Thread.def()
        }
    }

    impl ActiveModelBehavior for ActiveModel {}
}

pub use boards::Model as Board;
pub use threads::Model as Thread;
pub use posts::Model as Post;
