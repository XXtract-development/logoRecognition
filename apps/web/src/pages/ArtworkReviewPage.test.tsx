import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// Mock the review service before importing the page.
vi.mock('@/services/artworkReviewService', () => ({
  fetchReviewQueue: vi.fn(),
  fetchUncertainPredictions: vi.fn(),
  fetchReviewItemCropUrl: vi.fn(),
  fetchReviewItemCropBlob: vi.fn(),
  fetchReviewItemArtworkBlob: vi.fn(),
  fetchReviewItemSourceBlob: vi.fn(),
  fetchDeclaredMarks: vi.fn(),
  reopenReviewItem: vi.fn(),
  acceptReviewItem: vi.fn(),
  rejectReviewItem: vi.fn(),
  annotateReviewItem: vi.fn(),
  processAcceptedReviewItems: vi.fn(),
  // Story 14.1 — the deck reads the flywheel flag on mount; default off so the
  // page tests keep their legacy behaviour (no reason-choice modal).
  fetchNominationEnabled: vi.fn(() => Promise.resolve(false)),
}));

// Mock the current-user hook so we can toggle ADMIN.
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: vi.fn(),
}));

// i18n mock that honours both string fallbacks and { defaultValue } options.
// `t` and `i18n` are stable references (like real i18next) so hooks that depend
// on `t` (e.g. the load callback) are not re-created every render.
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
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import ArtworkReviewPage from './ArtworkReviewPage';
import {
  fetchReviewQueue,
  fetchUncertainPredictions,
  fetchReviewItemCropBlob,
  fetchReviewItemArtworkBlob,
  fetchDeclaredMarks,
  acceptReviewItem,
  rejectReviewItem,
  type ArtworkReviewItem,
  type UncertainPrediction,
} from '@/services/artworkReviewService';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const mockItem: ArtworkReviewItem = {
  id: 'ri-1',
  gtin: '08718989912451',
  t3777Code: 'EU_ORGANIC_FARMING',
  cropPath: 'artwork-crops/crop-1.png',
  bbox: { x: 10, y: 20, width: 80, height: 60 },
  confidence: 0.91,
  method: 'template',
  reason: 'Gevonden maar niet verwacht (niet gedeclareerd in T3777 voor GTIN 08718989912451)',
  sourceFile: '08718989912451_46182_001.jpg',
  status: 'open',
  createdAt: '2026-06-01T10:00:00Z',
  updatedAt: '2026-06-01T10:00:00Z',
};

// ArtworkReviewPage uses useNavigate (login redirect on 401), so every render
// must be wrapped in a router.
function renderPage() {
  return render(
    <MemoryRouter>
      <ArtworkReviewPage />
    </MemoryRouter>
  );
}

function asAdmin(isAdmin: boolean) {
  vi.mocked(useCurrentUser).mockReturnValue({
    user: isAdmin ? ({ id: 'u1', email: 'a@b.c', name: 'A', role: 'ADMIN' } as never) : null,
    loading: false,
    isAdmin,
  });
}

describe('ArtworkReviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom lacks the object-URL APIs the station uses for blob crops/cleanup.
    if (typeof URL.createObjectURL !== 'function') {
      (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:x');
    }
    if (typeof URL.revokeObjectURL !== 'function') {
      (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    }
    // The desktop+mobile review station (deck) loads the crop as an authed blob.
    vi.mocked(fetchReviewItemCropBlob).mockResolvedValue('blob:crop-1.png');
    vi.mocked(fetchReviewItemArtworkBlob).mockResolvedValue(null);
    vi.mocked(fetchDeclaredMarks).mockResolvedValue({ gtin: '', marks: [], reason: 'none' } as never);
    vi.mocked(fetchUncertainPredictions).mockResolvedValue([]);
  });


  // --- Story 20.16 AC11: de uitlegalinea, die 20.14 wél wijzigde maar nooit testte ---

  it('20.16 AC11: de uitlegalinea verdwijnt op desktop zodra er items klaarstaan', async () => {
    asAdmin(true);
    vi.mocked(fetchReviewQueue).mockResolvedValue([
      {
        id: 'ri-1',
        gtin: '08718989912451',
        t3777Code: 'EU_ORGANIC_FARMING',
        cropPath: 'artwork-crops/g/ri-1.png',
        bbox: { x: 10, y: 10, width: 40, height: 40 },
        confidence: 0.8,
        method: 'embedding',
        reason: 'declared-not-found',
        sourceFile: 'artwork/g/page-0.png',
        status: 'open',
        createdAt: '2026-08-01T10:00:00.000Z',
        updatedAt: '2026-08-01T10:00:00.000Z',
      },
    ] as never);

    renderPage();

    // Zodra het deck er staat, hoort de alinea weg te zijn: die ~110 px gaat naar het artwork.
    await waitFor(() => {
      expect(screen.getByTestId('deck-swipe-card')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('review-description')).not.toBeInTheDocument();
  });

  it('20.16 AC11: bij een lege wachtrij blijft de uitleg juist staan', async () => {
    asAdmin(true);
    vi.mocked(fetchReviewQueue).mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('review-empty')).toBeInTheDocument();
    });
    // Dan is er ruimte zat, en is het wél de tekst die iemand zoekt.
    expect(screen.getByTestId('review-description')).toBeInTheDocument();
  });

  it('shows an empty state when the queue is empty', async () => {
    asAdmin(true);
    vi.mocked(fetchReviewQueue).mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('review-empty')).toBeInTheDocument();
    });
  });

  it('shows an error state with retry when loading fails', async () => {
    asAdmin(true);
    vi.mocked(fetchReviewQueue).mockRejectedValue(new Error('boom'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('review-error')).toBeInTheDocument();
    });
  });

  it('shows a login prompt (not a raw error) on a 401 from the review queue', async () => {
    asAdmin(false);
    // Axios-shaped 401 error — must hit the auth branch, not the generic one.
    vi.mocked(fetchReviewQueue).mockRejectedValue({
      isAxiosError: true,
      response: { status: 401 },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('review-auth-error')).toBeInTheDocument();
    });
    // A login affordance is present; the generic error/retry is not shown.
    expect(screen.getByTestId('review-login')).toBeInTheDocument();
    expect(screen.queryByTestId('review-error')).not.toBeInTheDocument();
  });

  it('renders an item with label and confidence in the review station', async () => {
    asAdmin(true);
    vi.mocked(fetchReviewQueue).mockResolvedValue([mockItem]);

    renderPage();

    await screen.findByTestId('mobile-review-deck');
    expect(screen.getByText('EU_ORGANIC_FARMING')).toBeInTheDocument();
    expect(screen.getByText('91%')).toBeInTheDocument();
  });

  it('shows the proposed region boxed on the full pack for a candidate', async () => {
    asAdmin(true);
    vi.mocked(fetchReviewQueue).mockResolvedValue([mockItem]);

    renderPage();
    await screen.findByTestId('mobile-review-deck');

    // The station still loads the crop blob lazily, but for a candidate (crop +
    // bbox) it shows the full pack with the proposed region boxed for verification.
    await waitFor(() => expect(fetchReviewItemCropBlob).toHaveBeenCalledWith('ri-1'));
    const stage = await screen.findByTestId('deck-stage', {}, { timeout: 3000 });
    const img = stage.querySelector('img');
    expect(img).toHaveAttribute('src', expect.stringContaining('/marked'));
  });

  it('accepts an item in one click and advances', async () => {
    asAdmin(true);
    vi.mocked(fetchReviewQueue).mockResolvedValue([mockItem]);
    vi.mocked(acceptReviewItem).mockResolvedValue({
      status: 'registered',
      registered: 1,
      skipped: 0,
    } as never);

    renderPage();
    await screen.findByTestId('deck-accept');

    // One-click accept (no confirmation) → registers, then auto-advances; with a
    // single-item queue the station shows its "done" state.
    await userEvent.click(screen.getByTestId('deck-accept'));

    await waitFor(() => expect(acceptReviewItem).toHaveBeenCalledWith('ri-1'));
    await screen.findByTestId('review-deck-done');
  });

  it('shows both review sources (artwork + feedback) with source labels', async () => {
    asAdmin(true);
    vi.mocked(fetchReviewQueue).mockResolvedValue([mockItem]);
    const uncertain: UncertainPrediction = {
      resultId: 'res-1',
      logId: 'log-1',
      requestId: 'req-1',
      imageHash: 'hash-1',
      prediction: {
        category: 'keurmerk',
        value: 'BETER_LEVEN_1_STER',
        confidence: 0.62,
        bbox: { x: 0, y: 0, width: 10, height: 10 },
      },
      logo: { id: 'logo-1', name: 'Beter Leven 1 ster' },
      createdAt: '2026-06-01T10:00:00Z',
    };
    vi.mocked(fetchUncertainPredictions).mockResolvedValue([uncertain]);

    renderPage();

    await screen.findByTestId('review-section-artwork');
    expect(screen.getByTestId('review-section-feedback')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-review-deck')).toBeInTheDocument();
    expect(screen.getByTestId('uncertain-item')).toHaveTextContent('Beter Leven 1 ster');
  });

  it('disables accept/reject for non-admins and shows a read-only notice', async () => {
    asAdmin(false);
    vi.mocked(fetchReviewQueue).mockResolvedValue([mockItem]);

    renderPage();
    await screen.findByTestId('deck-accept');

    expect(screen.getByTestId('deck-accept')).toBeDisabled();
    expect(screen.getByTestId('deck-reject')).toBeDisabled();
    // Catch-up action is admin-only and absent.
    expect(screen.queryByTestId('review-catchup')).not.toBeInTheDocument();
    expect(rejectReviewItem).not.toHaveBeenCalled();
  });
});
