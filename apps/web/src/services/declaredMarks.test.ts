/**
 * Story 12.18 — canonicalDeclaredCode: map a declared GS1 mark to the t3777 code
 * used by review items, so the label-prior comparison matches for Nutri-Score.
 */
import { describe, it, expect } from 'vitest';
import { canonicalDeclaredCode, type DeclaredMarkLike } from './declaredMarks';

const mark = (code: string, fieldType: string): DeclaredMarkLike => ({ code, fieldType });

describe('canonicalDeclaredCode', () => {
  it('mapt een kale Nutri-Score-letter naar de volledige NUTRISCORE_-code', () => {
    expect(canonicalDeclaredCode(mark('A', 'NutritionalScore'))).toBe('NUTRISCORE_A');
    expect(canonicalDeclaredCode(mark('D', 'NutritionalScore'))).toBe('NUTRISCORE_D');
    expect(canonicalDeclaredCode(mark('E', 'NutritionalScore'))).toBe('NUTRISCORE_E');
  });

  it('laat categorie-codes onder dezelfde fieldType met rust (leak-guard)', () => {
    expect(canonicalDeclaredCode(mark('GENERAL_FOODS', 'NutritionalScore'))).toBe('GENERAL_FOODS');
    expect(canonicalDeclaredCode(mark('CHEESES', 'NutritionalScore'))).toBe('CHEESES');
  });

  it('normaliseert alleen enkele letters A–E, niet andere strings', () => {
    expect(canonicalDeclaredCode(mark('F', 'NutritionalScore'))).toBe('F');
    expect(canonicalDeclaredCode(mark('AB', 'NutritionalScore'))).toBe('AB');
    expect(canonicalDeclaredCode(mark('a', 'NutritionalScore'))).toBe('a');
  });

  it('raakt marks van een ander fieldType niet aan', () => {
    expect(canonicalDeclaredCode(mark('D', 'DietTypeCode'))).toBe('D');
    expect(canonicalDeclaredCode(mark('EU_ORGANIC_FARMING', 'T3777'))).toBe('EU_ORGANIC_FARMING');
  });
});
