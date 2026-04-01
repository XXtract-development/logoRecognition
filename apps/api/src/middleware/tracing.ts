/**
 * Request Tracing Middleware
 * Adds request IDs and timing information to requests
 */

import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { createLogger } from '../core/logger';

const logger = createLogger('tracing');

export function tracingMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  // Start timing
  const startTime = process.hrtime.bigint();

  // Store start time for later use
  request.startTime = startTime;

  // Log incoming request
  logger.debug('Incoming request', {
    requestId: request.id,
    method: request.method,
    url: request.url,
    userAgent: request.headers['user-agent'],
    ip: request.ip,
  });

  done();
}

/**
 * Response logging hook
 * Call this in onResponse hook to log response details
 */
export function responseLogger(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  const startTime = request.startTime;

  if (startTime) {
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1_000_000;

    logger.info('Request completed', {
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs: durationMs.toFixed(2),
    });
  }

  done();
}

// Extend FastifyRequest to include startTime
declare module 'fastify' {
  interface FastifyRequest {
    startTime?: bigint;
  }
}

export default tracingMiddleware;
