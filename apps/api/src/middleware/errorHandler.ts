/**
 * Global Error Handler for Fastify
 */

import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { createLogger } from '../core/logger';

const logger = createLogger('error-handler');

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    timestamp: string;
    requestId: string;
  };
}

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const requestId = request.id || 'unknown';
  const timestamp = new Date().toISOString();

  // Log the error
  logger.error('Request error', {
    requestId,
    method: request.method,
    url: request.url,
    statusCode: error.statusCode || 500,
    error: error.message,
    stack: error.stack,
  });

  // Determine error code and status
  let statusCode = error.statusCode || 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';

  // Handle validation errors
  if (error.validation) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Request validation failed';
  }

  // Handle specific error types
  if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body is too large';
  }

  if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
    statusCode = 415;
    code = 'UNSUPPORTED_MEDIA_TYPE';
    message = 'Unsupported content type';
  }

  // Handle rate limiting
  if (statusCode === 429) {
    code = 'RATE_LIMIT_EXCEEDED';
    message = 'Too many requests, please slow down';
  }

  // Handle authentication errors
  if (statusCode === 401) {
    code = 'UNAUTHORIZED';
    message = 'Authentication required';
  }

  if (statusCode === 403) {
    code = 'FORBIDDEN';
    message = 'Access denied';
  }

  // Handle not found
  if (statusCode === 404) {
    code = 'NOT_FOUND';
    message = error.message || 'Resource not found';
  }

  // Build error response
  const apiError: ApiError = {
    error: {
      code,
      message: process.env.NODE_ENV === 'production' ? message : error.message || message,
      timestamp,
      requestId,
    },
  };

  // Add validation details in development
  if (error.validation && process.env.NODE_ENV !== 'production') {
    apiError.error.details = {
      validation: error.validation,
    };
  }

  reply.status(statusCode).send(apiError);
}

export default errorHandler;
