/**
 * Enterprise Error Handling Service
 * Provides consistent error handling, user feedback, and monitoring
 */

import { toast } from 'react-toastify';
import { EventEmitter } from 'events';

// Error severity levels
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// Error categories
export enum ErrorCategory {
  NETWORK = 'network',
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  BUSINESS_LOGIC = 'business_logic',
  SYSTEM = 'system',
  USER_INPUT = 'user_input',
  UNKNOWN = 'unknown',
}

// Standardized error interface
export interface AppError {
  id: string;
  code: string;
  message: string;
  userMessage?: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
  timestamp: Date;
  context?: Record<string, any>;
  stack?: string;
  recoverable: boolean;
  retryable: boolean;
  retryCount?: number;
  maxRetries?: number;
}

// Error recovery strategies
export interface ErrorRecoveryStrategy {
  type: 'retry' | 'fallback' | 'redirect' | 'refresh' | 'manual';
  handler: () => Promise<void>;
  description: string;
}

/**
 * Main Error Service
 */
export class ErrorService extends EventEmitter {
  private static instance: ErrorService;
  private errors: Map<string, AppError> = new Map();
  private errorHandlers: Map<string, (error: AppError) => void> = new Map();
  private recoveryStrategies: Map<string, ErrorRecoveryStrategy> = new Map();
  private metrics: {
    totalErrors: number;
    errorsByCategory: Map<ErrorCategory, number>;
    errorsBySeverity: Map<ErrorSeverity, number>;
    recoveryAttempts: number;
    successfulRecoveries: number;
  } = {
    totalErrors: 0,
    errorsByCategory: new Map(),
    errorsBySeverity: new Map(),
    recoveryAttempts: 0,
    successfulRecoveries: 0,
  };

  private constructor() {
    super();
    this.setupDefaultHandlers();
    this.setupGlobalErrorHandlers();
  }

  static getInstance(): ErrorService {
    if (!ErrorService.instance) {
      ErrorService.instance = new ErrorService();
    }
    return ErrorService.instance;
  }

  /**
   * Setup default error handlers
   */
  private setupDefaultHandlers(): void {
    // Network errors
    this.registerHandler('NETWORK_ERROR', (error) => {
      this.showUserNotification(
        'Connection Problem',
        'Unable to connect to the server. Please check your internet connection.',
        'error'
      );
    });

    // Authentication errors
    this.registerHandler('AUTH_ERROR', (error) => {
      this.showUserNotification(
        'Authentication Required',
        'Please log in to continue.',
        'warning'
      );
      // Redirect to login after delay
      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
    });

    // Validation errors
    this.registerHandler('VALIDATION_ERROR', (error) => {
      this.showUserNotification(
        'Invalid Input',
        error.userMessage || 'Please check your input and try again.',
        'warning'
      );
    });

    // Rate limiting
    this.registerHandler('RATE_LIMIT_ERROR', (error) => {
      this.showUserNotification(
        'Too Many Requests',
        'Please slow down and try again in a moment.',
        'info'
      );
    });

    // Server errors
    this.registerHandler('SERVER_ERROR', (error) => {
      this.showUserNotification(
        'Server Error',
        'Something went wrong on our end. We\'re working to fix it.',
        'error'
      );
    });
  }

  /**
   * Setup global error handlers
   */
  private setupGlobalErrorHandlers(): void {
    // Window error handler
    window.addEventListener('error', (event) => {
      this.handleError(new Error(event.message), {
        severity: ErrorSeverity.HIGH,
        category: ErrorCategory.SYSTEM,
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });

    // Promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(new Error(event.reason), {
        severity: ErrorSeverity.HIGH,
        category: ErrorCategory.SYSTEM,
        context: {
          promise: event.promise,
          reason: event.reason,
        },
      });
      event.preventDefault();
    });
  }

  /**
   * Main error handling method
   */
  handleError(
    error: Error | AppError,
    options?: Partial<AppError>
  ): AppError {
    const appError = this.normalizeError(error, options);

    // Store error
    this.errors.set(appError.id, appError);

    // Update metrics
    this.updateMetrics(appError);

    // Emit error event
    this.emit('error', appError);

    // Execute specific handler if exists
    const handler = this.errorHandlers.get(appError.code);
    if (handler) {
      handler(appError);
    } else {
      // Default handling based on severity
      this.handleBySeverity(appError);
    }

    // Log error
    this.logError(appError);

    // Try recovery if available
    if (appError.retryable && appError.retryCount! < (appError.maxRetries || 3)) {
      this.attemptRecovery(appError);
    }

    return appError;
  }

  /**
   * Normalize error to AppError format
   */
  private normalizeError(
    error: Error | AppError,
    options?: Partial<AppError>
  ): AppError {
    if (this.isAppError(error)) {
      return { ...error, ...options };
    }

    const code = this.extractErrorCode(error);
    const category = this.categorizeError(error);
    const severity = this.determineSeverity(error, category);

    return {
      id: this.generateErrorId(),
      code,
      message: error.message,
      userMessage: this.generateUserMessage(error, category),
      severity,
      category,
      timestamp: new Date(),
      context: options?.context,
      stack: error.stack,
      recoverable: this.isRecoverable(category),
      retryable: this.isRetryable(category),
      retryCount: 0,
      maxRetries: 3,
      ...options,
    };
  }

  /**
   * Type guard for AppError
   */
  private isAppError(error: any): error is AppError {
    return error && typeof error === 'object' && 'id' in error && 'code' in error;
  }

  /**
   * Extract error code from error
   */
  private extractErrorCode(error: Error): string {
    if ((error as any).code) return (error as any).code;
    if ((error as any).response?.status) {
      return `HTTP_${(error as any).response.status}`;
    }
    if (error.name) return error.name.toUpperCase().replace(/\s+/g, '_');
    return 'UNKNOWN_ERROR';
  }

  /**
   * Categorize error
   */
  private categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();
    const code = (error as any).code?.toLowerCase();

    if (message.includes('network') || message.includes('fetch') || code === 'network_error') {
      return ErrorCategory.NETWORK;
    }
    if (message.includes('auth') || message.includes('token') || message.includes('401')) {
      return ErrorCategory.AUTHENTICATION;
    }
    if (message.includes('permission') || message.includes('403')) {
      return ErrorCategory.AUTHORIZATION;
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return ErrorCategory.VALIDATION;
    }
    if ((error as any).response?.status >= 500) {
      return ErrorCategory.SYSTEM;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Determine error severity
   */
  private determineSeverity(error: Error, category: ErrorCategory): ErrorSeverity {
    if (category === ErrorCategory.SYSTEM) return ErrorSeverity.CRITICAL;
    if (category === ErrorCategory.AUTHENTICATION) return ErrorSeverity.HIGH;
    if (category === ErrorCategory.NETWORK) return ErrorSeverity.MEDIUM;
    if (category === ErrorCategory.VALIDATION) return ErrorSeverity.LOW;

    const status = (error as any).response?.status;
    if (status >= 500) return ErrorSeverity.CRITICAL;
    if (status >= 400) return ErrorSeverity.MEDIUM;

    return ErrorSeverity.LOW;
  }

  /**
   * Generate user-friendly error message
   */
  private generateUserMessage(error: Error, category: ErrorCategory): string {
    const defaultMessages: Record<ErrorCategory, string> = {
      [ErrorCategory.NETWORK]: 'Connection problem. Please check your internet connection.',
      [ErrorCategory.VALIDATION]: 'Please check your input and try again.',
      [ErrorCategory.AUTHENTICATION]: 'Please log in to continue.',
      [ErrorCategory.AUTHORIZATION]: 'You don\'t have permission to perform this action.',
      [ErrorCategory.BUSINESS_LOGIC]: 'Unable to complete the operation. Please try again.',
      [ErrorCategory.SYSTEM]: 'Something went wrong. Our team has been notified.',
      [ErrorCategory.USER_INPUT]: 'Invalid input provided. Please check and try again.',
      [ErrorCategory.UNKNOWN]: 'An unexpected error occurred. Please try again.',
    };

    return defaultMessages[category];
  }

  /**
   * Check if error is recoverable
   */
  private isRecoverable(category: ErrorCategory): boolean {
    return [
      ErrorCategory.NETWORK,
      ErrorCategory.VALIDATION,
      ErrorCategory.USER_INPUT,
    ].includes(category);
  }

  /**
   * Check if error is retryable
   */
  private isRetryable(category: ErrorCategory): boolean {
    return [ErrorCategory.NETWORK, ErrorCategory.SYSTEM].includes(category);
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Handle error based on severity
   */
  private handleBySeverity(error: AppError): void {
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        this.showUserNotification(
          'Critical Error',
          error.userMessage || 'A critical error occurred. Please refresh the page.',
          'error'
        );
        this.reportToMonitoring(error);
        break;
      case ErrorSeverity.HIGH:
        this.showUserNotification(
          'Error',
          error.userMessage || 'An error occurred. Please try again.',
          'error'
        );
        break;
      case ErrorSeverity.MEDIUM:
        this.showUserNotification(
          'Warning',
          error.userMessage || 'Something went wrong.',
          'warning'
        );
        break;
      case ErrorSeverity.LOW:
        console.warn('Low severity error:', error);
        break;
    }
  }

  /**
   * Show user notification
   */
  private showUserNotification(
    title: string,
    message: string,
    type: 'info' | 'success' | 'warning' | 'error'
  ): void {
    // Use toast notifications
    const toastOptions = {
      position: 'top-right' as const,
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    };

    const notification = `${title}: ${message}`;

    switch (type) {
      case 'info':
        toast.info(notification, toastOptions);
        break;
      case 'success':
        toast.success(notification, toastOptions);
        break;
      case 'warning':
        toast.warning(notification, toastOptions);
        break;
      case 'error':
        toast.error(notification, toastOptions);
        break;
    }
  }

  /**
   * Log error
   */
  private logError(error: AppError): void {
    const logData = {
      id: error.id,
      code: error.code,
      message: error.message,
      severity: error.severity,
      category: error.category,
      timestamp: error.timestamp,
      context: error.context,
      stack: error.stack,
    };

    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        console.error('[ERROR]', logData);
        break;
      case ErrorSeverity.MEDIUM:
        console.warn('[WARNING]', logData);
        break;
      case ErrorSeverity.LOW:
        console.log('[INFO]', logData);
        break;
    }
  }

  /**
   * Report error to monitoring service
   */
  private async reportToMonitoring(error: AppError): Promise<void> {
    try {
      await fetch('/api/v1/monitoring/errors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...error,
          userAgent: navigator.userAgent,
          url: window.location.href,
          timestamp: error.timestamp.toISOString(),
        }),
      });
    } catch (err) {
      console.error('Failed to report error to monitoring:', err);
    }
  }

  /**
   * Attempt error recovery
   */
  private async attemptRecovery(error: AppError): Promise<void> {
    const strategy = this.recoveryStrategies.get(error.code);
    if (!strategy) {
      // Default retry strategy
      if (error.retryable) {
        await this.retryOperation(error);
      }
      return;
    }

    this.metrics.recoveryAttempts++;

    try {
      await strategy.handler();
      this.metrics.successfulRecoveries++;
      this.showUserNotification(
        'Recovery Successful',
        'The operation has been recovered successfully.',
        'success'
      );
    } catch (recoveryError) {
      console.error('Recovery failed:', recoveryError);
      this.showUserNotification(
        'Recovery Failed',
        'Unable to recover from the error. Please try again manually.',
        'error'
      );
    }
  }

  /**
   * Retry operation
   */
  private async retryOperation(error: AppError): Promise<void> {
    const delay = Math.min(1000 * Math.pow(2, error.retryCount || 0), 30000);

    await new Promise(resolve => setTimeout(resolve, delay));

    // Update retry count
    error.retryCount = (error.retryCount || 0) + 1;

    // Emit retry event
    this.emit('retry', error);
  }

  /**
   * Update metrics
   */
  private updateMetrics(error: AppError): void {
    this.metrics.totalErrors++;

    // Update category metrics
    const categoryCount = this.metrics.errorsByCategory.get(error.category) || 0;
    this.metrics.errorsByCategory.set(error.category, categoryCount + 1);

    // Update severity metrics
    const severityCount = this.metrics.errorsBySeverity.get(error.severity) || 0;
    this.metrics.errorsBySeverity.set(error.severity, severityCount + 1);
  }

  /**
   * Register custom error handler
   */
  registerHandler(code: string, handler: (error: AppError) => void): void {
    this.errorHandlers.set(code, handler);
  }

  /**
   * Register recovery strategy
   */
  registerRecoveryStrategy(code: string, strategy: ErrorRecoveryStrategy): void {
    this.recoveryStrategies.set(code, strategy);
  }

  /**
   * Get error by ID
   */
  getError(id: string): AppError | undefined {
    return this.errors.get(id);
  }

  /**
   * Get all errors
   */
  getAllErrors(): AppError[] {
    return Array.from(this.errors.values());
  }

  /**
   * Clear errors
   */
  clearErrors(): void {
    this.errors.clear();
  }

  /**
   * Get metrics
   */
  getMetrics(): typeof ErrorService.prototype.metrics {
    return { ...this.metrics };
  }

  /**
   * Create error boundary helper
   */
  createErrorBoundary() {
    return {
      handleError: (error: Error, errorInfo: any) => {
        this.handleError(error, {
          severity: ErrorSeverity.HIGH,
          category: ErrorCategory.SYSTEM,
          context: errorInfo,
        });
      },
    };
  }
}

// Singleton instance
export const errorService = ErrorService.getInstance();

// Export convenience functions
export const handleError = (error: Error, options?: Partial<AppError>) =>
  errorService.handleError(error, options);

export const registerErrorHandler = (code: string, handler: (error: AppError) => void) =>
  errorService.registerHandler(code, handler);

export const registerRecoveryStrategy = (code: string, strategy: ErrorRecoveryStrategy) =>
  errorService.registerRecoveryStrategy(code, strategy);

export default errorService;