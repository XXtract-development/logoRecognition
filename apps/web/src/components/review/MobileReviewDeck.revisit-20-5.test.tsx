/**
 * Story 20.5 — Na een getekende correctie moet revisit de OPGESLAGEN crop tonen
 * (cache-bust) en moet de bevestigknop het keurmerk tonen dat wordt opgeslagen.
 */

import { useEffect } from 'react';
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

// Leg de marked-URL vast die de deck aan ImageStage geeft, per render.
const markedSrcSeen: string[] = [];
vi.mock('./ImageStage', () => ({
  default: ({
    'data-testid': testId,
    src,
    onDraftChange,
    onConfirmBox,
    confirmToken,
  }: {
    'data-testid'?: string;
    src?: string;
    onDraftChange?: (b: boolean) => void;
    onConfirmBox?: (rel: { x: number; y: number; width: number; height: number }) => void;
    confirmToken?: number;
  }) => {
    if (testId === 'deck-stage' && typeof src === 'string') markedSrcSeen.push(src);
    useEffect(() => {
      if (confirmToken && confirmToken > 0) {
        onConfirmBox?.({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 });
        onDraftChange?.(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [confirmToken]);
    return (
      <div data-testid={testId} data-src={src}>
        <button data-testid={`${testId}-fake-draw`} onClick={() => onDraftChange?.(true)} />
      </div>
    );
  },
}));

import MobileReviewDeck from './MobileReviewDeck';
import {
  annotateReviewItem,
  fetchReviewItemCropBlob,
  fetchReviewItemArtworkBlob,
  fetchReviewItemSourceBlob,
  fetchDeclaredMarks,
  fetchNominationEnabled,
  type ArtworkReviewItem,
} from '@/services/artworkReviewService';

const base: ArtworkReviewItem = {
  id: 'ri-rev-1',
  gtin: '08712345678901',
  t3777Code: 'FSC_MIX',
  cropPath: 'artwork-crops/08712345678901/x.png',
  bbox: { x: 1, y: 2, width: 30, height: 30 },
  confidence: 0.9,
  method: 'embedding',
  reason: 'test',
  sourceFile: 'a.jpg',
  status: 'open',
  createdAt: '2026-07-17T00:00:00Z',
  updatedAt: '2026-07-17T00:00:00Z',
};

describe('Story 20.5 — correctie terugtonen + expliciet keurmerk', () => {
  beforeEach(() => {
    markedSrcSeen.length = 0;
    vi.clearAllMocks();
    (annotateReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'registered' });
    (fetchReviewItemCropBlob as ReturnType<typeof vi.fn>).mockResolvedValue('blob:crop-1');
    (fetchReviewItemArtworkBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (fetchReviewItemSourceBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (fetchDeclaredMarks as ReturnType<typeof vi.fn>).mockResolvedValue({
      gtin: 'g',
      marks: [],
      reason: 'ok',
    });
    (fetchNominationEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(false);
  });

  it('AC2: kader tekenen zonder code toont de VOORSPELDE code op de bevestigknop', async () => {
    const user = userEvent.setup();
    render(<MobileReviewDeck items={[base]} canMutate />);
    await screen.findByTestId('deck-stage');
    await user.click(screen.getByTestId('deck-stage-fake-draw'));

    const accept = screen.getByTestId('deck-accept');
    expect(accept.textContent).toContain('FSC_MIX');
    expect(accept.textContent).toMatch(/kader/i);
  });

  it('AC3: letterloze Nutri-Score toont "kies de letter", niet "als NUTRISCORE"', async () => {
    const user = userEvent.setup();
    const ns = { ...base, id: 'ri-ns-1', t3777Code: 'NUTRISCORE' };
    render(<MobileReviewDeck items={[ns]} canMutate />);
    await screen.findByTestId('deck-stage');
    await user.click(screen.getByTestId('deck-stage-fake-draw'));

    const accept = screen.getByTestId('deck-accept');
    expect(accept.textContent).not.toContain('als NUTRISCORE');
    expect(accept.textContent).toMatch(/letter/i);
  });

  it('AC1: na een annotate krijgt de marked-URL een versie-parameter (cache-bust)', async () => {
    const user = userEvent.setup();
    const two = { ...base, id: 'ri-rev-2' };
    render(<MobileReviewDeck items={[base, two]} canMutate />);
    await screen.findByTestId('deck-stage');

    // vóór de correctie: geen ?v=
    const before = markedSrcSeen.filter((s) => s.includes('/ri-rev-1/marked'));
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((s) => !s.includes('?v='))).toBe(true);

    // teken + bevestig
    await user.click(screen.getByTestId('deck-stage-fake-draw'));
    await user.click(screen.getByTestId('deck-accept'));
    await waitFor(() => expect(annotateReviewItem).toHaveBeenCalled());

    // terug naar het gecorrigeerde item
    markedSrcSeen.length = 0;
    await user.click(screen.getByTestId('deck-back'));

    const after = markedSrcSeen.filter((s) => s.includes('/ri-rev-1/marked'));
    expect(after.length).toBeGreaterThan(0);
    expect(after.some((s) => /\?v=\d+/.test(s))).toBe(true);
  });

  it('AC1: de crop-blob-cache wordt na een annotate opnieuw opgehaald bij terugkeer', async () => {
    const user = userEvent.setup();
    const two = { ...base, id: 'ri-rev-2' };
    render(<MobileReviewDeck items={[base, two]} canMutate />);
    await screen.findByTestId('deck-stage');
    await waitFor(() => expect(fetchReviewItemCropBlob).toHaveBeenCalledWith('ri-rev-1'));

    await user.click(screen.getByTestId('deck-stage-fake-draw'));
    await user.click(screen.getByTestId('deck-accept'));
    await waitFor(() => expect(annotateReviewItem).toHaveBeenCalled());

    (fetchReviewItemCropBlob as ReturnType<typeof vi.fn>).mockClear();
    await user.click(screen.getByTestId('deck-back'));

    // cache is ge-invalideerd -> nieuwe fetch voor dit item
    await waitFor(() => expect(fetchReviewItemCropBlob).toHaveBeenCalledWith('ri-rev-1'));
  });

  it('review-6: bevestigen van een kader op een letterloze Nutri-Score opent de picker i.p.v. indienen onder NUTRISCORE', async () => {
    const user = userEvent.setup();
    const ns = { ...base, id: 'ri-ns-2', t3777Code: 'NUTRISCORE' };
    render(<MobileReviewDeck items={[ns]} canMutate />);
    await screen.findByTestId('deck-stage');
    await user.click(screen.getByTestId('deck-stage-fake-draw'));
    await user.click(screen.getByTestId('deck-accept'));

    // niets ingediend onder de placeholder; de picker is geopend om de letter te kiezen
    expect(annotateReviewItem).not.toHaveBeenCalled();
    expect(await screen.findByPlaceholderText('Zoek keurmerk…')).toBeInTheDocument();
  });

  it('AC4: een item dat NIET gecorrigeerd is heeft geen versie-parameter', async () => {
    render(<MobileReviewDeck items={[base]} canMutate />);
    await screen.findByTestId('deck-stage');
    const seen = markedSrcSeen.filter((s) => s.includes('/ri-rev-1/marked'));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => !s.includes('?v='))).toBe(true);
  });
});
