/**
 * useWebSocket Hook
 * Manages WebSocket connection and event handling
 */

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useWebSocketStore } from '@/stores';
import { APP_CONFIG } from '@/constants';
import type { WebSocketEvent, WebSocketEventHandler, WebSocketMessage } from '@/types';

interface UseWebSocketOptions {
  autoConnect?: boolean;
  reconnect?: boolean;
}

export const useWebSocket = (options: UseWebSocketOptions = {}): {
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
  send: (event: WebSocketEvent, data: unknown) => void;
  on: (event: WebSocketEvent, handler: WebSocketEventHandler) => void;
  off: (event: WebSocketEvent, handler: WebSocketEventHandler) => void;
  connect: () => void;
  disconnect: () => void;
} => {
  const { autoConnect = true, reconnect = true } = options;
  const socketRef = useRef<Socket | null>(null);

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

  const connect = useCallback(() => {
    if (socketRef.current?.connected === true) return;

    setConnecting(true);

    const socket = io(APP_CONFIG.wsBaseUrl, {
      reconnection: reconnect,
      reconnectionDelay: APP_CONFIG.wsReconnectDelay,
      reconnectionAttempts: APP_CONFIG.wsMaxReconnectAttempts,
      timeout: APP_CONFIG.requestTimeout,
    });

    socket.on('connect', () => {
      setConnected(true);
      resetReconnectAttempts();
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('connect_error', (err: Error) => {
      setError(err);
      incrementReconnectAttempts();
    });

    socket.on('error', (err: Error) => {
      setError(err);
    });

    socketRef.current = socket;
  }, [
    reconnect,
    setConnected,
    setConnecting,
    setError,
    incrementReconnectAttempts,
    resetReconnectAttempts,
  ]);

  const disconnect = useCallback(() => {
    if (socketRef.current !== null) {
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
    send,
    on,
    off,
    connect,
    disconnect,
  };
};