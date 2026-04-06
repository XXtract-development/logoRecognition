/**
 * Authentication API Routes
 * Handles login, logout, and current user info
 * Authenticates against xxtractdb03 MySQL users table
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  login,
  verifyToken,
  getUserById,
} from '../../services/auth';
import { logger } from '../../core/logger';

// Request types
interface LoginBody {
  email: string;
  password: string;
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
                  name: { type: 'string', nullable: true },
                  company: { type: 'string', nullable: true },
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
   * Registration is not available - managed via xxtract-portal
   */
  fastify.post('/auth/register', async (_request, reply: FastifyReply) => {
    return reply.status(403).send({
      success: false,
      error: 'Registration is not available. Accounts are managed via xxtract-portal.',
    });
  });

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
        name: user.name,
        role: user.role,
        company: user.company,
      },
    };
  });
}
