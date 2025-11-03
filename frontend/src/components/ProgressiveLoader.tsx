import React, { useState, useEffect, ComponentType, LazyExoticComponent } from 'react';
import LoadingSpinner from './LoadingSpinner';

interface ProgressiveLoaderProps {
  component: LazyExoticComponent<ComponentType<any>>;
  fallback?: ComponentType;
  loadingTimeout?: number;
  loadingMessage?: string;
  errorFallback?: ComponentType<{ error: Error }>;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
  onLoadError?: (error: Error) => void;
  children?: React.ReactNode;
}

const DefaultFallback: React.FC = () => (
  <div style={{ padding: '20px', textAlign: 'center' }}>
    <p>This feature requires JavaScript and modern browser support.</p>
    <a href="/">Return to Home</a>
  </div>
);

const DefaultErrorFallback: React.FC<{ error: Error }> = ({ error }) => (
  <div style={{ padding: '20px', textAlign: 'center', color: '#e53e3e' }}>
    <h3>Failed to load component</h3>
    <p>{error.message}</p>
    <button onClick={() => window.location.reload()}>Reload Page</button>
  </div>
);

export const ProgressiveLoader: React.FC<ProgressiveLoaderProps> = ({
  component: Component,
  fallback: Fallback = DefaultFallback,
  loadingTimeout = 10000,
  loadingMessage = 'Loading...',
  errorFallback: ErrorFallback = DefaultErrorFallback,
  onLoadStart,
  onLoadEnd,
  onLoadError,
  children,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [hasError, setHasError] = useState<Error | null>(null);
  const [showSlowLoadingWarning, setShowSlowLoadingWarning] = useState(false);

  useEffect(() => {
    onLoadStart?.();

    // Timeout timer
    const timeoutTimer = setTimeout(() => {
      setHasTimedOut(true);
      onLoadError?.(new Error('Component loading timed out'));
    }, loadingTimeout);

    // Slow loading warning timer (shows after 3 seconds)
    const warningTimer = setTimeout(() => {
      setShowSlowLoadingWarning(true);
    }, 3000);

    // Cleanup function
    return () => {
      clearTimeout(timeoutTimer);
      clearTimeout(warningTimer);
      onLoadEnd?.();
    };
  }, [loadingTimeout, onLoadStart, onLoadEnd, onLoadError]);

  // Check browser support for dynamic imports
  const supportsDynamicImport = 'noModule' in document.createElement('script');

  // Check for specific browser features we need
  const supportsIntersectionObserver = 'IntersectionObserver' in window;
  const supportsPromise = 'Promise' in window;
  const supportsFetch = 'fetch' in window;

  const hasRequiredFeatures =
    supportsDynamicImport &&
    supportsIntersectionObserver &&
    supportsPromise &&
    supportsFetch;

  // If browser doesn't support required features, show fallback
  if (!hasRequiredFeatures) {
    return <Fallback />;
  }

  // If loading timed out, show fallback
  if (hasTimedOut) {
    return (
      <div className="progressive-loader-timeout">
        <LoadingSpinner
          size="large"
          message="Taking longer than expected..."
          aria-label="Loading is taking longer than expected"
        />
        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <p>This is taking longer than usual.</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 16px',
              marginTop: '10px',
              cursor: 'pointer',
              borderRadius: '4px',
              border: '1px solid #667eea',
              background: 'white',
              color: '#667eea',
            }}
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  // If there's an error, show error fallback
  if (hasError) {
    return <ErrorFallback error={hasError} />;
  }

  // Normal loading state with progressive enhancement
  return (
    <React.Suspense
      fallback={
        <div className="progressive-loader" role="status" aria-live="polite">
          <LoadingSpinner
            size="medium"
            message={
              showSlowLoadingWarning
                ? 'Still loading... Please wait'
                : loadingMessage
            }
            aria-label={loadingMessage}
          />
          {showSlowLoadingWarning && (
            <div
              style={{
                marginTop: '10px',
                padding: '10px',
                background: '#fef5e7',
                borderRadius: '4px',
                fontSize: '14px',
                color: '#856404',
                maxWidth: '300px',
                margin: '10px auto',
              }}
            >
              <p>⚠️ Slow connection detected</p>
              <p style={{ marginTop: '5px', fontSize: '12px' }}>
                The content is loading slowly. Please check your internet
                connection.
              </p>
            </div>
          )}
        </div>
      }
    >
      <ErrorBoundary
        onError={(error) => {
          setHasError(error);
          onLoadError?.(error);
        }}
      >
        <Component>{children}</Component>
      </ErrorBoundary>
    </React.Suspense>
  );
};

// Error boundary for catching errors during component rendering
class ErrorBoundary extends React.Component<
  {
    children: React.ReactNode;
    onError: (error: Error) => void;
  },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onError: (error: Error) => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      return null; // Parent will handle error display
    }

    return this.props.children;
  }
}

// HOC for adding progressive loading to any lazy component
export function withProgressiveLoading<P extends object>(
  LazyComponent: LazyExoticComponent<ComponentType<P>>,
  options: Partial<ProgressiveLoaderProps> = {}
): React.FC<P> {
  return (props: P) => (
    <ProgressiveLoader component={LazyComponent} {...options}>
      {props}
    </ProgressiveLoader>
  );
}

export default ProgressiveLoader;