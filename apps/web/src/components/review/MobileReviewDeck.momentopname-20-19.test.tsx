/**
 * Story 20.19 (AC6) — de zesde plek waar de reden `uit-momentopname` landt, en de
 * enige buiten `apps/api`.
 *
 * De deck poortte op `reason === 'ok'`. Met de nieuwe reden zou `has` dus false
 * blijven en toont het scherm NIETS: de 238 producten van deze story komen wél in
 * de wachtrij, maar zonder de declaratie waarvoor ze bestaan. Deze toetsen pinnen
 * dat vast, plus de herkomst-aanduiding — de beoordelaar hoort te weten dat hij naar
 * bevroren gegevens kijkt en niet naar de actuele catalogus.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

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
      let s = (opts as { defaultValue: string }).defaultValue;
      for (const [k, v] of Object.entries(opts as Record<string, unknown>)) {
        if (k !== 'defaultValue') s = s.replace(`{{${k}}}`, String(v));
      }
      return s;
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
  acceptReviewItem,
  fetchReviewItemCropBlob,
  fetchReviewItemArtworkBlob,
  fetchReviewItemSourceBlob,
  fetchDeclaredMarks,
  fetchNominationEnabled,
  type ArtworkReviewItem,
} from '@/services/artworkReviewService';

const item: ArtworkReviewItem = {
  id: 'ri-momentopname-1',
  gtin: '07611480011566',
  t3777Code: 'GREEN_DOT',
  cropPath: 'artwork-crops/07611480011566/a.png',
  bbox: { x: 0, y: 0, width: 40, height: 40 },
  confidence: 0.71,
  method: 'embedding',
  reason: '20.19 momentopname',
  sourceFile: 'a.jpg',
  status: 'open',
  createdAt: '2026-08-19T00:00:00Z',
  updatedAt: '2026-08-19T00:00:00Z',
};

const marks = [{ code: 'GREEN_DOT', fieldType: 'PackagingMarkedLabelAccreditationCode' }];

beforeEach(() => {
  vi.clearAllMocks();
  (acceptReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'registered' });
  (fetchReviewItemCropBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (fetchReviewItemArtworkBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (fetchReviewItemSourceBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (fetchNominationEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(false);
});

describe('Story 20.19 (AC6) — de deck accepteert `uit-momentopname`', () => {
  it('toont de declaratie ook als hij uit de momentopname komt', async () => {
    (fetchDeclaredMarks as ReturnType<typeof vi.fn>).mockResolvedValue({
      gtin: item.gtin,
      marks,
      reason: 'uit-momentopname',
      snapshotHarvestedAt: '2026-08-19',
    });

    render(<MobileReviewDeck items={[item]} canMutate />);

    // Zonder de verbrede poort blijft deze regel weg en ziet de beoordelaar niets.
    expect(await screen.findByTestId('deck-prior')).toBeInTheDocument();
    expect(screen.getByText('✓ gedeclareerd op verpakking')).toBeInTheDocument();
  });

  it('zegt erbij dat het om een momentopname gaat, met de oogstdatum', async () => {
    (fetchDeclaredMarks as ReturnType<typeof vi.fn>).mockResolvedValue({
      gtin: item.gtin,
      marks,
      reason: 'uit-momentopname',
      snapshotHarvestedAt: '2026-08-19',
    });

    render(<MobileReviewDeck items={[item]} canMutate />);

    expect(await screen.findByText('uit momentopname van 2026-08-19')).toBeInTheDocument();
  });

  it('zet die aanduiding NIET bij een gewone declaratie uit de catalogus', async () => {
    (fetchDeclaredMarks as ReturnType<typeof vi.fn>).mockResolvedValue({
      gtin: item.gtin,
      marks,
      reason: 'ok',
    });

    render(<MobileReviewDeck items={[item]} canMutate />);

    expect(await screen.findByTestId('deck-prior')).toBeInTheDocument();
    expect(screen.queryByText(/uit momentopname van/)).not.toBeInTheDocument();
  });

  it('toont niets bij een lege declaratie, ook al komt die uit de momentopname', async () => {
    // `lege-declaratie` betekent "gemeten, declareert niets". Dat is geen prior en
    // hoort dus geen groen vinkje te krijgen.
    (fetchDeclaredMarks as ReturnType<typeof vi.fn>).mockResolvedValue({
      gtin: item.gtin,
      marks: [],
      reason: 'lege-declaratie',
      snapshotHarvestedAt: '2026-08-19',
    });

    render(<MobileReviewDeck items={[item]} canMutate />);

    await screen.findByTestId('deck-relabel-open');
    expect(screen.queryByTestId('deck-prior')).not.toBeInTheDocument();
  });
});
