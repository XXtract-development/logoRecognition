/**
 * WebSocket Manager
 * Handles real-time updates for training jobs and other events
 */

import { WebSocket } from 'ws';
import { createLogger } from '../core/logger';

const logger = createLogger('websocket-manager');

// ============================================
// Types
// ============================================

interface WebSocketClient {
  socket: WebSocket;
  userId?: string;
  subscriptions: Set<string>;
  lastPing: number;
}

interface TrainingUpdate {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentEpoch?: number;
  totalEpochs?: number;
  currentAccuracy?: number;
  currentLoss?: number;
  eta?: number;
  message?: string;
}

interface RecognitionUpdate {
  requestId: string;
  status: 'processing' | 'completed' | 'error';
  detectionCount?: number;
  processingTimeMs?: number;
}

type UpdateType = 'training' | 'recognition' | 'feedback' | 'system';

interface BroadcastMessage {
  type: UpdateType;
  event: string;
  data: any;
  timestamp: string;
}

// ============================================
// WebSocket Manager Class
// ============================================

class WebSocketManager {
  private clients: Map<string, WebSocketClient> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private readonly PING_INTERVAL = 30000; // 30 seconds
  private readonly PING_TIMEOUT = 60000; // 60 seconds

  constructor() {
    this.startPingInterval();
  }

  /**
   * Register a new WebSocket connection
   */
  registerClient(clientId: string, socket: WebSocket, userId?: string): void {
    const client: WebSocketClient = {
      socket,
      userId,
      subscriptions: new Set(),
      lastPing: Date.now(),
    };

    this.clients.set(clientId, client);

    logger.info('WebSocket client registered', {
      clientId,
      userId,
      totalClients: this.clients.size,
    });

    // Send welcome message
    this.sendToClient(clientId, {
      type: 'system',
      event: 'connected',
      data: { clientId, message: 'Connected to real-time updates' },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Remove a WebSocket connection
   */
  unregisterClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      logger.info('WebSocket client unregistered', {
        clientId,
        totalClients: this.clients.size,
      });
    }
  }

  /**
   * Subscribe client to a specific topic
   */
  subscribe(clientId: string, topic: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    client.subscriptions.add(topic);
    logger.debug('Client subscribed', { clientId, topic });

    this.sendToClient(clientId, {
      type: 'system',
      event: 'subscribed',
      data: { topic },
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  /**
   * Unsubscribe client from a topic
   */
  unsubscribe(clientId: string, topic: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    client.subscriptions.delete(topic);
    logger.debug('Client unsubscribed', { clientId, topic });

    return true;
  }

  /**
   * Send message to specific client
   */
  sendToClient(clientId: string, message: BroadcastMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      client.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error('Failed to send message to client', {
        clientId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Broadcast message to all clients subscribed to a topic
   */
  broadcastToTopic(topic: string, message: BroadcastMessage): number {
    let sentCount = 0;

    for (const [clientId, client] of this.clients) {
      if (client.subscriptions.has(topic) && client.socket.readyState === WebSocket.OPEN) {
        if (this.sendToClient(clientId, message)) {
          sentCount++;
        }
      }
    }

    logger.debug('Broadcast sent', { topic, sentCount });
    return sentCount;
  }

  /**
   * Broadcast to all connected clients
   */
  broadcastAll(message: BroadcastMessage): number {
    let sentCount = 0;

    for (const [clientId, client] of this.clients) {
      if (client.socket.readyState === WebSocket.OPEN) {
        if (this.sendToClient(clientId, message)) {
          sentCount++;
        }
      }
    }

    return sentCount;
  }

  /**
   * Send training update
   */
  sendTrainingUpdate(update: TrainingUpdate): void {
    const message: BroadcastMessage = {
      type: 'training',
      event: 'training_progress',
      data: update,
      timestamp: new Date().toISOString(),
    };

    // Send to clients subscribed to this specific job
    this.broadcastToTopic(`training:${update.jobId}`, message);

    // Also send to clients subscribed to all training updates
    this.broadcastToTopic('training:*', message);

    logger.debug('Training update sent', {
      jobId: update.jobId,
      status: update.status,
      progress: update.progress,
    });
  }

  /**
   * Send training job started notification
   */
  notifyTrainingStarted(jobId: string, batchId: string, config: any): void {
    this.broadcastToTopic('training:*', {
      type: 'training',
      event: 'training_started',
      data: { jobId, batchId, config },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send training job completed notification
   */
  notifyTrainingCompleted(jobId: string, accuracy: number, modelId: string): void {
    const message: BroadcastMessage = {
      type: 'training',
      event: 'training_completed',
      data: { jobId, accuracy, modelId },
      timestamp: new Date().toISOString(),
    };

    this.broadcastToTopic(`training:${jobId}`, message);
    this.broadcastToTopic('training:*', message);
  }

  /**
   * Send training job failed notification
   */
  notifyTrainingFailed(jobId: string, error: string): void {
    const message: BroadcastMessage = {
      type: 'training',
      event: 'training_failed',
      data: { jobId, error },
      timestamp: new Date().toISOString(),
    };

    this.broadcastToTopic(`training:${jobId}`, message);
    this.broadcastToTopic('training:*', message);
  }

  /**
   * Send recognition update
   */
  sendRecognitionUpdate(update: RecognitionUpdate): void {
    this.broadcastToTopic('recognition:*', {
      type: 'recognition',
      event: 'recognition_update',
      data: update,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send feedback notification
   */
  notifyFeedbackReceived(logId: string, isCorrect: boolean): void {
    this.broadcastToTopic('feedback:*', {
      type: 'feedback',
      event: 'feedback_received',
      data: { logId, isCorrect },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send retraining trigger notification
   */
  notifyRetrainingTriggered(batchId: string, reason: string): void {
    this.broadcastToTopic('training:*', {
      type: 'training',
      event: 'retraining_triggered',
      data: { batchId, reason },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle client ping
   */
  handlePing(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastPing = Date.now();
      this.sendToClient(clientId, {
        type: 'system',
        event: 'pong',
        data: {},
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get clients by subscription topic
   */
  getSubscribedClients(topic: string): string[] {
    const clientIds: string[] = [];
    for (const [clientId, client] of this.clients) {
      if (client.subscriptions.has(topic)) {
        clientIds.push(clientId);
      }
    }
    return clientIds;
  }

  /**
   * Start ping interval to detect dead connections
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      const now = Date.now();
      const deadClients: string[] = [];

      for (const [clientId, client] of this.clients) {
        if (now - client.lastPing > this.PING_TIMEOUT) {
          deadClients.push(clientId);
        } else if (client.socket.readyState === WebSocket.OPEN) {
          try {
            client.socket.ping();
          } catch (error) {
            deadClients.push(clientId);
          }
        }
      }

      // Clean up dead connections
      for (const clientId of deadClients) {
        logger.info('Removing dead WebSocket connection', { clientId });
        this.unregisterClient(clientId);
      }
    }, this.PING_INTERVAL);
  }

  /**
   * Stop ping interval
   */
  stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Close all connections
   */
  closeAll(): void {
    for (const [clientId, client] of this.clients) {
      try {
        client.socket.close(1001, 'Server shutting down');
      } catch (error) {
        logger.error('Error closing WebSocket', { clientId });
      }
    }
    this.clients.clear();
    this.stopPingInterval();
  }
}

// ============================================
// Singleton Instance
// ============================================

export const wsManager = new WebSocketManager();
export default wsManager;
