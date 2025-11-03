/**
 * Cache System Testing Suite
 * US-016: API Caching Strategy - Comprehensive cache tests
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import cacheManager from '../services/cache/CacheManager';
import IndexedDBCache from '../services/cache/IndexedDBCache';
import {
  useCache,
  useCachedAPI,
  usePaginatedCache,
  useRealtimeCache,
  useCacheStats,
  useCacheWarming,
  useCacheInvalidation
} from '../hooks/useCache';

// Mock IndexedDB
const mockIndexedDB = {
  open: jest.fn(),
  deleteDatabase: jest.fn(),
};

global.indexedDB = mockIndexedDB;

// Mock fetch for API tests
global.fetch = jest.fn();

// Mock WebSocket for real-time tests
global.WebSocket = jest.fn();

// Mock localStorage and sessionStorage
const mockStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};

Object.defineProperty(window, 'localStorage', { value: mockStorage });
Object.defineProperty(window, 'sessionStorage', { value: mockStorage });

describe('CacheManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheManager.clear();
  });

  describe('Basic Cache Operations', () => {
    test('should set and get values from memory cache', async () => {
      const testData = { id: 1, name: 'Test Data' };

      await cacheManager.set('test-key', testData);
      const retrieved = await cacheManager.get('test-key');

      expect(retrieved).toEqual(testData);
    });

    test('should handle cache misses gracefully', async () => {
      const result = await cacheManager.get('non-existent-key');
      expect(result).toBeNull();
    });

    test('should delete cached values', async () => {
      await cacheManager.set('delete-test', 'value');
      await cacheManager.delete('delete-test');

      const result = await cacheManager.get('delete-test');
      expect(result).toBeNull();
    });

    test('should clear all cache layers', async () => {
      await cacheManager.set('clear-test-1', 'value1');
      await cacheManager.set('clear-test-2', 'value2');

      await cacheManager.clear();

      expect(await cacheManager.get('clear-test-1')).toBeNull();
      expect(await cacheManager.get('clear-test-2')).toBeNull();
    });
  });

  describe('Cache Strategies', () => {
    test('should use different strategies for different cache operations', async () => {
      const fastData = 'fast-cache-data';
      const persistentData = 'persistent-cache-data';

      await cacheManager.set('fast-key', fastData, { strategy: 'fast' });
      await cacheManager.set('persistent-key', persistentData, { strategy: 'persistent' });

      expect(await cacheManager.get('fast-key', { strategy: 'fast' })).toBe(fastData);
      expect(await cacheManager.get('persistent-key', { strategy: 'persistent' })).toBe(persistentData);
    });

    test('should respect TTL settings', async () => {
      jest.useFakeTimers();

      await cacheManager.set('ttl-test', 'data', { ttl: 1000 }); // 1 second TTL

      // Should be available immediately
      expect(await cacheManager.get('ttl-test')).toBe('data');

      // Fast-forward past TTL
      jest.advanceTimersByTime(1500);

      // Should be expired
      expect(await cacheManager.get('ttl-test')).toBeNull();

      jest.useRealTimers();
    });

    test('should handle cache promotion between layers', async () => {
      // Mock successful cache operations
      const mockPromote = jest.spyOn(cacheManager, 'promoteToHigherLayers');

      await cacheManager.set('promote-test', 'data', { strategy: 'default' });
      await cacheManager.get('promote-test', { strategy: 'default' });

      expect(mockPromote).toHaveBeenCalled();

      mockPromote.mockRestore();
    });
  });

  describe('Cache Invalidation', () => {
    test('should invalidate cache by key pattern', async () => {
      await cacheManager.set('user:1:profile', 'profile1');
      await cacheManager.set('user:2:profile', 'profile2');
      await cacheManager.set('post:1:data', 'post1');

      await cacheManager.invalidate('user:.*:profile', { pattern: true });

      expect(await cacheManager.get('user:1:profile')).toBeNull();
      expect(await cacheManager.get('user:2:profile')).toBeNull();
      expect(await cacheManager.get('post:1:data')).toBe('post1');
    });

    test('should invalidate cache by tags', async () => {
      await cacheManager.set('data1', 'value1', { tags: ['user', 'profile'] });
      await cacheManager.set('data2', 'value2', { tags: ['user', 'settings'] });
      await cacheManager.set('data3', 'value3', { tags: ['post'] });

      await cacheManager.invalidate(null, { tags: ['user'] });

      expect(await cacheManager.get('data1')).toBeNull();
      expect(await cacheManager.get('data2')).toBeNull();
      expect(await cacheManager.get('data3')).toBe('value3');
    });
  });

  describe('Cache Warming', () => {
    test('should warm cache with predefined data', async () => {
      const warmupData = [
        {
          key: 'warm1',
          fetcher: () => Promise.resolve('warmed-data-1'),
          options: { strategy: 'preload' }
        },
        {
          key: 'warm2',
          fetcher: () => Promise.resolve('warmed-data-2'),
          options: { strategy: 'preload' }
        }
      ];

      const results = await cacheManager.warmCache(warmupData);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);

      expect(await cacheManager.get('warm1')).toBe('warmed-data-1');
      expect(await cacheManager.get('warm2')).toBe('warmed-data-2');
    });

    test('should handle warming failures gracefully', async () => {
      const warmupData = [
        {
          key: 'success',
          fetcher: () => Promise.resolve('success-data'),
        },
        {
          key: 'failure',
          fetcher: () => Promise.reject(new Error('Fetch failed')),
        }
      ];

      const results = await cacheManager.warmCache(warmupData);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBeInstanceOf(Error);
    });
  });

  describe('GetOrSet Pattern', () => {
    test('should fetch and cache data when not in cache', async () => {
      const fetcher = jest.fn().mockResolvedValue('fresh-data');

      const result = await cacheManager.getOrSet('fresh-key', fetcher);

      expect(fetcher).toHaveBeenCalled();
      expect(result).toBe('fresh-data');
      expect(await cacheManager.get('fresh-key')).toBe('fresh-data');
    });

    test('should return cached data without calling fetcher', async () => {
      await cacheManager.set('cached-key', 'cached-data');

      const fetcher = jest.fn();
      const result = await cacheManager.getOrSet('cached-key', fetcher);

      expect(fetcher).not.toHaveBeenCalled();
      expect(result).toBe('cached-data');
    });

    test('should return stale data when allowStale is true and fetch fails', async () => {
      // Set expired data
      jest.useFakeTimers();
      await cacheManager.set('stale-key', 'stale-data', { ttl: 100 });
      jest.advanceTimersByTime(200);

      const fetcher = jest.fn().mockRejectedValue(new Error('Fetch failed'));

      const result = await cacheManager.getOrSet('stale-key', fetcher, { allowStale: true });

      expect(result).toBe('stale-data');

      jest.useRealTimers();
    });
  });

  describe('Cache Statistics', () => {
    test('should track cache hits and misses', async () => {
      await cacheManager.set('stats-test', 'data');

      // Hit
      await cacheManager.get('stats-test');

      // Miss
      await cacheManager.get('non-existent');

      const stats = cacheManager.getStats();

      expect(stats.hitRate).toBeGreaterThan(0);
      expect(stats.missRate).toBeGreaterThan(0);
    });

    test('should calculate efficiency metrics', async () => {
      // Simulate some cache operations
      await cacheManager.set('efficiency-test', 'data');
      await cacheManager.get('efficiency-test'); // hit
      await cacheManager.get('missing-key'); // miss

      const stats = cacheManager.getStats();

      expect(stats.efficiency).toBeGreaterThan(0);
      expect(stats.efficiency).toBeLessThanOrEqual(100);
    });
  });

  describe('Memory Management', () => {
    test('should enforce memory limits and evict entries', async () => {
      // Mock memory usage tracking
      const originalMemoryUsage = cacheManager.memoryUsage;
      cacheManager.memoryUsage = 45 * 1024 * 1024; // 45MB

      // Try to add data that would exceed limit (50MB)
      const largeData = 'x'.repeat(10 * 1024 * 1024); // 10MB

      await cacheManager.set('large-data', largeData);

      // Should have triggered eviction
      expect(cacheManager.memoryUsage).toBeLessThan(50 * 1024 * 1024);

      cacheManager.memoryUsage = originalMemoryUsage;
    });

    test('should cleanup expired entries automatically', async () => {
      jest.useFakeTimers();

      await cacheManager.set('cleanup-test', 'data', { ttl: 1000 });

      // Fast-forward past TTL
      jest.advanceTimersByTime(2000);

      // Trigger cleanup
      cacheManager.cleanupExpiredEntries('memory');

      expect(await cacheManager.get('cleanup-test')).toBeNull();

      jest.useRealTimers();
    });
  });

  describe('Network Awareness', () => {
    test('should adapt behavior based on network conditions', () => {
      const originalConnection = navigator.connection;

      // Mock slow connection
      Object.defineProperty(navigator, 'connection', {
        value: { effectiveType: 'slow-2g', saveData: true },
        configurable: true
      });

      cacheManager.handleNetworkStatusChange('offline');

      // Should adapt caching strategy
      expect(document.body.classList.contains('low-bandwidth')).toBe(true);

      // Restore original connection
      Object.defineProperty(navigator, 'connection', {
        value: originalConnection,
        configurable: true
      });
    });
  });
});

describe('IndexedDBCache', () => {
  let indexedDBCache;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock IndexedDB operations
    const mockDB = {
      transaction: jest.fn().mockReturnValue({
        objectStore: jest.fn().mockReturnValue({
          get: jest.fn().mockReturnValue({
            onsuccess: null,
            onerror: null,
            result: null,
          }),
          put: jest.fn().mockReturnValue({
            onsuccess: null,
            onerror: null,
          }),
          delete: jest.fn().mockReturnValue({
            onsuccess: null,
            onerror: null,
          }),
          clear: jest.fn().mockReturnValue({
            onsuccess: null,
            onerror: null,
          }),
        }),
        oncomplete: null,
        onerror: null,
      }),
    };

    mockIndexedDB.open.mockReturnValue({
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      result: mockDB,
    });

    indexedDBCache = new IndexedDBCache();
  });

  test('should initialize IndexedDB connection', async () => {
    const initPromise = indexedDBCache.init();

    // Simulate successful connection
    const openRequest = mockIndexedDB.open.mock.results[0].value;
    openRequest.onsuccess();

    await initPromise;

    expect(indexedDBCache.isInitialized).toBe(true);
  });

  test('should handle IndexedDB connection errors', async () => {
    const initPromise = indexedDBCache.init();

    // Simulate connection error
    const openRequest = mockIndexedDB.open.mock.results[0].value;
    openRequest.onerror = jest.fn();
    openRequest.onerror();

    await expect(initPromise).rejects.toThrow();
  });

  test('should perform CRUD operations', async () => {
    // Mock successful init
    indexedDBCache.db = {
      transaction: jest.fn().mockReturnValue({
        objectStore: jest.fn().mockReturnValue({
          get: jest.fn().mockReturnValue({ onsuccess: null, result: null }),
          put: jest.fn().mockReturnValue({ onsuccess: null }),
          delete: jest.fn().mockReturnValue({ onsuccess: null }),
        }),
        oncomplete: null,
      }),
    };
    indexedDBCache.isInitialized = true;

    // Test set operation
    const setPromise = indexedDBCache.set('test-key', { value: 'test-data' });
    const putRequest = indexedDBCache.db.transaction().objectStore().put();
    putRequest.onsuccess();

    await expect(setPromise).resolves.toBe(true);

    // Test get operation
    const getPromise = indexedDBCache.get('test-key');
    const getRequest = indexedDBCache.db.transaction().objectStore().get();
    getRequest.result = { value: 'test-data', timestamp: Date.now(), ttl: 300000 };
    getRequest.onsuccess();

    await expect(getPromise).resolves.toEqual(expect.objectContaining({
      value: 'test-data'
    }));
  });

  test('should handle storage limit enforcement', async () => {
    indexedDBCache.stats.size = 95 * 1024 * 1024; // 95MB
    indexedDBCache.config.maxSize = 100 * 1024 * 1024; // 100MB

    const mockEvict = jest.spyOn(indexedDBCache, 'evictEntries').mockResolvedValue({
      evictedCount: 5,
      freedSize: 10 * 1024 * 1024
    });

    await indexedDBCache.enforceStorageLimits(10 * 1024 * 1024);

    expect(mockEvict).toHaveBeenCalled();

    mockEvict.mockRestore();
  });

  test('should cleanup expired entries', async () => {
    indexedDBCache.db = {
      transaction: jest.fn().mockReturnValue({
        objectStore: jest.fn().mockReturnValue({
          index: jest.fn().mockReturnValue({
            openCursor: jest.fn().mockReturnValue({
              onsuccess: null,
            }),
          }),
        }),
      }),
    };
    indexedDBCache.isInitialized = true;

    const cleanupPromise = indexedDBCache.cleanup();

    // Simulate cursor with expired entries
    const cursorRequest = indexedDBCache.db.transaction().objectStore().index().openCursor();
    const mockCursor = {
      value: { key: 'expired-key', size: 1000, expiry: Date.now() - 1000 },
      delete: jest.fn(),
      continue: jest.fn(),
    };

    cursorRequest.onsuccess({ target: { result: mockCursor } });
    mockCursor.continue();
    cursorRequest.onsuccess({ target: { result: null } }); // End cursor

    await expect(cleanupPromise).resolves.toEqual(
      expect.objectContaining({
        deletedCount: expect.any(Number),
        reclaimedSize: expect.any(Number),
      })
    );
  });
});

describe('Cache Hooks', () => {
  describe('useCache', () => {
    test('should provide cache operations', async () => {
      const { result } = renderHook(() => useCache('test-key'));

      await act(async () => {
        await result.current.set('test-data');
      });

      expect(result.current.data).toBe('test-data');

      await act(async () => {
        const retrieved = await result.current.get();
      });

      expect(result.current.data).toBe('test-data');
    });

    test('should handle cache errors', async () => {
      const onError = jest.fn();
      const { result } = renderHook(() => useCache('error-key', { onError }));

      // Mock cache error
      jest.spyOn(cacheManager, 'get').mockRejectedValue(new Error('Cache error'));

      await act(async () => {
        try {
          await result.current.get();
        } catch (error) {
          // Expected to throw
        }
      });

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(result.current.error).toBeInstanceOf(Error);
    });

    test('should track loading state', async () => {
      const { result } = renderHook(() => useCache('loading-key'));

      expect(result.current.isLoading).toBe(false);

      act(() => {
        result.current.get();
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe('useCachedAPI', () => {
    test('should fetch and cache API data', async () => {
      const mockFetcher = jest.fn().mockResolvedValue({ id: 1, name: 'API Data' });

      const { result } = renderHook(() =>
        useCachedAPI('/api/test', mockFetcher)
      );

      await waitFor(() => {
        expect(result.current.data).toEqual({ id: 1, name: 'API Data' });
      });

      expect(mockFetcher).toHaveBeenCalledWith('/api/test');
    });

    test('should handle API errors with retry logic', async () => {
      let callCount = 0;
      const mockFetcher = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('API Error'));
        }
        return Promise.resolve('Success');
      });

      const { result } = renderHook(() =>
        useCachedAPI('/api/retry', mockFetcher, { retryOnError: true, maxRetries: 3 })
      );

      await waitFor(() => {
        expect(result.current.data).toBe('Success');
      }, { timeout: 5000 });

      expect(mockFetcher).toHaveBeenCalledTimes(3);
    });

    test('should support revalidation', async () => {
      const mockFetcher = jest.fn()
        .mockResolvedValueOnce('First Data')
        .mockResolvedValueOnce('Updated Data');

      const { result } = renderHook(() =>
        useCachedAPI('/api/revalidate', mockFetcher)
      );

      await waitFor(() => {
        expect(result.current.data).toBe('First Data');
      });

      await act(async () => {
        await result.current.revalidate();
      });

      expect(result.current.data).toBe('Updated Data');
      expect(mockFetcher).toHaveBeenCalledTimes(2);
    });
  });

  describe('usePaginatedCache', () => {
    test('should handle paginated data caching', async () => {
      const mockFetcher = jest.fn((page) =>
        Promise.resolve([`item${page * 2 - 1}`, `item${page * 2}`])
      );

      const { result } = renderHook(() =>
        usePaginatedCache('paginated-test', { pageSize: 2 })
      );

      await act(async () => {
        await result.current.loadPage(1, mockFetcher);
      });

      expect(result.current.getPage(1)).toEqual(['item1', 'item2']);
      expect(mockFetcher).toHaveBeenCalledWith(1, 2);
    });

    test('should preload next page when enabled', async () => {
      const mockFetcher = jest.fn((page) =>
        Promise.resolve(new Array(5).fill(null).map((_, i) => `item${page * 5 + i}`))
      );

      const { result } = renderHook(() =>
        usePaginatedCache('preload-test', { pageSize: 5, preloadNext: true })
      );

      await act(async () => {
        await result.current.loadPage(1, mockFetcher);
      });

      // Should also preload page 2
      await waitFor(() => {
        expect(mockFetcher).toHaveBeenCalledWith(2, 5);
      });
    });
  });

  describe('useRealtimeCache', () => {
    test('should connect to WebSocket and update cache', async () => {
      const mockWebSocket = {
        send: jest.fn(),
        close: jest.fn(),
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
      };

      global.WebSocket.mockImplementation(() => mockWebSocket);

      const { result } = renderHook(() =>
        useRealtimeCache('realtime-key', 'ws://localhost:8080')
      );

      // Simulate connection
      act(() => {
        mockWebSocket.onopen();
      });

      expect(result.current.isConnected).toBe(true);

      // Simulate message
      act(() => {
        mockWebSocket.onmessage({
          data: JSON.stringify({
            key: 'realtime-key',
            data: 'realtime-data'
          })
        });
      });

      await waitFor(() => {
        expect(result.current.data).toBe('realtime-data');
      });
    });
  });

  describe('useCacheStats', () => {
    test('should provide cache statistics', async () => {
      const { result } = renderHook(() => useCacheStats());

      await waitFor(() => {
        expect(result.current.stats).toMatchObject({
          hitRate: expect.any(Number),
          missRate: expect.any(Number),
        });
      });
    });
  });

  describe('useCacheWarming', () => {
    test('should warm cache with progress tracking', async () => {
      const { result } = renderHook(() => useCacheWarming());

      const warmupData = [
        { key: 'warm1', fetcher: () => Promise.resolve('data1') },
        { key: 'warm2', fetcher: () => Promise.resolve('data2') },
      ];

      await act(async () => {
        await result.current.warmCache(warmupData);
      });

      expect(result.current.isWarming).toBe(false);
      expect(result.current.warmingProgress).toBe(0);
    });
  });

  describe('useCacheInvalidation', () => {
    test('should provide cache invalidation methods', async () => {
      const { result } = renderHook(() => useCacheInvalidation());

      await act(async () => {
        await result.current.invalidate('test-pattern');
      });

      await act(async () => {
        await result.current.invalidateByTags(['user', 'profile']);
      });

      await act(async () => {
        await result.current.clearCache();
      });

      expect(result.current.isInvalidating).toBe(false);
    });
  });
});