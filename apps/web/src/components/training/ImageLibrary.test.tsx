import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Stable i18n mock (string + { defaultValue } forms).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: unknown) => {
      if (typeof opts === 'string') return opts;
      if (opts && typeof opts === 'object' && 'defaultValue' in opts) {
        return (opts as { defaultValue: string }).defaultValue;
      }
      return key;
    },
    i18n: { language: 'nl' },
  }),
}));

vi.mock('@/services/trainingService', () => ({
  setImageHoldout: vi.fn(),
}));

import { ImageLibrary } from './ImageLibrary';
import type { TrainingImage } from '@/types/training.types';

/** Build a library image with overridable fields. */
function makeImage(overrides: Partial<TrainingImage> & { id: string }): TrainingImage {
  return {
    filename: 'f.png',
    originalName: 'original.png',
    url: 'u',
    thumbnailUrl: 't',
    size: 1024,
    width: 10,
    height: 10,
    format: 'png',
    uploadedAt: new Date('2026-01-01T00:00:00Z'),
    annotationStatus: 'none',
    annotationCount: 0,
    ...overrides,
  } as TrainingImage;
}

describe('ImageLibrary date/size hardening (Story 8.6)', () => {
  it('never renders "Invalid Date" or "NaN" for a card missing uploadedAt/size', () => {
    // Simulate raw API rows: createdAt present, uploadedAt/size absent.
    const image = makeImage({
      id: 'img-1',
      uploadedAt: undefined as unknown as Date,
      size: undefined as unknown as number,
      createdAt: '2026-02-03T10:00:00Z',
    });

    render(<ImageLibrary images={[image]} />);

    expect(document.body.textContent).not.toContain('Invalid Date');
    expect(document.body.textContent).not.toContain('NaN');
    // The createdAt fallback produces a real, locale-formatted date.
    expect(screen.getAllByTestId('image-card').length).toBeGreaterThan(0);
  });

  it('falls back to a dash when both date fields are absent', () => {
    const image = makeImage({
      id: 'img-2',
      uploadedAt: undefined as unknown as Date,
      createdAt: undefined,
      size: NaN,
    });

    render(<ImageLibrary images={[image]} />);

    expect(document.body.textContent).not.toContain('Invalid Date');
    expect(document.body.textContent).not.toContain('NaN');
  });
});
