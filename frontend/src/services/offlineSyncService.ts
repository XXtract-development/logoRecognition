/**
 * Offline Sync Service
 * Handles offline data synchronization and queue management
 */

import { apiClient } from './api';

export interface QueuedRequest {
  id: string;
  type: 'POST' | 'PUT' | 'DELETE';
  url: string;
  data?: any;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

export interface SyncStatus {
  isOnline: boolean;
  queueLength: number;
  lastSyncTime: number | null;
  isSyncing: boolean;
}

class OfflineSyncService {
  private queue: Map<string, QueuedRequest> = new Map();
  private isOnline: boolean = navigator.onLine;
  private syncInProgress: boolean = false;
  private lastSyncTime: number | null = null;
  private listeners: Set<(status: SyncStatus) => void> = new Set();
  private syncInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeEventListeners();
    this.loadQueueFromStorage();
    this.startAutoSync();
  }

  private initializeEventListeners(): void {
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  private handleOnline(): void {
    console.log('Connection restored - starting sync');
    this.isOnline = true;
    this.notifyListeners();
    this.syncQueue();
  }

  private handleOffline(): void {
    console.log('Connection lost - queueing requests');
    this.isOnline = false;
    this.notifyListeners();
  }

  private loadQueueFromStorage(): void {
    try {
      const savedQueue = localStorage.getItem('offline-sync-queue');
      if (savedQueue) {
        const items = JSON.parse(savedQueue) as QueuedRequest[];
        items.forEach(item => this.queue.set(item.id, item));
      }
    } catch (error) {
      console.error('Failed to load offline queue:', error);
    }
  }

  private saveQueueToStorage(): void {
    try {
      const items = Array.from(this.queue.values());
      localStorage.setItem('offline-sync-queue', JSON.stringify(items));
    } catch (error) {
      console.error('Failed to save offline queue:', error);
    }
  }

  private startAutoSync(): void {
    // Auto-sync every 30 seconds when online
    this.syncInterval = setInterval(() => {
      if (this.isOnline && this.queue.size > 0 && !this.syncInProgress) {
        this.syncQueue();
      }
    }, 30000);
  }

  public stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Add a request to the offline queue
   */
  public queueRequest(
    type: 'POST' | 'PUT' | 'DELETE',
    url: string,
    data?: any
  ): string {
    const request: QueuedRequest = {
      id: `${Date.now()}-${Math.random()}`,
      type,
      url,
      data,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: 3,
    };

    this.queue.set(request.id, request);
    this.saveQueueToStorage();
    this.notifyListeners();

    // If online, try to sync immediately
    if (this.isOnline && !this.syncInProgress) {
      this.syncQueue();
    }

    return request.id;
  }

  /**
   * Remove a request from the queue
   */
  public removeFromQueue(requestId: string): void {
    this.queue.delete(requestId);
    this.saveQueueToStorage();
    this.notifyListeners();
  }

  /**
   * Sync all queued requests
   */
  public async syncQueue(): Promise<void> {
    if (this.syncInProgress || !this.isOnline || this.queue.size === 0) {
      return;
    }

    this.syncInProgress = true;
    this.notifyListeners();

    const requests = Array.from(this.queue.values())
      .sort((a, b) => a.timestamp - b.timestamp);

    for (const request of requests) {
      try {
        await this.processRequest(request);
        this.queue.delete(request.id);
      } catch (error) {
        console.error(`Failed to process request ${request.id}:`, error);
        request.retryCount++;

        if (request.retryCount >= request.maxRetries) {
          console.error(`Request ${request.id} exceeded max retries, removing from queue`);
          this.queue.delete(request.id);
        } else {
          this.queue.set(request.id, request);
        }
      }
    }

    this.lastSyncTime = Date.now();
    this.syncInProgress = false;
    this.saveQueueToStorage();
    this.notifyListeners();
  }

  private async processRequest(request: QueuedRequest): Promise<void> {
    switch (request.type) {
      case 'POST':
        await apiClient.post(request.url, request.data);
        break;
      case 'PUT':
        await apiClient.put(request.url, request.data);
        break;
      case 'DELETE':
        await apiClient.delete(request.url);
        break;
      default:
        throw new Error(`Unknown request type: ${request.type}`);
    }
  }

  /**
   * Get current sync status
   */
  public getStatus(): SyncStatus {
    return {
      isOnline: this.isOnline,
      queueLength: this.queue.size,
      lastSyncTime: this.lastSyncTime,
      isSyncing: this.syncInProgress,
    };
  }

  /**
   * Subscribe to sync status changes
   */
  public subscribe(callback: (status: SyncStatus) => void): () => void {
    this.listeners.add(callback);
    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(): void {
    const status = this.getStatus();
    this.listeners.forEach(callback => callback(status));
  }

  /**
   * Clear all queued requests
   */
  public clearQueue(): void {
    this.queue.clear();
    this.saveQueueToStorage();
    this.notifyListeners();
  }

  /**
   * Force retry all queued requests
   */
  public async forceSync(): Promise<void> {
    if (!this.isOnline) {
      throw new Error('Cannot sync while offline');
    }
    await this.syncQueue();
  }

  /**
   * Get all queued requests
   */
  public getQueuedRequests(): QueuedRequest[] {
    return Array.from(this.queue.values())
      .sort((a, b) => a.timestamp - b.timestamp);
  }
}

// Singleton instance
const offlineSyncService = new OfflineSyncService();

// Cleanup on window unload
window.addEventListener('beforeunload', () => {
  offlineSyncService.stopAutoSync();
});

export default offlineSyncService;