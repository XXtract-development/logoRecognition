/**
 * WebSocket Store
 * Manages WebSocket connection state
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { WebSocketMessage } from '@/types';

interface WebSocketState {
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
  reconnectAttempts: number;
  lastMessage: WebSocketMessage | null;
}

interface WebSocketActions {
  setConnected: (connected: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setError: (error: Error | null) => void;
  incrementReconnectAttempts: () => void;
  resetReconnectAttempts: () => void;
  setLastMessage: (message: WebSocketMessage) => void;
  reset: () => void;
}

type WebSocketStore = WebSocketState & WebSocketActions;

const initialState: WebSocketState = {
  isConnected: false,
  isConnecting: false,
  error: null,
  reconnectAttempts: 0,
  lastMessage: null,
};

export const useWebSocketStore = create<WebSocketStore>()(
  devtools(
    immer((set) => ({
      ...initialState,

      setConnected: (connected: boolean) =>
        set((state) => {
          state.isConnected = connected;
          state.isConnecting = false;
          if (connected) {
            state.error = null;
            state.reconnectAttempts = 0;
          }
        }),

      setConnecting: (connecting: boolean) =>
        set((state) => {
          state.isConnecting = connecting;
        }),

      setError: (error: Error | null) =>
        set((state) => {
          state.error = error;
          state.isConnecting = false;
        }),

      incrementReconnectAttempts: () =>
        set((state) => {
          state.reconnectAttempts++;
        }),

      resetReconnectAttempts: () =>
        set((state) => {
          state.reconnectAttempts = 0;
        }),

      setLastMessage: (message: WebSocketMessage) =>
        set((state) => {
          state.lastMessage = message;
        }),

      reset: () => set(initialState),
    })),
    { name: 'WebSocketStore' }
  )
);