/**
 * Utility functions test suite
 * @module UtilsTests
 */

import {
  hashString,
  isValidFlagKey,
  parseFlagKey,
  createFlagKey,
  matchesTargetingRules,
  getNestedValue,
  debounce,
  throttle,
  exponentialBackoff,
  isValidFlagConfig,
  mergeFlagConfig,
  formatFlagValue,
  getFlagMetadata
} from '../../../migration.disabled/feature-flags/utils';

describe('Feature Flag Utils', () => {
  describe('hashString', () => {
    test('should return consistent hash for same string', () => {
      const str = 'test-user-123';
      const hash1 = hashString(str);
      const hash2 = hashString(str);
      expect(hash1).toBe(hash2);
    });

    test('should return different hashes for different strings', () => {
      const hash1 = hashString('user1');
      const hash2 = hashString('user2');
      expect(hash1).not.toBe(hash2);
    });

    test('should handle empty string', () => {
      const hash = hashString('');
      expect(hash).toBe(0);
    });

    test('should return positive number', () => {
      const hash = hashString('any-string');
      expect(hash).toBeGreaterThanOrEqual(0);
    });
  });

  describe('isValidFlagKey', () => {
    test('should validate correct flag keys', () => {
      expect(isValidFlagKey('migration.upload.enabled')).toBe(true);
      expect(isValidFlagKey('features.bulkUpload')).toBe(true);
      expect(isValidFlagKey('simple')).toBe(true);
    });

    test('should reject invalid flag keys', () => {
      expect(isValidFlagKey('invalid-flag')).toBe(false);
      expect(isValidFlagKey('invalid flag')).toBe(false);
      expect(isValidFlagKey('123.invalid')).toBe(false);
      expect(isValidFlagKey('')).toBe(false);
    });
  });

  describe('parseFlagKey', () => {
    test('should parse namespaced flag key', () => {
      const result = parseFlagKey('migration.upload.enabled');
      expect(result.namespace).toBe('migration.upload');
      expect(result.name).toBe('enabled');
    });

    test('should parse simple flag key', () => {
      const result = parseFlagKey('enabled');
      expect(result.namespace).toBe('');
      expect(result.name).toBe('enabled');
    });

    test('should handle complex namespace', () => {
      const result = parseFlagKey('a.b.c.d.e');
      expect(result.namespace).toBe('a.b.c.d');
      expect(result.name).toBe('e');
    });
  });

  describe('createFlagKey', () => {
    test('should create namespaced flag key', () => {
      const key = createFlagKey('migration.upload', 'enabled');
      expect(key).toBe('migration.upload.enabled');
    });

    test('should create simple flag key', () => {
      const key = createFlagKey('', 'enabled');
      expect(key).toBe('enabled');
    });
  });

  describe('matchesTargetingRules', () => {
    const userContext = {
      userId: 'user123',
      email: 'test@example.com',
      role: 'admin',
      score: 85,
      tags: ['beta', 'premium']
    };

    test('should match equals operator', () => {
      const rules = [{ attribute: 'role', operator: 'equals', value: 'admin' }];
      expect(matchesTargetingRules(userContext, rules)).toBe(true);

      const rules2 = [{ attribute: 'role', operator: 'equals', value: 'user' }];
      expect(matchesTargetingRules(userContext, rules2)).toBe(false);
    });

    test('should match contains operator', () => {
      const rules = [{ attribute: 'email', operator: 'contains', value: 'example' }];
      expect(matchesTargetingRules(userContext, rules)).toBe(true);

      const rules2 = [{ attribute: 'email', operator: 'contains', value: 'gmail' }];
      expect(matchesTargetingRules(userContext, rules2)).toBe(false);
    });

    test('should match in operator', () => {
      const rules = [{ attribute: 'role', operator: 'in', value: ['admin', 'moderator'] }];
      expect(matchesTargetingRules(userContext, rules)).toBe(true);

      const rules2 = [{ attribute: 'role', operator: 'in', value: ['user', 'guest'] }];
      expect(matchesTargetingRules(userContext, rules2)).toBe(false);
    });

    test('should match greaterThan operator', () => {
      const rules = [{ attribute: 'score', operator: 'greaterThan', value: 80 }];
      expect(matchesTargetingRules(userContext, rules)).toBe(true);

      const rules2 = [{ attribute: 'score', operator: 'greaterThan', value: 90 }];
      expect(matchesTargetingRules(userContext, rules2)).toBe(false);
    });

    test('should match lessThan operator', () => {
      const rules = [{ attribute: 'score', operator: 'lessThan', value: 90 }];
      expect(matchesTargetingRules(userContext, rules)).toBe(true);

      const rules2 = [{ attribute: 'score', operator: 'lessThan', value: 80 }];
      expect(matchesTargetingRules(userContext, rules2)).toBe(false);
    });

    test('should match multiple rules (AND logic)', () => {
      const rules = [
        { attribute: 'role', operator: 'equals', value: 'admin' },
        { attribute: 'score', operator: 'greaterThan', value: 80 }
      ];
      expect(matchesTargetingRules(userContext, rules)).toBe(true);
    });

    test('should handle empty rules', () => {
      expect(matchesTargetingRules(userContext, [])).toBe(true);
    });

    test('should handle null userContext', () => {
      const rules = [{ attribute: 'role', operator: 'equals', value: 'admin' }];
      expect(matchesTargetingRules(null, rules)).toBe(false);
    });

    test('should handle unknown operator', () => {
      const rules = [{ attribute: 'role', operator: 'unknown' as any, value: 'admin' }];
      expect(matchesTargetingRules(userContext, rules)).toBe(false);
    });
  });

  describe('getNestedValue', () => {
    const obj = {
      user: {
        profile: {
          name: 'John',
          age: 30
        },
        settings: {
          theme: 'dark'
        }
      }
    };

    test('should get nested value', () => {
      expect(getNestedValue(obj, 'user.profile.name')).toBe('John');
      expect(getNestedValue(obj, 'user.settings.theme')).toBe('dark');
    });

    test('should return undefined for non-existent path', () => {
      expect(getNestedValue(obj, 'user.profile.email')).toBeUndefined();
      expect(getNestedValue(obj, 'nonexistent.path')).toBeUndefined();
    });

    test('should handle simple path', () => {
      expect(getNestedValue({ key: 'value' }, 'key')).toBe('value');
    });

    test('should handle null object', () => {
      expect(getNestedValue(null, 'any.path')).toBeUndefined();
    });
  });

  describe('debounce', () => {
    jest.useFakeTimers();

    test('should debounce function calls', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced('arg1');
      debounced('arg2');
      debounced('arg3');

      expect(fn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('arg3');
    });

    test('should reset timer on each call', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);

      debounced();
      jest.advanceTimersByTime(50);
      debounced();
      jest.advanceTimersByTime(50);
      debounced();

      expect(fn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('throttle', () => {
    jest.useFakeTimers();

    test('should throttle function calls', () => {
      const fn = jest.fn();
      const throttled = throttle(fn, 100);

      throttled('arg1');
      throttled('arg2');
      throttled('arg3');

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('arg1');

      jest.advanceTimersByTime(100);

      throttled('arg4');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenCalledWith('arg4');
    });

    test('should allow calls after throttle period', () => {
      const fn = jest.fn();
      const throttled = throttle(fn, 100);

      throttled();
      expect(fn).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(50);
      throttled();
      expect(fn).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(50);
      throttled();
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('exponentialBackoff', () => {
    test('should calculate exponential backoff', () => {
      const delay0 = exponentialBackoff(0);
      const delay1 = exponentialBackoff(1);
      const delay2 = exponentialBackoff(2);

      expect(delay0).toBeGreaterThanOrEqual(1000);
      expect(delay0).toBeLessThan(1100);

      expect(delay1).toBeGreaterThanOrEqual(2000);
      expect(delay1).toBeLessThan(2200);

      expect(delay2).toBeGreaterThanOrEqual(4000);
      expect(delay2).toBeLessThan(4400);
    });

    test('should respect max delay', () => {
      const delay = exponentialBackoff(100, 1000, 5000);
      expect(delay).toBeGreaterThanOrEqual(5000);
      expect(delay).toBeLessThan(5500);
    });

    test('should add jitter', () => {
      const delays = new Set();
      for (let i = 0; i < 10; i++) {
        delays.add(exponentialBackoff(1));
      }
      // Should have different values due to jitter
      expect(delays.size).toBeGreaterThan(1);
    });
  });

  describe('isValidFlagConfig', () => {
    test('should validate correct config', () => {
      const config = {
        key: 'migration.upload.enabled',
        defaultValue: false,
        description: 'Enable upload migration',
        rolloutPercentage: 50
      };
      expect(isValidFlagConfig(config)).toBe(true);
    });

    test('should validate config with targeting rules', () => {
      const config = {
        key: 'feature.test',
        defaultValue: true,
        targetingRules: [
          { attribute: 'role', operator: 'equals', value: 'admin' }
        ]
      };
      expect(isValidFlagConfig(config)).toBe(true);
    });

    test('should reject invalid config', () => {
      expect(isValidFlagConfig(null)).toBe(false);
      expect(isValidFlagConfig({})).toBe(false);
      expect(isValidFlagConfig({ key: 'invalid-key' })).toBe(false);
      expect(isValidFlagConfig({ key: 'valid.key' })).toBe(false);
      expect(isValidFlagConfig({ key: 'valid.key', defaultValue: undefined })).toBe(false);
    });

    test('should reject invalid targeting rules', () => {
      const config = {
        key: 'valid.key',
        defaultValue: false,
        targetingRules: 'invalid'
      };
      expect(isValidFlagConfig(config)).toBe(false);

      const config2 = {
        key: 'valid.key',
        defaultValue: false,
        targetingRules: [{ invalid: 'rule' }]
      };
      expect(isValidFlagConfig(config2)).toBe(false);
    });
  });

  describe('mergeFlagConfig', () => {
    test('should merge configurations', () => {
      const defaults = {
        key: 'test.flag',
        defaultValue: false,
        circuitBreakerEnabled: true
      };

      const config = {
        defaultValue: true,
        description: 'Test flag'
      };

      const merged = mergeFlagConfig(config, defaults);
      expect(merged.key).toBe('test.flag');
      expect(merged.defaultValue).toBe(true);
      expect(merged.description).toBe('Test flag');
      expect(merged.circuitBreakerEnabled).toBe(true);
    });

    test('should handle targetingRules', () => {
      const defaults = {
        key: 'test',
        defaultValue: false,
        targetingRules: [{ attribute: 'role', operator: 'equals', value: 'user' }]
      };

      const config = {
        targetingRules: [{ attribute: 'role', operator: 'equals', value: 'admin' }]
      };

      const merged = mergeFlagConfig(config, defaults);
      expect(merged.targetingRules).toEqual(config.targetingRules);
    });

    test('should default circuitBreakerEnabled to false', () => {
      const merged = mergeFlagConfig({}, {});
      expect(merged.circuitBreakerEnabled).toBe(false);
    });
  });

  describe('formatFlagValue', () => {
    test('should format boolean values', () => {
      expect(formatFlagValue(true)).toBe('Enabled');
      expect(formatFlagValue(false)).toBe('Disabled');
    });

    test('should format number values', () => {
      expect(formatFlagValue(50)).toBe('50%');
      expect(formatFlagValue(100)).toBe('100%');
      expect(formatFlagValue(0)).toBe('0%');
    });

    test('should format other values as string', () => {
      expect(formatFlagValue('custom')).toBe('custom');
      expect(formatFlagValue(null)).toBe('null');
      expect(formatFlagValue(undefined)).toBe('undefined');
      expect(formatFlagValue({ obj: 'value' })).toBe('[object Object]');
    });
  });

  describe('getFlagMetadata', () => {
    test('should extract metadata from migration flag', () => {
      const metadata = getFlagMetadata('migration.upload.enabled');
      expect(metadata.category).toBe('migration.upload');
      expect(metadata.name).toBe('enabled');
      expect(metadata.isCritical).toBe(true);
      expect(metadata.isRollout).toBe(false);
    });

    test('should identify rollout flags', () => {
      const metadata = getFlagMetadata('migration.upload.rollout');
      expect(metadata.name).toBe('rollout');
      expect(metadata.isRollout).toBe(true);
    });

    test('should identify non-critical flags', () => {
      const metadata = getFlagMetadata('features.test.enabled');
      expect(metadata.category).toBe('features.test');
      expect(metadata.isCritical).toBe(false);
    });

    test('should handle simple flags', () => {
      const metadata = getFlagMetadata('enabled');
      expect(metadata.category).toBe('general');
      expect(metadata.name).toBe('enabled');
      expect(metadata.isCritical).toBe(false);
      expect(metadata.isRollout).toBe(false);
    });
  });
});