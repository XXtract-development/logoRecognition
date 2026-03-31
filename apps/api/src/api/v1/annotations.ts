/**
 * Annotation API Routes
 * Handles image annotation for training data creation
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { mlClient, MLServiceError } from '../../services/ml-client';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { createLogger } from '../../core/logger';
import prisma from '../../core/db';

const logger = createLogger('annotations');

// ============================================
// Types
// ============================================

interface CreateAnnotationBody {
  imageId: string;
  batchId?: string;
  logoId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  category?: string;
  value?: string;
  confidence?: number;
}

interface UpdateAnnotationBody {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  category?: string;
  value?: string;
  logoId?: string;
  confidence?: number;
}

interface BulkAnnotationBody {
  imageId: string;
  annotations: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    category?: string;
    value?: string;
    logoId?: string;
  }>;
  batchId?: string;
}

interface SmartClickBody {
  imageId: string;
  clickX: number;
  clickY: number;
  image?: string; // base64 for ML processing
}

interface ListAnnotationsQuery {
  imageId?: string;
  batchId?: string;
  page?: number;
  limit?: number;
}

interface AnnotationReviewBody {
  approved: boolean;
  corrections?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    category?: string;
    value?: string;
    logoId?: string;
  };
  reviewNotes?: string;
}

// ============================================
// Routes
// ============================================

export async function annotationRoutes(fastify: FastifyInstance) {
  // Apply auth middleware to all routes
  fastify.addHook('preHandler', authMiddleware);

  /**
   * POST /api/v1/annotations
   * Create a single annotation
   */
  fastify.post<{ Body: CreateAnnotationBody }>(
    '/annotations',
    {
      schema: {
        description: 'Create an annotation on an image',
        tags: ['Annotations'],
        body: {
          type: 'object',
          required: ['imageId', 'x', 'y', 'width', 'height'],
          properties: {
            imageId: { type: 'string' },
            batchId: { type: 'string' },
            logoId: { type: 'string' },
            x: { type: 'number', minimum: 0 },
            y: { type: 'number', minimum: 0 },
            width: { type: 'number', minimum: 1 },
            height: { type: 'number', minimum: 1 },
            category: { type: 'string' },
            value: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: CreateAnnotationBody }>, reply: FastifyReply) => {
      const userId = request.user!.userId;
      const { imageId, batchId, logoId, x, y, width, height, category, value, confidence } = request.body;

      try {
        // Verify image exists
        const image = await prisma.logoImage.findUnique({
          where: { id: imageId },
        });

        if (!image) {
          return reply.status(404).send({
            success: false,
            error: 'Image not found',
          });
        }

        // Create annotation
        const annotation = await prisma.annotation.create({
          data: {
            imageId,
            batchId,
            logoId,
            x,
            y,
            width,
            height,
            category,
            value,
            confidence,
            createdBy: userId,
          },
          include: {
            logo: true,
          },
        });

        // Update logo training samples count if logoId provided
        if (logoId) {
          await prisma.logo.update({
            where: { id: logoId },
            data: {
              trainingSamples: { increment: 1 },
            },
          });
        }

        logger.info('Annotation created', {
          annotationId: annotation.id,
          imageId,
          userId,
        });

        return reply.status(201).send({
          success: true,
          annotation,
        });
      } catch (error) {
        logger.error('Failed to create annotation', {
          error: error instanceof Error ? error.message : 'Unknown error',
          imageId,
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to create annotation',
        });
      }
    }
  );

  /**
   * POST /api/v1/annotations/bulk
   * Create multiple annotations for an image
   */
  fastify.post<{ Body: BulkAnnotationBody }>(
    '/annotations/bulk',
    {
      schema: {
        description: 'Create multiple annotations on an image',
        tags: ['Annotations'],
        body: {
          type: 'object',
          required: ['imageId', 'annotations'],
          properties: {
            imageId: { type: 'string' },
            batchId: { type: 'string' },
            annotations: {
              type: 'array',
              items: {
                type: 'object',
                required: ['x', 'y', 'width', 'height'],
                properties: {
                  x: { type: 'number', minimum: 0 },
                  y: { type: 'number', minimum: 0 },
                  width: { type: 'number', minimum: 1 },
                  height: { type: 'number', minimum: 1 },
                  category: { type: 'string' },
                  value: { type: 'string' },
                  logoId: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: BulkAnnotationBody }>, reply: FastifyReply) => {
      const userId = request.user!.userId;
      const { imageId, annotations, batchId } = request.body;

      try {
        // Verify image exists
        const image = await prisma.logoImage.findUnique({
          where: { id: imageId },
        });

        if (!image) {
          return reply.status(404).send({
            success: false,
            error: 'Image not found',
          });
        }

        // Create all annotations
        const createdAnnotations = await prisma.$transaction(
          annotations.map((ann) =>
            prisma.annotation.create({
              data: {
                imageId,
                batchId,
                x: ann.x,
                y: ann.y,
                width: ann.width,
                height: ann.height,
                category: ann.category,
                value: ann.value,
                logoId: ann.logoId,
                createdBy: userId,
              },
            })
          )
        );

        // Update training samples for logos
        const logoIds = annotations.filter((a) => a.logoId).map((a) => a.logoId!);
        const uniqueLogoIds = [...new Set(logoIds)];

        for (const logoId of uniqueLogoIds) {
          const count = logoIds.filter((id) => id === logoId).length;
          await prisma.logo.update({
            where: { id: logoId },
            data: { trainingSamples: { increment: count } },
          });
        }

        logger.info('Bulk annotations created', {
          imageId,
          count: createdAnnotations.length,
          userId,
        });

        return reply.status(201).send({
          success: true,
          count: createdAnnotations.length,
          annotations: createdAnnotations,
        });
      } catch (error) {
        logger.error('Failed to create bulk annotations', {
          error: error instanceof Error ? error.message : 'Unknown error',
          imageId,
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to create annotations',
        });
      }
    }
  );

  /**
   * GET /api/v1/annotations
   * List annotations with filtering
   */
  fastify.get<{ Querystring: ListAnnotationsQuery }>(
    '/annotations',
    {
      schema: {
        description: 'List annotations with optional filtering',
        tags: ['Annotations'],
        querystring: {
          type: 'object',
          properties: {
            imageId: { type: 'string' },
            batchId: { type: 'string' },
            page: { type: 'number', default: 1 },
            limit: { type: 'number', default: 50 },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: ListAnnotationsQuery }>, reply: FastifyReply) => {
      const { imageId, batchId, page = 1, limit = 50 } = request.query;
      const skip = (page - 1) * limit;

      const where: any = {};
      if (imageId) where.imageId = imageId;
      if (batchId) where.batchId = batchId;

      try {
        const [annotations, total] = await Promise.all([
          prisma.annotation.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
            include: {
              logo: true,
              user: {
                select: { id: true, email: true },
              },
            },
          }),
          prisma.annotation.count({ where }),
        ]);

        return {
          success: true,
          data: annotations,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        };
      } catch (error) {
        logger.error('Failed to list annotations', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to fetch annotations',
        });
      }
    }
  );

  /**
   * GET /api/v1/annotations/:id
   * Get single annotation
   */
  fastify.get<{ Params: { id: string } }>(
    '/annotations/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      try {
        const annotation = await prisma.annotation.findUnique({
          where: { id },
          include: {
            logo: true,
            image: true,
            user: {
              select: { id: true, email: true },
            },
          },
        });

        if (!annotation) {
          return reply.status(404).send({
            success: false,
            error: 'Annotation not found',
          });
        }

        return {
          success: true,
          annotation,
        };
      } catch (error) {
        logger.error('Failed to get annotation', {
          error: error instanceof Error ? error.message : 'Unknown error',
          annotationId: id,
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to fetch annotation',
        });
      }
    }
  );

  /**
   * PATCH /api/v1/annotations/:id
   * Update an annotation
   */
  fastify.patch<{ Params: { id: string }; Body: UpdateAnnotationBody }>(
    '/annotations/:id',
    {
      schema: {
        description: 'Update an annotation',
        tags: ['Annotations'],
        body: {
          type: 'object',
          properties: {
            x: { type: 'number', minimum: 0 },
            y: { type: 'number', minimum: 0 },
            width: { type: 'number', minimum: 1 },
            height: { type: 'number', minimum: 1 },
            category: { type: 'string' },
            value: { type: 'string' },
            logoId: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string }; Body: UpdateAnnotationBody }>, reply: FastifyReply) => {
      const { id } = request.params;
      const updates = request.body;

      try {
        const existing = await prisma.annotation.findUnique({
          where: { id },
        });

        if (!existing) {
          return reply.status(404).send({
            success: false,
            error: 'Annotation not found',
          });
        }

        const updated = await prisma.annotation.update({
          where: { id },
          data: updates,
          include: {
            logo: true,
          },
        });

        // Handle logo training sample count updates
        if (updates.logoId && updates.logoId !== existing.logoId) {
          // Decrement old logo
          if (existing.logoId) {
            await prisma.logo.update({
              where: { id: existing.logoId },
              data: { trainingSamples: { decrement: 1 } },
            });
          }
          // Increment new logo
          await prisma.logo.update({
            where: { id: updates.logoId },
            data: { trainingSamples: { increment: 1 } },
          });
        }

        logger.info('Annotation updated', { annotationId: id, updates });

        return {
          success: true,
          annotation: updated,
        };
      } catch (error) {
        logger.error('Failed to update annotation', {
          error: error instanceof Error ? error.message : 'Unknown error',
          annotationId: id,
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to update annotation',
        });
      }
    }
  );

  /**
   * DELETE /api/v1/annotations/:id
   * Delete an annotation
   */
  fastify.delete<{ Params: { id: string } }>(
    '/annotations/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      try {
        const annotation = await prisma.annotation.findUnique({
          where: { id },
        });

        if (!annotation) {
          return reply.status(404).send({
            success: false,
            error: 'Annotation not found',
          });
        }

        await prisma.annotation.delete({
          where: { id },
        });

        // Decrement logo training samples
        if (annotation.logoId) {
          await prisma.logo.update({
            where: { id: annotation.logoId },
            data: { trainingSamples: { decrement: 1 } },
          });
        }

        logger.info('Annotation deleted', { annotationId: id });

        return {
          success: true,
          message: 'Annotation deleted',
        };
      } catch (error) {
        logger.error('Failed to delete annotation', {
          error: error instanceof Error ? error.message : 'Unknown error',
          annotationId: id,
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to delete annotation',
        });
      }
    }
  );

  /**
   * POST /api/v1/annotations/smart-click
   * Smart click detection - uses ML to detect logo at click position
   */
  fastify.post<{ Body: SmartClickBody }>(
    '/annotations/smart-click',
    {
      schema: {
        description: 'Detect logo at click position using ML',
        tags: ['Annotations'],
        body: {
          type: 'object',
          required: ['imageId', 'clickX', 'clickY'],
          properties: {
            imageId: { type: 'string' },
            clickX: { type: 'number', minimum: 0 },
            clickY: { type: 'number', minimum: 0 },
            image: { type: 'string', description: 'Base64 encoded image for detection' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: SmartClickBody }>, reply: FastifyReply) => {
      const { imageId, clickX, clickY, image } = request.body;

      try {
        // Verify image exists
        const logoImage = await prisma.logoImage.findUnique({
          where: { id: imageId },
        });

        if (!logoImage) {
          return reply.status(404).send({
            success: false,
            error: 'Image not found',
          });
        }

        if (!image) {
          return reply.status(400).send({
            success: false,
            error: 'Base64 image data required for smart detection',
          });
        }

        // Call ML service for detection
        const detectionResult = await mlClient.detectLogos({
          image,
          confidence_threshold: 0.5, // Lower threshold for smart click
          return_embeddings: false,
        });

        // Find detection closest to click point
        let closestDetection = null;
        let minDistance = Infinity;

        for (const detection of detectionResult.detections) {
          const centerX = detection.bbox.x + detection.bbox.width / 2;
          const centerY = detection.bbox.y + detection.bbox.height / 2;
          const distance = Math.sqrt(
            Math.pow(centerX - clickX, 2) + Math.pow(centerY - clickY, 2)
          );

          // Check if click is within bbox
          const isWithinBbox =
            clickX >= detection.bbox.x &&
            clickX <= detection.bbox.x + detection.bbox.width &&
            clickY >= detection.bbox.y &&
            clickY <= detection.bbox.y + detection.bbox.height;

          if (isWithinBbox || distance < minDistance) {
            minDistance = distance;
            closestDetection = detection;
          }
        }

        if (!closestDetection) {
          // No detection found, suggest a default bounding box around click
          return {
            success: true,
            detected: false,
            suggestion: {
              x: Math.max(0, clickX - 50),
              y: Math.max(0, clickY - 50),
              width: 100,
              height: 100,
              confidence: 0,
              message: 'No logo detected. Default bounding box suggested.',
            },
          };
        }

        // Find matching logo in database
        const matchingLogo = await prisma.logo.findFirst({
          where: {
            category: closestDetection.category,
            value: closestDetection.value,
          },
        });

        return {
          success: true,
          detected: true,
          detection: {
            x: closestDetection.bbox.x,
            y: closestDetection.bbox.y,
            width: closestDetection.bbox.width,
            height: closestDetection.bbox.height,
            category: closestDetection.category,
            value: closestDetection.value,
            confidence: closestDetection.confidence,
            logoId: matchingLogo?.id,
          },
          processingTimeMs: detectionResult.processing_time_ms,
        };
      } catch (error) {
        if (error instanceof MLServiceError) {
          logger.warn('ML service error in smart click', {
            error: error.message,
            imageId,
          });

          // Return fallback suggestion
          return {
            success: true,
            detected: false,
            suggestion: {
              x: Math.max(0, clickX - 50),
              y: Math.max(0, clickY - 50),
              width: 100,
              height: 100,
              confidence: 0,
              message: 'ML service unavailable. Default bounding box suggested.',
            },
          };
        }

        logger.error('Smart click detection failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          imageId,
        });

        return reply.status(500).send({
          success: false,
          error: 'Smart click detection failed',
        });
      }
    }
  );

  /**
   * POST /api/v1/annotations/:id/review
   * Review and validate an annotation
   */
  fastify.post<{ Params: { id: string }; Body: AnnotationReviewBody }>(
    '/annotations/:id/review',
    {
      preHandler: [requireRole('ADMIN')],
      schema: {
        description: 'Review and validate an annotation',
        tags: ['Annotations'],
        body: {
          type: 'object',
          required: ['approved'],
          properties: {
            approved: { type: 'boolean' },
            corrections: {
              type: 'object',
              properties: {
                x: { type: 'number' },
                y: { type: 'number' },
                width: { type: 'number' },
                height: { type: 'number' },
                category: { type: 'string' },
                value: { type: 'string' },
                logoId: { type: 'string' },
              },
            },
            reviewNotes: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string }; Body: AnnotationReviewBody }>, reply: FastifyReply) => {
      const { id } = request.params;
      const { approved, corrections } = request.body;
      const reviewerId = request.user!.userId;

      try {
        const annotation = await prisma.annotation.findUnique({
          where: { id },
        });

        if (!annotation) {
          return reply.status(404).send({
            success: false,
            error: 'Annotation not found',
          });
        }

        // Apply corrections if provided
        if (corrections && Object.keys(corrections).length > 0) {
          await prisma.annotation.update({
            where: { id },
            data: corrections,
          });
        }

        // If approved, update associated training data
        if (approved && annotation.imageId) {
          await prisma.trainingData.updateMany({
            where: { imageId: annotation.imageId },
            data: {
              validated: true,
              validationDate: new Date(),
              validatedBy: reviewerId,
            },
          });
        }

        logger.info('Annotation reviewed', {
          annotationId: id,
          approved,
          reviewerId,
          hasCorrestions: !!corrections,
        });

        const updated = await prisma.annotation.findUnique({
          where: { id },
          include: { logo: true },
        });

        return {
          success: true,
          approved,
          annotation: updated,
        };
      } catch (error) {
        logger.error('Failed to review annotation', {
          error: error instanceof Error ? error.message : 'Unknown error',
          annotationId: id,
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to review annotation',
        });
      }
    }
  );

  /**
   * GET /api/v1/annotations/image/:imageId/canvas
   * Get image with all annotations for canvas rendering
   */
  fastify.get<{ Params: { imageId: string } }>(
    '/annotations/image/:imageId/canvas',
    {
      schema: {
        description: 'Get image annotations for canvas rendering',
        tags: ['Annotations'],
      },
    },
    async (request: FastifyRequest<{ Params: { imageId: string } }>, reply: FastifyReply) => {
      const { imageId } = request.params;

      try {
        const image = await prisma.logoImage.findUnique({
          where: { id: imageId },
          include: {
            annotations: {
              include: {
                logo: true,
                user: {
                  select: { id: true, email: true },
                },
              },
            },
          },
        });

        if (!image) {
          return reply.status(404).send({
            success: false,
            error: 'Image not found',
          });
        }

        // Get available logos for annotation selection
        const logos = await prisma.logo.findMany({
          where: { isActive: true },
          orderBy: [{ category: 'asc' }, { value: 'asc' }],
        });

        return {
          success: true,
          image: {
            id: image.id,
            filename: image.filename,
            storagePath: image.storagePath,
            metadata: image.metadata,
          },
          annotations: image.annotations.map((ann) => ({
            id: ann.id,
            x: ann.x,
            y: ann.y,
            width: ann.width,
            height: ann.height,
            category: ann.category || ann.logo?.category,
            value: ann.value || ann.logo?.value,
            logoId: ann.logoId,
            confidence: ann.confidence,
            createdBy: ann.user,
            createdAt: ann.createdAt,
          })),
          availableLogos: logos,
        };
      } catch (error) {
        logger.error('Failed to get canvas data', {
          error: error instanceof Error ? error.message : 'Unknown error',
          imageId,
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to fetch canvas data',
        });
      }
    }
  );

  /**
   * Keyboard shortcuts configuration endpoint
   * Returns default shortcuts for frontend
   */
  fastify.get(
    '/annotations/shortcuts',
    {
      schema: {
        description: 'Get keyboard shortcuts configuration',
        tags: ['Annotations'],
      },
    },
    async () => {
      return {
        success: true,
        shortcuts: {
          // Navigation
          nextImage: { key: 'ArrowRight', description: 'Go to next image' },
          prevImage: { key: 'ArrowLeft', description: 'Go to previous image' },

          // Annotation tools
          drawBox: { key: 'b', description: 'Start drawing bounding box' },
          smartClick: { key: 's', description: 'Enable smart click detection' },
          deleteSelected: { key: 'Delete', description: 'Delete selected annotation' },

          // Actions
          save: { key: 'ctrl+s', description: 'Save annotations' },
          undo: { key: 'ctrl+z', description: 'Undo last action' },
          redo: { key: 'ctrl+shift+z', description: 'Redo last action' },

          // Selection
          selectAll: { key: 'ctrl+a', description: 'Select all annotations' },
          deselect: { key: 'Escape', description: 'Deselect all' },

          // Zoom
          zoomIn: { key: '+', description: 'Zoom in' },
          zoomOut: { key: '-', description: 'Zoom out' },
          zoomFit: { key: '0', description: 'Fit to screen' },

          // Quick category assignment (1-9)
          quickAssign: {
            keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
            description: 'Quick assign logo category',
          },
        },
      };
    }
  );
}

export default annotationRoutes;
