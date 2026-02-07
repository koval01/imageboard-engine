use anyhow::{Context, Result};
use aws_config::meta::region::RegionProviderChain;
use aws_sdk_s3::{config::Region, Client};
use bytes::Bytes;
use image::{imageops::FilterType, GenericImageView};
use std::io::Cursor;
use uuid::Uuid;

pub struct StorageService {
    client: Client,
    bucket: String,
    public_url: String,
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
}

impl StorageService {
    pub async fn init() -> Self {
        let region_provider = RegionProviderChain::default_provider().or_else(Region::new("auto"));
        let config = aws_config::from_env()
            .region(region_provider)
            .endpoint_url(std::env::var("S3_ENDPOINT").expect("S3_ENDPOINT not set"))
            .load()
            .await;

        let client = Client::new(&config);
        let bucket = std::env::var("S3_BUCKET_NAME").expect("S3_BUCKET_NAME not set");
        let public_url = std::env::var("S3_PUBLIC_URL").expect("S3_PUBLIC_URL not set");

        Self {
            client,
            bucket,
            public_url,
        }
    }

    pub async fn upload_image(&self, file_bytes: Bytes, original_filename: String) -> Result<ProcessedImage> {
        // Run CPU-intensive image processing in a blocking thread
        let (full_img_bytes, thumb_img_bytes, width, height) = tokio::task::spawn_blocking(move || {
            let img = image::load_from_memory(&file_bytes)?;
            let (w, h) = img.dimensions();

            // 1. Process Main Image (Convert to WebP, restrict max size to 2048px width)
            let processed_img = if w > 2048 {
                img.resize(2048, u32::MAX, FilterType::Lanczos3)
            } else {
                img.clone()
            };

            let mut main_buffer = Cursor::new(Vec::new());
            processed_img.write_to(&mut main_buffer, image::ImageOutputFormat::WebP)?;

            // 2. Generate Thumbnail (Max 300px)
            let thumb_img = img.thumbnail(300, 300);
            let mut thumb_buffer = Cursor::new(Vec::new());
            thumb_img.write_to(&mut thumb_buffer, image::ImageOutputFormat::WebP)?;

            Ok::<(Vec<u8>, Vec<u8>, u32, u32), anyhow::Error>((main_buffer.into_inner(), thumb_buffer.into_inner(), w, h))
        })
            .await??;

        let uuid = Uuid::new_v4();
        let key_main = format!("{}.webp", uuid);
        let key_thumb = format!("{}_thumb.webp", uuid);

        // Upload Main
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(&key_main)
            .body(full_img_bytes.clone().into())
            .content_type("image/webp")
            .send()
            .await
            .context("Failed to upload main image to S3")?;

        // Upload Thumb
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(&key_thumb)
            .body(thumb_img_bytes.into())
            .content_type("image/webp")
            .send()
            .await
            .context("Failed to upload thumbnail to S3")?;

        Ok(ProcessedImage {
            url: format!("{}/{}", self.public_url, key_main),
            thumbnail_url: format!("{}/{}", self.public_url, key_thumb),
            storage_key: key_main,
            filename: original_filename,
            width: width as i32,
            height: height as i32,
            size: full_img_bytes.len() as i64,
        })
    }
}
