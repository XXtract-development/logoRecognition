/**
 * Story 16.3 — NFR-6-pad-guard (bronrestrictie).
 *
 * AC→test-mapping (zie ac-trace-16-3.md):
 *   AC2 → dit bestand: de guard weigert elk `reference-logos/`-gidspad (ook met
 *         leidende ./ of /), logt aantoonbaar een waarschuwing en laat eigen
 *         crop-paden ongewijzigd door.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub-logger zodat de gelogde waarschuwing aantoonbaar is (NFR-6-guard-eis).
// `vi.hoisted` zodat de spy vóór de gehoiste vi.mock-factory bestaat.
const { warnSpy } = vi.hoisted(() => ({ warnSpy: vi.fn() }));
vi.mock('../../core/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: warnSpy,
    error: vi.fn(),
    debug: vi.fn(),
  }),
  logger: { info: vi.fn(), warn: warnSpy, error: vi.fn(), debug: vi.fn() },
  default: { info: vi.fn(), warn: warnSpy, error: vi.fn(), debug: vi.fn() },
}));

import {
  isReferenceLogoPath,
  sanitizeSourcePath,
  REFERENCE_LOGO_PREFIX,
} from '../../services/flywheel/reference-path-guard';

describe('Story 16.3 AC2 — isReferenceLogoPath', () => {
  it('herkent een kaal gidspad', () => {
    expect(isReferenceLogoPath('reference-logos/E-1/variant.png')).toBe(true);
  });

  it('herkent een gidspad met leidende ./', () => {
    expect(isReferenceLogoPath('./reference-logos/E-1/variant.png')).toBe(true);
  });

  it('herkent een gidspad met leidende /', () => {
    expect(isReferenceLogoPath('/reference-logos/E-1/variant.png')).toBe(true);
  });

  it('laat een eigen crop-pad passeren (geen gidspad)', () => {
    expect(isReferenceLogoPath('artwork-crops/08710400012345/crop_1.png')).toBe(false);
  });

  it('null/undefined/leeg zijn geen gidspad', () => {
    expect(isReferenceLogoPath(null)).toBe(false);
    expect(isReferenceLogoPath(undefined)).toBe(false);
    expect(isReferenceLogoPath('')).toBe(false);
  });

  it('een pad dat het prefix bevat maar niet begint is geen gidspad', () => {
    expect(isReferenceLogoPath('artwork-crops/reference-logos-lookalike/x.png')).toBe(false);
  });

  it('prefix-constante is byte-gelijk aan het opslag-contract', () => {
    expect(REFERENCE_LOGO_PREFIX).toBe('reference-logos/');
  });
});

describe('Story 16.3 AC2 — sanitizeSourcePath (guard + gelogde waarschuwing)', () => {
  beforeEach(() => {
    warnSpy.mockClear();
  });

  it('weigert een gidspad → null én logt een waarschuwing', () => {
    const result = sanitizeSourcePath('reference-logos/E-1/variant.png', { gtin: '123' });
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('NFR-6-guard');
  });

  it('laat een eigen crop-pad ongewijzigd door, zonder waarschuwing', () => {
    const own = 'artwork-crops/08710400012345/';
    expect(sanitizeSourcePath(own)).toBe(own);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('null blijft null (geen waarschuwing)', () => {
    expect(sanitizeSourcePath(null)).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
