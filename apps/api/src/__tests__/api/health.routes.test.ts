/**
 * Health Routes Tests
 * Integration tests for health check endpoints
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { mlClient } from '../../services/ml-client';

const mockedMlClient = mlClient as vi.Mocked<typeof mlClient> & {
  healthCheck: ReturnType<typeof vi.fn>;
};

// Ensure healthCheck method exists on the mock
if (!mockedMlClient.healthCheck) {
  (mockedMlClient as any).healthCheck = vi.fn();
}

// Mock socket-io-manager
vi.mock('../../services/socket-io-manager', () => ({
  socketIOManager: {
    isInitialized: vi.fn(() => true),
    getClientCount: vi.fn(() => 3),
    notifyTrainingStarted: vi.fn(),
    sendTrainingUpdate: vi.fn(),
  },
}));

describe('Health Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });

    // Remove env vars that trigger DB/Redis checks in detailed health
    delete process.env.REDIS_URL;
    delete process.env.DATABASE_URL;

    const { healthRoutes } = await import('../../api/v1/health');
    await app.register(healthRoutes, { prefix: '/health' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  // ============================================
  // GET /health
  // ============================================

  describe('GET /health', () => {
    it('should return basic health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
    });

    it('should return a valid ISO timestamp', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.body);
      const timestamp = new Date(body.timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
    });
  });

  // ============================================
  // GET /health/ready
  // ============================================

  describe('GET /health/ready', () => {
    it('should return ready when ML service is healthy', async () => {
      mockedMlClient.isHealthy.mockResolvedValue(true);

      const response = await app.inject({
        method: 'GET',
        url: '/health/ready',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ready');
      expect(body.timestamp).toBeDefined();
    });

    it('should return 503 when ML service is unhealthy', async () => {
      mockedMlClient.isHealthy.mockResolvedValue(false);

      const response = await app.inject({
        method: 'GET',
        url: '/health/ready',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('not_ready');
      expect(body.reason).toContain('ML service');
    });

    it('should return 503 when ML service throws', async () => {
      mockedMlClient.isHealthy.mockRejectedValue(new Error('Connection refused'));

      const response = await app.inject({
        method: 'GET',
        url: '/health/ready',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('not_ready');
    });
  });

  // ============================================
  // GET /health/live
  // ============================================

  describe('GET /health/live', () => {
    it('should always return alive', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/live',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('alive');
      expect(body.timestamp).toBeDefined();
    });
  });

  // ============================================
  // GET /health/detailed
  // ============================================

  describe('GET /health/detailed', () => {
    it('should return healthy status when ML service is up', async () => {
      mockedMlClient.healthCheck.mockResolvedValue({
        status: 'healthy',
        models_loaded: 2,
        gpu_available: true,
        version: '1.0.0',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/health/detailed',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.timestamp).toBeDefined();
      expect(body.uptime).toBeGreaterThanOrEqual(0);
      expect(body.services['ml-service'].status).toBe('up');
      expect(body.services['ml-service'].latency_ms).toBeDefined();
      expect(body.services['ml-service'].details.models_loaded).toBe(2);
      expect(body.services['socket-io'].status).toBe('up');
    });

    it('should return unhealthy when ML service is down', async () => {
      mockedMlClient.healthCheck.mockRejectedValue(new Error('Connection refused'));

      const response = await app.inject({
        method: 'GET',
        url: '/health/detailed',
      });

      // With ML down and socket-io up, overall should be unhealthy (has 'down')
      const body = JSON.parse(response.body);
      expect(body.services['ml-service'].status).toBe('down');
      expect(body.services['ml-service'].details.error).toBe('Connection refused');
      // Status code is 503 when unhealthy
      expect(response.statusCode).toBe(503);
    });

    it('should include socket-io status', async () => {
      mockedMlClient.healthCheck.mockResolvedValue({
        status: 'healthy',
        models_loaded: 1,
        gpu_available: false,
        version: '1.0.0',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/health/detailed',
      });

      const body = JSON.parse(response.body);
      expect(body.services['socket-io']).toBeDefined();
      expect(body.services['socket-io'].status).toBe('up');
      expect(body.services['socket-io'].details.initialized).toBe(true);
      expect(body.services['socket-io'].details.connectedClients).toBe(3);
    });

    it('should include version and uptime', async () => {
      mockedMlClient.healthCheck.mockResolvedValue({
        status: 'healthy',
        models_loaded: 1,
        gpu_available: false,
        version: '1.0.0',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/health/detailed',
      });

      const body = JSON.parse(response.body);
      expect(body.version).toBeDefined();
      expect(typeof body.uptime).toBe('number');
      expect(body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should report degraded when ML service reports unhealthy status', async () => {
      mockedMlClient.healthCheck.mockResolvedValue({
        status: 'unhealthy',
        models_loaded: 0,
        gpu_available: false,
        version: '1.0.0',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/health/detailed',
      });

      const body = JSON.parse(response.body);
      // ML reports unhealthy => service status 'down' => overall 'unhealthy'
      expect(body.services['ml-service'].status).toBe('down');
    });
  });
});
