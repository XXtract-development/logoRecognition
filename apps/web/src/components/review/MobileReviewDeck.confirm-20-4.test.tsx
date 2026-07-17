/**
 * Story 20.4 — Een getekend kader wordt pas ingediend via de (hertitelde)
 * hoofdknop; een gekozen keurmerk wordt tot die tijd alleen KLAARGEZET.
 *
 * ImageStage wordt hier gemockt met een minimale teken-simulator: de echte
 * teken-mechanica is al gedekt door de 12.17/ImageStage-tests; hier testen we
 * de DECK-bedrading (stagen, hertitelen, indien-routering, opruimen).
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

// Minimale ImageStage-simulator: knoppen om een draft-kader te zetten/wissen,
// en het bestaande confirmToken-contract (12.17) om het kader te bevestigen.
vi.mock('./ImageStage', () => ({
  default: ({
    'data-testid': testId,
    onDraftChange,
    onConfirmBox,
    confirmToken,
    hideConfirm,
  }: {
    'data-testid'?: string;
    onDraftChange?: (b: boolean) => void;
    onConfirmBox?: (rel: { x: number; y: number; width: number; height: number }) => void;
    confirmToken?: number;
    hideConfirm?: boolean;
  }) => {
    useEffect(() => {
      if (confirmToken && confirmToken > 0) {
        onConfirmBox?.({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 });
        // echte ImageStage: na indienen schuift de deck door en wist resetKey
        // het kader -> draft-status vervalt. Simuleer dat hier.
        onDraftChange?.(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [confirmToken]);
    return (
      <div data-testid={testId} data-hideconfirm={String(!!hideConfirm)}>
        <button data-testid={`${testId}-fake-draw`} onClick={() => onDraftChange?.(true)} />
        <button data-testid={`${testId}-fake-clear`} onClick={() => onDraftChange?.(false)} />
      </div>
    );
  },
}));

import MobileReviewDeck from './MobileReviewDeck';
import {
  acceptReviewItem,
  rejectReviewItem,
  annotateReviewItem,
  fetchReviewItemCropBlob,
  fetchReviewItemArtworkBlob,
  fetchReviewItemSourceBlob,
  fetchDeclaredMarks,
  fetchNominationEnabled,
  type ArtworkReviewItem,
} from '@/services/artworkReviewService';

const item: ArtworkReviewItem = {
  id: 'ri-conf-1',
  gtin: '08712345678901',
  t3777Code: 'FSC_MIX',
  cropPath: 'artwork-crops/08712345678901/x.png',
  bbox: { x: 0, y: 0, width: 40, height: 40 },
  confidence: 0.9,
  method: 'embedding',
  reason: 'test',
  sourceFile: 'a.jpg',
  status: 'open',
  createdAt: '2026-07-17T00:00:00Z',
  updatedAt: '2026-07-17T00:00:00Z',
};

async function drawBox(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByTestId('deck-stage-fake-draw'));
}

async function pickCode(user: ReturnType<typeof userEvent.setup>, code: string) {
  await user.click(screen.getByTestId('deck-relabel-open'));
  const search = await screen.findByPlaceholderText('Zoek keurmerk…');
  await user.type(search, code);
  await user.click(await screen.findByText(code));
}

describe('Story 20.4 — kader indienen alléén via de hoofdknop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (acceptReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'registered' });
    (rejectReviewItem as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'rejected' });
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

  it('AC1: de in-stage bevestig-knop is in de deck verborgen (hideConfirm)', async () => {
    render(<MobileReviewDeck items={[item]} canMutate />);
    const stage = await screen.findByTestId('deck-stage');
    expect(stage.getAttribute('data-hideconfirm')).toBe('true');
  });

  it('AC1/AC3: tekenen dient niets in; de hoofdknop hertitelt en dient pas bij indrukken in', async () => {
    const user = userEvent.setup();
    render(<MobileReviewDeck items={[item]} canMutate />);

    await drawBox(user);
    expect(annotateReviewItem).not.toHaveBeenCalled();
    expect(acceptReviewItem).not.toHaveBeenCalled();

    const accept = screen.getByTestId('deck-accept');
    expect(accept.textContent).toMatch(/kader/i);

    await user.click(accept);
    await waitFor(() =>
      expect(annotateReviewItem).toHaveBeenCalledWith('ri-conf-1', {
        x: 0.1,
        y: 0.1,
        width: 0.2,
        height: 0.2,
      })
    );
    expect(acceptReviewItem).not.toHaveBeenCalled();
  });

  it('AC2/AC3: code kiezen met klaarstaand kader dient NIETS in; hoofdknop toont de code en dient kader+code samen in', async () => {
    const user = userEvent.setup();
    render(<MobileReviewDeck items={[item]} canMutate />);

    await drawBox(user);
    await pickCode(user, 'EU_ORGANIC_FARMING');

    // niets ingediend door de pick zelf
    expect(acceptReviewItem).not.toHaveBeenCalled();
    expect(annotateReviewItem).not.toHaveBeenCalled();

    const accept = screen.getByTestId('deck-accept');
    expect(accept.textContent).toContain('EU_ORGANIC_FARMING');

    await user.click(accept);
    await waitFor(() =>
      expect(annotateReviewItem).toHaveBeenCalledWith(
        'ri-conf-1',
        { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        'EU_ORGANIC_FARMING'
      )
    );
    expect(acceptReviewItem).not.toHaveBeenCalled();
  });

  it('AC4: kader gewist met klaargezette code -> hoofdknop dient de code in via het relabel-pad', async () => {
    const user = userEvent.setup();
    render(<MobileReviewDeck items={[item]} canMutate />);

    await drawBox(user);
    await pickCode(user, 'EU_ORGANIC_FARMING');
    await user.click(screen.getByTestId('deck-stage-fake-clear'));

    const accept = screen.getByTestId('deck-accept');
    expect(accept.textContent).toContain('EU_ORGANIC_FARMING');

    await user.click(accept);
    await waitFor(() =>
      expect(acceptReviewItem).toHaveBeenCalledWith('ri-conf-1', 'EU_ORGANIC_FARMING')
    );
    expect(annotateReviewItem).not.toHaveBeenCalled();
  });

  it('AC5: zonder klaarstaand kader blijft een picker-keuze direct indienen (12.12/12.14-regressie)', async () => {
    const user = userEvent.setup();
    render(<MobileReviewDeck items={[item]} canMutate />);
    await screen.findByTestId('deck-stage');

    await pickCode(user, 'EU_ORGANIC_FARMING');
    await waitFor(() =>
      expect(acceptReviewItem).toHaveBeenCalledWith('ri-conf-1', 'EU_ORGANIC_FARMING')
    );
  });

  it('AC4: afwijzen ruimt de klaargezette code op (geen stille her-koppeling later)', async () => {
    const user = userEvent.setup();
    const item2 = { ...item, id: 'ri-conf-2' };
    render(<MobileReviewDeck items={[item, item2]} canMutate />);

    await drawBox(user);
    await pickCode(user, 'EU_ORGANIC_FARMING');
    await user.click(screen.getByTestId('deck-reject'));
    await waitFor(() => expect(rejectReviewItem).toHaveBeenCalledWith('ri-conf-1'));

    // terug naar het afgewezen item: de klaargezette code is opgeruimd
    await user.click(screen.getByTestId('deck-back'));
    expect(screen.getByTestId('deck-accept').textContent).not.toContain('EU_ORGANIC_FARMING');
  });

  it('review-M1: nogmaals accepteren op een al-goedgekeurde kaart blijft UNDO, ook met klaargezette code', async () => {
    const user = userEvent.setup();
    const { reopenReviewItem } = await import('@/services/artworkReviewService');
    render(<MobileReviewDeck items={[item, { ...item, id: 'ri-conf-2' }]} canMutate />);

    // kader + code klaarzetten en indienen (kaart 1 -> ECHT), terug naar kaart 1
    await drawBox(user);
    await pickCode(user, 'EU_ORGANIC_FARMING');
    await user.click(screen.getByTestId('deck-accept'));
    await waitFor(() => expect(annotateReviewItem).toHaveBeenCalled());
    await user.click(screen.getByTestId('deck-back'));

    vi.clearAllMocks();
    // dezelfde keuze nogmaals = ongedaan maken: alleen reopen, geen accept/annotate
    await user.click(screen.getByTestId('deck-accept'));
    await waitFor(() => expect(reopenReviewItem).toHaveBeenCalledWith('ri-conf-1'));
    expect(acceptReviewItem).not.toHaveBeenCalled();
    expect(annotateReviewItem).not.toHaveBeenCalled();
  });
});
