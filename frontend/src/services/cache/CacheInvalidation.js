/**
 * Advanced Cache Invalidation System
 * Manages cache invalidation strategies and dependency tracking
 */

import EventEmitter from 'events';

/**
 * Cache Invalidation Manager
 */
export class CacheInvalidationManager extends EventEmitter {
  constructor() {
    super();
    this.dependencies = new Map(); // key -> Set of dependent keys
    this.tags = new Map(); // tag -> Set of keys
    this.patterns = new Map(); // pattern -> regex
    this.invalidationStrategies = new Map();
    this.invalidationQueue = [];
    this.isProcessing = false;

    this.setupDefaultStrategies();
    this.startQueueProcessor();
  }

  /**
   * Setup default invalidation strategies
   */
  setupDefaultStrategies() {
    // Time-based invalidation
    this.addStrategy('ttl', {
      shouldInvalidate: (meta) => {
        return meta.expiry && Date.now() > meta.expiry;
      }
    });

    // Version-based invalidation
    this.addStrategy('version', {
      shouldInvalidate: (meta, context) => {
        return context.version && meta.version !== context.version;
      }
    });

    // Dependency-based invalidation
    this.addStrategy('dependency', {
      shouldInvalidate: (meta, context) => {
        if (!context.invalidatedKeys) return false;
        const deps = this.dependencies.get(meta.key) || new Set();
        return Array.from(deps).some(dep => context.invalidatedKeys.has(dep));
      }
    });

    // Frequency-based invalidation (LFU)
    this.addStrategy('lfu', {
      shouldInvalidate: (meta, context) => {
        if (!context.memoryPressure) return false;
        return meta.accessCount < context.lfuThreshold;
      }
    });

    // Size-based invalidation
    this.addStrategy('size', {
      shouldInvalidate: (meta, context) => {
        if (!context.memoryPressure) return false;
        return meta.size > context.maxItemSize;
      }
    });
  }

  /**
   * Add custom invalidation strategy
   */
  addStrategy(name, strategy) {
    this.invalidationStrategies.set(name, strategy);
  }

  /**
   * Register cache dependency
   */
  addDependency(key, dependsOn) {
    if (!this.dependencies.has(dependsOn)) {
      this.dependencies.set(dependsOn, new Set());
    }
    this.dependencies.get(dependsOn).add(key);
  }

  /**
   * Remove dependency
   */
  removeDependency(key, dependsOn) {
    const deps = this.dependencies.get(dependsOn);
    if (deps) {
      deps.delete(key);
      if (deps.size === 0) {
        this.dependencies.delete(dependsOn);
      }
    }
  }

  /**
   * Add tag to key
   */
  addTag(key, tag) {
    if (!this.tags.has(tag)) {
      this.tags.set(tag, new Set());
    }
    this.tags.get(tag).add(key);
  }

  /**
   * Remove tag from key
   */
  removeTag(key, tag) {
    const keys = this.tags.get(tag);
    if (keys) {
      keys.delete(key);
      if (keys.size === 0) {
        this.tags.delete(tag);
      }
    }
  }

  /**
   * Add pattern-based invalidation
   */
  addPattern(name, pattern) {
    this.patterns.set(name, new RegExp(pattern));
  }

  /**
   * Invalidate by key
   */
  async invalidateKey(key, cascade = true) {
    const invalidated = new Set([key]);

    if (cascade) {
      // Invalidate dependent keys
      const dependents = this.dependencies.get(key) || new Set();
      for (const dependent of dependents) {
        invalidated.add(dependent);
      }
    }

    // Emit invalidation event
    this.emit('invalidate', { keys: Array.from(invalidated), trigger: 'key', source: key });

    return invalidated;
  }

  /**
   * Invalidate by tag
   */
  async invalidateTag(tag) {
    const keys = this.tags.get(tag) || new Set();
    const invalidated = new Set(keys);

    // Also invalidate dependent keys
    for (const key of keys) {
      const dependents = this.dependencies.get(key) || new Set();
      for (const dependent of dependents) {
        invalidated.add(dependent);
      }
    }

    // Clean up tag
    this.tags.delete(tag);

    // Emit invalidation event
    this.emit('invalidate', { keys: Array.from(invalidated), trigger: 'tag', source: tag });

    return invalidated;
  }

  /**
   * Invalidate by pattern
   */
  async invalidatePattern(patternName, keys) {
    const pattern = this.patterns.get(patternName);
    if (!pattern) {
      throw new Error(`Pattern ${patternName} not found`);
    }

    const invalidated = new Set();

    for (const key of keys) {
      if (pattern.test(key)) {
        invalidated.add(key);
        // Also invalidate dependent keys
        const dependents = this.dependencies.get(key) || new Set();
        for (const dependent of dependents) {
          invalidated.add(dependent);
        }
      }
    }

    // Emit invalidation event
    this.emit('invalidate', { keys: Array.from(invalidated), trigger: 'pattern', source: patternName });

    return invalidated;
  }

  /**
   * Smart invalidation based on strategies
   */
  async smartInvalidate(metadata, context = {}) {
    const toInvalidate = new Set();

    for (const [name, strategy] of this.invalidationStrategies) {
      for (const [key, meta] of metadata) {
        if (strategy.shouldInvalidate(meta, context)) {
          toInvalidate.add(key);
        }
      }
    }

    if (toInvalidate.size > 0) {
      // Also invalidate dependent keys
      for (const key of toInvalidate) {
        const dependents = this.dependencies.get(key) || new Set();
        for (const dependent of dependents) {
          toInvalidate.add(dependent);
        }
      }

      // Emit invalidation event
      this.emit('invalidate', {
        keys: Array.from(toInvalidate),
        trigger: 'smart',
        strategies: Array.from(this.invalidationStrategies.keys())
      });
    }

    return toInvalidate;
  }

  /**
   * Batch invalidation
   */
  async batchInvalidate(operations) {
    const invalidated = new Set();

    for (const operation of operations) {
      let result;

      switch (operation.type) {
        case 'key':
          result = await this.invalidateKey(operation.target, operation.cascade);
          break;
        case 'tag':
          result = await this.invalidateTag(operation.target);
          break;
        case 'pattern':
          result = await this.invalidatePattern(operation.target, operation.keys);
          break;
        default:
          console.warn(`Unknown invalidation type: ${operation.type}`);
          continue;
      }

      for (const key of result) {
        invalidated.add(key);
      }
    }

    return invalidated;
  }

  /**
   * Queue invalidation for batch processing
   */
  queueInvalidation(operation) {
    this.invalidationQueue.push({
      ...operation,
      timestamp: Date.now()
    });

    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Process invalidation queue
   */
  async processQueue() {
    if (this.invalidationQueue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const batch = this.invalidationQueue.splice(0, 100); // Process up to 100 items

    try {
      await this.batchInvalidate(batch);
    } catch (error) {
      console.error('Error processing invalidation queue:', error);
    }

    // Continue processing if more items
    if (this.invalidationQueue.length > 0) {
      setTimeout(() => this.processQueue(), 10);
    } else {
      this.isProcessing = false;
    }
  }

  /**
   * Start queue processor
   */
  startQueueProcessor() {
    setInterval(() => {
      if (!this.isProcessing && this.invalidationQueue.length > 0) {
        this.processQueue();
      }
    }, 1000); // Process queue every second
  }

  /**
   * Get invalidation metrics
   */
  getMetrics() {
    return {
      totalDependencies: this.dependencies.size,
      totalTags: this.tags.size,
      totalPatterns: this.patterns.size,
      queueSize: this.invalidationQueue.length,
      strategies: Array.from(this.invalidationStrategies.keys())
    };
  }

  /**
   * Clear all invalidation data
   */
  clear() {
    this.dependencies.clear();
    this.tags.clear();
    this.patterns.clear();
    this.invalidationQueue = [];
    this.removeAllListeners();
  }
}

/**
 * Invalidation Policy Manager
 */
export class InvalidationPolicyManager {
  constructor() {
    this.policies = new Map();
    this.setupDefaultPolicies();
  }

  setupDefaultPolicies() {
    // Aggressive invalidation for user data
    this.addPolicy('user-data', {
      ttl: 5 * 60 * 1000, // 5 minutes
      cascadeInvalidation: true,
      invalidateOnError: true,
      invalidateOnUserChange: true
    });

    // Conservative invalidation for static data
    this.addPolicy('static-data', {
      ttl: 24 * 60 * 60 * 1000, // 24 hours
      cascadeInvalidation: false,
      invalidateOnError: false,
      invalidateOnUserChange: false
    });

    // Moderate invalidation for API responses
    this.addPolicy('api-response', {
      ttl: 15 * 60 * 1000, // 15 minutes
      cascadeInvalidation: true,
      invalidateOnError: true,
      invalidateOnUserChange: false
    });

    // Real-time invalidation
    this.addPolicy('real-time', {
      ttl: 1000, // 1 second
      cascadeInvalidation: true,
      invalidateOnError: true,
      invalidateOnUserChange: true,
      invalidateOnWebSocket: true
    });
  }

  addPolicy(name, policy) {
    this.policies.set(name, policy);
  }

  getPolicy(name) {
    return this.policies.get(name) || this.policies.get('api-response');
  }

  applyPolicy(key, policyName, metadata = {}) {
    const policy = this.getPolicy(policyName);

    return {
      ...metadata,
      key,
      policy: policyName,
      ttl: policy.ttl,
      expiry: policy.ttl ? Date.now() + policy.ttl : null,
      cascadeInvalidation: policy.cascadeInvalidation,
      invalidateOnError: policy.invalidateOnError,
      invalidateOnUserChange: policy.invalidateOnUserChange
    };
  }
}

// Export singleton instances
export const invalidationManager = new CacheInvalidationManager();
export const policyManager = new InvalidationPolicyManager();

export default {
  CacheInvalidationManager,
  InvalidationPolicyManager,
  invalidationManager,
  policyManager
};