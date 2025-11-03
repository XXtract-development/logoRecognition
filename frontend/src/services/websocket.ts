/**
 * WebSocket Service for real-time communication
 * Leverages Sprint 1 WebSocket infrastructure
 */

import { EventEmitter } from 'events';

export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp?: number;
}

class WebSocketService extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private disabled = false;

  constructor() {
    super();
    // Default to localhost, can be configured via environment variable
    this.url = process.env.REACT_APP_WS_URL || 'ws://localhost:8000/ws';
    // Disable auto-connect to prevent console errors when WebSocket is not available
    this.maxReconnectAttempts = 0;
    // WebSocket is disabled by default
    this.disabled = true;
  }

  connect(): Promise<void> {
    return new Promise((resolve) => {
      // Always resolve immediately without connecting to prevent WebSocket errors
      // WebSocket functionality is disabled until backend support is added
      // Silent mode - no console messages
      this.isConnecting = false;
      resolve();
    });
  }

  private setupWebSocketHandlers(resolve: () => void, reject: (error: any) => void): void {
    if (!this.ws) return;
    try {

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.emit('connected');
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.emit('message', message);
          // Emit specific event types
          if (message.type) {
            this.emit(message.type, message.payload);
          }
        } catch (error) {
          console.warn('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        // Downgrade to info to avoid console errors when WebSocket is not available
        console.info('WebSocket connection unavailable');
        this.isConnecting = false;
        this.emit('error', error);
        // Don't reject, just resolve to prevent app errors
        resolve();
      };

      this.ws.onclose = () => {
        console.info('WebSocket disconnected');
        this.isConnecting = false;
        this.emit('disconnected');
        // Only reconnect if explicitly enabled
        if (this.maxReconnectAttempts > 0) {
          this.handleReconnect();
        }
      };
    } catch (error) {
      this.isConnecting = false;
      console.info('WebSocket setup skipped');
      resolve();
    }
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      console.info(`Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts})`);

      setTimeout(() => {
        this.connect().catch(console.error);
      }, delay);
    } else {
      console.info('Max reconnection attempts reached');
      this.emit('reconnect_failed');
    }
  }

  send(type: string, payload: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const message: WebSocketMessage = {
        type,
        payload,
        timestamp: Date.now()
      };
      this.ws.send(JSON.stringify(message));
    } else {
      console.info('WebSocket is not connected, message not sent');
      // Queue message for later or throw error based on requirements
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  getReadyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
const wsService = new WebSocketService();

export default wsService;