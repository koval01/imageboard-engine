use chrono::NaiveDateTime;
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

use crate::serialization::{deserialize_checkbox, false_fn};

// --- Request/Form Schemas ---

#[derive(Debug, Deserialize)]
pub struct RegisterUserSchema {
    pub email: String,
    pub password: String,
    pub username: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginUserSchema {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TokenClaims {
    pub sub: String,
    pub iat: usize,
    pub exp: usize,
}

#[derive(Debug, Deserialize)]
pub struct TodoSchema {
    pub title: String,
    pub description: String,
}

#[derive(Debug, Deserialize)]
pub struct TodoEditSchema {
    pub title: String,
    pub description: String,
    #[serde(default = "false_fn")]
    #[serde(deserialize_with = "deserialize_checkbox")]
    pub status: bool,
}

// --- SeaORM Entities ---

pub mod users {
    use super::*;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Deserialize, Serialize, Default)]
    #[sea_orm(table_name = "users")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        #[sea_orm(unique)]
        pub email: String,
        pub password: String,
        pub username: String,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(has_many = "super::todos::Entity")]
        Todos,
    }

    impl Related<super::todos::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Todos.def()
        }
    }

    impl ActiveModelBehavior for ActiveModel {}
}

pub mod todos {
    use super::*;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel, Deserialize, Serialize, Default)]
    #[sea_orm(table_name = "todos")]
    pub struct Model {
        #[sea_orm(primary_key)]
        pub id: i64,
        pub created_by: String,
        pub title: String,
        pub description: String,
        pub status: bool,
        pub created_at: NaiveDateTime,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(
            belongs_to = "super::users::Entity",
            from = "Column::CreatedBy",
            to = "super::users::Column::Id",
            on_update = "NoAction",
            on_delete = "NoAction"
        )]
        User,
    }

    impl Related<super::users::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::User.def()
        }
    }

    impl ActiveModelBehavior for ActiveModel {}
}

pub use todos::Model as Todo;
pub use users::Model as User;
