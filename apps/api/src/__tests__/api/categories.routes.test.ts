/**
 * Category Routes Tests
 * Integration tests for category management endpoints
 */

import { describe, it, expect, beforeEach, afterEach,vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { PrismaClient } from '@prisma/client';
import { mockCategory, mockUser, mockAdminUser } from '../helpers/mock-data';
import { generateTestToken } from '../helpers/fastify-test';

const mockPrisma = new PrismaClient() as vi.Mocked<PrismaClient>;

describe('Category Routes', () => {
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

    const { categoryRoutes } = await import('../../api/v1/categories');
    await app.register(categoryRoutes, { prefix: '/api/v1' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe('GET /categories', () => {
    it('should list categories with pagination', async () => {
      const categories = [
        { ...mockCategory, _count: { annotations: 10 } },
        { ...mockCategory, id: 'cat-2', value: 'Audi', _count: { annotations: 5 } },
      ];

      (mockPrisma.logo.findMany as vi.Mock).mockResolvedValue(categories);
      (mockPrisma.logo.count as vi.Mock).mockResolvedValue(2);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/training/categories?page=1&limit=50',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.flat).toHaveLength(2);
      expect(body.data.grouped).toBeDefined();
      expect(body.pagination.total).toBe(2);
    });

    it('should search categories by name', async () => {
      (mockPrisma.logo.findMany as vi.Mock).mockResolvedValue([
        { ...mockCategory, _count: { annotations: 10 } },
      ]);
      (mockPrisma.logo.count as vi.Mock).mockResolvedValue(1);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/training/categories?search=BMW',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.flat).toHaveLength(1);
    });

    it('should filter by active status', async () => {
      (mockPrisma.logo.findMany as vi.Mock).mockResolvedValue([]);
      (mockPrisma.logo.count as vi.Mock).mockResolvedValue(0);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/training/categories?isActive=true',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /categories', () => {
    it('should create a new category', async () => {
      (mockPrisma.logo.findFirst as vi.Mock).mockResolvedValue(null);
      (mockPrisma.logo.create as vi.Mock).mockResolvedValue(mockCategory);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/training/categories',
        payload: {
          category: 'Automotive',
          value: 'BMW',
          confidenceThreshold: 0.99,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.category.category).toBe('Automotive');
    });

    it('should return 409 for duplicate category', async () => {
      (mockPrisma.logo.findFirst as vi.Mock).mockResolvedValue(mockCategory);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/training/categories',
        payload: {
          category: 'Automotive',
          value: 'BMW',
        },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('already exists');
    });

    it('should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/training/categories',
        payload: {
          category: 'Automotive',
          // missing value
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /categories/:id', () => {
    it('should return category details', async () => {
      (mockPrisma.logo.findUnique as vi.Mock).mockResolvedValue({
        ...mockCategory,
        annotations: [],
        _count: { annotations: 10, embeddings: 5 },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/training/categories/${mockCategory.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.category.id).toBe(mockCategory.id);
      expect(body.category.annotationCount).toBe(10);
    });

    it('should return 404 for non-existent category', async () => {
      (mockPrisma.logo.findUnique as vi.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/training/categories/non-existent-id',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /categories/:id', () => {
    it('should update category', async () => {
      (mockPrisma.logo.findUnique as vi.Mock).mockResolvedValue(mockCategory);
      (mockPrisma.logo.findFirst as vi.Mock).mockResolvedValue(null);
      (mockPrisma.logo.update as vi.Mock).mockResolvedValue({
        ...mockCategory,
        confidenceThreshold: 0.95,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/training/categories/${mockCategory.id}`,
        payload: {
          confidenceThreshold: 0.95,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.category.confidenceThreshold).toBe(0.95);
    });

    it('should return 404 for non-existent category', async () => {
      (mockPrisma.logo.findUnique as vi.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/training/categories/non-existent-id',
        payload: {
          isActive: false,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should prevent duplicate when updating', async () => {
      (mockPrisma.logo.findUnique as vi.Mock).mockResolvedValue(mockCategory);
      (mockPrisma.logo.findFirst as vi.Mock).mockResolvedValue({
        ...mockCategory,
        id: 'other-id',
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/training/categories/${mockCategory.id}`,
        payload: {
          value: 'ExistingValue',
        },
      });

      expect(response.statusCode).toBe(409);
    });
  });

  describe('DELETE /categories/:id', () => {
    it('should delete category without annotations', async () => {
      (mockPrisma.logo.findUnique as vi.Mock).mockResolvedValue({
        ...mockCategory,
        _count: { annotations: 0 },
      });
      (mockPrisma.logo.delete as vi.Mock).mockResolvedValue(mockCategory);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/training/categories/${mockCategory.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should return 400 when category has annotations', async () => {
      (mockPrisma.logo.findUnique as vi.Mock).mockResolvedValue({
        ...mockCategory,
        _count: { annotations: 10 },
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/training/categories/${mockCategory.id}`,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('annotations');
    });

    it('should return 404 for non-existent category', async () => {
      (mockPrisma.logo.findUnique as vi.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/training/categories/non-existent-id',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /categories/merge', () => {
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

      const { categoryRoutes } = await import('../../api/v1/categories');
      await adminApp.register(categoryRoutes, { prefix: '/api/v1' });
      await adminApp.ready();
    });

    afterEach(async () => {
      await adminApp.close();
    });

    it('should merge two categories', async () => {
      const source = { ...mockCategory, id: 'source-id', trainingSamples: 50 };
      const target = { ...mockCategory, id: 'target-id', trainingSamples: 100 };

      (mockPrisma.logo.findUnique as vi.Mock)
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(target);
      (mockPrisma.annotation.updateMany as vi.Mock).mockResolvedValue({ count: 50 });
      (mockPrisma.logo.update as vi.Mock).mockResolvedValue(target);
      (mockPrisma.logo.delete as vi.Mock).mockResolvedValue(source);

      const response = await adminApp.inject({
        method: 'POST',
        url: '/api/v1/training/categories/merge',
        payload: {
          sourceId: 'source-id',
          targetId: 'target-id',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('Merged');
    });

    it('should return 400 when merging same category', async () => {
      const response = await adminApp.inject({
        method: 'POST',
        url: '/api/v1/training/categories/merge',
        payload: {
          sourceId: 'same-id',
          targetId: 'same-id',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('itself');
    });

    it('should return 404 when category not found', async () => {
      (mockPrisma.logo.findUnique as vi.Mock).mockResolvedValue(null);

      const response = await adminApp.inject({
        method: 'POST',
        url: '/api/v1/training/categories/merge',
        payload: {
          sourceId: 'source-id',
          targetId: 'non-existent',
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
