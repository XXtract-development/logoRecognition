/**
 * BaselineCapture Service Tests
 * Story: FE-001.0.1
 * Coverage Target: 100%
 */

import '../../../migration.disabled/setupTests';
import { BaselineService, PerformanceBaseline } from '../../../migration.disabled/performance/BaselineCapture';

// Mock performance API
const mockPerformanceEntry = {
  name: 'first-contentful-paint',
  entryType: 'paint',
  startTime: 2800,
  duration: 0,
};

const mockNavigationTiming = {
  name: 'https://example.com',
  entryType: 'navigation',
  startTime: 0,
  duration: 5000,
  fetchStart: 0,
  domInteractive: 4500,
  loadEventEnd: 5000,
  responseEnd: 500,
  responseStart: 200,
} as PerformanceNavigationTiming;

const mockResourceTiming = {
  name: 'https://example.com/static/js/main.chunk.js',
  entryType: 'resource',
  startTime: 100,
  duration: 300,
  fetchStart: 100,
  responseEnd: 400,
  responseStart: 200,
  transferSize: 1024000,
  encodedBodySize: 1024000,
} as PerformanceResourceTiming;

describe('BaselineService', () => {
  let service: BaselineService;
  let originalPerformance: Performance;
  let originalConsole: Console;

  beforeEach(() => {
    originalPerformance = window.performance;
    originalConsole = window.console;

    // Mock console methods
    window.console = {
      ...originalConsole,
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    // Mock localStorage
    const localStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
      length: 0,
      key: jest.fn(),
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    // Mock IndexedDB
    const indexedDBMock = {
      open: jest.fn(() => ({
        onsuccess: jest.fn(),
        onerror: jest.fn(),
        result: {
          transaction: jest.fn(() => ({
            objectStore: jest.fn(() => ({
              add: jest.fn(() => ({
                onsuccess: jest.fn(),
                onerror: jest.fn(),
              })),
            })),
          })),
        },
      })),
    };
    Object.defineProperty(window, 'indexedDB', {
      value: indexedDBMock,
      writable: true,
    });

    // Mock PerformanceObserver before creating service
    const mockObserver = {
      observe: jest.fn(),
      disconnect: jest.fn(),
    };
    global.PerformanceObserver = jest.fn(() => mockObserver) as any;

    // Mock performance API
    Object.defineProperty(window, 'performance', {
      value: {
        ...originalPerformance,
        getEntriesByType: jest.fn((type: string) => {
          switch (type) {
            case 'navigation':
              return [mockNavigationTiming];
            case 'paint':
              return [mockPerformanceEntry];
            case 'resource':
              return [mockResourceTiming];
            default:
              return [];
          }
        }),
        getEntriesByName: jest.fn(() => []),
        now: jest.fn(() => 1000),
        memory: {
          usedJSHeapSize: 450 * 1024 * 1024,
          totalJSHeapSize: 512 * 1024 * 1024,
          jsHeapSizeLimit: 1024 * 1024 * 1024,
        },
      },
      writable: true,
    });

    // Mock fetch
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response)
    );

    // Create service after all mocks are set up
    service = new BaselineService();
  });

  afterEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(window, 'performance', {
      value: originalPerformance,
      writable: true,
    });
    window.console = originalConsole;
    service.destroy();
  });

  describe('captureBaselines', () => {
    it('should capture performance baseline successfully', async () => {
      const baseline = await service.captureBaselines();

      expect(baseline).toBeDefined();
      expect(baseline.timestamp).toBeGreaterThan(0);
      expect(baseline.version).toBe('1.0.0');
      expect(baseline.metrics).toBeDefined();
    });

    it('should capture bundle metrics', async () => {
      const baseline = await service.captureBaselines();

      expect(baseline.metrics.bundle).toBeDefined();
      expect(baseline.metrics.bundle.total).toBeGreaterThan(0);
      expect(baseline.metrics.bundle.jsVsTs).toBeDefined();
      expect(baseline.metrics.bundle.jsVsTs.ratio).toBeGreaterThanOrEqual(0);
      expect(baseline.metrics.bundle.jsVsTs.ratio).toBeLessThanOrEqual(1);
    });

    it('should capture runtime metrics', async () => {
      const baseline = await service.captureBaselines();

      expect(baseline.metrics.runtime).toBeDefined();
      expect(baseline.metrics.runtime.fcp).toBeGreaterThan(0);
      expect(baseline.metrics.runtime.tti).toBeGreaterThan(0);
      expect(baseline.metrics.runtime.lcp).toBeGreaterThan(0);
      expect(baseline.metrics.runtime.cls).toBeGreaterThanOrEqual(0);
      expect(baseline.metrics.runtime.fid).toBeGreaterThan(0);
    });

    it('should capture memory metrics', async () => {
      const baseline = await service.captureBaselines();

      expect(baseline.metrics.memory).toBeDefined();
      expect(baseline.metrics.memory.heapUsed).toBeGreaterThan(0);
      expect(baseline.metrics.memory.heapTotal).toBeGreaterThan(0);
      expect(baseline.metrics.memory.heapUsed).toBeLessThanOrEqual(baseline.metrics.memory.heapTotal);
    });

    it('should capture API metrics with percentiles', async () => {
      const baseline = await service.captureBaselines();

      expect(baseline.metrics.api).toBeDefined();
      expect(baseline.metrics.api.uploadLatency).toBeDefined();
      expect(baseline.metrics.api.uploadLatency.p50).toBeGreaterThan(0);
      expect(baseline.metrics.api.uploadLatency.p95).toBeGreaterThan(0);
      expect(baseline.metrics.api.uploadLatency.p99).toBeGreaterThan(0);
      expect(baseline.metrics.api.uploadLatency.p50).toBeLessThanOrEqual(baseline.metrics.api.uploadLatency.p95);
      expect(baseline.metrics.api.uploadLatency.p95).toBeLessThanOrEqual(baseline.metrics.api.uploadLatency.p99);
    });

    it('should capture custom metrics', async () => {
      const baseline = await service.captureBaselines();

      expect(baseline.metrics.custom).toBeDefined();
      expect(baseline.metrics.custom.imageLoadTime).toBeGreaterThan(0);
      expect(baseline.metrics.custom.annotationRenderTime).toBeGreaterThan(0);
      expect(baseline.metrics.custom.navigationTransition).toBeGreaterThan(0);
      expect(baseline.metrics.custom.bulkUploadTime).toBeGreaterThan(0);
      expect(baseline.metrics.custom.canvasInitTime).toBeGreaterThan(0);
    });

    it('should capture Lighthouse scores', async () => {
      const baseline = await service.captureBaselines();

      expect(baseline.metrics.lighthouse).toBeDefined();
      expect(baseline.metrics.lighthouse.performance).toBeGreaterThanOrEqual(0);
      expect(baseline.metrics.lighthouse.performance).toBeLessThanOrEqual(100);
      expect(baseline.metrics.lighthouse.accessibility).toBeGreaterThanOrEqual(0);
      expect(baseline.metrics.lighthouse.accessibility).toBeLessThanOrEqual(100);
    });

    it('should capture user journeys', async () => {
      const baseline = await service.captureBaselines();

      expect(baseline.userJourneys).toBeDefined();
      expect(baseline.userJourneys.length).toBeGreaterThan(0);
      expect(baseline.userJourneys[0].name).toBeDefined();
      expect(baseline.userJourneys[0].duration).toBeGreaterThan(0);
      expect(baseline.userJourneys[0].steps).toBeGreaterThan(0);
    });

    it('should store baseline in localStorage', async () => {
      await service.captureBaselines();

      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        'performance_baselines',
        expect.any(String)
      );
    });

    it('should upload baseline to monitoring API', async () => {
      await service.captureBaselines();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/performance/baseline'),
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: expect.any(String),
        })
      );
    });
  });

  describe('compareWithBaseline', () => {
    it('should detect performance regressions', async () => {
      const previous: PerformanceBaseline = {
        timestamp: Date.now() - 3600000,
        version: '1.0.0',
        environment: 'development',
        metrics: {
          bundle: {
            total: 3000000,
            perRoute: {},
            chunkSizes: [],
            jsVsTs: { jsSize: 1800000, tsSize: 1200000, ratio: 0.4 },
          },
          runtime: {
            fcp: 2000,
            tti: 3500,
            lcp: 2500,
            cls: 0.08,
            fid: 80,
            inp: 150,
          },
          memory: {
            heapUsed: 300 * 1024 * 1024,
            heapTotal: 400 * 1024 * 1024,
            external: 50 * 1024 * 1024,
            arrayBuffers: 0,
            peakUsage: 350 * 1024 * 1024,
          },
          api: {
            uploadLatency: { p50: 200, p95: 600, p99: 1200 },
            fetchLatency: { p50: 80, p95: 250, p99: 500 },
            annotationSave: { p50: 120, p95: 350, p99: 700 },
            authenticationTime: { p50: 180, p95: 450, p99: 900 },
          },
          custom: {
            imageLoadTime: 300,
            annotationRenderTime: 180,
            navigationTransition: 120,
            bulkUploadTime: 1800,
            canvasInitTime: 250,
          },
          lighthouse: {
            performance: 75,
            accessibility: 85,
            bestPractices: 80,
            seo: 88,
          },
        },
        userJourneys: [],
      };

      const current: PerformanceBaseline = {
        ...previous,
        timestamp: Date.now(),
        metrics: {
          ...previous.metrics,
          bundle: {
            ...previous.metrics.bundle,
            total: 3500000, // 16.7% increase - regression
          },
          runtime: {
            ...previous.metrics.runtime,
            fcp: 2500, // 25% increase - regression
            tti: 3800, // 8.6% increase - acceptable
          },
        },
      };

      const comparison = await service.compareWithBaseline(current, previous);

      expect(comparison.regression).toBe(true);
      expect(comparison.degradations.length).toBeGreaterThan(0);
      expect(comparison.degradations).toContain(
        expect.stringContaining('Bundle size increased')
      );
      expect(comparison.degradations).toContain(
        expect.stringContaining('FCP degraded')
      );
    });

    it('should detect performance improvements', async () => {
      const previous: PerformanceBaseline = {
        timestamp: Date.now() - 3600000,
        version: '1.0.0',
        environment: 'development',
        metrics: {
          bundle: {
            total: 4200000,
            perRoute: {},
            chunkSizes: [],
            jsVsTs: { jsSize: 2520000, tsSize: 1680000, ratio: 0.4 },
          },
          runtime: {
            fcp: 2800,
            tti: 4500,
            lcp: 3200,
            cls: 0.15,
            fid: 100,
            inp: 200,
          },
          memory: {
            heapUsed: 450 * 1024 * 1024,
            heapTotal: 512 * 1024 * 1024,
            external: 62 * 1024 * 1024,
            arrayBuffers: 0,
            peakUsage: 450 * 1024 * 1024,
          },
          api: {
            uploadLatency: { p50: 250, p95: 800, p99: 1500 },
            fetchLatency: { p50: 100, p95: 300, p99: 600 },
            annotationSave: { p50: 150, p95: 400, p99: 800 },
            authenticationTime: { p50: 200, p95: 500, p99: 1000 },
          },
          custom: {
            imageLoadTime: 350,
            annotationRenderTime: 200,
            navigationTransition: 150,
            bulkUploadTime: 2000,
            canvasInitTime: 300,
          },
          lighthouse: {
            performance: 68,
            accessibility: 82,
            bestPractices: 75,
            seo: 85,
          },
        },
        userJourneys: [],
      };

      const current: PerformanceBaseline = {
        ...previous,
        timestamp: Date.now(),
        metrics: {
          ...previous.metrics,
          bundle: {
            ...previous.metrics.bundle,
            total: 2900000, // 31% decrease - improvement
          },
          runtime: {
            ...previous.metrics.runtime,
            fcp: 2100, // 25% decrease - improvement
            tti: 3400, // 24.4% decrease - improvement
          },
        },
      };

      const comparison = await service.compareWithBaseline(current, previous);

      expect(comparison.regression).toBe(false);
      expect(comparison.improvements.length).toBeGreaterThan(0);
      expect(comparison.improvements).toContain(
        expect.stringContaining('Bundle size reduced')
      );
      expect(comparison.improvements).toContain(
        expect.stringContaining('FCP improved')
      );
    });
  });

  describe('Performance Observer', () => {
    it('should initialize performance observer when available', () => {
      expect(global.PerformanceObserver).toHaveBeenCalled();
      const mockObserver = (global.PerformanceObserver as jest.Mock).mock.results[0].value;
      expect(mockObserver.observe).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should handle concurrent capture attempts', async () => {
      // Start first capture
      const firstCapture = service.captureBaselines();

      // Try to start second capture
      await expect(service.captureBaselines()).rejects.toThrow('Baseline capture already in progress');

      // Wait for first to complete
      await firstCapture;
    });

    it('should handle capture timeout', async () => {
      // Mock slow metrics gathering
      jest.spyOn(service as any, 'gatherAllMetrics').mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 35000))
      );

      await expect(service.captureBaselines()).rejects.toThrow('Baseline capture timeout after 30 seconds');
    });

    it('should validate baseline against thresholds', async () => {
      const baseline = await service.captureBaselines();
      const isValid = await service.validateBaseline(baseline);

      expect(typeof isValid).toBe('boolean');
    });

    it('should get performance thresholds', () => {
      const thresholds = service.getThresholds();

      expect(thresholds).toBeDefined();
      expect(thresholds.bundle).toBeDefined();
      expect(thresholds.runtime).toBeDefined();
      expect(thresholds.memory).toBeDefined();
      expect(thresholds.api).toBeDefined();
    });

    it('should handle IndexedDB storage errors gracefully', async () => {
      // Mock IndexedDB.open to fail
      const mockOpen = jest.fn(() => {
        const request: any = {
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
        };
        setTimeout(() => request.onerror?.(new Error('IndexedDB error')), 0);
        return request;
      });
      (window.indexedDB.open as jest.Mock) = mockOpen;

      const baseline = await service.captureBaselines();
      expect(baseline).toBeDefined();
      expect(console.warn).toHaveBeenCalled();
    });

    it('should handle localStorage storage errors gracefully', async () => {
      // Mock localStorage.setItem to throw
      const originalSetItem = window.localStorage.setItem;
      window.localStorage.setItem = jest.fn(() => {
        throw new Error('QuotaExceededError');
      });

      const baseline = await service.captureBaselines();
      expect(baseline).toBeDefined();
      expect(console.warn).toHaveBeenCalled();

      window.localStorage.setItem = originalSetItem;
    });

    it('should retry failed monitoring uploads', async () => {
      let callCount = 0;
      global.fetch = jest.fn(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        } as Response);
      });

      await service.captureBaselines();
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should handle upload timeout', async () => {
      global.fetch = jest.fn(() => new Promise((resolve) => {
        // Never resolve to simulate timeout
        setTimeout(() => resolve({ ok: false } as Response), 10000);
      }));

      const baseline = await service.captureBaselines();
      expect(baseline).toBeDefined();
      // Should continue despite upload failure
    });

    it('should disconnect performance observer on destroy', () => {
      const disconnectMock = jest.fn();
      const PerformanceObserverMock = jest.fn(() => ({
        observe: jest.fn(),
        disconnect: disconnectMock,
      }));

      Object.defineProperty(window, 'PerformanceObserver', {
        value: PerformanceObserverMock,
        writable: true,
      });

      const service = new BaselineService();
      service.destroy();

      expect(disconnectMock).toHaveBeenCalled();
    });

    it('should cleanup on window unload', () => {
      const destroySpy = jest.spyOn(service, 'destroy');
      window.dispatchEvent(new Event('beforeunload'));
      expect(destroySpy).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing performance.memory gracefully', async () => {
      Object.defineProperty(window, 'performance', {
        value: {
          ...originalPerformance,
          memory: undefined,
        },
        writable: true,
      });

      const baseline = await service.captureBaselines();
      expect(baseline.metrics.memory).toBeDefined();
      expect(baseline.metrics.memory.heapUsed).toBeGreaterThan(0);
    });

    it('should handle empty resource timing entries', async () => {
      Object.defineProperty(window, 'performance', {
        value: {
          ...originalPerformance,
          getEntriesByType: jest.fn((type: string) => {
            if (type === 'navigation') {
              return [mockNavigationTiming];
            }
            return [];
          }),
        },
        writable: true,
      });

      const baseline = await service.captureBaselines();
      expect(baseline.metrics.api).toBeDefined();
    });

    it('should handle PerformanceObserver errors', () => {
      const observeMock = jest.fn(() => {
        throw new Error('Observer error');
      });

      const PerformanceObserverMock = jest.fn(() => ({
        observe: observeMock,
        disconnect: jest.fn(),
      }));

      Object.defineProperty(window, 'PerformanceObserver', {
        value: PerformanceObserverMock,
        writable: true,
      });

      // Should not throw
      expect(() => new BaselineService()).not.toThrow();
    });

    it('should calculate percentiles correctly', async () => {
      const resources = Array.from({ length: 100 }, (_, i) => ({
        name: `https://example.com/api/upload/${i}`,
        entryType: 'resource',
        startTime: i * 10,
        duration: i * 5,
        fetchStart: i * 10,
        responseEnd: i * 10 + i * 5,
        responseStart: i * 10 + i * 2,
        transferSize: 1000 + i * 100,
        encodedBodySize: 1000 + i * 100,
      } as PerformanceResourceTiming));

      Object.defineProperty(window, 'performance', {
        value: {
          ...originalPerformance,
          getEntriesByType: jest.fn((type: string) => {
            if (type === 'resource') {
              return resources;
            }
            return [];
          }),
        },
        writable: true,
      });

      const baseline = await service.captureBaselines();
      expect(baseline.metrics.api.uploadLatency.p50).toBeLessThan(baseline.metrics.api.uploadLatency.p95);
      expect(baseline.metrics.api.uploadLatency.p95).toBeLessThan(baseline.metrics.api.uploadLatency.p99);
    });
  });
});