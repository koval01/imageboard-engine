use crate::config::{Config, StorageType};
use crate::model::images;
use crate::service::sanitize_exif_value;
use anyhow::{anyhow, Context, Result};
use aws_config::meta::region::RegionProviderChain;
use aws_config::BehaviorVersion;
use aws_credential_types::Credentials;
use aws_sdk_s3::{config::Region, Client};
use bytes::Bytes;
use image::{imageops::FilterType, DynamicImage, GenericImageView, ImageDecoder, ImageFormat, ImageReader, Limits};
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
    cache_control: String,
}

#[derive(Debug)]
pub struct ProcessedImage {
    pub url: String,
    pub thumbnail_url: String,
    pub storage_key: String,
    pub filename: String,
    pub width: i32,
    pub height: i32,
    pub size: i32,
    pub hash: String,
    pub phash: String,
    pub exif: Option<serde_json::Value>,
}

const MAX_WIDTH: u32 = 1280;
const MAX_HEIGHT: u32 = 1280;
const MAX_SRC_SIDE: u32 = 8000;
const MAX_PIXELS: u64 = 25_000_000;
const IMAGE_QUALITY: f32 = 48.0;
const THUMB_QUALITY: f32 = 36.0;
const THUMB_SIZE: u32 = 256;

pub fn is_declared_raster_content_type(ct: &str) -> bool {
    matches!(
        ct.trim().to_ascii_lowercase().as_str(),
        "image/jpeg" | "image/jpg" | "image/pjpeg" | "image/png" | "image/gif" | "image/webp"
    )
}

pub fn sniff_raster_image(data: &[u8]) -> bool {
    if data.len() < 12 {
        return false;
    }
    data.starts_with(&[0xFF, 0xD8, 0xFF])
        || data.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A])
        || data.starts_with(b"GIF87a")
        || data.starts_with(b"GIF89a")
        || (data.starts_with(b"RIFF") && data.get(8..12) == Some(&b"WEBP"[..]))
}

pub fn decode_allowed_raster(bytes: &[u8]) -> Result<DynamicImage> {
    if !sniff_raster_image(bytes) {
        return Err(anyhow!("Потрібне зображення (JPEG, PNG, WebP, GIF)."));
    }
    let reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .context("Потрібне зображення (JPEG, PNG, WebP, GIF).")?;
    match reader.format() {
        Some(ImageFormat::Jpeg | ImageFormat::Png | ImageFormat::Gif | ImageFormat::WebP) => {}
        _ => return Err(anyhow!("Потрібне зображення (JPEG, PNG, WebP, GIF).")),
    }
    let mut reader = reader;
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_SRC_SIDE);
    limits.max_image_height = Some(MAX_SRC_SIDE);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    let decoder = reader
        .into_decoder()
        .context("Потрібне зображення (JPEG, PNG, WebP, GIF).")?;
    let (w, h) = decoder.dimensions();
    if w == 0 || h == 0 {
        return Err(anyhow!("Порожнє зображення."));
    }
    if (w as u64).saturating_mul(h as u64) > MAX_PIXELS {
        return Err(anyhow!("Зображення занадто велике."));
    }
    let img = DynamicImage::from_decoder(decoder).context("Не вдалося прочитати зображення.")?;
    Ok(DynamicImage::ImageRgb8(img.into_rgb8()))
}

impl StorageService {
    pub async fn init(config: &Config) -> Self {
        let mut s3_client = None;
        let mut s3_bucket = String::new();

        if config.storage_type == StorageType::S3 {
            let region_provider = RegionProviderChain::default_provider().or_else(Region::new("us-east-1"));
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

            let s3_conf = aws_sdk_s3::config::Builder::from(&aws_config)
                .force_path_style(true)
                .build();
            let client = Client::from_conf(s3_conf);
            s3_bucket = std::env::var("S3_BUCKET_NAME").expect("S3_BUCKET_NAME not set");
            ensure_bucket(&client, &s3_bucket)
                .await
                .unwrap_or_else(|e| panic!("Silo/S3 bucket setup failed: {e:#}"));
            s3_client = Some(client);
        } else {
            fs::create_dir_all(&config.media_path)
                .await
                .expect("Failed to create media directory");
        }

        let cache_control = format!(
            "public, max-age={}",
            config.media_ttl_days.max(1) as u64 * 86_400
        );

        Self {
            s3_client,
            s3_bucket,
            local_path: PathBuf::from(&config.media_path),
            storage_type: config.storage_type.clone(),
            cache_control,
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
                    .cache_control(&self.cache_control)
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
        let key = normalize_object_key(key);
        match self.storage_type {
            StorageType::S3 => {
                let client = self.s3_client.as_ref().unwrap();
                client
                    .delete_object()
                    .bucket(&self.s3_bucket)
                    .key(&key)
                    .send()
                    .await
                    .context("Failed to delete from S3")?;
            }
            StorageType::Local => {
                let file_path = self.local_path.join(&key);
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
        let original_filename = crate::service::sanitize_filename(&original_filename);

        let (full_img_bytes, thumb_img_bytes, width, height, exif_json, phash_str) =
            tokio::task::spawn_blocking(move || {
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
                            let clean_val = sanitize_exif_value(&val_str);
                            if clean_val.is_empty() {
                                continue;
                            }
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

                let img = decode_allowed_raster(&file_bytes)?;

                let hasher = HasherConfig::new().hash_alg(HashAlg::Mean).to_hasher();
                let phash = hasher.hash_image(&img);
                let phash_base64 = phash.to_base64();

                let (w, h) = img.dimensions();

                let processed_img = if w > MAX_WIDTH || h > MAX_HEIGHT {
                    img.resize(MAX_WIDTH, MAX_HEIGHT, FilterType::Lanczos3)
                } else {
                    img
                };

                let (final_w, final_h) = processed_img.dimensions();

                let encoder = Encoder::from_image(&processed_img)
                    .map_err(|e| anyhow!("WebP encoding failed: {:?}", e))?;
                let webp_data = encoder.encode(IMAGE_QUALITY);
                let main_bytes = webp_data.to_vec();

                let thumb_img = processed_img.thumbnail(THUMB_SIZE, THUMB_SIZE);
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

        let hash = Self::calculate_hash(&full_img_bytes);

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
            size: full_img_bytes.len() as i32,
            hash,
            phash: phash_str,
            exif: exif_json,
        })
    }
}

fn normalize_object_key(raw: &str) -> String {
    let trimmed = raw.split('?').next().unwrap_or(raw).trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return trimmed.rsplit('/').next().unwrap_or(trimmed).to_string();
    }
    trimmed.to_string()
}

async fn ensure_bucket(client: &Client, bucket: &str) -> Result<()> {
    match client.create_bucket().bucket(bucket).send().await {
        Ok(_) => tracing::info!("Created object bucket {bucket}"),
        Err(e) => {
            let msg = format!("{e:?}");
            if !msg.contains("BucketAlready")
                && !msg.to_lowercase().contains("already owned")
                && !msg.to_lowercase().contains("already exists")
            {
                return Err(e).context("CreateBucket failed");
            }
        }
    }

    let policy = format!(
        r#"{{"Version":"2012-10-17","Statement":[{{"Effect":"Allow","Principal":{{"AWS":["*"]}},"Action":["s3:GetObject"],"Resource":["arn:aws:s3:::{bucket}/*"]}}]}}"#
    );
    client
        .put_bucket_policy()
        .bucket(bucket)
        .policy(policy)
        .send()
        .await
        .context("PutBucketPolicy failed")?;
    Ok(())
}
