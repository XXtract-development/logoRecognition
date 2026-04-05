/**
 * In-Memory Storage Adapter Tests
 *
 * Validates that the InMemoryStorageAdapter correctly implements the
 * StorageAdapter interface: upload, retrieve, delete, list, presigned URLs,
 * and bucket management -- all without external dependencies.
 *
 * Resolves CI blocker T-3: tests no longer need MinIO / LocalStack.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Readable } from 'stream';
import { InMemoryStorageAdapter } from '../../services/in-memory-storage-adapter';

describe('InMemoryStorageAdapter', () => {
  let adapter: InMemoryStorageAdapter;

  beforeEach(() => {
    adapter = new InMemoryStorageAdapter();
  });

  // --- Bucket management ---

  describe('bucket management', () => {
    it('should report non-existent bucket', async () => {
      expect(await adapter.bucketExists('my-bucket')).toBe(false);
    });

    it('should create and detect a bucket', async () => {
      await adapter.makeBucket('my-bucket');
      expect(await adapter.bucketExists('my-bucket')).toBe(true);
    });

    it('should handle multiple buckets independently', async () => {
      await adapter.makeBucket('bucket-a');
      await adapter.makeBucket('bucket-b');
      expect(await adapter.bucketExists('bucket-a')).toBe(true);
      expect(await adapter.bucketExists('bucket-b')).toBe(true);
      expect(await adapter.bucketExists('bucket-c')).toBe(false);
    });
  });

  // --- Put / Get object ---

  describe('putObject and getObject', () => {
    it('should store and retrieve a buffer', async () => {
      const data = Buffer.from('hello world');
      await adapter.putObject('test-bucket', 'file.txt', data, data.length);

      const stream = await adapter.getObject('test-bucket', 'file.txt');
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const result = Buffer.concat(chunks);
      expect(result.toString()).toBe('hello world');
    });

    it('should store and retrieve a Readable stream', async () => {
      const data = Buffer.from('stream data');
      const readable = Readable.from(data);
      await adapter.putObject('test-bucket', 'stream.txt', readable);

      const stream = await adapter.getObject('test-bucket', 'stream.txt');
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      expect(Buffer.concat(chunks).toString()).toBe('stream data');
    });

    it('should store metadata alongside the object', async () => {
      const data = Buffer.from('with meta');
      await adapter.putObject('test-bucket', 'meta.txt', data, data.length, {
        'Content-Type': 'text/plain',
        'x-custom': 'value',
      });

      // Metadata is not exposed via getObject but the object should be retrievable
      const stream = await adapter.getObject('test-bucket', 'meta.txt');
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      expect(Buffer.concat(chunks).toString()).toBe('with meta');
    });

    it('should throw when getting a non-existent object', async () => {
      await expect(
        adapter.getObject('test-bucket', 'missing.txt')
      ).rejects.toThrow('does not exist');
    });

    it('should overwrite an existing object', async () => {
      await adapter.putObject('b', 'key', Buffer.from('v1'));
      await adapter.putObject('b', 'key', Buffer.from('v2'));

      const stream = await adapter.getObject('b', 'key');
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      expect(Buffer.concat(chunks).toString()).toBe('v2');
    });
  });

  // --- Remove object ---

  describe('removeObject', () => {
    it('should delete an existing object', async () => {
      await adapter.putObject('b', 'file.txt', Buffer.from('data'));
      await adapter.removeObject('b', 'file.txt');

      await expect(adapter.getObject('b', 'file.txt')).rejects.toThrow();
    });

    it('should not throw when removing a non-existent object', async () => {
      // MinIO removeObject is idempotent; our adapter should be too
      await expect(adapter.removeObject('b', 'nope')).resolves.toBeUndefined();
    });
  });

  // --- Presigned URL ---

  describe('presignedGetObject', () => {
    it('should return a deterministic test URL', async () => {
      const url = await adapter.presignedGetObject('my-bucket', 'image.jpg', 7200);
      expect(url).toBe('http://test-storage/my-bucket/image.jpg?expires=7200');
    });

    it('should default to 3600 seconds', async () => {
      const url = await adapter.presignedGetObject('b', 'obj');
      expect(url).toContain('expires=3600');
    });
  });

  // --- List objects ---

  describe('listObjects', () => {
    it('should list objects matching a prefix', async () => {
      await adapter.putObject('b', 'user1/img1.jpg', Buffer.from('a'));
      await adapter.putObject('b', 'user1/img2.jpg', Buffer.from('b'));
      await adapter.putObject('b', 'user2/img1.jpg', Buffer.from('c'));

      const stream = adapter.listObjects('b', 'user1/', true);
      const items: any[] = [];
      for await (const item of stream) {
        items.push(item);
      }

      expect(items).toHaveLength(2);
      expect(items.map((i) => i.name).sort()).toEqual([
        'user1/img1.jpg',
        'user1/img2.jpg',
      ]);
    });

    it('should return empty for non-matching prefix', async () => {
      await adapter.putObject('b', 'user1/img.jpg', Buffer.from('x'));

      const stream = adapter.listObjects('b', 'user999/', true);
      const items: any[] = [];
      for await (const item of stream) {
        items.push(item);
      }
      expect(items).toHaveLength(0);
    });

    it('should only list objects in the correct bucket', async () => {
      await adapter.putObject('bucket-a', 'file.txt', Buffer.from('a'));
      await adapter.putObject('bucket-b', 'file.txt', Buffer.from('b'));

      const stream = adapter.listObjects('bucket-a', '', true);
      const items: any[] = [];
      for await (const item of stream) {
        items.push(item);
      }
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('file.txt');
    });
  });

  // --- Clear helper ---

  describe('clear()', () => {
    it('should remove all objects and buckets', async () => {
      await adapter.makeBucket('b');
      await adapter.putObject('b', 'f', Buffer.from('x'));

      adapter.clear();

      expect(await adapter.bucketExists('b')).toBe(false);
      expect(adapter.keys()).toHaveLength(0);
    });
  });

  // --- getBuffer helper ---

  describe('getBuffer()', () => {
    it('should return the raw buffer for assertions', async () => {
      const data = Buffer.from('raw');
      await adapter.putObject('b', 'obj', data);

      expect(adapter.getBuffer('b', 'obj')?.toString()).toBe('raw');
    });

    it('should return undefined for missing objects', () => {
      expect(adapter.getBuffer('b', 'missing')).toBeUndefined();
    });
  });
});
