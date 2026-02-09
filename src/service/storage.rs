use anyhow::{Context, Result, anyhow};
use aws_config::meta::region::RegionProviderChain;
use aws_config::BehaviorVersion;
use aws_sdk_s3::{config::Region, Client};
use aws_credential_types::Credentials;
use bytes::Bytes;
use image::{imageops::FilterType, GenericImageView};
use uuid::Uuid;
use webp::Encoder;

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

// Configuration constants
const MAX_WIDTH: u32 = 1280;
const MAX_HEIGHT: u32 = 1280;
const IMAGE_QUALITY: f32 = 77.0;
const THUMB_QUALITY: f32 = 48.0;

impl StorageService {
    pub async fn init() -> Self {
        let region_provider = RegionProviderChain::default_provider().or_else(Region::new("auto"));

        let credentials = Credentials::new(
            std::env::var("S3_ACCESS_KEY").expect("S3_ACCESS_KEY must be set"),
            std::env::var("S3_SECRET_KEY").expect("S3_SECRET_KEY must be set"),
            None,
            None,
            "Static"
        );

        let config = aws_config::defaults(BehaviorVersion::latest())
            .region(region_provider)
            .endpoint_url(std::env::var("S3_ENDPOINT").expect("S3_ENDPOINT not set"))
            .credentials_provider(credentials)
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
        // Offload CPU-intensive image processing to a blocking thread
        let (full_img_bytes, thumb_img_bytes, width, height) = tokio::task::spawn_blocking(move || {
            let img = image::load_from_memory(&file_bytes)
                .context("Failed to load image from memory")?;

            let (w, h) = img.dimensions();

            // 1. Resize Logic: Limit by Width AND Height
            // We check if either dimension exceeds the max. If so, we resize.
            // FilterType::Lanczos3 provides the best quality for downscaling.
            let processed_img = if w > MAX_WIDTH || h > MAX_HEIGHT {
                img.resize(MAX_WIDTH, MAX_HEIGHT, FilterType::Lanczos3)
            } else {
                img.clone()
            };

            let (final_w, final_h) = processed_img.dimensions();

            // 2. Compression Logic: Convert to WebP (Lossy)
            // The `webp` crate handles encoding with a specific quality factor.
            // .from_image() creates an encoder from the DynamicImage
            let encoder = Encoder::from_image(&processed_img)
                .map_err(|e| anyhow!("WebP encoding failed: {:?}", e))?;

            // Encode returns WebPMemory, which we convert to Vec<u8>
            let webp_data = encoder.encode(IMAGE_QUALITY);
            let main_bytes = webp_data.to_vec();

            // 3. Thumbnail Logic
            // .thumbnail() is faster than .resize() for downscaling and handles aspect ratio
            let thumb_img = img.thumbnail(300, 300);

            let thumb_encoder = Encoder::from_image(&thumb_img)
                .map_err(|e| anyhow!("Thumbnail WebP encoding failed: {:?}", e))?;

            // Usually thumbnails can have lower quality to save space
            let thumb_data = thumb_encoder.encode(THUMB_QUALITY);
            let thumb_bytes = thumb_data.to_vec();

            Ok::<(Vec<u8>, Vec<u8>, u32, u32), anyhow::Error>((main_bytes, thumb_bytes, final_w, final_h))
        })
            .await??;

        // Generate S3 Keys
        let uuid = Uuid::new_v4();
        let key_main = format!("{}.webp", uuid);
        let key_thumb = format!("{}_thumb.webp", uuid);

        // Upload Main Image
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(&key_main)
            .body(full_img_bytes.clone().into())
            .content_type("image/webp")
            // Optional: Set Cache-Control for better browser performance
            .cache_control("max-age=31536000")
            .send()
            .await
            .context("Failed to upload main image to S3")?;

        // Upload Thumbnail
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(&key_thumb)
            .body(thumb_img_bytes.into())
            .content_type("image/webp")
            .cache_control("max-age=31536000")
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
