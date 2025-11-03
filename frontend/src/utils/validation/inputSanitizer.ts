// Input Sanitization Utility for preventing XSS and injection attacks

/**
 * Sanitizes a string by escaping HTML special characters
 */
export const sanitizeHtml = (input: string): string => {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  const reg = /[&<>"'/]/gi;
  return input.replace(reg, (match) => map[match]);
};

/**
 * Validates and sanitizes a job ID
 * Only allows alphanumeric characters, hyphens, and underscores
 */
export const sanitizeJobId = (jobId: string): string | null => {
  if (!jobId || typeof jobId !== 'string') {
    return null;
  }

  // Remove any non-alphanumeric characters except hyphens and underscores
  const sanitized = jobId.replace(/[^a-zA-Z0-9-_]/g, '');

  // Check if the sanitized version matches the original
  if (sanitized !== jobId) {
    console.warn('Job ID contained invalid characters and was sanitized');
  }

  // Limit length to prevent DOS
  return sanitized.substring(0, 100);
};

/**
 * Validates and sanitizes a model name
 */
export const sanitizeModelName = (name: string): string | null => {
  if (!name || typeof name !== 'string') {
    return null;
  }

  // Only allow lowercase letters, numbers, and hyphens
  const sanitized = name.toLowerCase().replace(/[^a-z0-9-]/g, '');

  // Must start with a letter
  if (!/^[a-z]/.test(sanitized)) {
    return null;
  }

  // Limit length
  return sanitized.substring(0, 50);
};

/**
 * Sanitizes file paths to prevent directory traversal attacks
 */
export const sanitizeFilePath = (path: string): string | null => {
  if (!path || typeof path !== 'string') {
    return null;
  }

  // Remove any directory traversal attempts
  const sanitized = path
    .replace(/\.\./g, '')
    .replace(/[<>:"|?*]/g, '') // Remove invalid file path characters
    .replace(/\/+/g, '/'); // Replace multiple slashes with single slash

  // Don't allow absolute paths
  if (sanitized.startsWith('/') || sanitized.includes(':')) {
    return null;
  }

  return sanitized.substring(0, 255);
};

/**
 * Validates and sanitizes URL parameters
 */
export const sanitizeUrlParam = (param: string): string => {
  if (!param || typeof param !== 'string') {
    return '';
  }

  return encodeURIComponent(param);
};

/**
 * Validates email format
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validates and sanitizes webhook URLs
 */
export const sanitizeWebhookUrl = (url: string): string | null => {
  if (!url || typeof url !== 'string') {
    return null;
  }

  try {
    const parsed = new URL(url);

    // Only allow HTTPS for webhooks
    if (parsed.protocol !== 'https:') {
      console.warn('Webhook URL must use HTTPS');
      return null;
    }

    // Check for common webhook providers
    const allowedHosts = [
      'hooks.slack.com',
      'discord.com',
      'webhook.site', // For testing
    ];

    const isAllowed = allowedHosts.some(host =>
      parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    );

    if (!isAllowed && process.env.NODE_ENV === 'production') {
      console.warn('Webhook URL host not in allowed list');
      return null;
    }

    return parsed.toString();
  } catch (error) {
    console.error('Invalid webhook URL:', error);
    return null;
  }
};

/**
 * Validates numeric input within bounds
 */
export const validateNumericRange = (
  value: number,
  min: number,
  max: number,
  defaultValue: number
): number => {
  if (typeof value !== 'number' || isNaN(value)) {
    return defaultValue;
  }

  return Math.max(min, Math.min(max, value));
};

/**
 * Sanitizes JSON input to prevent injection
 */
export const sanitizeJson = (input: any): any => {
  if (input === null || input === undefined) {
    return null;
  }

  if (typeof input === 'string') {
    return sanitizeHtml(input);
  }

  if (Array.isArray(input)) {
    return input.map(sanitizeJson);
  }

  if (typeof input === 'object') {
    const sanitized: any = {};
    for (const key in input) {
      if (input.hasOwnProperty(key)) {
        // Sanitize the key as well
        const sanitizedKey = sanitizeHtml(key);
        sanitized[sanitizedKey] = sanitizeJson(input[key]);
      }
    }
    return sanitized;
  }

  return input;
};

/**
 * Validates CSRF token
 */
export const getCsrfToken = (): string => {
  const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
  if (!token) {
    console.warn('CSRF token not found');
    return '';
  }
  return token;
};

export default {
  sanitizeHtml,
  sanitizeJobId,
  sanitizeModelName,
  sanitizeFilePath,
  sanitizeUrlParam,
  isValidEmail,
  sanitizeWebhookUrl,
  validateNumericRange,
  sanitizeJson,
  getCsrfToken,
};