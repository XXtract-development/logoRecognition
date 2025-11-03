/**
 * Performance Monitoring and Optimization Utilities
 * US-012: Code Splitting & Lazy Loading - Performance monitoring
 * US-023: Frontend Polish & Responsiveness - Performance metrics
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      navigation: {},
      resourceLoading: [],
      codesplitting: {},
      userInteractions: [],
      memoryUsage: [],
      networkQuality: {},
      vitals: {},
    };

    this.observers = new Map();
    this.thresholds = {
      fcp: 1800, // First Contentful Paint
      lcp: 2500, // Largest Contentful Paint
      fid: 100,  // First Input Delay
      cls: 0.1,  // Cumulative Layout Shift
      ttfb: 800, // Time to First Byte
    };

    this.init();
  }

  init() {
    this.setupPerformanceObservers();
    this.monitorNetworkQuality();
    this.trackResourceLoading();
    this.monitorMemoryUsage();
    this.setupWebVitals();

    // Start periodic monitoring
    this.startPeriodicMonitoring();
  }

  /**
   * Setup Performance Observers for various metrics
   */
  setupPerformanceObservers() {
    // Navigation timing observer
    if ('PerformanceObserver' in window) {
      // Long Tasks Observer
      try {
        const longTaskObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (entry.duration > 50) {
              this.recordLongTask(entry);
            }
          });
        });
        longTaskObserver.observe({ entryTypes: ['longtask'] });
        this.observers.set('longtask', longTaskObserver);
      } catch (e) {
        console.warn('Long Tasks API not supported');
      }

      // Measure Observer
      try {
        const measureObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            this.recordMeasurement(entry);
          });
        });
        measureObserver.observe({ entryTypes: ['measure'] });
        this.observers.set('measure', measureObserver);
      } catch (e) {
        console.warn('User Timing API not supported');
      }

      // Resource Observer
      try {
        const resourceObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            this.recordResourceTiming(entry);
          });
        });
        resourceObserver.observe({ entryTypes: ['resource'] });
        this.observers.set('resource', resourceObserver);
      } catch (e) {
        console.warn('Resource Timing API not supported');
      }
    }
  }

  /**
   * Setup Web Vitals monitoring
   */
  setupWebVitals() {
    // First Contentful Paint
    this.observeFirstContentfulPaint();

    // Largest Contentful Paint
    this.observeLargestContentfulPaint();

    // First Input Delay
    this.observeFirstInputDelay();

    // Cumulative Layout Shift
    this.observeCumulativeLayoutShift();
  }

  /**
   * Observe First Contentful Paint
   */
  observeFirstContentfulPaint() {
    if ('PerformanceObserver' in window) {
      try {
        const fcpObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (entry.name === 'first-contentful-paint') {
              this.metrics.vitals.fcp = entry.startTime;
              this.evaluateMetric('fcp', entry.startTime);
            }
          });
        });
        fcpObserver.observe({ entryTypes: ['paint'] });
        this.observers.set('fcp', fcpObserver);
      } catch (e) {
        console.warn('Paint Timing API not supported');
      }
    }
  }

  /**
   * Observe Largest Contentful Paint
   */
  observeLargestContentfulPaint() {
    if ('PerformanceObserver' in window) {
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          this.metrics.vitals.lcp = lastEntry.startTime;
          this.evaluateMetric('lcp', lastEntry.startTime);
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        this.observers.set('lcp', lcpObserver);
      } catch (e) {
        console.warn('Largest Contentful Paint API not supported');
      }
    }
  }

  /**
   * Observe First Input Delay
   */
  observeFirstInputDelay() {
    if ('PerformanceObserver' in window) {
      try {
        const fidObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            this.metrics.vitals.fid = entry.processingStart - entry.startTime;
            this.evaluateMetric('fid', this.metrics.vitals.fid);
          });
        });
        fidObserver.observe({ entryTypes: ['first-input'] });
        this.observers.set('fid', fidObserver);
      } catch (e) {
        console.warn('First Input Delay API not supported');
      }
    }
  }

  /**
   * Observe Cumulative Layout Shift
   */
  observeCumulativeLayoutShift() {
    if ('PerformanceObserver' in window) {
      let clsValue = 0;

      try {
        const clsObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
              this.metrics.vitals.cls = clsValue;
              this.evaluateMetric('cls', clsValue);
            }
          });
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });
        this.observers.set('cls', clsObserver);
      } catch (e) {
        console.warn('Layout Instability API not supported');
      }
    }
  }

  /**
   * Monitor network quality
   */
  monitorNetworkQuality() {
    if ('connection' in navigator) {
      const connection = navigator.connection;

      this.metrics.networkQuality = {
        effectiveType: connection.effectiveType,
        downlink: connection.downlink,
        rtt: connection.rtt,
        saveData: connection.saveData,
      };

      // Listen for changes
      connection.addEventListener('change', () => {
        this.metrics.networkQuality = {
          effectiveType: connection.effectiveType,
          downlink: connection.downlink,
          rtt: connection.rtt,
          saveData: connection.saveData,
          timestamp: Date.now(),
        };

        this.adaptToNetworkConditions();
      });
    }
  }

  /**
   * Monitor memory usage
   */
  monitorMemoryUsage() {
    if ('memory' in performance) {
      const recordMemory = () => {
        const memory = performance.memory;
        this.metrics.memoryUsage.push({
          timestamp: Date.now(),
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit,
          usage: (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100,
        });

        // Keep only last 50 measurements
        if (this.metrics.memoryUsage.length > 50) {
          this.metrics.memoryUsage.shift();
        }
      };

      // Record every 30 seconds
      setInterval(recordMemory, 30000);
      recordMemory(); // Initial reading
    }
  }

  /**
   * Track resource loading performance
   */
  trackResourceLoading() {
    window.addEventListener('load', () => {
      const resources = performance.getEntriesByType('resource');
      this.analyzeResourceLoading(resources);
    });
  }

  /**
   * Analyze resource loading patterns
   */
  analyzeResourceLoading(resources) {
    const analysis = {
      totalResources: resources.length,
      totalSize: 0,
      totalTime: 0,
      byType: {},
      slowResources: [],
      cacheHits: 0,
      cacheMisses: 0,
    };

    resources.forEach((resource) => {
      const type = this.getResourceType(resource.name);
      const size = resource.transferSize || 0;
      const time = resource.responseEnd - resource.startTime;

      // Track by type
      if (!analysis.byType[type]) {
        analysis.byType[type] = { count: 0, size: 0, time: 0 };
      }
      analysis.byType[type].count++;
      analysis.byType[type].size += size;
      analysis.byType[type].time += time;

      // Track totals
      analysis.totalSize += size;
      analysis.totalTime += time;

      // Track slow resources (> 1s)
      if (time > 1000) {
        analysis.slowResources.push({
          name: resource.name,
          time,
          size,
          type,
        });
      }

      // Cache analysis
      if (resource.transferSize === 0 && resource.decodedBodySize > 0) {
        analysis.cacheHits++;
      } else {
        analysis.cacheMisses++;
      }
    });

    this.metrics.resourceLoading.push({
      timestamp: Date.now(),
      ...analysis,
    });

    this.generateResourceOptimizationSuggestions(analysis);
  }

  /**
   * Get resource type from URL
   */
  getResourceType(url) {
    if (url.includes('.js')) return 'script';
    if (url.includes('.css')) return 'stylesheet';
    if (url.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) return 'image';
    if (url.includes('/api/')) return 'api';
    return 'other';
  }

  /**
   * Record long task
   */
  recordLongTask(entry) {
    console.warn(`🐌 Long task detected: ${entry.duration.toFixed(2)}ms`, {
      name: entry.name,
      startTime: entry.startTime,
      duration: entry.duration,
    });

    // Track in metrics
    if (!this.metrics.longTasks) {
      this.metrics.longTasks = [];
    }

    this.metrics.longTasks.push({
      timestamp: Date.now(),
      duration: entry.duration,
      startTime: entry.startTime,
      name: entry.name,
    });
  }

  /**
   * Record performance measurement
   */
  recordMeasurement(entry) {
    this.metrics.navigation[entry.name] = {
      duration: entry.duration,
      startTime: entry.startTime,
      timestamp: Date.now(),
    };
  }

  /**
   * Record resource timing
   */
  recordResourceTiming(entry) {
    const timing = {
      name: entry.name,
      duration: entry.duration,
      size: entry.transferSize,
      type: this.getResourceType(entry.name),
      timestamp: Date.now(),
    };

    this.metrics.resourceLoading.push(timing);
  }

  /**
   * Mark the start of a code splitting operation
   */
  markCodeSplitStart(chunkName) {
    const markName = `code-split-${chunkName}-start`;
    performance.mark(markName);
    return markName;
  }

  /**
   * Mark the end of a code splitting operation
   */
  markCodeSplitEnd(chunkName, startMarkName) {
    const endMarkName = `code-split-${chunkName}-end`;
    const measureName = `code-split-${chunkName}`;

    performance.mark(endMarkName);
    performance.measure(measureName, startMarkName, endMarkName);

    const measure = performance.getEntriesByName(measureName)[0];
    this.metrics.codesplitting[chunkName] = {
      duration: measure.duration,
      timestamp: Date.now(),
    };

    console.log(`📦 Code split ${chunkName} loaded in ${measure.duration.toFixed(2)}ms`);
  }

  /**
   * Track user interaction timing
   */
  trackInteraction(type, target, startTime = performance.now()) {
    const endTime = performance.now();
    const duration = endTime - startTime;

    this.metrics.userInteractions.push({
      type,
      target: target?.tagName || 'unknown',
      duration,
      timestamp: Date.now(),
    });

    // Warn about slow interactions
    if (duration > 100) {
      console.warn(`🐌 Slow ${type} interaction: ${duration.toFixed(2)}ms`);
    }
  }

  /**
   * Evaluate metric against thresholds
   */
  evaluateMetric(metricName, value) {
    const threshold = this.thresholds[metricName];
    if (!threshold) return;

    const status = value <= threshold ? 'good' : 'poor';
    console.log(`📊 ${metricName.toUpperCase()}: ${value.toFixed(2)}ms (${status})`);

    if (status === 'poor') {
      this.generateOptimizationSuggestion(metricName, value);
    }
  }

  /**
   * Generate optimization suggestions
   */
  generateOptimizationSuggestion(metricName, value) {
    const suggestions = {
      fcp: 'Consider optimizing critical CSS and reducing render-blocking resources',
      lcp: 'Optimize images, preload key resources, and reduce server response times',
      fid: 'Reduce JavaScript execution time and break up long tasks',
      cls: 'Specify dimensions for images and videos, avoid inserting content above existing content',
      ttfb: 'Optimize server response time and consider using a CDN',
    };

    console.warn(`💡 Optimization suggestion for ${metricName}:`, suggestions[metricName]);
  }

  /**
   * Generate resource optimization suggestions
   */
  generateResourceOptimizationSuggestions(analysis) {
    const suggestions = [];

    // Check for large bundles
    if (analysis.byType.script?.size > 500000) { // 500KB
      suggestions.push('Consider code splitting to reduce JavaScript bundle size');
    }

    // Check for unoptimized images
    if (analysis.byType.image?.size > 1000000) { // 1MB
      suggestions.push('Optimize images using modern formats (WebP, AVIF) and compression');
    }

    // Check cache utilization
    const cacheHitRate = analysis.cacheHits / (analysis.cacheHits + analysis.cacheMisses);
    if (cacheHitRate < 0.7) {
      suggestions.push('Improve caching strategy to reduce network requests');
    }

    // Check for slow resources
    if (analysis.slowResources.length > 0) {
      suggestions.push(`Optimize ${analysis.slowResources.length} slow-loading resources`);
    }

    if (suggestions.length > 0) {
      console.warn('🔧 Resource optimization suggestions:', suggestions);
    }
  }

  /**
   * Adapt to network conditions
   */
  adaptToNetworkConditions() {
    const { effectiveType, saveData } = this.metrics.networkQuality;

    if (effectiveType === 'slow-2g' || effectiveType === '2g' || saveData) {
      // Disable non-critical features
      document.body.classList.add('low-bandwidth');
      console.log('🔧 Adapted to low bandwidth conditions');
    } else {
      document.body.classList.remove('low-bandwidth');
    }
  }

  /**
   * Start periodic monitoring
   */
  startPeriodicMonitoring() {
    // Monitor every 5 minutes
    setInterval(() => {
      this.collectPeriodicMetrics();
    }, 300000);
  }

  /**
   * Collect periodic metrics
   */
  collectPeriodicMetrics() {
    const navigation = performance.getEntriesByType('navigation')[0];
    if (navigation) {
      this.metrics.navigation.periodic = {
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
        domInteractive: navigation.domInteractive - navigation.navigationStart,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Get performance report
   */
  getPerformanceReport() {
    return {
      ...this.metrics,
      summary: this.generateSummary(),
      recommendations: this.generateRecommendations(),
      score: this.calculatePerformanceScore(),
    };
  }

  /**
   * Generate performance summary
   */
  generateSummary() {
    const { vitals, resourceLoading, memoryUsage } = this.metrics;

    return {
      vitals: {
        fcp: vitals.fcp ? `${vitals.fcp.toFixed(2)}ms` : 'N/A',
        lcp: vitals.lcp ? `${vitals.lcp.toFixed(2)}ms` : 'N/A',
        fid: vitals.fid ? `${vitals.fid.toFixed(2)}ms` : 'N/A',
        cls: vitals.cls ? vitals.cls.toFixed(3) : 'N/A',
      },
      resources: {
        total: resourceLoading.length,
        totalSize: this.formatBytes(resourceLoading.reduce((sum, r) => sum + (r.size || 0), 0)),
        averageLoadTime: resourceLoading.length > 0
          ? `${(resourceLoading.reduce((sum, r) => sum + (r.duration || 0), 0) / resourceLoading.length).toFixed(2)}ms`
          : 'N/A',
      },
      memory: memoryUsage.length > 0 ? {
        current: `${memoryUsage[memoryUsage.length - 1].usage.toFixed(1)}%`,
        peak: `${Math.max(...memoryUsage.map(m => m.usage)).toFixed(1)}%`,
      } : null,
    };
  }

  /**
   * Generate recommendations
   */
  generateRecommendations() {
    const recommendations = [];
    const { vitals, networkQuality } = this.metrics;

    if (vitals.fcp > this.thresholds.fcp) {
      recommendations.push('Optimize First Contentful Paint by reducing render-blocking resources');
    }

    if (vitals.lcp > this.thresholds.lcp) {
      recommendations.push('Improve Largest Contentful Paint by optimizing critical resources');
    }

    if (vitals.fid > this.thresholds.fid) {
      recommendations.push('Reduce First Input Delay by optimizing JavaScript execution');
    }

    if (vitals.cls > this.thresholds.cls) {
      recommendations.push('Minimize Cumulative Layout Shift by reserving space for dynamic content');
    }

    if (networkQuality.effectiveType === 'slow-2g' || networkQuality.effectiveType === '2g') {
      recommendations.push('Consider implementing progressive enhancement for slow connections');
    }

    return recommendations;
  }

  /**
   * Calculate overall performance score
   */
  calculatePerformanceScore() {
    const { vitals } = this.metrics;
    let score = 100;

    // Deduct points for poor vitals
    if (vitals.fcp > this.thresholds.fcp) score -= 20;
    if (vitals.lcp > this.thresholds.lcp) score -= 25;
    if (vitals.fid > this.thresholds.fid) score -= 15;
    if (vitals.cls > this.thresholds.cls) score -= 20;

    return Math.max(0, score);
  }

  /**
   * Format bytes for display
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Export metrics for external analysis
   */
  exportMetrics() {
    const data = JSON.stringify(this.getPerformanceReport(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-metrics-${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);
  }

  /**
   * Cleanup observers
   */
  cleanup() {
    this.observers.forEach((observer) => {
      observer.disconnect();
    });
    this.observers.clear();
  }
}

// Create and export singleton instance
const performanceMonitor = new PerformanceMonitor();

export default performanceMonitor;

// Export utility functions
export const {
  markCodeSplitStart,
  markCodeSplitEnd,
  trackInteraction,
  getPerformanceReport,
  exportMetrics,
} = performanceMonitor;

// Global performance tracking helpers
export const withPerformanceTracking = (fn, name) => {
  return async (...args) => {
    const start = performance.now();
    const result = await fn(...args);
    const end = performance.now();

    console.log(`⏱️ ${name} took ${(end - start).toFixed(2)}ms`);
    return result;
  };
};

export const measureAsync = async (fn, name) => {
  const startMark = `${name}-start`;
  const endMark = `${name}-end`;
  const measureName = name;

  performance.mark(startMark);
  const result = await fn();
  performance.mark(endMark);
  performance.measure(measureName, startMark, endMark);

  return result;
};

// Initialize performance monitoring
if (typeof window !== 'undefined') {
  // Auto-export metrics every 10 minutes in development
  if (process.env.NODE_ENV === 'development') {
    setInterval(() => {
      console.log('📊 Performance Report:', performanceMonitor.getPerformanceReport());
    }, 600000);
  }
}