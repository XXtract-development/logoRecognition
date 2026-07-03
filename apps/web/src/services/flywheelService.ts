/**
 * Flywheel Service (Story 15.1) — leest het vliegwiel-overzicht.
 *
 * Alle vliegwiel-reads gaan uitsluitend via `/api/v1/flywheel/*` (AD-10); de SPA
 * praat nooit rechtstreeks met ml-service of de database. Deze story gebruikt
 * alleen het `quarantineCount`-veld (nav-badge); Story 15.2 breidt het overzicht
 * uit met de inhoudelijke dashboard-panelen.
 */

import apiClient from '@/services/apiClient';

/**
 * Deelvorm van de `/flywheel/overview`-response die deze story consumeert.
 * Story 15.2 vult dit type aan met de overige panelen. Velden zijn optioneel/
 * defensief zodat een uitgebreidere backend-response deze story niet breekt.
 */
export interface FlywheelOverview {
  /** Aantal openstaande quarantainebatches (voedt de nav-badge). */
  quarantineCount: number;
}

/**
 * Haal het vliegwiel-overzicht op. Faalt de call, dan propageert de fout naar de
 * TanStack Query-consumer (die toont een lege/nul-badge — geen crash).
 */
export async function fetchFlywheelOverview(): Promise<FlywheelOverview> {
  const res = await apiClient.get<Partial<FlywheelOverview>>('/flywheel/overview');
  return {
    quarantineCount:
      typeof res.data?.quarantineCount === 'number' ? res.data.quarantineCount : 0,
  };
}
