/**
 * Training API Routes
 * Handles training job management and image annotation
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { mlClient, MLServiceError, TrainingRequest, TrainingConfig } from '../../services/ml-client';
import { socketIOManager } from '../../services/socket-io-manager';
import { createLogger } from '../../core/logger';

const logger = createLogger('training');

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
   * GET /api/v1/training
   * List training jobs
   */
  fastify.get<{ Querystring: ListTrainingQuery }>(
    '/training',
    {
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
    },
    async (request: FastifyRequest<{ Querystring: ListTrainingQuery }>, reply: FastifyReply) => {
      const { status, limit = 10 } = request.query;

      try {
        const jobs = await mlClient.listTrainingJobs(status, limit);
        return reply.send({ jobs, total: jobs.length });
      } catch (error) {
        logger.error('Failed to list training jobs', {
          requestId: request.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to list training jobs',
        });
      }
    }
  );

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

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to list models',
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
