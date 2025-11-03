// Performance Monitoring Utility

interface PerformanceMetrics {
  renderTime: number;
  apiCallDuration: number;
  memoryUsage?: number;
  timestamp: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private readonly MAX_METRICS = 100;
  private observers: Map<string, PerformanceObserver> = new Map();

  /**
   * Measures component render time
   */
  measureRenderTime(componentName: string, callback: () => void): void {
    const startTime = performance.now();
    callback();
    const endTime = performance.now();
    const renderTime = endTime - startTime;

    if (renderTime > 16) {
      // Log slow renders (> 16ms means dropped frames)
      console.warn(`Slow render detected in ${componentName}: ${renderTime.toFixed(2)}ms`);
    }

    this.addMetric({
      renderTime,
      apiCallDuration: 0,
      timestamp: Date.now(),
    });
  }

  /**
   * Measures API call duration
   */
  async measureApiCall<T>(
    apiName: string,
    apiCall: () => Promise<T>
  ): Promise<T> {
    const startTime = performance.now();

    try {
      const result = await apiCall();
      const endTime = performance.now();
      const duration = endTime - startTime;

      if (duration > 3000) {
        // Log slow API calls (> 3 seconds)
        console.warn(`Slow API call detected for ${apiName}: ${duration.toFixed(2)}ms`);
      }

      this.addMetric({
        renderTime: 0,
        apiCallDuration: duration,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;

      console.error(`API call ${apiName} failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  /**
   * Monitors memory usage (if available)
   */
  monitorMemory(): void {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      const usedMemoryMB = memory.usedJSHeapSize / 1048576;

      if (usedMemoryMB > 100) {
        // Warn if memory usage exceeds 100MB
        console.warn(`High memory usage detected: ${usedMemoryMB.toFixed(2)}MB`);
      }

      this.addMetric({
        renderTime: 0,
        apiCallDuration: 0,
        memoryUsage: usedMemoryMB,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Sets up Long Task observer to detect blocking operations
   */
  observeLongTasks(): void {
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 50) {
              // Log tasks blocking main thread for > 50ms
              console.warn('Long task detected:', {
                duration: entry.duration.toFixed(2),
                startTime: entry.startTime.toFixed(2),
                name: entry.name,
              });
            }
          }
        });

        observer.observe({ entryTypes: ['longtask'] });
        this.observers.set('longtask', observer);
      } catch (error) {
        console.error('Failed to setup long task observer:', error);
      }
    }
  }

  /**
   * Monitors WebSocket connection performance
   */
  monitorWebSocketPerformance(ws: WebSocket): void {
    const connectionStart = performance.now();

    ws.addEventListener('open', () => {
      const connectionTime = performance.now() - connectionStart;
      console.log(`WebSocket connected in ${connectionTime.toFixed(2)}ms`);

      if (connectionTime > 5000) {
        console.warn('Slow WebSocket connection detected');
      }
    });

    // Monitor message latency
    let messageCount = 0;
    let totalLatency = 0;

    ws.addEventListener('message', (event) => {
      if (event.data && typeof event.data === 'string') {
        try {
          const data = JSON.parse(event.data);
          if (data.timestamp) {
            const latency = Date.now() - data.timestamp;
            totalLatency += latency;
            messageCount++;

            if (latency > 1000) {
              console.warn(`High WebSocket latency: ${latency}ms`);
            }

            // Log average latency every 10 messages
            if (messageCount % 10 === 0) {
              const avgLatency = totalLatency / messageCount;
              console.log(`Average WebSocket latency: ${avgLatency.toFixed(2)}ms`);
            }
          }
        } catch (error) {
          // Ignore parsing errors
        }
      }
    });
  }

  /**
   * Gets performance report
   */
  getReport(): {
    averageRenderTime: number;
    averageApiCallDuration: number;
    averageMemoryUsage: number;
    slowRenders: number;
    slowApiCalls: number;
  } {
    const renderMetrics = this.metrics.filter((m) => m.renderTime > 0);
    const apiMetrics = this.metrics.filter((m) => m.apiCallDuration > 0);
    const memoryMetrics = this.metrics.filter((m) => m.memoryUsage !== undefined);

    const averageRenderTime =
      renderMetrics.length > 0
        ? renderMetrics.reduce((sum, m) => sum + m.renderTime, 0) / renderMetrics.length
        : 0;

    const averageApiCallDuration =
      apiMetrics.length > 0
        ? apiMetrics.reduce((sum, m) => sum + m.apiCallDuration, 0) / apiMetrics.length
        : 0;

    const averageMemoryUsage =
      memoryMetrics.length > 0
        ? memoryMetrics.reduce((sum, m) => sum + (m.memoryUsage || 0), 0) / memoryMetrics.length
        : 0;

    const slowRenders = renderMetrics.filter((m) => m.renderTime > 16).length;
    const slowApiCalls = apiMetrics.filter((m) => m.apiCallDuration > 3000).length;

    return {
      averageRenderTime,
      averageApiCallDuration,
      averageMemoryUsage,
      slowRenders,
      slowApiCalls,
    };
  }

  /**
   * Logs performance report to console
   */
  logReport(): void {
    const report = this.getReport();
    console.table({
      'Average Render Time (ms)': report.averageRenderTime.toFixed(2),
      'Average API Call Duration (ms)': report.averageApiCallDuration.toFixed(2),
      'Average Memory Usage (MB)': report.averageMemoryUsage.toFixed(2),
      'Slow Renders (>16ms)': report.slowRenders,
      'Slow API Calls (>3s)': report.slowApiCalls,
    });
  }

  /**
   * Clears all metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Cleanup observers
   */
  cleanup(): void {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers.clear();
    this.clear();
  }

  private addMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);

    // Keep only the last MAX_METRICS entries
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics.shift();
    }
  }
}

// Export singleton instance
const performanceMonitor = new PerformanceMonitor();

// Set up monitoring in development
if (process.env.NODE_ENV === 'development') {
  performanceMonitor.observeLongTasks();

  // Log report every 30 seconds in development
  setInterval(() => {
    performanceMonitor.monitorMemory();
    performanceMonitor.logReport();
  }, 30000);
}

export default performanceMonitor;