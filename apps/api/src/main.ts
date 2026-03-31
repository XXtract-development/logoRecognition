/**
 * Logo Recognition API Gateway
 * Main entry point for the Fastify server
 */

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import path from 'path';

import { errorHandler } from './middleware/errorHandler';
import { tracingMiddleware, responseLogger } from './middleware/tracing';
import { recognitionRoutes } from './api/v1/recognition';
import { healthRoutes } from './api/v1/health';
import { trainingRoutes } from './api/v1/training';
import { authRoutes } from './api/v1/auth';
import { imageRoutes } from './api/v1/images';
import { categoryRoutes } from './api/v1/categories';
import { annotationRoutes } from './api/v1/annotations';
import { feedbackRoutes } from './api/v1/feedback';
import { statsRoutes } from './api/v1/stats';
import { logger } from './core/logger';
import { wsManager } from './services/websocket-manager';
import { socketIOManager } from './services/socket-io-manager';

// Create Fastify instance
const app: FastifyInstance = Fastify({
  logger: false, // We use our own logger
  requestIdHeader: 'x-request-id',
  genReqId: () => crypto.randomUUID(),
  trustProxy: true,
});

async function startServer() {
  try {
    // ==========================================
    // Security Middleware
    // ==========================================

    // Helmet for security headers
    await app.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          scriptSrc: ["'self'"],
        },
      },
    });

    // CORS configuration
    await app.register(cors, {
      origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    });

    // Rate limiting
    await app.register(rateLimit, {
      max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
      timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),
      errorResponseBuilder: () => ({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please slow down',
        },
      }),
    });

    // ==========================================
    // Request Processing
    // ==========================================

    // Cookie support for authentication
    await app.register(cookie, {
      secret: process.env.COOKIE_SECRET || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('COOKIE_SECRET is required in production'); })() : 'cookie-secret-change-in-production'),
      parseOptions: {},
    });

    // Multipart/form-data support for file uploads
    await app.register(multipart, {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 10,
      },
    });

    // WebSocket support
    await app.register(websocket);

    // ==========================================
    // Hooks
    // ==========================================

    // Request tracing
    app.addHook('onRequest', tracingMiddleware);
    app.addHook('onResponse', responseLogger);

    // Error handler
    app.setErrorHandler(errorHandler);

    // ==========================================
    // API Routes
    // ==========================================

    // Health check routes
    await app.register(healthRoutes, { prefix: '/health' });

    // API v1 routes
    await app.register(authRoutes, { prefix: '/api/v1' });
    await app.register(imageRoutes, { prefix: '/api/v1' });
    await app.register(categoryRoutes, { prefix: '/api/v1' });
    await app.register(recognitionRoutes, { prefix: '/api/v1' });
    await app.register(trainingRoutes, { prefix: '/api/v1' });
    await app.register(annotationRoutes, { prefix: '/api/v1' });
    await app.register(feedbackRoutes, { prefix: '/api/v1' });
    await app.register(statsRoutes, { prefix: '/api/v1' });

    // ==========================================
    // Static Files (Monolith: serve frontend build)
    // ==========================================
    const publicDir = path.join(__dirname, '..', 'public');
    await app.register(fastifyStatic, {
      root: publicDir,
      prefix: '/',
      wildcard: false,
      decorateReply: false,
    });

    // SPA fallback: serve index.html for non-API routes
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/health')) {
        reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
      } else {
        reply.sendFile('index.html', publicDir);
      }
    });

    // ==========================================
    // WebSocket Routes
    // ==========================================

    app.register(async function (fastify) {
      fastify.get('/api/v1/ws', { websocket: true }, (connection, req) => {
        const clientId = req.id;
        const socket = connection.socket;
        logger.info('WebSocket connection established', { clientId });

        // Register with WebSocket manager
        wsManager.registerClient(clientId, socket);

        socket.on('message', (message: Buffer) => {
          try {
            const data = JSON.parse(message.toString());
            logger.debug('WebSocket message received', { type: data.type, clientId });

            // Handle different message types
            switch (data.type) {
              case 'subscribe':
                // Generic subscription
                if (data.topic) {
                  wsManager.subscribe(clientId, data.topic);
                }
                break;

              case 'unsubscribe':
                if (data.topic) {
                  wsManager.unsubscribe(clientId, data.topic);
                }
                break;

              case 'subscribe_training':
                // Subscribe to specific training job updates
                if (data.job_id) {
                  wsManager.subscribe(clientId, `training:${data.job_id}`);
                }
                // Also subscribe to all training updates
                wsManager.subscribe(clientId, 'training:*');
                socket.send(
                  JSON.stringify({
                    type: 'subscribed',
                    topic: data.job_id ? `training:${data.job_id}` : 'training:*',
                  })
                );
                break;

              case 'subscribe_recognition':
                wsManager.subscribe(clientId, 'recognition:*');
                socket.send(
                  JSON.stringify({
                    type: 'subscribed',
                    topic: 'recognition:*',
                  })
                );
                break;

              case 'subscribe_feedback':
                wsManager.subscribe(clientId, 'feedback:*');
                socket.send(
                  JSON.stringify({
                    type: 'subscribed',
                    topic: 'feedback:*',
                  })
                );
                break;

              case 'ping':
                wsManager.handlePing(clientId);
                break;

              default:
                socket.send(
                  JSON.stringify({
                    type: 'error',
                    message: 'Unknown message type',
                  })
                );
            }
          } catch (error) {
            logger.error('WebSocket message parse error', {
              error: error instanceof Error ? error.message : 'Unknown error',
              clientId,
            });
            socket.send(
              JSON.stringify({
                type: 'error',
                message: 'Invalid message format',
              })
            );
          }
        });

        socket.on('close', () => {
          wsManager.unregisterClient(clientId);
          logger.info('WebSocket connection closed', { clientId });
        });

        socket.on('error', (error) => {
          logger.error('WebSocket error', {
            clientId,
            error: error.message,
          });
          wsManager.unregisterClient(clientId);
        });
      });
    });

    // ==========================================
    // Root Route
    // ==========================================

    app.get('/', async () => ({
      service: 'Logo Recognition API Gateway',
      version: process.env.npm_package_version || '1.0.0',
      docs: '/docs',
      health: '/health',
    }));

    // ==========================================
    // Start Server
    // ==========================================

    const port = parseInt(process.env.PORT || '8000', 10);
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });

    // Initialize Socket.IO with the HTTP server
    const httpServer = app.server;
    socketIOManager.initialize(httpServer);

    logger.info(`API Gateway started`, {
      host,
      port,
      nodeEnv: process.env.NODE_ENV || 'development',
      socketIO: true,
    });

    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 Logo Recognition API Gateway                        ║
║                                                           ║
║   Server:     http://${host}:${port}                      ║
║   Health:     http://${host}:${port}/health               ║
║   API:        http://${host}:${port}/api/v1               ║
║   WebSocket:  ws://${host}:${port}/api/v1/ws              ║
║   Socket.IO:  ws://${host}:${port}/socket.io              ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
  } catch (err) {
    logger.error('Failed to start server', {
      error: err instanceof Error ? err.message : 'Unknown error',
      stack: err instanceof Error ? err.stack : undefined,
    });
    process.exit(1);
  }
}

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    // Close Socket.IO connections
    socketIOManager.closeAll();
    logger.info('Socket.IO connections closed');

    // Close WebSocket connections
    wsManager.closeAll();
    logger.info('WebSocket connections closed');

    await app.close();
    logger.info('Server closed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the server
startServer();
