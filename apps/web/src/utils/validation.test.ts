import { describe, it, expect } from 'vitest';
import { isValidUrl, sanitizeInput, isValidConfidence } from './validation';

describe('validation utilities', () => {
  describe('isValidUrl', () => {
    it('returns true for valid URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://localhost:3000')).toBe(true);
    });

    it('returns false for invalid URLs', () => {
      expect(isValidUrl('not a url')).toBe(false);
      expect(isValidUrl('')).toBe(false);
    });
  });

  describe('sanitizeInput', () => {
    it('escapes HTML special characters', () => {
      expect(sanitizeInput('<script>alert("xss")</script>')).not.toContain('<');
      expect(sanitizeInput('<script>alert("xss")</script>')).not.toContain('>');
    });

    it('escapes quotes', () => {
      const result = sanitizeInput('"hello" \'world\'');
      expect(result).not.toContain('"');
      expect(result).not.toContain("'");
    });
  });

  describe('isValidConfidence', () => {
    it('returns true for values in [0, 1]', () => {
      expect(isValidConfidence(0)).toBe(true);
      expect(isValidConfidence(0.5)).toBe(true);
      expect(isValidConfidence(1)).toBe(true);
    });

    it('returns false for out of range values', () => {
      expect(isValidConfidence(-0.1)).toBe(false);
      expect(isValidConfidence(1.1)).toBe(false);
    });
  });
});
