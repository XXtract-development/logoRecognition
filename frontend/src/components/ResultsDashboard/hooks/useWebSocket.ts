import { useState, useEffect, useCallback, useRef } from 'react';

interface WebSocketMessage {
  type: string;
  detection?: any;
  progress?: number;
  error?: string;
  data?: any;
}

export const useWebSocket = (endpoint: string) => {
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      // Construct WebSocket URL
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = process.env.REACT_APP_WS_HOST || window.location.host;
      const wsUrl = `${protocol}//${host}${endpoint}`;

      // Use debug flag for development logging
      const debug = process.env.NODE_ENV === 'development';
      if (debug) {
        // Development only logging
        // console.debug('Connecting to WebSocket:', wsUrl);
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          setMessages((prev) => [...prev, message]);
        } catch (err) {
          // Silent fail in production, log in development
          if (process.env.NODE_ENV === 'development') {
            // console.error('Failed to parse WebSocket message:', err);
          }
        }
      };

      ws.onerror = (event) => {
        setError('WebSocket connection error');
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        wsRef.current = null;

        // Attempt reconnection with exponential backoff (MAX 5 attempts)
        if (reconnectAttemptsRef.current < 5) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
          reconnectAttemptsRef.current++;

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          setError('Failed to connect after 5 attempts');
        }
      };
    } catch (err) {
      setError('Failed to establish WebSocket connection');
    }
  }, [endpoint]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    reconnectAttemptsRef.current = 0;
  }, []);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      // Silently fail or queue message for later
      if (process.env.NODE_ENV === 'development') {
        // console.warn('WebSocket is not connected');
      }
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (endpoint) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [endpoint]);

  return {
    messages,
    isConnected,
    error,
    sendMessage,
    clearMessages,
    reconnect: connect,
    disconnect
  };
};