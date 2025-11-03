/**
 * Utility functions for API operations
 */

interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  retryCondition?: (error: any) => boolean;
}

/**
 * Exponential backoff retry wrapper for fetch operations
 * @param fn - The async function to retry
 * @param options - Retry configuration options
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
    retryCondition = (error) => {
      // Retry on network errors or 5xx server errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        return true;
      }
      if (error.status >= 500 && error.status < 600) {
        return true;
      }
      // Retry on 429 (Rate Limited)
      if (error.status === 429) {
        return true;
      }
      return false;
    },
  } = options;

  let lastError: any;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if we've exhausted attempts
      if (attempt === maxRetries) {
        break;
      }

      // Check if we should retry this error
      if (!retryCondition(error)) {
        throw error;
      }

      // Wait before retrying
      await sleep(Math.min(delay, maxDelay));

      // Increase delay for next attempt
      delay *= backoffFactor;

      console.log(`Retry attempt ${attempt + 1} after ${delay}ms delay`);
    }
  }

  throw lastError;
}

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Request deduplication cache
 */
const requestCache = new Map<string, Promise<any>>();
const CACHE_TTL = 5000; // 5 seconds

/**
 * Deduplicate concurrent identical requests
 * @param key - Unique key for the request
 * @param fn - The async function to execute
 */
export async function deduplicateRequest<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  // Check if we have a pending request
  if (requestCache.has(key)) {
    return requestCache.get(key) as Promise<T>;
  }

  // Create new request promise
  const promise = fn().finally(() => {
    // Clean up cache after TTL
    setTimeout(() => {
      requestCache.delete(key);
    }, CACHE_TTL);
  });

  // Store in cache
  requestCache.set(key, promise);

  return promise;
}

/**
 * Create an AbortController with timeout
 */
export function createTimeoutController(timeout: number = 30000): AbortController {
  const controller = new AbortController();

  setTimeout(() => {
    controller.abort(new Error(`Request timeout after ${timeout}ms`));
  }, timeout);

  return controller;
}