/**
 * Story 20.3 — Mobiele crop-flow: een teken-gebaar op een ImageStage mag NOOIT
 * als kaart-swipe (ECHT/VALS-beslissing of visuele drag) geïnterpreteerd worden.
 *
 * Bugscenario (gemeld door Friso, 2026-07-16): op touch bubbelen de pointer-
 * gebaren van de teken-zone óók naar de touch-handlers van het kaartje; een
 * horizontaal getekend kader > 70px veegde de kaart weg als beslissing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

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
  rejectReviewItem,
  fetchReviewItemCropBlob,
  fetchReviewItemArtworkBlob,
  fetchReviewItemSourceBlob,
  fetchDeclaredMarks,
  fetchNominationEnabled,
  type ArtworkReviewItem,
} from '@/services/artworkReviewService';

const item: ArtworkReviewItem = {
  id: 'ri-touch-1',
  gtin: '08712345678901',
  t3777Code: 'FSC_MIX',
  cropPath: 'artwork-crops/08712345678901/x.png',
  bbox: { x: 0, y: 0, width: 40, height: 40 },
  confidence: 0.9,
  method: 'embedding',
  reason: 'test',
  sourceFile: 'a.jpg',
  status: 'open',
  createdAt: '2026-07-16T00:00:00Z',
  updatedAt: '2026-07-16T00:00:00Z',
};

function swipeRight(el: Element) {
  fireEvent.touchStart(el, { touches: [{ clientX: 10, clientY: 100 }] });
  fireEvent.touchMove(el, { touches: [{ clientX: 120, clientY: 104 }] });
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: 120, clientY: 104 }] });
}

describe('Story 20.3 — teken-gebaar vs kaart-swipe op touch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (acceptReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'registered' });
    (rejectReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'rejected' });
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

  it('AC1: een horizontaal gebaar dat op de teken-zone start levert GEEN beslissing op', async () => {
    render(<MobileReviewDeck items={[item]} canMutate />);
    const stage = await screen.findByTestId('deck-stage');

    swipeRight(stage);

    // geen accept, geen reject — de kaart staat nog open
    expect(acceptReviewItem).not.toHaveBeenCalled();
    expect(rejectReviewItem).not.toHaveBeenCalled();
    expect(screen.getByText('FSC_MIX')).toBeInTheDocument();
  });

  it('AC1: de stage-wrapper draagt de stabiele zone-marker', async () => {
    render(<MobileReviewDeck items={[item]} canMutate />);
    const stage = await screen.findByTestId('deck-stage');
    expect(stage.hasAttribute('data-image-stage')).toBe(true);
  });

  it('AC2: een swipe die BUITEN de teken-zone start blijft gewoon een beslissing', async () => {
    render(<MobileReviewDeck items={[item]} canMutate />);
    await screen.findByTestId('deck-stage');

    // start het gebaar op de code-tekst van het kaartje (buiten de stage)
    swipeRight(screen.getByText('FSC_MIX'));

    await waitFor(() => expect(acceptReviewItem).toHaveBeenCalledWith('ri-touch-1'));
  });

  it('AC3: op een aanraakapparaat tonen de hints touch-taal, geen muis-/toetsenbordtaal', async () => {
    const orig = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: q.includes('pointer: coarse'),
      media: q,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    try {
      render(<MobileReviewDeck items={[item]} canMutate />);
      await screen.findByTestId('deck-stage');
      const hint = screen.getByTestId('deck-shortcuts-hint');
      expect(hint.textContent).toMatch(/dubbeltik/i);
      expect(hint.textContent).not.toMatch(/spatie|Sneltoetsen/i);
    } finally {
      window.matchMedia = orig;
    }
  });
});

describe('Story 20.3 — adversarial-review-regressies (multi-touch, drag-reset, hint-zone)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (acceptReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'registered' });
    (rejectReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'rejected' });
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

  it('H1: tweede vinger op het kaartje her-bewapent de swipe NIET terwijl vinger 1 tekent', async () => {
    render(<MobileReviewDeck items={[item]} canMutate />);
    const stage = await screen.findByTestId('deck-stage');
    const card = screen.getByTestId('deck-swipe-card');

    // vinger A start op de stage (genegeerd), vinger B landt op het kaartje
    fireEvent.touchStart(stage, { touches: [{ clientX: 10, clientY: 100 }] });
    fireEvent.touchStart(card, {
      touches: [
        { clientX: 10, clientY: 100 },
        { clientX: 200, clientY: 300 },
      ],
    });
    // vinger A tekent horizontaal >70px
    fireEvent.touchMove(card, {
      touches: [
        { clientX: 130, clientY: 104 },
        { clientX: 200, clientY: 300 },
      ],
    });
    fireEvent.touchEnd(card, { changedTouches: [{ clientX: 130, clientY: 104 }] });

    expect(acceptReviewItem).not.toHaveBeenCalled();
    expect(rejectReviewItem).not.toHaveBeenCalled();
  });

  it('M2: een halverwege genegeerd gebaar laat de kaart niet scheef staan', async () => {
    render(<MobileReviewDeck items={[item]} canMutate />);
    const stage = await screen.findByTestId('deck-stage');
    const card = screen.getByTestId('deck-swipe-card');

    // start buiten de stage (bewapend) en bouw drag op
    fireEvent.touchStart(screen.getByText('FSC_MIX'), {
      touches: [{ clientX: 10, clientY: 100 }],
    });
    fireEvent.touchMove(card, { touches: [{ clientX: 60, clientY: 100 }] });
    // tweede vinger raakt de stage -> gebaar wordt genegeerd én drag gereset
    fireEvent.touchStart(stage, {
      touches: [
        { clientX: 60, clientY: 100 },
        { clientX: 30, clientY: 50 },
      ],
    });
    fireEvent.touchEnd(card, { changedTouches: [{ clientX: 60, clientY: 100 }] });

    expect(card.style.transform).toContain('translateX(0px)');
    expect(acceptReviewItem).not.toHaveBeenCalled();
  });

  it('L3: de buitencontainer van de stage (hint/bevestig-zone) valt binnen de uitgesloten zone', async () => {
    render(<MobileReviewDeck items={[item]} canMutate />);
    const stage = await screen.findByTestId('deck-stage');
    const outer = stage.parentElement as HTMLElement;
    expect(outer.hasAttribute('data-image-stage')).toBe(true);

    swipeRight(outer);
    expect(acceptReviewItem).not.toHaveBeenCalled();
  });
});
