/**
 * Feature Flag Provider component for React
 * @module FeatureFlagProvider
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  FeatureFlags,
  FeatureFlagContextType,
  UserContext,
  CircuitState
} from './types';
import { FeatureFlagService } from './FeatureFlagService';

/**
 * Feature Flag Context
 */
const FeatureFlagContext = createContext<FeatureFlagContextType | null>(null);

/**
 * Feature Flag Provider Props
 * @interface FeatureFlagProviderProps
 */
interface FeatureFlagProviderProps {
  children: React.ReactNode;
  userContext?: UserContext;
  config?: {
    apiUrl?: string;
    wsUrl?: string;
    pollingInterval?: number;
    analyticsEnabled?: boolean;
    persistenceEnabled?: boolean;
  };
}

/**
 * Feature Flag Provider component
 * @component FeatureFlagProvider
 * @description Provides feature flag context to child components with automatic updates
 * and circuit breaker protection
 * @param {FeatureFlagProviderProps} props - Provider props
 * @returns {JSX.Element} Provider component
 */
export const FeatureFlagProvider: React.FC<FeatureFlagProviderProps> = ({
  children,
  userContext,
  config = {}
}) => {
  const [flags, setFlags] = useState<FeatureFlags>({} as FeatureFlags);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  // Create service instance (memoized to prevent recreation)
  const service = useMemo(() => new FeatureFlagService(config), []);

  /**
   * Initializes the feature flag service
   */
  useEffect(() => {
    const initializeService = async () => {
      try {
        setLoading(true);
        await service.initialize();

        // Subscribe to flag updates
        const unsubscribe = service.onFlagUpdate((newFlags) => {
          setFlags(newFlags);
        });

        setLoading(false);

        // Cleanup on unmount
        return () => {
          unsubscribe();
          service.destroy();
        };
      } catch (err) {
        setError(err as Error);
        setLoading(false);
        console.error('[FeatureFlagProvider] Failed to initialize:', err);
      }
    };

    initializeService();
  }, [service]);

  /**
   * Context value memoized to prevent unnecessary re-renders
   */
  const contextValue = useMemo<FeatureFlagContextType>(() => ({
    flags,
    service,
    userContext,
    loading,
    error
  }), [flags, service, userContext, loading, error]);

  return (
    <FeatureFlagContext.Provider value={contextValue}>
      {children}
    </FeatureFlagContext.Provider>
  );
};

/**
 * Hook to use feature flag context
 * @returns {FeatureFlagContextType} Feature flag context
 * @throws {Error} When used outside of FeatureFlagProvider
 */
export const useFeatureFlagContext = (): FeatureFlagContextType => {
  const context = useContext(FeatureFlagContext);
  if (!context) {
    throw new Error('useFeatureFlagContext must be used within FeatureFlagProvider');
  }
  return context;
};

/**
 * Hook to check if a feature flag is enabled
 * @param {keyof FeatureFlags} flagKey - The flag key to check
 * @returns {boolean} True if flag is enabled
 */
export const useFeatureFlag = (flagKey: keyof FeatureFlags): boolean => {
  const { service, userContext, loading } = useFeatureFlagContext();

  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    if (!loading) {
      const evaluation = service.evaluate(flagKey, userContext);
      setIsEnabled(Boolean(evaluation.value));
    }
  }, [flagKey, service, userContext, loading]);

  return isEnabled;
};

/**
 * Hook to get feature flag value with type safety
 * @template T
 * @param {keyof FeatureFlags} flagKey - The flag key
 * @returns {T | undefined} The flag value
 */
export function useFeatureFlagValue<T = any>(flagKey: keyof FeatureFlags): T | undefined {
  const { service, userContext, loading } = useFeatureFlagContext();

  const [value, setValue] = useState<T | undefined>();

  useEffect(() => {
    if (!loading) {
      const evaluation = service.evaluate(flagKey, userContext);
      setValue(evaluation.value as T);
    }
  }, [flagKey, service, userContext, loading]);

  return value;
}

/**
 * Hook to get circuit breaker state for a flag
 * @param {string} flagKey - The flag key
 * @returns {CircuitState} The circuit state
 */
export const useCircuitBreakerState = (flagKey: string): CircuitState => {
  const { service } = useFeatureFlagContext();
  const [state, setState] = useState<CircuitState>(CircuitState.CLOSED);

  useEffect(() => {
    // Poll circuit state
    const interval = setInterval(() => {
      setState(service.getCircuitState(flagKey));
    }, 1000);

    return () => clearInterval(interval);
  }, [flagKey, service]);

  return state;
};

/**
 * Hook to report errors for a specific flag
 * @param {string} flagKey - The flag key
 * @returns {Function} Error reporter function
 */
export const useFeatureFlagError = (flagKey: string): ((error: Error) => void) => {
  const { service } = useFeatureFlagContext();

  return useCallback((error: Error) => {
    service.reportError(flagKey, error);
  }, [flagKey, service]);
};

/**
 * Hook for A/B testing with feature flags
 * @param {string} flagKey - The flag key for the test
 * @returns {Object} Test variant information
 */
export const useABTest = (flagKey: string): {
  variant: 'control' | 'treatment';
  isLoading: boolean;
  trackConversion: (metric: string, value?: number) => void;
} => {
  const { service, userContext, loading } = useFeatureFlagContext();
  const [variant, setVariant] = useState<'control' | 'treatment'>('control');

  useEffect(() => {
    if (!loading) {
      const evaluation = service.evaluate(flagKey as keyof FeatureFlags, userContext);
      setVariant(evaluation.value ? 'treatment' : 'control');
    }
  }, [flagKey, service, userContext, loading]);

  const trackConversion = useCallback((metric: string, value?: number) => {
    // In production, this would send to analytics
    console.log('[ABTest] Conversion tracked:', {
      test: flagKey,
      variant,
      metric,
      value,
      user: userContext?.userId
    });
  }, [flagKey, variant, userContext]);

  return {
    variant,
    isLoading: loading,
    trackConversion
  };
};

/**
 * HOC to wrap components with feature flag check
 * @param {React.ComponentType} Component - Component to wrap
 * @param {keyof FeatureFlags} flagKey - Flag to check
 * @param {React.ComponentType} FallbackComponent - Optional fallback component
 * @returns {React.ComponentType} Wrapped component
 */
export function withFeatureFlag<P extends object>(
  Component: React.ComponentType<P>,
  flagKey: keyof FeatureFlags,
  FallbackComponent?: React.ComponentType<P>
): React.ComponentType<P> {
  return (props: P) => {
    const isEnabled = useFeatureFlag(flagKey);
    const { loading } = useFeatureFlagContext();

    if (loading) {
      return <div>Loading feature flags...</div>;
    }

    if (isEnabled) {
      return <Component {...props} />;
    }

    if (FallbackComponent) {
      return <FallbackComponent {...props} />;
    }

    return null;
  };
}

/**
 * Component to conditionally render children based on feature flag
 * @component FeatureGate
 */
export const FeatureGate: React.FC<{
  flag: keyof FeatureFlags;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}> = ({ flag, children, fallback = null }) => {
  const isEnabled = useFeatureFlag(flag);
  const { loading } = useFeatureFlagContext();

  if (loading) {
    return null;
  }

  return <>{isEnabled ? children : fallback}</>;
};