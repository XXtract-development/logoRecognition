/**
 * Recognition Routes Tests
 * Integration tests for logo recognition endpoints
 */

import { describe, it, expect, beforeEach, afterEach,vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { PrismaClient } from '@prisma/client';
import { mlClient, MLServiceError } from '../../services/ml-client';
import {
  mockUser,
  mockDetectionResult,
  mockRecognitionLog,
} from '../helpers/mock-data';
import { createBase64TestImage, generateTestToken } from '../helpers/fastify-test';

const mockPrisma = new PrismaClient() as vi.Mocked<PrismaClient>;
const mockedMlClient = mlClient as vi.Mocked<typeof mlClient>;

describe('Recognition Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(cookie, { secret: 'test-secret' });
    await app.register(multipart, {
      limits: { fileSize: 10 * 1024 * 1024 },
    });

    // Mock optional auth
    app.addHook('preHandler', async (request) => {
      (request as any).user = {
        userId: mockUser.id,
        email: mockUser.email,
        role: 'USER',
      };
    });

    const { recognitionRoutes } = await import('../../api/v1/recognition');
    await app.register(recognitionRoutes, { prefix: '/api/v1' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe('POST /recognize', () => {
    it('should recognize logos in image', async () => {
      mockedMlClient.isHealthy.mockResolvedValue(true);
      mockedMlClient.detectLogos.mockResolvedValue(mockDetectionResult);
      (mockPrisma.recognitionLog.create as vi.Mock).mockResolvedValue(mockRecognitionLog);
      (mockPrisma.recognitionResult.createMany as vi.Mock).mockResolvedValue({ count: 2 });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/recognize',
        payload: {
          image: createBase64TestImage(),
          confidence_threshold: 0.99,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.request_id).toBe(mockDetectionResult.request_id);
      expect(body.detections).toHaveLength(2);
      expect(body.detections[0].category).toBe('Automotive');
    });

    it('should handle ML service errors', async () => {
      mockedMlClient.isHealthy.mockResolvedValue(true);
      mockedMlClient.detectLogos.mockRejectedValue(
        new MLServiceError('Model not loaded', 503, 'Model initialization failed')
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/recognize',
        payload: {
          image: createBase64TestImage(),
        },
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('ML Service Error');
    });

    it('should work when ML service is unhealthy but responds', async () => {
      mockedMlClient.isHealthy.mockResolvedValue(false);
      mockedMlClient.detectLogos.mockResolvedValue(mockDetectionResult);
      (mockPrisma.recognitionLog.create as vi.Mock).mockResolvedValue(mockRecognitionLog);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/recognize',
        payload: {
          image: createBase64TestImage(),
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should validate required image field', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/recognize',
        payload: {
          confidence_threshold: 0.99,
          // missing image
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /recognize/batch', () => {
    it('should process multiple images', async () => {
      mockedMlClient.detectLogos.mockResolvedValue(mockDetectionResult);
      (mockPrisma.recognitionLog.create as vi.Mock).mockResolvedValue(mockRecognitionLog);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/recognize/batch',
        payload: {
          images: [
            { id: 'img-1', image: createBase64TestImage() },
            { id: 'img-2', image: createBase64TestImage() },
          ],
          confidence_threshold: 0.99,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.summary.total).toBe(2);
      expect(body.summary.successful).toBe(2);
      expect(body.results).toHaveLength(2);
    });

    it('should return 400 for empty images array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/recognize/batch',
        payload: {
          images: [],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('No images');
    });

    it('should return 400 for too many images', async () => {
      const images = Array(21).fill(null).map((_, i) => ({
        id: `img-${i}`,
        image: createBase64TestImage(),
      }));

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/recognize/batch',
        payload: {
          images,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('more than 20');
    });

    it('should handle partial failures', async () => {
      mockedMlClient.detectLogos
        .mockResolvedValueOnce(mockDetectionResult)
        .mockRejectedValueOnce(new Error('Processing failed'));
      (mockPrisma.recognitionLog.create as vi.Mock).mockResolvedValue(mockRecognitionLog);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/recognize/batch',
        payload: {
          images: [
            { id: 'img-1', image: createBase64TestImage() },
            { id: 'img-2', image: createBase64TestImage() },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.summary.successful).toBe(1);
      expect(body.summary.failed).toBe(1);
    });
  });

  describe('POST /embed', () => {
    it('should generate embedding for image', async () => {
      const mockEmbedding = {
        embedding: new Array(512).fill(0.1),
        model_version: '1.0.0',
      };
      mockedMlClient.generateEmbedding.mockResolvedValue(mockEmbedding);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/embed',
        payload: {
          image: createBase64TestImage(),
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.embedding).toBeDefined();
      expect(body.embedding).toHaveLength(512);
    });

    it('should handle embedding errors', async () => {
      mockedMlClient.generateEmbedding.mockRejectedValue(
        new MLServiceError('Embedding failed', 500)
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/embed',
        payload: {
          image: createBase64TestImage(),
        },
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('GET /recognize/history', () => {
    let authApp: FastifyInstance;

    beforeEach(async () => {
      authApp = Fastify({ logger: false });
      await authApp.register(cookie, { secret: 'test-secret' });

      // Mock authenticated user
      authApp.addHook('preHandler', async (request) => {
        (request as any).user = {
          userId: mockUser.id,
          email: mockUser.email,
          role: 'USER',
        };
      });

      const { recognitionRoutes } = await import('../../api/v1/recognition');
      await authApp.register(recognitionRoutes, { prefix: '/api/v1' });
      await authApp.ready();
    });

    afterEach(async () => {
      await authApp.close();
    });

    it('should return recognition history', async () => {
      const logs = [
        { ...mockRecognitionLog, results: [] },
        { ...mockRecognitionLog, id: 'log-2', results: [] },
      ];

      (mockPrisma.recognitionLog.findMany as vi.Mock).mockResolvedValue(logs);
      (mockPrisma.recognitionLog.count as vi.Mock).mockResolvedValue(2);

      const response = await authApp.inject({
        method: 'GET',
        url: '/api/v1/recognize/history?page=1&limit=20',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.pagination.total).toBe(2);
    });

    it('should filter by date range', async () => {
      (mockPrisma.recognitionLog.findMany as vi.Mock).mockResolvedValue([]);
      (mockPrisma.recognitionLog.count as vi.Mock).mockResolvedValue(0);

      const response = await authApp.inject({
        method: 'GET',
        url: '/api/v1/recognize/history?startDate=2024-01-01&endDate=2024-12-31',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /recognize/:requestId', () => {
    it('should return specific recognition result', async () => {
      (mockPrisma.recognitionLog.findFirst as vi.Mock).mockResolvedValue({
        ...mockRecognitionLog,
        results: mockDetectionResult.detections.map((det, i) => ({
          id: `result-${i}`,
          logId: mockRecognitionLog.id,
          ...det,
        })),
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/recognize/${mockRecognitionLog.requestId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.requestId).toBe(mockRecognitionLog.requestId);
    });

    it('should return 404 for non-existent result', async () => {
      (mockPrisma.recognitionLog.findFirst as vi.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/recognize/non-existent-id',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
