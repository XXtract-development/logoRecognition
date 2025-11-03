/**
 * Validation Utilities
 * Functions for validating files, inputs, and data
 */

import { SUPPORTED_IMAGE_FORMATS, APP_CONFIG } from '@/constants';

export const validateImageFile = (file: File): { valid: boolean; error?: string } => {
  // Check file type
  if (!SUPPORTED_IMAGE_FORMATS.includes(file.type as typeof SUPPORTED_IMAGE_FORMATS[number])) {
    return {
      valid: false,
      error: `Invalid file type. Supported formats: ${SUPPORTED_IMAGE_FORMATS.join(', ')}`,
    };
  }

  // Check file size
  if (file.size > APP_CONFIG.maxFileSize) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed size of ${formatBytes(APP_CONFIG.maxFileSize)}`,
    };
  }

  return { valid: true };
};

export const validateImageFiles = (files: File[]): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  for (const file of files) {
    const result = validateImageFile(file);
    if (!result.valid && result.error !== undefined) {
      errors.push(`${file.name}: ${result.error}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

export const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const sanitizeInput = (input: string): string => {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

export const isValidConfidence = (confidence: number): boolean => {
  return confidence >= 0 && confidence <= 1;
};