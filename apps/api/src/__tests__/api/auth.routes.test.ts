/**
 * Auth Routes Tests
 * Integration tests for authentication endpoints (MySQL-based auth)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import * as authService from '../../services/auth';

// Mock the auth service module
vi.mock('../../services/auth');

const mockedAuthService = authService as vi.Mocked<typeof authService>;

describe('Auth Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(cookie, { secret: 'test-secret' });

    const { authRoutes } = await import('../../api/v1/auth');
    await app.register(authRoutes, { prefix: '/api/v1' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  // ---------- POST /auth/login ----------

  describe('POST /auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      mockedAuthService.login.mockResolvedValue({
        success: true,
        tokens: {
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          expiresIn: 86400,
        },
        user: {
          id: '1',
          email: 'test@example.com',
          role: 'EMPLOYEE',
          name: 'Test User',
          company: 'TestCo',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.user.email).toBe('test@example.com');
      expect(body.user.role).toBe('EMPLOYEE');
      expect(body.user.name).toBe('Test User');
      expect(body.expiresIn).toBe(86400);
    });

    it('should set access_token and refresh_token cookies on success', async () => {
      mockedAuthService.login.mockResolvedValue({
        success: true,
        tokens: {
          accessToken: 'jwt-access-123',
          refreshToken: 'jwt-refresh-456',
          expiresIn: 86400,
        },
        user: {
          id: '1',
          email: 'test@example.com',
          role: 'EMPLOYEE',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(200);
      const cookies = response.cookies;
      const accessCookie = cookies.find((c: any) => c.name === 'access_token');
      const refreshCookie = cookies.find((c: any) => c.name === 'refresh_token');
      expect(accessCookie).toBeDefined();
      expect(accessCookie!.value).toBe('jwt-access-123');
      expect(accessCookie!.httpOnly).toBe(true);
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie!.value).toBe('jwt-refresh-456');
    });

    it('should return 401 for invalid credentials', async () => {
      mockedAuthService.login.mockResolvedValue({
        success: false,
        error: 'Invalid email or password',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'wrongpassword',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Invalid email or password');
    });

    it('should return 401 for inactive user', async () => {
      mockedAuthService.login.mockResolvedValue({
        success: false,
        error: 'Account is disabled',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'inactive@example.com',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Account is disabled');
    });

    it('should return 429 when rate limited', async () => {
      mockedAuthService.login.mockResolvedValue({
        success: false,
        error: 'Too many login attempts. Please wait before trying again. (0 attempts remaining)',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'password',
        },
      });

      expect(response.statusCode).toBe(429);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Too many');
    });

    it('should validate required fields (missing password)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'test@example.com',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate email format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'not-an-email',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should pass IP address to login service', async () => {
      mockedAuthService.login.mockResolvedValue({
        success: false,
        error: 'Invalid email or password',
      });

      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'password123',
        },
      });

      expect(mockedAuthService.login).toHaveBeenCalledWith(
        'test@example.com',
        'password123',
        expect.any(String)
      );
    });
  });

  // ---------- POST /auth/register ----------

  describe('POST /auth/register', () => {
    it('should always return 403 (registration disabled)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'newuser@example.com',
          password: 'securePassword123',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('not available');
      expect(body.error).toContain('xxtract-portal');
    });

    it('should return 403 even without payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
      });

      expect(response.statusCode).toBe(403);
    });
  });

  // ---------- POST /auth/logout ----------

  describe('POST /auth/logout', () => {
    it('should logout successfully and clear cookies', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Logged out successfully');

      // Verify cookies are cleared (set with past expiry)
      const cookies = response.cookies;
      const accessCookie = cookies.find((c: any) => c.name === 'access_token');
      const refreshCookie = cookies.find((c: any) => c.name === 'refresh_token');
      expect(accessCookie).toBeDefined();
      expect(refreshCookie).toBeDefined();
    });

    it('should succeed even without existing session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ---------- GET /auth/me ----------

  describe('GET /auth/me', () => {
    it('should return 401 without auth cookie', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Not authenticated');
    });

    it('should return user info with valid token', async () => {
      mockedAuthService.verifyToken.mockReturnValue({
        userId: '1',
        email: 'test@example.com',
        role: 'EMPLOYEE',
        name: 'Test User',
        company: 'TestCo',
      });

      mockedAuthService.getUserById.mockResolvedValue({
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'EMPLOYEE',
        isActive: true,
        company: 'TestCo',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        cookies: {
          access_token: 'valid-jwt-token',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.user.email).toBe('test@example.com');
      expect(body.user.role).toBe('EMPLOYEE');
      expect(body.user.name).toBe('Test User');
      expect(body.user.company).toBe('TestCo');
    });

    it('should return 401 for invalid/expired token', async () => {
      mockedAuthService.verifyToken.mockReturnValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        cookies: {
          access_token: 'expired-token',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid or expired token');
    });

    it('should clear cookies when token is invalid', async () => {
      mockedAuthService.verifyToken.mockReturnValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        cookies: {
          access_token: 'expired-token',
        },
      });

      expect(response.statusCode).toBe(401);
      const cookies = response.cookies;
      const accessCookie = cookies.find((c: any) => c.name === 'access_token');
      expect(accessCookie).toBeDefined();
    });

    it('should return 401 when user not found in database', async () => {
      mockedAuthService.verifyToken.mockReturnValue({
        userId: '999',
        email: 'deleted@example.com',
        role: 'EMPLOYEE',
      });

      mockedAuthService.getUserById.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        cookies: {
          access_token: 'valid-token-deleted-user',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('User not found or inactive');
    });

    it('should return 401 when user is inactive', async () => {
      mockedAuthService.verifyToken.mockReturnValue({
        userId: '2',
        email: 'inactive@example.com',
        role: 'EMPLOYEE',
      });

      mockedAuthService.getUserById.mockResolvedValue({
        id: '2',
        email: 'inactive@example.com',
        name: 'Inactive User',
        role: 'EMPLOYEE',
        isActive: false,
        company: null,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        cookies: {
          access_token: 'valid-token-inactive-user',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('User not found or inactive');
    });

    it('should clear both cookies when user is inactive', async () => {
      mockedAuthService.verifyToken.mockReturnValue({
        userId: '2',
        email: 'inactive@example.com',
        role: 'EMPLOYEE',
      });

      mockedAuthService.getUserById.mockResolvedValue({
        id: '2',
        email: 'inactive@example.com',
        name: 'Inactive User',
        role: 'EMPLOYEE',
        isActive: false,
        company: null,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        cookies: {
          access_token: 'valid-token-inactive-user',
        },
      });

      const cookies = response.cookies;
      const accessCookie = cookies.find((c: any) => c.name === 'access_token');
      const refreshCookie = cookies.find((c: any) => c.name === 'refresh_token');
      expect(accessCookie).toBeDefined();
      expect(refreshCookie).toBeDefined();
    });
  });
});
