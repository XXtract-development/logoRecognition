/**
 * Utility functions for feature flag system
 * @module FeatureFlagUtils
 */

/**
 * Hashes a string to a consistent number for bucketing
 * @param {string} str - The string to hash
 * @returns {number} A consistent hash value
 */
export function hashString(str: string): number {
  let hash = 0;
  if (str.length === 0) return hash;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return Math.abs(hash);
}

/**
 * Validates a feature flag key format
 * @param {string} key - The flag key to validate
 * @returns {boolean} True if valid
 */
export function isValidFlagKey(key: string): boolean {
  // Flag keys should follow dot notation pattern
  const pattern = /^[a-z]+(\.[a-z]+)*$/i;
  return pattern.test(key);
}

/**
 * Parses a flag key to extract namespace and name
 * @param {string} key - The flag key to parse
 * @returns {Object} Parsed namespace and name
 */
export function parseFlagKey(key: string): { namespace: string; name: string } {
  const parts = key.split('.');
  const name = parts.pop() || '';
  const namespace = parts.join('.');
  return { namespace, name };
}

/**
 * Creates a flag key from namespace and name
 * @param {string} namespace - The flag namespace
 * @param {string} name - The flag name
 * @returns {string} The combined flag key
 */
export function createFlagKey(namespace: string, name: string): string {
  return namespace ? `${namespace}.${name}` : name;
}

/**
 * Checks if a user matches targeting rules
 * @param {any} userContext - User context to check
 * @param {any[]} rules - Targeting rules
 * @returns {boolean} True if user matches rules
 */
export function matchesTargetingRules(userContext: any, rules: any[]): boolean {
  if (!rules || rules.length === 0) return true;
  if (!userContext) return false;

  return rules.every(rule => {
    const userValue = getNestedValue(userContext, rule.attribute);

    switch (rule.operator) {
      case 'equals':
        return userValue === rule.value;
      case 'contains':
        return String(userValue).includes(String(rule.value));
      case 'in':
        return Array.isArray(rule.value) && rule.value.includes(userValue);
      case 'greaterThan':
        return Number(userValue) > Number(rule.value);
      case 'lessThan':
        return Number(userValue) < Number(rule.value);
      default:
        return false;
    }
  });
}

/**
 * Gets a nested value from an object using dot notation
 * @param {any} obj - The object to get value from
 * @param {string} path - The path in dot notation
 * @returns {any} The value at the path
 */
export function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Debounces a function call
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function(...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttles a function call
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false;

  return function(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Creates an exponential backoff delay
 * @param {number} attempt - The attempt number (starting from 0)
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} maxDelay - Maximum delay in milliseconds
 * @returns {number} Delay in milliseconds
 */
export function exponentialBackoff(
  attempt: number,
  baseDelay: number = 1000,
  maxDelay: number = 30000
): number {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 0.1 * delay;
  return delay + jitter;
}

/**
 * Validates flag configuration
 * @param {any} config - Configuration to validate
 * @returns {boolean} True if valid
 */
export function isValidFlagConfig(config: any): boolean {
  if (!config || typeof config !== 'object') return false;
  if (!config.key || !isValidFlagKey(config.key)) return false;
  if (config.defaultValue === undefined) return false;

  // Validate targeting rules if present
  if (config.targetingRules) {
    if (!Array.isArray(config.targetingRules)) return false;
    for (const rule of config.targetingRules) {
      if (!rule.attribute || !rule.operator || rule.value === undefined) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Merges flag configurations with defaults
 * @param {any} config - User configuration
 * @param {any} defaults - Default configuration
 * @returns {any} Merged configuration
 */
export function mergeFlagConfig(config: any, defaults: any): any {
  return {
    ...defaults,
    ...config,
    targetingRules: config.targetingRules || defaults.targetingRules || [],
    circuitBreakerEnabled: config.circuitBreakerEnabled ?? defaults.circuitBreakerEnabled ?? false
  };
}

/**
 * Formats a flag value for display
 * @param {any} value - The value to format
 * @returns {string} Formatted string
 */
export function formatFlagValue(value: any): string {
  if (typeof value === 'boolean') {
    return value ? 'Enabled' : 'Disabled';
  }
  if (typeof value === 'number') {
    return `${value}%`;
  }
  return String(value);
}

/**
 * Gets flag metadata for display
 * @param {string} key - The flag key
 * @returns {Object} Flag metadata
 */
export function getFlagMetadata(key: string): {
  category: string;
  name: string;
  isCritical: boolean;
  isRollout: boolean;
} {
  const { namespace, name } = parseFlagKey(key);

  return {
    category: namespace || 'general',
    name: name,
    isCritical: namespace === 'migration',
    isRollout: name === 'rollout'
  };
}