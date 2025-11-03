/**
 * Offline Manager for Progressive Web App functionality
 * Handles offline support, background sync, and cache strategies
 */

import { CacheManager } from '../cache/CacheManager';

/**
 * Offline Manager Class
 */
export class OfflineManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.syncQueue = [];
    this.cacheManager = CacheManager.getInstance();
    this.serviceWorkerReady = false;
    this.backgroundSyncSupported = 'serviceWorker' in navigator && 'SyncManager' in window;

    this.init();
  }

  /**
   * Initialize offline manager
   */
  init() {
    // Listen for online/offline events
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Register service worker if available
    if ('serviceWorker' in navigator) {
      this.registerServiceWorker();
    }

    // Setup periodic sync
    this.setupPeriodicSync();
  }

  /**
   * Register service worker
   */
  async registerServiceWorker() {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      this.serviceWorkerReady = true;
      console.log('Service Worker registered:', registration);

      // Setup message channel
      navigator.serviceWorker.addEventListener('message', (event) => {
        this.handleServiceWorkerMessage(event.data);
      });

      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return null;
    }
  }

  /**
   * Handle online event
   */
  handleOnline() {
    this.isOnline = true;
    console.log('🌐 Application is online');

    // Process sync queue
    this.processSyncQueue();

    // Emit online event
    window.dispatchEvent(new Event('app-online'));
  }

  /**
   * Handle offline event
   */
  handleOffline() {
    this.isOnline = false;
    console.log('📴 Application is offline');

    // Emit offline event
    window.dispatchEvent(new Event('app-offline'));
  }

  /**
   * Add request to sync queue
   */
  addToSyncQueue(request) {
    const syncItem = {
      id: Date.now() + '_' + Math.random(),
      url: request.url,
      method: request.method || 'GET',
      headers: request.headers || {},
      body: request.body || null,
      timestamp: Date.now(),
      retries: 0,
      maxRetries: 3
    };

    this.syncQueue.push(syncItem);

    // Store in IndexedDB for persistence
    this.storeSyncQueue();

    // Try background sync if supported
    if (this.backgroundSyncSupported) {
      this.requestBackgroundSync();
    }

    return syncItem.id;
  }

  /**
   * Process sync queue
   */
  async processSyncQueue() {
    if (!this.isOnline || this.syncQueue.length === 0) {
      return;
    }

    console.log(`📤 Processing ${this.syncQueue.length} queued requests`);

    const processed = [];

    for (const item of this.syncQueue) {
      try {
        const response = await this.replayRequest(item);

        if (response.ok) {
          processed.push(item.id);
          console.log(`✅ Synced: ${item.url}`);
        } else if (item.retries < item.maxRetries) {
          item.retries++;
          console.log(`🔄 Retry ${item.retries}/${item.maxRetries}: ${item.url}`);
        } else {
          processed.push(item.id);
          console.error(`❌ Failed after ${item.maxRetries} retries: ${item.url}`);
        }
      } catch (error) {
        if (item.retries < item.maxRetries) {
          item.retries++;
        } else {
          processed.push(item.id);
          console.error(`❌ Failed to sync: ${item.url}`, error);
        }
      }
    }

    // Remove processed items
    this.syncQueue = this.syncQueue.filter(item => !processed.includes(item.id));
    this.storeSyncQueue();

    // Schedule retry for remaining items
    if (this.syncQueue.length > 0) {
      setTimeout(() => this.processSyncQueue(), 30000); // Retry in 30 seconds
    }
  }

  /**
   * Replay a queued request
   */
  async replayRequest(item) {
    const options = {
      method: item.method,
      headers: item.headers
    };

    if (item.body && item.method !== 'GET' && item.method !== 'HEAD') {
      options.body = item.body;
    }

    return fetch(item.url, options);
  }

  /**
   * Store sync queue to IndexedDB
   */
  async storeSyncQueue() {
    try {
      await this.cacheManager.set('offline_sync_queue', this.syncQueue, null);
    } catch (error) {
      console.error('Failed to store sync queue:', error);
    }
  }

  /**
   * Load sync queue from IndexedDB
   */
  async loadSyncQueue() {
    try {
      const queue = await this.cacheManager.get('offline_sync_queue');
      if (queue) {
        this.syncQueue = queue;
      }
    } catch (error) {
      console.error('Failed to load sync queue:', error);
    }
  }

  /**
   * Request background sync
   */
  async requestBackgroundSync() {
    if (!this.backgroundSyncSupported || !this.serviceWorkerReady) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register('data-sync');
      console.log('Background sync requested');
    } catch (error) {
      console.error('Background sync failed:', error);
    }
  }

  /**
   * Setup periodic sync
   */
  async setupPeriodicSync() {
    if (!this.backgroundSyncSupported || !this.serviceWorkerReady) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' });

      if (status.state === 'granted') {
        await registration.periodicSync.register('content-sync', {
          minInterval: 60 * 60 * 1000 // 1 hour
        });
        console.log('Periodic sync registered');
      }
    } catch (error) {
      console.log('Periodic sync not supported:', error);
    }
  }

  /**
   * Handle service worker messages
   */
  handleServiceWorkerMessage(data) {
    switch (data.type) {
      case 'sync-complete':
        console.log('✅ Background sync completed');
        this.loadSyncQueue(); // Reload queue after background sync
        break;
      case 'cache-updated':
        console.log('📦 Cache updated:', data.url);
        break;
      case 'offline-ready':
        console.log('🎯 Offline mode ready');
        break;
      default:
        console.log('Service Worker message:', data);
    }
  }

  /**
   * Cache strategy for offline support
   */
  async cacheForOffline(resources) {
    const cached = [];
    const failed = [];

    for (const resource of resources) {
      try {
        // Fetch and cache the resource
        const response = await fetch(resource);
        if (response.ok) {
          const data = await response.json();
          await this.cacheManager.set(resource, data, null); // No expiry for offline resources
          cached.push(resource);
        } else {
          failed.push(resource);
        }
      } catch (error) {
        console.error(`Failed to cache ${resource}:`, error);
        failed.push(resource);
      }
    }

    return { cached, failed };
  }

  /**
   * Get offline status
   */
  getStatus() {
    return {
      isOnline: this.isOnline,
      syncQueueSize: this.syncQueue.length,
      serviceWorkerReady: this.serviceWorkerReady,
      backgroundSyncSupported: this.backgroundSyncSupported
    };
  }

  /**
   * Clear offline data
   */
  async clearOfflineData() {
    this.syncQueue = [];
    await this.storeSyncQueue();
    console.log('🧹 Offline data cleared');
  }

  /**
   * Manual sync trigger
   */
  manualSync() {
    if (this.isOnline) {
      this.processSyncQueue();
    } else {
      console.warn('Cannot sync while offline');
      return false;
    }
    return true;
  }
}

// Singleton instance
let instance = null;

export const getOfflineManager = () => {
  if (!instance) {
    instance = new OfflineManager();
  }
  return instance;
};

export default OfflineManager;