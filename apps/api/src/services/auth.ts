/**
 * Authentication Service
 * JWT token generation and validation with bcrypt password hashing
 * Authenticates against xxtractdb03 MySQL users table (xxtract-portal credentials)
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { RowDataPacket } from 'mysql2/promise';
import { authQuery } from '../core/auth-db';
import { logger } from '../core/logger';

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('JWT_SECRET is required in production'); })() : 'dev-secret-change-in-production');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 60 * 1000; // 1 minute

// Role mapping: MySQL int -> string
// Role 3 is the standard XXtract employee profile in xxtractdb03; this is an
// internal data-manager tool, so role 3 maps to ADMIN here (decision Friso,
// 2026-06-05 — without it no central account could ever reach ADMIN).
const ROLE_MAP: Record<number, string> = {
  1: 'CUSTOMER',
  2: 'EMPLOYEE',
  3: 'ADMIN',
  4: 'ADMIN',
};

function mapRole(roleInt: number): string {
  return ROLE_MAP[roleInt] || 'CUSTOMER';
}

// MySQL user row type
interface UserRow extends RowDataPacket {
  id: number;
  email: string;
  password: string;
  name: string;
  role: number;
  active: number;
  company: string | null;
}

// Types
export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  name?: string;
  company?: string;
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
    role: string;
    name?: string;
    company?: string;
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
 * Verify a password against a bcrypt hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // xxtractdb03 hashes are written by PHP (Laravel), which uses the $2y$
  // bcrypt prefix. Node bcrypt only accepts $2a$/$2b$ and rejects $2y$
  // outright, even though the algorithms are identical — normalize first.
  const normalized = hash.replace(/^\$2y\$/, '$2b$');
  return bcrypt.compare(password, normalized);
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
 * Queries xxtractdb03.users table directly
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
    // Find user by email in xxtractdb03.users
    const rows = await authQuery<UserRow[]>(
      'SELECT id, email, password, name, role, active, company FROM users WHERE email = ? LIMIT 1',
      [email.toLowerCase()]
    );

    const user = rows[0];

    if (!user) {
      recordLoginAttempt(ip);
      logger.warn('Login failed - user not found', { email, ip });
      return { success: false, error: 'Invalid email or password' };
    }

    if (!user.active) {
      logger.warn('Login failed - user inactive', { email, ip });
      return { success: false, error: 'Account is disabled' };
    }

    // Verify password (bcrypt hash in xxtractdb03)
    const validPassword = await verifyPassword(password, user.password);
    if (!validPassword) {
      recordLoginAttempt(ip);
      logger.warn('Login failed - invalid password', { email, ip });
      return { success: false, error: 'Invalid email or password' };
    }

    const roleStr = mapRole(user.role);

    // Generate tokens
    const tokens = generateTokens({
      userId: String(user.id),
      email: user.email,
      role: roleStr,
      name: user.name || undefined,
      company: user.company || undefined,
    });

    // Clear rate limiting on success
    clearLoginAttempts(ip);

    logger.info('User logged in successfully', { userId: user.id, email });

    return {
      success: true,
      tokens,
      user: {
        id: String(user.id),
        email: user.email,
        role: roleStr,
        name: user.name || undefined,
        company: user.company || undefined,
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
 * Get user by ID from xxtractdb03.users
 */
export async function getUserById(userId: string) {
  try {
    const rows = await authQuery<UserRow[]>(
      'SELECT id, email, name, role, active, company FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    const user = rows[0];
    if (!user) return null;

    return {
      id: String(user.id),
      email: user.email,
      name: user.name,
      role: mapRole(user.role),
      isActive: user.active === 1,
      company: user.company,
    };
  } catch (error) {
    logger.error('getUserById error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
    });
    return null;
  }
}
