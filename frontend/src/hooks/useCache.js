/**
 * React Hook for Cache Management
 * US-016: API Caching Strategy - Cache hook
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import cacheManager from '../services/cache/CacheManager.js';

/**
 * Main cache hook for React components
 */
export const useCache = (key, options = {}) => {
  const {
    strategy = 'default',
    ttl,
    tags = [],
    priority = 'normal',
    onError,
    onSuccess,
    enabled = true,
  } = options;

  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isStale, setIsStale] = useState(false);

  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const get = useCallback(async () => {
    if (!enabled || !key) return null;

    setIsLoading(true);
    setError(null);

    try {
      const cachedData = await cacheManager.get(key, { strategy });

      if (mountedRef.current) {
        setData(cachedData);
        setIsStale(false);

        if (onSuccess) {
          onSuccess(cachedData);
        }
      }

      return cachedData;
    } catch (err) {
      if (mountedRef.current) {
        setError(err);
        if (onError) {
          onError(err);
        }
      }
      throw err;
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [key, strategy, enabled, onSuccess, onError]);

  const set = useCallback(async (value) => {
    if (!enabled || !key) return false;

    try {
      const result = await cacheManager.set(key, value, {
        strategy,
        ttl,
        tags,
        priority,
      });

      if (mountedRef.current) {
        setData(value);
        setIsStale(false);
        setError(null);
      }

      return result;
    } catch (err) {
      if (mountedRef.current) {
        setError(err);
        if (onError) {
          onError(err);
        }
      }
      throw err;
    }
  }, [key, strategy, ttl, tags, priority, enabled, onError]);

  const remove = useCallback(async () => {
    if (!enabled || !key) return;

    try {
      await cacheManager.delete(key);

      if (mountedRef.current) {
        setData(null);
        setError(null);
        setIsStale(false);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err);
        if (onError) {
          onError(err);
        }
      }
      throw err;
    }
  }, [key, enabled, onError]);

  const refresh = useCallback(async () => {
    await remove();
    return await get();
  }, [remove, get]);

  return {
    data,
    isLoading,
    error,
    isStale,
    get,
    set,
    remove,
    refresh,
  };
};

/**
 * Hook for API calls with caching
 */
export const useCachedAPI = (url, fetcher, options = {}) => {
  const {
    strategy = 'api',
    staleWhileRevalidate = true,
    refreshInterval,
    retryOnError = true,
    maxRetries = 3,
    ...cacheOptions
  } = options;

  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  const mountedRef = useRef(true);
  const intervalRef = useRef(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const executeRequest = useCallback(async (allowStale = false) => {
    if (!url) return null;

    try {
      const result = await cacheManager.getOrSet(
        url,
        async () => {
          setIsValidating(true);
          try {
            const response = await fetcher(url);
            if (mountedRef.current) {
              setRetryCount(0);
            }
            return response;
          } finally {
            if (mountedRef.current) {
              setIsValidating(false);
            }
          }
        },
        {
          strategy,
          allowStale,
          ...cacheOptions,
        }
      );

      if (mountedRef.current) {
        setData(result);
        setError(null);
      }

      return result;
    } catch (err) {
      if (mountedRef.current) {
        setError(err);

        // Retry logic
        if (retryOnError && retryCount < maxRetries) {
          setRetryCount(prev => prev + 1);
          setTimeout(() => {
            executeRequest(allowStale);
          }, Math.pow(2, retryCount) * 1000); // Exponential backoff
        }
      }
      throw err;
    }
  }, [url, fetcher, strategy, cacheOptions, retryOnError, retryCount, maxRetries]);

  const load = useCallback(async () => {
    if (!url) return null;

    setIsLoading(true);
    setError(null);

    try {
      const result = await executeRequest(staleWhileRevalidate);
      return result;
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [executeRequest, staleWhileRevalidate, url]);

  const revalidate = useCallback(async () => {
    if (!url) return null;

    // Force refresh by removing from cache first
    await cacheManager.delete(url);
    return await load();
  }, [url, load]);

  const mutate = useCallback(async (newData) => {
    if (!url) return;

    await cacheManager.set(url, newData, {
      strategy,
      ...cacheOptions,
    });

    if (mountedRef.current) {
      setData(newData);
    }
  }, [url, strategy, cacheOptions]);

  // Setup refresh interval
  useEffect(() => {
    if (refreshInterval && refreshInterval > 0) {
      intervalRef.current = setInterval(() => {
        executeRequest(true).catch(console.error);
      }, refreshInterval);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [refreshInterval, executeRequest]);

  // Initial load
  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  return {
    data,
    isLoading,
    isValidating,
    error,
    retryCount,
    load,
    revalidate,
    mutate,
  };
};

/**
 * Hook for managing cache with pagination
 */
export const usePaginatedCache = (baseKey, options = {}) => {
  const {
    pageSize = 10,
    strategy = 'api',
    preloadNext = true,
    ...cacheOptions
  } = options;

  const [pages, setPages] = useState(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const getPageKey = useCallback((page) => `${baseKey}_page_${page}`, [baseKey]);

  const loadPage = useCallback(async (page, fetcher) => {
    if (!baseKey || !fetcher) return null;

    const pageKey = getPageKey(page);
    setIsLoading(true);
    setError(null);

    try {
      const pageData = await cacheManager.getOrSet(
        pageKey,
        () => fetcher(page, pageSize),
        {
          strategy,
          ...cacheOptions,
        }
      );

      setPages(prev => new Map(prev).set(page, pageData));

      // Preload next page if enabled
      if (preloadNext && pageData && pageData.length === pageSize) {
        const nextPageKey = getPageKey(page + 1);
        cacheManager.getOrSet(
          nextPageKey,
          () => fetcher(page + 1, pageSize),
          {
            strategy,
            ...cacheOptions,
          }
        ).catch(console.error); // Silent preload
      }

      return pageData;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [baseKey, pageSize, strategy, cacheOptions, preloadNext, getPageKey]);

  const getPage = useCallback((page) => {
    return pages.get(page) || null;
  }, [pages]);

  const invalidatePage = useCallback(async (page) => {
    const pageKey = getPageKey(page);
    await cacheManager.delete(pageKey);
    setPages(prev => {
      const newPages = new Map(prev);
      newPages.delete(page);
      return newPages;
    });
  }, [getPageKey]);

  const invalidateAll = useCallback(async () => {
    const pattern = `${baseKey}_page_.*`;
    await cacheManager.invalidate(pattern, { pattern: true });
    setPages(new Map());
  }, [baseKey]);

  return {
    pages: Object.fromEntries(pages),
    isLoading,
    error,
    loadPage,
    getPage,
    invalidatePage,
    invalidateAll,
  };
};

/**
 * Hook for caching with real-time updates
 */
export const useRealtimeCache = (key, websocketUrl, options = {}) => {
  const {
    strategy = 'session',
    autoConnect = true,
    reconnectInterval = 5000,
    ...cacheOptions
  } = options;

  const [data, setData] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  const connect = useCallback(() => {
    if (!websocketUrl || !key) return;

    try {
      const ws = new WebSocket(websocketUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (mountedRef.current) {
          setIsConnected(true);
          setError(null);
        }

        // Subscribe to updates for this key
        ws.send(JSON.stringify({
          type: 'subscribe',
          key,
        }));
      };

      ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.key === key && message.data) {
            // Update cache
            await cacheManager.set(key, message.data, {
              strategy,
              ...cacheOptions,
            });

            if (mountedRef.current) {
              setData(message.data);
            }
          }
        } catch (err) {
          console.error('Error processing WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        if (mountedRef.current) {
          setIsConnected(false);

          // Auto-reconnect
          if (autoConnect) {
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, reconnectInterval);
          }
        }
      };

      ws.onerror = (err) => {
        if (mountedRef.current) {
          setError(err);
        }
      };
    } catch (err) {
      if (mountedRef.current) {
        setError(err);
      }
    }
  }, [websocketUrl, key, strategy, cacheOptions, autoConnect, reconnectInterval]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setIsConnected(false);
  }, []);

  // Load initial data from cache
  useEffect(() => {
    if (key) {
      cacheManager.get(key, { strategy }).then(cachedData => {
        if (mountedRef.current && cachedData) {
          setData(cachedData);
        }
      }).catch(console.error);
    }
  }, [key, strategy]);

  // Auto-connect
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    data,
    isConnected,
    error,
    connect,
    disconnect,
  };
};

/**
 * Hook for cache statistics and monitoring
 */
export const useCacheStats = () => {
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const cacheStats = cacheManager.getStats();
      setStats(cacheStats);
    } catch (error) {
      console.error('Failed to get cache stats:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    // Auto-refresh every 30 seconds
    const interval = setInterval(refresh, 30000);

    return () => clearInterval(interval);
  }, [refresh]);

  return {
    stats,
    isLoading,
    refresh,
  };
};

/**
 * Hook for cache warming
 */
export const useCacheWarming = () => {
  const [isWarming, setIsWarming] = useState(false);
  const [warmingProgress, setWarmingProgress] = useState(0);

  const warmCache = useCallback(async (warmupData) => {
    setIsWarming(true);
    setWarmingProgress(0);

    try {
      const results = await cacheManager.warmCache(warmupData.map((item, index) => ({
        ...item,
        onProgress: () => {
          setWarmingProgress((index + 1) / warmupData.length * 100);
        },
      })));

      return results;
    } finally {
      setIsWarming(false);
      setWarmingProgress(0);
    }
  }, []);

  return {
    isWarming,
    warmingProgress,
    warmCache,
  };
};

/**
 * Hook for cache invalidation
 */
export const useCacheInvalidation = () => {
  const [isInvalidating, setIsInvalidating] = useState(false);

  const invalidate = useCallback(async (keyOrPattern, options = {}) => {
    setIsInvalidating(true);
    try {
      await cacheManager.invalidate(keyOrPattern, options);
    } finally {
      setIsInvalidating(false);
    }
  }, []);

  const invalidateByTags = useCallback(async (tags) => {
    setIsInvalidating(true);
    try {
      await cacheManager.invalidate(null, { tags });
    } finally {
      setIsInvalidating(false);
    }
  }, []);

  const clearCache = useCallback(async (layerName = null) => {
    setIsInvalidating(true);
    try {
      await cacheManager.clear(layerName);
    } finally {
      setIsInvalidating(false);
    }
  }, []);

  return {
    isInvalidating,
    invalidate,
    invalidateByTags,
    clearCache,
  };
};

export default {
  useCache,
  useCachedAPI,
  usePaginatedCache,
  useRealtimeCache,
  useCacheStats,
  useCacheWarming,
  useCacheInvalidation,
};