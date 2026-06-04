/**
 * Training API Routes
 * Handles training job management and image annotation
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { mlClient, MLServiceError, TrainingRequest, TrainingConfig } from '../../services/ml-client';
import { socketIOManager } from '../../services/socket-io-manager';
import { createLogger } from '../../core/logger';
import prisma from '../../core/db';
// Shared holdout-metrics mapper (single source of truth for the API shape).
import { mapHoldoutMetrics } from '../../services/holdout-metrics';
import { mapProvenance } from '../../services/provenance';

const logger = createLogger('training');

// Minimum number of validated holdout records required before a training run
// may start (NFR3). Configurable via env; defaults to 25. NB: the same env var
// feeds the ML-service guard (trainer.py) — wire it ONCE via docker-compose so
// both layers cannot diverge.
const HOLDOUT_MINIMUM = parseInt(process.env.HOLDOUT_MINIMUM || '25', 10);

// ============================================
// Types
// ============================================

interface StartTrainingBody {
  batch_id: string;
  config?: TrainingConfig;
  model_name?: string;
}

interface TrainingJobParams {
  jobId: string;
}

interface ListTrainingQuery {
  status?: string;
  limit?: number;
}

interface ListTrainingDataQuery {
  holdout?: boolean;
  page?: number;
  limit?: number;
}

interface HoldoutBody {
  holdout: boolean;
}

// ============================================
// Routes
// ============================================

export async function trainingRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/v1/training/start
   * Start a new training job
   */
  fastify.post<{ Body: StartTrainingBody }>(
    '/training/start',
    {
      schema: {
        description: 'Start a training job for annotated images',
        tags: ['Training'],
        body: {
          type: 'object',
          required: ['batch_id'],
          properties: {
            batch_id: { type: 'string' },
            config: {
              type: 'object',
              properties: {
                batch_size: { type: 'number', minimum: 1, maximum: 128, default: 16 },
                epochs: { type: 'number', minimum: 1, maximum: 1000, default: 100 },
                learning_rate: { type: 'number', minimum: 0, maximum: 1, default: 0.001 },
                augmentation_factor: { type: 'number', minimum: 1, maximum: 100, default: 50 },
                validation_split: { type: 'number', minimum: 0.1, maximum: 0.5, default: 0.2 },
              },
            },
            model_name: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: StartTrainingBody }>, reply: FastifyReply) => {
      const { batch_id, config, model_name } = request.body;

      logger.info('Starting training job', {
        requestId: request.id,
        batchId: batch_id,
        config,
      });

      // NFR3 holdout guard: a training run is only meaningful when a stable,
      // protected holdout set exists. Refuse to start when the validated
      // holdout set is empty or below the configured minimum.
      const holdoutCount = await prisma.trainingData.count({
        where: { holdout: true, validated: true },
      });

      // Use a strict numeric comparison so an undefined count (e.g. unmocked
      // in unrelated tests) does not trip the guard — only a known-too-small
      // holdout set blocks the run.
      if (holdoutCount < HOLDOUT_MINIMUM) {
        logger.warn('Training start refused: holdout set too small', {
          requestId: request.id,
          holdoutCount,
          minimum: HOLDOUT_MINIMUM,
        });

        return reply.status(422).send({
          error: `Holdout set is empty or below the configured minimum (${holdoutCount}/${HOLDOUT_MINIMUM} holdout images). Mark more validated images as holdout before training.`,
          message: 'Holdout set too small for a reliable evaluation baseline.',
        });
      }

      try {
        const job = await mlClient.startTraining({
          batch_id,
          config,
          model_name,
        });

        logger.info('Training job started', {
          requestId: request.id,
          jobId: job.job_id,
        });

        // Notify connected clients via Socket.IO
        socketIOManager.notifyTrainingStarted(job.job_id, batch_id, config);

        return reply.status(202).send(job);
      } catch (error) {
        logger.error('Failed to start training', {
          requestId: request.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        if (error instanceof MLServiceError) {
          return reply.status(error.statusCode).send({
            error: 'Training Error',
            message: error.message,
          });
        }

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to start training',
        });
      }
    }
  );

  /**
   * GET /api/v1/training/data
   * List training-data records, optionally filtered by holdout status.
   * Used by the image library to show/hide holdout-marked records (Story 7.1).
   */
  fastify.get<{ Querystring: ListTrainingDataQuery }>(
    '/training/data',
    {
      schema: {
        description: 'List training-data records (filterable by holdout)',
        tags: ['Training'],
        querystring: {
          type: 'object',
          properties: {
            holdout: { type: 'boolean' },
            page: { type: 'number', minimum: 1, default: 1 },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: ListTrainingDataQuery }>, reply: FastifyReply) => {
      const { holdout, page = 1, limit = 20 } = request.query;

      const where: { holdout?: boolean } = {};
      if (typeof holdout === 'boolean') {
        where.holdout = holdout;
      }

      try {
        const data = await prisma.trainingData.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        });

        return reply.send({ data });
      } catch (error) {
        logger.error('Failed to list training data', {
          requestId: request.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to list training data',
        });
      }
    }
  );

  /**
   * PATCH /api/v1/training/data/:id/holdout
   * Mark or unmark a training-data record as part of the protected holdout set.
   */
  fastify.patch<{ Params: { id: string }; Body: HoldoutBody }>(
    '/training/data/:id/holdout',
    {
      schema: {
        description: 'Mark or unmark a training-data record as holdout',
        tags: ['Training'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['holdout'],
          properties: {
            holdout: { type: 'boolean' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string }; Body: HoldoutBody }>, reply: FastifyReply) => {
      const { id } = request.params;
      const { holdout } = request.body;

      try {
        // NFR3 (Epic 8, Stories 8.6/8.7): synthetic training data may NEVER
        // enter the holdout set — the protected evaluation set stays 100% real.
        // Refuse the transition before mutating.
        if (holdout === true) {
          const existing = await prisma.trainingData.findUnique({
            where: { id },
            select: { provenance: true },
          });
          // If the record is found and originates from synthetic generation,
          // refuse the holdout transition. A missing record falls through to
          // the update below, which maps Prisma P2025 to a 404. Provenance is
          // read through the shared mapper (single source of truth for shape).
          const provenance = mapProvenance(existing?.provenance ?? null);
          if (provenance?.method === 'synthetic') {
            return reply.status(422).send({
              error: 'Unprocessable Entity',
              message:
                'Synthetic training data cannot be marked as holdout (NFR3: the holdout set must remain 100% real).',
            });
          }
        }

        const updated = await prisma.trainingData.update({
          where: { id },
          data: { holdout },
        });

        return reply.send({ id: updated.id, holdout: updated.holdout });
      } catch (error) {
        // Prisma "record not found"
        if (error && typeof error === 'object' && (error as { code?: string }).code === 'P2025') {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Training data record not found',
          });
        }

        logger.error('Failed to update holdout flag', {
          requestId: request.id,
          trainingDataId: id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to update holdout flag',
        });
      }
    }
  );

  /**
   * GET /api/v1/training/:jobId
   * Get training job status
   */
  fastify.get<{ Params: TrainingJobParams }>(
    '/training/:jobId',
    {
      schema: {
        description: 'Get training job status',
        tags: ['Training'],
        params: {
          type: 'object',
          properties: {
            jobId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: TrainingJobParams }>, reply: FastifyReply) => {
      const { jobId } = request.params;

      try {
        const job = await mlClient.getTrainingStatus(jobId);
        return reply.send(job);
      } catch (error) {
        if (error instanceof MLServiceError && error.statusCode === 404) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Training job not found',
          });
        }

        logger.error('Failed to get training status', {
          requestId: request.id,
          jobId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to get training status',
        });
      }
    }
  );

  /**
   * GET /api/v1/training/jobs
   * List training jobs (also available at /training for backwards compatibility)
   */
  const listTrainingJobsHandler = async (request: FastifyRequest<{ Querystring: ListTrainingQuery }>, reply: FastifyReply) => {
    const { status, limit = 10 } = request.query;

    try {
      const jobs = await mlClient.listTrainingJobs(status, limit);
      return reply.send({ jobs, total: jobs.length });
    } catch (error) {
      logger.error('Failed to list training jobs', {
        requestId: request.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Return empty list when ML service is unavailable
        return reply.send({ jobs: [], total: 0 });
      }
  };

  const listJobsSchema = {
    schema: {
      description: 'List training jobs',
      tags: ['Training'],
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['queued', 'running', 'completed', 'failed'] },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 10 },
        },
      },
    },
  };

  fastify.get<{ Querystring: ListTrainingQuery }>('/training/jobs', listJobsSchema, listTrainingJobsHandler);
  fastify.get<{ Querystring: ListTrainingQuery }>('/training', listJobsSchema, listTrainingJobsHandler);

  /**
   * DELETE /api/v1/training/:jobId
   * Cancel a training job
   */
  fastify.delete<{ Params: TrainingJobParams }>(
    '/training/:jobId',
    {
      schema: {
        description: 'Cancel a training job',
        tags: ['Training'],
        params: {
          type: 'object',
          properties: {
            jobId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: TrainingJobParams }>, reply: FastifyReply) => {
      const { jobId } = request.params;

      logger.info('Cancelling training job', {
        requestId: request.id,
        jobId,
      });

      try {
        await mlClient.cancelTraining(jobId);

        // Notify connected clients via Socket.IO
        socketIOManager.sendTrainingUpdate({
          jobId,
          status: 'cancelled',
          progress: 0,
          message: 'Training job cancelled by user',
        });

        return reply.send({ message: 'Training job cancelled', job_id: jobId });
      } catch (error) {
        if (error instanceof MLServiceError) {
          return reply.status(error.statusCode).send({
            error: 'Cancel Error',
            message: error.message,
          });
        }

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to cancel training',
        });
      }
    }
  );

  /**
   * GET /api/v1/models
   * List available ML models
   */
  fastify.get(
    '/models',
    {
      schema: {
        description: 'List available ML models',
        tags: ['Models'],
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await mlClient.listModels();
        return reply.send(result);
      } catch (error) {
        logger.error('Failed to list models', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Return empty list when ML service is unavailable
        return reply.send({ models: [], total: 0 });
      }
    }
  );

  /**
   * GET /api/v1/models/:modelId
   * Get a model version incl. its holdout-evaluation metrics (Story 7.2).
   */
  fastify.get<{ Params: { modelId: string } }>(
    '/models/:modelId',
    {
      schema: {
        description: 'Get a model version with holdout metrics',
        tags: ['Models'],
        params: {
          type: 'object',
          required: ['modelId'],
          properties: {
            modelId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { modelId: string } }>, reply: FastifyReply) => {
      const { modelId } = request.params;

      try {
        const model = await prisma.modelVersion.findUnique({ where: { id: modelId } });

        if (!model) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Model version not found',
          });
        }

        return reply.send({ ...model, holdoutMetrics: mapHoldoutMetrics(model.metrics) });
      } catch (error) {
        logger.error('Failed to get model version', {
          requestId: request.id,
          modelId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to get model version',
        });
      }
    }
  );

  /**
   * POST /api/v1/models/:modelId/activate
   * Activate a specific model
   */
  fastify.post<{ Params: { modelId: string } }>(
    '/models/:modelId/activate',
    {
      schema: {
        description: 'Activate a model for inference',
        tags: ['Models'],
        params: {
          type: 'object',
          properties: {
            modelId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { modelId: string } }>, reply: FastifyReply) => {
      const { modelId } = request.params;

      logger.info('Activating model', {
        requestId: request.id,
        modelId,
      });

      try {
        await mlClient.activateModel(modelId);
        return reply.send({ message: 'Model activated', model_id: modelId });
      } catch (error) {
        if (error instanceof MLServiceError) {
          return reply.status(error.statusCode).send({
            error: 'Activation Error',
            message: error.message,
          });
        }

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to activate model',
        });
      }
    }
  );
}

export default trainingRoutes;
