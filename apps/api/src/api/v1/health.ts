/**
 * Health Check Routes
 * Provides health status for the API Gateway and dependent services
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { mlClient } from '../../services/ml-client';
import { socketIOManager } from '../../services/socket-io-manager';
import { createLogger } from '../../core/logger';

const logger = createLogger('health');

// ============================================
// Types
// ============================================

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  services: {
    [key: string]: {
      status: 'up' | 'down' | 'unknown';
      latency_ms?: number;
      details?: Record<string, unknown>;
    };
  };
}

// ============================================
// Routes
// ============================================

export async function healthRoutes(fastify: FastifyInstance) {
  const startTime = Date.now();

  /**
   * GET /health
   * Basic health check - returns 200 if service is running
   */
  fastify.get(
    '/',
    {
      schema: {
        description: 'Basic health check',
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        status: 'ok',
        timestamp: new Date().toISOString(),
      });
    }
  );

  /**
   * GET /health/ready
   * Kubernetes readiness probe - checks if service can handle requests
   */
  fastify.get(
    '/ready',
    {
      schema: {
        description: 'Readiness probe for Kubernetes',
        tags: ['Health'],
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      // Check if essential services are available
      const mlHealthy = await mlClient.isHealthy().catch(() => false);

      if (!mlHealthy) {
        logger.warn('Readiness check failed: ML service not healthy');
        return reply.status(503).send({
          status: 'not_ready',
          reason: 'ML service not available',
        });
      }

      return reply.send({
        status: 'ready',
        timestamp: new Date().toISOString(),
      });
    }
  );

  /**
   * GET /health/live
   * Kubernetes liveness probe - checks if service is alive
   */
  fastify.get(
    '/live',
    {
      schema: {
        description: 'Liveness probe for Kubernetes',
        tags: ['Health'],
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        status: 'alive',
        timestamp: new Date().toISOString(),
      });
    }
  );

  /**
   * GET /health/detailed
   * Detailed health check with all service statuses
   */
  fastify.get(
    '/detailed',
    {
      schema: {
        description: 'Detailed health check with service statuses',
        tags: ['Health'],
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const services: HealthStatus['services'] = {};

      // Check ML Service
      try {
        const mlStart = Date.now();
        const mlHealth = await mlClient.healthCheck();
        services['ml-service'] = {
          status: mlHealth.status === 'healthy' ? 'up' : 'down',
          latency_ms: Date.now() - mlStart,
          details: {
            models_loaded: mlHealth.models_loaded,
            gpu_available: mlHealth.gpu_available,
            version: mlHealth.version,
          },
        };
      } catch (error) {
        services['ml-service'] = {
          status: 'down',
          details: {
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        };
      }

      // Check Redis (if configured)
      if (process.env.REDIS_URL) {
        try {
          const Redis = await import('ioredis').then(m => m.default).catch(() => null);
          if (Redis) {
            const redisStart = Date.now();
            const redis = new Redis(process.env.REDIS_URL, {
              connectTimeout: 5000,
              maxRetriesPerRequest: 1,
            });
            const pong = await Promise.race([
              redis.ping(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
            ]);
            await redis.quit();
            services['redis'] = {
              status: pong === 'PONG' ? 'up' : 'down',
              latency_ms: Date.now() - redisStart,
            };
          } else {
            services['redis'] = {
              status: 'unknown',
              details: { message: 'ioredis not installed' },
            };
          }
        } catch (error) {
          services['redis'] = {
            status: 'down',
            details: { error: error instanceof Error ? error.message : 'Connection failed' },
          };
        }
      }

      // Check PostgreSQL (if configured)
      if (process.env.DATABASE_URL) {
        try {
          const { PrismaClient } = await import('@prisma/client').catch(() => ({ PrismaClient: null }));
          if (PrismaClient) {
            const pgStart = Date.now();
            const prisma = new PrismaClient();
            const result = await Promise.race([
              prisma.$queryRaw`SELECT 1 as health`,
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
            ]);
            await prisma.$disconnect();
            services['postgresql'] = {
              status: 'up',
              latency_ms: Date.now() - pgStart,
              details: { connected: true },
            };
          } else {
            services['postgresql'] = {
              status: 'unknown',
              details: { message: 'Prisma client not available' },
            };
          }
        } catch (error) {
          services['postgresql'] = {
            status: 'down',
            details: { error: error instanceof Error ? error.message : 'Connection failed' },
          };
        }
      }

      // Check Socket.IO
      services['socket-io'] = {
        status: socketIOManager.isInitialized() ? 'up' : 'down',
        details: {
          initialized: socketIOManager.isInitialized(),
          connectedClients: socketIOManager.getClientCount(),
        },
      };

      // Determine overall status
      const serviceStatuses = Object.values(services).map((s) => s.status);
      let overallStatus: HealthStatus['status'] = 'healthy';

      if (serviceStatuses.includes('down')) {
        overallStatus = 'unhealthy';
      } else if (serviceStatuses.includes('unknown')) {
        overallStatus = 'degraded';
      }

      const healthStatus: HealthStatus = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        services,
      };

      const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

      return reply.status(statusCode).send(healthStatus);
    }
  );
}

export default healthRoutes;
