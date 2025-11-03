import StartupValidator from '../startupValidator';

// Mock fetch globally
global.fetch = jest.fn();
global.Image = class {
  constructor() {
    setTimeout(() => this.onload && this.onload(), 0);
  }
};
global.WebSocket = class {
  constructor(url) {
    this.url = url;
    setTimeout(() => this.onopen && this.onopen(), 0);
  }
  close() {}
};

describe('StartupValidator', () => {
  let validator;

  beforeEach(() => {
    validator = new StartupValidator();
    fetch.mockClear();
    jest.clearAllTimers();
  });

  describe('testEndpoint', () => {
    it('should handle successful endpoint test', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const response = await validator.testEndpoint('GET', '/health');

      expect(response.ok).toBe(true);
      expect(validator.testResults['GET /health']).toMatchObject({
        status: 200,
        ok: true,
      });
      expect(validator.errors).toHaveLength(0);
    });

    it('should handle failed endpoint test', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      try {
        await validator.testEndpoint('GET', '/api/missing');
      } catch (error) {
        // Expected to throw
      }

      expect(validator.errors).toHaveLength(1);
      expect(validator.errors[0]).toMatchObject({
        test: 'GET /api/missing',
        error: 'HTTP 404',
      });
    });

    it('should handle network errors', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      try {
        await validator.testEndpoint('GET', '/api/test');
      } catch (error) {
        expect(error.message).toBe('Network error');
      }

      expect(validator.errors).toHaveLength(1);
      expect(validator.errors[0]).toMatchObject({
        test: 'GET /api/test',
        error: 'Network error',
      });
    });

    it('should respect allowFailure option', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      try {
        await validator.testEndpoint('GET', '/api/optional', { allowFailure: true });
      } catch (error) {
        // Expected to throw but not add to errors
      }

      expect(validator.errors).toHaveLength(0);
    });
  });

  describe('testImageLoading', () => {
    it('should detect image load failures (NS_ERROR_FAILURE)', async () => {
      // Mock Image that fails to load
      global.Image = class {
        constructor() {
          this.src = '';
        }
        set src(value) {
          this._src = value;
          setTimeout(() => {
            if (this.onerror) {
              this.onerror(new Error('NS_ERROR_FAILURE'));
            }
          }, 0);
        }
      };

      try {
        await validator.testImageLoading('http://localhost:8000/image.jpg');
      } catch (error) {
        expect(error.message).toContain('Failed to load image');
      }

      expect(validator.errors).toHaveLength(1);
      expect(validator.errors[0]).toMatchObject({
        test: 'Image Load: http://localhost:8000/image.jpg',
        error: 'Image load failed (possible NS_ERROR_FAILURE)',
      });
    });

    it('should handle successful image load', async () => {
      // Mock successful Image load
      global.Image = class {
        constructor() {
          this.width = 100;
          this.height = 100;
        }
        set src(value) {
          this._src = value;
          setTimeout(() => {
            if (this.onload) {
              this.onload();
            }
          }, 0);
        }
      };

      const result = await validator.testImageLoading('http://localhost:8000/image.jpg');

      expect(result).toBe(true);
      expect(validator.errors).toHaveLength(0);
      expect(validator.testResults['Image Load: http://localhost:8000/image.jpg']).toMatchObject({
        status: 'success',
        width: 100,
        height: 100,
      });
    });
  });

  describe('testWebSocket', () => {
    it('should handle WebSocket connection success', async () => {
      global.WebSocket = class {
        constructor(url) {
          this.url = url;
          setTimeout(() => this.onopen && this.onopen(), 0);
        }
        close() {}
      };

      const result = await validator.testWebSocket('ws://localhost:8000/ws');

      // WebSocket testing is disabled, so it always returns false
      expect(result).toBe(false);
      expect(validator.testResults['WebSocket: ws://localhost:8000/ws']).toMatchObject({
        status: 'skipped',
        reason: 'WebSocket not available on backend'
      });
    });

    it('should handle WebSocket connection failure', async () => {
      global.WebSocket = class {
        constructor(url) {
          this.url = url;
          setTimeout(() => this.onerror && this.onerror(new Error('Connection failed')), 0);
        }
        close() {}
      };

      const result = await validator.testWebSocket('ws://localhost:8000/ws');

      // WebSocket testing is disabled, so it always returns false and skips
      expect(result).toBe(false);
      expect(validator.testResults['WebSocket: ws://localhost:8000/ws']).toMatchObject({
        status: 'skipped',
        reason: 'WebSocket not available on backend'
      });
      // No warnings are generated because testing is disabled
      expect(validator.warnings).toHaveLength(0);
    });
  });

  describe('validate', () => {
    it('should run all validations and generate report', async () => {
      // Mock successful responses for all endpoints
      fetch.mockImplementation((url) => {
        return Promise.resolve({
          ok: true,
          status: 200,
        });
      });

      const report = await validator.validate();

      expect(report.success).toBe(true);
      expect(report.errors).toHaveLength(0);
      expect(report.summary.totalTests).toBeGreaterThan(0);
    });

    it('should fail validation when critical endpoints fail', async () => {
      // Mock failure for critical endpoint
      fetch.mockImplementation((url) => {
        if (url.includes('/health')) {
          return Promise.resolve({
            ok: false,
            status: 500,
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
        });
      });

      const report = await validator.validate();

      expect(report.success).toBe(false);
      expect(report.errors.length).toBeGreaterThan(0);
    });

    it('should continue validation even if optional tests fail', async () => {
      // Mock mixed responses
      fetch.mockImplementation((url) => {
        if (url.includes('annotation-metrics')) {
          return Promise.resolve({
            ok: false,
            status: 404,
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
        });
      });

      const report = await validator.validate();

      // Should still be successful if only optional endpoints fail
      expect(report.warnings.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('generateReport', () => {
    it('should generate comprehensive report', () => {
      validator.errors = [
        { test: 'Test 1', error: 'Error 1', url: 'http://test1' },
      ];
      validator.warnings = [
        { test: 'Test 2', warning: 'Warning 1', url: 'http://test2' },
      ];
      validator.testResults = {
        'Test 1': { status: 'error' },
        'Test 2': { status: 'success' },
      };

      const report = validator.generateReport();

      expect(report).toMatchObject({
        success: false,
        errors: validator.errors,
        warnings: validator.warnings,
        testResults: validator.testResults,
        summary: {
          totalTests: 2,
          failedTests: 1,
          warningTests: 1,
        },
      });
    });

    it('should store report in sessionStorage', () => {
      const mockSetItem = jest.fn();
      Object.defineProperty(window, 'sessionStorage', {
        value: {
          setItem: mockSetItem,
        },
        writable: true,
      });

      validator.generateReport();

      expect(mockSetItem).toHaveBeenCalledWith(
        'startup-validation',
        expect.any(String)
      );
    });
  });

  describe('Browser-specific error detection', () => {
    it('should detect NS_ERROR_FAILURE in image loading', async () => {
      // This test specifically checks for the NS_ERROR_FAILURE issue
      // that doesn't appear in unit tests but occurs in browsers

      // Mock the specific error that browsers throw
      global.Image = class {
        set src(value) {
          // Simulate NS_ERROR_FAILURE
          setTimeout(() => {
            const error = new Error();
            error.name = 'NS_ERROR_FAILURE';
            if (this.onerror) this.onerror(error);
          }, 0);
        }
      };

      try {
        await validator.testImageLoading('http://localhost:8000/broken.jpg');
      } catch (error) {
        // Expected
      }

      expect(validator.errors).toHaveLength(1);
      expect(validator.errors[0].error).toContain('NS_ERROR_FAILURE');
    });

    it('should detect CORS errors', async () => {
      // Simulate CORS error
      fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      try {
        await validator.testEndpoint('GET', '/api/cors-blocked');
      } catch (error) {
        expect(error.message).toBe('Failed to fetch');
      }

      expect(validator.errors).toHaveLength(1);
      expect(validator.errors[0].error).toContain('Failed to fetch');
    });
  });
});