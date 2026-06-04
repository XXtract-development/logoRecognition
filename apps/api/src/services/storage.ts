/**
 * Storage Service
 * S3-compatible object storage for images and models.
 *
 * In production / development the service uses MinIO via the official client.
 * When NODE_ENV=test an in-memory adapter is used so tests need no external
 * storage service -- resolving CI blocker T-3.
 */

import { Client } from 'minio';
import { Readable } from 'stream';
import crypto from 'crypto';
import sharp from 'sharp';
import { logger } from '../core/logger';
import { StorageAdapter } from './storage-adapter';
import { InMemoryStorageAdapter, inMemoryStorage } from './in-memory-storage-adapter';

// ---------------------------------------------------------------------------
// Adapter selection
// ---------------------------------------------------------------------------

function createMinioAdapter(): StorageAdapter {
  const client = new Client({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  });

  // Wrap the MinIO Client to conform to StorageAdapter
  const adapter: StorageAdapter = {
    bucketExists: (bucket) => client.bucketExists(bucket),
    makeBucket: (bucket, region) => client.makeBucket(bucket, region || 'us-east-1'),
    putObject: async (bucket, objectName, data, size, metadata) => {
      await client.putObject(bucket, objectName, data, size, metadata);
    },
    getObject: (bucket, objectName) => client.getObject(bucket, objectName),
    removeObject: (bucket, objectName) => client.removeObject(bucket, objectName),
    presignedGetObject: (bucket, objectName, expires) =>
      client.presignedGetObject(bucket, objectName, expires),
    listObjects: (bucket, prefix, recursive) =>
      client.listObjects(bucket, prefix, recursive),
  };

  return adapter;
}

/**
 * Returns the active storage adapter.
 * In test mode the in-memory adapter is used; otherwise MinIO.
 */
function getAdapter(): StorageAdapter {
  if (process.env.NODE_ENV === 'test') {
    return inMemoryStorage;
  }
  return createMinioAdapter();
}

// Lazily initialised adapter (created once per process)
let _adapter: StorageAdapter | null = null;

export function getStorageAdapter(): StorageAdapter {
  if (!_adapter) {
    _adapter = getAdapter();
  }
  return _adapter;
}

/**
 * Replace the active adapter at runtime (for tests).
 */
export function setStorageAdapter(adapter: StorageAdapter): void {
  _adapter = adapter;
}

/**
 * Reset the adapter so it will be re-created on next access.
 */
export function resetStorageAdapter(): void {
  _adapter = null;
}

// ---------------------------------------------------------------------------
// Bucket names
// ---------------------------------------------------------------------------

const BUCKETS = {
  TRAINING: 'training-images',
  RECOGNITION: 'recognition-images',
  THUMBNAILS: 'thumbnails',
  MODELS: 'models',
} as const;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MIN_DIMENSIONS = { width: 100, height: 100 };
const THUMBNAIL_SIZE = { width: 280, height: 160 };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UploadResult {
  success: boolean;
  fileId?: string;
  storagePath?: string;
  thumbnailPath?: string;
  metadata?: ImageMetadata;
  error?: string;
}

export interface ImageMetadata {
  originalName: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  hash: string;
  uploadedAt: string;
}

export interface StoredImage {
  id: string;
  storagePath: string;
  thumbnailPath?: string;
  metadata: ImageMetadata;
  signedUrl?: string;
  thumbnailUrl?: string;
}

// ---------------------------------------------------------------------------
// Public API (unchanged signatures)
// ---------------------------------------------------------------------------

/**
 * Initialize storage buckets
 */
export async function initializeBuckets(): Promise<void> {
  const adapter = getStorageAdapter();
  for (const bucket of Object.values(BUCKETS)) {
    try {
      const exists = await adapter.bucketExists(bucket);
      if (!exists) {
        await adapter.makeBucket(bucket, 'us-east-1');
        logger.info(`Created bucket: ${bucket}`);
      }
    } catch (error) {
      logger.error(`Failed to create bucket: ${bucket}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * Validate image file
 */
export async function validateImage(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<{ valid: boolean; error?: string; metadata?: Partial<ImageMetadata> }> {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      valid: false,
      error: `Unsupported file type: ${mimeType}. Allowed: JPG, PNG, WEBP`,
    };
  }

  if (buffer.length > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large: ${(buffer.length / 1024 / 1024).toFixed(2)}MB. Maximum: 10MB`,
    };
  }

  try {
    const image = sharp(buffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      return { valid: false, error: 'Could not read image dimensions' };
    }

    if (metadata.width < MIN_DIMENSIONS.width || metadata.height < MIN_DIMENSIONS.height) {
      return {
        valid: false,
        error: `Image too small: ${metadata.width}x${metadata.height}. Minimum: ${MIN_DIMENSIONS.width}x${MIN_DIMENSIONS.height}`,
      };
    }

    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    return {
      valid: true,
      metadata: {
        originalName: filename,
        mimeType,
        size: buffer.length,
        width: metadata.width,
        height: metadata.height,
        hash,
      },
    };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid image file: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Generate thumbnail for an image
 */
export async function generateThumbnail(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(THUMBNAIL_SIZE.width, THUMBNAIL_SIZE.height, {
      fit: 'cover',
      position: 'center',
    })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/**
 * Upload a single image to storage
 */
export async function uploadImage(
  buffer: Buffer,
  mimeType: string,
  filename: string,
  userId: string,
  bucket: keyof typeof BUCKETS = 'TRAINING'
): Promise<UploadResult> {
  try {
    const validation = await validateImage(buffer, mimeType, filename);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const metadata = validation.metadata!;
    const fileId = crypto.randomUUID();
    const extension = mimeType.split('/')[1] || 'jpg';
    const storagePath = `${userId}/${fileId}.${extension}`;
    const thumbnailPath = `${userId}/${fileId}_thumb.jpg`;

    const adapter = getStorageAdapter();
    const bucketName = BUCKETS[bucket];

    await adapter.putObject(bucketName, storagePath, buffer, buffer.length, {
      'Content-Type': mimeType,
      'x-amz-meta-original-name': encodeURIComponent(filename),
      'x-amz-meta-user-id': userId,
      'x-amz-meta-hash': metadata.hash!,
    });

    logger.info('Image uploaded', {
      fileId,
      bucket: bucketName,
      path: storagePath,
      size: buffer.length,
    });

    const thumbnail = await generateThumbnail(buffer);
    await adapter.putObject(
      BUCKETS.THUMBNAILS,
      thumbnailPath,
      thumbnail,
      thumbnail.length,
      { 'Content-Type': 'image/jpeg' }
    );

    return {
      success: true,
      fileId,
      storagePath: `${bucketName}/${storagePath}`,
      thumbnailPath: `${BUCKETS.THUMBNAILS}/${thumbnailPath}`,
      metadata: {
        ...metadata,
        uploadedAt: new Date().toISOString(),
      } as ImageMetadata,
    };
  } catch (error) {
    logger.error('Image upload failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      filename,
    });
    return {
      success: false,
      error: `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Upload a reference keurmerk logo (Epic 7, Story 7.3).
 *
 * Stored in the TRAINING bucket under the `reference-logos/` prefix so the
 * full storagePath stays `reference-logos/{t3777Code}/{variantLabel}.{ext}`
 * — the path contract consumed by Epic 8. Unlike `uploadImage`, this accepts
 * SVG and skips thumbnailing (reference artwork is used as-is).
 */
export async function uploadReferenceLogo(
  buffer: Buffer,
  storagePath: string,
  mimeType: string
): Promise<void> {
  const adapter = getStorageAdapter();
  await adapter.putObject(BUCKETS.TRAINING, storagePath, buffer, buffer.length, {
    'Content-Type': mimeType,
  });
  logger.info('Reference logo stored', {
    bucket: BUCKETS.TRAINING,
    path: storagePath,
    size: buffer.length,
  });
}

/**
 * Upload an artwork file to MinIO (Epic 8, Story 8.1).
 *
 * Stored in the TRAINING bucket under the `artwork/` prefix.
 * Path convention: `artwork/{gtin}/{fileName}`
 *
 * Retention note: `artwork/` prefix is a reproducible cache from the mediaserver.
 * It may be cleared if needed; never use prefix-delete outside of `artwork/`.
 */
export async function uploadArtwork(
  buffer: Buffer,
  storagePath: string,
  mimeType: string
): Promise<void> {
  const adapter = getStorageAdapter();
  await adapter.putObject(BUCKETS.TRAINING, storagePath, buffer, buffer.length, {
    'Content-Type': mimeType,
  });
  logger.info('Artwork stored', {
    bucket: BUCKETS.TRAINING,
    path: storagePath,
    size: buffer.length,
  });
}

/**
 * Signed preview URL for a reference logo. The stored `storagePath` is the
 * `reference-logos/...` object key inside the TRAINING bucket (not a
 * bucket-prefixed path), so it is signed against TRAINING directly.
 */
export async function getReferenceLogoUrl(
  storagePath: string,
  expiresInSeconds: number = 3600
): Promise<string | null> {
  try {
    const adapter = getStorageAdapter();
    return await adapter.presignedGetObject(BUCKETS.TRAINING, storagePath, expiresInSeconds);
  } catch (error) {
    logger.error('Failed to generate reference logo URL', {
      error: error instanceof Error ? error.message : 'Unknown error',
      storagePath,
    });
    return null;
  }
}

/**
 * Get signed URL for image access
 */
export async function getSignedUrl(
  storagePath: string,
  expiresInSeconds: number = 3600
): Promise<string | null> {
  try {
    const [bucket, ...pathParts] = storagePath.split('/');
    const objectPath = pathParts.join('/');
    const adapter = getStorageAdapter();
    return await adapter.presignedGetObject(bucket, objectPath, expiresInSeconds);
  } catch (error) {
    logger.error('Failed to generate signed URL', {
      error: error instanceof Error ? error.message : 'Unknown error',
      storagePath,
    });
    return null;
  }
}

/**
 * Delete image from storage
 */
export async function deleteImage(storagePath: string): Promise<boolean> {
  try {
    const [bucket, ...pathParts] = storagePath.split('/');
    const objectPath = pathParts.join('/');
    const adapter = getStorageAdapter();
    await adapter.removeObject(bucket, objectPath);
    logger.info('Image deleted', { storagePath });
    return true;
  } catch (error) {
    logger.error('Failed to delete image', {
      error: error instanceof Error ? error.message : 'Unknown error',
      storagePath,
    });
    return false;
  }
}

/**
 * List images for a user
 */
export async function listUserImages(
  userId: string,
  bucket: keyof typeof BUCKETS = 'TRAINING',
  limit: number = 100
): Promise<string[]> {
  const bucketName = BUCKETS[bucket];
  const prefix = `${userId}/`;
  const images: string[] = [];

  try {
    const adapter = getStorageAdapter();
    const stream = adapter.listObjects(bucketName, prefix, true);

    return new Promise((resolve, reject) => {
      stream.on('data', (obj: any) => {
        if (obj.name && images.length < limit) {
          images.push(`${bucketName}/${obj.name}`);
        }
      });
      stream.on('error', reject);
      stream.on('end', () => resolve(images));
    });
  } catch (error) {
    logger.error('Failed to list images', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
    });
    return [];
  }
}

/**
 * Download image buffer
 */
export async function downloadImage(storagePath: string): Promise<Buffer | null> {
  try {
    const [bucket, ...pathParts] = storagePath.split('/');
    const objectPath = pathParts.join('/');
    const adapter = getStorageAdapter();

    const dataStream = await adapter.getObject(bucket, objectPath);
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      dataStream.on('data', (chunk) => chunks.push(chunk));
      dataStream.on('end', () => resolve(Buffer.concat(chunks)));
      dataStream.on('error', reject);
    });
  } catch (error) {
    logger.error('Failed to download image', {
      error: error instanceof Error ? error.message : 'Unknown error',
      storagePath,
    });
    return null;
  }
}

// Export bucket names for external use
export { BUCKETS };
