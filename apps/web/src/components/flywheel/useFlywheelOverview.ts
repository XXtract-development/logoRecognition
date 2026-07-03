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
import {
  fetchFlywheelOverview,
  fetchQuarantineCount,
  type FlywheelOverview,
} from '@/services/flywheelService';

export const FLYWHEEL_OVERVIEW_QUERY_KEY = ['flywheel-overview'] as const;
export const FLYWHEEL_QUARANTINE_COUNT_QUERY_KEY = ['flywheel-quarantine-count'] as const;

export function useFlywheelOverview() {
  return useQuery<FlywheelOverview>({
    queryKey: FLYWHEEL_OVERVIEW_QUERY_KEY,
    queryFn: fetchFlywheelOverview,
    refetchOnMount: true,
    staleTime: 30_000,
  });
}

/**
 * Lichte badge-teller-hook (Story 15.1). AppLayout mount op élke pagina; deze hook
 * haalt uitsluitend de goedkope `/flywheel/quarantine-count` op i.p.v. het volle
 * `/overview` (dat na Story 15.2 een 12-panel-aggregatie werd) — zo betaalt alleen
 * de /flywheel-pagina zelf voor de volledige compositie.
 */
export function useQuarantineBadgeCount() {
  return useQuery<number>({
    queryKey: FLYWHEEL_QUARANTINE_COUNT_QUERY_KEY,
    queryFn: fetchQuarantineCount,
    refetchOnMount: true,
    staleTime: 30_000,
  });
}
