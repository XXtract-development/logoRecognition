import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component for graceful error handling
 * Catches JavaScript errors in child component tree and displays fallback UI
 */
class TrainingReadinessErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('TrainingReadinessOverview error:', error, errorInfo);

    // Log to error reporting service if available
    if ((window as any).reportError) {
      (window as any).reportError(error.message);
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Alert
          message="Something went wrong"
          description={
            <div>
              <p>The Training Readiness Overview encountered an error.</p>
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details style={{ marginTop: 8 }}>
                  <summary>Error details</summary>
                  <pre style={{ fontSize: 12, marginTop: 8 }}>
                    {this.state.error.toString()}
                  </pre>
                </details>
              )}
            </div>
          }
          type="error"
          action={
            <Button
              size="small"
              danger
              icon={<ReloadOutlined />}
              onClick={this.handleReset}
            >
              Try Again
            </Button>
          }
        />
      );
    }

    return this.props.children;
  }
}

export default TrainingReadinessErrorBoundary;