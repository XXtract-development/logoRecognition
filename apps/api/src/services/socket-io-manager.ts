/**
 * Socket.IO Manager
 * Handles real-time updates using Socket.IO protocol
 * Compatible with socket.io-client in the frontend
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { createLogger } from '../core/logger';

const logger = createLogger('socket-io-manager');

// ============================================
// Types
// ============================================

interface SocketClient {
  socket: Socket;
  userId?: string;
  subscriptions: Set<string>;
  connectedAt: Date;
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

// ============================================
// Socket.IO Manager Class
// ============================================

class SocketIOManager {
  private io: SocketIOServer | null = null;
  private clients: Map<string, SocketClient> = new Map();

  /**
   * Initialize Socket.IO server with HTTP server
   */
  initialize(httpServer: HttpServer): SocketIOServer {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173', 'http://localhost:3000'],
        methods: ['GET', 'POST'],
        credentials: true,
      },
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.setupEventHandlers();

    logger.info('Socket.IO server initialized');

    return this.io;
  }

  /**
   * Setup Socket.IO event handlers
   */
  private setupEventHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      const clientId = socket.id;

      logger.info('Socket.IO client connected', {
        clientId,
        transport: socket.conn.transport.name,
        totalClients: this.clients.size + 1,
      });

      // Register client
      const client: SocketClient = {
        socket,
        subscriptions: new Set(),
        connectedAt: new Date(),
      };
      this.clients.set(clientId, client);

      // Send welcome message
      socket.emit('connected', {
        clientId,
        message: 'Connected to Logo Recognition real-time updates',
        timestamp: new Date().toISOString(),
      });

      // Handle subscription requests
      socket.on('subscribe', (data: { topic: string }) => {
        if (data.topic) {
          client.subscriptions.add(data.topic);
          socket.join(data.topic);
          logger.debug('Client subscribed', { clientId, topic: data.topic });
          socket.emit('subscribed', { topic: data.topic });
        }
      });

      socket.on('unsubscribe', (data: { topic: string }) => {
        if (data.topic) {
          client.subscriptions.delete(data.topic);
          socket.leave(data.topic);
          logger.debug('Client unsubscribed', { clientId, topic: data.topic });
        }
      });

      // Handle training subscriptions
      socket.on('subscribe_training', (data?: { job_id?: string }) => {
        const topic = data?.job_id ? `training:${data.job_id}` : 'training:*';
        client.subscriptions.add(topic);
        client.subscriptions.add('training:*');
        socket.join(topic);
        socket.join('training:*');
        logger.debug('Client subscribed to training', { clientId, jobId: data?.job_id });
        socket.emit('subscribed', { topic });
      });

      // Handle recognition subscriptions
      socket.on('subscribe_recognition', () => {
        const topic = 'recognition:*';
        client.subscriptions.add(topic);
        socket.join(topic);
        logger.debug('Client subscribed to recognition', { clientId });
        socket.emit('subscribed', { topic });
      });

      // Handle feedback subscriptions
      socket.on('subscribe_feedback', () => {
        const topic = 'feedback:*';
        client.subscriptions.add(topic);
        socket.join(topic);
        logger.debug('Client subscribed to feedback', { clientId });
        socket.emit('subscribed', { topic });
      });

      // Handle ping
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: new Date().toISOString() });
      });

      // Handle disconnect
      socket.on('disconnect', (reason) => {
        this.clients.delete(clientId);
        logger.info('Socket.IO client disconnected', {
          clientId,
          reason,
          totalClients: this.clients.size,
        });
      });

      // Handle errors
      socket.on('error', (error) => {
        logger.error('Socket.IO error', {
          clientId,
          error: error.message,
        });
      });
    });
  }

  /**
   * Send training update
   */
  sendTrainingUpdate(update: TrainingUpdate): void {
    if (!this.io) return;

    const message = {
      type: 'training',
      event: 'training_progress',
      data: update,
      timestamp: new Date().toISOString(),
    };

    // Send to specific job subscribers
    this.io.to(`training:${update.jobId}`).emit('training_progress', message);

    // Also send to all training subscribers
    this.io.to('training:*').emit('training_progress', message);

    logger.debug('Training update sent via Socket.IO', {
      jobId: update.jobId,
      status: update.status,
      progress: update.progress,
    });
  }

  /**
   * Notify training started
   */
  notifyTrainingStarted(jobId: string, batchId: string, config: any): void {
    if (!this.io) return;

    const message = {
      type: 'training',
      event: 'training_started',
      data: { jobId, batchId, config },
      timestamp: new Date().toISOString(),
    };

    this.io.to('training:*').emit('training_started', message);
    this.io.to(`training:${jobId}`).emit('training_started', message);
  }

  /**
   * Notify training completed
   */
  notifyTrainingCompleted(jobId: string, accuracy: number, modelId: string): void {
    if (!this.io) return;

    const message = {
      type: 'training',
      event: 'training_completed',
      data: { jobId, accuracy, modelId },
      timestamp: new Date().toISOString(),
    };

    this.io.to(`training:${jobId}`).emit('training_completed', message);
    this.io.to('training:*').emit('training_completed', message);
  }

  /**
   * Notify training failed
   */
  notifyTrainingFailed(jobId: string, error: string): void {
    if (!this.io) return;

    const message = {
      type: 'training',
      event: 'training_failed',
      data: { jobId, error },
      timestamp: new Date().toISOString(),
    };

    this.io.to(`training:${jobId}`).emit('training_failed', message);
    this.io.to('training:*').emit('training_failed', message);
  }

  /**
   * Send recognition update
   */
  sendRecognitionUpdate(update: RecognitionUpdate): void {
    if (!this.io) return;

    const message = {
      type: 'recognition',
      event: 'recognition_update',
      data: update,
      timestamp: new Date().toISOString(),
    };

    this.io.to('recognition:*').emit('recognition_update', message);
  }

  /**
   * Notify feedback received
   */
  notifyFeedbackReceived(logId: string, isCorrect: boolean): void {
    if (!this.io) return;

    const message = {
      type: 'feedback',
      event: 'feedback_received',
      data: { logId, isCorrect },
      timestamp: new Date().toISOString(),
    };

    this.io.to('feedback:*').emit('feedback_received', message);
  }

  /**
   * Notify retraining triggered
   */
  notifyRetrainingTriggered(batchId: string, reason: string): void {
    if (!this.io) return;

    const message = {
      type: 'training',
      event: 'retraining_triggered',
      data: { batchId, reason },
      timestamp: new Date().toISOString(),
    };

    this.io.to('training:*').emit('retraining_triggered', message);
  }

  /**
   * Broadcast to all connected clients
   */
  broadcastAll(event: string, data: any): void {
    if (!this.io) return;
    this.io.emit(event, data);
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get Socket.IO server instance
   */
  getServer(): SocketIOServer | null {
    return this.io;
  }

  /**
   * Check if Socket.IO is initialized
   */
  isInitialized(): boolean {
    return this.io !== null;
  }

  /**
   * Close all connections
   */
  closeAll(): void {
    if (!this.io) return;

    for (const [clientId, client] of this.clients) {
      try {
        client.socket.disconnect(true);
      } catch (error) {
        logger.error('Error closing socket', { clientId });
      }
    }

    this.clients.clear();
    this.io.close();
    this.io = null;

    logger.info('Socket.IO server closed');
  }
}

// ============================================
// Singleton Instance
// ============================================

export const socketIOManager = new SocketIOManager();
export default socketIOManager;
