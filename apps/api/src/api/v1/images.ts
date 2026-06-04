/**
 * Image Upload and Management API Routes
 * Handles single/batch upload, library view, and image operations
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  uploadImage,
  getSignedUrl,
  deleteImage,
  validateImage,
  generateThumbnail,
  BUCKETS,
} from '../../services/storage';
import { authMiddleware, optionalAuth } from '../../middleware/auth';

import { logger } from '../../core/logger';
import prisma from '../../core/db';

// Types
interface UploadQuerystring {
  categoryId?: string;
}

interface ListQuerystring {
  page?: number;
  limit?: number;
  status?: 'all' | 'none' | 'partial' | 'complete';
  categoryId?: string;
  sortBy?: 'date' | 'name' | 'status';
  sortOrder?: 'asc' | 'desc';
}

interface BulkActionBody {
  imageIds: string[];
  action: 'assign' | 'delete' | 'export';
  categoryId?: string;
}

export async function imageRoutes(fastify: FastifyInstance) {
  // Apply optional auth to all routes (user info available if logged in)
  fastify.addHook('preHandler', optionalAuth);

  /**
   * POST /training/upload
   * Upload a single image for training
   */
  fastify.post<{ Querystring: UploadQuerystring }>(
    '/training/upload',
    { preHandler: [authMiddleware] },
    async (request: FastifyRequest<{ Querystring: UploadQuerystring }>, reply: FastifyReply) => {
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({
          success: false,
          error: 'No file uploaded',
        });
      }

      const buffer = await data.toBuffer();
      const userId = request.user!.userId;
      const categoryId = request.query.categoryId;

      // Upload to storage
      const result = await uploadImage(
        buffer,
        data.mimetype,
        data.filename,
        userId,
        'TRAINING'
      );

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error,
        });
      }

      // Create database record
      try {
        const image = await prisma.logoImage.create({
          data: {
            filename: data.filename,
            storagePath: result.storagePath!,
            metadata: {
              ...result.metadata,
              thumbnailPath: result.thumbnailPath,
              categoryId,
            },
          },
        });

        logger.info('Image record created', { imageId: image.id, userId });

        // Generate signed URLs
        const signedUrl = await getSignedUrl(result.storagePath!);
        const thumbnailUrl = result.thumbnailPath
          ? await getSignedUrl(result.thumbnailPath)
          : null;

        return reply.status(201).send({
          success: true,
          image: {
            id: image.id,
            filename: image.filename,
            storagePath: image.storagePath,
            metadata: result.metadata,
            signedUrl,
            thumbnailUrl,
            createdAt: image.createdAt,
          },
        });
      } catch (error) {
        // Cleanup storage on database error
        await deleteImage(result.storagePath!);
        if (result.thumbnailPath) {
          await deleteImage(result.thumbnailPath);
        }

        logger.error('Failed to create image record', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to save image record',
        });
      }
    }
  );

  /**
   * POST /training/upload/batch
   * Upload multiple images at once
   */
  fastify.post<{ Querystring: UploadQuerystring }>(
    '/training/upload/batch',
    { preHandler: [authMiddleware] },
    async (request: FastifyRequest<{ Querystring: UploadQuerystring }>, reply: FastifyReply) => {
      const parts = request.files();
      const userId = request.user!.userId;
      const categoryId = request.query.categoryId;

      const results: Array<{
        filename: string;
        success: boolean;
        imageId?: string;
        error?: string;
      }> = [];

      let fileCount = 0;
      const maxFiles = 50;

      for await (const part of parts) {
        if (fileCount >= maxFiles) {
          results.push({
            filename: part.filename,
            success: false,
            error: `Maximum ${maxFiles} files per batch`,
          });
          continue;
        }

        fileCount++;
        const buffer = await part.toBuffer();

        // Upload to storage
        const uploadResult = await uploadImage(
          buffer,
          part.mimetype,
          part.filename,
          userId,
          'TRAINING'
        );

        if (!uploadResult.success) {
          results.push({
            filename: part.filename,
            success: false,
            error: uploadResult.error,
          });
          continue;
        }

        // Create database record
        try {
          const image = await prisma.logoImage.create({
            data: {
              filename: part.filename,
              storagePath: uploadResult.storagePath!,
              metadata: {
                ...uploadResult.metadata,
                thumbnailPath: uploadResult.thumbnailPath,
                categoryId,
              },
            },
          });

          results.push({
            filename: part.filename,
            success: true,
            imageId: image.id,
          });
        } catch (error) {
          await deleteImage(uploadResult.storagePath!);
          results.push({
            filename: part.filename,
            success: false,
            error: 'Database error',
          });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failedCount = results.filter((r) => !r.success).length;

      logger.info('Batch upload completed', {
        userId,
        total: results.length,
        success: successCount,
        failed: failedCount,
      });

      return {
        success: true,
        summary: {
          total: results.length,
          successful: successCount,
          failed: failedCount,
        },
        results,
      };
    }
  );

  /**
   * GET /training/images
   * List images in library with pagination and filtering
   */
  fastify.get<{ Querystring: ListQuerystring }>(
    '/training/images',
    async (request: FastifyRequest<{ Querystring: ListQuerystring }>, reply: FastifyReply) => {
      const {
        page = 1,
        limit = 20,
        status,
        categoryId,
        sortBy = 'date',
        sortOrder = 'desc',
      } = request.query;

      const skip = (page - 1) * limit;

      // Build where clause.
      //
      // Exclude artwork-source LogoImage records (Epic 8, Story 8.6). These are
      // synthetic markers created during training-data registration purely to
      // satisfy the NOT NULL imageId FK; they are not real library images and
      // would otherwise leak into the Image Library as "ghost cards"
      // (NaN MB / Invalid Date) and inflate Total Images. The same `where`
      // object is shared by findMany AND count below, so the exclusion covers
      // both the listing (a) and the total-count stat (b).
      //
      // An AND array is used because a JSON-path categoryId filter and the
      // artworkSource exclusion both target `metadata` and cannot be merged into
      // a single `where.metadata` object.
      const andClauses: any[] = [
        { metadata: { path: ['artworkSource'], not: true } },
      ];

      if (categoryId) {
        andClauses.push({
          metadata: { path: ['categoryId'], equals: categoryId },
        });
      }

      const where: any = { AND: andClauses };

      // Build order clause
      const orderBy: any = {};
      if (sortBy === 'date') {
        orderBy.createdAt = sortOrder;
      } else if (sortBy === 'name') {
        orderBy.filename = sortOrder;
      }

      try {
        const [images, total] = await Promise.all([
          prisma.logoImage.findMany({
            where,
            orderBy,
            skip,
            take: limit,
            select: {
              id: true,
              filename: true,
              storagePath: true,
              metadata: true,
              brandName: true,
              createdAt: true,
              _count: {
                select: { annotations: true },
              },
            },
          }),
          prisma.logoImage.count({ where }),
        ]);

        // Generate signed URLs for thumbnails
        const imagesWithUrls = await Promise.all(
          images.map(async (image) => {
            const metadata = image.metadata as any;
            const thumbnailPath = metadata?.thumbnailPath;
            const thumbnailUrl = thumbnailPath
              ? await getSignedUrl(thumbnailPath)
              : null;

            return {
              ...image,
              thumbnailUrl,
              annotationStatus:
                image._count.annotations === 0
                  ? 'none'
                  : 'partial', // Simplified status
            };
          })
        );

        return {
          success: true,
          data: imagesWithUrls,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasMore: skip + images.length < total,
          },
        };
      } catch (error) {
        logger.error('Failed to list images', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to fetch images',
        });
      }
    }
  );

  /**
   * GET /training/images/:id
   * Get single image details
   */
  fastify.get<{ Params: { id: string } }>(
    '/training/images/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      try {
        const image = await prisma.logoImage.findUnique({
          where: { id },
          include: {
            annotations: true,
            trainingData: true,
          },
        });

        if (!image) {
          return reply.status(404).send({
            success: false,
            error: 'Image not found',
          });
        }

        // Generate signed URLs
        const signedUrl = await getSignedUrl(image.storagePath);
        const metadata = image.metadata as any;
        const thumbnailUrl = metadata?.thumbnailPath
          ? await getSignedUrl(metadata.thumbnailPath)
          : null;

        return {
          success: true,
          image: {
            ...image,
            signedUrl,
            thumbnailUrl,
          },
        };
      } catch (error) {
        logger.error('Failed to get image', {
          error: error instanceof Error ? error.message : 'Unknown error',
          imageId: id,
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to fetch image',
        });
      }
    }
  );

  /**
   * DELETE /training/images/:id
   * Delete a single image
   */
  fastify.delete<{ Params: { id: string } }>(
    '/training/images/:id',
    { preHandler: [authMiddleware] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      try {
        const image = await prisma.logoImage.findUnique({
          where: { id },
        });

        if (!image) {
          return reply.status(404).send({
            success: false,
            error: 'Image not found',
          });
        }

        // Delete from storage
        await deleteImage(image.storagePath);
        const metadata = image.metadata as any;
        if (metadata?.thumbnailPath) {
          await deleteImage(metadata.thumbnailPath);
        }

        // Delete from database
        await prisma.logoImage.delete({
          where: { id },
        });

        logger.info('Image deleted', { imageId: id });

        return {
          success: true,
          message: 'Image deleted successfully',
        };
      } catch (error) {
        logger.error('Failed to delete image', {
          error: error instanceof Error ? error.message : 'Unknown error',
          imageId: id,
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to delete image',
        });
      }
    }
  );

  /**
   * PATCH /training/images/bulk
   * Bulk operations on images
   */
  fastify.patch<{ Body: BulkActionBody }>(
    '/training/images/bulk',
    {
      preHandler: [authMiddleware],
      schema: {
        body: {
          type: 'object',
          required: ['imageIds', 'action'],
          properties: {
            imageIds: { type: 'array', items: { type: 'string' }, maxItems: 100 },
            action: { type: 'string', enum: ['assign', 'delete', 'export'] },
            categoryId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: BulkActionBody }>, reply: FastifyReply) => {
      const { imageIds, action, categoryId } = request.body;

      if (imageIds.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'No images selected',
        });
      }

      if (imageIds.length > 100) {
        return reply.status(400).send({
          success: false,
          error: 'Maximum 100 images per bulk operation',
        });
      }

      try {
        switch (action) {
          case 'assign': {
            if (!categoryId) {
              return reply.status(400).send({
                success: false,
                error: 'Category ID required for assign action',
              });
            }

            // Update metadata with category
            await prisma.$transaction(
              imageIds.map((id) =>
                prisma.logoImage.update({
                  where: { id },
                  data: {
                    metadata: {
                      // Merge with existing metadata
                      categoryId,
                    },
                  },
                })
              )
            );

            logger.info('Bulk assign completed', {
              imageCount: imageIds.length,
              categoryId,
            });

            return {
              success: true,
              message: `${imageIds.length} images assigned to category`,
            };
          }

          case 'delete': {
            // Get images for storage cleanup
            const images = await prisma.logoImage.findMany({
              where: { id: { in: imageIds } },
            });

            // Delete from storage
            for (const image of images) {
              await deleteImage(image.storagePath);
              const metadata = image.metadata as any;
              if (metadata?.thumbnailPath) {
                await deleteImage(metadata.thumbnailPath);
              }
            }

            // Delete from database
            await prisma.logoImage.deleteMany({
              where: { id: { in: imageIds } },
            });

            logger.info('Bulk delete completed', { imageCount: images.length });

            return {
              success: true,
              message: `${images.length} images deleted`,
            };
          }

          case 'export': {
            // Return signed URLs for export
            const images = await prisma.logoImage.findMany({
              where: { id: { in: imageIds } },
            });

            const urls = await Promise.all(
              images.map(async (image) => ({
                id: image.id,
                filename: image.filename,
                url: await getSignedUrl(image.storagePath, 86400), // 24h expiry
              }))
            );

            return {
              success: true,
              exportUrls: urls,
              expiresIn: 86400,
            };
          }

          default:
            return reply.status(400).send({
              success: false,
              error: 'Invalid action',
            });
        }
      } catch (error) {
        logger.error('Bulk operation failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          action,
          imageCount: imageIds.length,
        });

        return reply.status(500).send({
          success: false,
          error: 'Bulk operation failed',
        });
      }
    }
  );
}
