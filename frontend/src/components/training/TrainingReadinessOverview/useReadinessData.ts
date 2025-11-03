import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { debounce } from 'lodash';
import {
  CategoryValueReadiness,
  ReadinessFilters,
  ReadinessOverviewState,
} from './types';
import {
  filterReadinessItems,
  sortReadinessItems,
  calculateReadinessPercentage,
  calculateAnnotationsNeeded,
  determineReadinessStatus,
} from './utils';
import { fetchReadinessData, connectWebSocket } from './api';

interface UseReadinessDataOptions {
  refreshInterval?: number;
  enableWebSocket?: boolean;
  pageSize?: number;
}

export function useReadinessData(options: UseReadinessDataOptions = {}) {
  const {
    refreshInterval = 60000, // 1 minute
    enableWebSocket = false, // Disable WebSocket since backend doesn't support it
    pageSize = 50,
  } = options;

  // State
  const [state, setState] = useState<ReadinessOverviewState>({
    items: [],
    isLoading: true,
    filters: {
      status: 'all',
      category: null,
      searchTerm: '',
    },
    sortBy: 'readiness',
    sortDirection: 'asc',
    error: null,
  });

  // Refs for WebSocket and interval
  const wsRef = useRef<WebSocket | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Memoized filtered and sorted items
  const processedItems = useMemo(() => {
    const filtered = filterReadinessItems(state.items, state.filters);
    return sortReadinessItems(filtered, state.sortBy, state.sortDirection);
  }, [state.items, state.filters, state.sortBy, state.sortDirection]);

  // Fetch data from API - no dependencies to prevent re-creation
  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      // Get current state values directly
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      // Access state directly from the current state
      const currentState = state;

      const response = await fetchReadinessData({
        category: currentState.filters.category || undefined,
        status: currentState.filters.status !== 'all' ? currentState.filters.status : undefined,
        sort: currentState.sortBy,
        order: currentState.sortDirection,
        pageSize,
      }, signal);

      if (!signal?.aborted) {
        setState((prev) => ({
          ...prev,
          items: response.data,
          isLoading: false,
        }));
      }
    } catch (error: any) {
      // Check if error is due to abort
      if (!signal?.aborted && !error?.message?.includes('abort')) {
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to fetch data',
          isLoading: false,
        }));
      }
    }
  }, [state, pageSize]); // Only depend on state and pageSize

  // Debounced search
  const debouncedSetSearchTerm = useMemo(
    () =>
      debounce((searchTerm: string) => {
        setState((prev) => ({
          ...prev,
          filters: { ...prev.filters, searchTerm },
        }));
      }, 300),
    []
  );

  // Update filters
  const updateFilters = useCallback((updates: Partial<ReadinessFilters>) => {
    setState((prev) => ({
      ...prev,
      filters: { ...prev.filters, ...updates },
    }));
  }, []);

  // Update sort
  const updateSort = useCallback(
    (field: ReadinessOverviewState['sortBy']) => {
      setState((prev) => ({
        ...prev,
        sortBy: field,
        sortDirection:
          prev.sortBy === field && prev.sortDirection === 'asc' ? 'desc' : 'asc',
      }));
    },
    []
  );

  // Handle WebSocket message
  const handleWebSocketMessage = useCallback((message: any) => {
    if (message.type === 'update') {
      setState((prev) => {
        const index = prev.items.findIndex((item) => item.id === message.payload.id);
        if (index >= 0) {
          const newItems = [...prev.items];
          const updatedItem = message.payload;

          // Recalculate readiness fields
          updatedItem.readinessPercentage = calculateReadinessPercentage(
            updatedItem.currentCount,
            updatedItem.minimumRequired
          );
          updatedItem.annotationsNeeded = calculateAnnotationsNeeded(
            updatedItem.currentCount,
            updatedItem.minimumRequired
          );
          updatedItem.status = determineReadinessStatus(updatedItem.readinessPercentage);

          newItems[index] = updatedItem;
          return { ...prev, items: newItems };
        }
        return prev;
      });
    } else if (message.type === 'add') {
      setState((prev) => ({
        ...prev,
        items: [...prev.items, message.payload],
      }));
    } else if (message.type === 'delete') {
      setState((prev) => ({
        ...prev,
        items: prev.items.filter((item) => item.id !== message.payload.id),
      }));
    }
  }, []);

  // Setup WebSocket connection
  const setupWebSocket = useCallback(() => {
    if (!enableWebSocket) return;

    if (wsRef.current) {
      wsRef.current.close();
    }

    wsRef.current = connectWebSocket(
      handleWebSocketMessage,
      (error) => {
        console.error('WebSocket error:', error);
      }
    );
  }, [enableWebSocket, handleWebSocketMessage]);

  // Setup refresh interval
  const setupRefreshInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    if (refreshInterval > 0) {
      intervalRef.current = setInterval(() => {
        const controller = new AbortController();
        abortControllerRef.current = controller;
        fetchData(controller.signal);
      }, refreshInterval);
    }
  }, [refreshInterval, fetchData]);

  // Initial load and setup
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Fetch initial data
    const loadData = async () => {
      if (!mounted) return;

      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        const response = await fetchReadinessData({
          pageSize,
        }, controller.signal);

        if (mounted && !controller.signal.aborted) {
          setState((prev) => ({
            ...prev,
            items: response.data,
            isLoading: false,
          }));
        }
      } catch (error: any) {
        if (mounted && !controller.signal.aborted && !error?.message?.includes('abort')) {
          setState((prev) => ({
            ...prev,
            error: error instanceof Error ? error.message : 'Failed to fetch data',
            isLoading: false,
          }));
        }
      }
    };

    loadData();

    // Cleanup function
    return () => {
      mounted = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [pageSize]); // Only run on mount/unmount and when pageSize changes

  // Refresh data manually
  const refresh = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    fetchData(controller.signal);
  }, [fetchData]);

  return {
    items: processedItems,
    isLoading: state.isLoading,
    error: state.error,
    filters: state.filters,
    sortBy: state.sortBy,
    sortDirection: state.sortDirection,
    updateFilters,
    updateSort,
    setSearchTerm: debouncedSetSearchTerm,
    refresh,
    totalItems: state.items.length,
    filteredCount: processedItems.length,
  };
}

// Performance optimization hook for large datasets
export function useVirtualizedData<T>(
  data: T[],
  itemHeight: number,
  containerHeight: number
) {
  const [scrollTop, setScrollTop] = useState(0);

  const visibleRange = useMemo(() => {
    const startIndex = Math.floor(scrollTop / itemHeight);
    const endIndex = Math.min(
      startIndex + Math.ceil(containerHeight / itemHeight) + 1,
      data.length
    );
    return { startIndex, endIndex };
  }, [scrollTop, itemHeight, containerHeight, data.length]);

  const visibleItems = useMemo(
    () => data.slice(visibleRange.startIndex, visibleRange.endIndex),
    [data, visibleRange]
  );

  const totalHeight = data.length * itemHeight;
  const offsetY = visibleRange.startIndex * itemHeight;

  return {
    visibleItems,
    totalHeight,
    offsetY,
    setScrollTop,
    visibleRange,
  };
}