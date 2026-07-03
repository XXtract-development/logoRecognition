/**
 * Story 14.1 — reviewstation reject reason-choice (web).
 *
 * Dekt de web-AC's:
 *   - de redenkeuze bij reject verschijnt ALLEEN met de vliegwiel-vlag aan;
 *   - "geen keurmerk" stuurt reason='geen-keurmerk' naar rejectReviewItem;
 *   - "onjuiste locatie/verkeerde code" stuurt die reden;
 *   - met de vlag UIT gaat reject byte-gelijk als vandaag (geen modal, geen reden).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock the review service (the deck imports these named exports directly).
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

// Stable i18n mock honouring { defaultValue }.
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
  rejectReviewItem,
  reopenReviewItem,
  acceptReviewItem,
  annotateReviewItem,
  fetchReviewItemCropBlob,
  fetchReviewItemArtworkBlob,
  fetchReviewItemSourceBlob,
  fetchDeclaredMarks,
  fetchNominationEnabled,
  type ArtworkReviewItem,
} from '@/services/artworkReviewService';

const item: ArtworkReviewItem = {
  id: 'ri-1',
  gtin: '08718989912451',
  t3777Code: 'EU_ORGANIC_FARMING',
  cropPath: 'crops/a.png',
  bbox: { x: 0, y: 0, width: 10, height: 10 },
  confidence: 0.5,
  method: 'template',
  reason: 'onder drempel',
  sourceFile: 'a.jpg',
  status: 'open',
  createdAt: '2026-07-03T00:00:00Z',
  updatedAt: '2026-07-03T00:00:00Z',
};

describe('Story 14.1 — MobileReviewDeck reject reason-choice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (rejectReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'rejected' });
    (reopenReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'open' });
    (acceptReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'registered' });
    (annotateReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'registered' });
    (fetchReviewItemCropBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (fetchReviewItemArtworkBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (fetchReviewItemSourceBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (fetchDeclaredMarks as ReturnType<typeof vi.fn>).mockResolvedValue({ gtin: 'g', marks: [], reason: 'ok' });
  });

  it('vlag AAN: reject opent de redenkeuze en stuurt "geen-keurmerk" mee', async () => {
    (fetchNominationEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const user = userEvent.setup();
    render(<MobileReviewDeck items={[item]} canMutate />);

    await waitFor(() => expect(fetchNominationEnabled).toHaveBeenCalled());

    await user.click(screen.getByTestId('deck-reject'));
    // De redenkeuze verschijnt (alleen met de vlag aan).
    const geen = await screen.findByTestId('reject-reason-geen-keurmerk');
    await user.click(geen);

    await waitFor(() =>
      expect(rejectReviewItem).toHaveBeenCalledWith('ri-1', 'geen-keurmerk')
    );
  });

  it('vlag AAN: "onjuiste locatie/verkeerde code" stuurt die reden mee', async () => {
    (fetchNominationEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const user = userEvent.setup();
    render(<MobileReviewDeck items={[item]} canMutate />);
    await waitFor(() => expect(fetchNominationEnabled).toHaveBeenCalled());

    await user.click(screen.getByTestId('deck-reject'));
    await user.click(await screen.findByTestId('reject-reason-onjuiste-locatie'));

    await waitFor(() =>
      expect(rejectReviewItem).toHaveBeenCalledWith('ri-1', 'onjuiste-locatie-verkeerde-code')
    );
  });

  it('vlag UIT: reject is byte-gelijk legacy — geen redenkeuze, geen reden meegestuurd', async () => {
    (fetchNominationEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const user = userEvent.setup();
    render(<MobileReviewDeck items={[item]} canMutate />);
    await waitFor(() => expect(fetchNominationEnabled).toHaveBeenCalled());

    await user.click(screen.getByTestId('deck-reject'));

    // Geen modal, en de reject wordt direct (zonder reden) verstuurd.
    await waitFor(() => expect(rejectReviewItem).toHaveBeenCalled());
    // Legacy-aanroep: exact één argument (het id), geen reden.
    expect((rejectReviewItem as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual(['ri-1']);
    expect(screen.queryByTestId('reject-reason-modal')).toBeNull();
  });
});
