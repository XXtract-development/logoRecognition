// Error Boundary Component for graceful error handling
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Result, Button, Typography, Collapse } from 'antd';
import { ReloadOutlined, BugOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;
const { Panel } = Collapse;

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      errorCount: 0,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Update state with error details
    this.setState((prevState) => ({
      error,
      errorInfo,
      errorCount: prevState.errorCount + 1,
    }));

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Send error to monitoring service (if configured)
    this.logErrorToService(error, errorInfo);
  }

  logErrorToService(error: Error, errorInfo: ErrorInfo) {
    // This would send to your error monitoring service (e.g., Sentry)
    const errorData = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
    };

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Error logged:', errorData);
    }

    // In production, send to monitoring service
    // Example: window.Sentry?.captureException(error);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    });
  };

  render() {
    if (this.state.hasError) {
      // Check if too many errors occurred (possible infinite loop)
      if (this.state.errorCount > 5) {
        return (
          <Result
            status="error"
            title="Multiple Errors Detected"
            subTitle="The application encountered multiple errors and cannot recover. Please refresh the page."
            extra={[
              <Button
                type="primary"
                key="reload"
                onClick={() => window.location.reload()}
                icon={<ReloadOutlined />}
              >
                Refresh Page
              </Button>,
            ]}
          />
        );
      }

      // Return custom fallback if provided
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      // Default error UI
      return (
        <Result
          status="error"
          title="Something went wrong"
          subTitle="An unexpected error occurred. The error has been logged and we'll look into it."
          extra={[
            <Button type="primary" key="reset" onClick={this.handleReset} icon={<ReloadOutlined />}>
              Try Again
            </Button>,
            <Button key="home" onClick={() => (window.location.href = '/')}>
              Go Home
            </Button>,
          ]}
        >
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <Collapse ghost>
              <Panel header="Error Details (Development Only)" key="1">
                <Paragraph>
                  <Text strong>Error Message:</Text>
                  <br />
                  <Text code>{this.state.error.message}</Text>
                </Paragraph>
                <Paragraph>
                  <Text strong>Stack Trace:</Text>
                  <pre style={{ fontSize: '12px', overflow: 'auto' }}>
                    {this.state.error.stack}
                  </pre>
                </Paragraph>
                {this.state.errorInfo && (
                  <Paragraph>
                    <Text strong>Component Stack:</Text>
                    <pre style={{ fontSize: '12px', overflow: 'auto' }}>
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </Paragraph>
                )}
              </Panel>
            </Collapse>
          )}
        </Result>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;