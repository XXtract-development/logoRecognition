/**
 * Story 17.2 (web-deel) — BootstrapQueuePanel.
 *
 * AC2-UI: rendert per klasse declaratiefrequentie + status (badge), in de door de
 *          API geleverde effectieve volgorde; uitsluiten/toevoegen via de service.
 * AC3/AC4-UI: "nieuw geactiveerde klasse"-melding met doorklik-navigatie naar
 *          /flywheel/batches/:code. Lege staat (UX-DR8). NL via i18next-keys.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
}));

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

// Service-laag mocken (endpoint-aanroepen asserten).
const fetchBootstrapQueue = vi.fn();
const setBootstrapExcluded = vi.fn();
const addBootstrapClass = vi.fn();
const enqueueBootstrapRun = vi.fn();
vi.mock('@/services/flywheelService', () => ({
  fetchBootstrapQueue: (...a: unknown[]) => fetchBootstrapQueue(...a),
  setBootstrapExcluded: (...a: unknown[]) => setBootstrapExcluded(...a),
  addBootstrapClass: (...a: unknown[]) => addBootstrapClass(...a),
  enqueueBootstrapRun: (...a: unknown[]) => enqueueBootstrapRun(...a),
}));

// useQuery: geef de gemockte fetch-uitkomst terug; refetch re-invoked de fetch.
const refetch = vi.fn();
let queryState: { data: unknown; isLoading: boolean; isError: boolean };
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ ...queryState, refetch }),
}));

import { App as AntApp } from 'antd';
import { BootstrapQueuePanel } from './BootstrapQueuePanel';

/** Wrap in antd <App> zodat App.useApp() (message) een context heeft. */
const renderPanel = () =>
  render(
    <AntApp>
      <BootstrapQueuePanel />
    </AntApp>
  );

function item(overrides: Record<string, unknown> = {}) {
  return {
    t3777Code: 'GREEN_DOT',
    status: 'wachtend',
    declarationFrequency: 11169,
    priorityOverride: null,
    excluded: false,
    lastRunAt: null,
    createdAt: '2026-07-01T00:00:00Z',
    newlyActivated: false,
    activatedBatchId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  queryState = { data: { items: [], newlyActivatedCodes: [] }, isLoading: false, isError: false };
});

describe('AC2-UI — render, sortering, statusbadges', () => {
  it('rendert per klasse frequentie + status in de door de API geleverde volgorde', () => {
    queryState.data = {
      items: [
        item({ t3777Code: 'HIGH', declarationFrequency: 100, status: 'wachtend' }),
        item({ t3777Code: 'FILLED', declarationFrequency: 5, status: 'gevuld' }),
        item({ t3777Code: 'EXCL', declarationFrequency: 1, status: 'uitgesloten', excluded: true }),
      ],
      newlyActivatedCodes: [],
    };
    renderPanel();

    const rows = screen.getAllByRole('row');
    // Header + 3 datarijen; volgorde = API-volgorde (component sorteert niet zelf).
    const bodyText = rows.map((r) => r.textContent).join('|');
    expect(bodyText.indexOf('HIGH')).toBeLessThan(bodyText.indexOf('FILLED'));
    expect(bodyText.indexOf('FILLED')).toBeLessThan(bodyText.indexOf('EXCL'));

    // Statusbadges per rij aanwezig.
    expect(screen.getByTestId('bootstrap-status-HIGH')).toHaveTextContent('wachtend');
    expect(screen.getByTestId('bootstrap-status-FILLED')).toHaveTextContent('gevuld');
    expect(screen.getByTestId('bootstrap-status-EXCL')).toHaveTextContent('uitgesloten');
  });

  it('lege wachtrij → lege staat (UX-DR8), geen tabel', () => {
    queryState.data = { items: [], newlyActivatedCodes: [] };
    renderPanel();
    expect(screen.queryByTestId('bootstrap-queue-table')).not.toBeInTheDocument();
    expect(screen.getByText(/Nog geen klassen in de wachtrij/i)).toBeInTheDocument();
  });

  it('uitsluiten roept de service aan en ververst', async () => {
    queryState.data = { items: [item({ t3777Code: 'A' })], newlyActivatedCodes: [] };
    setBootstrapExcluded.mockResolvedValue({});
    renderPanel();
    await userEvent.click(screen.getByTestId('bootstrap-exclude-A'));
    await waitFor(() => expect(setBootstrapExcluded).toHaveBeenCalledWith('A', true));
    expect(refetch).toHaveBeenCalled();
  });

  it('run agenderen roept enqueueBootstrapRun aan (taak 5)', async () => {
    queryState.data = { items: [item({ t3777Code: 'A' })], newlyActivatedCodes: [] };
    enqueueBootstrapRun.mockResolvedValue({ enqueued: true, t3777Code: 'A' });
    renderPanel();
    await userEvent.click(screen.getByTestId('bootstrap-enqueue-A'));
    await waitFor(() => expect(enqueueBootstrapRun).toHaveBeenCalledWith('A'));
  });

  it('klasse toevoegen via de modal roept addBootstrapClass aan', async () => {
    queryState.data = { items: [], newlyActivatedCodes: [] };
    addBootstrapClass.mockResolvedValue({});
    renderPanel();
    await userEvent.click(screen.getByTestId('bootstrap-add-open'));
    await userEvent.type(screen.getByTestId('bootstrap-add-input'), 'NEW_CODE');
    await userEvent.click(screen.getByTestId('bootstrap-add-submit'));
    await waitFor(() => expect(addBootstrapClass).toHaveBeenCalledWith('NEW_CODE'));
  });
});

describe('AC3/AC4-UI — nieuw geactiveerde klasse + doorklik', () => {
  it('toont de melding en navigeert bij doorklik naar de batch-detail op het batch-id (AC4)', async () => {
    // AC4: de doorklik moet naar de PROMOTIE-BATCH (UUID) — de batch-detail-route
    // resolvet op batch-id, niet op de T3777-code. De read-side levert `activatedBatchId`.
    queryState.data = {
      items: [
        item({
          t3777Code: 'ACTIVATED',
          status: 'gevuld',
          newlyActivated: true,
          activatedBatchId: 'batch-uuid-123',
        }),
      ],
      newlyActivatedCodes: ['ACTIVATED'],
    };
    renderPanel();

    const alert = screen.getByTestId('bootstrap-newly-activated-alert');
    expect(alert).toHaveTextContent('1 nieuw geactiveerde klasse');

    await userEvent.click(screen.getByTestId('bootstrap-drilldown-ACTIVATED'));
    expect(navigate).toHaveBeenCalledWith('/flywheel/batches/batch-uuid-123');
    // NOOIT op de T3777-code (dat zou een 404 op de batch-detail geven).
    expect(navigate).not.toHaveBeenCalledWith('/flywheel/batches/ACTIVATED');
  });

  it('nieuw-geactiveerd zonder batch-id → doorklik uitgeschakeld, geen navigatie', async () => {
    queryState.data = {
      items: [
        item({
          t3777Code: 'NOBATCH',
          status: 'gevuld',
          newlyActivated: true,
          activatedBatchId: null,
        }),
      ],
      newlyActivatedCodes: ['NOBATCH'],
    };
    renderPanel();

    const btn = screen.getByTestId('bootstrap-drilldown-NOBATCH');
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('zonder nieuw-geactiveerde klasse geen melding', () => {
    queryState.data = { items: [item({ t3777Code: 'A' })], newlyActivatedCodes: [] };
    renderPanel();
    expect(screen.queryByTestId('bootstrap-newly-activated-alert')).not.toBeInTheDocument();
  });
});

describe('laad-/foutstaten', () => {
  it('laden → skeleton', () => {
    queryState = { data: undefined, isLoading: true, isError: false };
    renderPanel();
    expect(screen.queryByTestId('bootstrap-queue-table')).not.toBeInTheDocument();
  });

  it('fout → foutmelding met opnieuw proberen', () => {
    queryState = { data: undefined, isLoading: false, isError: true };
    renderPanel();
    expect(screen.getByTestId('bootstrap-queue-error')).toBeInTheDocument();
  });
});
