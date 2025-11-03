/**
 * Error Logging and Monitoring Service
 * US-013: Error Boundaries & Recovery - Error logging and monitoring
 */

class ErrorLogger {
  constructor() {
    this.config = {
      apiEndpoint: process.env.REACT_APP_ERROR_LOGGING_ENDPOINT || '/api/errors',
      maxRetries: 3,
      retryDelay: 1000,
      batchSize: 10,
      flushInterval: 30000, // 30 seconds
      maxQueueSize: 100,
      enableConsoleLogging: process.env.NODE_ENV === 'development',
      enableRemoteLogging: process.env.NODE_ENV === 'production',
    };

    this.queue = [];
    this.sessionId = this.generateSessionId();
    this.userId = null;
    this.userAgent = navigator.userAgent;
    this.url = window.location.href;

    this.init();
  }

  init() {
    this.setupPeriodicFlush();
    this.setupBeforeUnloadFlush();
    this.setupPerformanceLogging();
    this.loadUserContext();
  }

  /**
   * Setup periodic queue flushing
   */
  setupPeriodicFlush() {
    setInterval(() => {
      this.flushQueue();
    }, this.config.flushInterval);
  }

  /**
   * Setup flush on page unload
   */
  setupBeforeUnloadFlush() {
    window.addEventListener('beforeunload', () => {
      this.flushQueue(true); // Synchronous flush
    });

    // Also flush on visibility change (tab switching)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flushQueue();
      }
    });
  }

  /**
   * Setup performance monitoring for logging overhead
   */
  setupPerformanceLogging() {
    this.performanceMetrics = {
      totalErrors: 0,
      totalLogs: 0,
      totalFlushes: 0,
      averageFlushTime: 0,
      failedFlushes: 0,
    };
  }

  /**
   * Load user context for error attribution
   */
  loadUserContext() {
    try {
      const userId = localStorage.getItem('userId');
      const userProfile = localStorage.getItem('userProfile');

      if (userId) {
        this.userId = userId;
      }

      if (userProfile) {
        const profile = JSON.parse(userProfile);
        this.userContext = {
          id: profile.id,
          email: profile.email,
          role: profile.role,
        };
      }
    } catch (error) {
      console.warn('Failed to load user context:', error);
    }
  }

  /**
   * Log an error with full context
   */
  async logError(errorData) {
    const enrichedError = this.enrichErrorData(errorData);

    if (this.config.enableConsoleLogging) {
      this.logToConsole(enrichedError);
    }

    this.addToQueue(enrichedError);
    this.performanceMetrics.totalErrors++;

    // Flush immediately for critical errors
    if (this.isCriticalError(enrichedError)) {
      await this.flushQueue();
    }

    return enrichedError.id;
  }

  /**
   * Log a general event or action
   */
  async logEvent(eventType, eventData = {}) {
    const logEntry = {
      id: this.generateId(),
      type: 'event',
      eventType,
      data: eventData,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      userId: this.userId,
      url: window.location.href,
      userAgent: this.userAgent,
    };

    if (this.config.enableConsoleLogging) {
      console.log(`📊 Event: ${eventType}`, logEntry);
    }

    this.addToQueue(logEntry);
    this.performanceMetrics.totalLogs++;
  }

  /**
   * Log user actions for error context
   */
  logAction(action, details = {}) {
    this.logEvent('user_action', {
      action,
      details,
      timestamp: Date.now(),
    });
  }

  /**
   * Log performance metrics
   */
  logPerformance(metric, value, context = {}) {
    this.logEvent('performance', {
      metric,
      value,
      context,
      timestamp: Date.now(),
    });
  }

  /**
   * Log recovery attempts
   */
  logRecovery(recoveryData) {
    this.logEvent('error_recovery', recoveryData);
  }

  /**
   * Report error to external service (user-initiated)
   */
  async reportError(errorReport) {
    const reportData = {
      ...errorReport,
      type: 'user_report',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      userId: this.userId,
    };

    return await this.sendToRemote([reportData], true); // Force immediate send
  }

  /**
   * Enrich error data with context
   */
  enrichErrorData(errorData) {
    return {
      ...errorData,
      id: errorData.id || this.generateId(),
      sessionId: this.sessionId,
      userId: this.userId,
      userContext: this.userContext,
      timestamp: errorData.timestamp || new Date().toISOString(),
      url: window.location.href,
      userAgent: this.userAgent,

      // Browser context
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      screen: {
        width: screen.width,
        height: screen.height,
        colorDepth: screen.colorDepth,
      },

      // Performance context
      memory: performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      } : null,

      // Network context
      connection: navigator.connection ? {
        effectiveType: navigator.connection.effectiveType,
        downlink: navigator.connection.downlink,
        rtt: navigator.connection.rtt,
      } : null,

      // Page context
      pageLoadTime: this.getPageLoadTime(),
      timeOnPage: Date.now() - (window.performanceStartTime || Date.now()),

      // Previous errors context
      recentErrors: this.getRecentErrors(),
    };
  }

  /**
   * Get page load time
   */
  getPageLoadTime() {
    if (performance.timing) {
      return performance.timing.loadEventEnd - performance.timing.navigationStart;
    }
    return null;
  }

  /**
   * Get recent errors for context
   */
  getRecentErrors() {
    const fiveMinutesAgo = Date.now() - 300000;
    return this.queue
      .filter(entry =>
        entry.type === 'error' &&
        new Date(entry.timestamp).getTime() > fiveMinutesAgo
      )
      .slice(-5) // Last 5 errors
      .map(error => ({
        id: error.id,
        message: error.message,
        timestamp: error.timestamp,
      }));
  }

  /**
   * Determine if error is critical
   */
  isCriticalError(errorData) {
    const criticalKeywords = [
      'security',
      'permission',
      'auth',
      'payment',
      'data loss',
      'corruption',
    ];

    const message = (errorData.message || '').toLowerCase();
    const stack = (errorData.stack || '').toLowerCase();

    return criticalKeywords.some(keyword =>
      message.includes(keyword) || stack.includes(keyword)
    );
  }

  /**
   * Add entry to queue
   */
  addToQueue(entry) {
    this.queue.push(entry);

    // Prevent queue from growing too large
    if (this.queue.length > this.config.maxQueueSize) {
      this.queue.shift(); // Remove oldest entry
    }

    // Auto-flush if queue is getting full
    if (this.queue.length >= this.config.batchSize) {
      this.flushQueue();
    }
  }

  /**
   * Flush queue to remote service
   */
  async flushQueue(synchronous = false) {
    if (this.queue.length === 0) {
      return;
    }

    const startTime = Date.now();
    const batch = this.queue.splice(0, this.config.batchSize);

    try {
      if (synchronous) {
        this.sendToRemoteSync(batch);
      } else {
        await this.sendToRemote(batch);
      }

      const flushTime = Date.now() - startTime;
      this.updateFlushMetrics(flushTime, true);

      if (this.config.enableConsoleLogging) {
        console.log(`📤 Flushed ${batch.length} log entries in ${flushTime}ms`);
      }
    } catch (error) {
      console.error('Failed to flush error queue:', error);

      // Re-add failed entries to queue (at the beginning)
      this.queue.unshift(...batch);
      this.updateFlushMetrics(Date.now() - startTime, false);
    }
  }

  /**
   * Send batch to remote service (async)
   */
  async sendToRemote(batch, forceImmediate = false) {
    if (!this.config.enableRemoteLogging && !forceImmediate) {
      return;
    }

    const payload = {
      logs: batch,
      sessionId: this.sessionId,
      batchId: this.generateId(),
      timestamp: new Date().toISOString(),
    };

    let lastError;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const response = await fetch(this.config.apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-ID': this.sessionId,
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          return await response.json();
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        lastError = error;

        if (attempt < this.config.maxRetries - 1) {
          const delay = this.config.retryDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Send batch to remote service (sync) for page unload
   */
  sendToRemoteSync(batch) {
    if (!this.config.enableRemoteLogging) {
      return;
    }

    const payload = {
      logs: batch,
      sessionId: this.sessionId,
      batchId: this.generateId(),
      timestamp: new Date().toISOString(),
    };

    // Use sendBeacon for synchronous sending during page unload
    if (navigator.sendBeacon) {
      const success = navigator.sendBeacon(
        this.config.apiEndpoint,
        JSON.stringify(payload)
      );

      if (!success) {
        console.warn('Failed to send error logs via beacon');
      }
    } else {
      // Fallback to synchronous XHR
      const xhr = new XMLHttpRequest();
      xhr.open('POST', this.config.apiEndpoint, false); // Synchronous
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('X-Session-ID', this.sessionId);
      xhr.send(JSON.stringify(payload));
    }
  }

  /**
   * Log to console with formatting
   */
  logToConsole(errorData) {
    const { level = 'error', message, stack, ...context } = errorData;

    console.group(`🚨 ${level.toUpperCase()}: ${message}`);

    if (stack) {
      console.error('Stack:', stack);
    }

    if (Object.keys(context).length > 0) {
      console.log('Context:', context);
    }

    console.groupEnd();
  }

  /**
   * Update flush performance metrics
   */
  updateFlushMetrics(flushTime, success) {
    this.performanceMetrics.totalFlushes++;

    if (success) {
      const totalTime = this.performanceMetrics.averageFlushTime * (this.performanceMetrics.totalFlushes - 1);
      this.performanceMetrics.averageFlushTime = (totalTime + flushTime) / this.performanceMetrics.totalFlushes;
    } else {
      this.performanceMetrics.failedFlushes++;
    }
  }

  /**
   * Generate unique IDs
   */
  generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
  }

  /**
   * Get logging statistics
   */
  getStats() {
    return {
      ...this.performanceMetrics,
      queueSize: this.queue.length,
      sessionId: this.sessionId,
      userId: this.userId,
      successRate: this.performanceMetrics.totalFlushes > 0
        ? ((this.performanceMetrics.totalFlushes - this.performanceMetrics.failedFlushes) / this.performanceMetrics.totalFlushes) * 100
        : 0,
    };
  }

  /**
   * Configure logger
   */
  configure(newConfig) {
    this.config = {
      ...this.config,
      ...newConfig,
    };
  }

  /**
   * Set user context
   */
  setUser(userId, userContext = {}) {
    this.userId = userId;
    this.userContext = userContext;
  }

  /**
   * Clear user context
   */
  clearUser() {
    this.userId = null;
    this.userContext = null;
  }

  /**
   * Manual flush trigger
   */
  async flush() {
    return await this.flushQueue();
  }

  /**
   * Clear queue
   */
  clearQueue() {
    this.queue = [];
  }

  /**
   * Export logs for debugging
   */
  exportLogs() {
    const exportData = {
      sessionId: this.sessionId,
      userId: this.userId,
      logs: this.queue,
      metrics: this.performanceMetrics,
      timestamp: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `error-logs-${this.sessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// Create and export singleton instance
const errorLogger = new ErrorLogger();

// Make it globally available for error boundary and other components
window.errorLogger = errorLogger;

export default errorLogger;

// Export utility functions
export const {
  logError,
  logEvent,
  logAction,
  logPerformance,
  logRecovery,
  reportError,
  getStats,
  configure,
  setUser,
  clearUser,
  flush,
  exportLogs,
} = errorLogger;

// Auto-setup error logging
if (typeof window !== 'undefined') {
  // Log page load
  window.addEventListener('load', () => {
    errorLogger.logEvent('page_load', {
      url: window.location.href,
      loadTime: errorLogger.getPageLoadTime(),
    });
  });

  // Log navigation
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      errorLogger.logEvent('navigation', {
        from: lastUrl,
        to: window.location.href,
      });
      lastUrl = window.location.href;
    }
  }, 1000);
}