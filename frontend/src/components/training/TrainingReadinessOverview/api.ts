import { CategoryValueReadiness, ReadinessAPIResponse } from './types';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api/v1';

interface FetchReadinessParams {
  category?: string;
  status?: 'ready' | 'almost_ready' | 'needs_work';
  sort?: string;
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

/**
 * Fetch readiness data from the backend with retry and deduplication
 */
export async function fetchReadinessData(
  params: FetchReadinessParams = {},
  signal?: AbortSignal
): Promise<ReadinessAPIResponse> {
  console.log('[fetchReadinessData] Starting with params:', params);
  const queryParams = new URLSearchParams();

  // Sanitize and validate inputs
  if (params.category) {
    const sanitizedCategory = encodeURIComponent(params.category.trim());
    queryParams.append('category', sanitizedCategory);
  }
  if (params.status && ['ready', 'almost_ready', 'needs_work'].includes(params.status)) {
    queryParams.append('status', params.status);
  }
  if (params.sort && ['category', 'value', 'readiness', 'needed', 'updated'].includes(params.sort)) {
    queryParams.append('sort', params.sort);
  }
  if (params.order && ['asc', 'desc'].includes(params.order)) {
    queryParams.append('order', params.order);
  }
  if (params.page && params.page > 0 && params.page <= 1000) {
    queryParams.append('page', params.page.toString());
  }
  if (params.pageSize && params.pageSize > 0 && params.pageSize <= 100) {
    queryParams.append('pageSize', params.pageSize.toString());
  }

  // Get auth token from localStorage or sessionStorage
  const authToken = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');

  // Don't proceed if the signal is already aborted
  if (signal?.aborted) {
    throw new Error('Request was aborted');
  }

  console.log('[fetchReadinessData] Making fetch request...');

  // Direct fetch without deduplication for now to fix hanging issue
  const response = await fetch(
    `/api/training/readiness?${queryParams.toString()}`,
    {
      headers: {
        'Content-Type': 'application/json',
        ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
      },
      signal,
    }
  );

  console.log('[fetchReadinessData] Response status:', response.status);

  if (!response.ok) {
    const error: any = new Error(`Failed to fetch readiness data: ${response.statusText}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  console.log('[fetchReadinessData] Raw data received:', data);

  // Transform the data to match our interface
  const transformedData: CategoryValueReadiness[] = (data.data || []).map((item: any) => ({
    ...item,
    lastUpdated: item.lastUpdated ? new Date(item.lastUpdated) : new Date(),
  }));

  console.log('[fetchReadinessData] Transformed data:', transformedData);

  return {
    ...data,
    data: transformedData,
  };
}

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000]; // Progressive delays

/**
 * Establish WebSocket connection for real-time updates with exponential backoff
 * DISABLED: WebSocket not available on backend
 */
export function connectWebSocket(
  onMessage: (message: any) => void,
  onError?: (error: Event) => void,
  onReconnectFailed?: () => void
): WebSocket | null {
  // WebSocket disabled until backend support is available
  // Silent mode - no console messages
  return null;

  /* Disabled WebSocket code
  const wsUrl = API_BASE_URL.replace(/^http/, 'ws');
  const ws = new WebSocket(`${wsUrl}/ws/training-readiness`);

  // Set timeout for connection
  const connectionTimeout = setTimeout(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      ws.close();
      console.error('WebSocket connection timeout');
    }
  }, 10000); // 10 second timeout

  ws.onopen = () => {
    clearTimeout(connectionTimeout);
    console.log('WebSocket connected');
    reconnectAttempts = 0; // Reset on successful connection
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      onMessage(message);
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  };

  ws.onerror = (error) => {
    clearTimeout(connectionTimeout);
    console.error('WebSocket error:', error);
    if (onError) onError(error);
  };

  ws.onclose = () => {
    clearTimeout(connectionTimeout);
    console.log('WebSocket connection closed');

    // Check if we should attempt reconnection
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = RECONNECT_DELAYS[Math.min(reconnectAttempts, RECONNECT_DELAYS.length - 1)];
      console.log(`Attempting reconnect ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);

      setTimeout(() => {
        reconnectAttempts++;
        connectWebSocket(onMessage, onError, onReconnectFailed);
      }, delay);
    } else {
      console.error('Max WebSocket reconnection attempts reached');
      if (onReconnectFailed) {
        onReconnectFailed();
      }
    }
  };

  return ws;
  */
}

/**
 * Reset WebSocket reconnection attempts (useful when manually reconnecting)
 */
export function resetWebSocketReconnectAttempts(): void {
  reconnectAttempts = 0;
}

/**
 * Trigger training for selected category-value combinations
 */
export async function startTraining(items: CategoryValueReadiness[]): Promise<void> {
  const authToken = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');

  // Validate items array
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Invalid items for training');
  }

  const response = await fetch(`/api/training/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
    },
    body: JSON.stringify({
      items: items.map(item => ({
        category: encodeURIComponent(item.category.code),
        value: encodeURIComponent(item.value.code),
      })),
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to start training: ${response.statusText}`);
  }
}

/**
 * Get list of categories for filtering
 */
export async function fetchCategories(): Promise<Array<{ code: string; label: string }>> {
  const authToken = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');

  const response = await fetch('/api/categories', {
    headers: {
      'Content-Type': 'application/json',
      ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch categories: ${response.statusText}`);
  }

  const data = await response.json();

  // Transform backend response to expected format
  if (data.categories && Array.isArray(data.categories)) {
    return data.categories.map((cat: any) => ({
      code: cat.code || cat.categorie,
      label: cat.code_naam || cat.categorie_naam || cat.categorie
    }));
  }

  return [];
}