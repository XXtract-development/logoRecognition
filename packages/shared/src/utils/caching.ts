import { LRUCache } from 'lru-cache';
import Redis from 'ioredis';
import crypto from 'crypto';

export interface CacheConfig {
  l1: {
    maxSize: number;
    ttl: number;
  };
  l2: {
    maxSize: number;
    ttl: number;
  };
  l3: {
    ttl: number;
  };
}

export class MultiLayerCache {
  private l1Cache: LRUCache<string, any>;
  private l2Cache: Redis;
  private config: CacheConfig;
  private metrics = {
    l1Hits: 0,
    l1Misses: 0,
    l2Hits: 0,
    l2Misses: 0,
    l3Hits: 0,
    l3Misses: 0,
  };

  constructor(config: CacheConfig, redisUrl?: string) {
    this.config = config;

    // L1: In-memory LRU cache
    this.l1Cache = new LRUCache({
      max: config.l1.maxSize,
      ttl: config.l1.ttl * 1000, // Convert to ms
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    });

    // L2: Redis cache
    this.l2Cache = new Redis(redisUrl || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      enableReadyCheck: true,
      lazyConnect: false,
    });
  }

  async get<T>(key: string): Promise<T | null> {
    // Check L1 (memory)
    const l1Result = this.l1Cache.get(key);
    if (l1Result !== undefined) {
      this.metrics.l1Hits++;
      return l1Result as T;
    }
    this.metrics.l1Misses++;

    // Check L2 (Redis)
    try {
      const l2Result = await this.l2Cache.get(key);
      if (l2Result) {
        this.metrics.l2Hits++;
        const parsed = JSON.parse(l2Result);

        // Populate L1
        this.l1Cache.set(key, parsed);

        return parsed as T;
      }
    } catch (error) {
      console.error('L2 cache error:', error);
    }
    this.metrics.l2Misses++;

    // L3 (CDN) is handled at the edge, not here

    return null;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const effectiveTtl = ttl || this.config.l1.ttl;

    // Set in L1
    this.l1Cache.set(key, value);

    // Set in L2
    try {
      await this.l2Cache.setex(
        key,
        ttl || this.config.l2.ttl,
        JSON.stringify(value)
      );
    } catch (error) {
      console.error('L2 cache set error:', error);
    }
  }

  async invalidate(pattern: string): Promise<void> {
    // Clear L1 entries matching pattern
    for (const key of this.l1Cache.keys()) {
      if (key.includes(pattern)) {
        this.l1Cache.delete(key);
      }
    }

    // Clear L2 entries matching pattern
    try {
      const keys = await this.l2Cache.keys(pattern);
      if (keys.length > 0) {
        await this.l2Cache.del(...keys);
      }
    } catch (error) {
      console.error('L2 cache invalidation error:', error);
    }
  }

  generateKey(...args: any[]): string {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(args));
    return hash.digest('hex');
  }

  getMetrics() {
    const l1HitRate = this.metrics.l1Hits / (this.metrics.l1Hits + this.metrics.l1Misses) || 0;
    const l2HitRate = this.metrics.l2Hits / (this.metrics.l2Hits + this.metrics.l2Misses) || 0;

    return {
      ...this.metrics,
      l1HitRate: (l1HitRate * 100).toFixed(2) + '%',
      l2HitRate: (l2HitRate * 100).toFixed(2) + '%',
      l1Size: this.l1Cache.size,
    };
  }

  async close(): Promise<void> {
    this.l1Cache.clear();
    await this.l2Cache.quit();
  }
}
