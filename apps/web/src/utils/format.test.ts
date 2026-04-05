import { describe, it, expect } from 'vitest';
import { formatConfidence, formatDuration, formatFileSize, truncateText } from './format';

describe('format utilities', () => {
  describe('formatConfidence', () => {
    it('converts decimal to percentage string', () => {
      expect(formatConfidence(0.95)).toBe('95.00%');
      expect(formatConfidence(1)).toBe('100.00%');
      expect(formatConfidence(0)).toBe('0.00%');
    });

    it('respects custom decimal places', () => {
      expect(formatConfidence(0.956, 1)).toBe('95.6%');
      expect(formatConfidence(0.956, 0)).toBe('96%');
    });
  });

  describe('formatDuration', () => {
    it('formats milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
    });

    it('formats seconds', () => {
      expect(formatDuration(2500)).toBe('2.50s');
    });

    it('formats minutes', () => {
      expect(formatDuration(90000)).toBe('1.50m');
    });

    it('formats hours', () => {
      expect(formatDuration(7200000)).toBe('2.00h');
    });
  });

  describe('formatFileSize', () => {
    it('formats bytes correctly', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1048576)).toBe('1 MB');
    });
  });

  describe('truncateText', () => {
    it('returns original if within limit', () => {
      expect(truncateText('hello', 10)).toBe('hello');
    });

    it('truncates and adds ellipsis', () => {
      expect(truncateText('hello world', 5)).toBe('hello...');
    });
  });
});
