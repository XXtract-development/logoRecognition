/**
 * Performance Monitoring Utility
 * Tracks Core Web Vitals and application-specific metrics
 */

import { getCLS, getFID, getFCP, getLCP, getTTFB, Metric } from 'web-vitals';

interface PerformanceEntry {
  name: string;
  value: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

interface ErrorReport {
  type: string;
  error: string;
  errorInfo?: any;
  timestamp: number;
  url?: string;
  userAgent?: string;
}

export class PerformanceMonitor {
  private metrics: Map<string, PerformanceEntry[]> = new Map();
  private observers: PerformanceObserver[] = [];
  private errorBuffer: ErrorReport[] = [];
  private maxErrorBufferSize = 100;

  /**
   * Initialize performance monitoring
   */
  init(): void {
    this.setupPerformanceObservers();
    this.trackNavigationTiming();
    this.trackResourceTiming();
  }

  /**
   * Monitor Core Web Vitals
   */
  monitorCoreWebVitals(callback: (metric: Metric) => void): void {
    getCLS(callback);
    getFID(callback);
    getFCP(callback);
    getLCP(callback);
    getTTFB(callback);
  }

  /**
   * Setup performance observers
   */
  private setupPerformanceObservers(): void {
    // Observer for navigation timing
    if ('PerformanceObserver' in window) {
      try {
        const navigationObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (entry.entryType === 'navigation') {
              this.recordMetric('navigation', {
                name: 'page-load',
                value: entry.duration,
                timestamp: entry.startTime,
                metadata: {
                  transferSize: (entry as any).transferSize,
                  encodedBodySize: (entry as any).encodedBodySize,
                  decodedBodySize: (entry as any).decodedBodySize,
                }
              });
            }
          });
        });
        navigationObserver.observe({ entryTypes: ['navigation'] });
        this.observers.push(navigationObserver);
      } catch (e) {
        console.warn('Failed to setup navigation observer:', e);
      }

      // Observer for resource timing
      try {
        const resourceObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (entry.entryType === 'resource' && entry.name.includes('.chunk.js')) {
              this.recordMetric('chunk-loading', {
                name: this.extractChunkName(entry.name),
                value: entry.duration,
                timestamp: entry.startTime,
                metadata: {
                  transferSize: (entry as any).transferSize,
                  cacheHit: (entry as any).transferSize === 0,
                }
              });
            }
          });
        });
        resourceObserver.observe({ entryTypes: ['resource'] });
        this.observers.push(resourceObserver);
      } catch (e) {
        console.warn('Failed to setup resource observer:', e);
      }

      // Observer for long tasks
      try {
        const longTaskObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (entry.duration > 50) {
              this.recordMetric('long-task', {
                name: 'blocking-task',
                value: entry.duration,
                timestamp: entry.startTime,
              });
            }
          });
        });
        longTaskObserver.observe({ entryTypes: ['longtask'] });
        this.observers.push(longTaskObserver);
      } catch (e) {
        // Long task observer may not be supported
      }
    }
  }

  /**
   * Track navigation timing
   */
  private trackNavigationTiming(): void {
    window.addEventListener('load', () => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navigation) {
        this.recordMetric('navigation-details', {
          name: 'timing',
          value: navigation.loadEventEnd - navigation.fetchStart,
          timestamp: navigation.fetchStart,
          metadata: {
            dns: navigation.domainLookupEnd - navigation.domainLookupStart,
            tcp: navigation.connectEnd - navigation.connectStart,
            ttfb: navigation.responseStart - navigation.fetchStart,
            domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
            domComplete: navigation.domComplete - navigation.domInteractive,
          }
        });
      }
    });
  }

  /**
   * Track resource timing
   */
  private trackResourceTiming(): void {
    // Check resource timing periodically
    setInterval(() => {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const jsResources = resources.filter(r => r.name.endsWith('.js'));
      const cssResources = resources.filter(r => r.name.endsWith('.css'));

      if (jsResources.length > 0) {
        const avgJsLoadTime = jsResources.reduce((sum, r) => sum + r.duration, 0) / jsResources.length;
        this.recordMetric('resource-summary', {
          name: 'js-average-load',
          value: avgJsLoadTime,
          timestamp: Date.now(),
        });
      }

      if (cssResources.length > 0) {
        const avgCssLoadTime = cssResources.reduce((sum, r) => sum + r.duration, 0) / cssResources.length;
        this.recordMetric('resource-summary', {
          name: 'css-average-load',
          value: avgCssLoadTime,
          timestamp: Date.now(),
        });
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Record a performance metric
   */
  recordMetric(category: string, entry: PerformanceEntry): void {
    if (!this.metrics.has(category)) {
      this.metrics.set(category, []);
    }
    this.metrics.get(category)!.push(entry);

    // Send to analytics if available
    if ((window as any).gtag) {
      (window as any).gtag('event', 'performance_metric', {
        event_category: category,
        event_label: entry.name,
        value: Math.round(entry.value),
        custom_dimensions: entry.metadata,
      });
    }
  }

  /**
   * Report an error
   */
  reportError(error: ErrorReport): void {
    // Add to buffer
    this.errorBuffer.push(error);

    // Trim buffer if too large
    if (this.errorBuffer.length > this.maxErrorBufferSize) {
      this.errorBuffer.shift();
    }

    // Send to monitoring service
    this.sendErrorToMonitoring(error);
  }

  /**
   * Send error to monitoring service
   */
  private sendErrorToMonitoring(error: ErrorReport): void {
    // In production, send to actual monitoring service
    if (process.env.NODE_ENV === 'production') {
      fetch('/api/v1/monitoring/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(error),
      }).catch(console.error);
    }

    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Performance Monitor Error:', error);
    }
  }

  /**
   * Extract chunk name from URL
   */
  private extractChunkName(url: string): string {
    const match = url.match(/([^/]+)\.chunk\.js/);
    return match ? match[1] : 'unknown';
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): Record<string, any> {
    const summary: Record<string, any> = {};

    this.metrics.forEach((entries, category) => {
      if (entries.length > 0) {
        const values = entries.map(e => e.value);
        summary[category] = {
          count: entries.length,
          average: values.reduce((a, b) => a + b, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values),
          p50: this.percentile(values, 0.5),
          p95: this.percentile(values, 0.95),
          p99: this.percentile(values, 0.99),
        };
      }
    });

    return summary;
  }

  /**
   * Calculate percentile
   */
  private percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Cleanup observers
   */
  cleanup(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }

  /**
   * Export metrics for analysis
   */
  exportMetrics(): {
    metrics: Record<string, PerformanceEntry[]>;
    errors: ErrorReport[];
    summary: Record<string, any>;
  } {
    return {
      metrics: Object.fromEntries(this.metrics),
      errors: [...this.errorBuffer],
      summary: this.getPerformanceSummary(),
    };
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();