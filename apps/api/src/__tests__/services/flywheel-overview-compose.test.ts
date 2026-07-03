/**
 * Story 15.2 — overview-compositie (AC1, coördinatie-noot epics).
 *
 * De compositie roept alle paneel-sub-services aan en faalt SECTIE-LOKAAL: één
 * falend paneel levert `{ error }` in de payload i.p.v. een 500 op het geheel.
 * De overige panelen blijven intact. De response bevat een server-tijdstempel.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock één paneel-sub-service zodat we een sectie-lokale fout kunnen forceren.
vi.mock('../../services/flywheel/overview/precision-trend', () => ({
  getPrecisionTrend: vi.fn(),
}));

import { composeOverview, isPanelError } from '../../services/flywheel/overview';
import { getPrecisionTrend } from '../../services/flywheel/overview/precision-trend';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('composeOverview (AC1) — sectie-lokale fouttolerantie', () => {
  it('een falend paneel wordt { error }, de rest van de payload blijft intact', async () => {
    vi.mocked(getPrecisionTrend).mockRejectedValueOnce(new Error('trend kapot'));

    const overview = await composeOverview();

    // Het falende paneel is sectie-lokaal gemarkeerd.
    expect(isPanelError(overview.precisionTrend)).toBe(true);
    // De overige panelen zijn er gewoon (geen 500 op het geheel).
    expect(overview.quarantine).toBeDefined();
    expect(overview.kpi).toBeDefined();
    expect(overview.classCaps).toBeDefined();
    expect(overview.history).toBeDefined();
    // Lege-staat-panelen (UX-DR8).
    expect(overview.bootstrapQueue).toMatchObject({ available: false });
    expect(overview.mismatchTrends).toMatchObject({ available: false });
    expect(overview.glnCoverage).toMatchObject({ available: false });
    // Server-tijdstempel voor de "verouderde data"-melding (AC8).
    expect(typeof overview.generatedAt).toBe('string');
  });

  it('een gezond paneel komt ongewijzigd door de compositie', async () => {
    vi.mocked(getPrecisionTrend).mockResolvedValueOnce({
      points: [],
      latestPrecision: 0.97,
      latestDeltaPp: null,
      tolerancePp: 1,
    });

    const overview = await composeOverview();
    expect(isPanelError(overview.precisionTrend)).toBe(false);
    expect((overview.precisionTrend as { latestPrecision: number }).latestPrecision).toBe(0.97);
  });
});
