/**
 * Feedback API Routes
 * Handles self-learning feedback loop for model improvement
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { socketIOManager } from '../../services/socket-io-manager';
import { createLogger } from '../../core/logger';
import prisma from '../../core/db';

const logger = createLogger('feedback');

// ============================================
// Types
// ============================================

interface SubmitFeedbackBody {
  logId: string;
  predictedLogoId?: string;
  correctLogoId?: string;
  isCorrect: boolean;
  confidence?: number;
}

interface BulkFeedbackBody {
  entries: Array<{
    logId: string;
    predictedLogoId?: string;
    correctLogoId?: string;
    isCorrect: boolean;
  }>;
}

interface ListFeedbackQuery {
  incorporated?: boolean;
  validated?: boolean;
  page?: number;
  limit?: number;
}

interface UncertaintySamplingQuery {
  minConfidence?: number;
  maxConfidence?: number;
  limit?: number;
}

interface RetrainingTriggerBody {
  force?: boolean;
}

// ============================================
// Constants
// ============================================

const RETRAINING_THRESHOLDS = {
  MIN_FEEDBACK_COUNT: 100,        // Minimum feedback entries needed
  MIN_UNINCORPORATED_RATIO: 0.1,  // 10% of total feedback should be new
  LOW_ACCURACY_THRESHOLD: 0.85,   // Trigger if accuracy drops below this
};

// ============================================
// Routes
// ============================================

export async function feedbackRoutes(fastify: FastifyInstance) {
  // Apply auth middleware
  fastify.addHook('preHandler', authMiddleware);

  /**
   * POST /api/v1/feedback
   * Submit feedback for a recognition result
   */
  fastify.post<{ Body: SubmitFeedbackBody }>(
    '/feedback',
    {
      schema: {
        description: 'Submit feedback for a recognition result',
        tags: ['Feedback'],
        body: {
          type: 'object',
          required: ['logId', 'isCorrect'],
          properties: {
            logId: { type: 'string' },
            predictedLogoId: { type: 'string' },
            correctLogoId: { type: 'string' },
            isCorrect: { type: 'boolean' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: SubmitFeedbackBody }>, reply: FastifyReply) => {
      const userId = request.user!.userId;
      const { logId, predictedLogoId, correctLogoId, isCorrect, confidence } = request.body;

      try {
        // Verify recognition log exists
        const recognitionLog = await prisma.recognitionLog.findUnique({
          where: { id: logId },
        });

        if (!recognitionLog) {
          return reply.status(404).send({
            success: false,
            error: 'Recognition log not found',
          });
        }

        // Create feedback entry
        const feedback = await prisma.feedbackEntry.create({
          data: {
            logId,
            predictedLogoId,
            correctLogoId: isCorrect ? predictedLogoId : correctLogoId,
            confidence,
            validatedBy: userId,
            validatedAt: new Date(),
          },
        });

        logger.info('Feedback submitted', {
          feedbackId: feedback.id,
          logId,
          isCorrect,
          userId,
        });

        // Notify connected clients via Socket.IO
        socketIOManager.notifyFeedbackReceived(logId, isCorrect);

        // Check if retraining should be triggered
        const shouldRetrain = await checkRetrainingConditions();

        return reply.status(201).send({
          success: true,
          feedback,
          retrainingRecommended: shouldRetrain,
        });
      } catch (error) {
        logger.error('Failed to submit feedback', {
          error: error instanceof Error ? error.message : 'Unknown error',
          logId,
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to submit feedback',
        });
      }
    }
  );

  /**
   * POST /api/v1/feedback/bulk
   * Submit multiple feedback entries
   */
  fastify.post<{ Body: BulkFeedbackBody }>(
    '/feedback/bulk',
    {
      schema: {
        description: 'Submit multiple feedback entries',
        tags: ['Feedback'],
        body: {
          type: 'object',
          required: ['entries'],
          properties: {
            entries: {
              type: 'array',
              maxItems: 100,
              items: {
                type: 'object',
                required: ['logId', 'isCorrect'],
                properties: {
                  logId: { type: 'string' },
                  predictedLogoId: { type: 'string' },
                  correctLogoId: { type: 'string' },
                  isCorrect: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: BulkFeedbackBody }>, reply: FastifyReply) => {
      const userId = request.user!.userId;
      const { entries } = request.body;

      try {
        const result = await prisma.feedbackEntry.createMany({
          data: entries.map((entry) => ({
            logId: entry.logId,
            predictedLogoId: entry.predictedLogoId,
            correctLogoId: entry.isCorrect ? entry.predictedLogoId : entry.correctLogoId,
            validatedBy: userId,
            validatedAt: new Date(),
          })),
        });

        logger.info('Bulk feedback submitted', {
          count: result.count,
          userId,
        });

        return reply.status(201).send({
          success: true,
          count: result.count,
        });
      } catch (error) {
        logger.error('Failed to submit bulk feedback', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to submit feedback',
        });
      }
    }
  );

  /**
   * GET /api/v1/feedback
   * List feedback entries
   */
  fastify.get<{ Querystring: ListFeedbackQuery }>(
    '/feedback',
    {
      schema: {
        description: 'List feedback entries',
        tags: ['Feedback'],
        querystring: {
          type: 'object',
          properties: {
            incorporated: { type: 'boolean' },
            validated: { type: 'boolean' },
            page: { type: 'number', default: 1 },
            limit: { type: 'number', default: 50 },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: ListFeedbackQuery }>, reply: FastifyReply) => {
      const { incorporated, page = 1, limit = 50 } = request.query;
      const skip = (page - 1) * limit;

      const where: any = {};
      if (incorporated !== undefined) where.incorporated = incorporated;

      try {
        const [entries, total] = await Promise.all([
          prisma.feedbackEntry.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
            include: {
              log: {
                select: {
                  requestId: true,
                  imageHash: true,
                  detectionCount: true,
                },
              },
            },
          }),
          prisma.feedbackEntry.count({ where }),
        ]);

        return {
          success: true,
          data: entries,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        };
      } catch (error) {
        logger.error('Failed to list feedback', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to fetch feedback',
        });
      }
    }
  );

  /**
   * GET /api/v1/feedback/uncertain
   * Get uncertain predictions for active learning (uncertainty sampling)
   */
  fastify.get<{ Querystring: UncertaintySamplingQuery }>(
    '/feedback/uncertain',
    {
      schema: {
        description: 'Get uncertain predictions for review (uncertainty sampling)',
        tags: ['Feedback'],
        querystring: {
          type: 'object',
          properties: {
            minConfidence: { type: 'number', default: 0.5 },
            maxConfidence: { type: 'number', default: 0.9 },
            limit: { type: 'number', default: 20 },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: UncertaintySamplingQuery }>, reply: FastifyReply) => {
      const { minConfidence = 0.5, maxConfidence = 0.9, limit = 20 } = request.query;

      try {
        // Find recognition results with uncertain predictions
        const uncertainResults = await prisma.recognitionResult.findMany({
          where: {
            confidence: {
              gte: minConfidence,
              lte: maxConfidence,
            },
            log: {
              feedback: {
                none: {}, // No feedback submitted yet
              },
            },
          },
          orderBy: {
            confidence: 'asc', // Most uncertain first
          },
          take: limit,
          include: {
            log: {
              select: {
                id: true,
                requestId: true,
                imageHash: true,
                createdAt: true,
              },
            },
            logo: true,
          },
        });

        return {
          success: true,
          data: uncertainResults.map((result) => ({
            resultId: result.id,
            logId: result.log.id,
            requestId: result.log.requestId,
            imageHash: result.log.imageHash,
            prediction: {
              category: result.category,
              value: result.value,
              confidence: result.confidence,
              bbox: {
                x: result.x,
                y: result.y,
                width: result.width,
                height: result.height,
              },
            },
            logo: result.logo,
            createdAt: result.log.createdAt,
          })),
          total: uncertainResults.length,
        };
      } catch (error) {
        logger.error('Failed to get uncertain predictions', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to fetch uncertain predictions',
        });
      }
    }
  );

  /**
   * GET /api/v1/feedback/stats
   * Get feedback statistics
   */
  fastify.get(
    '/feedback/stats',
    {
      schema: {
        description: 'Get feedback statistics',
        tags: ['Feedback'],
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const [total, incorporated, pending, correctCount, incorrectCount] = await Promise.all([
          prisma.feedbackEntry.count(),
          prisma.feedbackEntry.count({ where: { incorporated: true } }),
          prisma.feedbackEntry.count({ where: { incorporated: false } }),
          prisma.feedbackEntry.count({
            where: { predictedLogoId: { not: null }, correctLogoId: { equals: prisma.feedbackEntry.fields.predictedLogoId } },
          }),
          prisma.feedbackEntry.count({
            where: {
              correctLogoId: { not: null },
              NOT: { correctLogoId: { equals: prisma.feedbackEntry.fields.predictedLogoId } },
            },
          }),
        ]);

        // Get recent accuracy trend
        const recentFeedback = await prisma.feedbackEntry.findMany({
          where: { validatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
          orderBy: { validatedAt: 'desc' },
          take: 100,
        });

        const recentCorrect = recentFeedback.filter(
          (f) => f.predictedLogoId && f.correctLogoId === f.predictedLogoId
        ).length;
        const recentAccuracy = recentFeedback.length > 0 ? recentCorrect / recentFeedback.length : 0;

        // Check if retraining is recommended
        const shouldRetrain = await checkRetrainingConditions();

        return {
          success: true,
          stats: {
            total,
            incorporated,
            pending,
            incorporationRate: total > 0 ? incorporated / total : 0,
            accuracy: {
              overall: total > 0 ? correctCount / (correctCount + incorrectCount) : 0,
              recent7Days: recentAccuracy,
            },
            retrainingRecommended: shouldRetrain,
            thresholds: RETRAINING_THRESHOLDS,
          },
        };
      } catch (error) {
        logger.error('Failed to get feedback stats', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to fetch statistics',
        });
      }
    }
  );

  /**
   * POST /api/v1/feedback/incorporate
   * Incorporate pending feedback into training data
   */
  fastify.post(
    '/feedback/incorporate',
    {
      preHandler: [requireRole('ADMIN')],
      schema: {
        description: 'Incorporate pending feedback into training data',
        tags: ['Feedback'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Get unincorporated feedback with correct logo assignments
        const pendingFeedback = await prisma.feedbackEntry.findMany({
          where: {
            incorporated: false,
            correctLogoId: { not: null },
          },
          include: {
            log: true,
          },
        });

        if (pendingFeedback.length === 0) {
          return {
            success: true,
            message: 'No pending feedback to incorporate',
            incorporated: 0,
          };
        }

        // Create training data entries from feedback
        let incorporatedCount = 0;
        for (const feedback of pendingFeedback) {
          // Create training data if there's an associated image
          if (feedback.log.imageHash) {
            // Find image by hash
            const image = await prisma.logoImage.findFirst({
              where: {
                metadata: {
                  path: ['hash'],
                  equals: feedback.log.imageHash,
                },
              },
            });

            if (image) {
              await prisma.trainingData.create({
                data: {
                  imageId: image.id,
                  label: feedback.correctLogoId!,
                  confidence: feedback.confidence || 1.0,
                  validated: true,
                  validationDate: new Date(),
                  validatedBy: feedback.validatedBy || 'system',
                },
              });
            }
          }

          // Mark feedback as incorporated
          await prisma.feedbackEntry.update({
            where: { id: feedback.id },
            data: { incorporated: true },
          });

          incorporatedCount++;
        }

        logger.info('Feedback incorporated', {
          count: incorporatedCount,
        });

        return {
          success: true,
          incorporated: incorporatedCount,
          message: `Incorporated ${incorporatedCount} feedback entries`,
        };
      } catch (error) {
        logger.error('Failed to incorporate feedback', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to incorporate feedback',
        });
      }
    }
  );

  /**
   * POST /api/v1/feedback/trigger-retraining
   * Check conditions and trigger retraining if needed
   */
  fastify.post<{ Body: RetrainingTriggerBody }>(
    '/feedback/trigger-retraining',
    {
      preHandler: [requireRole('ADMIN')],
      schema: {
        description: 'Check and trigger model retraining',
        tags: ['Feedback'],
        body: {
          type: 'object',
          properties: {
            force: { type: 'boolean', default: false },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: RetrainingTriggerBody }>, reply: FastifyReply) => {
      const { force = false } = request.body || {};

      try {
        const shouldRetrain = await checkRetrainingConditions();

        if (!shouldRetrain && !force) {
          return {
            success: true,
            triggered: false,
            message: 'Retraining conditions not met',
            conditions: await getRetrainingConditionDetails(),
          };
        }

        // First incorporate pending feedback
        const pendingCount = await prisma.feedbackEntry.count({
          where: { incorporated: false },
        });

        if (pendingCount > 0) {
          await prisma.feedbackEntry.updateMany({
            where: { incorporated: false },
            data: { incorporated: true },
          });
        }

        // Create a new training batch from feedback
        const trainingBatch = await prisma.trainingBatch.create({
          data: {
            name: `Auto-retrain-${new Date().toISOString()}`,
            status: 'PROCESSING',
            userId: request.user!.userId,
          },
        });

        logger.info('Retraining triggered', {
          batchId: trainingBatch.id,
          forced: force,
          incorporatedFeedback: pendingCount,
        });

        // Notify connected clients via Socket.IO
        socketIOManager.notifyRetrainingTriggered(
          trainingBatch.id,
          force ? 'Manual trigger by admin' : 'Automatic trigger based on feedback conditions'
        );

        return {
          success: true,
          triggered: true,
          batchId: trainingBatch.id,
          message: force ? 'Retraining forced' : 'Retraining triggered based on conditions',
          incorporatedFeedback: pendingCount,
        };
      } catch (error) {
        logger.error('Failed to trigger retraining', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to trigger retraining',
        });
      }
    }
  );

  /**
   * GET /api/v1/feedback/model-comparison
   * Compare model versions based on feedback
   */
  fastify.get(
    '/feedback/model-comparison',
    {
      schema: {
        description: 'Compare model versions based on feedback accuracy',
        tags: ['Feedback'],
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Get all model versions
        const models = await prisma.modelVersion.findMany({
          orderBy: { createdAt: 'desc' },
          take: 10,
        });

        // For each model, calculate accuracy from feedback
        const comparisons = await Promise.all(
          models.map(async (model) => {
            // This would require model_id in recognition logs
            // Simplified version using model creation date
            const feedbackAfterModel = await prisma.feedbackEntry.findMany({
              where: {
                validatedAt: { gte: model.createdAt },
              },
            });

            const correct = feedbackAfterModel.filter(
              (f) => f.predictedLogoId && f.correctLogoId === f.predictedLogoId
            ).length;

            return {
              modelId: model.id,
              version: model.version,
              modelType: model.modelType,
              trainedAccuracy: model.accuracy,
              realWorldAccuracy: feedbackAfterModel.length > 0
                ? correct / feedbackAfterModel.length
                : null,
              feedbackCount: feedbackAfterModel.length,
              isActive: model.isActive,
              createdAt: model.createdAt,
            };
          })
        );

        return {
          success: true,
          comparisons,
        };
      } catch (error) {
        logger.error('Failed to compare models', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.status(500).send({
          success: false,
          error: 'Failed to compare models',
        });
      }
    }
  );
}

// ============================================
// Helper Functions
// ============================================

async function checkRetrainingConditions(): Promise<boolean> {
  try {
    const [totalFeedback, unincorporated] = await Promise.all([
      prisma.feedbackEntry.count(),
      prisma.feedbackEntry.count({ where: { incorporated: false } }),
    ]);

    // Check minimum feedback count
    if (totalFeedback < RETRAINING_THRESHOLDS.MIN_FEEDBACK_COUNT) {
      return false;
    }

    // Check unincorporated ratio
    const unincorporatedRatio = unincorporated / totalFeedback;
    if (unincorporatedRatio >= RETRAINING_THRESHOLDS.MIN_UNINCORPORATED_RATIO) {
      return true;
    }

    // Check recent accuracy
    const recentFeedback = await prisma.feedbackEntry.findMany({
      where: { validatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      take: 100,
    });

    if (recentFeedback.length >= 20) {
      const correct = recentFeedback.filter(
        (f) => f.predictedLogoId && f.correctLogoId === f.predictedLogoId
      ).length;
      const accuracy = correct / recentFeedback.length;

      if (accuracy < RETRAINING_THRESHOLDS.LOW_ACCURACY_THRESHOLD) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

async function getRetrainingConditionDetails(): Promise<object> {
  const [totalFeedback, unincorporated] = await Promise.all([
    prisma.feedbackEntry.count(),
    prisma.feedbackEntry.count({ where: { incorporated: false } }),
  ]);

  const recentFeedback = await prisma.feedbackEntry.findMany({
    where: { validatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    take: 100,
  });

  const correct = recentFeedback.filter(
    (f) => f.predictedLogoId && f.correctLogoId === f.predictedLogoId
  ).length;

  return {
    totalFeedback: {
      current: totalFeedback,
      required: RETRAINING_THRESHOLDS.MIN_FEEDBACK_COUNT,
      met: totalFeedback >= RETRAINING_THRESHOLDS.MIN_FEEDBACK_COUNT,
    },
    unincorporatedRatio: {
      current: totalFeedback > 0 ? unincorporated / totalFeedback : 0,
      required: RETRAINING_THRESHOLDS.MIN_UNINCORPORATED_RATIO,
      met: totalFeedback > 0 && (unincorporated / totalFeedback) >= RETRAINING_THRESHOLDS.MIN_UNINCORPORATED_RATIO,
    },
    recentAccuracy: {
      current: recentFeedback.length > 0 ? correct / recentFeedback.length : null,
      threshold: RETRAINING_THRESHOLDS.LOW_ACCURACY_THRESHOLD,
      met: recentFeedback.length >= 20 && (correct / recentFeedback.length) < RETRAINING_THRESHOLDS.LOW_ACCURACY_THRESHOLD,
    },
  };
}

export default feedbackRoutes;
