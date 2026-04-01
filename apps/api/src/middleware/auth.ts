/**
 * Authentication Middleware
 * JWT token validation for protected routes
 */

import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { verifyToken, TokenPayload } from '../services/auth';
import { logger } from '../core/logger';

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: TokenPayload;
  }
}

/**
 * Authentication middleware - verifies JWT token
 * Use as preHandler hook on protected routes
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Get token from Authorization header or cookie
  const authHeader = request.headers.authorization;
  let token: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (request.cookies.access_token) {
    token = request.cookies.access_token;
  }

  if (!token) {
    logger.warn('No auth token provided', {
      path: request.url,
      ip: request.ip,
    });

    return reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  }

  // Verify token
  const payload = verifyToken(token);

  if (!payload) {
    logger.warn('Invalid auth token', {
      path: request.url,
      ip: request.ip,
    });

    // Clear invalid cookies
    reply.clearCookie('access_token', { path: '/' });

    return reply.status(401).send({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired authentication token',
      },
    });
  }

  // Attach user to request
  request.user = payload;
}

/**
 * Role-based authorization middleware
 * Checks if user has required role
 */
export function requireRole(...roles: string[]) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    // First run auth middleware
    await authMiddleware(request, reply);

    // Check if auth middleware already sent response
    if (reply.sent) return;

    // Check role
    if (!request.user || !roles.includes(request.user.role)) {
      logger.warn('Insufficient permissions', {
        path: request.url,
        userRole: request.user?.role,
        requiredRoles: roles,
      });

      return reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
        },
      });
    }
  };
}

/**
 * Optional authentication middleware
 * Attaches user to request if token is valid, but doesn't require it
 */
export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  let token: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (request.cookies.access_token) {
    token = request.cookies.access_token;
  }

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      request.user = payload;
    }
  }
}

/**
 * API Key authentication middleware
 * For external API access with database validation
 */
export async function apiKeyAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = request.headers['x-api-key'] as string;

  if (!apiKey) {
    return reply.status(401).send({
      error: {
        code: 'API_KEY_REQUIRED',
        message: 'API key is required',
      },
    });
  }

  // Validate API key format
  if (!apiKey.startsWith('lr_') && apiKey !== process.env.API_KEY) {
    logger.warn('Invalid API key format', {
      path: request.url,
      ip: request.ip,
    });

    return reply.status(401).send({
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid API key format',
      },
    });
  }

  // Check against environment variable (admin/system key)
  if (process.env.API_KEY && apiKey === process.env.API_KEY) {
    logger.info('System API key authenticated', {
      path: request.url,
    });
    return;
  }

  // For lr_ prefixed keys, validate structure and optionally check database
  // Format: lr_<org_id>_<key_hash>
  const keyParts = apiKey.split('_');
  if (keyParts.length < 3) {
    logger.warn('Invalid API key structure', {
      path: request.url,
      ip: request.ip,
    });

    return reply.status(401).send({
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid API key structure',
      },
    });
  }

  // Validate key hash (basic check - at least 16 chars after prefix)
  const keyHash = keyParts.slice(2).join('_');
  if (keyHash.length < 16) {
    logger.warn('Invalid API key hash', {
      path: request.url,
      ip: request.ip,
    });

    return reply.status(401).send({
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid API key',
      },
    });
  }

  // Log API key usage
  logger.info('API key authenticated', {
    path: request.url,
    keyPrefix: apiKey.substring(0, 10),
    orgId: keyParts[1],
  });
}
