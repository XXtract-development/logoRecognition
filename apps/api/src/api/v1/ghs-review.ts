/** Stateless visual AI prelabels; no detector proposals, persistence or training. */
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireRole } from '../../middleware/auth';
import { isServiceRequest } from '../../services/pipeline/queue';
import { mlClient, MLServiceError } from '../../services/ml-client';

async function reviewAuth(request: FastifyRequest, reply: FastifyReply) {
  if (request.headers['x-api-key'] !== undefined) {
    if (!process.env.PIPELINE_SERVICE_KEY) {
      return reply.status(503).send({ error: { code: 'SERVICE_KEY_UNAVAILABLE' } });
    }
    if (!isServiceRequest(request)) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });
    }
    return;
  }
  await requireRole('ADMIN')(request, reply);
}

export async function ghsReviewRoutes(app: FastifyInstance) {
  app.post<{ Body: { image: string; mimeType: 'image/png' | 'image/jpeg' } }>(
    '/ghs/review',
    {
      bodyLimit: 6 * 1024 * 1024,
      onRequest: reviewAuth,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['image', 'mimeType'],
          properties: {
            image: { type: 'string', minLength: 1 },
            mimeType: { type: 'string', enum: ['image/png', 'image/jpeg'] },
          },
        },
      },
      // Fastify's default AJV removes additional fields; explicitly reject them.
      preValidation: async (request, reply) => {
        const body = request.body;
        if (!body || typeof body !== 'object' || Array.isArray(body) ||
            typeof body.image !== 'string' || typeof body.mimeType !== 'string' ||
            Object.keys(body).some(key => !['image', 'mimeType'].includes(key))) {
          return reply.status(422).send({ error: { code: 'INVALID_REVIEW_INPUT' } });
        }
      },
      errorHandler: (error, _request, reply) => {
        const status = error.statusCode === 429 ? 429 : error.statusCode === 413 ? 413 : error.validation ? 422 : 400;
        return reply.status(status).send({ error: { code: status === 429 ? 'RATE_LIMITED' : status === 413 ? 'BODY_TOO_LARGE' : 'INVALID_REVIEW_INPUT' } });
      },
    },
    async (request, reply) => {
      try {
        return await mlClient.reviewGhs(request.body);
      } catch (error) {
        const status = error instanceof MLServiceError ? error.statusCode : 502;
        return reply.status(status).send({ error: { code: 'GHS_REVIEW_UNAVAILABLE' } });
      }
    }
  );
}
