use anyhow::{anyhow, bail, Result};
use argon2::{
    password_hash::{rand_core::OsRng, SaltString},
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
};
use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Set,
};
use uuid::Uuid;
use crate::model::{todos, users, Todo, User};

pub async fn create_user(
    email: String,
    password: String,
    username: String,
    db: &DatabaseConnection,
) -> Result<User> {
    let user_exists = users::Entity::find()
        .filter(users::Column::Email.eq(email.to_ascii_lowercase()))
        .one(db)
        .await
        .map_err(|e| anyhow!("database error: {}", e))?;

    if user_exists.is_some() {
        bail!("the email is already in use.");
    }

    let salt = SaltString::generate(&mut OsRng);
    let hashed_password = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| anyhow!("failed to hash password: {}", e))
        .map(|hash| hash.to_string())?;

    let uuid = Uuid::new_v4().to_string();

    let new_user = users::ActiveModel {
        id: Set(uuid),
        email: Set(email.to_ascii_lowercase()),
        username: Set(username),
        password: Set(hashed_password),
        ..Default::default()
    };

    let user = new_user
        .insert(db)
        .await
        .map_err(|e| anyhow!("database error: {}", e))?;

    Ok(user)
}

pub async fn check_email_password(
    email: String,
    password: String,
    db: &DatabaseConnection,
) -> Result<User> {
    let email = email.to_ascii_lowercase();

    let user = users::Entity::find()
        .filter(users::Column::Email.eq(email))
        .one(db)
        .await
        .map_err(|e| anyhow!("database error: {}", e))?
        .ok_or_else(|| anyhow!("invalid email or password."))?;

    let is_valid = match PasswordHash::new(&user.password) {
        Ok(parsed_hash) => Argon2::default()
            .verify_password(password.as_bytes(), &parsed_hash)
            .map_or(false, |_| true),
        Err(_) => false,
    };

    if !is_valid {
        bail!("invalid email or password.");
    }

    Ok(user)
}

pub async fn get_user_by_id(user_id: &str, db: &DatabaseConnection) -> Result<Option<User>, String> {
    users::Entity::find_by_id(user_id)
        .one(db)
        .await
        .map_err(|e| format!("error fetching user from database: {}", e))
}

pub async fn add_todo(
    created_by: String,
    title: String,
    description: String,
    db: &DatabaseConnection,
) -> Result<Todo> {
    let new_todo = todos::ActiveModel {
        created_by: Set(created_by),
        title: Set(title),
        description: Set(description),
        status: Set(false),
        created_at: Set(Utc::now().naive_utc()),
        ..Default::default()
    };

    let todo = new_todo
        .insert(db)
        .await
        .map_err(|e| anyhow!("database error: {}", e))?;

    Ok(todo)
}

pub async fn get_all_todos(created_by: String, db: &DatabaseConnection) -> Result<Vec<Todo>> {
    let todos = todos::Entity::find()
        .filter(todos::Column::CreatedBy.eq(created_by))
        .order_by_desc(todos::Column::CreatedAt)
        .all(db)
        .await
        .map_err(|e| anyhow!("database error: {}", e))?;

    Ok(todos)
}

pub async fn get_todo_by_id(todo_id: i64, db: &DatabaseConnection) -> Result<Todo> {
    let todo = todos::Entity::find_by_id(todo_id)
        .one(db)
        .await
        .map_err(|e| anyhow!("database error: {}", e))?
        .ok_or_else(|| anyhow!("todo does not exist in the database."))?;

    Ok(todo)
}

pub async fn remove_todo(todo_id: i64, db: &DatabaseConnection) -> Result<()> {
    let result = todos::Entity::delete_by_id(todo_id)
        .exec(db)
        .await
        .map_err(|e| anyhow!("database error: {}", e))?;

    if result.rows_affected == 0 {
        bail!(format!("Todo with ID: {} not found", todo_id));
    }

    Ok(())
}

pub async fn update_todo(
    title: String,
    description: String,
    status: bool,
    todo_id: i64,
    db: &DatabaseConnection,
) -> Result<()> {
    let todo: Option<todos::Model> = todos::Entity::find_by_id(todo_id)
        .one(db)
        .await
        .map_err(|e| anyhow!("database error: {}", e))?;

    let todo = if let Some(t) = todo {
        t
    } else {
        bail!(format!("Todo with ID: {} not found", todo_id));
    };

    let mut active_todo: todos::ActiveModel = todo.into();
    active_todo.title = Set(title);
    active_todo.description = Set(description);
    active_todo.status = Set(status);

    active_todo
        .update(db)
        .await
        .map_err(|e| anyhow!("database error: {}", e))?;

    Ok(())
}
