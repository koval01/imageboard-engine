use crate::config::{Config, StorageType};
use crate::model::images;
use anyhow::{anyhow, Context, Result};
use aws_config::meta::region::RegionProviderChain;
use aws_config::BehaviorVersion;
use aws_credential_types::Credentials;
use aws_sdk_s3::{config::Region, Client};
use bytes::Bytes;
use image::{imageops::FilterType, GenericImageView};
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QuerySelect};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tokio::fs;
use uuid::Uuid;
use webp::Encoder;

pub struct StorageService {
    s3_client: Option<Client>,
    s3_bucket: String,
    local_path: PathBuf,
    storage_type: StorageType,
}

#[derive(Debug)]
pub struct ProcessedImage {
    pub url: String,
    pub thumbnail_url: String,
    pub storage_key: String,
    pub filename: String,
    pub width: i32,
    pub height: i32,
    pub size: i64,
    pub hash: String,
}

// Configuration constants
const MAX_WIDTH: u32 = 2000;
const MAX_HEIGHT: u32 = 2000;
const IMAGE_QUALITY: f32 = 72.0;
const THUMB_QUALITY: f32 = 55.0;

impl StorageService {
    pub async fn init(config: &Config) -> Self {
        let mut s3_client = None;
        let mut s3_bucket = String::new();

        if config.storage_type == StorageType::S3 {
            let region_provider = RegionProviderChain::default_provider().or_else(Region::new("auto"));
            let credentials = Credentials::new(
                std::env::var("S3_ACCESS_KEY").expect("S3_ACCESS_KEY must be set for S3 storage"),
                std::env::var("S3_SECRET_KEY").expect("S3_SECRET_KEY must be set for S3 storage"),
                None,
                None,
                "Static",
            );

            let aws_config = aws_config::defaults(BehaviorVersion::latest())
                .region(region_provider)
                .endpoint_url(std::env::var("S3_ENDPOINT").expect("S3_ENDPOINT not set"))
                .credentials_provider(credentials)
                .load()
                .await;

            s3_client = Some(Client::new(&aws_config));
            s3_bucket = std::env::var("S3_BUCKET_NAME").expect("S3_BUCKET_NAME not set");
        } else {
            // Ensure local directory exists
            fs::create_dir_all(&config.media_path)
                .await
                .expect("Failed to create media directory");
        }

        Self {
            s3_client,
            s3_bucket,
            local_path: PathBuf::from(&config.media_path),
            storage_type: config.storage_type.clone(),
        }
    }

    /// Calculates SHA256 hash of byte slice
    fn calculate_hash(data: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data);
        hex::encode(hasher.finalize())
    }

    /// Internal method to actually write the file to the selected backend
    async fn save_file(&self, key: &str, data: Vec<u8>, content_type: &str) -> Result<()> {
        match self.storage_type {
            StorageType::S3 => {
                let client = self.s3_client.as_ref().unwrap();
                client
                    .put_object()
                    .bucket(&self.s3_bucket)
                    .key(key)
                    .body(data.into())
                    .content_type(content_type)
                    .cache_control("max-age=31536000")
                    .send()
                    .await
                    .context("Failed to upload to S3")?;
            }
            StorageType::Local => {
                let file_path = self.local_path.join(key);
                fs::write(file_path, data)
                    .await
                    .context("Failed to write file locally")?;
            }
        }
        Ok(())
    }

    pub async fn upload_image(
        &self,
        file_bytes: Bytes,
        original_filename: String,
        db: &DatabaseConnection,
    ) -> Result<ProcessedImage> {
        // 1. Process Image (Resize & WebP Conversion)
        let (full_img_bytes, thumb_img_bytes, width, height) =
            tokio::task::spawn_blocking(move || {
                let img = image::load_from_memory(&file_bytes)
                    .context("Failed to load image from memory")?;

                let (w, h) = img.dimensions();

                // Resize logic
                let processed_img = if w > MAX_WIDTH || h > MAX_HEIGHT {
                    img.resize(MAX_WIDTH, MAX_HEIGHT, FilterType::Lanczos3)
                } else {
                    img.clone()
                };

                let (final_w, final_h) = processed_img.dimensions();

                // WebP Encoding
                let encoder = Encoder::from_image(&processed_img)
                    .map_err(|e| anyhow!("WebP encoding failed: {:?}", e))?;
                let webp_data = encoder.encode(IMAGE_QUALITY);
                let main_bytes = webp_data.to_vec();

                // Thumbnail Logic
                let thumb_img = img.thumbnail(384, 384);
                let thumb_encoder = Encoder::from_image(&thumb_img)
                    .map_err(|e| anyhow!("Thumbnail WebP encoding failed: {:?}", e))?;
                let thumb_data = thumb_encoder.encode(THUMB_QUALITY);
                let thumb_bytes = thumb_data.to_vec();

                Ok::<(Vec<u8>, Vec<u8>, u32, u32), anyhow::Error>((
                    main_bytes,
                    thumb_bytes,
                    final_w,
                    final_h,
                ))
            })
                .await??;

        // 2. Calculate Hash of the main processed image
        let hash = Self::calculate_hash(&full_img_bytes);

        // 3. Deduplication: Check if this hash already exists in DB
        // We only need one record to get the storage_key
        let existing_image = images::Entity::find()
            .filter(images::Column::Hash.eq(&hash))
            .one(db)
            .await?;

        if let Some(img) = existing_image {
            // DEDUPLICATION HIT
            // Return struct pointing to EXISTING storage keys
            // But use the NEW original_filename (so user sees their filename, but backend uses same file)
            return Ok(ProcessedImage {
                url: img.url,
                thumbnail_url: img.thumbnail_url,
                storage_key: img.storage_key,
                filename: original_filename,
                width: img.width,
                height: img.height,
                size: img.size,
                hash,
            });
        }

        // 4. If unique, generate new keys and Upload
        let uuid = Uuid::new_v4();
        let key_main = format!("{}.webp", uuid);
        let key_thumb = format!("{}_thumb.webp", uuid);

        self.save_file(&key_main, full_img_bytes.clone(), "image/webp").await?;
        self.save_file(&key_thumb, thumb_img_bytes, "image/webp").await?;

        Ok(ProcessedImage {
            url: key_main.clone(),
            thumbnail_url: key_thumb,
            storage_key: key_main,
            filename: original_filename,
            width: width as i32,
            height: height as i32,
            size: full_img_bytes.len() as i64,
            hash,
        })
    }
}
