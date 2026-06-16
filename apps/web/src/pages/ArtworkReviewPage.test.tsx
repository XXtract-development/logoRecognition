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
  acceptReviewItem: vi.fn(),
  rejectReviewItem: vi.fn(),
  annotateReviewItem: vi.fn(),
  processAcceptedReviewItems: vi.fn(),
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
  fetchReviewItemCropUrl,
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
    vi.mocked(fetchReviewItemCropUrl).mockResolvedValue({
      cropUrl: 'https://minio/crop-1.png?sig=x',
      artworkUrl: null,
    });
    vi.mocked(fetchUncertainPredictions).mockResolvedValue([]);
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

  it('renders an item with label, confidence and discrepancy reason', async () => {
    asAdmin(true);
    vi.mocked(fetchReviewQueue).mockResolvedValue([mockItem]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('artwork-review-item')).toBeInTheDocument();
    });
    expect(screen.getByText('EU_ORGANIC_FARMING')).toBeInTheDocument();
    expect(screen.getByTestId('review-item-confidence')).toHaveTextContent('91%');
    expect(screen.getByTestId('review-item-reason')).toHaveTextContent(/niet verwacht/i);
  });

  it('reveals the provenance block (crop + source + bbox) on view', async () => {
    asAdmin(true);
    vi.mocked(fetchReviewQueue).mockResolvedValue([mockItem]);

    renderPage();
    await screen.findByTestId('artwork-review-item');

    await userEvent.click(screen.getByTestId('review-item-toggle'));

    const provenance = await screen.findByTestId('review-item-provenance');
    // Crop is presigned on view, not eagerly.
    expect(fetchReviewItemCropUrl).toHaveBeenCalledWith('ri-1');
    const crop = await screen.findByTestId('review-item-crop', {}, { timeout: 3000 });
    expect(crop).toHaveAttribute('src', expect.stringContaining('crop-1.png'));
    // Provenance contract (Story 8.5 Task 3): the block self-describes the
    // detection — image + confidence (%) + discrepancy reason + source + bbox.
    expect(provenance.querySelector('img')).toBeTruthy();
    expect(provenance).toHaveTextContent(/%/);
    expect(provenance).toHaveTextContent(/niet verwacht/i);
    expect(provenance).toHaveTextContent('08718989912451_46182_001.jpg');
    expect(provenance).toHaveTextContent(/x:10/);
  });

  it('accepts an item and removes it from the queue optimistically', async () => {
    asAdmin(true);
    vi.mocked(fetchReviewQueue).mockResolvedValue([mockItem]);
    vi.mocked(acceptReviewItem).mockResolvedValue({ status: 'registered', registered: 1, skipped: 0 });

    renderPage();
    await screen.findByTestId('artwork-review-item');

    // Accept is now a direct action (no confirmation step).
    await userEvent.click(screen.getByTestId('review-item-accept'));

    await waitFor(() => {
      expect(acceptReviewItem).toHaveBeenCalledWith('ri-1');
    });
    await waitFor(() => {
      expect(screen.queryByTestId('artwork-review-item')).not.toBeInTheDocument();
    });
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
    expect(screen.getByTestId('artwork-review-item')).toBeInTheDocument();
    expect(screen.getByTestId('uncertain-item')).toHaveTextContent('Beter Leven 1 ster');
  });

  it('disables accept/reject for non-admins and shows a read-only notice', async () => {
    asAdmin(false);
    vi.mocked(fetchReviewQueue).mockResolvedValue([mockItem]);

    renderPage();
    await screen.findByTestId('artwork-review-item');

    expect(screen.getByTestId('review-item-accept')).toBeDisabled();
    expect(screen.getByTestId('review-item-reject')).toBeDisabled();
    // Catch-up action is admin-only and absent.
    expect(screen.queryByTestId('review-catchup')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('review-item-reject'));
    expect(rejectReviewItem).not.toHaveBeenCalled();
  });
});
