/**
 * Category Management API Routes
 * CRUD operations for logo categories
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { logger } from '../../core/logger';
import prisma from '../../core/db';

// Types
interface CreateCategoryBody {
  category: string;
  value: string;
  confidenceThreshold?: number;
  parentId?: string;
}

interface UpdateCategoryBody {
  category?: string;
  value?: string;
  confidenceThreshold?: number;
  isActive?: boolean;
}

interface ListCategoriesQuery {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}

export async function categoryRoutes(fastify: FastifyInstance) {
  // Apply auth middleware to all routes
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /categories
   * List all categories with optional filtering
   */
  fastify.get<{ Querystring: ListCategoriesQuery }>(
    '/categories',
    async (request: FastifyRequest<{ Querystring: ListCategoriesQuery }>, reply: FastifyReply) => {
      const {
        page = 1,
        limit = 50,
        search,
        isActive,
      } = request.query;

      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {};

      if (search) {
        where.OR = [
          { category: { contains: search, mode: 'insensitive' } },
          { value: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (isActive !== undefined) {
        where.isActive = isActive;
      }

      try {
        const [categories, total] = await Promise.all([
          prisma.logo.findMany({
            where,
            orderBy: [{ category: 'asc' }, { value: 'asc' }],
            skip,
            take: limit,
            include: {
              _count: {
                select: { annotations: true },
              },
            },
          }),
          prisma.logo.count({ where }),
        ]);

        // Group by category for tree view
        const groupedCategories = categories.reduce((acc, logo) => {
          if (!acc[logo.category]) {
            acc[logo.category] = [];
          }
          acc[logo.category].push({
            id: logo.id,
            value: logo.value,
            confidenceThreshold: logo.confidenceThreshold,
            trainingSamples: logo.trainingSamples,
            accuracy: logo.accuracy,
            isActive: logo.isActive,
            annotationCount: logo._count.annotations,
          });
          return acc;
        }, {} as Record<string, any[]>);

        return {
          success: true,
          data: {
            flat: categories,
            grouped: groupedCategories,
          },
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        };
      } catch (error) {
        logger.error('Failed to list categories', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to fetch categories',
        });
      }
    }
  );

  /**
   * POST /categories
   * Create a new category (logo definition)
   */
  fastify.post<{ Body: CreateCategoryBody }>(
    '/categories',
    {
      schema: {
        body: {
          type: 'object',
          required: ['category', 'value'],
          properties: {
            category: { type: 'string', minLength: 1, maxLength: 100 },
            value: { type: 'string', minLength: 1, maxLength: 100 },
            confidenceThreshold: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: CreateCategoryBody }>, reply: FastifyReply) => {
      const { category, value, confidenceThreshold = 0.99 } = request.body;

      try {
        // Check if already exists
        const existing = await prisma.logo.findFirst({
          where: { category, value },
        });

        if (existing) {
          return reply.status(409).send({
            success: false,
            error: 'Category with this value already exists',
          });
        }

        const logo = await prisma.logo.create({
          data: {
            category,
            value,
            confidenceThreshold,
          },
        });

        logger.info('Category created', {
          logoId: logo.id,
          category,
          value,
        });

        return reply.status(201).send({
          success: true,
          category: logo,
        });
      } catch (error) {
        logger.error('Failed to create category', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to create category',
        });
      }
    }
  );

  /**
   * GET /categories/:id
   * Get category details
   */
  fastify.get<{ Params: { id: string } }>(
    '/categories/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      try {
        const logo = await prisma.logo.findUnique({
          where: { id },
          include: {
            annotations: {
              take: 10,
              orderBy: { createdAt: 'desc' },
            },
            _count: {
              select: { annotations: true, embeddings: true },
            },
          },
        });

        if (!logo) {
          return reply.status(404).send({
            success: false,
            error: 'Category not found',
          });
        }

        return {
          success: true,
          category: {
            ...logo,
            annotationCount: logo._count.annotations,
            embeddingCount: logo._count.embeddings,
          },
        };
      } catch (error) {
        logger.error('Failed to get category', {
          error: error instanceof Error ? error.message : 'Unknown error',
          categoryId: id,
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to fetch category',
        });
      }
    }
  );

  /**
   * PATCH /categories/:id
   * Update a category
   */
  fastify.patch<{ Params: { id: string }; Body: UpdateCategoryBody }>(
    '/categories/:id',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            category: { type: 'string', minLength: 1, maxLength: 100 },
            value: { type: 'string', minLength: 1, maxLength: 100 },
            confidenceThreshold: { type: 'number', minimum: 0, maximum: 1 },
            isActive: { type: 'boolean' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string }; Body: UpdateCategoryBody }>, reply: FastifyReply) => {
      const { id } = request.params;
      const updates = request.body;

      try {
        const existing = await prisma.logo.findUnique({
          where: { id },
        });

        if (!existing) {
          return reply.status(404).send({
            success: false,
            error: 'Category not found',
          });
        }

        // Check for duplicate if updating category/value
        if (updates.category || updates.value) {
          const duplicate = await prisma.logo.findFirst({
            where: {
              category: updates.category || existing.category,
              value: updates.value || existing.value,
              NOT: { id },
            },
          });

          if (duplicate) {
            return reply.status(409).send({
              success: false,
              error: 'Category with this value already exists',
            });
          }
        }

        const updated = await prisma.logo.update({
          where: { id },
          data: updates,
        });

        logger.info('Category updated', { categoryId: id, updates });

        return {
          success: true,
          category: updated,
        };
      } catch (error) {
        logger.error('Failed to update category', {
          error: error instanceof Error ? error.message : 'Unknown error',
          categoryId: id,
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to update category',
        });
      }
    }
  );

  /**
   * DELETE /categories/:id
   * Delete a category (only if no annotations)
   */
  fastify.delete<{ Params: { id: string } }>(
    '/categories/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      try {
        const logo = await prisma.logo.findUnique({
          where: { id },
          include: {
            _count: {
              select: { annotations: true },
            },
          },
        });

        if (!logo) {
          return reply.status(404).send({
            success: false,
            error: 'Category not found',
          });
        }

        if (logo._count.annotations > 0) {
          return reply.status(400).send({
            success: false,
            error: `Cannot delete category with ${logo._count.annotations} annotations. Remove annotations first or deactivate the category.`,
          });
        }

        await prisma.logo.delete({
          where: { id },
        });

        logger.info('Category deleted', { categoryId: id });

        return {
          success: true,
          message: 'Category deleted successfully',
        };
      } catch (error) {
        logger.error('Failed to delete category', {
          error: error instanceof Error ? error.message : 'Unknown error',
          categoryId: id,
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to delete category',
        });
      }
    }
  );

  /**
   * POST /categories/merge
   * Merge two categories into one
   */
  fastify.post<{ Body: { sourceId: string; targetId: string } }>(
    '/categories/merge',
    {
      preHandler: [requireRole('ADMIN')],
      schema: {
        body: {
          type: 'object',
          required: ['sourceId', 'targetId'],
          properties: {
            sourceId: { type: 'string' },
            targetId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: { sourceId: string; targetId: string } }>, reply: FastifyReply) => {
      const { sourceId, targetId } = request.body;

      if (sourceId === targetId) {
        return reply.status(400).send({
          success: false,
          error: 'Cannot merge category with itself',
        });
      }

      try {
        const [source, target] = await Promise.all([
          prisma.logo.findUnique({ where: { id: sourceId } }),
          prisma.logo.findUnique({ where: { id: targetId } }),
        ]);

        if (!source || !target) {
          return reply.status(404).send({
            success: false,
            error: 'One or both categories not found',
          });
        }

        // Move all annotations from source to target
        await prisma.annotation.updateMany({
          where: { logoId: sourceId },
          data: { logoId: targetId },
        });

        // Update training samples count
        await prisma.logo.update({
          where: { id: targetId },
          data: {
            trainingSamples: {
              increment: source.trainingSamples,
            },
          },
        });

        // Delete source category
        await prisma.logo.delete({
          where: { id: sourceId },
        });

        logger.info('Categories merged', {
          sourceId,
          targetId,
          movedSamples: source.trainingSamples,
        });

        return {
          success: true,
          message: `Merged "${source.category}/${source.value}" into "${target.category}/${target.value}"`,
        };
      } catch (error) {
        logger.error('Failed to merge categories', {
          error: error instanceof Error ? error.message : 'Unknown error',
          sourceId,
          targetId,
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to merge categories',
        });
      }
    }
  );
}
