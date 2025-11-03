import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { setupOpenTelemetry } from './core/telemetry';
import { setupSentry } from './core/sentry';
import { setupPrometheus } from './core/prometheus';
import { errorHandler } from './middleware/errorHandler';
import { tracingMiddleware } from './middleware/tracing';
import { recognitionRoutes } from './api/v1/recognition';
import { healthRoutes } from './api/v1/health';
import { logger } from './core/logger';

// Setup telemetry before app initialization
setupOpenTelemetry();
setupSentry();

const app: FastifyInstance = Fastify({
  logger: true,
  requestIdHeader: 'x-request-id',
  genReqId: () => crypto.randomUUID(),
});

async function startServer() {
  try {
    // Security middleware
    await app.register(helmet);
    await app.register(cors, {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
    });

    // Rate limiting
    await app.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
    });

    // WebSocket support
    await app.register(websocket);

    // Prometheus metrics
    await setupPrometheus(app);

    // Custom middleware
    app.addHook('onRequest', tracingMiddleware);
    app.setErrorHandler(errorHandler);

    // API routes
    await app.register(recognitionRoutes, { prefix: '/api/v1' });
    await app.register(healthRoutes, { prefix: '/health' });

    // Start server
    const port = parseInt(process.env.PORT || '8000', 10);
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });
    logger.info(`Server running at http://${host}:${port}`);
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
