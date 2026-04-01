/**
 * Authentication API Routes
 * Handles login, registration, and token refresh
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  login,
  register,
  refreshAccessToken,
  verifyToken,
  getUserById,
} from '../../services/auth';
import { logger } from '../../core/logger';

// Request types
interface LoginBody {
  email: string;
  password: string;
}

interface RegisterBody {
  email: string;
  password: string;
  organizationId?: string;
}

interface RefreshBody {
  refreshToken: string;
}

// Cookie options
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 24 * 60 * 60, // 24 hours
};

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * POST /auth/login
   * Authenticate user and return JWT tokens
   */
  fastify.post<{ Body: LoginBody }>(
    '/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 1 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  role: { type: 'string' },
                  organizationId: { type: 'string', nullable: true },
                },
              },
              expiresIn: { type: 'number' },
            },
          },
          401: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
            },
          },
          429: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
      const { email, password } = request.body;
      const ip = request.ip;

      const result = await login(email, password, ip);

      if (!result.success) {
        const statusCode = result.error?.includes('Too many') ? 429 : 401;
        return reply.status(statusCode).send({
          success: false,
          error: result.error,
        });
      }

      // Set cookies
      reply.setCookie('access_token', result.tokens!.accessToken, COOKIE_OPTIONS);
      reply.setCookie('refresh_token', result.tokens!.refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      logger.info('User logged in', { userId: result.user!.id, email });

      return {
        success: true,
        user: result.user,
        expiresIn: result.tokens!.expiresIn,
      };
    }
  );

  /**
   * POST /auth/register
   * Register a new user account
   */
  fastify.post<{ Body: RegisterBody }>(
    '/auth/register',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            organizationId: { type: 'string', nullable: true },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              userId: { type: 'string' },
              message: { type: 'string' },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: RegisterBody }>, reply: FastifyReply) => {
      const { email, password, organizationId } = request.body;

      const result = await register(email, password, 'USER', organizationId);

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error,
        });
      }

      logger.info('User registered', { userId: result.userId, email });

      return reply.status(201).send({
        success: true,
        userId: result.userId,
        message: 'Registration successful',
      });
    }
  );

  /**
   * POST /auth/refresh
   * Refresh access token using refresh token
   */
  fastify.post<{ Body: RefreshBody }>(
    '/auth/refresh',
    {
      schema: {
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              expiresIn: { type: 'number' },
            },
          },
          401: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: RefreshBody }>, reply: FastifyReply) => {
      // Try to get refresh token from body or cookie
      const refreshToken =
        request.body.refreshToken || request.cookies.refresh_token;

      if (!refreshToken) {
        return reply.status(401).send({
          success: false,
          error: 'Refresh token required',
        });
      }

      const result = await refreshAccessToken(refreshToken);

      if (!result.success) {
        return reply.status(401).send({
          success: false,
          error: result.error,
        });
      }

      // Set new cookies
      reply.setCookie('access_token', result.tokens!.accessToken, COOKIE_OPTIONS);
      reply.setCookie('refresh_token', result.tokens!.refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: 7 * 24 * 60 * 60,
      });

      return {
        success: true,
        expiresIn: result.tokens!.expiresIn,
      };
    }
  );

  /**
   * POST /auth/logout
   * Clear authentication cookies
   */
  fastify.post('/auth/logout', async (request, reply: FastifyReply) => {
    reply.clearCookie('access_token', { path: '/' });
    reply.clearCookie('refresh_token', { path: '/' });

    logger.info('User logged out', { ip: request.ip });

    return { success: true, message: 'Logged out successfully' };
  });

  /**
   * GET /auth/me
   * Get current authenticated user
   */
  fastify.get('/auth/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies.access_token;

    if (!token) {
      return reply.status(401).send({
        success: false,
        error: 'Not authenticated',
      });
    }

    const payload = verifyToken(token);

    if (!payload) {
      reply.clearCookie('access_token', { path: '/' });
      return reply.status(401).send({
        success: false,
        error: 'Invalid or expired token',
      });
    }

    const user = await getUserById(payload.userId);

    if (!user || !user.isActive) {
      reply.clearCookie('access_token', { path: '/' });
      reply.clearCookie('refresh_token', { path: '/' });
      return reply.status(401).send({
        success: false,
        error: 'User not found or inactive',
      });
    }

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      },
    };
  });
}
