/**
 * Recognition API Routes
 * Handles logo detection and recognition requests
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { mlClient, MLServiceError, DetectionResponse } from '../../services/ml-client';
import { createLogger } from '../../core/logger';
import { authMiddleware, optionalAuth, apiKeyAuth } from '../../middleware/auth';
import prisma from '../../core/db';
import crypto from 'crypto';

const logger = createLogger('recognition');

// ============================================
// Types
// ============================================

interface RecognizeBody {
  image: string; // base64
  confidence_threshold?: number;
  return_embeddings?: boolean;
}

interface RecognizeQuery {
  confidence_threshold?: number;
}

interface BatchRecognizeBody {
  images: Array<{
    id: string;
    image: string; // base64
  }>;
  confidence_threshold?: number;
}

interface RecognitionHistoryQuery {
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
}

// Helper to log recognition results
async function logRecognitionResult(
  requestId: string,
  imageHash: string,
  result: DetectionResponse,
  userId?: string
): Promise<void> {
  try {
    const log = await prisma.recognitionLog.create({
      data: {
        requestId,
        imageHash,
        userId,
        processingTimeMs: result.processing_time_ms,
        detectionCount: result.detections.length,
        confidenceThreshold: 0.99,
      },
    });

    // Create detection results
    if (result.detections.length > 0) {
      await prisma.recognitionResult.createMany({
        data: result.detections.map((det) => ({
          logId: log.id,
          category: det.category,
          value: det.value,
          confidence: det.confidence,
          x: det.bbox.x,
          y: det.bbox.y,
          width: det.bbox.width,
          height: det.bbox.height,
        })),
      });
    }
  } catch (error) {
    logger.warn('Failed to log recognition result', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// ============================================
// Routes
// ============================================

export async function recognitionRoutes(fastify: FastifyInstance) {
  // Optional auth for logging user context
  fastify.addHook('preHandler', authMiddleware);
  /**
   * POST /api/v1/recognize
   * Recognize logos in a base64 encoded image
   */
  fastify.post<{ Body: RecognizeBody }>(
    '/recognize',
    {
      schema: {
        description: 'Detect and recognize logos in an image',
        tags: ['Recognition'],
        body: {
          type: 'object',
          required: ['image'],
          properties: {
            image: {
              type: 'string',
              description: 'Base64 encoded image',
            },
            confidence_threshold: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              default: 0.99,
            },
            return_embeddings: {
              type: 'boolean',
              default: false,
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              request_id: { type: 'string' },
              detections: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    category: { type: 'string' },
                    value: { type: 'string' },
                    confidence: { type: 'number' },
                    bbox: {
                      type: 'object',
                      properties: {
                        x: { type: 'number' },
                        y: { type: 'number' },
                        width: { type: 'number' },
                        height: { type: 'number' },
                      },
                    },
                  },
                },
              },
              processing_time_ms: { type: 'number' },
              model_version: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: RecognizeBody }>, reply: FastifyReply) => {
      const { image, confidence_threshold = 0.99, return_embeddings = false } = request.body;

      logger.info('Recognition request received', {
        requestId: request.id,
        imageSize: image.length,
        confidenceThreshold: confidence_threshold,
      });

      try {
        // Check ML service health
        const isHealthy = await mlClient.isHealthy();
        if (!isHealthy) {
          logger.warn('ML service not healthy, attempting request anyway');
        }

        // Call ML service
        const result = await mlClient.detectLogos({
          image,
          confidence_threshold,
          return_embeddings,
        });

        logger.info('Recognition completed', {
          requestId: request.id,
          detectionCount: result.detections.length,
          processingTime: result.processing_time_ms,
        });

        // Log result to database
        const imageHash = crypto.createHash('md5').update(image).digest('hex');
        await logRecognitionResult(
          result.request_id,
          imageHash,
          result,
          request.user?.userId
        );

        return reply.send(result);
      } catch (error) {
        if (error instanceof MLServiceError) {
          logger.error('ML service error', {
            requestId: request.id,
            statusCode: error.statusCode,
            detail: error.detail,
          });

          return reply.status(error.statusCode).send({
            error: 'ML Service Error',
            message: error.message,
            statusCode: error.statusCode,
          });
        }

        logger.error('Recognition failed', {
          requestId: request.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Recognition failed',
        });
      }
    }
  );

  /**
   * POST /api/v1/recognize/upload
   * Recognize logos in an uploaded image file
   */
  fastify.post<{ Querystring: RecognizeQuery }>(
    '/recognize/upload',
    {
      schema: {
        description: 'Detect logos in an uploaded image file',
        tags: ['Recognition'],
        consumes: ['multipart/form-data'],
        querystring: {
          type: 'object',
          properties: {
            confidence_threshold: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              default: 0.99,
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: RecognizeQuery }>, reply: FastifyReply) => {
      const { confidence_threshold = 0.99 } = request.query;

      try {
        // Handle multipart upload
        const data = await request.file();

        if (!data) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'No file uploaded',
          });
        }

        // Validate content type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(data.mimetype)) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: `Unsupported image type: ${data.mimetype}`,
          });
        }

        // Read file buffer
        const buffer = await data.toBuffer();

        logger.info('File upload recognition request', {
          requestId: request.id,
          filename: data.filename,
          mimetype: data.mimetype,
          size: buffer.length,
        });

        // Call ML service
        const result = await mlClient.detectLogosFromBuffer(buffer, {
          confidenceThreshold: confidence_threshold,
        });

        return reply.send(result);
      } catch (error) {
        logger.error('Upload recognition failed', {
          requestId: request.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        if (error instanceof MLServiceError) {
          return reply.status(error.statusCode).send({
            error: 'ML Service Error',
            message: error.message,
          });
        }

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Recognition failed',
        });
      }
    }
  );

  /**
   * POST /api/v1/embed
   * Generate embedding vector for an image
   */
  fastify.post<{ Body: { image: string } }>(
    '/embed',
    {
      schema: {
        description: 'Generate embedding vector for an image',
        tags: ['Recognition'],
        body: {
          type: 'object',
          required: ['image'],
          properties: {
            image: {
              type: 'string',
              description: 'Base64 encoded image',
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: { image: string } }>, reply: FastifyReply) => {
      const { image } = request.body;

      try {
        const result = await mlClient.generateEmbedding({ image });
        return reply.send(result);
      } catch (error) {
        logger.error('Embedding generation failed', {
          requestId: request.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        if (error instanceof MLServiceError) {
          return reply.status(error.statusCode).send({
            error: 'ML Service Error',
            message: error.message,
          });
        }

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Embedding generation failed',
        });
      }
    }
  );

  /**
   * POST /api/v1/recognize/batch
   * Batch recognition for multiple images
   */
  fastify.post<{ Body: BatchRecognizeBody }>(
    '/recognize/batch',
    {
      schema: {
        description: 'Recognize logos in multiple images',
        tags: ['Recognition'],
        body: {
          type: 'object',
          required: ['images'],
          properties: {
            images: {
              type: 'array',
              maxItems: 20,
              items: {
                type: 'object',
                required: ['id', 'image'],
                properties: {
                  id: { type: 'string' },
                  image: { type: 'string', description: 'Base64 encoded image' },
                },
              },
            },
            confidence_threshold: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              default: 0.99,
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: BatchRecognizeBody }>, reply: FastifyReply) => {
      const { images, confidence_threshold = 0.99 } = request.body;

      if (images.length === 0) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'No images provided',
        });
      }

      if (images.length > 20) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Maximum 20 images per batch',
        });
      }

      logger.info('Batch recognition request', {
        requestId: request.id,
        imageCount: images.length,
      });

      const results: Array<{
        id: string;
        success: boolean;
        result?: DetectionResponse;
        error?: string;
      }> = [];

      // Process images in parallel with concurrency limit
      const concurrency = 4;
      for (let i = 0; i < images.length; i += concurrency) {
        const batch = images.slice(i, i + concurrency);
        const batchResults = await Promise.allSettled(
          batch.map(async ({ id, image }) => {
            const result = await mlClient.detectLogos({
              image,
              confidence_threshold,
              return_embeddings: false,
            });

            // Log result
            const imageHash = crypto.createHash('md5').update(image).digest('hex');
            await logRecognitionResult(
              result.request_id,
              imageHash,
              result,
              request.user?.userId
            );

            return { id, result };
          })
        );

        for (const batchResult of batchResults) {
          if (batchResult.status === 'fulfilled') {
            results.push({
              id: batchResult.value.id,
              success: true,
              result: batchResult.value.result,
            });
          } else {
            const failedId = batch[batchResults.indexOf(batchResult)]?.id;
            results.push({
              id: failedId || 'unknown',
              success: false,
              error: batchResult.reason instanceof Error
                ? batchResult.reason.message
                : 'Unknown error',
            });
          }
        }
      }

      const successCount = results.filter((r) => r.success).length;

      logger.info('Batch recognition completed', {
        requestId: request.id,
        total: images.length,
        success: successCount,
        failed: images.length - successCount,
      });

      return {
        success: true,
        summary: {
          total: images.length,
          successful: successCount,
          failed: images.length - successCount,
        },
        results,
      };
    }
  );

  /**
   * GET /api/v1/recognize/history
   * Get recognition history for the authenticated user
   */
  fastify.get<{ Querystring: RecognitionHistoryQuery }>(
    '/recognize/history',
    {
      preHandler: [authMiddleware],
      schema: {
        description: 'Get recognition history',
        tags: ['Recognition'],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', default: 1 },
            limit: { type: 'number', default: 20 },
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: RecognitionHistoryQuery }>, reply: FastifyReply) => {
      const { page = 1, limit = 20, startDate, endDate } = request.query;
      const userId = request.user!.userId;
      const skip = (page - 1) * limit;

      const where: any = { userId };

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }

      try {
        const [logs, total] = await Promise.all([
          prisma.recognitionLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
            include: {
              results: true,
            },
          }),
          prisma.recognitionLog.count({ where }),
        ]);

        return {
          success: true,
          data: logs,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        };
      } catch (error) {
        logger.error('Failed to fetch recognition history', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch history',
        });
      }
    }
  );

  /**
   * GET /api/v1/recognize/:requestId
   * Get specific recognition result by request ID
   */
  fastify.get<{ Params: { requestId: string } }>(
    '/recognize/:requestId',
    async (request: FastifyRequest<{ Params: { requestId: string } }>, reply: FastifyReply) => {
      const { requestId } = request.params;

      try {
        const log = await prisma.recognitionLog.findFirst({
          where: { requestId },
          include: {
            results: true,
          },
        });

        if (!log) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Recognition result not found',
          });
        }

        return {
          success: true,
          data: log,
        };
      } catch (error) {
        logger.error('Failed to fetch recognition result', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch result',
        });
      }
    }
  );
}

export default recognitionRoutes;
