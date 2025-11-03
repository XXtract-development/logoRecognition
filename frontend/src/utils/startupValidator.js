/**
 * Startup Validator
 * Tests all critical endpoints and resources before app starts
 * Catches errors that unit tests miss (like NS_ERROR_FAILURE)
 */

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

class StartupValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.testResults = {};
  }

  /**
   * Create abort signal with timeout (polyfill for compatibility)
   */
  createTimeoutSignal(timeout = 5000) {
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
      return AbortSignal.timeout(timeout);
    }

    // Polyfill for environments that don't support AbortSignal.timeout
    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeout);
    return controller.signal;
  }

  /**
   * Test a single endpoint
   */
  async testEndpoint(method, path, options = {}) {
    const url = `${API_BASE}${path}`;
    const testName = `${method} ${path}`;

    try {
      const response = await fetch(url, {
        method,
        ...options,
        signal: this.createTimeoutSignal(5000),
      });

      this.testResults[testName] = {
        status: response.status,
        ok: response.ok,
        time: new Date().toISOString(),
      };

      if (!response.ok && !options.allowFailure) {
        this.errors.push({
          test: testName,
          error: `HTTP ${response.status}`,
          url,
        });
      }

      return response;
    } catch (error) {
      this.testResults[testName] = {
        status: 'error',
        error: error.message,
        time: new Date().toISOString(),
      };

      if (!options.allowFailure) {
        this.errors.push({
          test: testName,
          error: error.message,
          url,
        });
      }

      throw error;
    }
  }

  /**
   * Test image loading (catches NS_ERROR_FAILURE)
   */
  async testImageLoading(imageUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const testName = `Image Load: ${imageUrl}`;

      img.onload = () => {
        this.testResults[testName] = {
          status: 'success',
          width: img.width,
          height: img.height,
          time: new Date().toISOString(),
        };
        resolve(true);
      };

      img.onerror = (error) => {
        this.testResults[testName] = {
          status: 'error',
          error: 'Failed to load image',
          time: new Date().toISOString(),
        };

        this.errors.push({
          test: testName,
          error: 'Image load failed (possible NS_ERROR_FAILURE)',
          url: imageUrl,
        });

        reject(new Error(`Failed to load image: ${imageUrl}`));
      };

      img.src = imageUrl;
    });
  }

  /**
   * Test WebSocket connection
   */
  async testWebSocket(wsUrl) {
    // WebSocket testing disabled to prevent console errors
    const testName = `WebSocket: ${wsUrl}`;
    this.testResults[testName] = {
      status: 'skipped',
      reason: 'WebSocket not available on backend',
      time: new Date().toISOString(),
    };
    // Silent mode - no console messages
    return Promise.resolve(false);
  }

  /**
   * Run all startup validations
   */
  async validate() {
    console.log('🚀 Starting application validation...');

    const tests = [
      // Critical endpoints (must pass)
      { method: 'GET', path: '/health' },
      { method: 'GET', path: '/api/v1/logos' },
      { method: 'GET', path: '/api/v1/training/dataset' },
      { method: 'GET', path: '/api/v1/training/jobs' },
      { method: 'GET', path: '/api/categories' },
      { method: 'GET', path: '/api/training/readiness' },

      // Optional endpoints (can fail)
      { method: 'GET', path: '/api/annotation-metrics/sufficiency/test/test', options: { allowFailure: true } },
    ];

    // Test all endpoints
    for (const test of tests) {
      try {
        await this.testEndpoint(test.method, test.path, test.options);
      } catch (error) {
        if (!test.options?.allowFailure) {
          console.error(`❌ Critical endpoint failed: ${test.method} ${test.path}`, error);
        }
      }
    }

    // Test mock image endpoint
    try {
      await this.testImageLoading(`${API_BASE}/api/v1/logos/test-image/image`);
    } catch (error) {
      console.warn('⚠️ Image loading test failed:', error);
    }

    // Test WebSocket (optional)
    try {
      const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:8000/ws';
      await this.testWebSocket(wsUrl);
    } catch (error) {
      console.warn('⚠️ WebSocket test failed:', error);
    }

    return this.generateReport();
  }

  /**
   * Generate validation report
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      success: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      testResults: this.testResults,
      summary: {
        totalTests: Object.keys(this.testResults).length,
        failedTests: this.errors.length,
        warningTests: this.warnings.length,
      },
    };

    // Log report to console
    if (report.success) {
      console.log('✅ All critical validations passed!');
    } else {
      console.error('❌ Validation failed with errors:');
      this.errors.forEach(error => {
        console.error(`  - ${error.test}: ${error.error}`);
      });
    }

    if (this.warnings.length > 0) {
      console.warn('⚠️ Warnings:');
      this.warnings.forEach(warning => {
        console.warn(`  - ${warning.test}: ${warning.warning}`);
      });
    }

    // Store report in sessionStorage for debugging
    try {
      sessionStorage.setItem('startup-validation', JSON.stringify(report));
    } catch (e) {
      // Ignore storage errors
    }

    return report;
  }

  /**
   * Create a visual report component
   */
  createVisualReport() {
    const report = this.generateReport();

    return {
      show: () => {
        // Create a notification or modal with the report
        const message = report.success
          ? '✅ System validation successful'
          : `❌ System validation failed: ${report.errors.length} errors`;

        // This can be replaced with a proper notification system
        console.log('%c' + message, report.success ? 'color: green' : 'color: red');

        return report;
      },

      getErrors: () => this.errors,
      getWarnings: () => this.warnings,
      isHealthy: () => this.errors.length === 0,
    };
  }
}

// Auto-validate on module load if in development
if (process.env.NODE_ENV === 'development') {
  const validator = new StartupValidator();

  // Run validation after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
      const report = await validator.validate();
      window.__STARTUP_VALIDATION__ = report;
    });
  } else {
    validator.validate().then(report => {
      window.__STARTUP_VALIDATION__ = report;
    });
  }
}

export default StartupValidator;