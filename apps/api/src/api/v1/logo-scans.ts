/**
 * POST /api/v1/pipeline/logo-scans — Story 1.1: service-key authentication only.
 * The real scan arrives in Story 1.2; a valid key currently gets a 501 stub.
 * Logs only the consumer name, never a key value (NFR-4).
 */
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { resolveLogoPipelineConsumer } from '../../services/pipeline/logo-pipeline-keys';
import { logger } from '../../core/logger';

const LOG_MODULE = 'logo-scans';

function fail(request: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string) {
  return reply.status(status).send({ error: { code, message, requestId: request.id || 'unknown' } });
}

export async function logoScanRoutes(app: FastifyInstance) {
  // Per-route cap against key guessing (global limiter is 100/min); only active when @fastify/rate-limit is registered.
  app.post('/pipeline/logo-scans', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const header = request.headers['x-api-key'];
    const consumer = resolveLogoPipelineConsumer(typeof header === 'string' ? header : undefined);
    if (!consumer) {
      logger.warn('logo-scans request rejected', { module: LOG_MODULE, requestId: request.id });
      return fail(request, reply, 401, 'UNAUTHORIZED', 'Missing or invalid service key');
    }
    logger.info('logo-scans request authenticated', { module: LOG_MODULE, consumer, requestId: request.id });
    return fail(request, reply, 501, 'NOT_IMPLEMENTED', 'Logo scan is not implemented yet');
  });
}
