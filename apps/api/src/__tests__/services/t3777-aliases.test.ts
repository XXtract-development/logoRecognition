/**
 * T3777 alias/normalisation tests — Story 12.8 (AC3).
 *
 * Covers: the two known divergent families (MSC ↔ MSC_LABEL, Rainforest old/new
 * → RAINFOREST_ALLIANCE), identity pass-through for unknown codes (so the caller
 * still emits UNSUPPORTED — never silently skipped), trim/uppercase, and
 * canonical de-duplication when two declared codes alias to the same class.
 */

import { describe, it, expect } from 'vitest';
import {
  aliasT3777Code,
  aliasDeclaredCodes,
  T3777_ALIASES,
} from '../../services/t3777-aliases';

describe('Story 12.8 — T3777 alias/normalisation (AC3)', () => {
  describe('aliasT3777Code', () => {
    it('maps MARINE_STEWARDSHIP_COUNCIL to the _LABEL reference class', () => {
      expect(aliasT3777Code('MARINE_STEWARDSHIP_COUNCIL')).toBe(
        'MARINE_STEWARDSHIP_COUNCIL_LABEL'
      );
    });

    it('maps the new Rainforest "People & Nature" code to RAINFOREST_ALLIANCE', () => {
      expect(aliasT3777Code('RAINFOREST_ALLIANCE_PEOPLE_NATURE')).toBe(
        'RAINFOREST_ALLIANCE'
      );
    });

    it('leaves the legacy RAINFOREST_ALLIANCE code unchanged (identity)', () => {
      expect(aliasT3777Code('RAINFOREST_ALLIANCE')).toBe('RAINFOREST_ALLIANCE');
    });

    it('returns an unknown code UNCHANGED so the caller emits UNSUPPORTED, never silently skips', () => {
      expect(aliasT3777Code('TOTALLY_UNKNOWN_CODE')).toBe('TOTALLY_UNKNOWN_CODE');
    });

    it('trims and uppercases before mapping', () => {
      expect(aliasT3777Code('  marine_stewardship_council  ')).toBe(
        'MARINE_STEWARDSHIP_COUNCIL_LABEL'
      );
      expect(aliasT3777Code('green_dot')).toBe('GREEN_DOT');
    });

    it('never returns empty for a non-empty input', () => {
      expect(aliasT3777Code('X').length).toBeGreaterThan(0);
    });
  });

  describe('aliasDeclaredCodes', () => {
    it('records which alias was applied (or null for identity)', () => {
      const out = aliasDeclaredCodes(['MARINE_STEWARDSHIP_COUNCIL', 'GREEN_DOT']);
      expect(out).toEqual([
        {
          declared: 'MARINE_STEWARDSHIP_COUNCIL',
          canonical: 'MARINE_STEWARDSHIP_COUNCIL_LABEL',
          alias: 'MARINE_STEWARDSHIP_COUNCIL_LABEL',
        },
        { declared: 'GREEN_DOT', canonical: 'GREEN_DOT', alias: null },
      ]);
    });

    it('de-duplicates on the CANONICAL code (old + new Rainforest collapse to one target)', () => {
      const out = aliasDeclaredCodes([
        'RAINFOREST_ALLIANCE',
        'RAINFOREST_ALLIANCE_PEOPLE_NATURE',
      ]);
      expect(out).toHaveLength(1);
      expect(out[0].canonical).toBe('RAINFOREST_ALLIANCE');
    });

    it('skips empty/whitespace entries and uppercases', () => {
      const out = aliasDeclaredCodes(['  ', 'green_dot', '']);
      expect(out).toEqual([{ declared: 'GREEN_DOT', canonical: 'GREEN_DOT', alias: null }]);
    });

    it('preserves first-appearance order', () => {
      const out = aliasDeclaredCodes(['B_CODE', 'A_CODE']);
      expect(out.map((o) => o.canonical)).toEqual(['B_CODE', 'A_CODE']);
    });
  });

  describe('alias table integrity', () => {
    it('is frozen (data-only, no accidental mutation at runtime)', () => {
      expect(Object.isFrozen(T3777_ALIASES)).toBe(true);
    });

    it('contains the two required divergent families (AC3 minimum)', () => {
      expect(T3777_ALIASES.MARINE_STEWARDSHIP_COUNCIL).toBe(
        'MARINE_STEWARDSHIP_COUNCIL_LABEL'
      );
      expect(T3777_ALIASES.RAINFOREST_ALLIANCE_PEOPLE_NATURE).toBe('RAINFOREST_ALLIANCE');
    });
  });
});
