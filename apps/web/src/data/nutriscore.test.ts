/**
 * Story 12.20 — isLetterlessNutriscore recognises the letter-independent
 * Nutri-Score placeholder ('NUTRISCORE') that the shape harvest assigns.
 */
import { describe, it, expect } from 'vitest';
import { isLetterlessNutriscore, LETTERLESS_NUTRISCORE } from './nutriscore';

describe('isLetterlessNutriscore', () => {
  it('is true alleen voor de kale placeholder', () => {
    expect(isLetterlessNutriscore('NUTRISCORE')).toBe(true);
    expect(isLetterlessNutriscore(LETTERLESS_NUTRISCORE)).toBe(true);
  });

  it('is false voor echte letter-codes en andere keurmerken', () => {
    expect(isLetterlessNutriscore('NUTRISCORE_A')).toBe(false);
    expect(isLetterlessNutriscore('NUTRISCORE_D')).toBe(false);
    expect(isLetterlessNutriscore('EU_ORGANIC_FARMING')).toBe(false);
  });

  it('is false voor leeg/null/undefined', () => {
    expect(isLetterlessNutriscore('')).toBe(false);
    expect(isLetterlessNutriscore(null)).toBe(false);
    expect(isLetterlessNutriscore(undefined)).toBe(false);
  });
});
