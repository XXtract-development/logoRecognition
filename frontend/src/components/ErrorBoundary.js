/**
 * Enhanced Error Boundary Component
 * US-013: Error Boundaries & Recovery - Comprehensive error boundaries
 */

import React from 'react';
import { Button, Card, Typography, Space, Alert, Collapse } from 'antd';
import {
  ReloadOutlined,
  BugOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import errorLogger from '../utils/errorLogging';
import ErrorFallback from './ErrorFallback';

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0,
      isRecovering: false,
      recoveryAttempts: [],
      lastErrorTime: null,
    };

    this.maxRetries = props.maxRetries || 3;
    this.retryDelay = props.retryDelay || 1000;
    this.errorTypes = {
      CHUNK_LOAD_ERROR: 'ChunkLoadError',
      NETWORK_ERROR: 'NetworkError',
      COMPONENT_ERROR: 'ComponentError',
      PERMISSION_ERROR: 'PermissionError',
      TIMEOUT_ERROR: 'TimeoutError',
    };

    // Bind methods
    this.handleRetry = this.handleRetry.bind(this);
    this.handleReportError = this.handleReportError.bind(this);
    this.handleReload = this.handleReload.bind(this);
    this.clearError = this.clearError.bind(this);
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      lastErrorTime: Date.now(),
    };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details
    this.setState({
      errorInfo,
    });

    // Determine error type
    const errorType = this.determineErrorType(error);

    // Log to error service
    this.logError(error, errorInfo, errorType);

    // Attempt automatic recovery for certain error types
    this.attemptAutoRecovery(error, errorType);
  }

  componentDidUpdate(prevProps, prevState) {
    // Clear error state when children change (for recovery)
    if (!prevState.hasError && this.state.hasError && this.props.children !== prevProps.children) {
      this.clearError();
    }
  }

  /**
   * Determine the type of error for better handling
   */
  determineErrorType(error) {
    const errorMessage = error.message.toLowerCase();
    const errorStack = error.stack?.toLowerCase() || '';

    if (errorMessage.includes('loading chunk') || errorMessage.includes('loading css chunk')) {
      return this.errorTypes.CHUNK_LOAD_ERROR;
    }

    if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      return this.errorTypes.NETWORK_ERROR;
    }

    if (errorMessage.includes('permission') || errorMessage.includes('unauthorized')) {
      return this.errorTypes.PERMISSION_ERROR;
    }

    if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
      return this.errorTypes.TIMEOUT_ERROR;
    }

    return this.errorTypes.COMPONENT_ERROR;
  }

  /**
   * Log error to external service and console
   */
  async logError(error, errorInfo, errorType) {
    const errorData = {
      id: this.state.errorId,
      type: errorType,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      props: this.props,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      retryCount: this.state.retryCount,
      level: this.getErrorLevel(errorType),
    };

    try {
      // Log to external service
      await errorLogger.logError(errorData);

      // Log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.group(`🚨 Error Boundary Caught Error [${errorType}]`);
        console.error('Error:', error);
        console.error('Error Info:', errorInfo);
        console.error('Error Data:', errorData);
        console.groupEnd();
      }
    } catch (loggingError) {
      console.error('Failed to log error:', loggingError);
    }
  }

  /**
   * Get error severity level
   */
  getErrorLevel(errorType) {
    const levels = {
      [this.errorTypes.CHUNK_LOAD_ERROR]: 'warning',
      [this.errorTypes.NETWORK_ERROR]: 'warning',
      [this.errorTypes.COMPONENT_ERROR]: 'error',
      [this.errorTypes.PERMISSION_ERROR]: 'error',
      [this.errorTypes.TIMEOUT_ERROR]: 'warning',
    };

    return levels[errorType] || 'error';
  }

  /**
   * Attempt automatic recovery based on error type
   */
  async attemptAutoRecovery(error, errorType) {
    const { autoRecover = true } = this.props;

    if (!autoRecover || this.state.retryCount >= this.maxRetries) {
      return;
    }

    const recoveryStrategies = {
      [this.errorTypes.CHUNK_LOAD_ERROR]: this.recoverFromChunkError,
      [this.errorTypes.NETWORK_ERROR]: this.recoverFromNetworkError,
      [this.errorTypes.TIMEOUT_ERROR]: this.recoverFromTimeoutError,
    };

    const recoveryStrategy = recoveryStrategies[errorType];

    if (recoveryStrategy) {
      this.setState({ isRecovering: true });

      try {
        await recoveryStrategy.call(this, error);
        console.log(`✅ Auto-recovery successful for ${errorType}`);
      } catch (recoveryError) {
        console.error(`❌ Auto-recovery failed for ${errorType}:`, recoveryError);
        this.setState({ isRecovering: false });
      }
    }
  }

  /**
   * Recover from chunk loading errors
   */
  async recoverFromChunkError(error) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          // Force reload the page to get fresh chunks
          window.location.reload();
          resolve();
        } catch (reloadError) {
          reject(reloadError);
        }
      }, this.retryDelay);
    });
  }

  /**
   * Recover from network errors
   */
  async recoverFromNetworkError(error) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Check network connectivity
        if (navigator.onLine) {
          this.handleRetry();
          resolve();
        } else {
          reject(new Error('Still offline'));
        }
      }, this.retryDelay * 2); // Longer delay for network issues
    });
  }

  /**
   * Recover from timeout errors
   */
  async recoverFromTimeoutError(error) {
    return new Promise((resolve) => {
      setTimeout(() => {
        this.handleRetry();
        resolve();
      }, this.retryDelay);
    });
  }

  /**
   * Handle manual retry
   */
  async handleRetry() {
    if (this.state.retryCount >= this.maxRetries) {
      console.warn('Maximum retry attempts reached');
      return;
    }

    this.setState({
      isRecovering: true,
      retryCount: this.state.retryCount + 1,
    });

    // Record retry attempt
    const attemptData = {
      timestamp: Date.now(),
      retryCount: this.state.retryCount + 1,
      errorType: this.determineErrorType(this.state.error),
    };

    this.setState(prevState => ({
      recoveryAttempts: [...prevState.recoveryAttempts, attemptData],
    }));

    try {
      // Wait for retry delay
      await new Promise(resolve => setTimeout(resolve, this.retryDelay));

      // Clear error state to retry rendering
      this.clearError();

      // Notify parent component of retry
      if (this.props.onRetry) {
        this.props.onRetry(attemptData);
      }

      console.log(`🔄 Retry attempt ${this.state.retryCount + 1}/${this.maxRetries}`);
    } catch (retryError) {
      console.error('Retry failed:', retryError);
      this.setState({ isRecovering: false });
    }
  }

  /**
   * Clear error state
   */
  clearError() {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      isRecovering: false,
    });
  }

  /**
   * Handle error reporting
   */
  async handleReportError() {
    try {
      const errorReport = {
        id: this.state.errorId,
        error: this.state.error.message,
        stack: this.state.error.stack,
        componentStack: this.state.errorInfo.componentStack,
        retryCount: this.state.retryCount,
        recoveryAttempts: this.state.recoveryAttempts,
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      };

      await errorLogger.reportError(errorReport);

      // Show success message
      if (this.props.onErrorReported) {
        this.props.onErrorReported(errorReport);
      }

      console.log('✅ Error reported successfully');
    } catch (reportError) {
      console.error('❌ Failed to report error:', reportError);
    }
  }

  /**
   * Handle page reload
   */
  handleReload() {
    // Log reload action
    errorLogger.logAction('error_boundary_reload', {
      errorId: this.state.errorId,
      retryCount: this.state.retryCount,
    });

    window.location.reload();
  }

  /**
   * Get user-friendly error message
   */
  getUserFriendlyMessage() {
    const errorType = this.determineErrorType(this.state.error);

    const messages = {
      [this.errorTypes.CHUNK_LOAD_ERROR]: {
        title: 'Loading Issue',
        description: 'There was a problem loading part of the application. This usually happens after an update.',
        action: 'Please refresh the page to get the latest version.',
      },
      [this.errorTypes.NETWORK_ERROR]: {
        title: 'Connection Problem',
        description: 'Unable to connect to the server. Please check your internet connection.',
        action: 'Try again when your connection is restored.',
      },
      [this.errorTypes.PERMISSION_ERROR]: {
        title: 'Access Denied',
        description: 'You don\'t have permission to access this feature.',
        action: 'Please contact support if you believe this is an error.',
      },
      [this.errorTypes.TIMEOUT_ERROR]: {
        title: 'Request Timeout',
        description: 'The request took too long to complete.',
        action: 'Please try again or check your connection.',
      },
      [this.errorTypes.COMPONENT_ERROR]: {
        title: 'Unexpected Error',
        description: 'An unexpected error occurred in the application.',
        action: 'Please try refreshing the page or contact support.',
      },
    };

    return messages[errorType] || messages[this.errorTypes.COMPONENT_ERROR];
  }

  render() {
    if (this.state.hasError) {
      const userMessage = this.getUserFriendlyMessage();
      const canRetry = this.state.retryCount < this.maxRetries;
      const errorLevel = this.getErrorLevel(this.determineErrorType(this.state.error));

      // Use custom fallback component if provided
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.state.errorInfo, {
          retry: this.handleRetry,
          reload: this.handleReload,
          report: this.handleReportError,
          canRetry,
          retryCount: this.state.retryCount,
          maxRetries: this.maxRetries,
          isRecovering: this.state.isRecovering,
        });
      }

      // Use ErrorFallback component if available
      if (this.props.useErrorFallback !== false) {
        return (
          <ErrorFallback
            error={this.state.error}
            errorInfo={this.state.errorInfo}
            onRetry={this.handleRetry}
            onReload={this.handleReload}
            onReport={this.handleReportError}
            canRetry={canRetry}
            retryCount={this.state.retryCount}
            maxRetries={this.maxRetries}
            isRecovering={this.state.isRecovering}
            userMessage={userMessage}
            errorLevel={errorLevel}
          />
        );
      }

      // Default error UI
      return (
        <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
          <Card>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <ExclamationCircleOutlined
                style={{
                  fontSize: '48px',
                  color: errorLevel === 'error' ? '#ff4d4f' : '#faad14',
                  marginBottom: '16px'
                }}
              />
              <Title level={3}>{userMessage.title}</Title>
              <Paragraph>{userMessage.description}</Paragraph>
              <Text type="secondary">{userMessage.action}</Text>
            </div>

            <Alert
              message={`Error ID: ${this.state.errorId}`}
              description={this.state.error.message}
              type={errorLevel}
              showIcon
              style={{ marginBottom: '24px' }}
            />

            <Space size="middle" style={{ width: '100%', justifyContent: 'center' }}>
              {canRetry && (
                <Button
                  type="primary"
                  icon={<ReloadOutlined />}
                  onClick={this.handleRetry}
                  loading={this.state.isRecovering}
                >
                  Try Again ({this.state.retryCount}/{this.maxRetries})
                </Button>
              )}

              <Button
                icon={<ReloadOutlined />}
                onClick={this.handleReload}
              >
                Refresh Page
              </Button>

              <Button
                icon={<BugOutlined />}
                onClick={this.handleReportError}
              >
                Report Issue
              </Button>
            </Space>

            {/* Developer Information */}
            {process.env.NODE_ENV === 'development' && (
              <Collapse style={{ marginTop: '24px' }}>
                <Panel header="Developer Information" key="dev-info">
                  <div style={{ background: '#f5f5f5', padding: '12px', borderRadius: '4px' }}>
                    <Text strong>Error:</Text>
                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>
                      {this.state.error.stack}
                    </pre>

                    <Text strong>Component Stack:</Text>
                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>
                      {this.state.errorInfo.componentStack}
                    </pre>

                    {this.state.recoveryAttempts.length > 0 && (
                      <>
                        <Text strong>Recovery Attempts:</Text>
                        <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>
                          {JSON.stringify(this.state.recoveryAttempts, null, 2)}
                        </pre>
                      </>
                    )}
                  </div>
                </Panel>
              </Collapse>
            )}
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;