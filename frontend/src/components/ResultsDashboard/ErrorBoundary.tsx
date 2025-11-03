import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, Button, Collapse } from 'antd';
import { ReloadOutlined, BugOutlined } from '@ant-design/icons';
import './ErrorBoundary.css';

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

export class ResultsDashboardErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to error reporting service
    if (process.env.NODE_ENV === 'development') {
      // In development, log to console (but not in production)
      // console.error('ResultsDashboard Error:', error, errorInfo);
    }

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Update state with error details
    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1
    }));

    // Report to error tracking service (e.g., Sentry)
    if (window.Sentry) {
      window.Sentry.captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack
          }
        }
      });
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { hasError, error, errorInfo, errorCount } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      // Custom fallback UI
      if (fallback) {
        return <>{fallback}</>;
      }

      // Default error UI
      return (
        <div className="error-boundary-container" role="alert">
          <Alert
            message="Something went wrong"
            description="The Results Dashboard encountered an error. You can try resetting the component or reloading the page."
            type="error"
            showIcon
            icon={<BugOutlined />}
            action={
              <div className="error-boundary-actions">
                <Button
                  size="small"
                  onClick={this.handleReset}
                  icon={<ReloadOutlined />}
                  aria-label="Reset component"
                >
                  Reset
                </Button>
                <Button
                  size="small"
                  type="primary"
                  onClick={this.handleReload}
                  icon={<ReloadOutlined />}
                  aria-label="Reload page"
                >
                  Reload Page
                </Button>
              </div>
            }
          />

          {process.env.NODE_ENV === 'development' && error && (
            <Collapse
              ghost
              className="error-details"
              defaultActiveKey={errorCount === 1 ? ['1'] : []}
            >
              <Panel header="Error Details (Development Only)" key="1">
                <div className="error-stack">
                  <h4>Error Message:</h4>
                  <pre>{error.toString()}</pre>

                  {error.stack && (
                    <>
                      <h4>Stack Trace:</h4>
                      <pre className="stack-trace">{error.stack}</pre>
                    </>
                  )}

                  {errorInfo?.componentStack && (
                    <>
                      <h4>Component Stack:</h4>
                      <pre className="component-stack">{errorInfo.componentStack}</pre>
                    </>
                  )}
                </div>
              </Panel>
            </Collapse>
          )}

          {errorCount > 2 && (
            <Alert
              message="Multiple Errors Detected"
              description="The component has encountered multiple errors. Please reload the page for the best experience."
              type="warning"
              showIcon
              className="multiple-errors-warning"
            />
          )}
        </div>
      );
    }

    return children;
  }
}

// Specific error boundary for canvas components
export class CanvasErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Specific handling for canvas errors
    if (error.message.includes('WebGL') || error.message.includes('canvas')) {
      // Fall back to basic rendering
      this.setState({
        hasError: true,
        error,
        errorInfo
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert
          message="Canvas Rendering Error"
          description="Unable to render the image canvas. Falling back to basic view. Your browser may not support WebGL."
          type="warning"
          showIcon
          className="canvas-error"
        />
      );
    }

    return this.props.children;
  }
}

// Type declaration for Sentry (if using)
declare global {
  interface Window {
    Sentry?: {
      captureException: (error: Error, context?: any) => void;
    };
  }
}