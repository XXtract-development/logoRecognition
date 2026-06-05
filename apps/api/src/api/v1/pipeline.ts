/**
 * Pipeline API Routes (Epic 9, Story 9.1)
 *
 * Exposes job-status and management endpoints for the retraining pipeline.
 * Auth: JWT (existing middleware) on all routes.
 *
 * Routes:
 *   GET  /api/v1/pipeline/jobs/:jobId   — job status + failedReason + retryable
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getJobStatus } from '../../services/pipeline/queue';
import { createLogger } from '../../core/logger';

const logger = createLogger('pipeline-routes');

// ============================================
// Routes
// ============================================

export async function pipelineRoutes(fastify: FastifyInstance) {
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
}
