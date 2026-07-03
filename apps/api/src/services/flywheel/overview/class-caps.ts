/**
 * Overview-paneel `classCaps` (Story 15.2, AC1) — klassen aan hun per-klasse cap.
 *
 * Lijst van T3777-codes met het aantal actieve promotie-referenties op of boven
 * de cap (FR-6), plus het aantal nominaties dat om die reden geweigerd is
 * (kandidaten met status `rejected` en `evidence.rejectionReason='cap-bereikt'`).
 * Amber in de UI — géén fout (UX-DR5).
 *
 * Modulariteit (coördinatie-noot epics): één sub-service-aanroep in de route.
 * ON-READ, geen job. Best-effort: bij een leesfout een leeg paneel.
 */

import prisma from '../../../core/db';
import { createLogger } from '../../../core/logger';
import { getClassCap } from '../config';

const logger = createLogger('flywheel-class-caps');

/** Eén klasse aan cap. */
export interface ClassAtCap {
  t3777Code: string;
  /** Actieve promotie-referenties in deze klasse. */
  activeCount: number;
  /** De per-klasse cap. */
  cap: number;
  /** Aantal nominaties geweigerd wegens cap-bereikt. */
  rejectedNominations: number;
}

/** Het `classCaps`-paneel. */
export interface ClassCapsPanel {
  cap: number;
  classes: ClassAtCap[];
}

/**
 * Bouw het `classCaps`-paneel (AC1): klassen op/boven de cap + geweigerde
 * nominaties per klasse. Aflopend op geweigerde nominaties (drukste klasse boven).
 */
export async function getClassCapsPanel(): Promise<ClassCapsPanel> {
  const cap = getClassCap();
  try {
    const [activeByClass, rejectedByClass] = await Promise.all([
      prisma.referenceLogo.groupBy({
        by: ['t3777Code'],
        where: { active: true },
        _count: { _all: true },
      }),
      // Kandidaten die op cap-bereikt zijn afgewezen. De rejectionReason zit in
      // evidence (JSON) — filter met een JSON-path-equals.
      prisma.referenceCandidate.groupBy({
        by: ['t3777Code'],
        where: {
          status: 'rejected',
          evidence: { path: ['rejectionReason'], equals: 'cap-bereikt' },
        },
        _count: { _all: true },
      }),
    ]);

    const rejectedMap = new Map<string, number>(
      rejectedByClass.map((r) => [r.t3777Code, r._count._all])
    );

    const classes: ClassAtCap[] = activeByClass
      .filter((g) => g._count._all >= cap)
      .map((g) => ({
        t3777Code: g.t3777Code,
        activeCount: g._count._all,
        cap,
        rejectedNominations: rejectedMap.get(g.t3777Code) ?? 0,
      }))
      .sort(
        (a, b) =>
          b.rejectedNominations - a.rejectedNominations ||
          a.t3777Code.localeCompare(b.t3777Code)
      );

    logger.info('Klassen-aan-cap-paneel opgevraagd', { cap, count: classes.length });
    return { cap, classes };
  } catch (err) {
    logger.error('Kon klassen-aan-cap-paneel niet lezen (best-effort leeg)', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return { cap, classes: [] };
  }
}
