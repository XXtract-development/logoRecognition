/**
 * Annotation Routes Tests
 * Integration tests for annotation endpoints
 */

import { describe, it, expect, beforeEach, afterEach,vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { PrismaClient } from '@prisma/client';
import { mlClient, MLServiceError } from '../../services/ml-client';
import {
  mockUser,
  mockAdminUser,
  mockImage,
  mockAnnotation,
  mockCategory,
  mockDetectionResult,
} from '../helpers/mock-data';
import { generateTestToken, createBase64TestImage } from '../helpers/fastify-test';

const mockPrisma = new PrismaClient() as vi.Mocked<PrismaClient>;
const mockedMlClient = mlClient as vi.Mocked<typeof mlClient>;

describe('Annotation Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(cookie, { secret: 'test-secret' });

    // Mock auth middleware
    app.addHook('preHandler', async (request) => {
      (request as any).user = {
        userId: mockUser.id,
        email: mockUser.email,
        role: 'USER',
      };
    });

    const { annotationRoutes } = await import('../../api/v1/annotations');
    await app.register(annotationRoutes, { prefix: '/api/v1' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe('POST /annotations', () => {
    it('should create a single annotation', async () => {
      (mockPrisma.logoImage.findUnique as vi.Mock).mockResolvedValue(mockImage);
      (mockPrisma.annotation.create as vi.Mock).mockResolvedValue({
        ...mockAnnotation,
        logo: mockCategory,
      });
      (mockPrisma.logo.update as vi.Mock).mockResolvedValue(mockCategory);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/annotations',
        payload: {
          imageId: mockImage.id,
          x: 100,
          y: 100,
          width: 200,
          height: 200,
          logoId: mockCategory.id,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.annotation.id).toBe(mockAnnotation.id);
    });

    it('should return 404 for non-existent image', async () => {
      (mockPrisma.logoImage.findUnique as vi.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/annotations',
        payload: {
          imageId: 'non-existent',
          x: 100,
          y: 100,
          width: 200,
          height: 200,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/annotations',
        payload: {
          imageId: mockImage.id,
          // missing x, y, width, height
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate minimum dimensions', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/annotations',
        payload: {
          imageId: mockImage.id,
          x: 0,
          y: 0,
          width: 0, // must be at least 1
          height: 0,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /annotations/bulk', () => {
    it('should create multiple annotations', async () => {
      (mockPrisma.logoImage.findUnique as vi.Mock).mockResolvedValue(mockImage);
      (mockPrisma.annotation.createMany as vi.Mock).mockResolvedValue({ count: 2 });
      (mockPrisma.annotation.findMany as vi.Mock).mockResolvedValue([
        mockAnnotation,
        { ...mockAnnotation, id: 'ann-2' },
      ]);
      (mockPrisma.logo.update as vi.Mock).mockResolvedValue(mockCategory);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/annotations/bulk',
        payload: {
          imageId: mockImage.id,
          annotations: [
            { x: 100, y: 100, width: 200, height: 200, logoId: mockCategory.id },
            { x: 400, y: 150, width: 150, height: 150, logoId: mockCategory.id },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.count).toBe(2);
    });

    it('should return 404 for non-existent image', async () => {
      (mockPrisma.logoImage.findUnique as vi.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/annotations/bulk',
        payload: {
          imageId: 'non-existent',
          annotations: [{ x: 100, y: 100, width: 200, height: 200 }],
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /annotations', () => {
    it('should list annotations with pagination', async () => {
      const annotations = [
        { ...mockAnnotation, logo: mockCategory, user: { id: mockUser.id, email: mockUser.email } },
        { ...mockAnnotation, id: 'ann-2', logo: mockCategory, user: { id: mockUser.id, email: mockUser.email } },
      ];

      (mockPrisma.annotation.findMany as vi.Mock).mockResolvedValue(annotations);
      (mockPrisma.annotation.count as vi.Mock).mockResolvedValue(2);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/annotations?page=1&limit=50',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.pagination.total).toBe(2);
    });

    it('should filter by imageId', async () => {
      (mockPrisma.annotation.findMany as vi.Mock).mockResolvedValue([]);
      (mockPrisma.annotation.count as vi.Mock).mockResolvedValue(0);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/annotations?imageId=${mockImage.id}`,
      });

      expect(response.statusCode).toBe(200);
      expect(mockPrisma.annotation.findMany).toHaveBeenCalled();
    });
  });

  describe('GET /annotations/:id', () => {
    it('should return annotation details', async () => {
      (mockPrisma.annotation.findUnique as vi.Mock).mockResolvedValue({
        ...mockAnnotation,
        logo: mockCategory,
        image: mockImage,
        user: { id: mockUser.id, email: mockUser.email },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/annotations/${mockAnnotation.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.annotation.id).toBe(mockAnnotation.id);
    });

    it('should return 404 for non-existent annotation', async () => {
      (mockPrisma.annotation.findUnique as vi.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/annotations/non-existent',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /annotations/:id', () => {
    it('should update annotation', async () => {
      (mockPrisma.annotation.findUnique as vi.Mock).mockResolvedValue(mockAnnotation);
      (mockPrisma.annotation.update as vi.Mock).mockResolvedValue({
        ...mockAnnotation,
        width: 250,
        logo: mockCategory,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/annotations/${mockAnnotation.id}`,
        payload: {
          width: 250,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.annotation.width).toBe(250);
    });

    it('should return 404 for non-existent annotation', async () => {
      (mockPrisma.annotation.findUnique as vi.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/annotations/non-existent',
        payload: { width: 250 },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should update logo training samples when changing logoId', async () => {
      (mockPrisma.annotation.findUnique as vi.Mock).mockResolvedValue({
        ...mockAnnotation,
        logoId: 'old-logo-id',
      });
      (mockPrisma.annotation.update as vi.Mock).mockResolvedValue(mockAnnotation);
      (mockPrisma.logo.update as vi.Mock).mockResolvedValue(mockCategory);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/annotations/${mockAnnotation.id}`,
        payload: {
          logoId: 'new-logo-id',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockPrisma.logo.update).toHaveBeenCalledTimes(2); // decrement old, increment new
    });
  });

  describe('DELETE /annotations/:id', () => {
    it('should delete annotation', async () => {
      (mockPrisma.annotation.findUnique as vi.Mock).mockResolvedValue(mockAnnotation);
      (mockPrisma.annotation.delete as vi.Mock).mockResolvedValue(mockAnnotation);
      (mockPrisma.logo.update as vi.Mock).mockResolvedValue(mockCategory);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/annotations/${mockAnnotation.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should return 404 for non-existent annotation', async () => {
      (mockPrisma.annotation.findUnique as vi.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/annotations/non-existent',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /annotations/smart-click', () => {
    it('should detect logo at click position', async () => {
      (mockPrisma.logoImage.findUnique as vi.Mock).mockResolvedValue(mockImage);
      mockedMlClient.detectLogos.mockResolvedValue(mockDetectionResult);
      (mockPrisma.logo.findFirst as vi.Mock).mockResolvedValue(mockCategory);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/annotations/smart-click',
        payload: {
          imageId: mockImage.id,
          clickX: 150,
          clickY: 150,
          image: createBase64TestImage(),
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.detected).toBe(true);
      expect(body.detection).toBeDefined();
    });

    it('should return suggestion when no logo detected', async () => {
      (mockPrisma.logoImage.findUnique as vi.Mock).mockResolvedValue(mockImage);
      mockedMlClient.detectLogos.mockResolvedValue({
        ...mockDetectionResult,
        detections: [],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/annotations/smart-click',
        payload: {
          imageId: mockImage.id,
          clickX: 150,
          clickY: 150,
          image: createBase64TestImage(),
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.detected).toBe(false);
      expect(body.suggestion).toBeDefined();
    });

    it('should return 400 when image data missing', async () => {
      (mockPrisma.logoImage.findUnique as vi.Mock).mockResolvedValue(mockImage);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/annotations/smart-click',
        payload: {
          imageId: mockImage.id,
          clickX: 150,
          clickY: 150,
          // missing image
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle ML service errors gracefully', async () => {
      (mockPrisma.logoImage.findUnique as vi.Mock).mockResolvedValue(mockImage);
      mockedMlClient.detectLogos.mockRejectedValue(
        new MLServiceError('Service unavailable', 503)
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/annotations/smart-click',
        payload: {
          imageId: mockImage.id,
          clickX: 150,
          clickY: 150,
          image: createBase64TestImage(),
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.detected).toBe(false);
      expect(body.suggestion).toBeDefined();
    });
  });

  describe('GET /annotations/image/:imageId/canvas', () => {
    it('should return canvas data with annotations', async () => {
      (mockPrisma.logoImage.findUnique as vi.Mock).mockResolvedValue({
        ...mockImage,
        annotations: [
          {
            ...mockAnnotation,
            logo: mockCategory,
            user: { id: mockUser.id, email: mockUser.email },
          },
        ],
      });
      (mockPrisma.logo.findMany as vi.Mock).mockResolvedValue([mockCategory]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/annotations/image/${mockImage.id}/canvas`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.image).toBeDefined();
      expect(body.annotations).toHaveLength(1);
      expect(body.availableLogos).toHaveLength(1);
    });

    it('should return 404 for non-existent image', async () => {
      (mockPrisma.logoImage.findUnique as vi.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/annotations/image/non-existent/canvas',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /annotations/shortcuts', () => {
    it('should return keyboard shortcuts', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/annotations/shortcuts',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.shortcuts).toBeDefined();
      expect(body.shortcuts.drawBox).toBeDefined();
      expect(body.shortcuts.smartClick).toBeDefined();
    });
  });

  describe('POST /annotations/:id/review (Admin only)', () => {
    let adminApp: FastifyInstance;

    beforeEach(async () => {
      adminApp = Fastify({ logger: false });
      await adminApp.register(cookie, { secret: 'test-secret' });

      // Mock ADMIN auth
      adminApp.addHook('preHandler', async (request) => {
        (request as any).user = {
          userId: mockAdminUser.id,
          email: mockAdminUser.email,
          role: 'ADMIN',
        };
      });

      const { annotationRoutes } = await import('../../api/v1/annotations');
      await adminApp.register(annotationRoutes, { prefix: '/api/v1' });
      await adminApp.ready();
    });

    afterEach(async () => {
      await adminApp.close();
    });

    it('should approve annotation', async () => {
      (mockPrisma.annotation.findUnique as vi.Mock)
        .mockResolvedValueOnce(mockAnnotation)
        .mockResolvedValueOnce({ ...mockAnnotation, logo: mockCategory });
      (mockPrisma.trainingData.updateMany as vi.Mock).mockResolvedValue({ count: 1 });

      const response = await adminApp.inject({
        method: 'POST',
        url: `/api/v1/annotations/${mockAnnotation.id}/review`,
        payload: {
          approved: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.approved).toBe(true);
    });

    it('should apply corrections when reviewing', async () => {
      (mockPrisma.annotation.findUnique as vi.Mock)
        .mockResolvedValueOnce(mockAnnotation)
        .mockResolvedValueOnce({ ...mockAnnotation, logo: mockCategory });
      (mockPrisma.annotation.update as vi.Mock).mockResolvedValue(mockAnnotation);

      const response = await adminApp.inject({
        method: 'POST',
        url: `/api/v1/annotations/${mockAnnotation.id}/review`,
        payload: {
          approved: true,
          corrections: {
            width: 220,
            height: 220,
          },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockPrisma.annotation.update).toHaveBeenCalled();
    });

    it('should return 404 for non-existent annotation', async () => {
      (mockPrisma.annotation.findUnique as vi.Mock).mockResolvedValue(null);

      const response = await adminApp.inject({
        method: 'POST',
        url: '/api/v1/annotations/non-existent/review',
        payload: {
          approved: true,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
