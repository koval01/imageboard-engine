use crate::config::{Config, StorageType};
use crate::model::images;
use anyhow::{anyhow, Context, Result};
use aws_config::meta::region::RegionProviderChain;
use aws_config::BehaviorVersion;
use aws_credential_types::Credentials;
use aws_sdk_s3::{config::Region, Client};
use bytes::Bytes;
use image::{imageops::FilterType, GenericImageView};
use exif::{Reader as ExifReader, Tag};
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter};
use sha2::{Digest, Sha256};
use std::io::Cursor;
use std::path::PathBuf;
use tokio::fs;
use uuid::Uuid;
use webp::Encoder;
use image_hasher::{HasherConfig, HashAlg};

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
    pub phash: String, // Added Perceptual Hash
    pub exif: Option<serde_json::Value>,
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

    fn calculate_hash(data: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data);
        hex::encode(hasher.finalize())
    }

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

    pub async fn delete_file(&self, key: &str) -> Result<()> {
        match self.storage_type {
            StorageType::S3 => {
                let client = self.s3_client.as_ref().unwrap();
                client
                    .delete_object()
                    .bucket(&self.s3_bucket)
                    .key(key)
                    .send()
                    .await
                    .context("Failed to delete from S3")?;
            }
            StorageType::Local => {
                let file_path = self.local_path.join(key);
                if file_path.exists() {
                    fs::remove_file(file_path)
                        .await
                        .context("Failed to delete local file")?;
                }
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
        // 1. Process Image & Extract EXIF & Calculate pHash (Blocking Task)
        let (full_img_bytes, thumb_img_bytes, width, height, exif_json, phash_str) =
            tokio::task::spawn_blocking(move || {
                // --- EXIF Extraction ---
                let mut exif_map = serde_json::Map::new();
                let exif_reader = ExifReader::new();
                let mut cursor = Cursor::new(&file_bytes);

                if let Ok(exif) = exif_reader.read_from_container(&mut cursor) {
                    let tags_of_interest = vec![
                        Tag::DateTimeOriginal,
                        Tag::DateTime,
                        Tag::Make,
                        Tag::Model,
                        Tag::Software,
                        Tag::GPSLatitude,
                        Tag::GPSLatitudeRef,
                        Tag::GPSLongitude,
                        Tag::GPSLongitudeRef,
                        Tag::GPSAltitude,
                        Tag::BodySerialNumber,
                        Tag::LensModel,
                    ];

                    for field in exif.fields() {
                        if tags_of_interest.contains(&field.tag) {
                            let val_str = field.display_value().with_unit(&exif).to_string();
                            let clean_val = val_str.trim_matches(char::from(0)).to_string();
                            exif_map.insert(
                                field.tag.description().unwrap_or(field.tag.to_string().as_str()).to_string(),
                                serde_json::Value::String(clean_val)
                            );
                        }
                    }
                }

                let exif_value = if exif_map.is_empty() {
                    None
                } else {
                    Some(serde_json::Value::Object(exif_map))
                };

                // --- Image Loading ---
                let img = image::load_from_memory(&file_bytes)
                    .context("Failed to load image from memory")?;

                // --- Perceptual Hash Calculation ---
                let hasher = HasherConfig::new().hash_alg(HashAlg::Mean).to_hasher();
                let phash = hasher.hash_image(&img);
                let phash_base64 = phash.to_base64();

                // --- Resizing ---
                let (w, h) = img.dimensions();

                let processed_img = if w > MAX_WIDTH || h > MAX_HEIGHT {
                    img.resize(MAX_WIDTH, MAX_HEIGHT, FilterType::Lanczos3)
                } else {
                    img.clone()
                };

                let (final_w, final_h) = processed_img.dimensions();

                let encoder = Encoder::from_image(&processed_img)
                    .map_err(|e| anyhow!("WebP encoding failed: {:?}", e))?;
                let webp_data = encoder.encode(IMAGE_QUALITY);
                let main_bytes = webp_data.to_vec();

                let thumb_img = img.thumbnail(384, 384);
                let thumb_encoder = Encoder::from_image(&thumb_img)
                    .map_err(|e| anyhow!("Thumbnail WebP encoding failed: {:?}", e))?;
                let thumb_data = thumb_encoder.encode(THUMB_QUALITY);
                let thumb_bytes = thumb_data.to_vec();

                Ok::<(Vec<u8>, Vec<u8>, u32, u32, Option<serde_json::Value>, String), anyhow::Error>((
                    main_bytes,
                    thumb_bytes,
                    final_w,
                    final_h,
                    exif_value,
                    phash_base64
                ))
            })
                .await??;

        // 2. Calculate SHA256 Hash (Exact Match)
        let hash = Self::calculate_hash(&full_img_bytes);

        // 3. Deduplication Check (Exact match)
        let existing_image = images::Entity::find()
            .filter(images::Column::Hash.eq(&hash))
            .one(db)
            .await?;

        if let Some(img) = existing_image {
            return Ok(ProcessedImage {
                url: img.url,
                thumbnail_url: img.thumbnail_url,
                storage_key: img.storage_key,
                filename: original_filename,
                width: img.width,
                height: img.height,
                size: img.size,
                hash,
                phash: img.phash,
                exif: img.exif,
            });
        }

        // 4. Save New Files
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
            phash: phash_str,
            exif: exif_json,
        })
    }
}
