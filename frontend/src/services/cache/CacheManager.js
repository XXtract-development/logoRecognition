/**
 * Comprehensive Cache Management System
 * US-016: API Caching Strategy - Multi-layer caching implementation
 */

import IndexedDBCache from './IndexedDBCache.js';
import { cacheStrategies } from './strategies.js';

class CacheManager {
  constructor() {
    this.layers = {
      memory: new Map(),
      localStorage: window.localStorage,
      sessionStorage: window.sessionStorage,
      indexedDB: new IndexedDBCache(),
    };

    this.config = {
      defaultTTL: 5 * 60 * 1000, // 5 minutes
      maxMemorySize: 50 * 1024 * 1024, // 50MB
      maxLocalStorageSize: 5 * 1024 * 1024, // 5MB
      compressionThreshold: 1024, // 1KB
      enableCompression: true,
      enableEncryption: false,
      memoryCleanupInterval: 30000, // 30 seconds
      persistentCacheCleanupInterval: 300000, // 5 minutes
    };

    this.strategies = cacheStrategies;
    this.metrics = {
      hits: { memory: 0, localStorage: 0, sessionStorage: 0, indexedDB: 0 },
      misses: { memory: 0, localStorage: 0, sessionStorage: 0, indexedDB: 0 },
      sets: { memory: 0, localStorage: 0, sessionStorage: 0, indexedDB: 0 },
      evictions: { memory: 0, localStorage: 0, sessionStorage: 0, indexedDB: 0 },
      errors: { memory: 0, localStorage: 0, sessionStorage: 0, indexedDB: 0 },
      totalRequests: 0,
      totalSize: { memory: 0, localStorage: 0, sessionStorage: 0, indexedDB: 0 },
    };

    this.memoryUsage = 0;
    this.isOnline = navigator.onLine;

    this.init();
  }

  async init() {
    await this.layers.indexedDB.init();
    this.setupCleanupIntervals();
    this.setupNetworkStatusListeners();
    this.setupStorageEventListeners();
    this.loadPersistentMetrics();
  }

  /**
   * Get data from cache with multi-layer fallback
   */
  async get(key, options = {}) {
    this.metrics.totalRequests++;
    const { strategy = 'default', layer = null } = options;

    const cacheStrategy = this.strategies[strategy] || this.strategies.default;
    const layersToCheck = layer ? [layer] : cacheStrategy.layers;

    for (const layerName of layersToCheck) {
      try {
        const result = await this.getFromLayer(key, layerName);
        if (result !== null) {
          this.metrics.hits[layerName]++;

          // Promote to higher layers if strategy allows
          if (cacheStrategy.promote && layerName !== 'memory') {
            await this.promoteToHigherLayers(key, result, layerName);
          }

          return this.deserializeValue(result.value);
        }
      } catch (error) {
        this.metrics.errors[layerName]++;
        console.warn(`Cache get error in ${layerName}:`, error);
      }
    }

    // Record miss for all attempted layers
    layersToCheck.forEach(layerName => {
      this.metrics.misses[layerName]++;
    });

    return null;
  }

  /**
   * Set data in cache with appropriate strategy
   */
  async set(key, value, options = {}) {
    const {
      ttl = this.config.defaultTTL,
      strategy = 'default',
      layer = null,
      tags = [],
      priority = 'normal',
    } = options;

    const cacheStrategy = this.strategies[strategy] || this.strategies.default;
    const layersToSet = layer ? [layer] : cacheStrategy.layers;

    const cacheEntry = {
      value: this.serializeValue(value),
      timestamp: Date.now(),
      ttl,
      tags,
      priority,
      size: this.calculateSize(value),
      accessCount: 0,
      lastAccessed: Date.now(),
    };

    const results = await Promise.allSettled(
      layersToSet.map(layerName => this.setInLayer(key, cacheEntry, layerName))
    );

    // Record metrics for successful sets
    results.forEach((result, index) => {
      const layerName = layersToSet[index];
      if (result.status === 'fulfilled') {
        this.metrics.sets[layerName]++;
        this.updateSizeMetrics(layerName, cacheEntry.size, 'add');
      } else {
        this.metrics.errors[layerName]++;
        console.warn(`Cache set error in ${layerName}:`, result.reason);
      }
    });

    return results.every(result => result.status === 'fulfilled');
  }

  /**
   * Delete from all cache layers
   */
  async delete(key) {
    const promises = Object.keys(this.layers).map(layerName =>
      this.deleteFromLayer(key, layerName).catch(error => {
        this.metrics.errors[layerName]++;
        console.warn(`Cache delete error in ${layerName}:`, error);
      })
    );

    await Promise.allSettled(promises);
  }

  /**
   * Get or set pattern with automatic caching
   */
  async getOrSet(key, dataFetcher, options = {}) {
    let cachedValue = await this.get(key, options);

    if (cachedValue !== null) {
      return cachedValue;
    }

    try {
      const freshValue = await dataFetcher();
      await this.set(key, freshValue, options);
      return freshValue;
    } catch (error) {
      // Try to get stale data if fresh fetch fails
      if (options.allowStale) {
        const staleValue = await this.getStale(key);
        if (staleValue !== null) {
          console.warn('Returning stale data due to fetch error:', error);
          return staleValue;
        }
      }
      throw error;
    }
  }

  /**
   * Get stale data (expired but still available)
   */
  async getStale(key) {
    for (const layerName of ['memory', 'localStorage', 'sessionStorage', 'indexedDB']) {
      try {
        const result = await this.getFromLayer(key, layerName, true); // Allow stale
        if (result !== null) {
          return this.deserializeValue(result.value);
        }
      } catch (error) {
        console.warn(`Error getting stale data from ${layerName}:`, error);
      }
    }
    return null;
  }

  /**
   * Invalidate cache by key or tags
   */
  async invalidate(keyOrPattern, options = {}) {
    const { tags = [], pattern = false } = options;

    if (pattern) {
      await this.invalidateByPattern(keyOrPattern);
    } else if (tags.length > 0) {
      await this.invalidateByTags(tags);
    } else {
      await this.delete(keyOrPattern);
    }
  }

  /**
   * Invalidate by pattern matching
   */
  async invalidateByPattern(pattern) {
    const regex = new RegExp(pattern);

    // Memory layer
    for (const key of this.layers.memory.keys()) {
      if (regex.test(key)) {
        this.layers.memory.delete(key);
      }
    }

    // LocalStorage layer
    for (let i = this.layers.localStorage.length - 1; i >= 0; i--) {
      const key = this.layers.localStorage.key(i);
      if (key && regex.test(key)) {
        this.layers.localStorage.removeItem(key);
      }
    }

    // SessionStorage layer
    for (let i = this.layers.sessionStorage.length - 1; i >= 0; i--) {
      const key = this.layers.sessionStorage.key(i);
      if (key && regex.test(key)) {
        this.layers.sessionStorage.removeItem(key);
      }
    }

    // IndexedDB layer
    await this.layers.indexedDB.invalidateByPattern(pattern);
  }

  /**
   * Invalidate by tags
   */
  async invalidateByTags(tags) {
    // This requires tracking which keys have which tags
    // Implementation would depend on tag storage strategy
    for (const layerName of Object.keys(this.layers)) {
      await this.invalidateLayerByTags(layerName, tags);
    }
  }

  /**
   * Warm cache with predefined data
   */
  async warmCache(warmupData) {
    const promises = warmupData.map(async ({ key, fetcher, options = {} }) => {
      try {
        const value = await fetcher();
        await this.set(key, value, { ...options, strategy: 'preload' });
        return { key, success: true };
      } catch (error) {
        console.warn(`Cache warming failed for ${key}:`, error);
        return { key, success: false, error };
      }
    });

    const results = await Promise.allSettled(promises);
    return results.map(result => result.status === 'fulfilled' ? result.value : result.reason);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const totalHits = Object.values(this.metrics.hits).reduce((sum, hits) => sum + hits, 0);
    const totalMisses = Object.values(this.metrics.misses).reduce((sum, misses) => sum + misses, 0);
    const totalRequests = totalHits + totalMisses;

    return {
      ...this.metrics,
      hitRate: totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0,
      missRate: totalRequests > 0 ? (totalMisses / totalRequests) * 100 : 0,
      efficiency: this.calculateEfficiency(),
      memoryUsage: this.memoryUsage,
      layerStats: this.getLayerStats(),
    };
  }

  /**
   * Layer-specific implementations
   */
  async getFromLayer(key, layerName, allowStale = false) {
    const layer = this.layers[layerName];

    switch (layerName) {
      case 'memory':
        const memoryEntry = layer.get(key);
        if (memoryEntry && (allowStale || !this.isExpired(memoryEntry))) {
          memoryEntry.accessCount++;
          memoryEntry.lastAccessed = Date.now();
          return memoryEntry;
        }
        return null;

      case 'localStorage':
      case 'sessionStorage':
        const storageValue = layer.getItem(key);
        if (storageValue) {
          try {
            const entry = JSON.parse(storageValue);
            if (allowStale || !this.isExpired(entry)) {
              entry.accessCount = (entry.accessCount || 0) + 1;
              entry.lastAccessed = Date.now();
              layer.setItem(key, JSON.stringify(entry));
              return entry;
            }
          } catch (error) {
            layer.removeItem(key);
          }
        }
        return null;

      case 'indexedDB':
        return await layer.get(key, allowStale);

      default:
        throw new Error(`Unknown cache layer: ${layerName}`);
    }
  }

  async setInLayer(key, entry, layerName) {
    const layer = this.layers[layerName];

    switch (layerName) {
      case 'memory':
        // Check memory limits
        if (this.memoryUsage + entry.size > this.config.maxMemorySize) {
          await this.evictMemoryEntries(entry.size);
        }

        layer.set(key, entry);
        this.memoryUsage += entry.size;
        break;

      case 'localStorage':
      case 'sessionStorage':
        try {
          const serialized = JSON.stringify(entry);

          // Check storage limits
          if (this.getStorageUsage(layerName) + serialized.length > this.config.maxLocalStorageSize) {
            await this.evictStorageEntries(layerName, serialized.length);
          }

          layer.setItem(key, serialized);
        } catch (error) {
          if (error.name === 'QuotaExceededError') {
            await this.evictStorageEntries(layerName, JSON.stringify(entry).length);
            layer.setItem(key, JSON.stringify(entry)); // Retry
          } else {
            throw error;
          }
        }
        break;

      case 'indexedDB':
        await layer.set(key, entry);
        break;

      default:
        throw new Error(`Unknown cache layer: ${layerName}`);
    }
  }

  async deleteFromLayer(key, layerName) {
    const layer = this.layers[layerName];

    switch (layerName) {
      case 'memory':
        const entry = layer.get(key);
        if (entry) {
          this.memoryUsage -= entry.size;
          layer.delete(key);
        }
        break;

      case 'localStorage':
      case 'sessionStorage':
        layer.removeItem(key);
        break;

      case 'indexedDB':
        await layer.delete(key);
        break;
    }
  }

  /**
   * Utility methods
   */
  isExpired(entry) {
    return Date.now() > (entry.timestamp + entry.ttl);
  }

  serializeValue(value) {
    if (this.config.enableCompression && this.shouldCompress(value)) {
      return this.compress(JSON.stringify(value));
    }
    return JSON.stringify(value);
  }

  deserializeValue(serializedValue) {
    if (this.isCompressed(serializedValue)) {
      return JSON.parse(this.decompress(serializedValue));
    }
    return JSON.parse(serializedValue);
  }

  shouldCompress(value) {
    const size = new Blob([JSON.stringify(value)]).size;
    return size > this.config.compressionThreshold;
  }

  compress(data) {
    // Simple compression placeholder - in production, use a real compression library
    return { __compressed: true, data: btoa(data) };
  }

  decompress(compressedData) {
    if (compressedData.__compressed) {
      return atob(compressedData.data);
    }
    return compressedData;
  }

  isCompressed(data) {
    return typeof data === 'object' && data.__compressed === true;
  }

  calculateSize(value) {
    return new Blob([JSON.stringify(value)]).size;
  }

  /**
   * Eviction strategies
   */
  async evictMemoryEntries(neededSize) {
    const entries = Array.from(this.layers.memory.entries())
      .map(([key, entry]) => ({ key, ...entry }))
      .sort((a, b) => {
        // LRU with priority consideration
        const priorityWeight = { low: 1, normal: 2, high: 3 };
        const aScore = a.lastAccessed * priorityWeight[a.priority || 'normal'];
        const bScore = b.lastAccessed * priorityWeight[b.priority || 'normal'];
        return aScore - bScore;
      });

    let freedSize = 0;
    for (const entry of entries) {
      this.layers.memory.delete(entry.key);
      this.memoryUsage -= entry.size;
      freedSize += entry.size;
      this.metrics.evictions.memory++;

      if (freedSize >= neededSize) {
        break;
      }
    }
  }

  async evictStorageEntries(layerName, neededSize) {
    const layer = this.layers[layerName];
    const entries = [];

    for (let i = 0; i < layer.length; i++) {
      const key = layer.key(i);
      if (key) {
        try {
          const entry = JSON.parse(layer.getItem(key));
          entries.push({ key, ...entry });
        } catch (error) {
          // Remove corrupted entries
          layer.removeItem(key);
        }
      }
    }

    entries.sort((a, b) => a.lastAccessed - b.lastAccessed);

    let freedSize = 0;
    for (const entry of entries) {
      const itemSize = layer.getItem(entry.key).length;
      layer.removeItem(entry.key);
      freedSize += itemSize;
      this.metrics.evictions[layerName]++;

      if (freedSize >= neededSize) {
        break;
      }
    }
  }

  /**
   * Promotion strategies
   */
  async promoteToHigherLayers(key, entry, currentLayer) {
    const layerHierarchy = ['indexedDB', 'localStorage', 'sessionStorage', 'memory'];
    const currentIndex = layerHierarchy.indexOf(currentLayer);

    for (let i = currentIndex + 1; i < layerHierarchy.length; i++) {
      const targetLayer = layerHierarchy[i];
      try {
        await this.setInLayer(key, entry, targetLayer);
      } catch (error) {
        console.warn(`Failed to promote ${key} to ${targetLayer}:`, error);
        break;
      }
    }
  }

  /**
   * Cleanup and maintenance
   */
  setupCleanupIntervals() {
    // Memory cleanup
    setInterval(() => {
      this.cleanupExpiredEntries('memory');
    }, this.config.memoryCleanupInterval);

    // Persistent storage cleanup
    setInterval(() => {
      this.cleanupExpiredEntries('localStorage');
      this.cleanupExpiredEntries('sessionStorage');
      this.layers.indexedDB.cleanup();
    }, this.config.persistentCacheCleanupInterval);
  }

  cleanupExpiredEntries(layerName) {
    const layer = this.layers[layerName];

    switch (layerName) {
      case 'memory':
        for (const [key, entry] of layer.entries()) {
          if (this.isExpired(entry)) {
            layer.delete(key);
            this.memoryUsage -= entry.size;
          }
        }
        break;

      case 'localStorage':
      case 'sessionStorage':
        for (let i = layer.length - 1; i >= 0; i--) {
          const key = layer.key(i);
          if (key) {
            try {
              const entry = JSON.parse(layer.getItem(key));
              if (this.isExpired(entry)) {
                layer.removeItem(key);
              }
            } catch (error) {
              layer.removeItem(key); // Remove corrupted entries
            }
          }
        }
        break;
    }
  }

  /**
   * Network and storage event handlers
   */
  setupNetworkStatusListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.handleNetworkStatusChange('online');
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.handleNetworkStatusChange('offline');
    });
  }

  setupStorageEventListeners() {
    window.addEventListener('storage', (event) => {
      // Handle external storage changes
      if (event.key && event.newValue === null) {
        // Item was removed externally
        this.layers.memory.delete(event.key);
      }
    });
  }

  handleNetworkStatusChange(status) {
    if (status === 'online') {
      // Sync any pending cache operations
      this.syncPendingOperations();
    }
  }

  async syncPendingOperations() {
    // Implementation for syncing operations that were queued while offline
    console.log('Syncing pending cache operations...');
  }

  /**
   * Metrics and monitoring
   */
  getLayerStats() {
    return {
      memory: {
        size: this.memoryUsage,
        entries: this.layers.memory.size,
      },
      localStorage: {
        size: this.getStorageUsage('localStorage'),
        entries: this.layers.localStorage.length,
      },
      sessionStorage: {
        size: this.getStorageUsage('sessionStorage'),
        entries: this.layers.sessionStorage.length,
      },
      indexedDB: this.layers.indexedDB.getStats(),
    };
  }

  getStorageUsage(layerName) {
    const layer = this.layers[layerName];
    let totalSize = 0;

    for (let i = 0; i < layer.length; i++) {
      const key = layer.key(i);
      if (key) {
        totalSize += layer.getItem(key).length;
      }
    }

    return totalSize;
  }

  calculateEfficiency() {
    const totalRequests = this.metrics.totalRequests;
    const totalHits = Object.values(this.metrics.hits).reduce((sum, hits) => sum + hits, 0);
    const totalErrors = Object.values(this.metrics.errors).reduce((sum, errors) => sum + errors, 0);

    if (totalRequests === 0) return 100;

    const errorRate = (totalErrors / totalRequests) * 100;
    const hitRate = (totalHits / totalRequests) * 100;

    return Math.max(0, hitRate - errorRate);
  }

  updateSizeMetrics(layerName, size, operation) {
    if (operation === 'add') {
      this.metrics.totalSize[layerName] += size;
    } else if (operation === 'remove') {
      this.metrics.totalSize[layerName] = Math.max(0, this.metrics.totalSize[layerName] - size);
    }
  }

  loadPersistentMetrics() {
    try {
      const storedMetrics = localStorage.getItem('cacheMetrics');
      if (storedMetrics) {
        const parsed = JSON.parse(storedMetrics);
        this.metrics = { ...this.metrics, ...parsed };
      }
    } catch (error) {
      console.warn('Failed to load persistent cache metrics:', error);
    }
  }

  savePersistentMetrics() {
    try {
      localStorage.setItem('cacheMetrics', JSON.stringify(this.metrics));
    } catch (error) {
      console.warn('Failed to save persistent cache metrics:', error);
    }
  }

  /**
   * Configuration and management
   */
  configure(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  async clear(layerName = null) {
    if (layerName) {
      await this.clearLayer(layerName);
    } else {
      await Promise.all(Object.keys(this.layers).map(name => this.clearLayer(name)));
    }
  }

  async clearLayer(layerName) {
    const layer = this.layers[layerName];

    switch (layerName) {
      case 'memory':
        layer.clear();
        this.memoryUsage = 0;
        break;

      case 'localStorage':
      case 'sessionStorage':
        layer.clear();
        break;

      case 'indexedDB':
        await layer.clear();
        break;
    }

    // Reset metrics for this layer
    this.metrics.hits[layerName] = 0;
    this.metrics.misses[layerName] = 0;
    this.metrics.sets[layerName] = 0;
    this.metrics.evictions[layerName] = 0;
    this.metrics.errors[layerName] = 0;
    this.metrics.totalSize[layerName] = 0;
  }

  /**
   * Export cache data for debugging
   */
  async exportData() {
    const data = {
      memory: Array.from(this.layers.memory.entries()),
      localStorage: this.exportStorageData('localStorage'),
      sessionStorage: this.exportStorageData('sessionStorage'),
      indexedDB: await this.layers.indexedDB.exportData(),
      metrics: this.metrics,
      config: this.config,
    };

    return data;
  }

  exportStorageData(layerName) {
    const layer = this.layers[layerName];
    const data = {};

    for (let i = 0; i < layer.length; i++) {
      const key = layer.key(i);
      if (key) {
        data[key] = layer.getItem(key);
      }
    }

    return data;
  }
}

// Create and export singleton instance
const cacheManager = new CacheManager();

export default cacheManager;