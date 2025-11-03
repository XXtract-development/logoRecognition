/**
 * Circuit Breaker implementation for feature flag system
 * @module CircuitBreaker
 */

import { CircuitState, CircuitBreakerConfig } from './types';

/**
 * Circuit Breaker class for automatic rollback on errors
 * @class CircuitBreaker
 * @description Implements the circuit breaker pattern to automatically disable features
 * when error thresholds are exceeded, preventing cascade failures
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private errorCount: number = 0;
  private lastErrorTime: number = 0;
  private lastStateChange: number = Date.now();
  private nextAttempt: number = 0;
  private config: Required<CircuitBreakerConfig>;

  /**
   * Creates a new CircuitBreaker instance
   * @param {CircuitBreakerConfig} config - Circuit breaker configuration
   */
  constructor(config: CircuitBreakerConfig) {
    this.config = {
      errorThreshold: config.errorThreshold || 5,
      resetTimeout: config.resetTimeout || 60000,
      monitoringWindow: config.monitoringWindow || 5000,
      onOpen: config.onOpen || (() => {}),
      onClose: config.onClose || (() => {}),
      onHalfOpen: config.onHalfOpen || (() => {})
    };
  }

  /**
   * Gets the current state of the circuit breaker
   * @returns {CircuitState} The current circuit state
   */
  public getState(): CircuitState {
    this.checkStateTransition();
    return this.state;
  }

  /**
   * Records a successful operation
   * @returns {void}
   */
  public recordSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.close();
    }
    // Reset error count on success in closed state
    if (this.state === CircuitState.CLOSED) {
      this.errorCount = 0;
    }
  }

  /**
   * Records an error and potentially opens the circuit
   * @param {Error} error - The error that occurred
   * @returns {void}
   */
  public recordError(error: Error): void {
    const now = Date.now();

    // Reset error count if outside monitoring window
    if (now - this.lastErrorTime > this.config.monitoringWindow) {
      this.errorCount = 1;
    } else {
      this.errorCount++;
    }

    this.lastErrorTime = now;

    // Check if we should open the circuit
    if (this.errorCount >= this.config.errorThreshold && this.state === CircuitState.CLOSED) {
      this.open();
    }

    // If in half-open state, immediately re-open
    if (this.state === CircuitState.HALF_OPEN) {
      this.open();
    }
  }

  /**
   * Attempts to execute an operation through the circuit breaker
   * @param {() => T} operation - The operation to execute
   * @returns {T} The result of the operation
   * @throws {Error} When circuit is open or operation fails
   * @template T
   */
  public async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.checkStateTransition();

    if (this.state === CircuitState.OPEN) {
      throw new Error('Circuit breaker is OPEN - feature disabled for safety');
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordError(error as Error);
      throw error;
    }
  }

  /**
   * Checks if the circuit can be used (not open)
   * @returns {boolean} True if circuit allows operations
   */
  public canExecute(): boolean {
    this.checkStateTransition();
    return this.state !== CircuitState.OPEN;
  }

  /**
   * Opens the circuit breaker
   * @private
   */
  private open(): void {
    if (this.state !== CircuitState.OPEN) {
      this.state = CircuitState.OPEN;
      this.lastStateChange = Date.now();
      this.nextAttempt = Date.now() + this.config.resetTimeout;
      this.config.onOpen();
      console.error('[CircuitBreaker] Circuit OPENED due to excessive errors');
    }
  }

  /**
   * Closes the circuit breaker
   * @private
   */
  private close(): void {
    if (this.state !== CircuitState.CLOSED) {
      this.state = CircuitState.CLOSED;
      this.lastStateChange = Date.now();
      this.errorCount = 0;
      this.config.onClose();
      console.log('[CircuitBreaker] Circuit CLOSED - normal operation resumed');
    }
  }

  /**
   * Transitions to half-open state
   * @private
   */
  private halfOpen(): void {
    if (this.state !== CircuitState.HALF_OPEN) {
      this.state = CircuitState.HALF_OPEN;
      this.lastStateChange = Date.now();
      this.config.onHalfOpen();
      console.log('[CircuitBreaker] Circuit HALF-OPEN - testing recovery');
    }
  }

  /**
   * Checks and performs state transitions based on timeouts
   * @private
   */
  private checkStateTransition(): void {
    const now = Date.now();

    if (this.state === CircuitState.OPEN && now >= this.nextAttempt) {
      this.halfOpen();
    }
  }

  /**
   * Resets the circuit breaker to closed state
   * @returns {void}
   */
  public reset(): void {
    this.state = CircuitState.CLOSED;
    this.errorCount = 0;
    this.lastErrorTime = 0;
    this.lastStateChange = Date.now();
    console.log('[CircuitBreaker] Circuit manually RESET');
  }

  /**
   * Gets circuit breaker statistics
   * @returns {Object} Statistics about the circuit breaker
   */
  public getStats(): {
    state: CircuitState;
    errorCount: number;
    lastStateChange: number;
    timeSinceLastError: number;
  } {
    return {
      state: this.state,
      errorCount: this.errorCount,
      lastStateChange: this.lastStateChange,
      timeSinceLastError: this.lastErrorTime ? Date.now() - this.lastErrorTime : 0
    };
  }
}

/**
 * Default circuit breaker configuration for critical features
 * @const CRITICAL_FLAGS_CONFIG
 */
export const CRITICAL_FLAGS_CONFIG: CircuitBreakerConfig = {
  errorThreshold: 5,
  resetTimeout: 60000,
  monitoringWindow: 5000,
  onOpen: () => {
    console.error('[CircuitBreaker] Critical feature disabled - automatic rollback initiated');
    // Analytics would be tracked here in production
  },
  onClose: () => {
    console.log('[CircuitBreaker] Feature re-enabled after successful recovery');
  },
  onHalfOpen: () => {
    console.log('[CircuitBreaker] Testing feature recovery...');
  }
};