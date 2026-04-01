/**
 * Backend Status Context
 * Provides backend health status throughout the application
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  createHealthCheckPoller,
  type HealthCheckResult,
  type BackendStatus
} from '@/services/healthCheck';

interface BackendStatusContextType extends BackendStatus {
  /** API is reachable (even if WebSocket is not) */
  isApiHealthy: boolean;
  /** WebSocket/Socket.io is available */
  isWebSocketHealthy: boolean;
  checkHealth: () => Promise<HealthCheckResult>;
  startPolling: () => void;
  stopPolling: () => void;
}

const BackendStatusContext = createContext<BackendStatusContextType | null>(null);

interface BackendStatusProviderProps {
  children: React.ReactNode;
  /** Polling interval in milliseconds (default: 30000) */
  pollingInterval?: number;
  /** Health check timeout in milliseconds (default: 5000) */
  timeout?: number;
  /** Whether to start polling automatically (default: true) */
  autoStart?: boolean;
}

export const BackendStatusProvider: React.FC<BackendStatusProviderProps> = ({
  children,
  pollingInterval = 30000,
  timeout = 5000,
  autoStart = true,
}) => {
  const [status, setStatus] = useState<BackendStatus>({
    isHealthy: false,
    isChecking: true,
    lastCheck: null,
    error: null,
  });
  const [isApiHealthy, setIsApiHealthy] = useState(false);
  const [isWebSocketHealthy, setIsWebSocketHealthy] = useState(false);

  const handleStatusChange = useCallback((result: HealthCheckResult) => {
    setIsApiHealthy(result.api);
    setIsWebSocketHealthy(result.websocket);
    setStatus({
      isHealthy: result.healthy,
      isChecking: false,
      lastCheck: result,
      error: result.error || null,
    });
  }, []);

  const poller = useMemo(
    () => createHealthCheckPoller(handleStatusChange, pollingInterval, timeout),
    [handleStatusChange, pollingInterval, timeout]
  );

  const checkHealth = useCallback(async (): Promise<HealthCheckResult> => {
    setStatus(prev => ({ ...prev, isChecking: true }));
    return poller.checkNow();
  }, [poller]);

  const startPolling = useCallback(() => {
    poller.start();
  }, [poller]);

  const stopPolling = useCallback(() => {
    poller.stop();
  }, [poller]);

  useEffect(() => {
    if (autoStart) {
      // Perform initial health check
      checkHealth();
    }

    return () => {
      poller.stop();
    };
  }, [autoStart, checkHealth, poller]);

  const contextValue = useMemo(
    () => ({
      ...status,
      isApiHealthy,
      isWebSocketHealthy,
      checkHealth,
      startPolling,
      stopPolling,
    }),
    [status, isApiHealthy, isWebSocketHealthy, checkHealth, startPolling, stopPolling]
  );

  return (
    <BackendStatusContext.Provider value={contextValue}>
      {children}
    </BackendStatusContext.Provider>
  );
};

export const useBackendStatus = (): BackendStatusContextType => {
  const context = useContext(BackendStatusContext);
  if (!context) {
    throw new Error('useBackendStatus must be used within a BackendStatusProvider');
  }
  return context;
};

/**
 * Hook that only connects when backend is healthy
 */
export const useBackendReady = (): boolean => {
  const { isHealthy, isChecking } = useBackendStatus();
  return isHealthy && !isChecking;
};

export default BackendStatusContext;
