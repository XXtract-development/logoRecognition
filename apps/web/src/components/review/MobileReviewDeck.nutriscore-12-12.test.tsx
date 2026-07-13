/**
 * Story 12.12 — Nutri-Score vorm-oogst: de mens moet de exacte letter
 * (NUTRISCORE_A..E) kunnen kiezen/bevestigen via de bestaande relabel-picker
 * (Story 12.7) wanneer een vorm-geharveste kandidaat in de wachtrij staat
 * (AC2). Dit dekt de "verifieer/borg" van Task 2/3: de picker bevat al de
 * volledige KEURMERK_CODES-universe (incl. de 5 Nutri-Score-codes,
 * keurmerk-codes.ts), dus dit bewijst dat gedrag met een echte render + klik
 * i.p.v. het alleen op de databron te vertrouwen.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

// A vorm-geharveste kandidaat (Story 12.12): provisionele code, geen letter
// nog bevestigd. De t3777Code hier is bewust de NUTRISCORE-placeholder (grove
// kleur-gok onduidelijk) — precies het geval waarin de mens de letter MOET
// kiezen via de picker.
const harvestedItem: ArtworkReviewItem = {
  id: 'ri-nutriscore-1',
  gtin: '08718989912451',
  t3777Code: 'NUTRISCORE',
  cropPath: 'artwork-crops/08718989912451/12_12_a.png',
  bbox: { x: 0, y: 0, width: 40, height: 40 },
  confidence: 0.62,
  method: 'embedding-shape',
  reason: '12.12 nutriscore-vorm-oogst (letter-onafhankelijk)',
  sourceFile: 'a.jpg',
  status: 'open',
  createdAt: '2026-07-13T00:00:00Z',
  updatedAt: '2026-07-13T00:00:00Z',
};

describe('Story 12.12 — relabel-picker biedt de 5 Nutri-Score-letters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (acceptReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'registered' });
    (fetchReviewItemCropBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (fetchReviewItemArtworkBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (fetchReviewItemSourceBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (fetchDeclaredMarks as ReturnType<typeof vi.fn>).mockResolvedValue({ gtin: 'g', marks: [], reason: 'ok' });
    (fetchNominationEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(false);
  });

  it('zoeken op "nutriscore" toont alle 5 letters (A t/m E)', async () => {
    const user = userEvent.setup();
    render(<MobileReviewDeck items={[harvestedItem]} canMutate />);

    await user.click(screen.getByTestId('deck-relabel-open'));
    const search = await screen.findByPlaceholderText('Zoek keurmerk…');
    await user.type(search, 'NUTRISCORE_');

    for (const letter of ['A', 'B', 'C', 'D', 'E']) {
      expect(await screen.findByText(`NUTRISCORE_${letter}`)).toBeInTheDocument();
    }
  });

  it('kiezen van NUTRISCORE_C stuurt de accept met exact die letter mee', async () => {
    const user = userEvent.setup();
    render(<MobileReviewDeck items={[harvestedItem]} canMutate />);

    await user.click(screen.getByTestId('deck-relabel-open'));
    const search = await screen.findByPlaceholderText('Zoek keurmerk…');
    await user.type(search, 'NUTRISCORE_C');

    const option = await screen.findByText('NUTRISCORE_C');
    await user.click(option);

    await waitFor(() =>
      expect(acceptReviewItem).toHaveBeenCalledWith('ri-nutriscore-1', 'NUTRISCORE_C')
    );
  });

  it('kiezen van elke andere letter (A, B, D, E) werkt evengoed', async () => {
    // Vier losse geharveste kandidaten in de wachtrij — na elke relabel schuift
    // de deck automatisch door naar de volgende (bestaand deck-gedrag), zodat
    // dit ELKE letter op een verse, ongedecideerde kaart test.
    const items = ['A', 'B', 'D', 'E'].map((letter) => ({
      ...harvestedItem,
      id: `ri-nutriscore-${letter}`,
    }));
    const user = userEvent.setup();
    render(<MobileReviewDeck items={items} canMutate />);

    for (const letter of ['A', 'B', 'D', 'E']) {
      await user.click(screen.getByTestId('deck-relabel-open'));
      const search = await screen.findByPlaceholderText('Zoek keurmerk…');
      await user.clear(search);
      await user.type(search, `NUTRISCORE_${letter}`);
      const option = await screen.findByText(`NUTRISCORE_${letter}`);
      await user.click(option);
    }

    await waitFor(() =>
      expect(acceptReviewItem).toHaveBeenCalledTimes(4)
    );
    const calledCodes = (acceptReviewItem as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1]);
    expect(calledCodes).toEqual(['NUTRISCORE_A', 'NUTRISCORE_B', 'NUTRISCORE_D', 'NUTRISCORE_E']);
  });
});
