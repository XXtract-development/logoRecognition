/**
 * Storage Adapter Interface
 * Abstracts object storage operations so different backends
 * (MinIO, in-memory, LocalStack) can be swapped transparently.
 */

import { Readable } from 'stream';

export interface StorageObject {
  buffer: Buffer;
  metadata: Record<string, string>;
}

export interface ListObject {
  name: string;
  size: number;
  lastModified?: Date;
}

/**
 * Core storage operations that every adapter must implement.
 * Mirrors the MinIO Client surface we actually use.
 */
export interface StorageAdapter {
  /** Check whether a bucket exists */
  bucketExists(bucket: string): Promise<boolean>;

  /** Create a bucket */
  makeBucket(bucket: string, region?: string): Promise<void>;

  /** Store an object */
  putObject(
    bucket: string,
    objectName: string,
    data: Buffer | Readable,
    size?: number,
    metadata?: Record<string, string>
  ): Promise<void>;

  /** Retrieve an object as a readable stream */
  getObject(bucket: string, objectName: string): Promise<Readable>;

  /** Remove an object */
  removeObject(bucket: string, objectName: string): Promise<void>;

  /** Generate a presigned GET URL (or a fake one for tests) */
  presignedGetObject(
    bucket: string,
    objectName: string,
    expiresInSeconds?: number
  ): Promise<string>;

  /** List objects in a bucket with an optional prefix */
  listObjects(
    bucket: string,
    prefix: string,
    recursive: boolean
  ): Readable;
}
