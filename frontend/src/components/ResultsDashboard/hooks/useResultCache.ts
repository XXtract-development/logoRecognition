import { useState, useEffect, useCallback } from 'react';
import { Detection } from '../ResultsDashboard';

interface CachedResult {
  detectionId: string;
  uploadId: string;
  detections: Detection[];
  imageMetadata: any;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

const CACHE_KEY_PREFIX = 'logo-detection-results-';
const DEFAULT_TTL = 30 * 60 * 1000; // 30 minutes

export const useResultCache = (detectionId: string, uploadId: string) => {
  const cacheKey = `${CACHE_KEY_PREFIX}${detectionId}`;

  // Get cached results
  const getCachedResults = useCallback((): CachedResult | null => {
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (!cached) return null;

      const data: CachedResult = JSON.parse(cached);

      // Check if cache is still valid
      const now = Date.now();
      if (now - data.timestamp > data.ttl) {
        // Cache expired
        sessionStorage.removeItem(cacheKey);
        return null;
      }

      // Verify it's the same upload
      if (data.uploadId !== uploadId) {
        return null;
      }

      return data;
    } catch (error) {
      // Handle parse errors
      if (process.env.NODE_ENV === 'development') {
        // console.error('Cache read error:', error);
      }
      return null;
    }
  }, [cacheKey, uploadId]);

  // Save results to cache
  const cacheResults = useCallback((
    detections: Detection[],
    imageMetadata: any,
    ttl: number = DEFAULT_TTL
  ) => {
    try {
      const cacheData: CachedResult = {
        detectionId,
        uploadId,
        detections,
        imageMetadata,
        timestamp: Date.now(),
        ttl
      };

      sessionStorage.setItem(cacheKey, JSON.stringify(cacheData));

      // Also save to localStorage for longer persistence (optional)
      if (window.localStorage) {
        const persistKey = `${cacheKey}-persist`;
        localStorage.setItem(persistKey, JSON.stringify({
          ...cacheData,
          ttl: ttl * 2 // Longer TTL for localStorage
        }));

        // Clean up old entries
        cleanupOldCache();
      }
    } catch (error) {
      // Handle quota exceeded errors
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        // Clear oldest entries and retry
        clearOldestCache();
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({
            detectionId,
            uploadId,
            detections: detections.slice(0, 100), // Limit to first 100 if storage is full
            imageMetadata,
            timestamp: Date.now(),
            ttl
          }));
        } catch {
          // Give up if still fails
          if (process.env.NODE_ENV === 'development') {
            // console.warn('Unable to cache results');
          }
        }
      }
    }
  }, [detectionId, uploadId, cacheKey]);

  // Clear cache for this detection
  const clearCache = useCallback(() => {
    sessionStorage.removeItem(cacheKey);
    if (window.localStorage) {
      localStorage.removeItem(`${cacheKey}-persist`);
    }
  }, [cacheKey]);

  // Clear all detection caches
  const clearAllCache = useCallback(() => {
    // Clear sessionStorage
    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    });

    // Clear localStorage
    if (window.localStorage) {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith(CACHE_KEY_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    }
  }, []);

  // Clean up old cached entries
  const cleanupOldCache = () => {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    // Clean sessionStorage
    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        try {
          const data = JSON.parse(sessionStorage.getItem(key) || '{}') as CachedResult;
          if (now - data.timestamp > maxAge) {
            sessionStorage.removeItem(key);
          }
        } catch {
          sessionStorage.removeItem(key);
        }
      }
    });

    // Clean localStorage
    if (window.localStorage) {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith(CACHE_KEY_PREFIX)) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}') as CachedResult;
            if (now - data.timestamp > maxAge) {
              localStorage.removeItem(key);
            }
          } catch {
            localStorage.removeItem(key);
          }
        }
      });
    }
  };

  // Clear oldest cache entries if storage is full
  const clearOldestCache = () => {
    const entries: Array<{ key: string; timestamp: number }> = [];

    // Collect all cache entries
    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        try {
          const data = JSON.parse(sessionStorage.getItem(key) || '{}') as CachedResult;
          entries.push({ key, timestamp: data.timestamp || 0 });
        } catch {
          // Remove corrupted entries
          sessionStorage.removeItem(key);
        }
      }
    });

    // Sort by timestamp (oldest first)
    entries.sort((a, b) => a.timestamp - b.timestamp);

    // Remove oldest 25%
    const toRemove = Math.ceil(entries.length * 0.25);
    entries.slice(0, toRemove).forEach(entry => {
      sessionStorage.removeItem(entry.key);
    });
  };

  // Try to restore from localStorage if sessionStorage is empty
  const restoreFromPersistentCache = useCallback((): CachedResult | null => {
    if (!window.localStorage) return null;

    try {
      const persistKey = `${cacheKey}-persist`;
      const cached = localStorage.getItem(persistKey);
      if (!cached) return null;

      const data: CachedResult = JSON.parse(cached);

      // Check if cache is still valid
      const now = Date.now();
      if (now - data.timestamp > data.ttl) {
        localStorage.removeItem(persistKey);
        return null;
      }

      // Restore to sessionStorage
      sessionStorage.setItem(cacheKey, cached);

      return data;
    } catch {
      return null;
    }
  }, [cacheKey]);

  return {
    getCachedResults,
    cacheResults,
    clearCache,
    clearAllCache,
    restoreFromPersistentCache
  };
};