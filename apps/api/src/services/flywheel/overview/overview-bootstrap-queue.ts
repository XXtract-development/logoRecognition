/**
 * Overview-paneel `bootstrapQueue` (Story 16.2, FR-15) — de structurele
 * werkvoorraad: codes die door de structureel-drempel (≥N declared-not-found-
 * events over ≥M verschillende GTINs) zijn bevorderd tot bootstrap-wachtrij (lege
 * klassen) of aanvul-signaal (zwakke klassen).
 *
 * Deze sub-service vervangt de lege stub `getBootstrapQueuePanel()` uit
 * `empty-panels.ts` (Story 15.2). Het draait de aggregatie ON-READ bij de overview-
 * aanroep (AD-6: geen nieuwe scheduler; 14.2-precedent), upsert de wachtrij
 * idempotent en levert de zichtbare wachtrij + aanvul-signalen. De paneel-UI zelf
 * komt uit 15.2/17.2; een lege staat is geldig.
 *
 * Modulariteit (coördinatie-noot epics): één sub-service-aanroep in de compositie;
 * geen logica in de route. Best-effort: bij een fout een leeg-maar-available paneel
 * (sectie-lokale degradatie, State Patterns) — een falende werkvoorraad-aggregatie
 * mag de rest van het dashboard niet breken.
 *
 * Epic 17 automatiseert de verwerking + het wachtrij-beheer-endpoint; 16.2 levert
 * uitsluitend de zichtbare, herleidbare werkvoorraad-data.
 */

import prisma from '../../../core/db';
import { createLogger } from '../../../core/logger';
import {
  runMismatchWorkloadAggregation,
  type RefillSignal,
} from '../mismatch-workload';

const logger = createLogger('flywheel-bootstrap-queue-panel');

/** Eén rij in de bootstrap-wachtrij (paneel-view). */
export interface BootstrapQueueRow {
  t3777Code: string;
  status: string;
  declarationFrequency: number;
  excluded: boolean;
  priorityOverride: number | null;
  lastRunAt: string | null;
  createdAt: string;
}

/** Het `bootstrapQueue`-paneel (werkvoorraad + aanvul-signalen). */
export interface BootstrapQueuePanel {
  /** Bron-epic gebouwd — nu true (verving de lege 15.2-stub). */
  available: true;
  /** De wachtrij-rijen (lege klassen), nieuwste boven — begrensd. */
  items: BootstrapQueueRow[];
  /** Aanvul-signalen: codes met actieve referenties maar zwakke dekking. */
  refillSignals: RefillSignal[];
}

/** Hoeveel wachtrij-rijen het paneel maximaal meestuurt. */
const MAX_ROWS = 200;

/** Sectie-lokaal een leeg-maar-available paneel zolang de aggregatie faalt. */
function emptyPanel(): BootstrapQueuePanel {
  return { available: true, items: [], refillSignals: [] };
}

/**
 * Bouw het `bootstrapQueue`-paneel (FR-15). Draait eerst de werkvoorraad-aggregatie
 * (on-read upsert, idempotent, excluded-guard) en leest daarna de actuele wachtrij.
 * Best-effort: bij een fout een leeg-maar-available paneel (State Patterns).
 */
export async function getBootstrapQueueOverview(): Promise<BootstrapQueuePanel> {
  try {
    const { refillSignals } = await runMismatchWorkloadAggregation();

    const rows = await prisma.bootstrapQueue.findMany({
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
      select: {
        t3777Code: true,
        status: true,
        declarationFrequency: true,
        excluded: true,
        priorityOverride: true,
        lastRunAt: true,
        createdAt: true,
      },
    });

    const items: BootstrapQueueRow[] = rows.map((r) => ({
      t3777Code: r.t3777Code,
      status: r.status,
      declarationFrequency: r.declarationFrequency,
      excluded: r.excluded,
      priorityOverride: r.priorityOverride,
      lastRunAt: r.lastRunAt ? r.lastRunAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));

    logger.info('Bootstrap-wachtrij-paneel opgevraagd', {
      items: items.length,
      refillSignals: refillSignals.length,
    });

    return { available: true, items, refillSignals };
  } catch (err) {
    logger.error('Kon bootstrap-wachtrij niet opbouwen (best-effort leeg paneel)', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return emptyPanel();
  }
}
