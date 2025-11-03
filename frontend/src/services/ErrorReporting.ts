import { ErrorInfo } from 'react';
import { ErrorClassification, ErrorBudgetStatus, PreservedState } from '../components/ErrorBoundary/EnterpriseErrorBoundary';

interface ErrorReport {
  error: Error;
  errorInfo: ErrorInfo;
  errorId: string;
  classification: ErrorClassification;
  budgetStatus: ErrorBudgetStatus;
  userState: PreservedState;
  level: string;
  criticalPath?: boolean;
  recoveryAttempts: number;
  emergencyMode: boolean;
  userAgent: string;
  url: string;
  timestamp: number;
  sessionId: string;
  userId?: string;
  buildVersion?: string;
  featureFlags?: Record<string, boolean>;
}

interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  level: string;
}

interface UserFeedback {
  errorId: string;
  message: string;
  sentiment: 'frustrated' | 'confused' | 'understanding' | 'satisfied';
  wouldRecommend: boolean;
  contactMe: boolean;
  email?: string;
  additionalContext?: string;
}

interface RecoveryMetric {
  errorId: string;
  attempts: number;
  classification: ErrorClassification;
  success?: boolean;
  duration?: number;
}

export class ErrorReporting {
  private readonly ENDPOINT = '/api/errors';
  private readonly BATCH_SIZE = 10;
  private readonly BATCH_INTERVAL = 5000; // 5 seconds
  private errorQueue: ErrorReport[] = [];
  private performanceMetrics: PerformanceMetric[] = [];
  private batchTimer?: NodeJS.Timeout;
  private readonly MAX_RETRIES = 3;
  private readonly TELEMETRY_ENABLED = process.env.REACT_APP_TELEMETRY !== 'false';

  constructor() {
    this.startBatchTimer();
    this.setupBeforeUnloadHandler();
  }

  private startBatchTimer() {
    this.batchTimer = setInterval(() => {
      this.flushErrorQueue();
      this.flushPerformanceMetrics();
    }, this.BATCH_INTERVAL);
  }

  private setupBeforeUnloadHandler() {
    window.addEventListener('beforeunload', () => {
      // Send any remaining errors before page unload
      this.flushErrorQueue(true);
      this.flushPerformanceMetrics(true);
    });
  }

  async reportError(report: ErrorReport): Promise<void> {
    // Sanitize error data
    const sanitizedReport = this.sanitizeErrorReport(report);

    // Add to queue
    this.errorQueue.push(sanitizedReport);

    // Send immediately if critical
    if (report.classification.severity === 'critical' || report.emergencyMode) {
      await this.sendErrorReport(sanitizedReport);
    } else if (this.errorQueue.length >= this.BATCH_SIZE) {
      await this.flushErrorQueue();
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.group(`🚨 Error Report: ${report.errorId}`);
      console.error('Error:', report.error);
      console.log('Classification:', report.classification);
      console.log('Budget Status:', report.budgetStatus);
      console.log('User State:', report.userState);
      console.groupEnd();
    }
  }

  private sanitizeErrorReport(report: ErrorReport): ErrorReport {
    // Remove sensitive data from error reports
    const sanitized = { ...report };

    // Remove sensitive patterns from error messages
    sanitized.error = {
      ...report.error,
      message: this.removeSensitiveData(report.error.message),
      stack: report.error.stack ? this.removeSensitiveData(report.error.stack) : undefined,
    } as Error;

    // Remove sensitive data from user state
    if (sanitized.userState?.formData) {
      sanitized.userState.formData = this.sanitizeFormData(sanitized.userState.formData);
    }

    // Remove auth tokens from feature flags
    if (sanitized.featureFlags) {
      const { authToken, apiKey, ...safeFlags } = sanitized.featureFlags;
      sanitized.featureFlags = safeFlags;
    }

    return sanitized;
  }

  private removeSensitiveData(text: string): string {
    // Remove common sensitive patterns
    const patterns = [
      /Bearer\s+[A-Za-z0-9\-._~+\/]+=*/gi, // Bearer tokens
      /api[_-]?key[_-]?[=:]\s*[A-Za-z0-9\-._~+\/]+=*/gi, // API keys
      /password[=:]\s*[^\s&]*/gi, // Passwords
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, // Email addresses
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, // Credit card numbers
      /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
    ];

    let sanitized = text;
    patterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    });

    return sanitized;
  }

  private sanitizeFormData(formData: Record<string, any>): Record<string, any> {
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard', 'ssn', 'cvv'];
    const sanitized = { ...formData };

    Object.keys(sanitized).forEach(key => {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeFormData(sanitized[key]);
      }
    });

    return sanitized;
  }

  private async flushErrorQueue(immediate = false): Promise<void> {
    if (this.errorQueue.length === 0) return;

    const batch = [...this.errorQueue];
    this.errorQueue = [];

    try {
      await this.sendErrorBatch(batch, immediate);
    } catch (error) {
      console.error('Failed to send error batch:', error);

      // Put critical errors back in queue for retry
      const criticalErrors = batch.filter(
        e => e.classification.severity === 'critical'
      );

      if (criticalErrors.length > 0) {
        this.errorQueue.unshift(...criticalErrors);
      }
    }
  }

  private async sendErrorBatch(batch: ErrorReport[], immediate = false): Promise<void> {
    if (!this.TELEMETRY_ENABLED && process.env.NODE_ENV !== 'development') {
      return;
    }

    const payload = {
      errors: batch,
      batchId: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      immediate,
      environment: process.env.NODE_ENV,
      timestamp: Date.now(),
    };

    await this.sendWithRetry(
      `${this.ENDPOINT}/batch`,
      payload,
      immediate ? 1 : this.MAX_RETRIES
    );
  }

  private async sendErrorReport(report: ErrorReport): Promise<void> {
    if (!this.TELEMETRY_ENABLED && process.env.NODE_ENV !== 'development') {
      return;
    }

    await this.sendWithRetry(
      `${this.ENDPOINT}/single`,
      report,
      1 // Single attempt for immediate reports
    );
  }

  private async sendWithRetry(
    url: string,
    data: any,
    maxRetries: number
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Error-Report': 'true',
          },
          body: JSON.stringify(data),
        });

        if (response.ok) {
          return;
        }

        // Don't retry on client errors
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`Client error: ${response.status}`);
        }

        lastError = new Error(`Server error: ${response.status}`);

      } catch (error) {
        lastError = error as Error;

        // Don't retry on network errors in immediate mode
        if (maxRetries === 1) {
          throw error;
        }
      }

      // Exponential backoff for retries
      if (attempt < maxRetries) {
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }

    if (lastError) {
      throw lastError;
    }
  }

  recordPerformanceMetric(metric: PerformanceMetric): void {
    this.performanceMetrics.push(metric);

    if (this.performanceMetrics.length >= this.BATCH_SIZE) {
      this.flushPerformanceMetrics();
    }
  }

  private async flushPerformanceMetrics(immediate = false): Promise<void> {
    if (this.performanceMetrics.length === 0) return;

    const batch = [...this.performanceMetrics];
    this.performanceMetrics = [];

    try {
      await this.sendPerformanceMetrics(batch, immediate);
    } catch (error) {
      console.error('Failed to send performance metrics:', error);
    }
  }

  private async sendPerformanceMetrics(
    metrics: PerformanceMetric[],
    immediate = false
  ): Promise<void> {
    if (!this.TELEMETRY_ENABLED) return;

    const payload = {
      metrics,
      timestamp: Date.now(),
      environment: process.env.NODE_ENV,
    };

    await fetch(`${this.ENDPOINT}/metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(error => {
      console.error('Failed to send performance metrics:', error);
    });
  }

  async submitUserFeedback(errorId: string, feedback: Partial<UserFeedback>): Promise<void> {
    const fullFeedback: UserFeedback = {
      errorId,
      message: feedback.message || '',
      sentiment: feedback.sentiment || 'confused',
      wouldRecommend: feedback.wouldRecommend || false,
      contactMe: feedback.contactMe || false,
      email: feedback.email,
      additionalContext: feedback.additionalContext,
    };

    try {
      await fetch(`${this.ENDPOINT}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullFeedback),
      });

      // Show confirmation to user
      this.showFeedbackConfirmation();

    } catch (error) {
      console.error('Failed to submit user feedback:', error);
    }
  }

  private showFeedbackConfirmation(): void {
    // Create a temporary notification
    const notification = document.createElement('div');
    notification.className = 'error-feedback-confirmation';
    notification.textContent = 'Thank you for your feedback! We\'ll use it to improve our service.';
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 16px;
      border-radius: 4px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 5000);
  }

  async recordRecoverySuccess(metric: RecoveryMetric): Promise<void> {
    const successMetric = {
      ...metric,
      success: true,
      timestamp: Date.now(),
    };

    try {
      await fetch(`${this.ENDPOINT}/recovery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(successMetric),
      });
    } catch (error) {
      console.error('Failed to record recovery success:', error);
    }
  }

  async recordRecoveryFailure(metric: RecoveryMetric): Promise<void> {
    const failureMetric = {
      ...metric,
      success: false,
      timestamp: Date.now(),
    };

    try {
      await fetch(`${this.ENDPOINT}/recovery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(failureMetric),
      });
    } catch (error) {
      console.error('Failed to record recovery failure:', error);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  destroy(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }

    // Flush any remaining data
    this.flushErrorQueue(true);
    this.flushPerformanceMetrics(true);
  }
}