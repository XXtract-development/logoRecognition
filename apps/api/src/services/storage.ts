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
    return createPreviewUrl(BUCKETS.TRAINING, storagePath, expiresInSeconds);
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
    return createPreviewUrl(bucket, objectPath, expiresInSeconds);
  } catch (error) {
    logger.error('Failed to generate signed URL', {
      error: error instanceof Error ? error.message : 'Unknown error',
      storagePath,
    });
    return null;
  }
}

const PREVIEW_TTL_SECONDS = 86400; // Preserve existing explicit 24-hour export links; normal previews default to one hour.
export const MAX_PREVIEW_BYTES = 20 * 1024 * 1024;
export const PREVIEW_TIMEOUT_MS = 10000;
let previewReaders = 0;

export class StoragePreviewError extends Error {
  constructor(public readonly statusCode: number, message: string) { super(message); }
}

function validPreviewPath(bucket: string, key: string): boolean {
  return Object.values(BUCKETS).some(value => value === bucket) && key.length > 0 && key.length <= 1024 &&
    !/[\\\u0000-\u001f\u007f]/.test(key) && key.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}

function previewSignature(bucket: string, key: string, expires: number): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new StoragePreviewError(503, 'Preview signing unavailable');
  const signingKey = crypto.createHmac('sha256', secret).update('logoRecognition:storage-preview:v1').digest();
  return crypto.createHmac('sha256', signingKey).update(JSON.stringify([bucket, key, expires])).digest('hex');
}

function createPreviewUrl(bucket: string, key: string, ttl: number): string {
  if (!validPreviewPath(bucket, key) || !Number.isInteger(ttl) || ttl < 1 || ttl > PREVIEW_TTL_SECONDS) {
    throw new StoragePreviewError(400, 'Invalid preview path or expiry');
  }
  const expires = Math.floor(Date.now() / 1000) + ttl;
  const query = new URLSearchParams({bucket, key, expires: String(expires), signature: previewSignature(bucket, key, expires)});
  return `/api/v1/storage/preview?${query}`;
}

export function verifyPreviewSignature(bucket: string, key: string, expiry: string, signature: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  const expires = Number(expiry);
  if (!validPreviewPath(bucket, key) || !/^\d{10}$/.test(expiry) || !Number.isSafeInteger(expires) ||
    expires <= now || expires > now + PREVIEW_TTL_SECONDS || !/^[a-f0-9]{64}$/.test(signature)) return false;
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(previewSignature(bucket, key, expires), 'hex'));
}

/** Bounded private object read. A timed-out opening retains admission until it actually finishes. */
export async function readPreviewImage(bucket: string, key: string): Promise<{buffer: Buffer; mimeType: string}> {
  if (!validPreviewPath(bucket, key)) throw new StoragePreviewError(403, 'Invalid preview');
  if (previewReaders >= 4) throw new StoragePreviewError(503, 'Preview service busy');
  previewReaders++;
  let stream: Readable | undefined;
  let expired = false;
  let timer: NodeJS.Timeout | undefined;
  const work = (async () => {
    try {
      stream = await getStorageAdapter().getObject(bucket, key);
      if (expired) { stream.destroy(); throw new StoragePreviewError(504, 'Preview timed out'); }
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of stream) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > MAX_PREVIEW_BYTES) throw new StoragePreviewError(413, 'Preview exceeds size limit');
        chunks.push(bytes);
      }
      const buffer = Buffer.concat(chunks);
      let mimeType: string;
      if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mimeType = 'image/png';
      else if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) mimeType = 'image/jpeg';
      else if (buffer.length >= 12 && buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP') mimeType = 'image/webp';
      else throw new StoragePreviewError(415, 'Unsupported preview image');
      return {buffer, mimeType};
    } finally { stream?.destroy(); previewReaders--; }
  })();
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        expired = true; stream?.destroy(); reject(new StoragePreviewError(504, 'Preview timed out'));
      }, PREVIEW_TIMEOUT_MS);
    })]);
  } finally { clearTimeout(timer); }
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
 * List bare object keys under a prefix in the TRAINING bucket (e.g. the
 * rasterized artwork pages under `artwork/{gtin}/`). Returns keys usable
 * directly with downloadTrainingObject. Used to resolve the full artwork for
 * crop-less review items (declared-but-not-found) so the reviewer can still
 * look for the keurmerk on the whole pack.
 */
export async function listTrainingObjectKeys(
  prefix: string,
  limit: number = 50
): Promise<string[]> {
  const keys: string[] = [];
  try {
    const adapter = getStorageAdapter();
    const stream = adapter.listObjects(BUCKETS.TRAINING, prefix, true);
    return new Promise((resolve, reject) => {
      stream.on('data', (obj: any) => {
        if (obj.name && keys.length < limit) keys.push(obj.name);
      });
      stream.on('error', reject);
      stream.on('end', () => resolve(keys));
    });
  } catch (error) {
    logger.error('Failed to list training objects', {
      error: error instanceof Error ? error.message : 'Unknown error',
      prefix,
    });
    return [];
  }
}

/**
 * Download an object from the TRAINING bucket by bare object key (crops,
 * reference logos, artwork) — unlike downloadImage, which expects a
 * "bucket/key" storagePath and would misread the first key segment as a
 * bucket name (acceptance finding 2026-06-06).
 */
export async function downloadTrainingObject(objectKey: string): Promise<Buffer | null> {
  try {
    const adapter = getStorageAdapter();
    const dataStream = await adapter.getObject(BUCKETS.TRAINING, objectKey);
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      dataStream.on('data', (chunk) => chunks.push(chunk));
      dataStream.on('end', () => resolve(Buffer.concat(chunks)));
      dataStream.on('error', reject);
    });
  } catch (error) {
    logger.error('Failed to download training object', {
      error: error instanceof Error ? error.message : 'Unknown error',
      objectKey,
    });
    return null;
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
