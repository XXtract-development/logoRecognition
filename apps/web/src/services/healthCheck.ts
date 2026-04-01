/**
 * Health Check Service
 * Verifies backend API connectivity before establishing WebSocket connections
 */

import { APP_CONFIG } from '@/constants';

export interface HealthCheckResult {
  healthy: boolean;
  api: boolean;
  websocket: boolean;
  latency?: number;
  error?: string;
  timestamp: string;
}

export interface BackendStatus {
  isHealthy: boolean;
  isChecking: boolean;
  lastCheck: HealthCheckResult | null;
  error: string | null;
}

const DEFAULT_TIMEOUT = 5000;

/**
 * Check if the API endpoint is reachable
 */
export async function checkApiHealth(timeout = DEFAULT_TIMEOUT): Promise<{ healthy: boolean; latency: number; error?: string }> {
  const startTime = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Try the health endpoint first
    // Strip /api from the URL if present since health endpoint is at root
    let baseUrl = APP_CONFIG.apiBaseUrl;
    if (baseUrl.endsWith('/api')) {
      baseUrl = baseUrl.slice(0, -4);
    }

    const apiUrl = baseUrl.startsWith('http')
      ? baseUrl
      : `${window.location.origin}${baseUrl}`;

    const response = await fetch(`${apiUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    clearTimeout(timeoutId);
    const latency = Math.round(performance.now() - startTime);

    if (response.ok) {
      return { healthy: true, latency };
    }

    // If health endpoint returns error, still consider API reachable but unhealthy
    return {
      healthy: false,
      latency,
      error: `API returned status ${response.status}`
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const latency = Math.round(performance.now() - startTime);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { healthy: false, latency, error: 'Health check timed out' };
      }
      return { healthy: false, latency, error: error.message };
    }

    return { healthy: false, latency, error: 'Unknown error' };
  }
}

/**
 * Check if WebSocket/Socket.io endpoint is likely available
 * Tests the socket.io endpoint specifically since backend may not have socket.io enabled
 */
export async function checkWebSocketHealth(timeout = DEFAULT_TIMEOUT): Promise<{ healthy: boolean; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Convert ws:// to http:// for the health check
    const wsUrl = APP_CONFIG.wsBaseUrl;
    const httpUrl = wsUrl.replace(/^ws(s)?:\/\//, 'http$1://');

    // Try socket.io specific endpoint - if it returns anything, socket.io is running
    const response = await fetch(`${httpUrl}/socket.io/?EIO=4&transport=polling`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Socket.io returns 200 with specific content when available
    // Verify it's actually socket.io by checking response format
    if (response.ok) {
      const text = await response.text();
      // Socket.io response starts with a digit (packet type) followed by data
      // e.g., "0{...}" for open packet or numbers for other packets
      if (text && /^\d/.test(text)) {
        return { healthy: true };
      }
      // Got 200 but not socket.io format - probably a catch-all route
      return { healthy: false, error: 'Socket.io not available (invalid response)' };
    }

    // socket.io not available on this backend
    return { healthy: false, error: 'Socket.io not available' };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { healthy: false, error: 'WebSocket health check timed out' };
      }
      // Connection refused means backend is not running
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        return { healthy: false, error: 'Backend not reachable' };
      }
      return { healthy: false, error: error.message };
    }

    return { healthy: false, error: 'Unknown error' };
  }
}

/**
 * Perform a full health check of all backend services
 */
export async function performHealthCheck(timeout = DEFAULT_TIMEOUT): Promise<HealthCheckResult> {
  const [apiResult, wsResult] = await Promise.all([
    checkApiHealth(timeout),
    checkWebSocketHealth(timeout),
  ]);

  const healthy = apiResult.healthy && wsResult.healthy;
  const errors: string[] = [];

  if (!apiResult.healthy && apiResult.error) {
    errors.push(`API: ${apiResult.error}`);
  }
  if (!wsResult.healthy && wsResult.error) {
    errors.push(`WebSocket: ${wsResult.error}`);
  }

  return {
    healthy,
    api: apiResult.healthy,
    websocket: wsResult.healthy,
    latency: apiResult.latency,
    error: errors.length > 0 ? errors.join('; ') : undefined,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a health check poller that periodically checks backend health
 */
export function createHealthCheckPoller(
  onStatusChange: (result: HealthCheckResult) => void,
  interval = 30000,
  timeout = DEFAULT_TIMEOUT
): { start: () => void; stop: () => void; checkNow: () => Promise<HealthCheckResult> } {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let isRunning = false;

  const checkNow = async (): Promise<HealthCheckResult> => {
    const result = await performHealthCheck(timeout);
    onStatusChange(result);
    return result;
  };

  const start = () => {
    if (isRunning) return;
    isRunning = true;

    // Initial check
    checkNow();

    // Set up periodic checks
    intervalId = setInterval(checkNow, interval);
  };

  const stop = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    isRunning = false;
  };

  return { start, stop, checkNow };
}
