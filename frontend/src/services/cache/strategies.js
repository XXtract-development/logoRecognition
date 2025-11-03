/**
 * Cache Strategies Configuration
 * US-016: API Caching Strategy - Caching strategies
 */

export const cacheStrategies = {
  // Default strategy: Memory -> LocalStorage -> IndexedDB
  default: {
    layers: ['memory', 'localStorage', 'indexedDB'],
    promote: true,
    ttl: 5 * 60 * 1000, // 5 minutes
    maxSize: 10 * 1024 * 1024, // 10MB
    evictionPolicy: 'lru',
  },

  // Fast access for frequently used data
  fast: {
    layers: ['memory', 'sessionStorage'],
    promote: true,
    ttl: 2 * 60 * 1000, // 2 minutes
    maxSize: 5 * 1024 * 1024, // 5MB
    evictionPolicy: 'lru',
  },

  // Persistent for user preferences and settings
  persistent: {
    layers: ['localStorage', 'indexedDB'],
    promote: false,
    ttl: 24 * 60 * 60 * 1000, // 24 hours
    maxSize: 50 * 1024 * 1024, // 50MB
    evictionPolicy: 'lfu', // Least Frequently Used
  },

  // Session-only data
  session: {
    layers: ['memory', 'sessionStorage'],
    promote: true,
    ttl: 30 * 60 * 1000, // 30 minutes
    maxSize: 2 * 1024 * 1024, // 2MB
    evictionPolicy: 'lru',
  },

  // Large files and images
  large: {
    layers: ['indexedDB'],
    promote: false,
    ttl: 60 * 60 * 1000, // 1 hour
    maxSize: 100 * 1024 * 1024, // 100MB
    evictionPolicy: 'fifo', // First In, First Out
  },

  // API responses with different urgency levels
  api: {
    layers: ['memory', 'localStorage', 'indexedDB'],
    promote: true,
    ttl: 10 * 60 * 1000, // 10 minutes
    maxSize: 20 * 1024 * 1024, // 20MB
    evictionPolicy: 'lru',
    staleWhileRevalidate: true,
  },

  // Critical data that should be highly available
  critical: {
    layers: ['memory', 'localStorage', 'sessionStorage', 'indexedDB'],
    promote: true,
    ttl: 60 * 60 * 1000, // 1 hour
    maxSize: 15 * 1024 * 1024, // 15MB
    evictionPolicy: 'priority',
    priority: 'high',
  },

  // Temporary data with short lifespan
  temporary: {
    layers: ['memory'],
    promote: false,
    ttl: 30 * 1000, // 30 seconds
    maxSize: 1 * 1024 * 1024, // 1MB
    evictionPolicy: 'ttl',
  },

  // Offline-first strategy
  offline: {
    layers: ['indexedDB', 'localStorage', 'memory'],
    promote: false,
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
    maxSize: 200 * 1024 * 1024, // 200MB
    evictionPolicy: 'lfu',
    offlineFirst: true,
  },

  // Preloading strategy for anticipated data
  preload: {
    layers: ['memory', 'localStorage'],
    promote: false,
    ttl: 15 * 60 * 1000, // 15 minutes
    maxSize: 30 * 1024 * 1024, // 30MB
    evictionPolicy: 'lru',
    preload: true,
  },
};

/**
 * Cache invalidation strategies
 */
export const invalidationStrategies = {
  // Time-based invalidation
  ttl: {
    trigger: 'time',
    check: (entry) => Date.now() > (entry.timestamp + entry.ttl),
  },

  // Tag-based invalidation
  tags: {
    trigger: 'manual',
    check: (entry, tags) => entry.tags && entry.tags.some(tag => tags.includes(tag)),
  },

  // Version-based invalidation
  version: {
    trigger: 'version',
    check: (entry, currentVersion) => entry.version !== currentVersion,
  },

  // Dependency-based invalidation
  dependency: {
    trigger: 'dependency',
    check: (entry, changedDependencies) =>
      entry.dependencies && entry.dependencies.some(dep => changedDependencies.includes(dep)),
  },

  // Manual invalidation
  manual: {
    trigger: 'manual',
    check: () => false, // Always manual
  },

  // Stale while revalidate
  swr: {
    trigger: 'stale',
    check: (entry) => Date.now() > (entry.timestamp + entry.ttl),
    allowStale: true,
  },
};

/**
 * Cache warming strategies
 */
export const warmingStrategies = {
  // Warm cache on application start
  startup: {
    when: 'startup',
    priority: 'high',
    batch: true,
  },

  // Warm cache on user interaction
  interaction: {
    when: 'interaction',
    priority: 'medium',
    batch: false,
  },

  // Warm cache during idle time
  idle: {
    when: 'idle',
    priority: 'low',
    batch: true,
  },

  // Warm cache based on user behavior patterns
  predictive: {
    when: 'predictive',
    priority: 'medium',
    batch: true,
    ml: true, // Uses machine learning for predictions
  },

  // Warm cache on route change
  navigation: {
    when: 'navigation',
    priority: 'high',
    batch: false,
  },
};

/**
 * Network-aware caching strategies
 */
export const networkStrategies = {
  // Online-first: Try network first, fallback to cache
  onlineFirst: {
    mode: 'online-first',
    networkTimeout: 3000,
    fallbackToCache: true,
    updateCacheOnSuccess: true,
  },

  // Cache-first: Try cache first, fallback to network
  cacheFirst: {
    mode: 'cache-first',
    fallbackToNetwork: true,
    updateCacheOnNetworkSuccess: true,
    serveStaleOnError: true,
  },

  // Network-only: Always use network
  networkOnly: {
    mode: 'network-only',
    useCache: false,
    updateCacheOnSuccess: false,
  },

  // Cache-only: Always use cache
  cacheOnly: {
    mode: 'cache-only',
    useNetwork: false,
    serveStaleIfAvailable: true,
  },

  // Stale while revalidate: Serve from cache, update in background
  staleWhileRevalidate: {
    mode: 'stale-while-revalidate',
    maxStaleTime: 60 * 60 * 1000, // 1 hour
    revalidateInBackground: true,
    updateCacheOnRevalidation: true,
  },

  // Fastest: Race network and cache, use the fastest
  fastest: {
    mode: 'fastest',
    raceTimeout: 1000,
    preferNetwork: false,
    updateSlowerSource: true,
  },
};

/**
 * Compression strategies for different data types
 */
export const compressionStrategies = {
  // JSON data compression
  json: {
    algorithm: 'gzip',
    threshold: 1024, // 1KB
    level: 6,
  },

  // Image compression
  image: {
    algorithm: 'webp',
    quality: 0.8,
    threshold: 50 * 1024, // 50KB
  },

  // Text compression
  text: {
    algorithm: 'gzip',
    threshold: 512, // 512 bytes
    level: 9,
  },

  // Binary data
  binary: {
    algorithm: 'lz4',
    threshold: 2048, // 2KB
    level: 4,
  },
};

/**
 * Eviction policies
 */
export const evictionPolicies = {
  // Least Recently Used
  lru: (entries) => {
    return entries.sort((a, b) => a.lastAccessed - b.lastAccessed);
  },

  // Least Frequently Used
  lfu: (entries) => {
    return entries.sort((a, b) => a.accessCount - b.accessCount);
  },

  // First In, First Out
  fifo: (entries) => {
    return entries.sort((a, b) => a.timestamp - b.timestamp);
  },

  // Time To Live based
  ttl: (entries) => {
    const now = Date.now();
    return entries.sort((a, b) => {
      const aExpiry = a.timestamp + a.ttl;
      const bExpiry = b.timestamp + b.ttl;
      return aExpiry - bExpiry;
    });
  },

  // Priority based
  priority: (entries) => {
    const priorityWeight = { low: 1, normal: 2, high: 3, critical: 4 };
    return entries.sort((a, b) => {
      const aPriority = priorityWeight[a.priority || 'normal'];
      const bPriority = priorityWeight[b.priority || 'normal'];

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      // If same priority, use LRU
      return a.lastAccessed - b.lastAccessed;
    });
  },

  // Size based (remove largest first)
  size: (entries) => {
    return entries.sort((a, b) => b.size - a.size);
  },

  // Random eviction
  random: (entries) => {
    return entries.sort(() => Math.random() - 0.5);
  },
};

/**
 * Cache entry metadata schemas
 */
export const metadataSchemas = {
  basic: {
    timestamp: 'number',
    ttl: 'number',
    size: 'number',
  },

  extended: {
    timestamp: 'number',
    ttl: 'number',
    size: 'number',
    accessCount: 'number',
    lastAccessed: 'number',
    priority: 'string',
    tags: 'array',
  },

  advanced: {
    timestamp: 'number',
    ttl: 'number',
    size: 'number',
    accessCount: 'number',
    lastAccessed: 'number',
    priority: 'string',
    tags: 'array',
    version: 'string',
    dependencies: 'array',
    checksum: 'string',
    compressed: 'boolean',
    encrypted: 'boolean',
  },
};

/**
 * Performance optimization strategies
 */
export const performanceStrategies = {
  // Batch operations for better performance
  batching: {
    enabled: true,
    batchSize: 10,
    batchTimeout: 100, // ms
  },

  // Use web workers for heavy operations
  webWorkers: {
    enabled: false, // Disabled by default
    operations: ['compression', 'encryption', 'serialization'],
  },

  // Background operations
  background: {
    enabled: true,
    operations: ['cleanup', 'warming', 'revalidation'],
    scheduler: 'idle', // 'idle' | 'interval' | 'manual'
  },

  // Lazy loading
  lazyLoading: {
    enabled: true,
    threshold: 0.1, // Load when 10% into viewport
    rootMargin: '50px',
  },
};

/**
 * Default configuration combining all strategies
 */
export const defaultConfig = {
  cache: cacheStrategies.default,
  invalidation: invalidationStrategies.ttl,
  warming: warmingStrategies.startup,
  network: networkStrategies.staleWhileRevalidate,
  compression: compressionStrategies.json,
  eviction: evictionPolicies.lru,
  metadata: metadataSchemas.extended,
  performance: performanceStrategies,
};

/**
 * Strategy selector based on data type and context
 */
export function selectStrategy(dataType, context = {}) {
  const { size, frequency, importance, networkCondition } = context;

  // Large files
  if (size > 10 * 1024 * 1024) { // > 10MB
    return cacheStrategies.large;
  }

  // Critical data
  if (importance === 'critical') {
    return cacheStrategies.critical;
  }

  // Frequently accessed data
  if (frequency === 'high') {
    return cacheStrategies.fast;
  }

  // User preferences
  if (dataType === 'preferences' || dataType === 'settings') {
    return cacheStrategies.persistent;
  }

  // API responses
  if (dataType === 'api') {
    return cacheStrategies.api;
  }

  // Temporary data
  if (dataType === 'temporary') {
    return cacheStrategies.temporary;
  }

  // Offline scenarios
  if (networkCondition === 'offline' || networkCondition === 'poor') {
    return cacheStrategies.offline;
  }

  // Default fallback
  return cacheStrategies.default;
}

/**
 * Strategy validator
 */
export function validateStrategy(strategy) {
  const required = ['layers', 'ttl', 'maxSize', 'evictionPolicy'];
  const missing = required.filter(field => !(field in strategy));

  if (missing.length > 0) {
    throw new Error(`Invalid cache strategy: missing fields ${missing.join(', ')}`);
  }

  if (!Array.isArray(strategy.layers) || strategy.layers.length === 0) {
    throw new Error('Cache strategy must specify at least one layer');
  }

  if (typeof strategy.ttl !== 'number' || strategy.ttl <= 0) {
    throw new Error('Cache strategy TTL must be a positive number');
  }

  if (typeof strategy.maxSize !== 'number' || strategy.maxSize <= 0) {
    throw new Error('Cache strategy maxSize must be a positive number');
  }

  if (!(strategy.evictionPolicy in evictionPolicies)) {
    throw new Error(`Unknown eviction policy: ${strategy.evictionPolicy}`);
  }

  return true;
}

export default {
  cacheStrategies,
  invalidationStrategies,
  warmingStrategies,
  networkStrategies,
  compressionStrategies,
  evictionPolicies,
  metadataSchemas,
  performanceStrategies,
  defaultConfig,
  selectStrategy,
  validateStrategy,
};