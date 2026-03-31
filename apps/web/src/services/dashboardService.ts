/**
 * Dashboard Service
 * Fetches dashboard statistics from the API
 */

import { APP_CONFIG } from '@/constants';

// ============================================
// Types
// ============================================

export interface DashboardStats {
  totalRecognitions: number;
  successRate: number;
  averageTime: number;
  todayCount: number;
}

export interface RecentActivity {
  key: string;
  image: string;
  logos: number;
  confidence: number;
  time: string;
  timestamp: string;
}

export interface StatsResponse {
  stats: DashboardStats;
  recentActivity: RecentActivity[];
  timestamp: string;
}

// ============================================
// API Functions
// ============================================

const DEFAULT_TIMEOUT = 10000;

/**
 * Get the API base URL for stats endpoint
 */
function getApiUrl(): string {
  let baseUrl = APP_CONFIG.apiBaseUrl;

  // Ensure we have a proper URL
  if (!baseUrl.startsWith('http')) {
    baseUrl = `${window.location.origin}${baseUrl}`;
  }

  return baseUrl;
}

/**
 * Fetch dashboard statistics from the API
 */
export async function fetchDashboardStats(timeout = DEFAULT_TIMEOUT): Promise<StatsResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const apiUrl = getApiUrl();
    const response = await fetch(`${apiUrl}/api/v1/stats`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }

    const data: StatsResponse = await response.json();
    return data;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Stats request timed out');
      }
      throw error;
    }

    throw new Error('Unknown error fetching stats');
  }
}

/**
 * Add demo data (development only)
 */
export async function addDemoData(timeout = DEFAULT_TIMEOUT): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const apiUrl = getApiUrl();
    const response = await fetch(`${apiUrl}/api/v1/stats/demo`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Create a stats poller for periodic updates
 */
export function createStatsPoller(
  onUpdate: (stats: StatsResponse) => void,
  onError: (error: Error) => void,
  interval = 30000
): { start: () => void; stop: () => void; fetchNow: () => Promise<void> } {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let isRunning = false;

  const fetchNow = async (): Promise<void> => {
    try {
      const stats = await fetchDashboardStats();
      onUpdate(stats);
    } catch (error) {
      onError(error instanceof Error ? error : new Error('Unknown error'));
    }
  };

  const start = () => {
    if (isRunning) return;
    isRunning = true;

    // Initial fetch
    fetchNow();

    // Set up periodic polling
    intervalId = setInterval(fetchNow, interval);
  };

  const stop = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    isRunning = false;
  };

  return { start, stop, fetchNow };
}
