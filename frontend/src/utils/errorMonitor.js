/**
 * Comprehensive Error Monitoring System
 * Catches ALL errors (network, runtime, promise rejections) and reports them
 */

class ErrorMonitor {
  constructor() {
    this.errors = [];
    this.networkErrors = [];
    this.consoleErrors = [];
    this.maxErrors = 100;
    this.listeners = new Set();
    this.startTime = Date.now();
    this.setupMonitoring();
  }

  setupMonitoring() {
    // Monitor all fetch requests
    this.monitorFetch();

    // Monitor XMLHttpRequest
    this.monitorXHR();

    // Monitor WebSocket
    this.monitorWebSocket();

    // Monitor unhandled errors
    this.monitorWindowErrors();

    // Monitor unhandled promise rejections
    this.monitorPromiseRejections();

    // Monitor console errors
    this.monitorConsoleErrors();
  }

  monitorFetch() {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const startTime = Date.now();
      try {
        const response = await originalFetch(...args);
        const duration = Date.now() - startTime;

        // Log slow requests
        if (duration > 5000) {
          this.addError({
            type: 'SLOW_REQUEST',
            url: args[0],
            duration,
            timestamp: new Date().toISOString()
          });
        }

        // Check for errors
        if (!response.ok) {
          this.addNetworkError({
            type: 'HTTP_ERROR',
            url: args[0],
            status: response.status,
            statusText: response.statusText,
            timestamp: new Date().toISOString()
          });
        }

        return response;
      } catch (error) {
        this.addNetworkError({
          type: 'FETCH_FAILED',
          url: args[0],
          error: error.message,
          isNSError: error.message.includes('NS_ERROR'),
          timestamp: new Date().toISOString()
        });
        throw error;
      }
    };
  }

  monitorXHR() {
    const XHR = XMLHttpRequest.prototype;
    const originalOpen = XHR.open;
    const originalSend = XHR.send;

    XHR.open = function(method, url) {
      this._errorMonitor = { method, url, startTime: Date.now() };
      return originalOpen.apply(this, arguments);
    };

    XHR.send = function() {
      const xhr = this;
      const monitor = xhr._errorMonitor;

      xhr.addEventListener('error', () => {
        window.errorMonitor.addNetworkError({
          type: 'XHR_ERROR',
          url: monitor.url,
          method: monitor.method,
          timestamp: new Date().toISOString()
        });
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 400) {
          window.errorMonitor.addNetworkError({
            type: 'XHR_HTTP_ERROR',
            url: monitor.url,
            status: xhr.status,
            timestamp: new Date().toISOString()
          });
        }
      });

      return originalSend.apply(this, arguments);
    };
  }

  monitorWebSocket() {
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = function(url, protocols) {
      const ws = new OriginalWebSocket(url, protocols);

      ws.addEventListener('error', (event) => {
        window.errorMonitor.addNetworkError({
          type: 'WEBSOCKET_ERROR',
          url,
          timestamp: new Date().toISOString()
        });
      });

      ws.addEventListener('close', (event) => {
        if (!event.wasClean) {
          window.errorMonitor.addNetworkError({
            type: 'WEBSOCKET_ABNORMAL_CLOSE',
            url,
            code: event.code,
            reason: event.reason,
            timestamp: new Date().toISOString()
          });
        }
      });

      return ws;
    };
  }

  monitorWindowErrors() {
    window.addEventListener('error', (event) => {
      this.addError({
        type: 'RUNTIME_ERROR',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
        timestamp: new Date().toISOString()
      });
    });
  }

  monitorPromiseRejections() {
    window.addEventListener('unhandledrejection', (event) => {
      this.addError({
        type: 'UNHANDLED_REJECTION',
        reason: event.reason,
        promise: event.promise,
        timestamp: new Date().toISOString()
      });
    });
  }

  monitorConsoleErrors() {
    const originalError = console.error;
    console.error = (...args) => {
      this.addConsoleError({
        type: 'CONSOLE_ERROR',
        arguments: args,
        timestamp: new Date().toISOString()
      });
      return originalError.apply(console, args);
    };
  }

  addError(error) {
    this.errors.push(error);
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }
    this.notifyListeners('error', error);
  }

  addNetworkError(error) {
    this.networkErrors.push(error);
    if (this.networkErrors.length > this.maxErrors) {
      this.networkErrors.shift();
    }
    this.notifyListeners('network', error);

    // Auto-recovery for specific errors
    this.attemptAutoRecovery(error);
  }

  addConsoleError(error) {
    this.consoleErrors.push(error);
    if (this.consoleErrors.length > this.maxErrors) {
      this.consoleErrors.shift();
    }
    this.notifyListeners('console', error);
  }

  attemptAutoRecovery(error) {
    // Auto-recovery strategies
    if (error.type === 'WEBSOCKET_ERROR' || error.type === 'WEBSOCKET_ABNORMAL_CLOSE') {
      console.log('WebSocket error detected, will retry connection in 5s...');
      setTimeout(() => {
        this.notifyListeners('recovery', { action: 'websocket_reconnect', error });
      }, 5000);
    }

    if (error.status === 404) {
      console.log(`404 error on ${error.url}, checking if endpoint exists...`);
      this.notifyListeners('recovery', { action: 'endpoint_check', error });
    }

    if (error.isNSError) {
      console.log('NS_ERROR detected, attempting fallback...');
      this.notifyListeners('recovery', { action: 'ns_error_fallback', error });
    }
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners(type, data) {
    this.listeners.forEach(callback => callback({ type, data }));
  }

  getReport() {
    const uptime = Date.now() - this.startTime;
    return {
      uptime,
      errors: {
        total: this.errors.length,
        recent: this.errors.slice(-10)
      },
      networkErrors: {
        total: this.networkErrors.length,
        recent: this.networkErrors.slice(-10),
        by404: this.networkErrors.filter(e => e.status === 404).length,
        by500: this.networkErrors.filter(e => e.status >= 500).length,
        nsErrors: this.networkErrors.filter(e => e.isNSError).length
      },
      consoleErrors: {
        total: this.consoleErrors.length,
        recent: this.consoleErrors.slice(-5)
      },
      health: this.calculateHealth()
    };
  }

  calculateHealth() {
    const recentErrors = this.errors.filter(e =>
      Date.now() - new Date(e.timestamp).getTime() < 60000
    ).length;

    const recentNetworkErrors = this.networkErrors.filter(e =>
      Date.now() - new Date(e.timestamp).getTime() < 60000
    ).length;

    if (recentErrors > 10 || recentNetworkErrors > 20) {
      return 'critical';
    } else if (recentErrors > 5 || recentNetworkErrors > 10) {
      return 'warning';
    }
    return 'healthy';
  }

  reset() {
    this.errors = [];
    this.networkErrors = [];
    this.consoleErrors = [];
    this.notifyListeners('reset', {});
  }
}

// Create global instance
if (typeof window !== 'undefined') {
  window.errorMonitor = new ErrorMonitor();
}

export default ErrorMonitor;