/**
 * Example Migration Router with Feature Flag Integration
 * @module MigrationRouterExample
 * @description Demonstrates how to use feature flags for component migration
 */

import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin, Result, Alert } from 'antd';
import { LoadingOutlined, ExperimentOutlined } from '@ant-design/icons';
import { useFeatureFlag, useCircuitBreakerState, FeatureGate } from '../FeatureFlagProvider';
import { CircuitState } from '../types';

// Lazy load components for better performance
const UploadPage = lazy(() => import('../../../pages/UploadPage'));
const UploadPageLegacy = lazy(() => import('../../../pages/UploadPageLegacy'));
const AnnotationPage = lazy(() => import('../../../pages/AnnotationPage'));
const AnnotationPageLegacy = lazy(() => import('../../../pages/AnnotationPageLegacy'));
const HomePage = lazy(() => import('../../../pages/HomePage'));

/**
 * Loading component for suspense fallback
 */
const PageLoader: React.FC<{ page?: string }> = ({ page = 'page' }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh'
  }}>
    <Spin
      indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />}
      tip={`Loading ${page}...`}
    />
  </div>
);

/**
 * Circuit breaker status indicator
 */
const CircuitBreakerIndicator: React.FC<{ flagKey: string }> = ({ flagKey }) => {
  const circuitState = useCircuitBreakerState(flagKey);

  if (circuitState === CircuitState.OPEN) {
    return (
      <Alert
        message="Feature Temporarily Disabled"
        description="This feature has been automatically disabled due to errors. Using stable version."
        type="warning"
        showIcon
        style={{ margin: '16px' }}
      />
    );
  }

  if (circuitState === CircuitState.HALF_OPEN) {
    return (
      <Alert
        message="Testing Feature Recovery"
        description="Attempting to re-enable the feature after temporary issues."
        type="info"
        icon={<ExperimentOutlined />}
        style={{ margin: '16px' }}
      />
    );
  }

  return null;
};

/**
 * Feature-flagged route component
 */
const FeatureFlaggedRoute: React.FC<{
  path: string;
  flagKey: string;
  newComponent: React.ComponentType;
  legacyComponent: React.ComponentType;
  componentName: string;
}> = ({ path, flagKey, newComponent: NewComponent, legacyComponent: LegacyComponent, componentName }) => {
  const isEnabled = useFeatureFlag(flagKey as any);

  return (
    <Route
      path={path}
      element={
        <>
          <CircuitBreakerIndicator flagKey={flagKey} />
          <Suspense fallback={<PageLoader page={componentName} />}>
            {isEnabled ? <NewComponent /> : <LegacyComponent />}
          </Suspense>
        </>
      }
    />
  );
};

/**
 * Migration Router with Feature Flag Control
 * @component MigrationRouter
 * @description Main router component that switches between legacy and new components
 * based on feature flag states
 */
export const MigrationRouter: React.FC = () => {
  const uploadEnabled = useFeatureFlag('migration.upload.enabled');
  const annotationEnabled = useFeatureFlag('migration.annotation.enabled');
  const navigationEnabled = useFeatureFlag('migration.navigation.enabled');

  return (
    <Routes>
      {/* Home Route */}
      <Route
        path="/"
        element={
          <Suspense fallback={<PageLoader page="Home" />}>
            <HomePage />
          </Suspense>
        }
      />

      {/* Upload Route with Feature Flag */}
      <Route
        path="/upload"
        element={
          <>
            <CircuitBreakerIndicator flagKey="migration.upload.enabled" />
            <Suspense fallback={<PageLoader page="Upload" />}>
              {uploadEnabled ? <UploadPage /> : <UploadPageLegacy />}
            </Suspense>
          </>
        }
      />

      {/* Annotation Route with Feature Flag */}
      <Route
        path="/annotate/:imageId?"
        element={
          <>
            <CircuitBreakerIndicator flagKey="migration.annotation.enabled" />
            <Suspense fallback={<PageLoader page="Annotation" />}>
              {annotationEnabled ? <AnnotationPage /> : <AnnotationPageLegacy />}
            </Suspense>
          </>
        }
      />

      {/* Feature Gate Example for Beta Features */}
      <FeatureGate
        flag="features.bulkUpload.enabled"
        fallback={
          <Route
            path="/bulk-upload"
            element={
              <Result
                status="403"
                title="Feature Not Available"
                subTitle="Bulk upload feature is currently in beta and not available for your account."
              />
            }
          />
        }
      >
        <Route
          path="/bulk-upload"
          element={
            <Suspense fallback={<PageLoader page="Bulk Upload" />}>
              <div>Bulk Upload Page (Beta Feature)</div>
            </Suspense>
          }
        />
      </FeatureGate>

      {/* 404 Route */}
      <Route
        path="*"
        element={
          <Result
            status="404"
            title="404"
            subTitle="Sorry, the page you visited does not exist."
          />
        }
      />
    </Routes>
  );
};

/**
 * Advanced Migration Router with Percentage Rollout
 * @component AdvancedMigrationRouter
 * @description Demonstrates percentage-based rollout for gradual migration
 */
export const AdvancedMigrationRouter: React.FC = () => {
  const { service, userContext } = useFeatureFlagContext();

  // Check rollout percentages
  const uploadRollout = service.evaluate('migration.upload.rollout', userContext);
  const annotationRollout = service.evaluate('migration.annotation.rollout', userContext);

  return (
    <Routes>
      {/* Upload with Percentage Rollout */}
      <Route
        path="/upload"
        element={
          <>
            {uploadRollout.value && (
              <Alert
                message="New Upload Experience"
                description={`You're seeing the new upload interface (${uploadRollout.reason})`}
                type="success"
                closable
                style={{ margin: '16px' }}
              />
            )}
            <Suspense fallback={<PageLoader page="Upload" />}>
              {uploadRollout.value ? <UploadPage /> : <UploadPageLegacy />}
            </Suspense>
          </>
        }
      />

      {/* Annotation with Percentage Rollout */}
      <Route
        path="/annotate/:imageId?"
        element={
          <>
            {annotationRollout.value && (
              <Alert
                message="Enhanced Annotation Tools"
                description={`You have access to the new annotation features (${annotationRollout.reason})`}
                type="success"
                closable
                style={{ margin: '16px' }}
              />
            )}
            <Suspense fallback={<PageLoader page="Annotation" />}>
              {annotationRollout.value ? <AnnotationPage /> : <AnnotationPageLegacy />}
            </Suspense>
          </>
        }
      />
    </Routes>
  );
};

/**
 * Error Boundary with Feature Flag Fallback
 * @component MigrationErrorBoundary
 * @description Catches errors and reports them to circuit breaker
 */
export class MigrationErrorBoundary extends React.Component<{
  children: React.ReactNode;
  flagKey: string;
  onError?: (error: Error) => void;
}, {
  hasError: boolean;
  error?: Error;
}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const { flagKey, onError } = this.props;

    // Report to feature flag service for circuit breaker
    if (window.featureFlagService) {
      window.featureFlagService.reportError(flagKey, error);
    }

    // Call custom error handler
    if (onError) {
      onError(error);
    }

    console.error(`[MigrationErrorBoundary] Error in ${flagKey}:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Result
          status="500"
          title="Something went wrong"
          subTitle="We've encountered an error and have switched to the stable version."
          extra={
            <Button type="primary" onClick={() => window.location.reload()}>
              Reload Page
            </Button>
          }
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Example usage in App component
 */
export const AppWithMigration: React.FC = () => {
  return (
    <FeatureFlagProvider
      config={{
        apiUrl: '/api/feature-flags',
        wsUrl: process.env.REACT_APP_WS_URL || 'ws://localhost:8080/feature-flags',
        analyticsEnabled: true,
        persistenceEnabled: true
      }}
      userContext={{
        userId: 'user-123',
        email: 'user@example.com',
        groups: ['beta-testers'],
        percentageBucket: Math.floor(Math.random() * 100) // Or use consistent hash
      }}
    >
      <MigrationErrorBoundary flagKey="migration.global">
        <div className="app">
          <FeatureFlagStatus />
          <MigrationRouter />
        </div>
      </MigrationErrorBoundary>
    </FeatureFlagProvider>
  );
};

// Add to window for debugging
declare global {
  interface Window {
    featureFlagService?: IFeatureFlagService;
  }
}

import { useFeatureFlagContext, FeatureFlagStatus } from '../FeatureFlagAdmin';
import { IFeatureFlagService } from '../types';
import { Button } from 'antd';

// Export for use in other components
export default MigrationRouter;