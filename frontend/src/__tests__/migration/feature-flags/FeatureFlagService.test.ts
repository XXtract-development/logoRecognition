/**
 * Feature Flag Service test suite
 * @module FeatureFlagServiceTests
 */

import { FeatureFlagService } from '../../../migration.disabled/feature-flags/FeatureFlagService';
import { CircuitState } from '../../../migration.disabled/feature-flags/types';

// Mock fetch and WebSocket
global.fetch = jest.fn();

// Track WebSocket instances
const mockWebSocketInstances: any[] = [];

// Create a more complete WebSocket mock
class WebSocketMock {
  url: string;
  readyState: number = 0;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  static instances: WebSocketMock[] = [];

  constructor(url: string) {
    this.url = url;
    WebSocketMock.instances.push(this);
    mockWebSocketInstances.push(this);

    // Simulate connection after a delay
    setTimeout(() => {
      this.readyState = 1;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 0);
  }

  send = jest.fn();
  close = jest.fn(() => {
    this.readyState = 3;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  });

  static clear() {
    WebSocketMock.instances = [];
  }
}

// Set the mock globally
(global as any).WebSocket = jest.fn((url: string) => new WebSocketMock(url));

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn()
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true
});

// Mock console methods to reduce noise in tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe('FeatureFlagService', () => {
  let service: FeatureFlagService;

  beforeAll(() => {
    console.log = jest.fn();
    console.error = jest.fn();
  });

  afterAll(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();

    // Clear WebSocket instances
    mockWebSocketInstances.length = 0;
    WebSocketMock.clear();

    // Reset fetch mock
    (global.fetch as jest.Mock).mockReset();

    // Reset localStorage mock
    localStorageMock.getItem.mockReset();
    localStorageMock.setItem.mockReset();
    localStorageMock.removeItem.mockReset();
    localStorageMock.clear.mockReset();

    service = new FeatureFlagService({
      apiUrl: '/api/feature-flags',
      wsUrl: 'ws://localhost:8080/feature-flags',
      pollingInterval: 30000,
      cacheTimeout: 5000,
      analyticsEnabled: true,
      persistenceEnabled: true
    });
  });

  afterEach(() => {
    if (service) {
      service.destroy();
    }
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Initialization', () => {
    test('should initialize service successfully', async () => {
      const mockFlags = {
        'migration.upload.enabled': true,
        'migration.upload.rollout': 50
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockFlags
      });

      await service.initialize();

      expect(global.fetch).toHaveBeenCalledWith('/api/feature-flags');
      expect(service.getValue('migration.upload.enabled')).toBe(true);
      expect(service.getValue('migration.upload.rollout')).toBe(50);
    });

    test('should load persisted flags from localStorage', async () => {
      const persistedFlags = {
        flags: {
          'migration.upload.enabled': false,
          'features.bulkUpload.enabled': true
        },
        timestamp: Date.now()
      };

      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(persistedFlags));

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 'migration.annotation.enabled': true })
      });

      await service.initialize();

      expect(localStorageMock.getItem).toHaveBeenCalledWith('feature_flags');
      // Should have both persisted and fetched flags
      expect(service.getValue('migration.upload.enabled')).toBe(false);
      expect(service.getValue('features.bulkUpload.enabled')).toBe(true);
      expect(service.getValue('migration.annotation.enabled')).toBe(true);
    });

    test('should handle initialization failure gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      // Should use persisted flags as fallback
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify({
        flags: { 'migration.upload.enabled': true },
        timestamp: Date.now()
      }));

      await service.initialize();

      // Service should still be initialized with persisted flags
      expect(service.getValue('migration.upload.enabled')).toBe(true);
    });

    test('should not reinitialize if already initialized', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({})
      });

      await service.initialize();
      const firstCallCount = (global.fetch as jest.Mock).mock.calls.length;

      await service.initialize(); // Second call

      expect((global.fetch as jest.Mock).mock.calls.length).toBe(firstCallCount);
    });

    test('should handle corrupted localStorage data', async () => {
      localStorageMock.getItem.mockReturnValueOnce('corrupted-json-data');

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 'migration.upload.enabled': true })
      });

      await service.initialize();

      // Should continue with fetched flags despite corrupted storage
      expect(service.getValue('migration.upload.enabled')).toBe(true);
    });
  });

  describe('Flag Evaluation', () => {
    beforeEach(async () => {
      const mockFlags = {
        'migration.upload.enabled': true,
        'migration.upload.rollout': 75,
        'features.bulkUpload.enabled': false,
        'perf.lazyLoading.enabled': true
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockFlags
      });

      await service.initialize();
    });

    test('should evaluate boolean flags correctly', () => {
      expect(service.isEnabled('migration.upload.enabled')).toBe(true);
      expect(service.isEnabled('features.bulkUpload.enabled')).toBe(false);
      expect(service.isEnabled('perf.lazyLoading.enabled')).toBe(true);
    });

    test('should return flag value with correct type', () => {
      expect(service.getValue('migration.upload.rollout')).toBe(75);
      expect(service.getValue('migration.upload.enabled')).toBe(true);
      expect(typeof service.getValue('migration.upload.rollout')).toBe('number');
      expect(typeof service.getValue('migration.upload.enabled')).toBe('boolean');
    });

    test('should evaluate with user context for percentage rollouts', () => {
      const userContext1 = {
        userId: 'user1',
        percentageBucket: 50
      };

      const userContext2 = {
        userId: 'user2',
        percentageBucket: 80
      };

      // Use getEvaluatedValue for rollout evaluation
      const eval1 = service.evaluate('migration.upload.rollout', userContext1);
      const eval2 = service.evaluate('migration.upload.rollout', userContext2);

      expect(eval1.value).toBe(true); // 50 < 75
      expect(eval1.reason).toBe('rollout');
      expect(eval2.value).toBe(false); // 80 >= 75
      expect(eval2.reason).toBe('rollout');
    });

    test('should return false for non-existent flags', () => {
      expect(service.isEnabled('non.existent.flag' as any)).toBe(false);

      const evaluation = service.evaluate('non.existent.flag' as any);
      expect(evaluation.value).toBe(false);
      expect(evaluation.reason).toBe('default');
    });

    test('should cache evaluation results', () => {
      // First evaluation
      const result1 = service.evaluate('migration.upload.enabled');
      const timestamp1 = result1.timestamp;

      // Second evaluation immediately after (should use cache)
      const result2 = service.evaluate('migration.upload.enabled');

      // Both should return same value
      expect(result1.value).toBe(result2.value);

      // Fast-forward past cache timeout
      jest.advanceTimersByTime(6000);

      // Third evaluation (cache expired, new evaluation)
      const result3 = service.evaluate('migration.upload.enabled');

      expect(result3.value).toBe(result1.value);
      expect(result3.timestamp).toBeGreaterThan(timestamp1);
    });

    test('should handle consistent user bucketing', () => {
      // User without explicit bucket should get consistent results
      const userContext = {
        userId: 'consistent-user-123',
        email: 'user@test.com'
      };

      // Multiple evaluations should return the same result
      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(service.evaluate('migration.upload.rollout', userContext).value);
      }

      // All results should be the same (consistent hashing)
      const firstResult = results[0];
      expect(results.every(r => r === firstResult)).toBe(true);
    });
  });

  describe('Flag Updates', () => {
    beforeEach(async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

      await service.initialize();
    });

    test('should update flags dynamically', () => {
      service.updateFlags({
        'migration.upload.enabled': true,
        'features.bulkUpload.enabled': true,
        'migration.upload.rollout': 100
      });

      expect(service.isEnabled('migration.upload.enabled')).toBe(true);
      expect(service.isEnabled('features.bulkUpload.enabled')).toBe(true);
      expect(service.getValue('migration.upload.rollout')).toBe(100);
    });

    test('should persist flag updates to localStorage', () => {
      service.updateFlags({
        'migration.upload.enabled': true
      });

      expect(localStorageMock.setItem).toHaveBeenCalled();
      const call = localStorageMock.setItem.mock.calls[0];
      expect(call[0]).toBe('feature_flags');

      const stored = JSON.parse(call[1]);
      expect(stored.flags).toHaveProperty('migration.upload.enabled', true);
      expect(stored.timestamp).toBeDefined();
    });

    test('should notify callbacks on flag updates', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      const unsubscribe1 = service.onFlagUpdate(callback1);
      const unsubscribe2 = service.onFlagUpdate(callback2);

      service.updateFlags({
        'migration.upload.enabled': true
      });

      expect(callback1).toHaveBeenCalledWith(
        expect.objectContaining({
          'migration.upload.enabled': true
        })
      );
      expect(callback2).toHaveBeenCalledWith(
        expect.objectContaining({
          'migration.upload.enabled': true
        })
      );

      // Test unsubscribe
      unsubscribe1();

      service.updateFlags({
        'migration.upload.enabled': false
      });

      // First callback should not be called after unsubscribe
      expect(callback1).toHaveBeenCalledTimes(1);
      // Second callback should still be called
      expect(callback2).toHaveBeenCalledTimes(2);

      unsubscribe2();
    });

    test('should clear cache on flag updates', () => {
      // Evaluate to populate cache
      service.evaluate('migration.upload.enabled');

      // Update flags
      service.updateFlags({
        'migration.upload.enabled': false
      });

      // Should get new value, not cached
      expect(service.isEnabled('migration.upload.enabled')).toBe(false);
    });

    test('should handle localStorage quota exceeded', () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('QuotaExceededError');
      });

      // Should not throw when updating flags
      expect(() => {
        service.updateFlags({
          'migration.upload.enabled': true
        });
      }).not.toThrow();

      // Flag should still be updated in memory
      expect(service.isEnabled('migration.upload.enabled')).toBe(true);
    });
  });

  describe('Circuit Breaker Integration', () => {
    beforeEach(async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          'migration.upload.enabled': true,
          'migration.annotation.enabled': true
        })
      });

      await service.initialize();
    });

    test('should get circuit breaker state for critical flags', () => {
      const state = service.getCircuitState('migration.upload.enabled');
      expect(state).toBe(CircuitState.CLOSED);

      // Non-critical flag should also return CLOSED (no breaker)
      const nonCriticalState = service.getCircuitState('features.bulkUpload.enabled');
      expect(nonCriticalState).toBe(CircuitState.CLOSED);
    });

    test('should report errors to circuit breaker', () => {
      const error = new Error('Component render error');

      // Report multiple errors to trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        service.reportError('migration.upload.enabled', error);
      }

      const state = service.getCircuitState('migration.upload.enabled');
      expect(state).toBe(CircuitState.OPEN);
    });

    test('should disable flag when circuit is open', () => {
      const error = new Error('Critical error');

      // Initially enabled
      expect(service.isEnabled('migration.upload.enabled')).toBe(true);

      // Trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        service.reportError('migration.upload.enabled', error);
      }

      // Should be disabled due to circuit breaker
      const evaluation = service.evaluate('migration.upload.enabled');
      expect(evaluation.value).toBe(false);
      expect(evaluation.reason).toBe('circuit_breaker');
    });

    test('should recover circuit breaker after timeout', () => {
      jest.useFakeTimers();

      const error = new Error('Temporary error');

      // Open circuit
      for (let i = 0; i < 5; i++) {
        service.reportError('migration.upload.enabled', error);
      }

      expect(service.getCircuitState('migration.upload.enabled')).toBe(CircuitState.OPEN);

      // Fast-forward past reset timeout (60 seconds)
      jest.advanceTimersByTime(61000);

      // Circuit should be in half-open state
      expect(service.getCircuitState('migration.upload.enabled')).toBe(CircuitState.HALF_OPEN);
    });

    test('should not affect non-critical flags without circuit breaker', () => {
      const error = new Error('Non-critical error');

      // Report errors for non-critical flag
      for (let i = 0; i < 10; i++) {
        service.reportError('features.bulkUpload.enabled', error);
      }

      // Should not affect the flag evaluation (no circuit breaker)
      service.updateFlags({ 'features.bulkUpload.enabled': true });
      expect(service.isEnabled('features.bulkUpload.enabled')).toBe(true);
    });
  });

  describe('Real-time Updates', () => {
    test('should setup WebSocket connection', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

      await service.initialize();

      // WebSocket constructor should have been called
      expect(global.WebSocket).toHaveBeenCalledWith('ws://localhost:8080/feature-flags');
      expect(mockWebSocketInstances.length).toBe(1);
    });

    test('should process WebSocket messages', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 'migration.upload.enabled': false })
      });

      await service.initialize();

      // Get WebSocket instance
      const ws = mockWebSocketInstances[0];

      // Simulate WebSocket message
      if (ws && ws.onmessage) {
        ws.onmessage(new MessageEvent('message', {
          data: JSON.stringify({
            'migration.upload.enabled': true,
            'features.bulkUpload.enabled': true
          })
        }));
      }

      // Flags should be updated
      expect(service.isEnabled('migration.upload.enabled')).toBe(true);
      expect(service.isEnabled('features.bulkUpload.enabled')).toBe(true);
    });

    test('should handle invalid WebSocket messages', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

      await service.initialize();

      const ws = mockWebSocketInstances[0];

      // Send invalid JSON
      if (ws && ws.onmessage) {
        ws.onmessage(new MessageEvent('message', {
          data: 'invalid-json-{{'
        }));
      }

      // Should not crash
      expect(service.isEnabled('migration.upload.enabled')).toBe(false);
    });

    test('should fallback to polling on WebSocket error', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ 'migration.upload.enabled': false })
      });

      await service.initialize();

      const ws = mockWebSocketInstances[0];

      // Clear previous fetch calls
      (global.fetch as jest.Mock).mockClear();

      // Trigger WebSocket error
      if (ws && ws.onerror) {
        ws.onerror(new Event('error'));
      }

      // Fast-forward to trigger polling
      jest.advanceTimersByTime(30000);

      // Should have made a polling fetch call
      expect(global.fetch).toHaveBeenCalledWith('/api/feature-flags');
    });

    test('should fallback to polling on WebSocket close', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({})
      });

      await service.initialize();

      const ws = mockWebSocketInstances[0];

      // Clear previous fetch calls
      (global.fetch as jest.Mock).mockClear();

      // Close WebSocket
      if (ws) {
        ws.close();
      }

      // Fast-forward to trigger polling
      jest.advanceTimersByTime(30000);

      // Should have made a polling fetch call
      expect(global.fetch).toHaveBeenCalledWith('/api/feature-flags');
    });

    test('should not create duplicate polling intervals', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({})
      });

      await service.initialize();

      const ws = mockWebSocketInstances[0];

      // Clear fetch calls
      (global.fetch as jest.Mock).mockClear();

      // Trigger multiple errors
      if (ws && ws.onerror) {
        ws.onerror(new Event('error'));
        ws.onerror(new Event('error'));
        ws.onerror(new Event('error'));
      }

      // Fast-forward
      jest.advanceTimersByTime(30000);

      // Should only make one polling call despite multiple errors
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Performance', () => {
    test('should evaluate flags quickly', async () => {
      const mockFlags: any = {};
      for (let i = 0; i < 100; i++) {
        mockFlags[`flag.${i}`] = i % 2 === 0;
      }

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockFlags
      });

      await service.initialize();

      const start = performance.now();

      // Evaluate many flags
      for (let i = 0; i < 1000; i++) {
        service.isEnabled(`flag.${i % 100}` as any);
      }

      const end = performance.now();
      const duration = end - start;

      // Should complete in less than 100ms
      expect(duration).toBeLessThan(100);
    });

    test('should handle concurrent evaluations efficiently', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          'migration.upload.enabled': true,
          'migration.upload.rollout': 50
        })
      });

      await service.initialize();

      // Simulate concurrent evaluations
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          new Promise(resolve => {
            const result = service.evaluate('migration.upload.enabled');
            resolve(result);
          })
        );
      }

      const results = await Promise.all(promises);

      // All evaluations should succeed
      expect(results).toHaveLength(100);
      expect(results.every((r: any) => r.value === true)).toBe(true);
    });

    test('should efficiently cache flag evaluations', () => {
      service.updateFlags({
        'test.flag.1': true,
        'test.flag.2': false,
        'test.flag.3': true
      });

      // First round of evaluations (cache miss)
      const start1 = performance.now();
      for (let i = 0; i < 100; i++) {
        service.evaluate('test.flag.1' as any);
      }
      const duration1 = performance.now() - start1;

      // Second round (should use cache)
      const start2 = performance.now();
      for (let i = 0; i < 100; i++) {
        service.evaluate('test.flag.1' as any);
      }
      const duration2 = performance.now() - start2;

      // Cached evaluations should be at least as fast (allowing for timing variations)
      expect(duration2).toBeLessThanOrEqual(duration1 * 1.5);
    });
  });

  describe('Cleanup', () => {
    test('should clean up resources on destroy', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

      await service.initialize();

      const ws = mockWebSocketInstances[0];

      // Set up a polling interval by triggering error
      if (ws && ws.onerror) {
        ws.onerror(new Event('error'));
      }

      // Destroy service
      service.destroy();

      // WebSocket should be closed
      if (ws) {
        expect(ws.close).toHaveBeenCalled();
      }

      // Clear intervals and verify no more polling
      (global.fetch as jest.Mock).mockClear();
      jest.advanceTimersByTime(60000);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('should handle destroy when not initialized', () => {
      // Should not throw
      expect(() => service.destroy()).not.toThrow();
    });

    test('should clear all callbacks on destroy', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

      await service.initialize();

      const callback = jest.fn();
      service.onFlagUpdate(callback);

      service.destroy();

      // Try to update flags after destroy
      service.updateFlags({ 'test.flag': true });

      // Callback should not be called
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should handle API errors gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await service.initialize();

      // Service should still be usable with default values
      expect(service.isEnabled('migration.upload.enabled')).toBe(false);
    });

    test('should handle JSON parse errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        }
      });

      await service.initialize();

      // Service should still be usable
      expect(service.isEnabled('migration.upload.enabled')).toBe(false);
    });

    test('should handle network timeouts', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        new Promise((resolve, reject) => {
          setTimeout(() => reject(new Error('Network timeout')), 5000);
        })
      );

      const initPromise = service.initialize();

      // Fast-forward timers
      jest.advanceTimersByTime(6000);

      await initPromise;

      // Service should still be initialized
      expect(service.isEnabled('migration.upload.enabled')).toBe(false);
    });
  });
});