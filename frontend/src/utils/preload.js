/**
 * Preloading Utilities for Enhanced Code Splitting
 * US-012: Code Splitting & Lazy Loading - Preloading on hover
 */

class PreloadManager {
  constructor() {
    this.preloadedModules = new Set();
    this.preloadPromises = new Map();
    this.hoverTimeout = null;
    this.isPreloadingEnabled = true;

    // Performance metrics
    this.metrics = {
      preloadedCount: 0,
      preloadTime: {},
      cacheHits: 0,
      cacheMisses: 0,
    };

    this.init();
  }

  init() {
    // Check if preloading should be disabled on slow connections
    if ('connection' in navigator) {
      const connection = navigator.connection;
      if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
        this.isPreloadingEnabled = false;
        console.log('🔧 Preloading disabled due to slow connection');
      }
    }

    // Monitor memory usage
    this.monitorMemoryUsage();
  }

  /**
   * Preload a module with performance tracking
   * @param {Function} importFn - Dynamic import function
   * @param {string} moduleName - Module identifier for caching
   * @returns {Promise} - Preload promise
   */
  async preloadModule(importFn, moduleName) {
    if (!this.isPreloadingEnabled) {
      return Promise.resolve();
    }

    // Check if already preloaded
    if (this.preloadedModules.has(moduleName)) {
      this.metrics.cacheHits++;
      return this.preloadPromises.get(moduleName);
    }

    this.metrics.cacheMisses++;
    const startTime = performance.now();

    try {
      console.log(`🚀 Preloading module: ${moduleName}`);

      const preloadPromise = importFn();
      this.preloadPromises.set(moduleName, preloadPromise);

      await preloadPromise;

      this.preloadedModules.add(moduleName);
      this.metrics.preloadedCount++;

      const loadTime = performance.now() - startTime;
      this.metrics.preloadTime[moduleName] = loadTime;

      console.log(`✅ Preloaded ${moduleName} in ${loadTime.toFixed(2)}ms`);

      return preloadPromise;
    } catch (error) {
      console.error(`❌ Failed to preload ${moduleName}:`, error);
      this.preloadPromises.delete(moduleName);
      throw error;
    }
  }

  /**
   * Create a preload-enabled link handler
   * @param {Function} importFn - Dynamic import function
   * @param {string} moduleName - Module identifier
   * @param {number} delay - Hover delay in milliseconds
   * @returns {Object} - Event handlers
   */
  createPreloadHandlers(importFn, moduleName, delay = 300) {
    return {
      onMouseEnter: () => {
        if (this.hoverTimeout) {
          clearTimeout(this.hoverTimeout);
        }

        this.hoverTimeout = setTimeout(() => {
          this.preloadModule(importFn, moduleName).catch(() => {
            // Silent fail for preloading
          });
        }, delay);
      },

      onMouseLeave: () => {
        if (this.hoverTimeout) {
          clearTimeout(this.hoverTimeout);
          this.hoverTimeout = null;
        }
      },

      onFocus: () => {
        // Immediate preload on focus for accessibility
        this.preloadModule(importFn, moduleName).catch(() => {
          // Silent fail for preloading
        });
      }
    };
  }

  /**
   * Preload multiple modules in parallel
   * @param {Array} modules - Array of {importFn, moduleName} objects
   * @returns {Promise} - Promise that resolves when all modules are preloaded
   */
  async preloadModules(modules) {
    if (!this.isPreloadingEnabled) {
      return Promise.resolve();
    }

    const preloadPromises = modules.map(({ importFn, moduleName }) =>
      this.preloadModule(importFn, moduleName)
    );

    try {
      await Promise.allSettled(preloadPromises);
      console.log(`✅ Batch preloaded ${modules.length} modules`);
    } catch (error) {
      console.error('❌ Batch preload failed:', error);
    }
  }

  /**
   * Preload critical route modules
   */
  async preloadCriticalRoutes() {
    const criticalRoutes = [
      {
        importFn: () => import('../pages/HomePage'),
        moduleName: 'HomePage'
      },
      {
        importFn: () => import('../pages/UploadPage'),
        moduleName: 'UploadPage'
      },
      {
        importFn: () => import('../components/navigation/SideNavigation'),
        moduleName: 'SideNavigation'
      }
    ];

    await this.preloadModules(criticalRoutes);
  }

  /**
   * Intelligent preloading based on user behavior
   * @param {string} currentRoute - Current route path
   */
  intelligentPreload(currentRoute) {
    if (!this.isPreloadingEnabled) return;

    // Define likely next routes based on current route
    const routeMap = {
      '/': ['UploadPage', 'AnnotationPage'],
      '/upload': ['AnnotationPage', 'TrainingDashboard'],
      '/annotate': ['TrainingDashboard', 'HomePage'],
      '/training': ['AnnotationPage', 'HomePage'],
    };

    const nextRoutes = routeMap[currentRoute];
    if (!nextRoutes) return;

    // Preload likely next routes
    nextRoutes.forEach(routeName => {
      setTimeout(() => {
        const importFn = this.getImportFunction(routeName);
        if (importFn) {
          this.preloadModule(importFn, routeName).catch(() => {
            // Silent fail
          });
        }
      }, 1000); // Delay to avoid blocking current route
    });
  }

  /**
   * Get import function for route name
   * @param {string} routeName - Route component name
   * @returns {Function|null} - Import function
   */
  getImportFunction(routeName) {
    const routeImports = {
      'HomePage': () => import('../pages/HomePage'),
      'UploadPage': () => import('../pages/UploadPage'),
      'AnnotationPage': () => import('../pages/AnnotationPage'),
      'TrainingDashboard': () => import('../pages/training/TrainingDashboard'),
    };

    return routeImports[routeName] || null;
  }

  /**
   * Monitor memory usage and adjust preloading behavior
   */
  monitorMemoryUsage() {
    if ('memory' in performance) {
      setInterval(() => {
        const memory = performance.memory;
        const memoryUsage = memory.usedJSHeapSize / memory.totalJSHeapSize;

        // Disable preloading if memory usage is too high
        if (memoryUsage > 0.85) {
          this.isPreloadingEnabled = false;
          console.log('🔧 Preloading disabled due to high memory usage');
        } else if (memoryUsage < 0.7 && !this.isPreloadingEnabled) {
          this.isPreloadingEnabled = true;
          console.log('🔧 Preloading re-enabled');
        }
      }, 10000); // Check every 10 seconds
    }
  }

  /**
   * Get preloading performance metrics
   * @returns {Object} - Performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      isEnabled: this.isPreloadingEnabled,
      totalModulesPreloaded: this.preloadedModules.size,
      averagePreloadTime: this.calculateAveragePreloadTime(),
      cacheHitRate: this.calculateCacheHitRate(),
    };
  }

  /**
   * Calculate average preload time
   * @returns {number} - Average preload time in milliseconds
   */
  calculateAveragePreloadTime() {
    const times = Object.values(this.metrics.preloadTime);
    if (times.length === 0) return 0;

    const sum = times.reduce((acc, time) => acc + time, 0);
    return sum / times.length;
  }

  /**
   * Calculate cache hit rate
   * @returns {number} - Cache hit rate as percentage
   */
  calculateCacheHitRate() {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    if (total === 0) return 0;

    return (this.metrics.cacheHits / total) * 100;
  }

  /**
   * Clear preload cache
   */
  clearCache() {
    this.preloadedModules.clear();
    this.preloadPromises.clear();
    this.metrics = {
      preloadedCount: 0,
      preloadTime: {},
      cacheHits: 0,
      cacheMisses: 0,
    };
    console.log('🧹 Preload cache cleared');
  }

  /**
   * Prefetch resources for a specific route
   * @param {string} routePath - Route path
   */
  async prefetchRoute(routePath) {
    // Prefetch CSS and other assets for the route
    const assets = this.getRouteAssets(routePath);

    const prefetchPromises = assets.map(asset => this.prefetchAsset(asset));
    await Promise.allSettled(prefetchPromises);
  }

  /**
   * Get assets for a specific route
   * @param {string} routePath - Route path
   * @returns {Array} - Array of asset URLs
   */
  getRouteAssets(routePath) {
    // This would be populated based on your route-specific assets
    const routeAssets = {
      '/upload': [
        '/static/css/upload.css',
        '/static/js/upload-utils.js'
      ],
      '/annotate': [
        '/static/css/annotation.css',
        '/static/js/canvas-utils.js'
      ],
      '/training': [
        '/static/css/training.css',
        '/static/js/training-utils.js'
      ]
    };

    return routeAssets[routePath] || [];
  }

  /**
   * Prefetch a single asset
   * @param {string} assetUrl - Asset URL
   * @returns {Promise} - Prefetch promise
   */
  prefetchAsset(assetUrl) {
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = assetUrl;

      link.onload = () => {
        console.log(`✅ Prefetched asset: ${assetUrl}`);
        resolve();
      };

      link.onerror = () => {
        console.warn(`⚠️ Failed to prefetch asset: ${assetUrl}`);
        reject();
      };

      document.head.appendChild(link);
    });
  }
}

// Create and export singleton instance
const preloadManager = new PreloadManager();

export default preloadManager;

// Export utility functions
export const {
  preloadModule,
  createPreloadHandlers,
  preloadModules,
  preloadCriticalRoutes,
  intelligentPreload,
  getMetrics,
  clearCache,
  prefetchRoute
} = preloadManager;

// Initialize critical route preloading
if (typeof window !== 'undefined') {
  // Preload critical routes after initial load
  setTimeout(() => {
    preloadManager.preloadCriticalRoutes().catch(console.error);
  }, 2000);
}