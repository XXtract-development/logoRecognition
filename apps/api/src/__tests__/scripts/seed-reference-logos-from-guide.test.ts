import { describe, it, expect } from 'vitest';
// Pure helpers only — importing the module does NOT run main() (require.main guard),
// so the in-container /app/dist requires are never triggered here.
import {
  deriveVariantLabel,
  buildStoragePath,
} from '../../../scripts/seed-reference-logos-from-guide.js';

describe('seed-reference-logos-from-guide helpers (Story 12.1 Task 2)', () => {
  it('first image of a code gets the canonical gs1-guide variant label', () => {
    expect(deriveVariantLabel(0)).toBe('gs1-guide');
  });

  it('additional images become numbered variants (no unique collision)', () => {
    expect(deriveVariantLabel(1)).toBe('gs1-guide-1');
    expect(deriveVariantLabel(2)).toBe('gs1-guide-2');
  });

  it('storage path follows the 7.3 contract reference-logos/{code}/{variant}.png', () => {
    expect(buildStoragePath('RECYCLABLE_GENERAL_CLAIM', 'gs1-guide')).toBe(
      'reference-logos/RECYCLABLE_GENERAL_CLAIM/gs1-guide.png'
    );
    expect(buildStoragePath('TRIMAN', 'gs1-guide-1')).toBe(
      'reference-logos/TRIMAN/gs1-guide-1.png'
    );
  });
});
