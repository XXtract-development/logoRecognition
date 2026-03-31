/**
 * Authentication Service
 * JWT token generation and validation with bcrypt password hashing
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import prisma from '../core/db';
import { logger } from '../core/logger';

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('JWT_SECRET is required in production'); })() : 'dev-secret-change-in-production');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const BCRYPT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 60 * 1000; // 1 minute

// Types
export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  organizationId?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResult {
  success: boolean;
  tokens?: AuthTokens;
  user?: {
    id: string;
    email: string;
    role: UserRole;
    organizationId?: string;
  };
  error?: string;
}

// In-memory rate limiting (use Redis in production)
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();

// Periodic cleanup of expired login attempt entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of loginAttempts.entries()) {
    if (now - data.firstAttempt > 15 * 60 * 1000) {
      loginAttempts.delete(ip);
    }
  }
}, 60 * 1000);

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate JWT tokens
 */
export function generateTokens(payload: TokenPayload): AuthTokens {
  const accessToken = jwt.sign(payload, JWT_SECRET as jwt.Secret, {
    expiresIn: JWT_EXPIRES_IN as string,
  } as jwt.SignOptions);

  const refreshToken = jwt.sign(
    { userId: payload.userId, type: 'refresh' },
    JWT_SECRET as jwt.Secret,
    { expiresIn: '7d' } as jwt.SignOptions
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: 24 * 60 * 60, // 24 hours in seconds
  };
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return decoded;
  } catch (error) {
    logger.warn('Token verification failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Check rate limiting for login attempts
 */
function checkRateLimit(ip: string): { allowed: boolean; remainingAttempts: number } {
  const now = Date.now();
  const attempts = loginAttempts.get(ip);

  if (!attempts) {
    return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS };
  }

  // Reset if window has passed
  if (now - attempts.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(ip);
    return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS };
  }

  const remaining = MAX_LOGIN_ATTEMPTS - attempts.count;
  return { allowed: remaining > 0, remainingAttempts: Math.max(0, remaining) };
}

/**
 * Record a login attempt
 */
function recordLoginAttempt(ip: string): void {
  const now = Date.now();
  const attempts = loginAttempts.get(ip);

  if (!attempts || now - attempts.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
  } else {
    attempts.count++;
  }
}

/**
 * Clear login attempts after successful login
 */
function clearLoginAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

/**
 * Login user with email and password
 */
export async function login(
  email: string,
  password: string,
  ip: string
): Promise<LoginResult> {
  // Check rate limiting
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    logger.warn('Rate limit exceeded for login', { ip, email });
    return {
      success: false,
      error: `Too many login attempts. Please wait before trying again. (${rateLimit.remainingAttempts} attempts remaining)`,
    };
  }

  try {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { organization: true },
    });

    if (!user) {
      recordLoginAttempt(ip);
      logger.warn('Login failed - user not found', { email, ip });
      return { success: false, error: 'Invalid email or password' };
    }

    if (!user.isActive) {
      logger.warn('Login failed - user inactive', { email, ip });
      return { success: false, error: 'Account is disabled' };
    }

    // Verify password
    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      recordLoginAttempt(ip);
      logger.warn('Login failed - invalid password', { email, ip });
      return { success: false, error: 'Invalid email or password' };
    }

    // Generate tokens
    const tokens = generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId || undefined,
    });

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Clear rate limiting on success
    clearLoginAttempts(ip);

    logger.info('User logged in successfully', { userId: user.id, email });

    return {
      success: true,
      tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId || undefined,
      },
    };
  } catch (error) {
    logger.error('Login error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      email,
    });
    return { success: false, error: 'An error occurred during login' };
  }
}

/**
 * Register a new user
 */
export async function register(
  email: string,
  password: string,
  role: UserRole = 'USER',
  organizationId?: string
): Promise<{ success: boolean; userId?: string; error?: string }> {
  try {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return { success: false, error: 'Email already registered' };
    }

    // Validate password strength
    if (password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters' };
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        role,
        organizationId,
      },
    });

    logger.info('User registered successfully', { userId: user.id, email });

    return { success: true, userId: user.id };
  } catch (error) {
    logger.error('Registration error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { success: false, error: 'An error occurred during registration' };
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ success: boolean; tokens?: AuthTokens; error?: string }> {
  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET) as {
      userId: string;
      type: string;
    };

    if (decoded.type !== 'refresh') {
      return { success: false, error: 'Invalid refresh token' };
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user || !user.isActive) {
      return { success: false, error: 'User not found or inactive' };
    }

    // Generate new tokens
    const tokens = generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId || undefined,
    });

    return { success: true, tokens };
  } catch (error) {
    logger.warn('Token refresh failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { success: false, error: 'Invalid or expired refresh token' };
  }
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      organizationId: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
}
