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
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the review service network calls (the deck imports these directly). The
// pure helper canonicalDeclaredCode (Story 12.18) lives in ./declaredMarks, which
// is NOT mocked, so the badge test exercises the real normalisation.
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
const { stableT, stableI18n, DECK_REL } = vi.hoisted(() => ({
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
  // Story 12.14 — fixed "drawn kader" fraction box used by the mocked ImageStage
  // below, so tests can assert the exact rel object flows through unchanged.
  DECK_REL: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: stableT, i18n: stableI18n }),
}));

// Story 12.14 — ImageStage draws a box via real pointer-drag geometry, which is
// brittle/meaningless in jsdom (no real layout). Replace it with buttons:
//  - "mock-confirm-box" fires onConfirmBox (drag + click "Bevestig kader");
//  - "mock-draw" fires onDraftChange(true) (a box is drawn but NOT yet confirmed);
//  - Story 12.17: when the host bumps confirmToken (its Accept pressed while a
//    draft exists), the stage confirms the drawn box → onConfirmBox.
vi.mock('./ImageStage', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    default: (props: {
      canDraw?: boolean;
      onConfirmBox?: (rel: typeof DECK_REL) => void;
      onDraftChange?: (hasDraft: boolean) => void;
      confirmToken?: number;
    }) => {
      React.useEffect(() => {
        if (props.confirmToken) props.onConfirmBox?.(DECK_REL);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [props.confirmToken]);
      return props.canDraw ? (
        <>
          <button data-testid="mock-confirm-box" onClick={() => props.onConfirmBox?.(DECK_REL)}>
            confirm-box
          </button>
          <button data-testid="mock-draw" onClick={() => props.onDraftChange?.(true)}>
            draw
          </button>
        </>
      ) : null;
    },
  };
});

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

/**
 * Story 12.14 — zelfgetekend kader + gekozen code samen bewaren.
 *
 * Bug: "kader tekenen" en "ander keurmerk kiezen" combineerden niet — de een
 * verloor de code (annotate zonder t3777Code), de ander verloor het getekende
 * kader (accept via de auto-crop). De backend ondersteunt de combinatie al
 * (`annotateReviewItem(id, rel, t3777Code)`); dit dekt de UI-bedrading.
 */
const OTHER_CODE = '100_PERCENT_CANADIAN_MILK';

/** Find a relabel picker option by its code text (buttons carry extra tags/img). */
function findRelabelOption(code: string): HTMLElement {
  const options = screen.getAllByTestId('deck-relabel-option');
  const match = options.find((el) => el.textContent?.includes(code));
  if (!match) throw new Error(`relabel option not found: ${code}`);
  return match;
}

describe('Story 12.14 — MobileReviewDeck kader + code samen bewaren', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (fetchNominationEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (rejectReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'rejected' });
    (reopenReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'open' });
    (acceptReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'registered', registered: 1, skipped: 0 });
    (annotateReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'registered', registered: 1 });
    (fetchReviewItemCropBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (fetchReviewItemArtworkBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (fetchReviewItemSourceBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (fetchDeclaredMarks as ReturnType<typeof vi.fn>).mockResolvedValue({ gtin: 'g', marks: [], reason: 'ok' });
  });

  it('AC1/AC2 — kader dan code: combineert via annotateReviewItem(id, rel, code), niet acceptReviewItem', async () => {
    const user = userEvent.setup();
    render(<MobileReviewDeck items={[item]} canMutate />);

    // 1) Draw + confirm a kader first (no code chosen yet) — falls back to the
    // unchanged "annotate under the existing code" call, but the kader is
    // remembered as pending for this item.
    await user.click(await screen.findByTestId('mock-confirm-box'));
    await waitFor(() => expect(annotateReviewItem).toHaveBeenCalledWith('ri-1', DECK_REL));

    // Single-item queue auto-advances to "done" after the first action; go
    // back to reach the same item again (mirrors real navigation).
    await screen.findByTestId('review-deck-done');
    await user.click(screen.getByRole('button', { name: /Terug/ }));

    // 2) Now pick a different code — must combine with the pending kader.
    await user.click(screen.getByTestId('deck-relabel-open'));
    await user.type(screen.getByPlaceholderText('Zoek keurmerk…'), OTHER_CODE);
    await user.click(findRelabelOption(OTHER_CODE));

    await waitFor(() =>
      expect(annotateReviewItem).toHaveBeenCalledWith('ri-1', DECK_REL, OTHER_CODE)
    );
    expect(acceptReviewItem).not.toHaveBeenCalled();
    // AC4 — combined success feedback.
    expect(
      await screen.findByText(`Keurmerk gemarkeerd op je kader en gekoppeld aan ${OTHER_CODE}`)
    ).toBeInTheDocument();
  });

  it('AC1/AC2 — code dan kader: zelfde eindresultaat, andere volgorde', async () => {
    const user = userEvent.setup();
    render(<MobileReviewDeck items={[item]} canMutate />);

    // 1) Pick a (different) code first — no kader yet, plain relabel-under-code.
    await user.click(screen.getByTestId('deck-relabel-open'));
    await user.type(screen.getByPlaceholderText('Zoek keurmerk…'), OTHER_CODE);
    await user.click(findRelabelOption(OTHER_CODE));

    await waitFor(() => expect(acceptReviewItem).toHaveBeenCalledWith('ri-1', OTHER_CODE));

    // Single-item queue auto-advances; go back to draw the kader on the item.
    await screen.findByTestId('review-deck-done');
    await user.click(screen.getByRole('button', { name: /Terug/ }));

    // 2) Now draw + confirm the kader — must combine with the chosen code.
    await user.click(await screen.findByTestId('mock-confirm-box'));

    await waitFor(() =>
      expect(annotateReviewItem).toHaveBeenCalledWith('ri-1', DECK_REL, OTHER_CODE)
    );
  });

  it('AC3 — alleen code (geen kader getekend): blijft acceptReviewItem(id, code)', async () => {
    const user = userEvent.setup();
    render(<MobileReviewDeck items={[item]} canMutate />);

    await user.click(screen.getByTestId('deck-relabel-open'));
    await user.type(screen.getByPlaceholderText('Zoek keurmerk…'), OTHER_CODE);
    await user.click(findRelabelOption(OTHER_CODE));

    await waitFor(() => expect(acceptReviewItem).toHaveBeenCalledWith('ri-1', OTHER_CODE));
    expect(annotateReviewItem).not.toHaveBeenCalled();
  });

  it('AC3 — alleen kader (geen code gekozen): blijft annotateReviewItem(id, rel) zonder code', async () => {
    const user = userEvent.setup();
    render(<MobileReviewDeck items={[item]} canMutate />);

    await user.click(await screen.findByTestId('mock-confirm-box'));

    await waitFor(() => expect(annotateReviewItem).toHaveBeenCalledWith('ri-1', DECK_REL));
    // Exactly the 2-arg legacy call — no third (code) argument.
    expect((annotateReviewItem as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual(['ri-1', DECK_REL]);
    expect(acceptReviewItem).not.toHaveBeenCalled();
  });

  /**
   * Regression coverage for an adversarial-review finding (Blind Hunter +
   * Edge Case Hunter, both HIGH): a plain accept/reject via the deck buttons
   * finalises the item WITHOUT going through the combine paths (relabel /
   * applyAnnotation). Before the fix, `pendingRel`/`assignedCode` stayed set
   * across that decision-switch, so a LATER combine action on the SAME item
   * silently reattached an abandoned kader/code the reviewer never confirmed
   * together. These tests assert the stale state is cleared on the switch.
   */
  it('regressie — kader tekenen, dan afwijzen, dan relabelen: geen stale kader meer gecombineerd', async () => {
    const user = userEvent.setup();
    render(<MobileReviewDeck items={[item]} canMutate />);

    // 1) Draw + confirm a kader (no code yet) — pendingRel gets set.
    await user.click(await screen.findByTestId('mock-confirm-box'));
    await waitFor(() => expect(annotateReviewItem).toHaveBeenCalledWith('ri-1', DECK_REL));
    await screen.findByTestId('review-deck-done');
    await user.click(screen.getByRole('button', { name: /Terug/ }));

    // 2) Reject the item via the plain button — abandons the drawn kader.
    await user.click(screen.getByTestId('deck-reject'));
    await waitFor(() => expect(rejectReviewItem).toHaveBeenCalledWith('ri-1'));

    // 3) Now relabel — must be a plain accept-under-code, NOT a combine with
    // the kader drawn in step 1 (that kader was abandoned by the reject).
    await user.click(screen.getByTestId('deck-relabel-open'));
    await user.type(screen.getByPlaceholderText('Zoek keurmerk…'), OTHER_CODE);
    await user.click(findRelabelOption(OTHER_CODE));

    await waitFor(() => expect(acceptReviewItem).toHaveBeenCalledWith('ri-1', OTHER_CODE));
    // annotateReviewItem must NOT have been called again with the stale kader
    // combined with the new code — its only call remains the step-1 2-arg one.
    expect(annotateReviewItem).toHaveBeenCalledTimes(1);
    expect((annotateReviewItem as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual(['ri-1', DECK_REL]);
  });

  it('regressie — relabelen, dan afwijzen, dan kader tekenen: geen stale code meer gecombineerd', async () => {
    const user = userEvent.setup();
    render(<MobileReviewDeck items={[item]} canMutate />);

    // 1) Pick a code first — no kader yet, plain relabel-under-code.
    await user.click(screen.getByTestId('deck-relabel-open'));
    await user.type(screen.getByPlaceholderText('Zoek keurmerk…'), OTHER_CODE);
    await user.click(findRelabelOption(OTHER_CODE));
    await waitFor(() => expect(acceptReviewItem).toHaveBeenCalledWith('ri-1', OTHER_CODE));
    await screen.findByTestId('review-deck-done');
    await user.click(screen.getByRole('button', { name: /Terug/ }));

    // 2) Reject the item via the plain button — abandons the chosen code.
    await user.click(screen.getByTestId('deck-reject'));
    await waitFor(() => expect(rejectReviewItem).toHaveBeenCalledWith('ri-1'));

    // 3) Now draw a kader — must be a plain kader-only annotate, NOT a combine
    // with the code chosen in step 1 (that code was abandoned by the reject).
    await user.click(await screen.findByTestId('mock-confirm-box'));

    await waitFor(() => expect(annotateReviewItem).toHaveBeenCalledWith('ri-1', DECK_REL));
    // Exactly the 2-arg legacy call — no stale third (code) argument.
    const lastCall = (annotateReviewItem as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(lastCall).toEqual(['ri-1', DECK_REL]);
  });

  it('regressie — kader tekenen, dan afwijzen via de redenkeuze-modal (vlag aan), dan relabelen: geen stale kader', async () => {
    // Same staleness scenario, but through commitReject (the flywheel
    // reject-reason-modal path) instead of the plain-button applyDecision
    // path — both must clear pendingRel/assignedCode identically.
    (fetchNominationEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const user = userEvent.setup();
    render(<MobileReviewDeck items={[item]} canMutate />);
    await waitFor(() => expect(fetchNominationEnabled).toHaveBeenCalled());

    // 1) Draw + confirm a kader (no code yet) — pendingRel gets set.
    await user.click(await screen.findByTestId('mock-confirm-box'));
    await waitFor(() => expect(annotateReviewItem).toHaveBeenCalledWith('ri-1', DECK_REL));
    await screen.findByTestId('review-deck-done');
    await user.click(screen.getByRole('button', { name: /Terug/ }));

    // 2) Reject via the reason-choice modal — abandons the drawn kader.
    await user.click(screen.getByTestId('deck-reject'));
    await user.click(await screen.findByTestId('reject-reason-geen-keurmerk'));
    await waitFor(() =>
      expect(rejectReviewItem).toHaveBeenCalledWith('ri-1', 'geen-keurmerk')
    );

    // 3) Now relabel — must be a plain accept-under-code, NOT a combine with
    // the kader drawn in step 1.
    await user.click(screen.getByTestId('deck-relabel-open'));
    await user.type(screen.getByPlaceholderText('Zoek keurmerk…'), OTHER_CODE);
    await user.click(findRelabelOption(OTHER_CODE));

    await waitFor(() => expect(acceptReviewItem).toHaveBeenCalledWith('ri-1', OTHER_CODE));
    expect(annotateReviewItem).toHaveBeenCalledTimes(1);
    expect((annotateReviewItem as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual(['ri-1', DECK_REL]);
  });
});

/**
 * Story 12.17 — de grote "Accepteer"-knop mag, zolang er een ONbevestigd
 * getekend kader is, niet stilletjes de auto-crop registreren maar dat kader
 * bevestigen (→ annotate). Regressie voor het ACC-incident waarbij een getekend
 * kader verloren ging en een drukproef-tekst-auto-crop als referentie belandde.
 */
describe('Story 12.17 — Accepteer bevestigt een getekend kader i.p.v. de auto-crop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (fetchNominationEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (acceptReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'registered' });
    (annotateReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'registered', registered: 1 });
    (reopenReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'open' });
    (fetchReviewItemCropBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (fetchReviewItemArtworkBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (fetchReviewItemSourceBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (fetchDeclaredMarks as ReturnType<typeof vi.fn>).mockResolvedValue({ gtin: 'g', marks: [], reason: 'ok' });
  });

  it('met getekend kader: Accepteer roept annotateReviewItem aan, NIET acceptReviewItem', async () => {
    const user = userEvent.setup();
    render(<MobileReviewDeck items={[item]} canMutate />);

    // Teken een kader (nog niet bevestigd) — de grote knop wordt kader-bewust.
    // Story 20.5: het label toont nu de code die wordt opgeslagen (de voorspelde
    // code), zodat niets stilzwijgend onder een verkeerd keurmerk belandt.
    await user.click(await screen.findByTestId('mock-draw'));
    expect(screen.getByTestId('deck-accept')).toHaveTextContent(
      'Bevestig kader als EU_ORGANIC_FARMING'
    );

    // Druk op de grote knop → moet het getekende kader bevestigen (annotate).
    await user.click(screen.getByTestId('deck-accept'));

    await waitFor(() => expect(annotateReviewItem).toHaveBeenCalledWith('ri-1', DECK_REL));
    expect(acceptReviewItem).not.toHaveBeenCalled();
  });

  it('zonder getekend kader: Accepteer blijft acceptReviewItem(id) aanroepen (ongewijzigd)', async () => {
    const user = userEvent.setup();
    render(<MobileReviewDeck items={[item]} canMutate />);

    await user.click(await screen.findByTestId('deck-accept'));

    await waitFor(() => expect(acceptReviewItem).toHaveBeenCalledWith('ri-1'));
    expect(annotateReviewItem).not.toHaveBeenCalled();
  });

  it('ook via de "A"-sneltoets: getekend kader bevestigt (annotate), niet de auto-crop', async () => {
    // De accept-guard zit centraal in applyDecision, dus knop, swipe én toets
    // gaan door dezelfde route (regressie voor het bypass-gat).
    const user = userEvent.setup();
    render(<MobileReviewDeck items={[item]} canMutate />);

    await user.click(await screen.findByTestId('mock-draw'));
    await user.keyboard('a');

    await waitFor(() => expect(annotateReviewItem).toHaveBeenCalledWith('ri-1', DECK_REL));
    expect(acceptReviewItem).not.toHaveBeenCalled();
  });
});

/**
 * Story 12.18 — de "gedeclareerd"-badge moet de kale Nutri-Score-letter uit de
 * declaratie ('D') matchen met de volledige item-code ('NUTRISCORE_D'), zodat
 * een terecht gedeclareerd Nutri-Score-item niet vals "niet gedeclareerd" toont.
 */
describe('Story 12.18 — Nutri-Score label-prior badge (kale letter ↔ NUTRISCORE_-code)', () => {
  const nutriItem: ArtworkReviewItem = {
    ...item,
    id: 'ri-ns',
    gtin: '08718452660308',
    t3777Code: 'NUTRISCORE_D',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (fetchNominationEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (fetchReviewItemCropBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (fetchReviewItemArtworkBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (fetchReviewItemSourceBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it('declaratie letter D + item NUTRISCORE_D ⇒ groene "gedeclareerd", niet oranje', async () => {
    (fetchDeclaredMarks as ReturnType<typeof vi.fn>).mockResolvedValue({
      gtin: nutriItem.gtin,
      marks: [
        { code: 'D', fieldType: 'NutritionalScore' },
        { code: 'GENERAL_FOODS', fieldType: 'NutritionalScore' },
      ],
      reason: 'ok',
    });
    render(<MobileReviewDeck items={[nutriItem]} canMutate />);

    const prior = await screen.findByTestId('deck-prior');
    expect(prior).toHaveTextContent('✓ gedeclareerd op verpakking');
    expect(prior).not.toHaveTextContent('niet gedeclareerd');
  });

  it('declaratie letter D + item NUTRISCORE_C ⇒ terecht oranje "niet gedeclareerd"', async () => {
    (fetchDeclaredMarks as ReturnType<typeof vi.fn>).mockResolvedValue({
      gtin: nutriItem.gtin,
      marks: [{ code: 'D', fieldType: 'NutritionalScore' }],
      reason: 'ok',
    });
    render(<MobileReviewDeck items={[{ ...nutriItem, t3777Code: 'NUTRISCORE_C' }]} canMutate />);

    const prior = await screen.findByTestId('deck-prior');
    expect(prior).toHaveTextContent('⚠ niet gedeclareerd op deze GTIN');
  });
});

/**
 * Story 12.19 — een kader dat in de "bekijk in context"-weergave getekend wordt is
 * in FRAGMENT-fracties; de deck rekent dat via het venster ([left,top,rw,rh,W,H])
 * terug naar volledige-artwork-fracties vóór het annoteren.
 */
describe('Story 12.19 — annoteren in de context-weergave', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (fetchNominationEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (acceptReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'registered' });
    (annotateReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'registered', registered: 1 });
    (reopenReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'open' });
    (fetchReviewItemCropBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (fetchReviewItemArtworkBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (fetchDeclaredMarks as ReturnType<typeof vi.fn>).mockResolvedValue({ gtin: 'g', marks: [], reason: 'ok' });
  });

  it('rekent het fragment-kader terug naar volledige-artwork-fracties', async () => {
    // Venster: extract [left=100,top=50,rw=400,rh=300] uit artwork 1000×800.
    // DECK_REL {0.1,0.1,0.3,0.3} → x=(100+0.1·400)/1000=0.14, y=(50+0.1·300)/800=0.1,
    //   w=0.3·400/1000=0.12, h=0.3·300/800=0.1125.
    (fetchReviewItemSourceBlob as ReturnType<typeof vi.fn>).mockResolvedValue({
      url: 'blob:ctx',
      window: [100, 50, 400, 300, 1000, 800],
    });
    const user = userEvent.setup();
    render(<MobileReviewDeck items={[item]} canMutate />);

    await user.click(await screen.findByTestId('deck-context-toggle'));
    await user.click(await screen.findByTestId('mock-confirm-box'));

    await waitFor(() =>
      expect(annotateReviewItem).toHaveBeenCalledWith('ri-1', {
        x: expect.closeTo(0.14, 5),
        y: expect.closeTo(0.1, 5),
        width: expect.closeTo(0.12, 5),
        height: expect.closeTo(0.1125, 5),
      })
    );
    expect(acceptReviewItem).not.toHaveBeenCalled();
  });

  it('zonder venster (hele artwork) geeft het kader identiek door', async () => {
    (fetchReviewItemSourceBlob as ReturnType<typeof vi.fn>).mockResolvedValue({
      url: 'blob:ctx',
      window: null,
    });
    const user = userEvent.setup();
    render(<MobileReviewDeck items={[item]} canMutate />);

    await user.click(await screen.findByTestId('deck-context-toggle'));
    await user.click(await screen.findByTestId('mock-confirm-box'));

    await waitFor(() => expect(annotateReviewItem).toHaveBeenCalledWith('ri-1', DECK_REL));
  });
});

/**
 * Story 12.20 — de kale Nutri-Score-placeholder ('NUTRISCORE', vorm-oogst 12.12)
 * wordt getoond als een duidelijk "kies de letter"-label + hint i.p.v. de rauwe
 * (niet-bestaande) code.
 */
describe('Story 12.20 — letterloze Nutri-Score-placeholder in de review-UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (fetchNominationEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (fetchReviewItemCropBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (fetchReviewItemArtworkBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (fetchReviewItemSourceBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (fetchDeclaredMarks as ReturnType<typeof vi.fn>).mockResolvedValue({ gtin: 'g', marks: [], reason: 'ok' });
  });

  it("toont een 'kies de letter'-label + hint i.p.v. de rauwe code NUTRISCORE", async () => {
    render(<MobileReviewDeck items={[{ ...item, id: 'ri-ns', t3777Code: 'NUTRISCORE' }]} canMutate />);

    expect(await screen.findByText('Nutri-Score — kies de letter')).toBeInTheDocument();
    expect(screen.getByTestId('deck-letterless-hint')).toBeInTheDocument();
    // De rauwe placeholder-code staat NIET meer als label op het scherm.
    expect(screen.queryByText('NUTRISCORE')).toBeNull();
  });

  it('een echte letter-code toont gewoon de code, geen hint', async () => {
    render(<MobileReviewDeck items={[{ ...item, id: 'ri-c', t3777Code: 'NUTRISCORE_C' }]} canMutate />);

    expect(await screen.findByText('NUTRISCORE_C')).toBeInTheDocument();
    expect(screen.queryByTestId('deck-letterless-hint')).toBeNull();
    expect(screen.queryByText('Nutri-Score — kies de letter')).toBeNull();
  });

  it('biedt de kale NUTRISCORE-placeholder NIET aan in de relabel-picker', async () => {
    const user = userEvent.setup();
    render(<MobileReviewDeck items={[{ ...item, id: 'ri-ns', t3777Code: 'NUTRISCORE' }]} canMutate />);

    await user.click(await screen.findByTestId('deck-relabel-open'));
    const options = screen.getAllByTestId('deck-relabel-option');
    expect(options.some((el) => el.textContent?.trim() === 'NUTRISCORE')).toBe(false);
  });

  it('na relabelen naar een echte letter: het label wordt de code en de hint verdwijnt', async () => {
    (acceptReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'registered' });
    (reopenReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'open' });
    (annotateReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'registered', registered: 1 });
    const user = userEvent.setup();
    render(<MobileReviewDeck items={[{ ...item, id: 'ri-ns', t3777Code: 'NUTRISCORE' }]} canMutate />);

    expect(await screen.findByTestId('deck-letterless-hint')).toBeInTheDocument();

    await user.click(screen.getByTestId('deck-relabel-open'));
    await user.type(screen.getByPlaceholderText('Zoek keurmerk…'), OTHER_CODE);
    await user.click(findRelabelOption(OTHER_CODE));

    // Single-item queue auto-advances; go back to the (now relabeled) item.
    await waitFor(() => expect(acceptReviewItem).toHaveBeenCalledWith('ri-ns', OTHER_CODE));
    await screen.findByTestId('review-deck-done');
    await user.click(screen.getByRole('button', { name: /Terug/ }));

    // De placeholder is opgelost → geen "kies de letter"-label of hint meer, en
    // de kaart toont de echte gekozen code (binnen de deck, niet in lingering toasts).
    await waitFor(() => expect(screen.queryByTestId('deck-letterless-hint')).toBeNull());
    expect(screen.queryByText('Nutri-Score — kies de letter')).toBeNull();
    expect(within(screen.getByTestId('mobile-review-deck')).getByText(OTHER_CODE, { exact: false })).toBeInTheDocument();
  });
});
