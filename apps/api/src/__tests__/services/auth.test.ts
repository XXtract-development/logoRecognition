/**
 * Auth Service Tests
 * Unit tests for MySQL-based authentication logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  verifyPassword,
  generateTokens,
  verifyToken,
  login,
  getUserById,
} from '../../services/auth';

// Mock auth-db module
vi.mock('../../core/auth-db', () => ({
  authQuery: vi.fn(),
}));

// Mock bcrypt — default export and named export
vi.mock('bcrypt', () => ({
  default: { compare: vi.fn() },
  compare: vi.fn(),
}));

import { authQuery } from '../../core/auth-db';
import bcrypt from 'bcrypt';

const mockAuthQuery = vi.mocked(authQuery);
const mockBcryptCompare = vi.mocked(bcrypt.compare);

describe('Auth Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------- verifyPassword ----------

  describe('verifyPassword', () => {
    it('should return true when bcrypt compare succeeds', async () => {
      mockBcryptCompare.mockResolvedValue(true as never);

      const result = await verifyPassword('password123', '$2b$12$hash');
      expect(result).toBe(true);
      expect(mockBcryptCompare).toHaveBeenCalledWith('password123', '$2b$12$hash');
    });

    it('should return false when bcrypt compare fails', async () => {
      mockBcryptCompare.mockResolvedValue(false as never);

      const result = await verifyPassword('wrongpass', '$2b$12$hash');
      expect(result).toBe(false);
    });
  });

  // ---------- generateTokens ----------

  describe('generateTokens', () => {
    it('should generate access and refresh tokens', () => {
      const payload = {
        userId: '1',
        email: 'test@example.com',
        role: 'EMPLOYEE',
      };

      const tokens = generateTokens(payload);

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.expiresIn).toBe(24 * 60 * 60);
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
    });

    it('should generate different tokens for different users', () => {
      const tokens1 = generateTokens({
        userId: '1',
        email: 'user1@example.com',
        role: 'EMPLOYEE',
      });
      const tokens2 = generateTokens({
        userId: '2',
        email: 'user2@example.com',
        role: 'ADMIN',
      });

      expect(tokens1.accessToken).not.toBe(tokens2.accessToken);
      expect(tokens1.refreshToken).not.toBe(tokens2.refreshToken);
    });

    it('should include optional name and company in token', () => {
      const payload = {
        userId: '1',
        email: 'test@example.com',
        role: 'EMPLOYEE',
        name: 'Test User',
        company: 'TestCo',
      };

      const tokens = generateTokens(payload);
      const decoded = verifyToken(tokens.accessToken);

      expect(decoded).not.toBeNull();
      expect(decoded?.name).toBe('Test User');
      expect(decoded?.company).toBe('TestCo');
    });
  });

  // ---------- verifyToken ----------

  describe('verifyToken', () => {
    it('should verify and decode a valid token', () => {
      const payload = {
        userId: '1',
        email: 'test@example.com',
        role: 'EMPLOYEE',
      };

      const tokens = generateTokens(payload);
      const decoded = verifyToken(tokens.accessToken);

      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe('1');
      expect(decoded?.email).toBe('test@example.com');
      expect(decoded?.role).toBe('EMPLOYEE');
    });

    it('should return null for invalid token', () => {
      const decoded = verifyToken('invalid-token');
      expect(decoded).toBeNull();
    });

    it('should return null for tampered token', () => {
      const tokens = generateTokens({
        userId: '1',
        email: 'test@example.com',
        role: 'EMPLOYEE',
      });

      // Tamper with the token
      const tampered = tokens.accessToken.slice(0, -5) + 'XXXXX';
      const decoded = verifyToken(tampered);
      expect(decoded).toBeNull();
    });
  });

  // ---------- login ----------

  describe('login', () => {
    const mockUserRow = {
      id: 1,
      email: 'test@example.com',
      password: '$2b$12$hashedpassword',
      name: 'Test User',
      role: 2, // EMPLOYEE
      active: 1,
      company: 'TestCo',
    };

    it('should login successfully with valid credentials', async () => {
      mockAuthQuery.mockResolvedValueOnce([mockUserRow] as any);
      mockBcryptCompare.mockResolvedValue(true as never);

      const result = await login('test@example.com', 'password123', '127.0.0.1');

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user!.email).toBe('test@example.com');
      expect(result.user!.role).toBe('EMPLOYEE');
      expect(result.user!.name).toBe('Test User');
      expect(result.user!.company).toBe('TestCo');
      expect(result.tokens).toBeDefined();
      expect(result.tokens!.accessToken).toBeDefined();
      expect(result.tokens!.refreshToken).toBeDefined();
    });

    it('should return error when user not found', async () => {
      mockAuthQuery.mockResolvedValueOnce([] as any);

      const result = await login('unknown@example.com', 'password123', '127.0.0.2');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid email or password');
    });

    it('should return error when user is inactive', async () => {
      mockAuthQuery.mockResolvedValueOnce([{ ...mockUserRow, active: 0 }] as any);

      const result = await login('test@example.com', 'password123', '127.0.0.3');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Account is disabled');
    });

    it('should return error when password is wrong', async () => {
      mockAuthQuery.mockResolvedValueOnce([mockUserRow] as any);
      mockBcryptCompare.mockResolvedValue(false as never);

      const result = await login('test@example.com', 'wrongpass', '127.0.0.4');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid email or password');
    });

    it('should map role integers correctly', async () => {
      // role 4 = ADMIN
      mockAuthQuery.mockResolvedValueOnce([{ ...mockUserRow, role: 4 }] as any);
      mockBcryptCompare.mockResolvedValue(true as never);

      const result = await login('test@example.com', 'password123', '127.0.0.5');

      expect(result.success).toBe(true);
      expect(result.user!.role).toBe('ADMIN');
    });

    it('should map role 3 (standard XXtract employee) to ADMIN in this tool', async () => {
      mockAuthQuery.mockResolvedValueOnce([{ ...mockUserRow, role: 3 }] as any);
      mockBcryptCompare.mockResolvedValue(true as never);

      const result = await login('test@example.com', 'password123', '127.0.0.7');

      expect(result.success).toBe(true);
      expect(result.user!.role).toBe('ADMIN');
    });

    it('should normalize PHP-style $2y$ hashes to $2b$ before bcrypt.compare (xxtractdb03)', async () => {
      const { verifyPassword } = await import('../../services/auth');
      mockBcryptCompare.mockResolvedValueOnce(true as never);

      const phpStyleHash = '$2y$10$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
      await verifyPassword('central-pw', phpStyleHash);

      expect(mockBcryptCompare).toHaveBeenCalledWith(
        'central-pw',
        phpStyleHash.replace(/^\$2y\$/, '$2b$'),
      );
    });

    it('should default to CUSTOMER for unknown role integers', async () => {
      mockAuthQuery.mockResolvedValueOnce([{ ...mockUserRow, role: 99 }] as any);
      mockBcryptCompare.mockResolvedValue(true as never);

      const result = await login('test@example.com', 'password123', '127.0.0.6');

      expect(result.success).toBe(true);
      expect(result.user!.role).toBe('CUSTOMER');
    });

    it('should rate limit after too many failed attempts', async () => {
      // Use a unique IP to avoid pollution from other tests
      const testIp = '10.99.99.99';

      // Simulate 5 failed attempts
      for (let i = 0; i < 5; i++) {
        mockAuthQuery.mockResolvedValueOnce([] as any);
        await login('test@example.com', 'wrong', testIp);
      }

      // 6th attempt should be rate limited
      const result = await login('test@example.com', 'password123', testIp);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Too many login attempts');
    });

    it('should handle database errors gracefully', async () => {
      mockAuthQuery.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await login('test@example.com', 'password123', '127.0.0.7');

      expect(result.success).toBe(false);
      expect(result.error).toBe('An error occurred during login');
    });

    it('should convert userId to string', async () => {
      mockAuthQuery.mockResolvedValueOnce([mockUserRow] as any);
      mockBcryptCompare.mockResolvedValue(true as never);

      const result = await login('test@example.com', 'password123', '127.0.0.8');

      expect(result.user!.id).toBe('1');
      expect(typeof result.user!.id).toBe('string');
    });
  });

  // ---------- getUserById ----------

  describe('getUserById', () => {
    it('should return user data for valid ID', async () => {
      mockAuthQuery.mockResolvedValueOnce([{
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 2,
        active: 1,
        company: 'TestCo',
      }] as any);

      const user = await getUserById('1');

      expect(user).not.toBeNull();
      expect(user!.id).toBe('1');
      expect(user!.email).toBe('test@example.com');
      expect(user!.name).toBe('Test User');
      expect(user!.role).toBe('EMPLOYEE');
      expect(user!.isActive).toBe(true);
      expect(user!.company).toBe('TestCo');
    });

    it('should return null when user not found', async () => {
      mockAuthQuery.mockResolvedValueOnce([] as any);

      const user = await getUserById('999');
      expect(user).toBeNull();
    });

    it('should return isActive false for inactive users', async () => {
      mockAuthQuery.mockResolvedValueOnce([{
        id: 2,
        email: 'inactive@example.com',
        name: 'Inactive',
        role: 1,
        active: 0,
        company: null,
      }] as any);

      const user = await getUserById('2');

      expect(user).not.toBeNull();
      expect(user!.isActive).toBe(false);
      expect(user!.role).toBe('CUSTOMER');
    });

    it('should handle database errors gracefully', async () => {
      mockAuthQuery.mockRejectedValueOnce(new Error('DB error'));

      const user = await getUserById('1');
      expect(user).toBeNull();
    });
  });
});
