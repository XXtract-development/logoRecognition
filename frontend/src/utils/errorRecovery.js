/**
 * Error Recovery Mechanisms
 * US-013: Error Boundaries & Recovery - Error recovery mechanisms
 */

class ErrorRecoveryManager {
  constructor() {
    this.recoveryStrategies = new Map();
    this.recoveryHistory = [];
    this.maxRecoveryAttempts = 3;
    this.recoveryDelay = 1000;
    this.circuitBreaker = new Map();

    this.init();
  }

  init() {
    this.registerDefaultStrategies();
    this.setupGlobalErrorHandlers();
    this.monitorSystemHealth();
  }

  /**
   * Register default recovery strategies
   */
  registerDefaultStrategies() {
    // Chunk loading errors
    this.registerStrategy('ChunkLoadError', {
      detect: (error) => error.message.includes('Loading chunk'),
      recover: this.recoverChunkLoadError.bind(this),
      priority: 1,
      maxAttempts: 1, // Usually requires page reload
    });

    // Network errors
    this.registerStrategy('NetworkError', {
      detect: (error) => error.message.includes('fetch') || error.message.includes('network'),
      recover: this.recoverNetworkError.bind(this),
      priority: 2,
      maxAttempts: 3,
    });

    // Permission errors
    this.registerStrategy('PermissionError', {
      detect: (error) => error.message.includes('permission') || error.message.includes('unauthorized'),
      recover: this.recoverPermissionError.bind(this),
      priority: 3,
      maxAttempts: 1,
    });

    // Memory errors
    this.registerStrategy('MemoryError', {
      detect: (error) => error.message.includes('memory') || error.name === 'RangeError',
      recover: this.recoverMemoryError.bind(this),
      priority: 4,
      maxAttempts: 2,
    });

    // Component rendering errors
    this.registerStrategy('ComponentError', {
      detect: (error) => error.stack?.includes('at ') && !this.isKnownError(error),
      recover: this.recoverComponentError.bind(this),
      priority: 5,
      maxAttempts: 2,
    });
  }

  /**
   * Register a custom recovery strategy
   */
  registerStrategy(name, strategy) {
    this.recoveryStrategies.set(name, {
      name,
      ...strategy,
      successCount: 0,
      failureCount: 0,
      lastUsed: null,
    });
  }

  /**
   * Setup global error handlers
   */
  setupGlobalErrorHandlers() {
    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.handleUnhandledRejection(event.reason, event);
    });

    // Global error handler
    window.addEventListener('error', (event) => {
      this.handleGlobalError(event.error, event);
    });

    // Resource loading errors
    window.addEventListener('error', (event) => {
      if (event.target !== window) {
        this.handleResourceError(event);
      }
    }, true);
  }

  /**
   * Handle unhandled promise rejections
   */
  async handleUnhandledRejection(reason, event) {
    console.warn('🚨 Unhandled promise rejection:', reason);

    const recoveryResult = await this.attemptRecovery(reason, {
      type: 'unhandledrejection',
      context: 'promise',
    });

    if (recoveryResult.success) {
      event.preventDefault(); // Prevent console error
      console.log('✅ Recovered from unhandled promise rejection');
    }
  }

  /**
   * Handle global errors
   */
  async handleGlobalError(error, event) {
    console.warn('🚨 Global error:', error);

    const recoveryResult = await this.attemptRecovery(error, {
      type: 'global',
      context: 'window',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });

    if (recoveryResult.success) {
      event.preventDefault(); // Prevent console error
      console.log('✅ Recovered from global error');
    }
  }

  /**
   * Handle resource loading errors
   */
  async handleResourceError(event) {
    const target = event.target;
    const resourceType = target.tagName.toLowerCase();
    const resourceUrl = target.src || target.href;

    console.warn(`🚨 Resource loading error: ${resourceType} - ${resourceUrl}`);

    const error = new Error(`Failed to load ${resourceType}: ${resourceUrl}`);
    error.resourceType = resourceType;
    error.resourceUrl = resourceUrl;

    await this.attemptRecovery(error, {
      type: 'resource',
      context: resourceType,
      url: resourceUrl,
      element: target,
    });
  }

  /**
   * Attempt error recovery
   */
  async attemptRecovery(error, context = {}) {
    const errorKey = this.getErrorKey(error);

    // Check circuit breaker
    if (this.isCircuitOpen(errorKey)) {
      console.log(`⚡ Circuit breaker open for ${errorKey}, skipping recovery`);
      return { success: false, reason: 'circuit_breaker_open' };
    }

    // Find matching strategy
    const strategy = this.findMatchingStrategy(error);
    if (!strategy) {
      console.log('❌ No recovery strategy found for error:', error.message);
      return { success: false, reason: 'no_strategy' };
    }

    // Check attempt limit
    const attemptCount = this.getAttemptCount(errorKey);
    if (attemptCount >= strategy.maxAttempts) {
      console.log(`❌ Max recovery attempts reached for ${strategy.name}`);
      this.openCircuit(errorKey);
      return { success: false, reason: 'max_attempts' };
    }

    // Attempt recovery
    const recoveryId = this.generateRecoveryId();
    console.log(`🔧 Attempting recovery with strategy: ${strategy.name} (attempt ${attemptCount + 1})`);

    try {
      const startTime = Date.now();
      const result = await strategy.recover(error, context, attemptCount);
      const duration = Date.now() - startTime;

      // Record successful recovery
      this.recordRecovery(recoveryId, {
        strategy: strategy.name,
        error: error.message,
        context,
        success: true,
        duration,
        attempt: attemptCount + 1,
      });

      strategy.successCount++;
      strategy.lastUsed = Date.now();

      console.log(`✅ Recovery successful with ${strategy.name} in ${duration}ms`);
      return { success: true, strategy: strategy.name, duration };

    } catch (recoveryError) {
      const duration = Date.now() - Date.now();

      // Record failed recovery
      this.recordRecovery(recoveryId, {
        strategy: strategy.name,
        error: error.message,
        context,
        success: false,
        duration,
        attempt: attemptCount + 1,
        recoveryError: recoveryError.message,
      });

      strategy.failureCount++;
      this.incrementAttemptCount(errorKey);

      console.error(`❌ Recovery failed with ${strategy.name}:`, recoveryError);
      return { success: false, reason: 'recovery_failed', error: recoveryError };
    }
  }

  /**
   * Find matching recovery strategy
   */
  findMatchingStrategy(error) {
    const strategies = Array.from(this.recoveryStrategies.values())
      .filter(strategy => strategy.detect(error))
      .sort((a, b) => a.priority - b.priority);

    return strategies[0] || null;
  }

  /**
   * Recovery strategy implementations
   */
  async recoverChunkLoadError(error, context, attempt) {
    // Chunk load errors usually require a page reload
    if (attempt === 0) {
      // First attempt: try to reload specific chunks
      const chunkMatch = error.message.match(/Loading chunk (\d+)/);
      if (chunkMatch) {
        const chunkId = chunkMatch[1];
        console.log(`🔄 Attempting to reload chunk ${chunkId}`);

        // Try to force reload by clearing cache
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          await Promise.all(
            cacheNames.map(name => caches.delete(name))
          );
        }
      }
    }

    // If chunk reload fails, force page reload
    setTimeout(() => {
      window.location.reload();
    }, 1000);

    return { success: true, action: 'page_reload' };
  }

  async recoverNetworkError(error, context, attempt) {
    // Wait before retry (exponential backoff)
    const delay = Math.min(this.recoveryDelay * Math.pow(2, attempt), 10000);
    await new Promise(resolve => setTimeout(resolve, delay));

    // Check network connectivity
    if (!navigator.onLine) {
      throw new Error('Still offline');
    }

    // For API calls, retry the request
    if (context.type === 'unhandledrejection' && context.context === 'promise') {
      // The promise will naturally retry when the component re-renders
      return { success: true, action: 'network_retry' };
    }

    return { success: true, action: 'network_wait' };
  }

  async recoverPermissionError(error, context, attempt) {
    // Try to refresh authentication
    if (localStorage.getItem('authToken')) {
      try {
        // Attempt to refresh token
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          localStorage.setItem('authToken', data.token);
          return { success: true, action: 'token_refresh' };
        }
      } catch (refreshError) {
        console.warn('Token refresh failed:', refreshError);
      }
    }

    // Redirect to login if token refresh fails
    window.location.href = '/login';
    return { success: true, action: 'redirect_login' };
  }

  async recoverMemoryError(error, context, attempt) {
    // Force garbage collection if available
    if (window.gc) {
      window.gc();
    }

    // Clear caches to free memory
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      const oldCaches = cacheNames.filter(name =>
        !name.includes(new Date().getFullYear().toString())
      );
      await Promise.all(oldCaches.map(name => caches.delete(name)));
    }

    // Clear large objects from memory
    this.clearMemoryIntensiveData();

    // Wait a bit for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));

    return { success: true, action: 'memory_cleanup' };
  }

  async recoverComponentError(error, context, attempt) {
    // For component errors, try to reset component state
    if (context.type === 'global') {
      // Force re-render by dispatching a custom event
      window.dispatchEvent(new CustomEvent('forceComponentRerender', {
        detail: { error, context }
      }));
    }

    // Wait for re-render
    await new Promise(resolve => setTimeout(resolve, 100));

    return { success: true, action: 'component_reset' };
  }

  /**
   * Clear memory-intensive data
   */
  clearMemoryIntensiveData() {
    // Clear large images from memory
    const images = document.querySelectorAll('img');
    images.forEach(img => {
      if (img.width > 1000 || img.height > 1000) {
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      }
    });

    // Clear canvas contexts
    const canvases = document.querySelectorAll('canvas');
    canvases.forEach(canvas => {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    });

    // Clear local storage of large items
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);
      if (value && value.length > 100000) { // > 100KB
        localStorage.removeItem(key);
        console.log(`🧹 Cleared large localStorage item: ${key}`);
      }
    }
  }

  /**
   * Circuit breaker implementation
   */
  isCircuitOpen(errorKey) {
    const circuit = this.circuitBreaker.get(errorKey);
    if (!circuit) return false;

    const now = Date.now();
    const timeSinceOpen = now - circuit.openedAt;
    const cooldownPeriod = 60000; // 1 minute

    if (timeSinceOpen > cooldownPeriod) {
      this.circuitBreaker.delete(errorKey);
      return false;
    }

    return true;
  }

  openCircuit(errorKey) {
    this.circuitBreaker.set(errorKey, {
      openedAt: Date.now(),
      attempts: this.getAttemptCount(errorKey),
    });
  }

  /**
   * Error tracking utilities
   */
  getErrorKey(error) {
    return `${error.name || 'Error'}_${error.message.slice(0, 50)}`;
  }

  getAttemptCount(errorKey) {
    const history = this.recoveryHistory.filter(record =>
      record.error === errorKey &&
      Date.now() - record.timestamp < 300000 // Last 5 minutes
    );
    return history.length;
  }

  incrementAttemptCount(errorKey) {
    // This is tracked automatically in recordRecovery
  }

  generateRecoveryId() {
    return `recovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  recordRecovery(id, data) {
    const record = {
      id,
      timestamp: Date.now(),
      ...data,
    };

    this.recoveryHistory.push(record);

    // Keep only last 100 records
    if (this.recoveryHistory.length > 100) {
      this.recoveryHistory.shift();
    }

    // Log to external service if configured
    this.logRecoveryAttempt(record);
  }

  async logRecoveryAttempt(record) {
    try {
      // Send to monitoring service
      if (window.errorLogger) {
        await window.errorLogger.logRecovery(record);
      }
    } catch (loggingError) {
      console.warn('Failed to log recovery attempt:', loggingError);
    }
  }

  /**
   * System health monitoring
   */
  monitorSystemHealth() {
    setInterval(() => {
      this.checkSystemHealth();
    }, 30000); // Every 30 seconds
  }

  checkSystemHealth() {
    const health = {
      memory: this.getMemoryStatus(),
      network: navigator.onLine,
      errors: this.getRecentErrorCount(),
      recoveries: this.getRecentRecoveryCount(),
      timestamp: Date.now(),
    };

    // Trigger preventive measures if needed
    if (health.memory.usage > 85) {
      console.warn('🔧 High memory usage detected, triggering cleanup');
      this.clearMemoryIntensiveData();
    }

    if (health.errors > 10) {
      console.warn('🔧 High error rate detected');
    }

    return health;
  }

  getMemoryStatus() {
    if (performance.memory) {
      const memory = performance.memory;
      return {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        limit: memory.jsHeapSizeLimit,
        usage: (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100,
      };
    }
    return { usage: 0 };
  }

  getRecentErrorCount() {
    const fiveMinutesAgo = Date.now() - 300000;
    return this.recoveryHistory.filter(record =>
      record.timestamp > fiveMinutesAgo && !record.success
    ).length;
  }

  getRecentRecoveryCount() {
    const fiveMinutesAgo = Date.now() - 300000;
    return this.recoveryHistory.filter(record =>
      record.timestamp > fiveMinutesAgo && record.success
    ).length;
  }

  /**
   * Utility methods
   */
  isKnownError(error) {
    const knownErrors = [
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
      'Script error.',
    ];

    return knownErrors.some(known => error.message.includes(known));
  }

  /**
   * Get recovery statistics
   */
  getRecoveryStats() {
    const strategies = Array.from(this.recoveryStrategies.values());
    const recentHistory = this.recoveryHistory.filter(record =>
      Date.now() - record.timestamp < 3600000 // Last hour
    );

    return {
      strategies: strategies.map(strategy => ({
        name: strategy.name,
        successCount: strategy.successCount,
        failureCount: strategy.failureCount,
        successRate: strategy.successCount / (strategy.successCount + strategy.failureCount) || 0,
        lastUsed: strategy.lastUsed,
      })),
      recentRecoveries: recentHistory.length,
      successfulRecoveries: recentHistory.filter(r => r.success).length,
      failedRecoveries: recentHistory.filter(r => !r.success).length,
      circuitBreakers: Array.from(this.circuitBreaker.keys()),
    };
  }

  /**
   * Manual recovery trigger
   */
  async triggerRecovery(error, strategy = null) {
    if (strategy) {
      const strategyObj = this.recoveryStrategies.get(strategy);
      if (strategyObj) {
        return await strategyObj.recover(error, { type: 'manual' }, 0);
      }
    }

    return await this.attemptRecovery(error, { type: 'manual' });
  }
}

// Create and export singleton instance
const errorRecoveryManager = new ErrorRecoveryManager();

export default errorRecoveryManager;

// Export utility functions
export const {
  registerStrategy,
  attemptRecovery,
  getRecoveryStats,
  triggerRecovery,
} = errorRecoveryManager;