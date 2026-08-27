use anyhow::{Context, Result};
use chrono::Utc;
use sea_orm::{
    ColumnTrait, Condition, DatabaseConnection, EntityTrait, PaginatorTrait, QueryFilter,
};
use std::collections::{HashMap, HashSet};

use crate::model::{images, posts, reports, threads};
use crate::service::StorageService;
use sea_orm::sea_query::Expr;

fn object_key(raw: &str) -> String {
    let trimmed = raw.split('?').next().unwrap_or(raw).trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return trimmed.rsplit('/').next().unwrap_or(trimmed).to_string();
    }
    trimmed.to_string()
}

fn keys_of(img: &images::Model) -> Vec<String> {
    let mut keys = Vec::new();
    for raw in [&img.storage_key, &img.url, &img.thumbnail_url] {
        let k = object_key(raw);
        if !k.is_empty() && !keys.contains(&k) {
            keys.push(k);
        }
    }
    keys
}

async fn count_refs(db: &DatabaseConnection, key: &str) -> Result<u64> {
    let n = images::Entity::find()
        .filter(
            Condition::any()
                .add(images::Column::StorageKey.eq(key))
                .add(images::Column::Url.eq(key))
                .add(images::Column::ThumbnailUrl.eq(key)),
        )
        .count(db)
        .await
        .context("failed to count image references")?;
    Ok(n)
}

async fn delete_unreferenced(
    db: &DatabaseConnection,
    storage: &StorageService,
    to_delete: &[images::Model],
) -> Result<()> {
    let mut delete_counts: HashMap<String, u64> = HashMap::new();
    for img in to_delete {
        for k in keys_of(img) {
            *delete_counts.entry(k).or_insert(0) += 1;
        }
    }

    let unique: HashSet<String> = delete_counts.keys().cloned().collect();
    for key in unique {
        let total = count_refs(db, &key).await?;
        let removing = *delete_counts.get(&key).unwrap_or(&0);
        let remaining = total.saturating_sub(removing);
        if remaining == 0 {
            storage
                .delete_file(&key)
                .await
                .with_context(|| format!("failed to delete storage object {key}"))?;
        }
    }
    Ok(())
}

pub async fn images_for_post(db: &DatabaseConnection, post_id: i32) -> Result<Vec<images::Model>> {
    Ok(images::Entity::find()
        .filter(images::Column::PostId.eq(post_id))
        .all(db)
        .await?)
}

pub async fn images_for_thread(
    db: &DatabaseConnection,
    thread_id: i32,
) -> Result<Vec<images::Model>> {
    let reply_ids: Vec<i32> = posts::Entity::find()
        .filter(posts::Column::ThreadId.eq(thread_id))
        .all(db)
        .await?
        .into_iter()
        .map(|p| p.id)
        .collect();

    let mut cond = Condition::any().add(images::Column::ThreadId.eq(thread_id));
    if !reply_ids.is_empty() {
        cond = cond.add(images::Column::PostId.is_in(reply_ids));
    }

    Ok(images::Entity::find().filter(cond).all(db).await?)
}

pub async fn purge_post(
    db: &DatabaseConnection,
    storage: &StorageService,
    post_id: i32,
) -> Result<()> {
    let imgs = images_for_post(db, post_id).await?;
    delete_unreferenced(db, storage, &imgs).await?;
    posts::Entity::delete_by_id(post_id)
        .exec(db)
        .await
        .context("failed to delete post row")?;
    Ok(())
}

pub async fn purge_thread(
    db: &DatabaseConnection,
    storage: &StorageService,
    thread_id: i32,
) -> Result<()> {
    let imgs = images_for_thread(db, thread_id).await?;
    delete_unreferenced(db, storage, &imgs).await?;
    threads::Entity::delete_by_id(thread_id)
        .exec(db)
        .await
        .context("failed to delete thread row")?;
    Ok(())
}

pub async fn purge_author_content(
    db: &DatabaseConnection,
    storage: &StorageService,
    ip: &str,
    session: Option<&str>,
) -> Result<()> {
    let mut thread_cond = Condition::any().add(threads::Column::IpAddress.eq(ip));
    let mut post_cond = Condition::any().add(posts::Column::IpAddress.eq(ip));
    if let Some(sess) = session.filter(|s| !s.is_empty()) {
        thread_cond = thread_cond.add(threads::Column::SessionId.eq(sess));
        post_cond = post_cond.add(posts::Column::SessionId.eq(sess));
    }

    let author_threads = threads::Entity::find()
        .filter(thread_cond)
        .all(db)
        .await?;
    let thread_ids: Vec<i32> = author_threads.iter().map(|t| t.id).collect();

    for tid in &thread_ids {
        purge_thread(db, storage, *tid).await?;
    }

    let leftover_posts = posts::Entity::find().filter(post_cond).all(db).await?;
    for p in leftover_posts {
        purge_post(db, storage, p.id).await?;
    }

    let report_cond = Condition::any().add(reports::Column::IpAddress.eq(ip));
    if let Some(sess) = session.filter(|s| !s.is_empty()) {
        // reports table has no session column — IP only
        let _ = sess;
    }
    reports::Entity::update_many()
        .col_expr(reports::Column::Status, Expr::value("RESOLVED"))
        .filter(report_cond)
        .exec(db)
        .await?;

    Ok(())
}

pub async fn purge_inactive_threads(
    db: &DatabaseConnection,
    storage: &StorageService,
    age_days: i64,
) -> Result<u64> {
    let cutoff = Utc::now().naive_utc() - chrono::Duration::days(age_days);
    let stale = threads::Entity::find()
        .filter(threads::Column::UpdatedAt.lt(cutoff))
        .all(db)
        .await?;
    let n = stale.len() as u64;
    for t in stale {
        if let Err(e) = purge_thread(db, storage, t.id).await {
            tracing::error!("failed to purge inactive thread {}: {e:#}", t.id);
            return Err(e);
        }
        tracing::info!("purged inactive thread {}", t.id);
    }
    Ok(n)
}

pub async fn purge_expired_media(
    db: &DatabaseConnection,
    storage: &StorageService,
    ttl_days: i64,
) -> Result<u64> {
    let cutoff = Utc::now().naive_utc() - chrono::Duration::days(ttl_days.max(1));
    let expired = images::Entity::find()
        .filter(images::Column::CreatedAt.lt(cutoff))
        .all(db)
        .await?;
    let n = expired.len() as u64;
    if n == 0 {
        return Ok(0);
    }
    delete_unreferenced(db, storage, &expired).await?;
    images::Entity::delete_many()
        .filter(images::Column::CreatedAt.lt(cutoff))
        .exec(db)
        .await
        .context("failed to delete expired image rows")?;
    Ok(n)
}
