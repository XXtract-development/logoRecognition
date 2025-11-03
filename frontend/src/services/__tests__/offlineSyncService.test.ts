/**
 * Tests for Offline Sync Service
 */

// Mock axios first before any other imports
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: () => ({
      interceptors: {
        request: { use: () => {} },
        response: { use: () => {} }
      },
      get: () => Promise.resolve({ data: {} }),
      post: () => Promise.resolve({ data: {} }),
      put: () => Promise.resolve({ data: {} }),
      delete: () => Promise.resolve({ data: {} }),
    }),
    get: () => Promise.resolve({ data: {} }),
    post: () => Promise.resolve({ data: {} }),
    put: () => Promise.resolve({ data: {} }),
    delete: () => Promise.resolve({ data: {} }),
    interceptors: {
      request: { use: () => {} },
      response: { use: () => {} }
    }
  }
}));

import offlineSyncService from '../offlineSyncService';
import apiService from '../api';

// Mock the api service
jest.mock('../api');

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true
});

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', {
  writable: true,
  value: true,
});

describe('OfflineSyncService', () => {
  const mockApiService = apiService as jest.Mocked<typeof apiService>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    localStorageMock.getItem.mockReturnValue(null);
    (navigator as any).onLine = true;
  });

  afterEach(() => {
    jest.useRealTimers();
    offlineSyncService.clearQueue();
  });

  describe('queueRequest', () => {
    it('should queue a request when offline', () => {
      (navigator as any).onLine = false;
      const requestId = offlineSyncService.queueRequest('POST', '/test', { data: 'test' });

      expect(requestId).toBeTruthy();
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'offline-sync-queue',
        expect.any(String)
      );
    });

    it('should attempt sync immediately when online', async () => {
      (navigator as any).onLine = true;
      mockApiService.post.mockResolvedValue({ success: true });

      offlineSyncService.queueRequest('POST', '/test', { data: 'test' });

      // Allow async operations to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockApiService.post).toHaveBeenCalledWith('/test', { data: 'test' });
    });
  });

  describe('syncQueue', () => {
    it('should process all queued requests', async () => {
      mockApiService.post.mockResolvedValue({ success: true });
      mockApiService.put.mockResolvedValue({ success: true });
      mockApiService.delete.mockResolvedValue({ success: true });

      // Queue multiple requests
      offlineSyncService.queueRequest('POST', '/test1', { data: '1' });
      offlineSyncService.queueRequest('PUT', '/test2', { data: '2' });
      offlineSyncService.queueRequest('DELETE', '/test3');

      // Sync the queue
      await offlineSyncService.syncQueue();

      expect(mockApiService.post).toHaveBeenCalledWith('/test1', { data: '1' });
      expect(mockApiService.put).toHaveBeenCalledWith('/test2', { data: '2' });
      expect(mockApiService.delete).toHaveBeenCalledWith('/test3');
    });

    it('should handle failed requests with retry', async () => {
      const error = new Error('Network error');
      mockApiService.post.mockRejectedValueOnce(error);
      mockApiService.post.mockResolvedValueOnce({ success: true });

      offlineSyncService.queueRequest('POST', '/test', { data: 'test' });

      // First attempt fails
      await offlineSyncService.syncQueue();
      expect(offlineSyncService.getQueuedRequests().length).toBe(1);

      // Second attempt succeeds
      await offlineSyncService.syncQueue();
      expect(offlineSyncService.getQueuedRequests().length).toBe(0);
    });

    it('should remove requests after max retries', async () => {
      const error = new Error('Network error');
      mockApiService.post.mockRejectedValue(error);

      offlineSyncService.queueRequest('POST', '/test', { data: 'test' });

      // Attempt to sync multiple times
      for (let i = 0; i < 4; i++) {
        await offlineSyncService.syncQueue();
      }

      // Request should be removed after max retries
      expect(offlineSyncService.getQueuedRequests().length).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('should return current sync status', () => {
      const status = offlineSyncService.getStatus();

      expect(status).toEqual({
        isOnline: true,
        queueLength: 0,
        lastSyncTime: null,
        isSyncing: false,
      });
    });

    it('should reflect queue changes in status', () => {
      offlineSyncService.queueRequest('POST', '/test', { data: 'test' });

      const status = offlineSyncService.getStatus();
      expect(status.queueLength).toBe(1);
    });
  });

  describe('online/offline events', () => {
    it('should handle going offline', () => {
      const offlineEvent = new Event('offline');
      window.dispatchEvent(offlineEvent);

      const status = offlineSyncService.getStatus();
      expect(status.isOnline).toBe(false);
    });

    it('should trigger sync when coming online', async () => {
      mockApiService.post.mockResolvedValue({ success: true });

      // Go offline and queue request
      (navigator as any).onLine = false;
      const offlineEvent = new Event('offline');
      window.dispatchEvent(offlineEvent);

      offlineSyncService.queueRequest('POST', '/test', { data: 'test' });

      // Go back online
      (navigator as any).onLine = true;
      const onlineEvent = new Event('online');
      window.dispatchEvent(onlineEvent);

      // Allow sync to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockApiService.post).toHaveBeenCalledWith('/test', { data: 'test' });
    });
  });

  describe('subscribe', () => {
    it('should notify listeners of status changes', () => {
      const listener = jest.fn();
      const unsubscribe = offlineSyncService.subscribe(listener);

      offlineSyncService.queueRequest('POST', '/test', { data: 'test' });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          queueLength: 1,
        })
      );

      unsubscribe();
      offlineSyncService.clearQueue();
      expect(listener).toHaveBeenCalledTimes(1); // No additional calls after unsubscribe
    });
  });

  describe('clearQueue', () => {
    it('should clear all queued requests', () => {
      offlineSyncService.queueRequest('POST', '/test1', { data: '1' });
      offlineSyncService.queueRequest('POST', '/test2', { data: '2' });

      expect(offlineSyncService.getQueuedRequests().length).toBe(2);

      offlineSyncService.clearQueue();

      expect(offlineSyncService.getQueuedRequests().length).toBe(0);
      expect(localStorageMock.setItem).toHaveBeenLastCalledWith(
        'offline-sync-queue',
        '[]'
      );
    });
  });

  describe('forceSync', () => {
    it('should sync when forced while online', async () => {
      mockApiService.post.mockResolvedValue({ success: true });

      offlineSyncService.queueRequest('POST', '/test', { data: 'test' });
      await offlineSyncService.forceSync();

      expect(mockApiService.post).toHaveBeenCalledWith('/test', { data: 'test' });
    });

    it('should throw error when forced while offline', async () => {
      (navigator as any).onLine = false;
      const offlineEvent = new Event('offline');
      window.dispatchEvent(offlineEvent);

      await expect(offlineSyncService.forceSync()).rejects.toThrow('Cannot sync while offline');
    });
  });
});