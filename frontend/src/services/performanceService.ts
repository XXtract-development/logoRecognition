/**
 * Performance Service for monitoring and optimization
 * Tracks application performance metrics and provides optimization utilities
 */

interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

interface PerformanceStats {
  average: number;
  min: number;
  max: number;
  count: number;
  last: number;
}

class PerformanceService {
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private maxMetricsPerType = 100;

  /**
   * Start timing an operation
   */
  startTiming(operation: string): () => void {
    const startTime = performance.now();

    return () => {
      const endTime = performance.now();
      this.recordMetric(operation, endTime - startTime);
    };
  }

  /**
   * Record a performance metric
   */
  recordMetric(name: string, duration: number, metadata?: Record<string, any>): void {
    const metric: PerformanceMetric = {
      name,
      duration,
      timestamp: Date.now(),
      metadata
    };

    const metrics = this.metrics.get(name) || [];
    metrics.push(metric);

    // Keep only the latest metrics
    if (metrics.length > this.maxMetricsPerType) {
      metrics.shift();
    }

    this.metrics.set(name, metrics);
  }

  /**
   * Get performance statistics for an operation
   */
  getStats(operation: string): PerformanceStats | null {
    const metrics = this.metrics.get(operation);
    if (!metrics || metrics.length === 0) {
      return null;
    }

    const durations = metrics.map(m => m.duration);
    return {
      average: durations.reduce((a, b) => a + b, 0) / durations.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      count: durations.length,
      last: durations[durations.length - 1]
    };
  }

  /**
   * Get all performance statistics
   */
  getAllStats(): Map<string, PerformanceStats> {
    const stats = new Map<string, PerformanceStats>();

    for (const [operation] of this.metrics) {
      const stat = this.getStats(operation);
      if (stat) {
        stats.set(operation, stat);
      }
    }

    return stats;
  }

  /**
   * Clear metrics for an operation or all metrics
   */
  clearMetrics(operation?: string): void {
    if (operation) {
      this.metrics.delete(operation);
    } else {
      this.metrics.clear();
    }
  }

  /**
   * Measure and return result of an async operation
   */
  async measure<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const endTiming = this.startTiming(operation);
    try {
      const result = await fn();
      endTiming();
      return result;
    } catch (error) {
      endTiming();
      throw error;
    }
  }

  /**
   * Measure and return result of a synchronous operation
   */
  measureSync<T>(operation: string, fn: () => T): T {
    const endTiming = this.startTiming(operation);
    try {
      const result = fn();
      endTiming();
      return result;
    } catch (error) {
      endTiming();
      throw error;
    }
  }

  /**
   * Get memory usage information
   */
  getMemoryUsage(): any {
    if ('memory' in performance) {
      return {
        usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
        totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
        jsHeapSizeLimit: (performance as any).memory.jsHeapSizeLimit
      };
    }
    return null;
  }

  /**
   * Monitor frame rate
   */
  monitorFrameRate(callback: (fps: number) => void, duration: number = 1000): () => void {
    let frameCount = 0;
    let lastTime = performance.now();
    let animationFrame: number;

    const countFrames = () => {
      frameCount++;
      const currentTime = performance.now();

      if (currentTime - lastTime >= duration) {
        const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        callback(fps);
        frameCount = 0;
        lastTime = currentTime;
      }

      animationFrame = requestAnimationFrame(countFrames);
    };

    animationFrame = requestAnimationFrame(countFrames);

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }

  /**
   * Debounce function for performance optimization
   */
  debounce<T extends (...args: any[]) => any>(
    func: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout;

    return (...args: Parameters<T>) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  }

  /**
   * Throttle function for performance optimization
   */
  throttle<T extends (...args: any[]) => any>(
    func: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let lastCall = 0;

    return (...args: Parameters<T>) => {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        func(...args);
      }
    };
  }
}

// Export singleton instance
export const performanceService = new PerformanceService();
export default performanceService;