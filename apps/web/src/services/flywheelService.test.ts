/**
 * Story 15.1 — flywheelService (leest /flywheel/overview via de v1-client, AD-10).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getMock = vi.fn();
vi.mock('@/services/apiClient', () => ({
  default: { get: (...args: unknown[]) => getMock(...args) },
}));

import { fetchFlywheelOverview } from './flywheelService';

describe('fetchFlywheelOverview (Story 15.1)', () => {
  beforeEach(() => getMock.mockReset());

  it('haalt het overzicht op via /flywheel/overview en leest quarantineCount', async () => {
    getMock.mockResolvedValueOnce({ data: { quarantineCount: 4 } });
    const result = await fetchFlywheelOverview();
    expect(getMock).toHaveBeenCalledWith('/flywheel/overview');
    expect(result.quarantineCount).toBe(4);
  });

  it('valt terug op 0 als quarantineCount ontbreekt of geen getal is', async () => {
    getMock.mockResolvedValueOnce({ data: {} });
    expect((await fetchFlywheelOverview()).quarantineCount).toBe(0);

    getMock.mockResolvedValueOnce({ data: { quarantineCount: 'x' } });
    expect((await fetchFlywheelOverview()).quarantineCount).toBe(0);
  });
});
