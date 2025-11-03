/**
 * Circuit Breaker test suite
 * @module CircuitBreakerTests
 */

import { CircuitBreaker } from '../../../migration.disabled/feature-flags/CircuitBreaker';
import { CircuitState, CircuitBreakerConfig } from '../../../migration.disabled/feature-flags/types';

// Increase timeout for async tests
jest.setTimeout(10000);

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  let mockConfig: CircuitBreakerConfig;

  // Mock console to reduce noise
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;

  beforeAll(() => {
    console.error = jest.fn();
    console.log = jest.fn();
  });

  afterAll(() => {
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockConfig = {
      errorThreshold: 3,
      resetTimeout: 1000,
      monitoringWindow: 5000,
      onOpen: jest.fn(),
      onClose: jest.fn(),
      onHalfOpen: jest.fn()
    };

    circuitBreaker = new CircuitBreaker(mockConfig);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('State Transitions', () => {
    test('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    test('should open circuit after error threshold is reached', () => {
      const error = new Error('Test error');

      // Record errors up to threshold
      for (let i = 0; i < mockConfig.errorThreshold; i++) {
        circuitBreaker.recordError(error);
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      expect(mockConfig.onOpen).toHaveBeenCalledTimes(1);
    });

    test('should transition to HALF_OPEN after reset timeout', () => {
      const error = new Error('Test error');

      // Open the circuit
      for (let i = 0; i < mockConfig.errorThreshold; i++) {
        circuitBreaker.recordError(error);
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Fast-forward past reset timeout
      jest.advanceTimersByTime(mockConfig.resetTimeout + 1);

      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
      expect(mockConfig.onHalfOpen).toHaveBeenCalledTimes(1);
    });

    test('should close circuit on success in HALF_OPEN state', () => {
      const error = new Error('Test error');

      // Open the circuit
      for (let i = 0; i < mockConfig.errorThreshold; i++) {
        circuitBreaker.recordError(error);
      }

      // Move to half-open state
      jest.advanceTimersByTime(mockConfig.resetTimeout + 1);
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Record success
      circuitBreaker.recordSuccess();

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(mockConfig.onClose).toHaveBeenCalledTimes(1);
    });

    test('should re-open circuit on error in HALF_OPEN state', () => {
      const error = new Error('Test error');

      // Open the circuit
      for (let i = 0; i < mockConfig.errorThreshold; i++) {
        circuitBreaker.recordError(error);
      }

      // Move to half-open state
      jest.advanceTimersByTime(mockConfig.resetTimeout + 1);
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Record error in half-open state
      circuitBreaker.recordError(error);

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      // onOpen should be called twice (initial open + re-open)
      expect(mockConfig.onOpen).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Counting', () => {
    test('should reset error count after monitoring window', () => {
      const error = new Error('Test error');

      // Record some errors but not enough to open
      circuitBreaker.recordError(error);
      circuitBreaker.recordError(error);

      // Fast-forward past monitoring window
      jest.advanceTimersByTime(mockConfig.monitoringWindow + 1);

      // This should reset the count, so circuit should not open
      circuitBreaker.recordError(error);
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    test('should count errors within monitoring window', () => {
      const error = new Error('Test error');

      // Record errors quickly
      for (let i = 0; i < mockConfig.errorThreshold; i++) {
        circuitBreaker.recordError(error);
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });

    test('should not count errors outside monitoring window', () => {
      const error = new Error('Test error');

      // Record first error
      circuitBreaker.recordError(error);

      // Wait for monitoring window to pass
      jest.advanceTimersByTime(mockConfig.monitoringWindow + 1);

      // Record second error (count should reset)
      circuitBreaker.recordError(error);

      // Record third error
      circuitBreaker.recordError(error);

      // Should still be closed (only 2 errors in current window)
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('Execute Method', () => {
    test('should execute operation successfully when circuit is CLOSED', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const result = await circuitBreaker.execute(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should throw error when circuit is OPEN', async () => {
      const error = new Error('Test error');

      // Open the circuit
      for (let i = 0; i < mockConfig.errorThreshold; i++) {
        circuitBreaker.recordError(error);
      }

      const operation = jest.fn().mockResolvedValue('success');

      await expect(circuitBreaker.execute(operation)).rejects.toThrow(
        'Circuit breaker is OPEN - feature disabled for safety'
      );
      expect(operation).not.toHaveBeenCalled();
    });

    test('should record error when operation fails', async () => {
      const operationError = new Error('Operation failed');
      const operation = jest.fn().mockRejectedValue(operationError);

      // First execution - should fail but not open circuit
      await expect(circuitBreaker.execute(operation)).rejects.toThrow(operationError);
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);

      // Second execution - should fail
      await expect(circuitBreaker.execute(operation)).rejects.toThrow(operationError);
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);

      // Third execution - should fail and open circuit
      await expect(circuitBreaker.execute(operation)).rejects.toThrow(operationError);
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });

    test('should record success when operation succeeds', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(operation);

      // Error count should be reset
      const stats = circuitBreaker.getStats();
      expect(stats.errorCount).toBe(0);
    });

    test('should execute in HALF_OPEN state', async () => {
      const error = new Error('Test error');

      // Open circuit
      for (let i = 0; i < mockConfig.errorThreshold; i++) {
        circuitBreaker.recordError(error);
      }

      // Move to half-open
      jest.advanceTimersByTime(mockConfig.resetTimeout + 1);
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Should allow execution in half-open
      const operation = jest.fn().mockResolvedValue('success');
      const result = await circuitBreaker.execute(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalled();
      // Should close circuit after success
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('Can Execute', () => {
    test('should return true when circuit is CLOSED', () => {
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    test('should return false when circuit is OPEN', () => {
      const error = new Error('Test error');

      // Open the circuit
      for (let i = 0; i < mockConfig.errorThreshold; i++) {
        circuitBreaker.recordError(error);
      }

      expect(circuitBreaker.canExecute()).toBe(false);
    });

    test('should return true when circuit is HALF_OPEN', () => {
      const error = new Error('Test error');

      // Open the circuit
      for (let i = 0; i < mockConfig.errorThreshold; i++) {
        circuitBreaker.recordError(error);
      }

      // Move to half-open
      jest.advanceTimersByTime(mockConfig.resetTimeout + 1);

      expect(circuitBreaker.canExecute()).toBe(true);
    });
  });

  describe('Reset', () => {
    test('should reset circuit to CLOSED state', () => {
      const error = new Error('Test error');

      // Open the circuit
      for (let i = 0; i < mockConfig.errorThreshold; i++) {
        circuitBreaker.recordError(error);
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      const stats = circuitBreaker.getStats();
      expect(stats.errorCount).toBe(0);
    });

    test('should reset error count', () => {
      const error = new Error('Test error');

      // Record some errors
      circuitBreaker.recordError(error);
      circuitBreaker.recordError(error);

      let stats = circuitBreaker.getStats();
      expect(stats.errorCount).toBe(2);

      circuitBreaker.reset();

      stats = circuitBreaker.getStats();
      expect(stats.errorCount).toBe(0);
    });
  });

  describe('Get Stats', () => {
    test('should return circuit statistics', () => {
      const stats = circuitBreaker.getStats();

      expect(stats).toHaveProperty('state');
      expect(stats).toHaveProperty('errorCount');
      expect(stats).toHaveProperty('lastStateChange');
      expect(stats).toHaveProperty('timeSinceLastError');

      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.errorCount).toBe(0);
      expect(stats.timeSinceLastError).toBe(0);
    });

    test('should update stats after errors', () => {
      const error = new Error('Test error');
      circuitBreaker.recordError(error);

      const stats = circuitBreaker.getStats();
      expect(stats.errorCount).toBe(1);
      expect(stats.timeSinceLastError).toBeGreaterThanOrEqual(0);
    });

    test('should track state changes in stats', () => {
      const error = new Error('Test error');
      const initialStats = circuitBreaker.getStats();
      const initialStateChange = initialStats.lastStateChange;

      // Wait a bit to ensure time difference
      jest.advanceTimersByTime(100);

      // Open circuit
      for (let i = 0; i < mockConfig.errorThreshold; i++) {
        circuitBreaker.recordError(error);
      }

      const openStats = circuitBreaker.getStats();
      expect(openStats.state).toBe(CircuitState.OPEN);
      expect(openStats.lastStateChange).toBeGreaterThan(initialStateChange);
    });
  });

  describe('Success Handling', () => {
    test('should not affect closed circuit on success', () => {
      circuitBreaker.recordSuccess();
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);

      const stats = circuitBreaker.getStats();
      expect(stats.errorCount).toBe(0);
    });

    test('should reset error count on success in closed state', () => {
      const error = new Error('Test error');

      // Record some errors but not enough to open
      circuitBreaker.recordError(error);
      circuitBreaker.recordError(error);

      let stats = circuitBreaker.getStats();
      expect(stats.errorCount).toBe(2);

      // Record success
      circuitBreaker.recordSuccess();

      stats = circuitBreaker.getStats();
      expect(stats.errorCount).toBe(0);
    });
  });

  describe('Configuration', () => {
    test('should use default values for missing config', () => {
      const minimalCircuit = new CircuitBreaker({
        errorThreshold: 2
      });

      // Should have default values
      const stats = minimalCircuit.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);

      // Should still work with defaults
      minimalCircuit.recordError(new Error('Test'));
      minimalCircuit.recordError(new Error('Test'));
      expect(minimalCircuit.getState()).toBe(CircuitState.OPEN);
    });

    test('should respect custom configuration', () => {
      const customConfig: CircuitBreakerConfig = {
        errorThreshold: 1, // Open after 1 error
        resetTimeout: 500,
        monitoringWindow: 1000,
        onOpen: jest.fn()
      };

      const customCircuit = new CircuitBreaker(customConfig);

      // Should open after just one error
      customCircuit.recordError(new Error('Test'));
      expect(customCircuit.getState()).toBe(CircuitState.OPEN);
      expect(customConfig.onOpen).toHaveBeenCalled();
    });
  });
});