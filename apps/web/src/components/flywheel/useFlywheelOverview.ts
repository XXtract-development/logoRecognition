/**
 * useFlywheelOverview (Story 15.1) — TanStack Query-hook voor het
 * vliegwiel-overzicht.
 *
 * Patroon conform RetrainingNotificationBanner: refetch-on-mount, GEEN polling
 * (het vliegwiel draait in batches, niet realtime — UX-DR8/Component Patterns).
 * Voedt zowel de navigatie-badge (aantal openstaande quarantainebatches) als de
 * lege/ladende staat van de FlywheelPage.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchFlywheelOverview, type FlywheelOverview } from '@/services/flywheelService';

export const FLYWHEEL_OVERVIEW_QUERY_KEY = ['flywheel-overview'] as const;

export function useFlywheelOverview() {
  return useQuery<FlywheelOverview>({
    queryKey: FLYWHEEL_OVERVIEW_QUERY_KEY,
    queryFn: fetchFlywheelOverview,
    refetchOnMount: true,
    staleTime: 30_000,
  });
}
