/**
 * Story 15.1 — useFlywheelOverview (TanStack Query-hook, refetch-on-mount, geen
 * polling). Verifieert dat de hook het overzicht via de service ophaalt en de
 * quarantineCount teruggeeft.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const fetchMock = vi.fn();
vi.mock('@/services/flywheelService', () => ({
  fetchFlywheelOverview: () => fetchMock(),
}));

import { useFlywheelOverview, FLYWHEEL_OVERVIEW_QUERY_KEY } from './useFlywheelOverview';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useFlywheelOverview (Story 15.1)', () => {
  beforeEach(() => fetchMock.mockReset());

  it('exporteert een stabiele query-key', () => {
    expect(FLYWHEEL_OVERVIEW_QUERY_KEY).toEqual(['flywheel-overview']);
  });

  it('haalt het overzicht op en levert quarantineCount', async () => {
    fetchMock.mockResolvedValueOnce({ quarantineCount: 5 });
    const { result } = renderHook(() => useFlywheelOverview(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.quarantineCount).toBe(5);
  });
});
