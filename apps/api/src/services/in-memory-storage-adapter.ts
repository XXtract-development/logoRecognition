/**
 * In-Memory Storage Adapter
 *
 * A pure in-memory implementation of StorageAdapter for use in tests and CI.
 * No external dependencies required -- all data lives in a Map.
 */

import { Readable } from 'stream';
import { StorageAdapter } from './storage-adapter';

interface StoredEntry {
  buffer: Buffer;
  metadata: Record<string, string>;
  lastModified: Date;
}

/**
 * In-memory storage backend.
 * Objects are keyed as "bucket/objectName" in a single Map.
 */
export class InMemoryStorageAdapter implements StorageAdapter {
  /** Internal store: key = "bucket/objectName" */
  private store = new Map<string, StoredEntry>();
  /** Set of existing buckets */
  private buckets = new Set<string>();

  // ---- helpers ----

  private key(bucket: string, objectName: string): string {
    return `${bucket}/${objectName}`;
  }

  /** Reset all data -- useful between test runs */
  clear(): void {
    this.store.clear();
    this.buckets.clear();
  }

  /** Get a snapshot of stored keys (for test assertions) */
  keys(): string[] {
    return Array.from(this.store.keys());
  }

  /** Get raw buffer for a stored object (for test assertions) */
  getBuffer(bucket: string, objectName: string): Buffer | undefined {
    return this.store.get(this.key(bucket, objectName))?.buffer;
  }

  // ---- StorageAdapter implementation ----

  async bucketExists(bucket: string): Promise<boolean> {
    return this.buckets.has(bucket);
  }

  async makeBucket(bucket: string, _region?: string): Promise<void> {
    this.buckets.add(bucket);
  }

  async putObject(
    bucket: string,
    objectName: string,
    data: Buffer | Readable,
    _size?: number,
    metadata?: Record<string, string>
  ): Promise<void> {
    let buffer: Buffer;

    if (Buffer.isBuffer(data)) {
      buffer = data;
    } else {
      // Collect Readable into a Buffer
      const chunks: Buffer[] = [];
      for await (const chunk of data) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      buffer = Buffer.concat(chunks);
    }

    this.store.set(this.key(bucket, objectName), {
      buffer,
      metadata: metadata ?? {},
      lastModified: new Date(),
    });
  }

  async getObject(bucket: string, objectName: string): Promise<Readable> {
    const entry = this.store.get(this.key(bucket, objectName));
    if (!entry) {
      throw new Error(
        `The specified key does not exist. Bucket: "${bucket}", Key: "${objectName}"`
      );
    }
    return Readable.from(entry.buffer);
  }

  async removeObject(bucket: string, objectName: string): Promise<void> {
    this.store.delete(this.key(bucket, objectName));
  }

  async presignedGetObject(
    bucket: string,
    objectName: string,
    expiresInSeconds: number = 3600
  ): Promise<string> {
    // Return a deterministic fake URL for test assertions
    return `http://test-storage/${bucket}/${objectName}?expires=${expiresInSeconds}`;
  }

  listObjects(bucket: string, prefix: string, _recursive: boolean): Readable {
    const matching: Array<{ name: string; size: number; lastModified: Date }> = [];

    const bucketPrefix = `${bucket}/`;
    for (const [key, entry] of this.store.entries()) {
      if (!key.startsWith(bucketPrefix)) continue;
      const objectName = key.slice(bucketPrefix.length);
      if (prefix && !objectName.startsWith(prefix)) continue;
      matching.push({
        name: objectName,
        size: entry.buffer.length,
        lastModified: entry.lastModified,
      });
    }

    // Return an object-mode readable that emits each match then ends
    return Readable.from(matching);
  }
}

/**
 * Singleton instance for test use.
 * Import this in test setup and call .clear() in beforeEach/afterEach.
 */
export const inMemoryStorage = new InMemoryStorageAdapter();
