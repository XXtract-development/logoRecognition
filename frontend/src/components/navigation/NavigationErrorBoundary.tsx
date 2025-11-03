import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, Button, Space } from 'antd';
import { ReloadOutlined, HomeOutlined, WarningOutlined } from '@ant-design/icons';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
}

class NavigationErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to error reporting service
    console.error('Navigation Error:', error, errorInfo);

    // Store error details
    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1,
    }));

    // Report to error monitoring service (e.g., Sentry, LogRocket)
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const errorLog = {
          timestamp: new Date().toISOString(),
          error: error.toString(),
          stack: error.stack,
          componentStack: errorInfo.componentStack,
        };

        const existingLogs = window.localStorage.getItem('navigationErrors');
        const logs = existingLogs ? JSON.parse(existingLogs) : [];
        logs.push(errorLog);

        // Keep only last 10 errors
        if (logs.length > 10) {
          logs.shift();
        }

        window.localStorage.setItem('navigationErrors', JSON.stringify(logs));
      } catch (e) {
        console.error('Failed to log error to localStorage:', e);
      }
    }
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });

    // Clear error logs if too many retries
    if (this.state.errorCount > 3) {
      try {
        window.localStorage.removeItem('navigationErrors');
        window.localStorage.removeItem('menuCollapsed');
      } catch (e) {
        console.error('Failed to clear error logs:', e);
      }
    }
  };

  handleNavigateHome = (): void => {
    this.handleReset();
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            padding: '24px',
            background: '#f5f5f5',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Alert
            message="Navigation Error"
            description={
              <div>
                <p>An error occurred in the navigation component.</p>
                {this.state.error && (
                  <details style={{ marginTop: '8px' }}>
                    <summary style={{ cursor: 'pointer', color: '#1890ff' }}>
                      Error Details
                    </summary>
                    <pre
                      style={{
                        marginTop: '8px',
                        padding: '8px',
                        background: '#f0f0f0',
                        borderRadius: '4px',
                        fontSize: '12px',
                        overflow: 'auto',
                        maxHeight: '200px',
                      }}
                    >
                      {this.state.error.toString()}
                      {this.state.errorInfo?.componentStack}
                    </pre>
                  </details>
                )}
                {this.state.errorCount > 2 && (
                  <p style={{ marginTop: '8px', color: '#ff4d4f' }}>
                    Multiple errors detected. Consider refreshing the page.
                  </p>
                )}
              </div>
            }
            type="error"
            icon={<WarningOutlined />}
            showIcon
            style={{ maxWidth: '600px', width: '100%' }}
          />

          <Space style={{ marginTop: '24px' }}>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={this.handleReset}
              disabled={this.state.errorCount > 5}
            >
              {this.state.errorCount > 5 ? 'Too Many Retries' : 'Try Again'}
            </Button>
            <Button
              icon={<HomeOutlined />}
              onClick={this.handleNavigateHome}
            >
              Go to Home
            </Button>
          </Space>

          {this.state.errorCount > 5 && (
            <Alert
              message="Please refresh the page"
              type="warning"
              style={{ marginTop: '16px' }}
              action={
                <Button
                  size="small"
                  onClick={() => window.location.reload()}
                >
                  Refresh Page
                </Button>
              }
            />
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default NavigationErrorBoundary;