import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ChunkLoader } from '../utils/chunkLoader';
import './ChunkErrorBoundary.css';

interface Props {
  children: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
  isRetrying: boolean;
}

export class ChunkErrorBoundary extends Component<Props, State> {
  private readonly MAX_RETRIES = 3;
  private readonly CHUNK_LOAD_ERROR_PATTERN = /Loading( CSS)? chunk [\d]+ failed/;
  private readonly CHUNK_LOAD_ERROR_TYPES = [
    'ChunkLoadError',
    'Loading chunk',
    'Failed to fetch dynamically imported module',
    'Failed to import',
  ];

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      retryCount: 0,
      isRetrying: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Check if this is a chunk loading error
    const isChunkError = this.isChunkLoadError(error);

    if (isChunkError) {
      console.warn('Chunk load error detected:', error.message);
      this.handleChunkLoadError();
    } else {
      // For non-chunk errors, let parent error boundary handle it
      this.props.onError?.(error, errorInfo);
    }

    // Log error details
    this.logError(error, errorInfo, isChunkError);
  }

  private isChunkLoadError(error: Error): boolean {
    const errorMessage = error.message || error.toString();

    // Check against known patterns
    if (this.CHUNK_LOAD_ERROR_PATTERN.test(errorMessage)) {
      return true;
    }

    // Check against known error types
    return this.CHUNK_LOAD_ERROR_TYPES.some(type =>
      errorMessage.includes(type)
    );
  }

  private handleChunkLoadError() {
    const { retryCount } = this.state;

    if (retryCount < this.MAX_RETRIES) {
      this.setState({ isRetrying: true });

      // Try different recovery strategies based on retry count
      setTimeout(() => {
        switch (retryCount) {
          case 0:
            // First retry: Simple page reload
            this.reloadChunks();
            break;
          case 1:
            // Second retry: Clear cache and reload
            this.clearCacheAndReload();
            break;
          case 2:
            // Third retry: Hard refresh
            this.hardRefresh();
            break;
          default:
            this.showFallback();
        }
      }, 1000 * (retryCount + 1)); // Exponential backoff
    } else {
      this.showFallback();
    }
  }

  private reloadChunks() {
    console.log('Attempting to reload chunks...');

    // Clear the chunk cache
    ChunkLoader.clearCache();

    // Reset error state and increment retry
    this.setState(prevState => ({
      hasError: false,
      error: null,
      retryCount: prevState.retryCount + 1,
      isRetrying: false,
    }));
  }

  private clearCacheAndReload() {
    console.log('Clearing cache and reloading...');

    // Clear service worker cache if available
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => {
          if (name.includes('chunk') || name.includes('webpack')) {
            caches.delete(name);
          }
        });
      });
    }

    // Clear chunk loader cache
    ChunkLoader.clearCache();

    // Clear session storage related to chunks
    Object.keys(sessionStorage).forEach(key => {
      if (key.includes('chunk') || key.includes('webpack')) {
        sessionStorage.removeItem(key);
      }
    });

    // Reload
    this.reloadChunks();
  }

  private hardRefresh() {
    console.log('Performing hard refresh...');

    // Try to preserve user state before refresh
    this.preserveUserState();

    // Force browser to bypass cache
    window.location.reload();
  }

  private preserveUserState() {
    // Save current state to session storage
    const stateToPreserve = {
      url: window.location.href,
      scrollPosition: window.scrollY,
      timestamp: Date.now(),
      formData: this.collectFormData(),
    };

    sessionStorage.setItem(
      'chunk_error_recovery_state',
      JSON.stringify(stateToPreserve)
    );
  }

  private collectFormData(): Record<string, any> {
    const formData: Record<string, any> = {};
    const forms = document.querySelectorAll('form');

    forms.forEach((form, index) => {
      const data = new FormData(form as HTMLFormElement);
      const formObject: Record<string, any> = {};

      data.forEach((value, key) => {
        formObject[key] = value;
      });

      if (Object.keys(formObject).length > 0) {
        formData[`form_${index}`] = formObject;
      }
    });

    return formData;
  }

  private showFallback() {
    // Final fallback - show user-friendly error
    this.setState({
      hasError: true,
      isRetrying: false,
    });
  }

  private logError(error: Error, errorInfo: ErrorInfo, isChunkError: boolean) {
    const errorData = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      isChunkError,
      retryCount: this.state.retryCount,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    // Send to monitoring service
    fetch('/api/errors/chunk-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorData),
    }).catch(err => {
      console.error('Failed to log chunk error:', err);
    });

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.group('Chunk Error Boundary');
      console.error('Error:', error);
      console.log('Error Info:', errorInfo);
      console.log('Is Chunk Error:', isChunkError);
      console.log('Retry Count:', this.state.retryCount);
      console.groupEnd();
    }
  }

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      retryCount: 0,
      isRetrying: false,
    });

    // Clear cache and retry
    ChunkLoader.clearCache();
  };

  private handleRefresh = () => {
    window.location.reload();
  };

  render() {
    const { hasError, error, isRetrying, retryCount } = this.state;

    if (isRetrying) {
      return (
        <div className="chunk-error-retrying">
          <div className="retry-spinner"></div>
          <h3>Loading Application...</h3>
          <p>Attempting to recover (Attempt {retryCount + 1} of {this.MAX_RETRIES})</p>
        </div>
      );
    }

    if (hasError && error) {
      const isChunkError = this.isChunkLoadError(error);

      if (isChunkError) {
        return (
          <div className="chunk-error-container">
            <div className="chunk-error-content">
              <div className="error-icon">⚠️</div>
              <h2>Loading Error</h2>
              <p>We're having trouble loading some application resources.</p>

              <div className="error-details">
                <p>This can happen due to:</p>
                <ul>
                  <li>Network connectivity issues</li>
                  <li>Outdated browser cache</li>
                  <li>Ad blockers or security software</li>
                  <li>Corporate firewall restrictions</li>
                </ul>
              </div>

              <div className="error-actions">
                <button
                  onClick={this.handleRetry}
                  className="btn-primary"
                  disabled={retryCount >= this.MAX_RETRIES}
                >
                  Try Again
                </button>
                <button
                  onClick={this.handleRefresh}
                  className="btn-secondary"
                >
                  Refresh Page
                </button>
              </div>

              <div className="error-help">
                <details>
                  <summary>Still having issues?</summary>
                  <div className="help-content">
                    <h4>Try these steps:</h4>
                    <ol>
                      <li>Check your internet connection</li>
                      <li>Clear your browser cache (Ctrl+Shift+Delete)</li>
                      <li>Disable browser extensions temporarily</li>
                      <li>Try a different browser</li>
                      <li>Contact support if the issue persists</li>
                    </ol>
                    {process.env.NODE_ENV === 'development' && (
                      <div className="debug-info">
                        <h4>Debug Information:</h4>
                        <pre>{error.message}</pre>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            </div>
          </div>
        );
      }
    }

    return this.props.children;
  }

  componentDidMount() {
    // Check if we're recovering from a chunk error
    const recoveryState = sessionStorage.getItem('chunk_error_recovery_state');

    if (recoveryState) {
      try {
        const state = JSON.parse(recoveryState);

        // Restore scroll position
        if (state.scrollPosition) {
          window.scrollTo(0, state.scrollPosition);
        }

        // Clear recovery state
        sessionStorage.removeItem('chunk_error_recovery_state');

        // Log successful recovery
        console.log('Successfully recovered from chunk loading error');
      } catch (error) {
        console.error('Failed to restore recovery state:', error);
      }
    }

    // Set up global error handler for unhandled chunk errors
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const error = event.reason;

    if (error && this.isChunkLoadError(error)) {
      event.preventDefault(); // Prevent default error handling

      // Trigger error boundary
      this.setState({
        hasError: true,
        error: error,
      });

      this.handleChunkLoadError();
    }
  };
}

export default ChunkErrorBoundary;