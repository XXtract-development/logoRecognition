/**
 * Story 15.1 + 15.2 — flywheelService (leest/muteert via de v1-client, AD-10).
 *
 * Story 15.2 breidt de service uit van "leest quarantineCount" naar het volledige
 * overzicht (panelen kunnen sectie-lokaal `{ error }` zijn — de service geeft de
 * payload ongewijzigd door; consumenten degraderen per paneel) plus de mutaties
 * rollback en outlier-decision.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock('@/services/apiClient', () => ({
  default: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
  },
}));

import { fetchFlywheelOverview, rollbackBatch, decideOutlier, isPanelError } from './flywheelService';

describe('fetchFlywheelOverview (Story 15.1/15.2)', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
  });

  it('haalt het overzicht op via /flywheel/overview en geeft de payload ongewijzigd door', async () => {
    getMock.mockResolvedValueOnce({ data: { quarantineCount: 4, generatedAt: 'now' } });
    const result = await fetchFlywheelOverview();
    expect(getMock).toHaveBeenCalledWith('/flywheel/overview');
    expect(result.quarantineCount).toBe(4);
    expect(result.generatedAt).toBe('now');
  });

  it('geeft een sectie-lokaal falend paneel als { error } door (consument degradeert)', async () => {
    getMock.mockResolvedValueOnce({ data: { precisionTrend: { error: 'kapot' } } });
    const result = await fetchFlywheelOverview();
    expect(isPanelError(result.precisionTrend)).toBe(true);
  });
});

describe('rollbackBatch (Story 15.2, AC5)', () => {
  beforeEach(() => postMock.mockReset());

  it('POST naar batches/:id/rollback met de reden', async () => {
    postMock.mockResolvedValueOnce({ data: { batchId: 'b1', status: 'rolled_back', deactivatedReferences: 2 } });
    const res = await rollbackBatch('b1', 'foute promotie');
    expect(postMock).toHaveBeenCalledWith('/flywheel/batches/b1/rollback', { reason: 'foute promotie' });
    expect(res.status).toBe('rolled_back');
  });
});

describe('decideOutlier (Story 15.2, AC6)', () => {
  beforeEach(() => postMock.mockReset());

  it('POST naar outliers/:id/decision met de beslissing', async () => {
    postMock.mockResolvedValueOnce({ data: { findingId: 'f1', status: 'gedeactiveerd', deactivated: true } });
    const res = await decideOutlier('f1', 'deactiveren');
    expect(postMock).toHaveBeenCalledWith('/flywheel/outliers/f1/decision', { decision: 'deactiveren' });
    expect(res.status).toBe('gedeactiveerd');
  });
});
