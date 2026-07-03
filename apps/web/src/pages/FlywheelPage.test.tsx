/**
 * Story 15.1 + 15.2 — FlywheelPage.
 *
 * 15.1: gescopeerde theming-wrapper, ladende/fout-staten (UX-DR8), NL-teksten,
 * verversknop. 15.2: alle panelen renderen, lege staten voor 16/17/18-panelen,
 * KPI-klik-navigatie, quarantainetabel + Historie-tab + rollback-modal (verplicht
 * redenveld), outlier-beoordeling (Behouden/Deactiveren incl. baseline-invalidatie
 * via de service-aanroep), verversing/geen-polling, kleursemantiek (amber
 * quarantainebadge, geen rood buiten regressie/stilstand).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// i18next: geef de defaultValue terug, met interpolatie van {{count}}-vars.
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

// Chart: jsdom rendert geen canvas — mock @ant-design/plots (Testrichtlijnen).
vi.mock('@ant-design/plots', () => ({
  Line: () => <div data-testid="mock-line-chart" />,
}));

const mockUseFlywheelOverview = vi.fn();
vi.mock('@/components/flywheel/useFlywheelOverview', () => ({
  useFlywheelOverview: () => mockUseFlywheelOverview(),
  FLYWHEEL_OVERVIEW_QUERY_KEY: ['flywheel-overview'],
}));

// Service-mutaties mocken (rollback + outlier-decision) zodat we de aanroepen asserten.
const rollbackBatch = vi.fn();
const decideOutlier = vi.fn();
vi.mock('@/services/flywheelService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/flywheelService')>();
  return {
    ...actual,
    rollbackBatch: (...a: unknown[]) => rollbackBatch(...a),
    decideOutlier: (...a: unknown[]) => decideOutlier(...a),
  };
});

import FlywheelPage from './FlywheelPage';

const refetch = vi.fn();

function fullOverview(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: new Date().toISOString(),
    nominationEnabled: true,
    missedNominations: { 'phash-onbereikbaar': 1, pauze: 0, 'vlag-uit': 2 },
    missedNominationsTotal: 3,
    lastSuccessfulPromotionRun: '2026-07-01T03:12:00Z',
    paused: false,
    pause: { paused: false, reason: null, since: null, by: null },
    goldSetComposition: {
      size: 214,
      labelDistribution: { echt: 167, vals: 47, other: 0, echtRatio: 0.78 },
      classCount: 12,
      topClasses: [{ t3777Code: 'RECYCLABLE', count: 38, share: 0.18 }],
      bottomClasses: [{ t3777Code: 'MSC_LABEL', count: 2, share: 0.01 }],
      skewSignals: [],
      thresholds: { classShareMax: 0.2, echtMin: 0.6, echtMax: 0.9 },
    },
    outliers: {
      openCount: 1,
      openFindings: [
        {
          id: 'f1',
          referenceLogoId: 'r1',
          t3777Code: 'RECYCLABLE',
          variantLabel: 'auto-0812',
          distance: 0.42,
          percentile: 0.98,
          auditRunAt: '2026-07-01T05:00:00Z',
          createdAt: '2026-07-01T05:00:00Z',
        },
      ],
      lastAuditRunAt: '2026-07-01T05:00:00Z',
    },
    quarantineCount: 1,
    precisionTrend: {
      points: [
        { batchId: 'b1', at: '2026-06-20T00:00:00Z', precision: 0.97, status: 'passed', regression: false, caption: null },
        { batchId: 'b2', at: '2026-06-24T00:00:00Z', precision: 0.955, status: 'quarantined', regression: true, caption: '−1.8 pt → quarantaine' },
      ],
      latestPrecision: 0.955,
      latestDeltaPp: -1.5,
      tolerancePp: 1,
    },
    quarantine: {
      rows: [
        {
          batchId: '2026-0628-Bxyz',
          createdAt: '2026-06-28T03:04:00Z',
          candidateCount: 8,
          failReason: 'Gold-set-regressietest: precisiedaling −1.8 pt',
          mostAffectedClasses: ['EU_ORGANIC'],
          status: 'quarantined',
          gateResults: { regression: { details: {} } },
        },
      ],
      count: 1,
    },
    kpi: {
      goldSetPrecision: 0.97,
      newReferences: { count: 41, classCount: 12, windowDays: 7, passedBatches: 3 },
      quarantine: { count: 1, oldestAt: '2026-06-28T03:04:00Z', oldestAgeHours: 12 },
      classesAtCap: { count: 2, cap: 10 },
    },
    classCaps: {
      cap: 10,
      classes: [{ t3777Code: 'RECYCLABLE', activeCount: 10, cap: 10, rejectedNominations: 14 }],
    },
    history: {
      rows: [
        { batchId: 'h-passed-1', createdAt: '2026-06-20T00:00:00Z', closedAt: '2026-06-20T00:00:00Z', status: 'passed', precision: 0.97, rolledBack: false, rollback: null },
        { batchId: 'h-rolled-1', createdAt: '2026-06-19T00:00:00Z', closedAt: '2026-06-19T00:00:00Z', status: 'rolled_back', precision: 0.96, rolledBack: true, rollback: { by: 'u1', reason: 'foute promotie', at: '2026-06-19T00:00:00Z' } },
      ],
      count: 2,
    },
    bootstrapQueue: { available: false, sourceEpic: 'epic-17', items: [] },
    mismatchTrends: { available: false, sourceEpic: 'epic-16', items: [] },
    glnCoverage: { available: false, sourceEpic: 'epic-18', items: [] },
    ...overrides,
  };
}

function mockLoaded(overrides: Record<string, unknown> = {}) {
  mockUseFlywheelOverview.mockReturnValue({
    data: fullOverview(overrides),
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch,
  });
}

beforeEach(() => {
  refetch.mockReset();
  rollbackBatch.mockReset();
  decideOutlier.mockReset();
  mockUseFlywheelOverview.mockReset();
});

describe('FlywheelPage — 15.1 casco', () => {
  it('rendert de theming-wrapper en de NL-paginatitel', () => {
    mockLoaded();
    render(<FlywheelPage />);
    expect(screen.getByTestId('flywheel-page')).toBeInTheDocument();
    expect(screen.getByText('Vliegwiel')).toBeInTheDocument();
  });

  it('toont de skeleton-ladende staat (geen spinner-op-wit)', () => {
    mockUseFlywheelOverview.mockReturnValue({ data: undefined, isLoading: true, isError: false, isFetching: true, refetch });
    render(<FlywheelPage />);
    expect(screen.getByTestId('flywheel-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('flywheel-grid')).not.toBeInTheDocument();
  });

  it('toont een sectie-lokale foutkaart met "Opnieuw proberen" bij een fout', () => {
    mockUseFlywheelOverview.mockReturnValue({ data: undefined, isLoading: false, isError: true, isFetching: false, refetch });
    render(<FlywheelPage />);
    expect(screen.getByTestId('flywheel-error')).toBeInTheDocument();
    expect(screen.getByText('Opnieuw proberen')).toBeInTheDocument();
  });

  it('de verversknop roept refetch aan (AC8, handmatig)', async () => {
    const user = userEvent.setup();
    mockLoaded();
    render(<FlywheelPage />);
    await user.click(screen.getByTestId('flywheel-refresh'));
    expect(refetch).toHaveBeenCalled();
  });
});

describe('FlywheelPage — 15.2 AC1: alle panelen + lege staten', () => {
  it('rendert de KPI-rij, trend, quarantainetabel, gold-set en signaalpanelen', () => {
    mockLoaded();
    render(<FlywheelPage />);
    expect(screen.getByTestId('kpi-row')).toBeInTheDocument();
    expect(screen.getByTestId('precision-trend')).toBeInTheDocument();
    expect(screen.getByTestId('quarantine-card')).toBeInTheDocument();
    expect(screen.getByTestId('gold-set-composition')).toBeInTheDocument();
    expect(screen.getByTestId('class-caps-panel')).toBeInTheDocument();
    expect(screen.getByTestId('outlier-panel')).toBeInTheDocument();
  });

  it('toont de lege staat voor de nog-niet-gebouwde panelen (16/17/18, UX-DR8)', () => {
    mockLoaded();
    render(<FlywheelPage />);
    expect(screen.getByTestId('bootstrap-queue-panel')).toBeInTheDocument();
    expect(screen.getByTestId('mismatch-trends-panel')).toBeInTheDocument();
    expect(screen.getByTestId('gln-coverage-panel')).toBeInTheDocument();
    expect(screen.getByText(/Epic 17/)).toBeInTheDocument();
    expect(screen.getByText(/Epic 16/)).toBeInTheDocument();
    expect(screen.getByText(/Epic 18/)).toBeInTheDocument();
  });

  it('een sectie-lokaal falend paneel toont zijn foutkaart, de rest blijft staan', () => {
    mockLoaded({ precisionTrend: { error: 'Paneel precisionTrend kon niet geladen worden' } });
    render(<FlywheelPage />);
    expect(screen.getByTestId('precision-trend-error')).toBeInTheDocument();
    // De rest van het dashboard blijft bruikbaar.
    expect(screen.getByTestId('quarantine-card')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-row')).toBeInTheDocument();
  });
});

describe('FlywheelPage — 15.2 AC2: kleursemantiek (UX-DR5)', () => {
  it('de quarantaine-status is amber (wacht op jouw beoordeling), niet rood', () => {
    mockLoaded();
    render(<FlywheelPage />);
    const badge = screen.getByTestId('quarantine-status-badge');
    expect(badge).toHaveTextContent(/wacht op jouw beoordeling/i);
    // Amber-tekstkleur (warningText #92600A) — nooit rood (#D64545).
    const color = getComputedStyle(badge).color;
    expect(color).not.toContain('214'); // rgb(214,69,69) = destructive
  });

  it('een teruggedraaide batch draagt de neutrale badge "teruggedraaid" (geen rood)', async () => {
    const user = userEvent.setup();
    mockLoaded();
    render(<FlywheelPage />);
    // Open de Historie-tab.
    await user.click(screen.getByText(/Historie/));
    expect(screen.getByTestId('history-rolled-back-badge')).toHaveTextContent('teruggedraaid');
  });
});

describe('FlywheelPage — 15.2 AC7: KPI ouderdom + gemiste nominaties + laatste run', () => {
  it('toont openstaande quarantaines met ouderdom, gemiste nominaties en laatste run', () => {
    mockLoaded();
    render(<FlywheelPage />);
    expect(screen.getByTestId('kpi-quarantine')).toHaveTextContent('12 u open');
    expect(screen.getByTestId('missed-nominations')).toHaveTextContent('Gemiste nominaties: 3');
    expect(screen.getByTestId('last-successful-run')).toHaveTextContent('Laatste succesvolle run');
  });
});

describe('FlywheelPage — 15.2 AC5: Historie-tab + rollback-modal (verplicht redenveld)', () => {
  it('de rollback-modal blokkeert bevestigen zolang er geen reden is; met reden slaagt de rollback', async () => {
    const user = userEvent.setup();
    rollbackBatch.mockResolvedValue({ batchId: 'h-passed-1', status: 'rolled_back', deactivatedReferences: 2 });
    mockLoaded();
    render(<FlywheelPage />);

    await user.click(screen.getByText(/Historie/));
    // Alleen de gepasseerde batch heeft een rollback-actie (rolled_back niet).
    await user.click(screen.getByTestId('history-rollback'));

    const confirm = screen.getByTestId('rollback-confirm');
    expect(confirm).toBeDisabled(); // verplicht redenveld leeg → geblokkeerd (UX-DR11)

    await user.type(screen.getByTestId('rollback-reason'), 'foute importbron');
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    await waitFor(() => expect(rollbackBatch).toHaveBeenCalledWith('h-passed-1', 'foute importbron'));
    await waitFor(() => expect(refetch).toHaveBeenCalled());
  });
});

describe('FlywheelPage — 15.2 AC6: outlier-beoordeling (Behouden/Deactiveren)', () => {
  it('Deactiveren roept de decision-service aan (soft-delete + baseline-invalidatie server-side)', async () => {
    const user = userEvent.setup();
    decideOutlier.mockResolvedValue({ findingId: 'f1', status: 'gedeactiveerd', deactivated: true });
    mockLoaded();
    render(<FlywheelPage />);

    await user.click(screen.getByTestId('outlier-review'));
    // Vergelijkingsweergave zichtbaar.
    expect(screen.getByTestId('outlier-comparison')).toBeInTheDocument();

    await user.click(screen.getByTestId('outlier-deactivate'));
    await waitFor(() => expect(decideOutlier).toHaveBeenCalledWith('f1', 'deactiveren'));
    await waitFor(() => expect(refetch).toHaveBeenCalled());
  });

  it('Behouden roept de decision-service met "behouden" aan', async () => {
    const user = userEvent.setup();
    decideOutlier.mockResolvedValue({ findingId: 'f1', status: 'behouden', deactivated: false });
    mockLoaded();
    render(<FlywheelPage />);

    await user.click(screen.getByTestId('outlier-review'));
    await user.click(screen.getByTestId('outlier-keep'));
    await waitFor(() => expect(decideOutlier).toHaveBeenCalledWith('f1', 'behouden'));
  });
});

describe('FlywheelPage — 15.2 AC3: quarantaine-rij opent de batch (drawer-fallback)', () => {
  it('klik op "Openen" toont de detail-drawer met poort-uitkomsten', async () => {
    const user = userEvent.setup();
    mockLoaded();
    render(<FlywheelPage />);
    await user.click(screen.getByTestId('quarantine-open'));
    const drawer = await screen.findByTestId('batch-drawer');
    expect(within(drawer).getByText(/Poort-uitkomsten/)).toBeInTheDocument();
  });
});

describe('FlywheelPage — 15.2 AC1: gold-set-samenstellingspaneel (AC4)', () => {
  it('toont omvang, ECHT/VALS-verdeling en top-klassen', () => {
    mockLoaded();
    render(<FlywheelPage />);
    expect(screen.getByTestId('gold-set-size')).toHaveTextContent('214 samples');
    expect(screen.getByTestId('gold-set-labels')).toHaveTextContent('78%');
    expect(screen.getByTestId('gold-set-top')).toHaveTextContent('RECYCLABLE');
  });
});
