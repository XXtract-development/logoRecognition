/**
 * Story 15.3 — FlywheelBatchDetailPage (quarantaine-afhandeling).
 *
 * Component-tests (vitest + jsdom, patroon FlywheelPage.test.tsx). Dekt:
 *   AC1  master-detail rendert: faalreden, batchvoortgang, kandidatenlijst met
 *        statusbadges, bewijspaneel (scores, declaratie, poort-uitkomsten);
 *        sneltoetsen A/R/U/pijltjes incl. typing-guard; aria-selected op de lijst.
 *   AC2/AC3  afkeuren/vrijgeven roept candidates/:id/decision aan; faalpad-toast.
 *   AC4  auto-advance naar de volgende onbeoordeelde; "Batch afsluiten" disabled
 *        tot alles beoordeeld; samenvattingsmodal-tekst.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: Record<string, unknown> & { defaultValue?: string }) => {
      let s = opts?.defaultValue ?? _key;
      if (opts) {
        for (const [k, v] of Object.entries(opts)) {
          if (k === 'defaultValue') continue;
          s = s.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v));
        }
      }
      return s;
    },
    i18n: { language: 'nl', changeLanguage: vi.fn() },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// react-router: vaste batch-id + spybare navigate.
const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'batch-1' }),
  useNavigate: () => navigate,
}));

const fetchBatchDetail = vi.fn();
const decideCandidate = vi.fn();
const closeBatch = vi.fn();
const fetchCandidateCropBlob = vi.fn();
const fetchReferenceCodeImageBlob = vi.fn();

vi.mock('@/services/flywheelService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/flywheelService')>();
  return {
    ...actual,
    fetchBatchDetail: (...a: unknown[]) => fetchBatchDetail(...a),
    decideCandidate: (...a: unknown[]) => decideCandidate(...a),
    closeBatch: (...a: unknown[]) => closeBatch(...a),
    fetchCandidateCropBlob: (...a: unknown[]) => fetchCandidateCropBlob(...a),
    fetchReferenceCodeImageBlob: (...a: unknown[]) => fetchReferenceCodeImageBlob(...a),
  };
});

import FlywheelBatchDetailPage from './FlywheelBatchDetailPage';

function candidate(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    t3777Code: 'RAINFOREST_ALLIANCE',
    status: 'in_batch',
    origin: 'crosscheck',
    hasCrop: false,
    hasReference: false,
    confidence: 0.94,
    method: 'embedding',
    sourceGtin: '8712345000048',
    sourceFile: 'pack.tif',
    bbox: null,
    declarationOutcome: 'confirmed',
    declaredCodes: ['RAINFOREST_ALLIANCE', 'EU_ORGANIC'],
    gln: '8712345000000',
    ...over,
  };
}

function detail(candidates: Array<Record<string, unknown>>) {
  return {
    batch: {
      batchId: 'batch-1abcdef',
      status: 'quarantined',
      createdAt: '2026-06-28T03:04:00.000Z',
      closedAt: null,
      candidateCount: candidates.length,
      failReason: 'Gold-set-regressietest: precisiedaling −1,8 pt',
      deltaPp: 1.8,
      mostAffectedClasses: ['EU_ORGANIC'],
      gateOutcomes: [
        { phase: 'cap', outcome: 'passed', blocked: false, label: 'per-klasse cap' },
        { phase: 'regression', outcome: 'rejected-some', blocked: true, label: 'gold-set-regressietest' },
      ],
    },
    candidates,
    promotionThresholds: { embedding: 0.9 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchCandidateCropBlob.mockResolvedValue(null);
  fetchReferenceCodeImageBlob.mockResolvedValue(null);
});

describe('AC1 — master-detail rendert conform mock-quarantaine.html', () => {
  it('toont faalreden, batchvoortgang, kandidatenlijst met badges en het bewijspaneel', async () => {
    fetchBatchDetail.mockResolvedValue(detail([candidate(), candidate({ id: 'c2', t3777Code: 'FSC_MIX' })]));
    render(<FlywheelBatchDetailPage />);

    await waitFor(() => expect(screen.getByTestId('batch-fail-reason')).toBeInTheDocument());
    expect(screen.getByTestId('batch-fail-reason')).toHaveTextContent('precisiedaling');
    expect(screen.getByTestId('batch-progress')).toBeInTheDocument();

    // Kandidatenlijst (master) met twee items + statusbadges.
    const list = screen.getByTestId('candidate-list');
    expect(within(list).getByTestId('candidate-item-0')).toBeInTheDocument();
    expect(within(list).getByTestId('candidate-item-1')).toBeInTheDocument();
    expect(within(list).getByTestId('candidate-badge-0')).toHaveTextContent('te beoordelen');

    // Bewijspaneel (detail): scores + declaratie + poort-uitkomsten.
    expect(screen.getByTestId('evidence-scores')).toHaveTextContent('0,94');
    expect(screen.getByTestId('evidence-declaration')).toHaveTextContent('8712345000048');
    expect(screen.getByTestId('gate-regression')).toHaveTextContent('geblokkeerd');
    expect(screen.getByTestId('gate-cap')).toHaveTextContent('gepasseerd');
  });

  it('aria-selected staat op de geselecteerde kandidaat (UX-DR9)', async () => {
    fetchBatchDetail.mockResolvedValue(detail([candidate(), candidate({ id: 'c2' })]));
    render(<FlywheelBatchDetailPage />);
    await waitFor(() => expect(screen.getByTestId('candidate-item-0')).toBeInTheDocument());
    expect(screen.getByTestId('candidate-item-0')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('candidate-item-1')).toHaveAttribute('aria-selected', 'false');
  });

  it('pijltjestoets → verschuift de selectie naar de volgende kandidaat', async () => {
    fetchBatchDetail.mockResolvedValue(detail([candidate(), candidate({ id: 'c2', t3777Code: 'FSC_MIX' })]));
    render(<FlywheelBatchDetailPage />);
    await waitFor(() => expect(screen.getByTestId('candidate-item-0')).toBeInTheDocument());

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(screen.getByTestId('candidate-item-1')).toHaveAttribute('aria-selected', 'true')
    );
  });

  it('typing-guard: een toets in een invoerveld triggert GEEN beslissing', async () => {
    fetchBatchDetail.mockResolvedValue(detail([candidate()]));
    render(<FlywheelBatchDetailPage />);
    await waitFor(() => expect(screen.getByTestId('evidence-panel')).toBeInTheDocument());

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: 'r' });
    expect(decideCandidate).not.toHaveBeenCalled();
    input.remove();
  });
});

describe('AC2/AC3 — afkeuren/vrijgeven + faalpad', () => {
  it('R keurt af via candidates/:id/decision (afkeuren)', async () => {
    fetchBatchDetail.mockResolvedValue(detail([candidate(), candidate({ id: 'c2' })]));
    decideCandidate.mockResolvedValue({ candidateId: 'c1', status: 'rejected', decision: 'afkeuren' });
    render(<FlywheelBatchDetailPage />);
    await waitFor(() => expect(screen.getByTestId('evidence-panel')).toBeInTheDocument());

    fireEvent.keyDown(window, { key: 'r' });
    await waitFor(() => expect(decideCandidate).toHaveBeenCalledWith('c1', 'afkeuren'));
  });

  it('A geeft vrij via candidates/:id/decision (vrijgeven)', async () => {
    fetchBatchDetail.mockResolvedValue(detail([candidate(), candidate({ id: 'c2' })]));
    decideCandidate.mockResolvedValue({ candidateId: 'c1', status: 'candidate', decision: 'vrijgeven' });
    render(<FlywheelBatchDetailPage />);
    await waitFor(() => expect(screen.getByTestId('evidence-panel')).toBeInTheDocument());

    fireEvent.keyDown(window, { key: 'a' });
    await waitFor(() => expect(decideCandidate).toHaveBeenCalledWith('c1', 'vrijgeven'));
  });

  it('faalpad: een falende beslissing toont een toast en houdt de kandidaat op "te beoordelen"', async () => {
    fetchBatchDetail.mockResolvedValue(detail([candidate()]));
    decideCandidate.mockRejectedValue(new Error('409'));
    render(<FlywheelBatchDetailPage />);
    await waitFor(() => expect(screen.getByTestId('evidence-panel')).toBeInTheDocument());

    fireEvent.keyDown(window, { key: 'r' });
    await waitFor(() =>
      expect(screen.getByText('Beslissing niet opgeslagen — opnieuw proberen')).toBeInTheDocument()
    );
    // Kandidaat blijft te beoordelen (geen status-mutatie).
    expect(screen.getByTestId('candidate-badge-0')).toHaveTextContent('te beoordelen');
  });
});

describe('AC4 — auto-advance + Batch afsluiten', () => {
  it('na een beslissing springt de selectie naar de volgende ONBEOORDEELDE kandidaat', async () => {
    fetchBatchDetail.mockResolvedValue(
      detail([candidate(), candidate({ id: 'c2', t3777Code: 'FSC_MIX' }), candidate({ id: 'c3', t3777Code: 'MSC_LABEL' })])
    );
    decideCandidate.mockResolvedValue({ candidateId: 'c1', status: 'rejected', decision: 'afkeuren' });
    render(<FlywheelBatchDetailPage />);
    await waitFor(() => expect(screen.getByTestId('candidate-item-0')).toBeInTheDocument());

    fireEvent.keyDown(window, { key: 'r' });
    // c1 afgekeurd → selectie naar c2 (index 1), de volgende onbeoordeelde.
    await waitFor(() =>
      expect(screen.getByTestId('candidate-item-1')).toHaveAttribute('aria-selected', 'true')
    );
  });

  it('"Batch afsluiten" is disabled zolang niet alles beoordeeld is', async () => {
    fetchBatchDetail.mockResolvedValue(detail([candidate(), candidate({ id: 'c2' })]));
    render(<FlywheelBatchDetailPage />);
    await waitFor(() => expect(screen.getByTestId('close-batch-button')).toBeInTheDocument());
    expect(screen.getByTestId('close-batch-button')).toBeDisabled();
  });

  it('"Batch afsluiten" wordt actief zodra alles beoordeeld is en toont de samenvattingsmodal', async () => {
    fetchBatchDetail.mockResolvedValue(
      detail([candidate({ status: 'rejected' }), candidate({ id: 'c2', status: 'candidate' })])
    );
    closeBatch.mockResolvedValue({ batchId: 'batch-1', closedAt: 'x', rejected: 1, released: 1 });
    render(<FlywheelBatchDetailPage />);
    await waitFor(() => expect(screen.getByTestId('close-batch-button')).toBeInTheDocument());

    const btn = screen.getByTestId('close-batch-button');
    expect(btn).not.toBeDisabled();
    await userEvent.click(btn);

    await waitFor(() => expect(screen.getByTestId('close-summary-text')).toBeInTheDocument());
    // 1 afgekeurd → hard-negative; 1 vrijgegeven → nieuwe promotiebatch.
    expect(screen.getByTestId('close-summary-text')).toHaveTextContent('1 afgekeurd');
    expect(screen.getByTestId('close-summary-text')).toHaveTextContent('1 vrijgegeven');
  });

  it('bevestigen in de samenvattingsmodal roept closeBatch aan en navigeert terug', async () => {
    fetchBatchDetail.mockResolvedValue(
      detail([candidate({ status: 'rejected' }), candidate({ id: 'c2', status: 'candidate' })])
    );
    closeBatch.mockResolvedValue({ batchId: 'batch-1', closedAt: 'x', rejected: 1, released: 1 });
    render(<FlywheelBatchDetailPage />);
    await waitFor(() => expect(screen.getByTestId('close-batch-button')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('close-batch-button'));
    await waitFor(() => expect(screen.getByTestId('close-summary-confirm')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('close-summary-confirm'));

    await waitFor(() => expect(closeBatch).toHaveBeenCalledWith('batch-1'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/flywheel'));
  });
});
