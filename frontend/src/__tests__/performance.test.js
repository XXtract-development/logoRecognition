/**
 * Performance Testing Suite
 * US-012: Code Splitting & Lazy Loading - Performance tests
 * US-023: Frontend Polish & Responsiveness - Performance metrics tests
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import performanceMonitor from '../utils/performance';
import preloadManager from '../utils/preload';

// Mock performance APIs
Object.defineProperty(window, 'performance', {
  value: {
    now: jest.fn(() => Date.now()),
    mark: jest.fn(),
    measure: jest.fn(),
    getEntriesByName: jest.fn(() => [{ duration: 100 }]),
    getEntriesByType: jest.fn(() => []),
    memory: {
      usedJSHeapSize: 1000000,
      totalJSHeapSize: 2000000,
      jsHeapSizeLimit: 4000000,
    },
    timing: {
      navigationStart: Date.now() - 1000,
      loadEventEnd: Date.now(),
    },
  },
  writable: true,
});

// Mock navigator APIs
Object.defineProperty(navigator, 'connection', {
  value: {
    effectiveType: '4g',
    downlink: 10,
    rtt: 50,
    saveData: false,
  },
  writable: true,
});

describe('Performance Monitoring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    performanceMonitor.cleanup();
  });

  describe('Performance Metrics Collection', () => {
    test('should collect web vitals metrics', async () => {
      // Mock PerformanceObserver
      const mockObserver = {
        observe: jest.fn(),
        disconnect: jest.fn(),
      };

      global.PerformanceObserver = jest.fn(() => mockObserver);

      // Initialize performance monitoring
      performanceMonitor.init();

      expect(global.PerformanceObserver).toHaveBeenCalledTimes(4); // FCP, LCP, FID, CLS observers
    });

    test('should track code splitting performance', async () => {
      const chunkName = 'test-chunk';
      const startMark = performanceMonitor.markCodeSplitStart(chunkName);

      expect(window.performance.mark).toHaveBeenCalledWith(startMark);

      // Simulate chunk loading completion
      performanceMonitor.markCodeSplitEnd(chunkName, startMark);

      expect(window.performance.mark).toHaveBeenCalledWith(`code-split-${chunkName}-end`);
      expect(window.performance.measure).toHaveBeenCalledWith(
        `code-split-${chunkName}`,
        startMark,
        `code-split-${chunkName}-end`
      );
    });

    test('should track user interaction timing', () => {
      const mockTarget = { tagName: 'BUTTON' };
      const startTime = performance.now();

      performanceMonitor.trackInteraction('click', mockTarget, startTime);

      const metrics = performanceMonitor.getMetrics();
      expect(metrics.userInteractions).toHaveLength(1);
      expect(metrics.userInteractions[0]).toMatchObject({
        type: 'click',
        target: 'BUTTON',
      });
    });

    test('should monitor memory usage', () => {
      performanceMonitor.monitorMemoryUsage();

      const metrics = performanceMonitor.getMetrics();
      expect(metrics.memoryUsage).toHaveLength(1);
      expect(metrics.memoryUsage[0]).toMatchObject({
        usedJSHeapSize: 1000000,
        totalJSHeapSize: 2000000,
        usage: 50,
      });
    });

    test('should adapt to network conditions', () => {
      // Simulate slow connection
      Object.defineProperty(navigator, 'connection', {
        value: {
          effectiveType: 'slow-2g',
          saveData: true,
        },
        configurable: true,
      });

      performanceMonitor.adaptToNetworkConditions();

      expect(document.body.classList.contains('low-bandwidth')).toBe(true);
    });
  });

  describe('Performance Thresholds', () => {
    test('should evaluate metrics against thresholds', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Test good FCP
      performanceMonitor.evaluateMetric('fcp', 1000);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('FCP: 1000.00ms (good)')
      );

      // Test poor LCP
      performanceMonitor.evaluateMetric('lcp', 3000);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('LCP: 3000.00ms (poor)')
      );

      consoleSpy.mockRestore();
    });

    test('should generate optimization suggestions for poor metrics', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      performanceMonitor.evaluateMetric('fid', 200); // Poor FID

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Optimization suggestion for fid:'),
        expect.stringContaining('Reduce JavaScript execution time')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Resource Analysis', () => {
    test('should analyze resource loading performance', () => {
      const mockResources = [
        {
          name: 'https://example.com/script.js',
          transferSize: 100000,
          responseEnd: 1000,
          startTime: 500,
          decodedBodySize: 100000,
        },
        {
          name: 'https://example.com/style.css',
          transferSize: 50000,
          responseEnd: 800,
          startTime: 200,
          decodedBodySize: 50000,
        },
        {
          name: 'https://example.com/large-image.jpg',
          transferSize: 2000000,
          responseEnd: 2000,
          startTime: 500,
          decodedBodySize: 2000000,
        },
      ];

      performanceMonitor.analyzeResourceLoading(mockResources);

      const metrics = performanceMonitor.getMetrics();
      expect(metrics.resourceLoading).toHaveLength(1);

      const analysis = metrics.resourceLoading[0];
      expect(analysis.totalResources).toBe(3);
      expect(analysis.byType).toHaveProperty('script');
      expect(analysis.byType).toHaveProperty('stylesheet');
      expect(analysis.byType).toHaveProperty('image');
      expect(analysis.slowResources).toHaveLength(1); // Large image
    });

    test('should generate resource optimization suggestions', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const mockAnalysis = {
        byType: {
          script: { size: 600000 }, // Large JS bundle
          image: { size: 1200000 }, // Large images
        },
        cacheHits: 2,
        cacheMisses: 8, // Poor cache utilization
        slowResources: [{ name: 'slow-resource.js' }],
      };

      performanceMonitor.generateResourceOptimizationSuggestions(mockAnalysis);

      expect(consoleSpy).toHaveBeenCalledWith(
        '🔧 Resource optimization suggestions:',
        expect.arrayContaining([
          expect.stringContaining('code splitting'),
          expect.stringContaining('Optimize images'),
          expect.stringContaining('caching strategy'),
          expect.stringContaining('slow-loading resources'),
        ])
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Performance Reports', () => {
    test('should generate comprehensive performance report', () => {
      // Set up some metrics
      performanceMonitor.metrics.vitals = {
        fcp: 1200,
        lcp: 2100,
        fid: 80,
        cls: 0.05,
      };

      performanceMonitor.metrics.resourceLoading = [
        { size: 100000, duration: 500 },
        { size: 150000, duration: 300 },
      ];

      performanceMonitor.metrics.memoryUsage = [
        { usage: 60 },
        { usage: 75 },
        { usage: 70 },
      ];

      const report = performanceMonitor.getPerformanceReport();

      expect(report).toHaveProperty('vitals');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('recommendations');
      expect(report).toHaveProperty('score');

      expect(report.score).toBeGreaterThan(0);
      expect(report.score).toBeLessThanOrEqual(100);
    });

    test('should calculate performance score correctly', () => {
      // Perfect metrics
      performanceMonitor.metrics.vitals = {
        fcp: 1000,
        lcp: 2000,
        fid: 50,
        cls: 0.05,
      };

      let score = performanceMonitor.calculatePerformanceScore();
      expect(score).toBe(100);

      // Poor metrics
      performanceMonitor.metrics.vitals = {
        fcp: 3000,
        lcp: 4000,
        fid: 200,
        cls: 0.15,
      };

      score = performanceMonitor.calculatePerformanceScore();
      expect(score).toBeLessThan(50);
    });

    test('should export metrics for analysis', () => {
      performanceMonitor.metrics.vitals = { fcp: 1000 };
      performanceMonitor.metrics.resourceLoading = [{ size: 100 }];

      // Mock blob and URL APIs
      global.Blob = jest.fn(() => ({}));
      global.URL = { createObjectURL: jest.fn(), revokeObjectURL: jest.fn() };

      const mockLink = {
        href: '',
        download: '',
        click: jest.fn(),
      };
      jest.spyOn(document, 'createElement').mockReturnValue(mockLink);

      performanceMonitor.exportMetrics();

      expect(global.Blob).toHaveBeenCalledWith(
        [expect.stringContaining('"fcp":1000')],
        { type: 'application/json' }
      );
      expect(mockLink.click).toHaveBeenCalled();
    });
  });

  describe('Integration with Components', () => {
    test('should work with withPerformanceTracking HOF', async () => {
      const { withPerformanceTracking } = await import('../utils/performance');

      const mockFunction = jest.fn().mockResolvedValue('result');
      const trackedFunction = withPerformanceTracking(mockFunction, 'test-function');

      const result = await trackedFunction('arg1', 'arg2');

      expect(result).toBe('result');
      expect(mockFunction).toHaveBeenCalledWith('arg1', 'arg2');
    });

    test('should work with measureAsync utility', async () => {
      const { measureAsync } = await import('../utils/performance');

      const mockFunction = jest.fn().mockResolvedValue('async-result');

      const result = await measureAsync(mockFunction, 'async-test');

      expect(result).toBe('async-result');
      expect(window.performance.mark).toHaveBeenCalledWith('async-test-start');
      expect(window.performance.mark).toHaveBeenCalledWith('async-test-end');
      expect(window.performance.measure).toHaveBeenCalledWith(
        'async-test',
        'async-test-start',
        'async-test-end'
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle missing performance APIs gracefully', () => {
      delete window.performance.memory;

      expect(() => {
        performanceMonitor.getMemoryStatus();
      }).not.toThrow();

      const memoryStatus = performanceMonitor.getMemoryStatus();
      expect(memoryStatus.usage).toBe(0);
    });

    test('should handle missing connection API gracefully', () => {
      delete navigator.connection;

      expect(() => {
        performanceMonitor.monitorNetworkQuality();
      }).not.toThrow();

      const metrics = performanceMonitor.getMetrics();
      expect(metrics.networkQuality).toEqual({});
    });

    test('should continue working when PerformanceObserver is not supported', () => {
      delete global.PerformanceObserver;

      expect(() => {
        performanceMonitor.init();
      }).not.toThrow();
    });
  });
});

describe('Preload Manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    preloadManager.clearCache();
  });

  describe('Module Preloading', () => {
    test('should preload modules successfully', async () => {
      const mockImport = jest.fn().mockResolvedValue({ default: 'Component' });

      await preloadManager.preloadModule(mockImport, 'TestComponent');

      expect(mockImport).toHaveBeenCalled();

      const metrics = preloadManager.getMetrics();
      expect(metrics.preloadedCount).toBe(1);
      expect(metrics.totalModulesPreloaded).toBe(1);
    });

    test('should handle preload failures gracefully', async () => {
      const mockImport = jest.fn().mockRejectedValue(new Error('Load failed'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(
        preloadManager.preloadModule(mockImport, 'FailingComponent')
      ).rejects.toThrow('Load failed');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to preload FailingComponent'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    test('should cache preloaded modules', async () => {
      const mockImport = jest.fn().mockResolvedValue({ default: 'Component' });

      // First preload
      await preloadManager.preloadModule(mockImport, 'CachedComponent');

      // Second preload should use cache
      await preloadManager.preloadModule(mockImport, 'CachedComponent');

      expect(mockImport).toHaveBeenCalledTimes(1);

      const metrics = preloadManager.getMetrics();
      expect(metrics.cacheHits).toBe(1);
      expect(metrics.cacheMisses).toBe(1);
    });

    test('should respect disabled preloading on slow connections', async () => {
      // Mock slow connection
      Object.defineProperty(navigator, 'connection', {
        value: { effectiveType: 'slow-2g' },
        configurable: true,
      });

      // Reinitialize to pick up connection change
      preloadManager.init();

      const mockImport = jest.fn().mockResolvedValue({ default: 'Component' });

      const result = await preloadManager.preloadModule(mockImport, 'SlowComponent');

      expect(result).toBeUndefined();
      expect(mockImport).not.toHaveBeenCalled();
    });
  });

  describe('Preload Handlers', () => {
    test('should create preload handlers for hover events', () => {
      const mockImport = jest.fn().mockResolvedValue({ default: 'Component' });

      const handlers = preloadManager.createPreloadHandlers(
        mockImport,
        'HoverComponent',
        100
      );

      expect(handlers).toHaveProperty('onMouseEnter');
      expect(handlers).toHaveProperty('onMouseLeave');
      expect(handlers).toHaveProperty('onFocus');

      // Test mouse enter
      act(() => {
        handlers.onMouseEnter();
      });

      // Test mouse leave
      act(() => {
        handlers.onMouseLeave();
      });

      // Test focus (immediate preload)
      act(() => {
        handlers.onFocus();
      });

      // Focus should trigger immediate preload
      expect(mockImport).toHaveBeenCalled();
    });

    test('should cancel hover timeout on mouse leave', () => {
      jest.useFakeTimers();

      const mockImport = jest.fn().mockResolvedValue({ default: 'Component' });
      const handlers = preloadManager.createPreloadHandlers(mockImport, 'TestComponent', 500);

      // Enter and immediately leave
      handlers.onMouseEnter();
      handlers.onMouseLeave();

      // Fast-forward time
      jest.advanceTimersByTime(600);

      expect(mockImport).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('Batch Preloading', () => {
    test('should preload multiple modules in parallel', async () => {
      const mockImport1 = jest.fn().mockResolvedValue({ default: 'Component1' });
      const mockImport2 = jest.fn().mockResolvedValue({ default: 'Component2' });

      const modules = [
        { importFn: mockImport1, moduleName: 'Component1' },
        { importFn: mockImport2, moduleName: 'Component2' },
      ];

      await preloadManager.preloadModules(modules);

      expect(mockImport1).toHaveBeenCalled();
      expect(mockImport2).toHaveBeenCalled();

      const metrics = preloadManager.getMetrics();
      expect(metrics.preloadedCount).toBe(2);
    });

    test('should handle partial failures in batch preloading', async () => {
      const mockImport1 = jest.fn().mockResolvedValue({ default: 'Component1' });
      const mockImport2 = jest.fn().mockRejectedValue(new Error('Failed'));

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const modules = [
        { importFn: mockImport1, moduleName: 'Component1' },
        { importFn: mockImport2, moduleName: 'Component2' },
      ];

      await preloadManager.preloadModules(modules);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Batch preloaded 2 modules')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Intelligent Preloading', () => {
    test('should preload based on current route', () => {
      const getImportSpy = jest.spyOn(preloadManager, 'getImportFunction');
      getImportSpy.mockReturnValue(() => Promise.resolve({ default: 'Component' }));

      jest.useFakeTimers();

      preloadManager.intelligentPreload('/');

      // Fast-forward the setTimeout
      jest.advanceTimersByTime(1500);

      expect(getImportSpy).toHaveBeenCalledWith('UploadPage');
      expect(getImportSpy).toHaveBeenCalledWith('AnnotationPage');

      jest.useRealTimers();
      getImportSpy.mockRestore();
    });

    test('should skip preloading for unknown routes', () => {
      const getImportSpy = jest.spyOn(preloadManager, 'getImportFunction');

      preloadManager.intelligentPreload('/unknown-route');

      expect(getImportSpy).not.toHaveBeenCalled();

      getImportSpy.mockRestore();
    });
  });

  describe('Memory Management', () => {
    test('should monitor memory usage and disable preloading when high', () => {
      jest.useFakeTimers();

      // Mock high memory usage
      Object.defineProperty(window.performance, 'memory', {
        value: {
          usedJSHeapSize: 900000000, // 900MB
          totalJSHeapSize: 1000000000, // 1GB
        },
        configurable: true,
      });

      preloadManager.monitorMemoryUsage();

      // Fast-forward the interval
      jest.advanceTimersByTime(11000);

      const metrics = preloadManager.getMetrics();
      expect(metrics.isEnabled).toBe(false);

      jest.useRealTimers();
    });

    test('should re-enable preloading when memory usage decreases', () => {
      jest.useFakeTimers();

      // First set high memory
      Object.defineProperty(window.performance, 'memory', {
        value: {
          usedJSHeapSize: 900000000,
          totalJSHeapSize: 1000000000,
        },
        configurable: true,
      });

      preloadManager.monitorMemoryUsage();
      jest.advanceTimersByTime(11000);

      // Then set low memory
      Object.defineProperty(window.performance, 'memory', {
        value: {
          usedJSHeapSize: 600000000,
          totalJSHeapSize: 1000000000,
        },
        configurable: true,
      });

      jest.advanceTimersByTime(11000);

      const metrics = preloadManager.getMetrics();
      expect(metrics.isEnabled).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('Cache Statistics', () => {
    test('should calculate cache hit rate correctly', async () => {
      const mockImport = jest.fn().mockResolvedValue({ default: 'Component' });

      // First call (miss)
      await preloadManager.preloadModule(mockImport, 'TestComponent');

      // Second call (hit)
      await preloadManager.preloadModule(mockImport, 'TestComponent');

      const metrics = preloadManager.getMetrics();
      expect(metrics.cacheHitRate).toBe(50); // 1 hit out of 2 attempts
    });

    test('should calculate average preload time', async () => {
      const mockImport = jest.fn().mockResolvedValue({ default: 'Component' });

      await preloadManager.preloadModule(mockImport, 'Component1');
      await preloadManager.preloadModule(mockImport, 'Component2');

      const metrics = preloadManager.getMetrics();
      expect(metrics.averagePreloadTime).toBeGreaterThan(0);
    });
  });
});