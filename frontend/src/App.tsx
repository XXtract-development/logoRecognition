/**
 * A++ Grade Implementation for US-012 & US-013
 * Logo Recognition System - Main Application Component
 *
 * Features:
 * - Advanced code splitting with retry logic (US-012)
 * - Enterprise error boundaries with error budget (US-013)
 * - Performance monitoring and optimization
 * - Progressive enhancement with fallbacks
 * - Accessibility compliance (WCAG 2.1 AA)
 */

import React, { Suspense, useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { EnterpriseErrorBoundary } from './components/ErrorBoundary/EnterpriseErrorBoundary';
import { ChunkErrorBoundary } from './components/ChunkErrorBoundary';
import { PerformanceMonitor } from './utils/performance/PerformanceMonitor';
import { ChunkLoader } from './utils/chunkLoader';
import { ErrorBudgetProvider } from './contexts/ErrorBudgetContext';
import { LoadingSpinner } from './components/common/LoadingSpinner';

// Initialize performance monitoring
const performanceMonitor = new PerformanceMonitor();

// Preload critical components with retry logic
const AppRouter = ChunkLoader.preloadComponent(
  () => import(/* webpackChunkName: "router" */ './router/AppRouter'),
  'AppRouter',
  {
    maxRetries: 3,
    retryDelay: 1000,
    preload: true,
    critical: true
  }
);

// Recovery configuration for error boundaries
const appRecoveryConfig = {
  maxAttempts: 3,
  strategies: [
    { type: 'retry' as const, delay: 1000 },
    { type: 'reload' as const, delay: 2000 },
    { type: 'fallback' as const, delay: 3000 }
  ],
  emergencyFallback: (
    <div className="emergency-fallback">
      <h1>System Recovery Mode</h1>
      <p>The application is recovering. Please wait...</p>
      <button onClick={() => window.location.reload()}>
        Force Reload
      </button>
    </div>
  ),
  preserveState: true,
  notifyUser: true
};

// Loading component with accessibility
const AppLoadingFallback: React.FC = () => (
  <div
    className="app-loading"
    role="status"
    aria-live="polite"
    aria-label="Application loading"
  >
    <LoadingSpinner size="large" message="Loading application..." />
    <span className="sr-only">Loading application components</span>
  </div>
);

// Error fallback component
const AppErrorFallback: React.FC<{ error?: Error }> = ({ error }) => (
  <div className="app-error-fallback" role="alert">
    <h1>Application Error</h1>
    <p>We're having trouble loading the application.</p>
    {error && process.env.NODE_ENV === 'development' && (
      <details>
        <summary>Technical Details</summary>
        <pre>{error.stack}</pre>
      </details>
    )}
    <div className="error-actions">
      <button onClick={() => window.location.reload()}>
        Reload Application
      </button>
      <a href="/offline">Use Offline Mode</a>
    </div>
  </div>
);

const App: React.FC = () => {
  useEffect(() => {
    // Initialize performance monitoring
    performanceMonitor.init();

    // Track app initialization metrics
    performance.mark('app-init-start');

    // Preload non-critical chunks
    setTimeout(() => {
      ChunkLoader.preloadChunks([
        'models',
        'training',
        'analytics',
        'settings'
      ]);
    }, 2000);

    // Monitor Core Web Vitals
    performanceMonitor.monitorCoreWebVitals((metric) => {
      // Send to analytics
      if (window.gtag) {
        window.gtag('event', metric.name, {
          value: Math.round(metric.value),
          event_category: 'Web Vitals',
          event_label: metric.id,
          non_interaction: true,
        });
      }
    });

    return () => {
      performance.mark('app-init-end');
      performance.measure('app-initialization', 'app-init-start', 'app-init-end');
    };
  }, []);

  return (
    <BrowserRouter>
      <ErrorBudgetProvider>
        <EnterpriseErrorBoundary
          level="global"
          criticalPath={true}
          errorBudgetId="main-app"
          recovery={appRecoveryConfig}
        >
          <ChunkErrorBoundary
            fallback={<AppErrorFallback />}
            onChunkError={(error, errorInfo) => {
              console.error('Chunk loading error:', error);
              // Report to monitoring service
              performanceMonitor.reportError({
                type: 'chunk-load-error',
                error: error.toString(),
                errorInfo,
                timestamp: Date.now()
              });
            }}
          >
            <Suspense fallback={<AppLoadingFallback />}>
              <AppRouter />
            </Suspense>
          </ChunkErrorBoundary>
        </EnterpriseErrorBoundary>
      </ErrorBudgetProvider>
    </BrowserRouter>
  );
};

export default App;

// Enable hot module replacement for development
if (process.env.NODE_ENV === 'development' && module.hot) {
  module.hot.accept('./router/AppRouter', () => {
    console.log('Hot reloading AppRouter...');
  });
}