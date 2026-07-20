/**
 * Story 20.8 — de voorbeeld-logo-rij is ALTIJD aanwezig voor een echte code
 * (het endpoint valt terug op een GS1-gids-voorbeeld); pas als óók dat 404't
 * toont de rij een placeholder i.p.v. te verdwijnen.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/services/artworkReviewService', () => ({
  acceptReviewItem: vi.fn(),
  rejectReviewItem: vi.fn(),
  reopenReviewItem: vi.fn(),
  annotateReviewItem: vi.fn(),
  fetchReviewItemCropBlob: vi.fn(),
  fetchReviewItemArtworkBlob: vi.fn(),
  fetchReviewItemSourceBlob: vi.fn(),
  fetchDeclaredMarks: vi.fn(),
  fetchNominationEnabled: vi.fn(),
}));

const { stableT, stableI18n } = vi.hoisted(() => ({
  stableT: (key: string, opts?: unknown) => {
    if (typeof opts === 'string') return opts;
    if (opts && typeof opts === 'object' && 'defaultValue' in opts) {
      return (opts as { defaultValue: string }).defaultValue;
    }
    return key;
  },
  stableI18n: { language: 'nl', changeLanguage: () => {} },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: stableT, i18n: stableI18n }),
}));

import MobileReviewDeck from './MobileReviewDeck';
import {
  fetchReviewItemCropBlob,
  fetchReviewItemArtworkBlob,
  fetchReviewItemSourceBlob,
  fetchDeclaredMarks,
  fetchNominationEnabled,
  type ArtworkReviewItem,
} from '@/services/artworkReviewService';

const item: ArtworkReviewItem = {
  id: 'ri-ref-1',
  gtin: '05099514003114',
  t3777Code: 'SOCIETY_PLASTICS_INDUSTRY',
  cropPath: 'artwork-crops/x/y.png',
  bbox: { x: 0, y: 0, width: 40, height: 40 },
  confidence: 0.9,
  method: 'embedding',
  reason: 'Verwacht maar niet gevonden',
  sourceFile: 'a.jpg',
  status: 'open',
  createdAt: '2026-07-20T00:00:00Z',
  updatedAt: '2026-07-20T00:00:00Z',
};

describe('Story 20.8 — voorbeeld-rij altijd aanwezig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (fetchReviewItemCropBlob as ReturnType<typeof vi.fn>).mockResolvedValue('blob:crop');
    (fetchReviewItemArtworkBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (fetchReviewItemSourceBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (fetchDeclaredMarks as ReturnType<typeof vi.fn>).mockResolvedValue({ gtin: 'g', marks: [], reason: 'ok' });
    (fetchNominationEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(false);
  });

  it('rendert de voorbeeld-rij + het voorbeeldbeeld voor een echte code', async () => {
    render(<MobileReviewDeck items={[item]} canMutate />);
    expect(await screen.findByTestId('deck-reference-row')).toBeInTheDocument();
    const img = screen.getByTestId('deck-reference') as HTMLImageElement;
    expect(img.getAttribute('src')).toContain(
      '/reference-logos/code/SOCIETY_PLASTICS_INDUSTRY/image',
    );
    expect(screen.queryByTestId('deck-reference-placeholder')).not.toBeInTheDocument();
  });

  it('toont een placeholder (rij blijft) wanneer het voorbeeldbeeld 404t', async () => {
    render(<MobileReviewDeck items={[item]} canMutate />);
    const img = await screen.findByTestId('deck-reference');
    fireEvent.error(img); // endpoint gaf 404 -> onError
    // de rij verdwijnt NIET; er verschijnt een placeholder met uitleg
    expect(screen.getByTestId('deck-reference-row')).toBeInTheDocument();
    expect(screen.getByTestId('deck-reference-placeholder')).toBeInTheDocument();
    expect(screen.getByText(/Geen voorbeeld beschikbaar/i)).toBeInTheDocument();
    expect(screen.queryByTestId('deck-reference')).not.toBeInTheDocument();
  });
});
