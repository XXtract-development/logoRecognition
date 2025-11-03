// WebSocket service for training job real-time updates (US-014)
import { TrainingJobStatus } from '../../types/training';

type MessageHandler = (data: TrainingJobStatus) => void;
type ConnectionHandler = (status: 'connected' | 'disconnected' | 'reconnecting') => void;

class TrainingWebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectDelays = [1000, 2000, 4000, 8000, 16000, 30000];
  private reconnectAttempt = 0;
  private currentJobId: string | null = null;
  private messageHandler: MessageHandler | null = null;
  private connectionHandler: ConnectionHandler | null = null;
  private isIntentionallyClosed = false;
  private lastHeartbeat: number = Date.now();
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly HEARTBEAT_TIMEOUT = 60000; // 60 seconds

  // Get WebSocket base URL from environment or use default
  private getWsBaseUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = process.env.REACT_APP_WS_HOST || window.location.host;
    return `${protocol}//${host}`;
  }

  // Connect to WebSocket for a specific job
  connect(
    jobId: string,
    onMessage: MessageHandler,
    onConnectionChange?: ConnectionHandler
  ): void {
    // WebSocket is disabled until backend support is available
    // Silent mode - no console messages

    // Store handlers and job ID for future use
    this.currentJobId = jobId;
    this.messageHandler = onMessage;
    this.connectionHandler = onConnectionChange;

    // Notify as disconnected
    this.connectionHandler?.('disconnected');

    // Load cached status if available
    if (jobId) {
      const cachedStatus = this.getCachedStatus(jobId);
      if (cachedStatus) {
        // Silently use cached status
        this.messageHandler?.(cachedStatus);
      }
    }
  }

  // Handle WebSocket open event
  private handleOpen(): void {
    console.log('WebSocket connected');
    this.reconnectAttempt = 0;
    this.connectionHandler?.('connected');
    this.startHeartbeat();

    // Load cached status from sessionStorage if available
    if (this.currentJobId) {
      const cachedStatus = this.getCachedStatus(this.currentJobId);
      if (cachedStatus) {
        console.log('Loaded cached status for job:', this.currentJobId);
        this.messageHandler?.(cachedStatus);
      }
    }
  }

  // Handle incoming WebSocket message
  private handleMessage(event: MessageEvent): void {
    try {
      // Update heartbeat timestamp
      this.lastHeartbeat = Date.now();

      const data = JSON.parse(event.data);

      // Handle ping/pong for heartbeat
      if (data.type === 'pong') {
        return;
      }

      // Validate message structure
      if (!data.jobId || typeof data.status !== 'string') {
        console.warn('Invalid message structure received');
        return;
      }

      // Handle training status update
      const status = data as TrainingJobStatus;

      // Validate jobId matches current connection
      if (status.jobId !== this.currentJobId) {
        console.warn(`Received status for different job: ${status.jobId}`);
        return;
      }

      console.log('Received job status update:', status.jobId, status.status);

      // Notify handler
      this.messageHandler?.(status);

      // Cache status to sessionStorage
      this.cacheStatus(status.jobId, status);
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  // Handle WebSocket error event
  private handleError(event: Event): void {
    console.info('WebSocket connection not available');
    this.connectionHandler?.('disconnected');
  }

  // Handle WebSocket close event
  private handleClose(event: CloseEvent): void {
    console.log('WebSocket closed:', event.code, event.reason);
    this.stopHeartbeat();
    this.connectionHandler?.('disconnected');

    // Only attempt reconnect if not intentionally closed
    if (!this.isIntentionallyClosed && this.currentJobId) {
      this.scheduleReconnect();
    }
  }

  // Schedule reconnection with exponential backoff
  private scheduleReconnect(): void {
    // Reconnection disabled - WebSocket not available
    // Silent mode - no console messages
    this.connectionHandler?.('disconnected');
  }

  // Start heartbeat to keep connection alive
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      // Check if connection is stale
      if (Date.now() - this.lastHeartbeat > this.HEARTBEAT_TIMEOUT) {
        console.warn('Connection appears stale, reconnecting...');
        this.ws?.close();
        this.scheduleReconnect();
        return;
      }

      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      }
    }, 30000); // Send ping every 30 seconds
  }

  // Stop heartbeat
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // Cache status to sessionStorage
  private cacheStatus(jobId: string, status: TrainingJobStatus): void {
    const key = `training_job_${jobId}`;
    try {
      sessionStorage.setItem(key, JSON.stringify(status));
    } catch (error) {
      console.error('Failed to cache status:', error);
    }
  }

  // Get cached status from sessionStorage
  private getCachedStatus(jobId: string): TrainingJobStatus | null {
    const key = `training_job_${jobId}`;
    try {
      const cached = sessionStorage.getItem(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Failed to load cached status:', error);
      return null;
    }
  }

  // Manually disconnect WebSocket
  disconnect(): void {
    console.log('Disconnecting WebSocket');
    this.isIntentionallyClosed = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.currentJobId = null;
    this.messageHandler = null;
    this.connectionHandler = null;
    this.reconnectAttempt = 0;
  }

  // Get current connection state
  getConnectionState(): 'connected' | 'disconnected' | 'reconnecting' {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return 'connected';
    }
    return this.reconnectTimer ? 'reconnecting' : 'disconnected';
  }

  // Send a message to the server
  send(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('Cannot send message: WebSocket is not connected');
    }
  }

  // Check if connected
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Export singleton instance
const trainingWebSocketService = new TrainingWebSocketService();
export default trainingWebSocketService;