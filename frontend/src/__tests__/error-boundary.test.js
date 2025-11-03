/**
 * Error Boundary Testing Suite
 * US-013: Error Boundaries & Recovery - Comprehensive error boundary tests
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ErrorBoundary from '../components/ErrorBoundary';
import ErrorFallback from '../components/ErrorFallback';
import errorLogger from '../utils/errorLogging';
import errorRecoveryManager from '../utils/errorRecovery';

// Mock error logging
jest.mock('../utils/errorLogging');
jest.mock('../utils/errorRecovery');

// Mock console methods to test error logging
const originalError = console.error;
const originalWarn = console.warn;
const originalLog = console.log;

beforeEach(() => {
  console.error = jest.fn();
  console.warn = jest.fn();
  console.log = jest.fn();
  jest.clearAllMocks();
});

afterEach(() => {
  console.error = originalError;
  console.warn = originalWarn;
  console.log = originalLog;
});

// Test components
const ThrowError = ({ shouldThrow = false, errorType = 'component' }) => {
  if (shouldThrow) {
    if (errorType === 'chunk') {
      throw new Error('Loading chunk 1 failed');
    } else if (errorType === 'network') {
      throw new Error('Network request failed');
    } else if (errorType === 'permission') {
      throw new Error('Permission denied to access resource');
    } else if (errorType === 'timeout') {
      throw new Error('Request timeout after 30000ms');
    } else {
      throw new Error('Test component error');
    }
  }
  return <div>No error</div>;
};

const WorkingComponent = () => <div>Working component</div>;

describe('ErrorBoundary', () => {
  describe('Error Detection and Classification', () => {
    test('should catch and classify chunk load errors', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorType="chunk" />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Loading Issue/i)).toBeInTheDocument();
      expect(screen.getByText(/problem loading part of the application/i)).toBeInTheDocument();
      expect(screen.getByText(/refresh the page/i)).toBeInTheDocument();
    });

    test('should catch and classify network errors', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorType="network" />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Connection Problem/i)).toBeInTheDocument();
      expect(screen.getByText(/Unable to connect to the server/i)).toBeInTheDocument();
    });

    test('should catch and classify permission errors', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorType="permission" />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Access Denied/i)).toBeInTheDocument();
      expect(screen.getByText(/don't have permission/i)).toBeInTheDocument();
    });

    test('should catch and classify timeout errors', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorType="timeout" />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Request Timeout/i)).toBeInTheDocument();
      expect(screen.getByText(/took too long to complete/i)).toBeInTheDocument();
    });

    test('should classify unknown errors as component errors', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorType="unknown" />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Unexpected Error/i)).toBeInTheDocument();
    });
  });

  describe('Error Logging', () => {
    test('should log errors with comprehensive context', async () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      await waitFor(() => {
        expect(errorLogger.logError).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'ComponentError',
            message: 'Test component error',
            url: 'http://localhost/',
            userAgent: expect.any(String),
            timestamp: expect.any(String),
            level: 'error',
          })
        );
      });
    });

    test('should include error stack trace in logs', async () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      await waitFor(() => {
        expect(errorLogger.logError).toHaveBeenCalledWith(
          expect.objectContaining({
            stack: expect.stringContaining('ThrowError'),
            componentStack: expect.any(String),
          })
        );
      });
    });

    test('should log errors with different severity levels', async () => {
      // Test warning level error (chunk load)
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorType="chunk" />
        </ErrorBoundary>
      );

      await waitFor(() => {
        expect(errorLogger.logError).toHaveBeenCalledWith(
          expect.objectContaining({
            level: 'warning',
          })
        );
      });
    });
  });

  describe('Error Recovery', () => {
    test('should show retry button when retries are available', () => {
      render(
        <ErrorBoundary maxRetries={3}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const retryButton = screen.getByRole('button', { name: /try again/i });
      expect(retryButton).toBeInTheDocument();
      expect(retryButton).toHaveTextContent('Try Again (0/3)');
    });

    test('should hide retry button when max retries reached', () => {
      const TestComponent = () => {
        const [retryCount, setRetryCount] = React.useState(0);

        return (
          <ErrorBoundary maxRetries={2}>
            <ThrowError shouldThrow={retryCount < 3} />
          </ErrorBoundary>
        );
      };

      render(<TestComponent />);

      // Trigger retries
      const retryButton = screen.getByRole('button', { name: /try again/i });

      fireEvent.click(retryButton);
      fireEvent.click(retryButton);
      fireEvent.click(retryButton);

      expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
    });

    test('should handle manual retry', async () => {
      const TestComponent = () => {
        const [shouldThrow, setShouldThrow] = React.useState(true);

        React.useEffect(() => {
          const timer = setTimeout(() => setShouldThrow(false), 100);
          return () => clearTimeout(timer);
        }, []);

        return (
          <ErrorBoundary>
            <ThrowError shouldThrow={shouldThrow} />
          </ErrorBoundary>
        );
      };

      render(<TestComponent />);

      const retryButton = screen.getByRole('button', { name: /try again/i });

      await act(async () => {
        fireEvent.click(retryButton);
        await new Promise(resolve => setTimeout(resolve, 150));
      });

      expect(screen.getByText('No error')).toBeInTheDocument();
    });

    test('should attempt automatic recovery for recoverable errors', async () => {
      jest.useFakeTimers();

      render(
        <ErrorBoundary autoRecover={true}>
          <ThrowError shouldThrow={true} errorType="network" />
        </ErrorBoundary>
      );

      expect(errorRecoveryManager.attemptRecovery).toHaveBeenCalled();

      jest.useRealTimers();
    });

    test('should disable auto-recovery when specified', () => {
      render(
        <ErrorBoundary autoRecover={false}>
          <ThrowError shouldThrow={true} errorType="network" />
        </ErrorBoundary>
      );

      expect(errorRecoveryManager.attemptRecovery).not.toHaveBeenCalled();
    });
  });

  describe('UI Customization', () => {
    test('should use custom fallback component when provided', () => {
      const CustomFallback = () => <div>Custom error UI</div>;

      render(
        <ErrorBoundary fallback={() => <CustomFallback />}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Custom error UI')).toBeInTheDocument();
    });

    test('should disable ErrorFallback when specified', () => {
      render(
        <ErrorBoundary useErrorFallback={false}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      // Should show default error UI instead of ErrorFallback
      expect(screen.getByText(/Unexpected Error/i)).toBeInTheDocument();
    });

    test('should show developer information in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Developer Information')).toBeInTheDocument();

      process.env.NODE_ENV = originalEnv;
    });

    test('should hide developer information in production mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.queryByText('Developer Information')).not.toBeInTheDocument();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Event Callbacks', () => {
    test('should call onRetry callback when retry is attempted', async () => {
      const onRetry = jest.fn();

      render(
        <ErrorBoundary onRetry={onRetry}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const retryButton = screen.getByRole('button', { name: /try again/i });

      await act(async () => {
        fireEvent.click(retryButton);
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      expect(onRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          retryCount: 1,
          errorType: expect.any(String),
        })
      );
    });

    test('should call onErrorReported callback when error is reported', async () => {
      const onErrorReported = jest.fn();

      render(
        <ErrorBoundary onErrorReported={onErrorReported}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const reportButton = screen.getByRole('button', { name: /report issue/i });

      await act(async () => {
        fireEvent.click(reportButton);
      });

      expect(onErrorReported).toHaveBeenCalled();
    });
  });

  describe('Component Lifecycle', () => {
    test('should clear error state when children change', async () => {
      const TestWrapper = () => {
        const [childKey, setChildKey] = React.useState(1);

        return (
          <div>
            <button onClick={() => setChildKey(prev => prev + 1)}>
              Change Child
            </button>
            <ErrorBoundary key={childKey}>
              <ThrowError shouldThrow={childKey === 1} />
            </ErrorBoundary>
          </div>
        );
      };

      render(<TestWrapper />);

      // Initially should show error
      expect(screen.getByText(/Unexpected Error/i)).toBeInTheDocument();

      // Change child component
      fireEvent.click(screen.getByText('Change Child'));

      // Should now show working component
      expect(screen.getByText('No error')).toBeInTheDocument();
    });

    test('should track recovery attempts', async () => {
      let retryCount = 0;
      const TestComponent = () => {
        retryCount++;
        return <ThrowError shouldThrow={retryCount < 3} />;
      };

      render(
        <ErrorBoundary maxRetries={5}>
          <TestComponent />
        </ErrorBoundary>
      );

      const retryButton = screen.getByRole('button', { name: /try again/i });

      // First retry
      await act(async () => {
        fireEvent.click(retryButton);
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      expect(screen.getByText(/Try Again \(1\/5\)/i)).toBeInTheDocument();

      // Second retry
      await act(async () => {
        fireEvent.click(retryButton);
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      expect(screen.getByText('No error')).toBeInTheDocument();
    });
  });

  describe('Error Context and Information', () => {
    test('should display error ID for tracking', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Error ID:/)).toBeInTheDocument();
    });

    test('should show error message', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Test component error')).toBeInTheDocument();
    });

    test('should show appropriate icons for different error levels', () => {
      // Test error level (should show error icon)
      const { rerender } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorType="component" />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Unexpected Error/i)).toBeInTheDocument();

      // Test warning level (should show warning icon)
      rerender(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorType="chunk" />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Loading Issue/i)).toBeInTheDocument();
    });
  });

  describe('Integration with Error Recovery Manager', () => {
    test('should use error recovery manager for automatic recovery', () => {
      errorRecoveryManager.attemptRecovery.mockResolvedValue({ success: true });

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorType="network" />
        </ErrorBoundary>
      );

      expect(errorRecoveryManager.attemptRecovery).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          type: 'global',
        })
      );
    });

    test('should handle recovery manager failures gracefully', () => {
      errorRecoveryManager.attemptRecovery.mockRejectedValue(new Error('Recovery failed'));

      expect(() => {
        render(
          <ErrorBoundary>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        );
      }).not.toThrow();
    });
  });

  describe('Memory and Performance', () => {
    test('should not cause memory leaks with multiple errors', () => {
      const TestComponent = () => {
        const [errorCount, setErrorCount] = React.useState(0);

        return (
          <div>
            <button onClick={() => setErrorCount(prev => prev + 1)}>
              Trigger Error
            </button>
            <ErrorBoundary key={errorCount}>
              <ThrowError shouldThrow={errorCount > 0} />
            </ErrorBoundary>
          </div>
        );
      };

      render(<TestComponent />);

      // Trigger multiple errors
      for (let i = 0; i < 5; i++) {
        fireEvent.click(screen.getByText('Trigger Error'));
      }

      // Should still be responsive
      expect(screen.getByText(/Unexpected Error/i)).toBeInTheDocument();
    });

    test('should handle rapid error succession', async () => {
      let errorCount = 0;
      const RapidErrorComponent = () => {
        errorCount++;
        if (errorCount <= 3) {
          throw new Error(`Rapid error ${errorCount}`);
        }
        return <div>Stabilized</div>;
      };

      const TestWrapper = () => {
        const [key, setKey] = React.useState(0);

        return (
          <div>
            <button onClick={() => setKey(prev => prev + 1)}>
              Reset
            </button>
            <ErrorBoundary key={key} maxRetries={5}>
              <RapidErrorComponent />
            </ErrorBoundary>
          </div>
        );
      };

      render(<TestWrapper />);

      // Reset multiple times rapidly
      for (let i = 0; i < 3; i++) {
        fireEvent.click(screen.getByText('Reset'));
      }

      expect(screen.getByText('Stabilized')).toBeInTheDocument();
    });
  });
});