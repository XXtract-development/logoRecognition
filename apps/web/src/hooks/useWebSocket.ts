/**
 * useWebSocket Hook
 * Manages WebSocket connection and event handling
 * Only connects when backend health check passes
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useWebSocketStore } from '@/stores';
import { APP_CONFIG } from '@/constants';
import { checkWebSocketHealth } from '@/services/healthCheck';
import type { WebSocketEvent, WebSocketEventHandler, WebSocketMessage } from '@/types';

interface UseWebSocketOptions {
  /** Auto connect when hook mounts (default: false - waits for health check) */
  autoConnect?: boolean;
  /** Enable reconnection on disconnect */
  reconnect?: boolean;
  /** Skip health check before connecting */
  skipHealthCheck?: boolean;
}

export const useWebSocket = (options: UseWebSocketOptions = {}): {
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
  backendAvailable: boolean;
  send: (event: WebSocketEvent, data: unknown) => void;
  on: (event: WebSocketEvent, handler: WebSocketEventHandler) => void;
  off: (event: WebSocketEvent, handler: WebSocketEventHandler) => void;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  checkBackend: () => Promise<boolean>;
} => {
  const { autoConnect = false, reconnect = true, skipHealthCheck = false } = options;
  const socketRef = useRef<Socket | null>(null);
  const [backendAvailable, setBackendAvailable] = useState(false);

  const isConnected = useWebSocketStore((state) => state.isConnected);
  const isConnecting = useWebSocketStore((state) => state.isConnecting);
  const error = useWebSocketStore((state) => state.error);

  const setConnected = useWebSocketStore((state) => state.setConnected);
  const setConnecting = useWebSocketStore((state) => state.setConnecting);
  const setError = useWebSocketStore((state) => state.setError);
  const incrementReconnectAttempts = useWebSocketStore(
    (state) => state.incrementReconnectAttempts
  );
  const resetReconnectAttempts = useWebSocketStore((state) => state.resetReconnectAttempts);
  const setLastMessage = useWebSocketStore((state) => state.setLastMessage);

  /**
   * Check if the backend WebSocket endpoint is available
   */
  const checkBackend = useCallback(async (): Promise<boolean> => {
    try {
      const result = await checkWebSocketHealth(5000);
      setBackendAvailable(result.healthy);
      return result.healthy;
    } catch {
      setBackendAvailable(false);
      return false;
    }
  }, []);

  /**
   * Connect to WebSocket server
   * Performs health check first unless skipHealthCheck is true
   */
  const connect = useCallback(async (): Promise<boolean> => {
    if (socketRef.current?.connected === true) return true;

    // Perform health check first
    if (!skipHealthCheck) {
      const isHealthy = await checkBackend();
      if (!isHealthy) {
        console.log('[WebSocket] Backend not available, skipping connection');
        setError(new Error('Backend not available'));
        return false;
      }
    }

    setConnecting(true);
    setError(null);

    return new Promise((resolve) => {
      const socket = io(APP_CONFIG.wsBaseUrl, {
        reconnection: false, // Disable auto-reconnection - we handle it manually
        timeout: APP_CONFIG.requestTimeout,
        // Use polling first to test, then upgrade to websocket
        transports: ['polling', 'websocket'],
        // Don't auto-upgrade if polling fails
        upgrade: true,
        // Limit reconnection attempts
        reconnectionAttempts: 1,
      });

      socket.on('connect', () => {
        console.log('[WebSocket] Connected');
        setConnected(true);
        setConnecting(false);
        resetReconnectAttempts();
        setBackendAvailable(true);
        resolve(true);
      });

      socket.on('disconnect', (reason) => {
        console.log('[WebSocket] Disconnected:', reason);
        setConnected(false);
      });

      socket.on('connect_error', (err: Error) => {
        // Suppress all socket.io connection errors - they're expected when backend doesn't have socket.io
        setError(err);
        setConnecting(false);
        incrementReconnectAttempts();
        setBackendAvailable(false);
        // Immediately disconnect and cleanup to prevent any retry attempts
        socket.disconnect();
        socket.close();
        resolve(false);
      });

      socket.on('error', (err: Error) => {
        // Only log in development
        if (import.meta.env.DEV) {
          console.debug('[WebSocket] Error:', err);
        }
        setError(err);
      });

      socketRef.current = socket;
    });
  }, [
    reconnect,
    skipHealthCheck,
    checkBackend,
    setConnected,
    setConnecting,
    setError,
    incrementReconnectAttempts,
    resetReconnectAttempts,
  ]);

  const disconnect = useCallback(() => {
    if (socketRef.current !== null) {
      console.log('[WebSocket] Disconnecting...');
      socketRef.current.disconnect();
      socketRef.current = null;
      setConnected(false);
    }
  }, [setConnected]);

  const send = useCallback((event: WebSocketEvent, data: unknown) => {
    if (socketRef.current?.connected === true) {
      const message: WebSocketMessage = {
        event,
        data,
        timestamp: new Date().toISOString(),
      };
      socketRef.current.emit(event, message);
    } else {
      console.warn('[WebSocket] Cannot send message - not connected');
    }
  }, []);

  const on = useCallback((event: WebSocketEvent, handler: WebSocketEventHandler) => {
    if (socketRef.current !== null) {
      socketRef.current.on(event, (message: WebSocketMessage) => {
        setLastMessage(message);
        handler(message.data);
      });
    }
  }, [setLastMessage]);

  const off = useCallback((event: WebSocketEvent, handler: WebSocketEventHandler) => {
    if (socketRef.current !== null) {
      socketRef.current.off(event, handler);
    }
  }, []);

  useEffect(() => {
    // Only connect if autoConnect is explicitly requested
    // Do NOT automatically check backend - this prevents unnecessary network requests
    // The BackendStatusContext handles health checking centrally
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    isConnected,
    isConnecting,
    error,
    backendAvailable,
    send,
    on,
    off,
    connect,
    disconnect,
    checkBackend,
  };
};
