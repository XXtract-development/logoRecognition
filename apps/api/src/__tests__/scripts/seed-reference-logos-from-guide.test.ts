import { describe, it, expect, vi } from 'vitest';
// Pure helpers only — importing the module does NOT run main() (require.main guard),
// so the in-container /app/dist requires are never triggered here.
import {
  deriveVariantLabel,
  buildStoragePath,
  seedGuideEntry,
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

import fs from 'fs';
import sharp from 'sharp';
import { assertReferenceContent } from '../../services/reference-content';
it('guide seed rejects blank bytes before storage or upsert', async () => {
  const bytes = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'white' } }).png().toBuffer();
  const read = vi.spyOn(fs, 'readFileSync').mockReturnValue(bytes);
  const upload = vi.fn();
  const db = { referenceLogo: { upsert: vi.fn() } };
  try {
    await expect(seedGuideEntry({ code: 'A', variant: 0, file: 'a.png' }, '/tmp/unit', db, upload, assertReferenceContent)).rejects.toThrow(/centrale beeldinhoud/);
    expect(upload).not.toHaveBeenCalled();
    expect(db.referenceLogo.upsert).not.toHaveBeenCalled();
  } finally { read.mockRestore(); }
});
it('guide seed validates and uploads the exact same sparse artwork bytes', async () => {
  const bytes = await sharp(Buffer.from('<svg width="32" height="32"><path stroke="black" d="M16 8V24"/></svg>')).png().toBuffer();
  const read = vi.spyOn(fs, 'readFileSync').mockReturnValue(bytes);
  const upload = vi.fn();
  const db = { referenceLogo: { upsert: vi.fn() } };
  try {
    await seedGuideEntry({ code: 'A', variant: 0, file: 'a.png' }, '/tmp/unit', db, upload, assertReferenceContent);
    expect(upload).toHaveBeenCalledWith(bytes, 'reference-logos/A/gs1-guide.png', 'image/png');
    expect(db.referenceLogo.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ active: true }) }));
  } finally { read.mockRestore(); }
});
