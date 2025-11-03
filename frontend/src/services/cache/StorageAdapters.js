/**
 * Storage Adapters for Multi-Layer Caching
 * Provides unified interface for different storage mechanisms
 */

/**
 * Base Storage Adapter Interface
 */
class StorageAdapter {
  async get(key) {
    throw new Error('Method not implemented');
  }

  async set(key, value, ttl) {
    throw new Error('Method not implemented');
  }

  async delete(key) {
    throw new Error('Method not implemented');
  }

  async clear() {
    throw new Error('Method not implemented');
  }

  async size() {
    throw new Error('Method not implemented');
  }
}

/**
 * Memory Storage Adapter
 */
export class MemoryAdapter extends StorageAdapter {
  constructor() {
    super();
    this.store = new Map();
    this.metadata = new Map();
  }

  async get(key) {
    const meta = this.metadata.get(key);
    if (meta && meta.expiry && Date.now() > meta.expiry) {
      await this.delete(key);
      return null;
    }
    return this.store.get(key) || null;
  }

  async set(key, value, ttl = null) {
    this.store.set(key, value);
    this.metadata.set(key, {
      created: Date.now(),
      expiry: ttl ? Date.now() + ttl : null,
      size: JSON.stringify(value).length
    });
  }

  async delete(key) {
    this.store.delete(key);
    this.metadata.delete(key);
  }

  async clear() {
    this.store.clear();
    this.metadata.clear();
  }

  async size() {
    return this.store.size;
  }
}

/**
 * LocalStorage Adapter
 */
export class LocalStorageAdapter extends StorageAdapter {
  constructor(prefix = 'cache_') {
    super();
    this.prefix = prefix;
  }

  async get(key) {
    try {
      const item = localStorage.getItem(this.prefix + key);
      if (!item) return null;

      const { value, expiry } = JSON.parse(item);
      if (expiry && Date.now() > expiry) {
        await this.delete(key);
        return null;
      }
      return value;
    } catch (error) {
      console.error('LocalStorage get error:', error);
      return null;
    }
  }

  async set(key, value, ttl = null) {
    try {
      const item = {
        value,
        created: Date.now(),
        expiry: ttl ? Date.now() + ttl : null
      };
      localStorage.setItem(this.prefix + key, JSON.stringify(item));
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        await this.evictOldest();
        try {
          localStorage.setItem(this.prefix + key, JSON.stringify({ value, expiry: ttl ? Date.now() + ttl : null }));
        } catch {
          console.error('LocalStorage full, cannot store item');
        }
      }
    }
  }

  async delete(key) {
    localStorage.removeItem(this.prefix + key);
  }

  async clear() {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(this.prefix)) {
        localStorage.removeItem(key);
      }
    });
  }

  async size() {
    let count = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        count++;
      }
    }
    return count;
  }

  async evictOldest() {
    const items = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        try {
          const item = JSON.parse(localStorage.getItem(key));
          items.push({ key, created: item.created || 0 });
        } catch {}
      }
    }

    items.sort((a, b) => a.created - b.created);
    const toRemove = Math.ceil(items.length * 0.2); // Remove oldest 20%
    for (let i = 0; i < toRemove; i++) {
      localStorage.removeItem(items[i].key);
    }
  }
}

/**
 * IndexedDB Adapter
 */
export class IndexedDBAdapter extends StorageAdapter {
  constructor(dbName = 'AppCache', storeName = 'cache') {
    super();
    this.dbName = dbName;
    this.storeName = storeName;
    this.db = null;
    this.initPromise = this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
          store.createIndex('expiry', 'expiry', { unique: false });
          store.createIndex('created', 'created', { unique: false });
        }
      };
    });
  }

  async ensureReady() {
    if (!this.db) {
      await this.initPromise;
    }
  }

  async get(key) {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
          return;
        }

        if (result.expiry && Date.now() > result.expiry) {
          this.delete(key);
          resolve(null);
          return;
        }

        resolve(result.value);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async set(key, value, ttl = null) {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const data = {
        key,
        value,
        created: Date.now(),
        expiry: ttl ? Date.now() + ttl : null,
        size: JSON.stringify(value).length
      };

      const request = store.put(data);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async delete(key) {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear() {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async size() {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async cleanExpired() {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('expiry');
      const range = IDBKeyRange.upperBound(Date.now());
      const request = index.openCursor(range);
      let deleted = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && cursor.value.expiry) {
          store.delete(cursor.primaryKey);
          deleted++;
          cursor.continue();
        } else {
          resolve(deleted);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }
}

/**
 * Storage Adapter Factory
 */
export class StorageAdapterFactory {
  static create(type, options = {}) {
    switch (type) {
      case 'memory':
        return new MemoryAdapter();
      case 'localStorage':
        return new LocalStorageAdapter(options.prefix);
      case 'indexedDB':
        return new IndexedDBAdapter(options.dbName, options.storeName);
      default:
        throw new Error(`Unknown storage adapter type: ${type}`);
    }
  }

  static async getBestAvailable() {
    // Check IndexedDB support
    if (typeof indexedDB !== 'undefined') {
      try {
        const testDB = await new IndexedDBAdapter('test', 'test');
        await testDB.set('test', 'test');
        await testDB.delete('test');
        return new IndexedDBAdapter();
      } catch {}
    }

    // Fallback to localStorage
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('test', 'test');
        localStorage.removeItem('test');
        return new LocalStorageAdapter();
      } catch {}
    }

    // Fallback to memory
    return new MemoryAdapter();
  }
}

export default StorageAdapterFactory;