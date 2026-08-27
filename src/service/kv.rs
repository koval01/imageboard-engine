use anyhow::{Context, Result};
use moka::future::Cache;
use redis::AsyncCommands;
use std::time::Duration;

/// Rate-limit / PoW / login-lockout store. Uses Redis when `REDIS_URL` is set,
/// otherwise an in-process moka cache (unit tests and local `cargo run`).
#[derive(Clone)]
pub struct KvStore {
    redis: Option<redis::aio::ConnectionManager>,
    fallback: Cache<String, String>,
}

impl KvStore {
    pub async fn connect(redis_url: Option<&str>) -> Result<Self> {
        let fallback = Cache::builder()
            .max_capacity(20_000)
            .time_to_live(Duration::from_secs(60 * 60))
            .build();

        let redis = if let Some(url) = redis_url {
            let client = redis::Client::open(url).context("invalid REDIS_URL")?;
            let mgr = redis::aio::ConnectionManager::new(client)
                .await
                .context("failed to connect to Redis")?;
            tracing::info!("Connected to Redis");
            Some(mgr)
        } else {
            tracing::info!("REDIS_URL not set; using in-memory rate-limit store");
            None
        };

        Ok(Self { redis, fallback })
    }

    pub async fn get(&self, key: &str) -> Option<String> {
        if let Some(mut conn) = self.redis.clone() {
            return conn.get::<_, Option<String>>(key).await.ok().flatten();
        }
        self.fallback.get(key).await
    }

    pub async fn set(&self, key: &str, value: &str, ttl_secs: u64) {
        if let Some(mut conn) = self.redis.clone() {
            let _: Result<(), _> = conn.set_ex(key, value, ttl_secs).await;
            return;
        }
        self.fallback.insert(key.to_string(), value.to_string()).await;
    }

    /// Returns true if the key was newly set (first use). False means replay.
    pub async fn set_nx(&self, key: &str, value: &str, ttl_secs: u64) -> bool {
        if let Some(mut conn) = self.redis.clone() {
            let result: Result<Option<String>, _> = redis::cmd("SET")
                .arg(key)
                .arg(value)
                .arg("NX")
                .arg("EX")
                .arg(ttl_secs)
                .query_async(&mut conn)
                .await;
            return matches!(result, Ok(Some(_)));
        }
        if self.fallback.get(key).await.is_some() {
            return false;
        }
        self.fallback.insert(key.to_string(), value.to_string()).await;
        true
    }

    pub async fn del(&self, key: &str) {
        if let Some(mut conn) = self.redis.clone() {
            let _: Result<(), _> = conn.del(key).await;
            return;
        }
        self.fallback.invalidate(key).await;
    }

    pub async fn incr(&self, key: &str, ttl_secs: u64) -> u32 {
        let next = self.get(key).await.and_then(|v| v.parse::<u32>().ok()).unwrap_or(0) + 1;
        self.set(key, &next.to_string(), ttl_secs).await;
        next
    }
}
