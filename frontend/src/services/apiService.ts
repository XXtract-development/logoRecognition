/**
 * Enhanced API Service with Security and Error Handling
 * Enterprise-grade implementation with comprehensive security features
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { Security } from './securityService';
import { errorService, ErrorCategory, ErrorSeverity } from './errorService';

// API Configuration
const API_CONFIG = {
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1',
  timeout: 30000,
  maxRetries: 3,
  retryDelay: 1000,
  rateLimitWindow: 60000, // 1 minute
  rateLimitMaxRequests: 100,
};

// Request queue for offline support
interface QueuedRequest {
  id: string;
  config: AxiosRequestConfig;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timestamp: number;
  retryCount: number;
}

/**
 * Enhanced API Service with security, error handling, and monitoring
 */
class ApiService {
  private client: AxiosInstance;
  private requestQueue: Map<string, QueuedRequest> = new Map();
  private isOnline: boolean = navigator.onLine;
  private requestCount: number = 0;
  private lastRequestTime: number = 0;
  private performanceMetrics: Map<string, number[]> = new Map();

  constructor() {
    this.client = this.createAxiosInstance();
    this.setupInterceptors();
    this.setupNetworkHandlers();
    this.initializeSecurity();
  }

  /**
   * Create configured Axios instance
   */
  private createAxiosInstance(): AxiosInstance {
    return axios.create({
      baseURL: API_CONFIG.baseURL,
      timeout: API_CONFIG.timeout,
      withCredentials: true, // Important for httpOnly cookies
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest', // CSRF protection
      },
      validateStatus: (status) => status < 500, // Don't throw on 4xx errors
    });
  }

  /**
   * Initialize security features
   */
  private async initializeSecurity(): Promise<void> {
    // Initialize secure token manager
    await Security.SecureTokenManager.initialize();

    // Generate CSRF token
    Security.CSRFProtection.generateToken();
  }

  /**
   * Setup request and response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      async (config) => {
        // Add performance tracking
        const requestId = this.generateRequestId();
        (config as any).metadata = { startTime: Date.now(), requestId };

        // Check rate limiting
        if (!this.checkRateLimit()) {
          throw new Error('RATE_LIMIT_EXCEEDED');
        }

        // Add CSRF token
        config.headers = Security.CSRFProtection.addToHeaders(config.headers || {}) as any;

        // Add request ID for tracking
        config.headers['X-Request-ID'] = requestId;

        // Add Content Security Policy
        config.headers['Content-Security-Policy'] = Security.ContentSecurityPolicy.getPolicy();

        // Log request in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, config.data);
        }

        return config;
      },
      (error) => {
        errorService.handleError(error, {
          category: ErrorCategory.NETWORK,
          severity: ErrorSeverity.HIGH,
        });
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        // Track performance
        const metadata = (response.config as any).metadata;
        if (metadata) {
          const duration = Date.now() - metadata.startTime;
          this.trackPerformance(response.config.url || '', duration);
        }

        // Log response in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`[API Response] ${response.config.url}`, response.data);
        }

        return response;
      },
      async (error: AxiosError) => {
        return this.handleResponseError(error);
      }
    );
  }

  /**
   * Handle response errors with retry logic and error reporting
   */
  private async handleResponseError(error: AxiosError): Promise<any> {
    const config = error.config as any;
    const retryCount = config._retryCount || 0;

    // Handle authentication errors
    if (error.response?.status === 401) {
      return this.handleAuthError(error);
    }

    // Handle network errors with retry
    if (!error.response && retryCount < API_CONFIG.maxRetries) {
      return this.retryRequest(error);
    }

    // Handle rate limiting
    if (error.response?.status === 429) {
      return this.handleRateLimitError(error);
    }

    // Handle validation errors
    if (error.response?.status === 422 || error.response?.status === 400) {
      return this.handleValidationError(error);
    }

    // Handle server errors
    if (error.response?.status && error.response.status >= 500) {
      return this.handleServerError(error);
    }

    // Report error to error service
    const appError = errorService.handleError(error, {
      category: this.categorizeError(error),
      severity: this.determineSeverity(error),
      context: {
        url: config.url,
        method: config.method,
        status: error.response?.status,
        data: error.response?.data,
      },
    });

    return Promise.reject(appError);
  }

  /**
   * Handle authentication errors
   */
  private async handleAuthError(error: AxiosError): Promise<any> {
    try {
      // Try to refresh token
      await Security.SecureTokenManager.clearTokens();

      // Report to error service
      errorService.handleError(new Error('Authentication failed'), {
        code: 'AUTH_ERROR',
        category: ErrorCategory.AUTHENTICATION,
        severity: ErrorSeverity.HIGH,
      });

      return Promise.reject(error);
    } catch (refreshError) {
      // Refresh failed, clear session and redirect to login
      await Security.SecureTokenManager.clearTokens();
      window.location.href = '/login';
      return Promise.reject(error);
    }
  }

  /**
   * Retry failed request with exponential backoff
   */
  private async retryRequest(error: AxiosError): Promise<any> {
    const config = error.config as any;
    config._retryCount = (config._retryCount || 0) + 1;

    const delay = API_CONFIG.retryDelay * Math.pow(2, config._retryCount - 1);

    console.log(`[API Retry] Attempt ${config._retryCount} after ${delay}ms`);

    await new Promise(resolve => setTimeout(resolve, delay));

    // If offline, queue the request
    if (!navigator.onLine) {
      return this.queueRequest(config);
    }

    return this.client(config);
  }

  /**
   * Handle rate limit errors
   */
  private async handleRateLimitError(error: AxiosError): Promise<any> {
    const retryAfter = error.response?.headers['retry-after'];
    const delay = retryAfter ? parseInt(retryAfter) * 1000 : 60000;

    errorService.handleError(new Error('Rate limit exceeded'), {
      code: 'RATE_LIMIT_ERROR',
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.MEDIUM,
      context: {
        retryAfter: delay,
      },
    });

    // Wait and retry
    await new Promise(resolve => setTimeout(resolve, delay));
    return this.client(error.config!);
  }

  /**
   * Handle validation errors
   */
  private handleValidationError(error: AxiosError): Promise<any> {
    const validationErrors = (error.response?.data as any)?.errors || {};

    errorService.handleError(new Error('Validation failed'), {
      code: 'VALIDATION_ERROR',
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.LOW,
      userMessage: this.formatValidationErrors(validationErrors),
      context: {
        errors: validationErrors,
      },
    });

    return Promise.reject(error);
  }

  /**
   * Handle server errors
   */
  private async handleServerError(error: AxiosError): Promise<any> {
    const config = error.config as any;
    const retryCount = config._retryCount || 0;

    if (retryCount < API_CONFIG.maxRetries) {
      return this.retryRequest(error);
    }

    errorService.handleError(new Error('Server error'), {
      code: 'SERVER_ERROR',
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.CRITICAL,
      context: {
        status: error.response?.status,
        message: error.response?.data,
      },
    });

    return Promise.reject(error);
  }

  /**
   * Format validation errors for user display
   */
  private formatValidationErrors(errors: Record<string, string[]>): string {
    const messages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    return `Please fix the following errors: ${messages}`;
  }

  /**
   * Queue request for offline processing
   */
  private queueRequest(config: AxiosRequestConfig): Promise<any> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        id: this.generateRequestId(),
        config,
        resolve,
        reject,
        timestamp: Date.now(),
        retryCount: 0,
      };

      this.requestQueue.set(request.id, request);

      // Try to process queue when back online
      if (this.isOnline) {
        this.processQueue();
      }
    });
  }

  /**
   * Process queued requests
   */
  private async processQueue(): Promise<void> {
    if (!this.isOnline || this.requestQueue.size === 0) return;

    for (const [id, request] of this.requestQueue) {
      try {
        const response = await this.client(request.config);
        request.resolve(response);
        this.requestQueue.delete(id);
      } catch (error) {
        request.retryCount++;
        if (request.retryCount >= API_CONFIG.maxRetries) {
          request.reject(error);
          this.requestQueue.delete(id);
        }
      }
    }
  }

  /**
   * Setup network status handlers
   */
  private setupNetworkHandlers(): void {
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('[API] Back online, processing queue...');
      this.processQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('[API] Went offline, requests will be queued');
    });
  }

  /**
   * Check rate limiting
   */
  private checkRateLimit(): boolean {
    const now = Date.now();

    // Reset counter if window has passed
    if (now - this.lastRequestTime > API_CONFIG.rateLimitWindow) {
      this.requestCount = 0;
      this.lastRequestTime = now;
    }

    if (this.requestCount >= API_CONFIG.rateLimitMaxRequests) {
      Security.SecurityMonitor.logSecurityIncident('rate_limit_exceeded', {
        count: this.requestCount,
        window: API_CONFIG.rateLimitWindow,
      });
      return false;
    }

    this.requestCount++;
    return true;
  }

  /**
   * Track performance metrics
   */
  private trackPerformance(endpoint: string, duration: number): void {
    const metrics = this.performanceMetrics.get(endpoint) || [];
    metrics.push(duration);

    // Keep only last 100 measurements
    if (metrics.length > 100) {
      metrics.shift();
    }

    this.performanceMetrics.set(endpoint, metrics);

    // Log slow requests
    if (duration > 5000) {
      console.warn(`[API Performance] Slow request: ${endpoint} took ${duration}ms`);
    }
  }

  /**
   * Categorize error for error service
   */
  private categorizeError(error: AxiosError): ErrorCategory {
    if (!error.response) return ErrorCategory.NETWORK;

    const status = error.response.status;
    if (status === 401) return ErrorCategory.AUTHENTICATION;
    if (status === 403) return ErrorCategory.AUTHORIZATION;
    if (status === 422 || status === 400) return ErrorCategory.VALIDATION;
    if (status >= 500) return ErrorCategory.SYSTEM;

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Determine error severity
   */
  private determineSeverity(error: AxiosError): ErrorSeverity {
    if (!error.response) return ErrorSeverity.HIGH;

    const status = error.response.status;
    if (status >= 500) return ErrorSeverity.CRITICAL;
    if (status === 401 || status === 403) return ErrorSeverity.HIGH;
    if (status === 422 || status === 400) return ErrorSeverity.LOW;

    return ErrorSeverity.MEDIUM;
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * HTTP Methods with validation and monitoring
   */
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    // Validate data if provided
    if (data && typeof data === 'object') {
      this.validateRequestData(data);
    }

    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    // Validate data if provided
    if (data && typeof data === 'object') {
      this.validateRequestData(data);
    }

    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  async patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    // Validate data if provided
    if (data && typeof data === 'object') {
      this.validateRequestData(data);
    }

    const response = await this.client.patch<T>(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }

  /**
   * Validate request data for common security issues
   */
  private validateRequestData(data: any): void {
    const json = JSON.stringify(data);

    // Check for potential XSS
    if (json.includes('<script') || json.includes('javascript:')) {
      throw new Error('Invalid data: potential XSS detected');
    }

    // Check for SQL injection patterns
    if (json.match(/(\bUNION\b|\bSELECT\b|\bDROP\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b)/i)) {
      Security.SecurityMonitor.logSecurityIncident('sql_injection_attempt', { data });
      throw new Error('Invalid data: potential SQL injection detected');
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): Map<string, { avg: number; min: number; max: number }> {
    const result = new Map();

    for (const [endpoint, durations] of this.performanceMetrics) {
      if (durations.length === 0) continue;

      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const min = Math.min(...durations);
      const max = Math.max(...durations);

      result.set(endpoint, { avg, min, max });
    }

    return result;
  }

  /**
   * Get queue status
   */
  getQueueStatus(): { size: number; requests: any[] } {
    return {
      size: this.requestQueue.size,
      requests: Array.from(this.requestQueue.values()).map(req => ({
        id: req.id,
        url: req.config.url,
        method: req.config.method,
        timestamp: req.timestamp,
        retryCount: req.retryCount,
      })),
    };
  }

  /**
   * Clear request queue
   */
  clearQueue(): void {
    for (const [, request] of this.requestQueue) {
      request.reject(new Error('Queue cleared'));
    }
    this.requestQueue.clear();
  }
}

// Export singleton instance
export const apiService = new ApiService();

export default apiService;