/**
 * Overview-veld `quarantineCount` (Story 15.1, AC2) — het aantal openstaande
 * quarantainebatches dat de navigatie-badge "Vliegwiel" voedt.
 *
 * Openstaand = status `quarantined` én nog niet afgesloten (`closedAt IS NULL`):
 * een batch die de kwaliteitspoort blokkeerde en op de beoordeling van de
 * datamanager wacht. Zodra de batch afgehandeld is (afgesloten in Story 15.3),
 * valt hij uit deze telling — de badge weerspiegelt precies de openstaande
 * werkvoorraad.
 *
 * Modulariteit (coördinatie-noot epics): dit is één dunne sub-service-aanroep in
 * de `/overview`-route, geen logica in de route (Story 15.2 breidt dezelfde
 * route modulair uit). ON-READ, geen job.
 *
 * Afhankelijkheid: de `promotion_batches`-tabel komt uit Epic 13 (Story 13.4) en
 * bestaat hier al. Zou de tabel onverhoopt ontbreken, dan faalt de count
 * best-effort naar 0 zodat de badge (observability) de overview-flow nooit
 * breekt — conform het patroon van de gemiste-nominatie-teller.
 */

import prisma from '../../core/db';
import { createLogger } from '../../core/logger';

const logger = createLogger('flywheel-quarantine-count');

/**
 * Tel de openstaande quarantainebatches (status `quarantined`, niet afgesloten).
 * Faalt nooit hard: bij een leesfout retourneren we 0 (best-effort badge).
 */
export async function getQuarantineCount(): Promise<number> {
  try {
    return await prisma.promotionBatch.count({
      where: { status: 'quarantined', closedAt: null },
    });
  } catch (err) {
    logger.error('Kon quarantaine-count niet lezen (best-effort)', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return 0;
  }
}
