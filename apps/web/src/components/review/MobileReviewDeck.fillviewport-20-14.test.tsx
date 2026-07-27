/**
 * Story 20.14 — het deck vult de beschikbare schermhoogte.
 *
 * Story 20.12 verruimde alleen de breedte. De hoogte bleef staan doordat een
 * wrapper BOVEN ImageStage `height: 48vh; maxHeight: 440; overflow: hidden`
 * afdwong — de `maxHeight` die 20.12 aan ImageStage meegaf was daardoor een dode
 * letter en het artwork werd zichtbaar afgekapt.
 *
 * Deze suite legt vast:
 *   - in de fill-stand is er GEEN vast hoogtedak meer (dat was de bug);
 *   - de kaarthoogte wordt GEMETEN (venster − bovenkant kaart − marge), zodat er
 *     geen nieuwe 440 kan ontstaan als er een regel opmaak bijkomt;
 *   - mobiel blijft exact op 48vh / 440 (AC6).
 *
 * Wat deze suite NIET kan: de werkelijk gerenderde pixelhoogte van het
 * beeldvenster. jsdom voert geen opmaak uit — alle hoogtes zijn 0. Daarom wordt
 * hier het mechanisme getoetst (gemeten kaarthoogte + `flex: 1` op het
 * beeldvenster, wat betekent "neem de restruimte"); de visuele bevestiging staat
 * als losse taak in de story.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

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

// ImageStage zelf doet hier niet mee; de begrenzing die we toetsen zit in de
// wrapper van het deck. Wel de meegegeven maxHeight vastleggen (AC2).
const stageProps: Array<{ maxHeight?: string }> = [];
vi.mock('./ImageStage', () => ({
  default: (props: { maxHeight?: string }) => {
    stageProps.push({ maxHeight: props.maxHeight });
    return <div data-testid="mock-stage" />;
  },
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
  createdAt: '2026-07-27T00:00:00Z',
  updatedAt: '2026-07-27T00:00:00Z',
};

/** Doe alsof de kaart op `top` px onder de vensterrand begint. */
function stubCardTop(top: number) {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: HTMLElement) {
      const isCard = this.getAttribute('data-testid') === 'deck-swipe-card';
      return { top: isCard ? top : 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
    },
  });
}

function setViewportHeight(h: number) {
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: h });
}

beforeEach(() => {
  vi.clearAllMocks();
  stageProps.length = 0;
  (fetchReviewItemCropBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (fetchReviewItemArtworkBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (fetchReviewItemSourceBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (fetchDeclaredMarks as ReturnType<typeof vi.fn>).mockResolvedValue({ gtin: 'g', marks: [], reason: 'ok' });
  (fetchNominationEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(false);
});

describe('AC1/AC2 — fill-stand: gemeten hoogte, geen vast dak', () => {
  it('kaarthoogte = venster − bovenkant − marge; beeldvenster pakt de rest', async () => {
    setViewportHeight(1000);
    stubCardTop(200);
    render(<MobileReviewDeck items={[item]} canMutate fillViewport />);

    const card = await screen.findByTestId('deck-swipe-card');
    await waitFor(() => expect(card.style.height).toBe('784px')); // 1000 − 200 − 16

    // De kaart is een kolom: koprij en knoppen houden hun hoogte, het beeld de rest.
    expect(card.style.display).toBe('flex');
    expect(card.style.flexDirection).toBe('column');

    const frame = screen.getByTestId('deck-stage-frame');
    expect(frame.style.flex).toContain('1');
    expect(frame.style.minHeight).toBe('0');
    // DIT was de bug: elk vast dak knipt het artwork af.
    expect(frame.style.maxHeight).toBe('');
    expect(frame.style.height).toBe('');
  });

  it('ImageStage krijgt 100% i.p.v. de oude calc-waarde', async () => {
    setViewportHeight(1000);
    stubCardTop(200);
    render(<MobileReviewDeck items={[item]} canMutate fillViewport />);
    await screen.findByTestId('mock-stage');
    await waitFor(() => expect(stageProps.at(-1)?.maxHeight).toBe('100%'));
  });

  it('AC3 — bij een venster van 1000px blijft er ruim meer over dan de oude 440', async () => {
    setViewportHeight(1000);
    stubCardTop(200);
    render(<MobileReviewDeck items={[item]} canMutate fillViewport />);
    const card = await screen.findByTestId('deck-swipe-card');
    await waitFor(() => expect(parseInt(card.style.height, 10)).toBeGreaterThanOrEqual(600));
  });

  it('AC2 — herberekent bij het wijzigen van de venstergrootte', async () => {
    setViewportHeight(1000);
    stubCardTop(200);
    render(<MobileReviewDeck items={[item]} canMutate fillViewport />);
    const card = await screen.findByTestId('deck-swipe-card');
    await waitFor(() => expect(card.style.height).toBe('784px'));

    setViewportHeight(700);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await waitFor(() => expect(card.style.height).toBe('484px')); // 700 − 200 − 16
  });

  it('ondergrens: een extreem laag venster levert geen onbruikbaar beeld op', async () => {
    setViewportHeight(400);
    stubCardTop(300);
    render(<MobileReviewDeck items={[item]} canMutate fillViewport />);
    const card = await screen.findByTestId('deck-swipe-card');
    // 400 − 300 − 16 = 84 → afgevangen op de ondergrens van 320.
    await waitFor(() => expect(card.style.height).toBe('320px'));
  });
});

describe('AC6 — mobiel ongewijzigd', () => {
  it('zonder fillViewport blijft het oude 48vh / 440-gedrag staan', async () => {
    setViewportHeight(800);
    stubCardTop(120);
    render(<MobileReviewDeck items={[item]} canMutate />);

    const frame = await screen.findByTestId('deck-stage-frame');
    expect(frame.style.height).toBe('48vh');
    expect(frame.style.maxHeight).toBe('440px');
    expect(frame.style.flex).toBe('');

    const card = screen.getByTestId('deck-swipe-card');
    expect(card.style.height).toBe('');
    expect(card.style.display).not.toBe('flex');

    await waitFor(() => expect(stageProps.at(-1)?.maxHeight).toBe('calc(100vh - 260px)'));
  });
});
