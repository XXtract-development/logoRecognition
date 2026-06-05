/**
 * Pipeline API Routes (Epic 9, Stories 9.1, 9.2, 9.3)
 *
 * Exposes job-status and notification management endpoints for the retraining pipeline.
 * Auth: JWT (existing middleware) on all routes.
 *
 * Routes:
 *   GET   /api/v1/pipeline/jobs/:jobId               — job status + failedReason + retryable
 *   GET   /api/v1/pipeline/notifications             — unread-first list of retraining notifications
 *   PATCH /api/v1/pipeline/notifications/:id/read    — mark a notification as read
 *   POST  /api/v1/pipeline/training/start            — manually start a training flow
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getJobStatus } from '../../services/pipeline/queue';
import { submitTrainingFlow } from '../../services/pipeline/training-flow';
import prisma from '../../core/db';
import { createLogger } from '../../core/logger';

const logger = createLogger('pipeline-routes');

// ============================================
// Routes
// ============================================

export async function pipelineRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/pipeline/notifications
   * List retraining notifications (unread first).
   * Polled by the frontend on mount for persisted notifications (AC3 Story 9.2).
   */
  fastify.get(
    '/pipeline/notifications',
    {
      schema: {
        description: 'List retraining trigger notifications',
        tags: ['Pipeline'],
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const notifications = await prisma.retrainingNotification.findMany({
          orderBy: [
            { status: 'asc' }, // unread first (alphabetically 'unread' < 'read')
            { createdAt: 'desc' },
          ],
        });
        return reply.send({ data: notifications });
      } catch (error) {
        logger.error('Failed to list retraining notifications', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to list notifications',
            timestamp: new Date().toISOString(),
          },
        });
      }
    }
  );

  /**
   * PATCH /api/v1/pipeline/notifications/:id/read
   * Mark a retraining notification as read.
   */
  fastify.patch<{ Params: { id: string } }>(
    '/pipeline/notifications/:id/read',
    {
      schema: {
        description: 'Mark a retraining notification as read',
        tags: ['Pipeline'],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      try {
        const notification = await prisma.retrainingNotification.findUnique({ where: { id } });
        if (!notification) {
          return reply.status(404).send({
            error: {
              code: 'NOT_FOUND',
              message: `Notification '${id}' not found`,
              timestamp: new Date().toISOString(),
            },
          });
        }

        const updated = await prisma.retrainingNotification.update({
          where: { id },
          data: { status: 'read', readAt: new Date() },
        });

        return reply.send(updated);
      } catch (error) {
        logger.error('Failed to mark notification as read', {
          id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update notification',
            timestamp: new Date().toISOString(),
          },
        });
      }
    }
  );

  /**
   * GET /api/v1/pipeline/jobs/:jobId
   * Get the status of a pipeline job.
   *
   * Returns failedReason and retryable flag for failed jobs (AC2).
   * 404 when the jobId is unknown.
   */
  fastify.get<{ Params: { jobId: string } }>(
    '/pipeline/jobs/:jobId',
    {
      schema: {
        description: 'Get pipeline job status including failure reason',
        tags: ['Pipeline'],
        params: {
          type: 'object',
          required: ['jobId'],
          properties: {
            jobId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
      const { jobId } = request.params;

      logger.info('Getting pipeline job status', { requestId: request.id, jobId });

      try {
        const status = await getJobStatus(jobId);

        if (status.state === 'not_found') {
          return reply.status(404).send({
            error: {
              code: 'JOB_NOT_FOUND',
              message: `Pipeline job '${jobId}' not found`,
              timestamp: new Date().toISOString(),
              requestId: request.id,
            },
          });
        }

        return reply.send(status);
      } catch (error) {
        logger.error('Failed to get pipeline job status', {
          requestId: request.id,
          jobId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.status(500).send({
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get job status',
            timestamp: new Date().toISOString(),
            requestId: request.id,
          },
        });
      }
    }
  );

  /**
   * POST /api/v1/pipeline/training/start
   * Manually start a full training flow (Story 9.3, Task 5).
   * Auth: JWT required; role DATA_MANAGER+.
   * Returns 409 if a training flow is already active (concurrency=1).
   */
  fastify.post<{ Body: { triggerId?: string; batchId?: string } }>(
    '/pipeline/training/start',
    {
      schema: {
        description: 'Manually start a retraining pipeline flow',
        tags: ['Pipeline'],
        body: {
          type: 'object',
          properties: {
            triggerId: { type: 'string' },
            batchId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: { triggerId?: string; batchId?: string } }>, reply: FastifyReply) => {
      const triggerId = request.body?.triggerId ?? `manual-${Date.now()}`;
      const batchId = request.body?.batchId;

      logger.info('Manual training flow start requested', {
        requestId: request.id,
        triggerId,
      });

      try {
        const result = await submitTrainingFlow({ triggerId, batchId });
        return reply.status(202).send(result);
      } catch (error) {
        logger.error('Failed to start training flow', {
          requestId: request.id,
          triggerId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        return reply.status(500).send({
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to start training flow',
            timestamp: new Date().toISOString(),
            requestId: request.id,
          },
        });
      }
    }
  );
}
