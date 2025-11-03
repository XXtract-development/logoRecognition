/**
 * IndexedDB Cache Implementation
 * US-016: API Caching Strategy - IndexedDB implementation
 */

class IndexedDBCache {
  constructor(options = {}) {
    this.dbName = options.dbName || 'LogoRecognitionCache';
    this.version = options.version || 1;
    this.storeName = options.storeName || 'cache';
    this.db = null;
    this.isInitialized = false;
    this.initPromise = null;

    this.config = {
      maxSize: options.maxSize || 100 * 1024 * 1024, // 100MB
      maxEntries: options.maxEntries || 10000,
      cleanupInterval: options.cleanupInterval || 5 * 60 * 1000, // 5 minutes
      ...options,
    };

    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      size: 0,
      entries: 0,
    };
  }

  /**
   * Initialize IndexedDB connection
   */
  async init() {
    if (this.isInitialized) {
      return this.db;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._init();
    return this.initPromise;
  }

  async _init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isInitialized = true;
        this.setupCleanupInterval();
        this.updateStats();
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'key' });

          // Create indexes for efficient querying
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('tags', 'tags', { unique: false, multiEntry: true });
          store.createIndex('expiry', 'expiry', { unique: false });
          store.createIndex('size', 'size', { unique: false });
          store.createIndex('priority', 'priority', { unique: false });
        }
      };

      request.onblocked = () => {
        console.warn('IndexedDB upgrade blocked. Close other tabs or windows using this application.');
      };
    });
  }

  /**
   * Get value from IndexedDB
   */
  async get(key, allowStale = false) {
    await this.init();

    try {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const result = request.result;

          if (!result) {
            this.stats.misses++;
            resolve(null);
            return;
          }

          // Check expiration
          if (!allowStale && this.isExpired(result)) {
            this.stats.misses++;
            // Async delete expired entry
            this.delete(key).catch(console.error);
            resolve(null);
            return;
          }

          // Update access statistics
          result.accessCount = (result.accessCount || 0) + 1;
          result.lastAccessed = Date.now();

          // Update the entry with new stats (fire and forget)
          this.updateEntry(key, result).catch(console.error);

          this.stats.hits++;
          resolve(result);
        };

        request.onerror = () => {
          this.stats.errors++;
          reject(new Error(`IndexedDB get error: ${request.error}`));
        };
      });
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Set value in IndexedDB
   */
  async set(key, entry) {
    await this.init();

    try {
      // Check storage limits before setting
      await this.enforceStorageLimits(entry.size);

      const dbEntry = {
        key,
        ...entry,
        expiry: entry.timestamp + entry.ttl,
        accessCount: entry.accessCount || 0,
        lastAccessed: entry.lastAccessed || Date.now(),
      };

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(dbEntry);

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          this.stats.sets++;
          this.stats.size += entry.size;
          this.stats.entries++;
          resolve(true);
        };

        request.onerror = () => {
          this.stats.errors++;
          reject(new Error(`IndexedDB set error: ${request.error}`));
        };

        transaction.oncomplete = () => {
          resolve(true);
        };

        transaction.onerror = () => {
          this.stats.errors++;
          reject(new Error(`IndexedDB transaction error: ${transaction.error}`));
        };
      });
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Delete value from IndexedDB
   */
  async delete(key) {
    await this.init();

    try {
      // Get entry first to update size stats
      const entry = await this.get(key, true); // Allow stale to get size info

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(key);

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          this.stats.deletes++;
          if (entry) {
            this.stats.size = Math.max(0, this.stats.size - entry.size);
            this.stats.entries = Math.max(0, this.stats.entries - 1);
          }
          resolve(true);
        };

        request.onerror = () => {
          this.stats.errors++;
          reject(new Error(`IndexedDB delete error: ${request.error}`));
        };
      });
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Clear all data from IndexedDB
   */
  async clear() {
    await this.init();

    try {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          this.stats.size = 0;
          this.stats.entries = 0;
          resolve(true);
        };

        request.onerror = () => {
          this.stats.errors++;
          reject(new Error(`IndexedDB clear error: ${request.error}`));
        };
      });
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Get all keys matching a pattern
   */
  async getKeys(pattern = null) {
    await this.init();

    try {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAllKeys();

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          let keys = request.result;

          if (pattern) {
            const regex = new RegExp(pattern);
            keys = keys.filter(key => regex.test(key));
          }

          resolve(keys);
        };

        request.onerror = () => {
          this.stats.errors++;
          reject(new Error(`IndexedDB getKeys error: ${request.error}`));
        };
      });
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Get entries by tags
   */
  async getByTags(tags) {
    await this.init();

    try {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('tags');

      const results = [];

      for (const tag of tags) {
        const request = index.getAll(tag);
        const entries = await new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });

        results.push(...entries);
      }

      // Remove duplicates and filter expired entries
      const uniqueEntries = results.filter((entry, index, arr) =>
        arr.findIndex(e => e.key === entry.key) === index && !this.isExpired(entry)
      );

      return uniqueEntries;
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Invalidate entries by pattern
   */
  async invalidateByPattern(pattern) {
    try {
      const keys = await this.getKeys(pattern);
      const deletePromises = keys.map(key => this.delete(key));
      await Promise.allSettled(deletePromises);
      return keys.length;
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Invalidate entries by tags
   */
  async invalidateByTags(tags) {
    try {
      const entries = await this.getByTags(tags);
      const deletePromises = entries.map(entry => this.delete(entry.key));
      await Promise.allSettled(deletePromises);
      return entries.length;
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Update existing entry
   */
  async updateEntry(key, updates) {
    await this.init();

    try {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      // Get current entry
      const getRequest = store.get(key);

      return new Promise((resolve, reject) => {
        getRequest.onsuccess = () => {
          const currentEntry = getRequest.result;
          if (!currentEntry) {
            resolve(false);
            return;
          }

          // Merge updates
          const updatedEntry = { ...currentEntry, ...updates };

          // Put updated entry
          const putRequest = store.put(updatedEntry);
          putRequest.onsuccess = () => resolve(true);
          putRequest.onerror = () => {
            this.stats.errors++;
            reject(new Error(`IndexedDB update error: ${putRequest.error}`));
          };
        };

        getRequest.onerror = () => {
          this.stats.errors++;
          reject(new Error(`IndexedDB get error during update: ${getRequest.error}`));
        };
      });
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Cleanup expired entries
   */
  async cleanup() {
    await this.init();

    try {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('expiry');

      const now = Date.now();
      const range = IDBKeyRange.upperBound(now);
      const request = index.openCursor(range);

      let deletedCount = 0;
      let reclaimedSize = 0;

      return new Promise((resolve, reject) => {
        request.onsuccess = (event) => {
          const cursor = event.target.result;

          if (cursor) {
            const entry = cursor.value;
            reclaimedSize += entry.size;

            cursor.delete();
            deletedCount++;
            cursor.continue();
          } else {
            // Update stats
            this.stats.entries = Math.max(0, this.stats.entries - deletedCount);
            this.stats.size = Math.max(0, this.stats.size - reclaimedSize);

            console.log(`IndexedDB cleanup: removed ${deletedCount} expired entries, reclaimed ${reclaimedSize} bytes`);
            resolve({ deletedCount, reclaimedSize });
          }
        };

        request.onerror = () => {
          this.stats.errors++;
          reject(new Error(`IndexedDB cleanup error: ${request.error}`));
        };
      });
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Enforce storage limits by evicting entries
   */
  async enforceStorageLimits(newEntrySize) {
    await this.updateStats();

    // Check if we need to free space
    const projectedSize = this.stats.size + newEntrySize;
    const projectedEntries = this.stats.entries + 1;

    if (projectedSize <= this.config.maxSize && projectedEntries <= this.config.maxEntries) {
      return; // No eviction needed
    }

    // Calculate how much space we need to free
    const sizeToFree = Math.max(0, projectedSize - this.config.maxSize);
    const entriesToFree = Math.max(0, projectedEntries - this.config.maxEntries);

    await this.evictEntries(Math.max(sizeToFree, entriesToFree > 0 ? newEntrySize : 0));
  }

  /**
   * Evict entries using LRU strategy
   */
  async evictEntries(targetSize) {
    await this.init();

    try {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const entries = request.result;

          // Sort by last accessed time (LRU)
          entries.sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0));

          let freedSize = 0;
          let evictedCount = 0;
          const deleteTransaction = this.db.transaction([this.storeName], 'readwrite');
          const deleteStore = deleteTransaction.objectStore(this.storeName);

          for (const entry of entries) {
            if (freedSize >= targetSize) break;

            deleteStore.delete(entry.key);
            freedSize += entry.size;
            evictedCount++;
          }

          deleteTransaction.oncomplete = () => {
            this.stats.size = Math.max(0, this.stats.size - freedSize);
            this.stats.entries = Math.max(0, this.stats.entries - evictedCount);

            console.log(`IndexedDB eviction: removed ${evictedCount} entries, freed ${freedSize} bytes`);
            resolve({ evictedCount, freedSize });
          };

          deleteTransaction.onerror = () => {
            this.stats.errors++;
            reject(new Error(`IndexedDB eviction error: ${deleteTransaction.error}`));
          };
        };

        request.onerror = () => {
          this.stats.errors++;
          reject(new Error(`IndexedDB eviction get error: ${request.error}`));
        };
      });
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Update internal statistics
   */
  async updateStats() {
    await this.init();

    try {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);

      const countRequest = store.count();
      const allRequest = store.getAll();

      const [count, entries] = await Promise.all([
        new Promise((resolve, reject) => {
          countRequest.onsuccess = () => resolve(countRequest.result);
          countRequest.onerror = () => reject(countRequest.error);
        }),
        new Promise((resolve, reject) => {
          allRequest.onsuccess = () => resolve(allRequest.result);
          allRequest.onerror = () => reject(allRequest.error);
        })
      ]);

      const totalSize = entries.reduce((sum, entry) => sum + (entry.size || 0), 0);

      this.stats.entries = count;
      this.stats.size = totalSize;
    } catch (error) {
      this.stats.errors++;
      console.warn('Failed to update IndexedDB stats:', error);
    }
  }

  /**
   * Setup cleanup interval
   */
  setupCleanupInterval() {
    setInterval(() => {
      this.cleanup().catch(error => {
        console.warn('Scheduled IndexedDB cleanup failed:', error);
      });
    }, this.config.cleanupInterval);
  }

  /**
   * Check if entry is expired
   */
  isExpired(entry) {
    return Date.now() > (entry.timestamp + entry.ttl);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      hitRate: this.stats.hits + this.stats.misses > 0
        ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100
        : 0,
      errorRate: this.stats.hits + this.stats.misses > 0
        ? (this.stats.errors / (this.stats.hits + this.stats.misses + this.stats.errors)) * 100
        : 0,
      avgSize: this.stats.entries > 0 ? this.stats.size / this.stats.entries : 0,
      utilizationRate: (this.stats.size / this.config.maxSize) * 100,
    };
  }

  /**
   * Export all data for debugging
   */
  async exportData() {
    await this.init();

    try {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          resolve({
            entries: request.result,
            stats: this.getStats(),
            config: this.config,
          });
        };

        request.onerror = () => {
          this.stats.errors++;
          reject(new Error(`IndexedDB export error: ${request.error}`));
        };
      });
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Estimate storage usage
   */
  async estimateUsage() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        return {
          quota: estimate.quota,
          usage: estimate.usage,
          available: estimate.quota - estimate.usage,
          usageDetails: estimate.usageDetails,
        };
      } catch (error) {
        console.warn('Failed to estimate storage usage:', error);
      }
    }

    return null;
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }

  /**
   * Delete the entire database
   */
  async deleteDatabase() {
    this.close();

    return new Promise((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase(this.dbName);

      deleteRequest.onsuccess = () => {
        console.log('IndexedDB database deleted successfully');
        resolve(true);
      };

      deleteRequest.onerror = () => {
        reject(new Error(`Failed to delete IndexedDB: ${deleteRequest.error}`));
      };

      deleteRequest.onblocked = () => {
        console.warn('Database deletion blocked. Close other tabs using this application.');
      };
    });
  }
}

export default IndexedDBCache;