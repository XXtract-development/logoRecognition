/**
 * Security Service - Enterprise-grade security utilities
 * Provides secure token management, input validation, and CSRF protection
 */

import CryptoJS from 'crypto-js';

// Security configuration constants
const SECURITY_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  MIN_PASSWORD_LENGTH: 8,
  MAX_INPUT_LENGTH: 1000,
  COORDINATE_MIN: 0,
  COORDINATE_MAX: 10000,
  CSRF_TOKEN_LENGTH: 32,
  SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  TOKEN_REFRESH_THRESHOLD: 5 * 60 * 1000, // 5 minutes before expiry
};

/**
 * Input validation utilities
 */
export class InputValidator {
  /**
   * Validates and sanitizes bounding box coordinates
   */
  static validateBoundingBox(bbox: any): {
    valid: boolean;
    data?: any;
    errors?: string[];
  } {
    const errors: string[] = [];

    // Type validation
    if (!bbox || typeof bbox !== 'object') {
      return { valid: false, errors: ['Invalid bounding box object'] };
    }

    const { x, y, width, height, label, confidence } = bbox;

    // Coordinate validation
    if (typeof x !== 'number' || x < SECURITY_CONFIG.COORDINATE_MIN || x > SECURITY_CONFIG.COORDINATE_MAX) {
      errors.push(`Invalid x coordinate: ${x}`);
    }

    if (typeof y !== 'number' || y < SECURITY_CONFIG.COORDINATE_MIN || y > SECURITY_CONFIG.COORDINATE_MAX) {
      errors.push(`Invalid y coordinate: ${y}`);
    }

    if (typeof width !== 'number' || width <= 0 || width > SECURITY_CONFIG.COORDINATE_MAX) {
      errors.push(`Invalid width: ${width}`);
    }

    if (typeof height !== 'number' || height <= 0 || height > SECURITY_CONFIG.COORDINATE_MAX) {
      errors.push(`Invalid height: ${height}`);
    }

    // Label validation
    if (label && (typeof label !== 'string' || label.length > 100)) {
      errors.push('Invalid label: must be string under 100 characters');
    }

    // Confidence validation
    if (confidence !== undefined) {
      if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
        errors.push('Invalid confidence: must be between 0 and 1');
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    // Return sanitized data
    return {
      valid: true,
      data: {
        x: Math.floor(Math.max(0, Math.min(x, SECURITY_CONFIG.COORDINATE_MAX))),
        y: Math.floor(Math.max(0, Math.min(y, SECURITY_CONFIG.COORDINATE_MAX))),
        width: Math.floor(Math.max(1, Math.min(width, SECURITY_CONFIG.COORDINATE_MAX))),
        height: Math.floor(Math.max(1, Math.min(height, SECURITY_CONFIG.COORDINATE_MAX))),
        label: label ? String(label).substring(0, 100) : undefined,
        confidence: confidence !== undefined ? Math.max(0, Math.min(1, confidence)) : undefined,
      },
    };
  }

  /**
   * Validates file for upload
   */
  static validateFile(file: File): {
    valid: boolean;
    errors?: string[];
  } {
    const errors: string[] = [];

    // Size validation
    if (file.size > SECURITY_CONFIG.MAX_FILE_SIZE) {
      errors.push(`File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB (max: 10MB)`);
    }

    // Type validation
    if (!SECURITY_CONFIG.ALLOWED_IMAGE_TYPES.includes(file.type)) {
      errors.push(`Invalid file type: ${file.type}`);
    }

    // Extension validation
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!SECURITY_CONFIG.ALLOWED_EXTENSIONS.includes(extension)) {
      errors.push(`Invalid file extension: ${extension}`);
    }

    // Filename validation - prevent path traversal
    if (file.name.includes('../') || file.name.includes('..\\')) {
      errors.push('Invalid filename: contains path traversal characters');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Sanitizes string input to prevent XSS
   */
  static sanitizeString(input: string, maxLength: number = SECURITY_CONFIG.MAX_INPUT_LENGTH): string {
    if (typeof input !== 'string') return '';

    // Remove HTML tags and scripts
    let sanitized = input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');

    // Escape special characters
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');

    // Limit length
    return sanitized.substring(0, maxLength);
  }

  /**
   * Validates URL to prevent open redirect
   */
  static validateUrl(url: string): boolean {
    try {
      const parsed = new URL(url, window.location.origin);

      // Only allow same origin or specific trusted domains
      const trustedDomains = [
        window.location.hostname,
        'api.logorecognition.com', // Add your API domain
      ];

      return trustedDomains.includes(parsed.hostname);
    } catch {
      return false;
    }
  }

  /**
   * Validates pagination parameters
   */
  static validatePagination(page: any, pageSize: any): {
    valid: boolean;
    data?: { page: number; pageSize: number };
    errors?: string[];
  } {
    const errors: string[] = [];

    const pageNum = Number(page);
    const size = Number(pageSize);

    if (isNaN(pageNum) || pageNum < 1 || pageNum > 10000) {
      errors.push('Invalid page number');
    }

    if (isNaN(size) || size < 1 || size > 100) {
      errors.push('Invalid page size');
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return {
      valid: true,
      data: {
        page: Math.floor(pageNum),
        pageSize: Math.floor(size),
      },
    };
  }
}

/**
 * CSRF Protection
 */
export class CSRFProtection {
  private static tokenKey = 'csrf_token';
  private static headerName = 'X-CSRF-Token';

  /**
   * Generates a new CSRF token
   */
  static generateToken(): string {
    const array = new Uint8Array(SECURITY_CONFIG.CSRF_TOKEN_LENGTH);
    crypto.getRandomValues(array);
    const token = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');

    // Store in sessionStorage (not localStorage for security)
    sessionStorage.setItem(this.tokenKey, token);

    return token;
  }

  /**
   * Gets current CSRF token or generates new one
   */
  static getToken(): string {
    let token = sessionStorage.getItem(this.tokenKey);
    if (!token) {
      token = this.generateToken();
    }
    return token;
  }

  /**
   * Adds CSRF token to request headers
   */
  static addToHeaders(headers: Record<string, string>): Record<string, string> {
    return {
      ...headers,
      [this.headerName]: this.getToken(),
    };
  }

  /**
   * Validates CSRF token
   */
  static validateToken(token: string): boolean {
    const storedToken = sessionStorage.getItem(this.tokenKey);
    return storedToken === token && token.length === SECURITY_CONFIG.CSRF_TOKEN_LENGTH * 2;
  }
}

/**
 * Secure Token Manager - Uses httpOnly cookies via API
 */
export class SecureTokenManager {
  private static refreshTimer: NodeJS.Timeout | null = null;
  private static tokenExpiryTime: number | null = null;

  /**
   * Initializes token management with httpOnly cookie support
   */
  static async initialize(): Promise<void> {
    // Check if we have a valid session
    try {
      const response = await fetch('/api/v1/auth/session', {
        method: 'GET',
        credentials: 'include', // Include httpOnly cookies
      });

      if (response.ok) {
        const data = await response.json();
        if (data.expiresAt) {
          this.tokenExpiryTime = new Date(data.expiresAt).getTime();
          this.scheduleTokenRefresh();
        }
      }
    } catch (error) {
      console.error('Failed to initialize token manager:', error);
    }
  }

  /**
   * Stores tokens securely via API (sets httpOnly cookies)
   */
  static async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    try {
      const response = await fetch('/api/v1/auth/tokens', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...CSRFProtection.addToHeaders({}),
        },
        body: JSON.stringify({ accessToken, refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        this.tokenExpiryTime = new Date(data.expiresAt).getTime();
        this.scheduleTokenRefresh();
      }
    } catch (error) {
      console.error('Failed to store tokens:', error);
      throw error;
    }
  }

  /**
   * Refreshes access token before expiry
   */
  private static async refreshAccessToken(): Promise<void> {
    try {
      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: CSRFProtection.addToHeaders({}),
      });

      if (response.ok) {
        const data = await response.json();
        this.tokenExpiryTime = new Date(data.expiresAt).getTime();
        this.scheduleTokenRefresh();
      } else {
        // Token refresh failed, redirect to login
        this.clearTokens();
        window.location.href = '/login';
      }
    } catch (error) {
      console.error('Failed to refresh token:', error);
      this.clearTokens();
    }
  }

  /**
   * Schedules automatic token refresh
   */
  private static scheduleTokenRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (!this.tokenExpiryTime) return;

    const now = Date.now();
    const timeUntilExpiry = this.tokenExpiryTime - now;
    const refreshTime = Math.max(0, timeUntilExpiry - SECURITY_CONFIG.TOKEN_REFRESH_THRESHOLD);

    this.refreshTimer = setTimeout(() => {
      this.refreshAccessToken();
    }, refreshTime);
  }

  /**
   * Clears tokens and session
   */
  static async clearTokens(): Promise<void> {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    this.tokenExpiryTime = null;

    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: CSRFProtection.addToHeaders({}),
      });
    } catch (error) {
      console.error('Failed to clear tokens:', error);
    }
  }

  /**
   * Checks if user is authenticated
   */
  static isAuthenticated(): boolean {
    return this.tokenExpiryTime !== null && this.tokenExpiryTime > Date.now();
  }
}

/**
 * Content Security Policy Helper
 */
export class ContentSecurityPolicy {
  static getPolicy(): string {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Adjust as needed
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' http://localhost:* https://api.logorecognition.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');
  }
}

/**
 * Rate limiting helper
 */
export class RateLimiter {
  private static attempts: Map<string, number[]> = new Map();

  static checkLimit(action: string, maxAttempts: number = 10, windowMs: number = 60000): boolean {
    const now = Date.now();
    const attempts = this.attempts.get(action) || [];

    // Remove old attempts outside the window
    const validAttempts = attempts.filter(timestamp => now - timestamp < windowMs);

    if (validAttempts.length >= maxAttempts) {
      return false; // Rate limit exceeded
    }

    validAttempts.push(now);
    this.attempts.set(action, validAttempts);

    return true;
  }

  static reset(action: string): void {
    this.attempts.delete(action);
  }
}

/**
 * Security monitoring and logging
 */
export class SecurityMonitor {
  private static incidents: any[] = [];

  static logSecurityIncident(type: string, details: any): void {
    const incident = {
      timestamp: new Date().toISOString(),
      type,
      details,
      url: window.location.href,
      userAgent: navigator.userAgent,
    };

    this.incidents.push(incident);

    // Send to monitoring service
    this.reportIncident(incident);
  }

  private static async reportIncident(incident: any): Promise<void> {
    try {
      await fetch('/api/v1/security/incidents', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...CSRFProtection.addToHeaders({}),
        },
        body: JSON.stringify(incident),
      });
    } catch (error) {
      console.error('Failed to report security incident:', error);
    }
  }

  static getIncidents(): any[] {
    return [...this.incidents];
  }
}

// Export all security utilities
export const Security = {
  InputValidator,
  CSRFProtection,
  SecureTokenManager,
  ContentSecurityPolicy,
  RateLimiter,
  SecurityMonitor,
  CONFIG: SECURITY_CONFIG,
};

export default Security;