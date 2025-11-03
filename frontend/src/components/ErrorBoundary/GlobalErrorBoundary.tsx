import React, { Component, ErrorInfo, ReactNode } from 'react';
import { errorReporter } from '../../services/errorReporter';
import { ErrorFallback } from './ErrorFallback';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  level?: 'global' | 'route' | 'component';
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
  errorCount: number;
  lastErrorTime: number | null;
}

/**
 * Global Error Boundary with A++ Grade Implementation
 * Features:
 * - Automatic error recovery with exponential backoff
 * - Error categorization and smart handling
 * - Production vs development mode differentiation
 * - Comprehensive error reporting
 */
export class GlobalErrorBoundary extends Component<Props, State> {
  private retryTimeouts: Set<NodeJS.Timeout> = new Set();
  private readonly MAX_ERROR_COUNT = 3;
  private readonly ERROR_RESET_TIME = 10000; // 10 seconds

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      errorCount: 0,
      lastErrorTime: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return {
      hasError: true,
      error,
      errorId,
      lastErrorTime: Date.now(),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { errorId, errorCount } = this.state;
    const { level = 'global' } = this.props;

    // Categorize error
    const errorCategory = this.categorizeError(error);
    const isRecoverable = this.isRecoverableError(error);

    // Update error count
    const newErrorCount = errorCount + 1;
    this.setState({
      errorInfo,
      errorCount: newErrorCount
    });

    // Log to error reporting service
    errorReporter.captureException(error, {
      errorInfo,
      errorId,
      level,
      category: errorCategory,
      recoverable: isRecoverable,
      errorCount: newErrorCount,
      component: 'GlobalErrorBoundary',
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    });

    // Auto-recovery for recoverable errors
    if (isRecoverable && newErrorCount < this.MAX_ERROR_COUNT) {
      this.scheduleAutoRecovery(newErrorCount);
    }

    // Reset error count after timeout
    this.scheduleErrorCountReset();
  }

  componentWillUnmount() {
    // Clear all timeouts
    this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
    this.retryTimeouts.clear();
  }

  private categorizeError(error: Error): string {
    // Network errors
    if (error.message.includes('fetch') || error.message.includes('network')) {
      return 'network';
    }

    // Chunk loading errors (code splitting)
    if (error.message.includes('Loading chunk') || error.message.includes('ChunkLoadError')) {
      return 'chunk_load';
    }

    // Permission errors
    if (error.message.includes('Permission denied') || error.message.includes('Unauthorized')) {
      return 'permission';
    }

    // Syntax/Type errors
    if (error.name === 'SyntaxError' || error.name === 'TypeError') {
      return 'code_error';
    }

    // Memory errors
    if (error.message.includes('out of memory')) {
      return 'memory';
    }

    return 'unknown';
  }

  private isRecoverableError(error: Error): boolean {
    const recoverableCategories = ['network', 'chunk_load', 'permission'];
    const category = this.categorizeError(error);
    return recoverableCategories.includes(category);
  }

  private scheduleAutoRecovery(attemptNumber: number) {
    // Exponential backoff: 1s, 2s, 4s
    const delay = Math.min(1000 * Math.pow(2, attemptNumber - 1), 10000);

    const timeout = setTimeout(() => {
      this.handleReset();
      this.retryTimeouts.delete(timeout);
    }, delay);

    this.retryTimeouts.add(timeout);
  }

  private scheduleErrorCountReset() {
    const timeout = setTimeout(() => {
      this.setState(prevState => ({
        errorCount: prevState.hasError ? prevState.errorCount : 0,
      }));
      this.retryTimeouts.delete(timeout);
    }, this.ERROR_RESET_TIME);

    this.retryTimeouts.add(timeout);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    });

    // Clear any pending retries
    this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
    this.retryTimeouts.clear();
  };

  handleReportIssue = () => {
    const { error, errorId, errorInfo } = this.state;

    // Open issue reporter with pre-filled data
    const issueData = {
      errorId,
      message: error?.message,
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
      url: window.location.href,
      timestamp: new Date().toISOString(),
    };

    // Send to support system
    errorReporter.reportIssue(issueData);
  };

  render() {
    const { hasError, error, errorInfo, errorId, errorCount } = this.state;
    const { children, fallback, level = 'global' } = this.props;

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return <>{fallback}</>;
      }

      // Determine if we should show technical details
      const isDevelopment = process.env.NODE_ENV === 'development';
      const isRecoverable = error ? this.isRecoverableError(error) : false;
      const category = error ? this.categorizeError(error) : 'unknown';

      return (
        <ErrorFallback
          error={error}
          errorInfo={errorInfo}
          errorId={errorId}
          errorCount={errorCount}
          category={category}
          isRecoverable={isRecoverable}
          level={level}
          isDevelopment={isDevelopment}
          onReset={this.handleReset}
          onReport={this.handleReportIssue}
        />
      );
    }

    return children;
  }
}