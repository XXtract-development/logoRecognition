/**
 * Fastify Test Helper
 * Utilities for testing Fastify routes
 */

import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-jwt-secret';

export interface TestUser {
  userId: string;
  email: string;
  role: 'USER' | 'ADMIN' | 'ANNOTATOR';
  organizationId?: string;
}

/**
 * Create a test Fastify instance
 */
export async function createTestApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });

  await app.register(cookie, {
    secret: 'test-cookie-secret',
  });

  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 10,
    },
  });

  return app;
}

/**
 * Generate a valid JWT token for testing
 */
export function generateTestToken(user: TestUser): string {
  return jwt.sign(
    {
      userId: user.userId,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

/**
 * Generate auth cookies for testing
 * Includes role marker for mock auth middleware detection
 */
export function getAuthCookies(user: TestUser): string {
  const token = generateTestToken(user);
  return `access_token=${token}; role=${user.role}`;
}

/**
 * Create a mock authenticated request
 */
export function createAuthHeaders(user: TestUser): Record<string, string> {
  return {
    cookie: getAuthCookies(user),
  };
}

/**
 * Default test user
 */
export const testUser: TestUser = {
  userId: 'test-user-id',
  email: 'test@example.com',
  role: 'USER',
};

/**
 * Admin test user
 */
export const adminUser: TestUser = {
  userId: 'admin-user-id',
  email: 'admin@example.com',
  role: 'ADMIN',
};

/**
 * Create mock file for multipart testing
 */
export function createMockImageBuffer(): Buffer {
  // Minimal valid JPEG header
  const jpegHeader = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  ]);
  // Add some content to make it reasonable size
  const content = Buffer.alloc(100, 0);
  return Buffer.concat([jpegHeader, content, Buffer.from([0xff, 0xd9])]);
}

/**
 * Create a base64 encoded test image
 */
export function createBase64TestImage(): string {
  return createMockImageBuffer().toString('base64');
}
