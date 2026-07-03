/**
 * Gold-set-samenstellingsbewaking (Story 14.2, FR-11).
 *
 * De datamanager wil zicht op omvang én scheefgroei van de goudstandaard, zodat
 * duidelijk is of de regressietest (13.5) nog op een gezond meetinstrument
 * draait. Dit is een PURE, ON-READ berekening (AC 4): geen BullMQ-job, geen
 * scheduler, geen caching (AD-6 wordt bewust niet geraakt). De overview-route
 * roept `getGoldSetComposition()` aan bij elk `GET /overview`.
 *
 * Bindende AD's:
 *   AD-4   De actieve gold-set = uitsluitend records met `replacedById IS NULL`.
 *          Deze module resolvet die NOOIT zelf — ze leunt op de ENE resolver
 *          `getActiveGoldSet()` in `gold-set.ts` (13.3). Eén canonieke definitie
 *          van "actief" houdt de meting reproduceerbaar.
 *   AD-13  De poort-uitkomsten in `promotion_batches.gateResults` (JSONB); de
 *          dekkings-markering (AC 3) is daar een extra, niet-blokkerend item.
 *   AD-2   API bezit de state; geen ml-service-werk in deze story.
 *
 * Contract voor Story 15.2 (dashboard-afnemer): de payload-vorm hier bepaalt het
 * paneel-contract `goldSetComposition`. Houd de sleutels stabiel.
 */

import { createLogger } from '../../core/logger';
import { getActiveGoldSet } from './gold-set';
import {
  getGoldSetClassShareMax,
  getGoldSetEchtMin,
  getGoldSetEchtMax,
} from './config';

const logger = createLogger('flywheel-gold-set-composition');

/** Eén klasse-telling in de verdeling. */
export interface ClassCount {
  t3777Code: string;
  count: number;
  /** Aandeel van de totale actieve set (0–1); 0 bij lege set. */
  share: number;
}

/** Type scheefgroei-signaal (FR-11). */
export type SkewSignalType = 'klasse-oververtegenwoordigd' | 'echt-aandeel-buiten-band' | 'set-leeg';

/**
 * Eén gestructureerd scheefgroei-signaal. Vorm bewust vlak zodat het 15.2-paneel
 * ze 1-op-1 kan tonen: `waarde` is de gemeten fractie, `drempel` de overschreden
 * grens (voor de band-check: de overschreden kant).
 */
export interface SkewSignal {
  type: SkewSignalType;
  /** Alleen bij een klasse-signaal gezet. */
  klasse?: string;
  /** De gemeten waarde (fractie 0–1). Bij 'set-leeg' is dit 0. */
  waarde: number;
  /** De overschreden drempel (fractie 0–1). Bij 'set-leeg' is dit 0. */
  drempel: number;
}

/** De volledige samenstellingsbewaking-payload (paneel `goldSetComposition`). */
export interface GoldSetComposition {
  /** Totale omvang van de actieve gold-set. */
  size: number;
  /** ECHT/VALS-verdeling: aantallen + ECHT-ratio (0–1; 0 bij lege set). */
  labelDistribution: {
    echt: number;
    vals: number;
    /** Overige/onbekende labels (defensief; hoort er in praktijk niet te zijn). */
    other: number;
    echtRatio: number;
  };
  /** Aantal onderscheiden klassen in de actieve set. */
  classCount: number;
  /** Top-5 meest vertegenwoordigde klassen (aflopend op count). */
  topClasses: ClassCount[];
  /** Top-5 minst vertegenwoordigde klassen (oplopend op count). */
  bottomClasses: ClassCount[];
  /** Scheefgroei-signalen (leeg = gezond). */
  skewSignals: SkewSignal[];
  /** De drempels waarmee gemeten is (transparantie voor het dashboard). */
  thresholds: {
    classShareMax: number;
    echtMin: number;
    echtMax: number;
  };
}

/** Hoeveel klassen in de top/bottom-lijsten (FR-11: top-5). */
const TOP_N = 5;

const LABEL_ECHT = 'ECHT';
const LABEL_VALS = 'VALS';

/**
 * Bereken de samenstellingsbewaking over een reeds geresolvede, actieve gold-set.
 * Pure functie (geen I/O) — deterministisch en makkelijk te testen op fixtures.
 *
 * @param records  de actieve gold-set (records met `replacedById IS NULL`).
 * @param thresholds  de scheefgroei-drempels (env-config, ingespoten door de
 *   aanroeper zodat de berekening zelf drempel-agnostisch en testbaar is).
 */
export function computeGoldSetComposition(
  records: Array<{ label: string; t3777Code: string }>,
  thresholds: { classShareMax: number; echtMin: number; echtMax: number }
): GoldSetComposition {
  const size = records.length;

  // ECHT/VALS-verdeling — geen deling door nul bij lege set.
  let echt = 0;
  let vals = 0;
  let other = 0;
  for (const r of records) {
    if (r.label === LABEL_ECHT) echt += 1;
    else if (r.label === LABEL_VALS) vals += 1;
    else other += 1;
  }
  const echtRatio = size > 0 ? echt / size : 0;

  // Klasse-verdeling.
  const perClass = new Map<string, number>();
  for (const r of records) {
    perClass.set(r.t3777Code, (perClass.get(r.t3777Code) ?? 0) + 1);
  }

  // Stabiele sortering: op count (top: aflopend, bottom: oplopend), tie-break op
  // t3777Code alfabetisch zodat de lijsten deterministisch zijn.
  const allClasses: ClassCount[] = Array.from(perClass.entries()).map(
    ([t3777Code, count]) => ({
      t3777Code,
      count,
      share: size > 0 ? count / size : 0,
    })
  );

  const topClasses = [...allClasses]
    .sort((a, b) => b.count - a.count || a.t3777Code.localeCompare(b.t3777Code))
    .slice(0, TOP_N);

  const bottomClasses = [...allClasses]
    .sort((a, b) => a.count - b.count || a.t3777Code.localeCompare(b.t3777Code))
    .slice(0, TOP_N);

  // Scheefgroei-signalen.
  const skewSignals: SkewSignal[] = [];

  if (size === 0) {
    // Lege set: één expliciet signaal i.p.v. een misleidende "alles gezond".
    skewSignals.push({ type: 'set-leeg', waarde: 0, drempel: 0 });
  } else {
    // Klasse > share-max (grens INCLUSIEF: exact op de drempel is nog gezond).
    for (const c of allClasses) {
      if (c.share > thresholds.classShareMax) {
        skewSignals.push({
          type: 'klasse-oververtegenwoordigd',
          klasse: c.t3777Code,
          waarde: c.share,
          drempel: thresholds.classShareMax,
        });
      }
    }
    // ECHT-aandeel buiten [min, max] (grenzen INCLUSIEF).
    if (echtRatio < thresholds.echtMin) {
      skewSignals.push({
        type: 'echt-aandeel-buiten-band',
        waarde: echtRatio,
        drempel: thresholds.echtMin,
      });
    } else if (echtRatio > thresholds.echtMax) {
      skewSignals.push({
        type: 'echt-aandeel-buiten-band',
        waarde: echtRatio,
        drempel: thresholds.echtMax,
      });
    }
  }

  // Deterministische signaal-volgorde: klasse-signalen alfabetisch, band-signaal
  // erna (relevant voor snapshot-achtige asserts en 15.2-weergave).
  skewSignals.sort((a, b) => {
    const rank = (s: SkewSignalType) =>
      s === 'set-leeg' ? 0 : s === 'klasse-oververtegenwoordigd' ? 1 : 2;
    return rank(a.type) - rank(b.type) || (a.klasse ?? '').localeCompare(b.klasse ?? '');
  });

  return {
    size,
    labelDistribution: { echt, vals, other, echtRatio },
    classCount: perClass.size,
    topClasses,
    bottomClasses,
    skewSignals,
    thresholds: {
      classShareMax: thresholds.classShareMax,
      echtMin: thresholds.echtMin,
      echtMax: thresholds.echtMax,
    },
  };
}

/**
 * ON-READ samenstellingsbewaking (AC 1/2/4): resolvet de actieve gold-set via de
 * ENE 13.3-resolver (AD-4) en berekent de compositie met de env-drempels. Wordt
 * bij elke `GET /overview` aangeroepen — geen job, geen cache (AD-6 ongeraakt;
 * de set is ~100–300 records, ruim binnen een enkele query).
 *
 * Bewust GEEN `cropOnly`: de bewaking meet de VOLLEDIGE actieve set (crop- én
 * GTIN-niveau declaratie-ankers) — dat is het meetinstrument als geheel.
 */
export async function getGoldSetComposition(): Promise<GoldSetComposition> {
  const records = await getActiveGoldSet();
  const composition = computeGoldSetComposition(records, {
    classShareMax: getGoldSetClassShareMax(),
    echtMin: getGoldSetEchtMin(),
    echtMax: getGoldSetEchtMax(),
  });

  logger.info('Gold-set-samenstellingsbewaking berekend (on-read)', {
    size: composition.size,
    echtRatio: composition.labelDistribution.echtRatio,
    classCount: composition.classCount,
    skewSignals: composition.skewSignals.length,
  });

  return composition;
}

/**
 * Dekkings-check (AC 3): heeft de klasse `t3777Code` ENIGE dekking in de actieve
 * gold-set? Klein en geïsoleerd zodat de poortfase (13.4) hem per batch-klasse
 * kan aanroepen om een niet-blokkerend `gold-set-dekking-ontbreekt`-item te
 * schrijven — nooit om te blokkeren (dat zou de bootstrap van nieuwe klassen
 * onmogelijk maken, PRD §4.3).
 *
 * @param t3777Codes  de te controleren klassen (bijv. de klassen in een batch).
 * @returns de subset ZONDER enige dekking (leeg = alles gedekt).
 */
export async function findClassesWithoutGoldSetCoverage(
  t3777Codes: string[]
): Promise<string[]> {
  if (t3777Codes.length === 0) return [];
  const records = await getActiveGoldSet();
  const covered = new Set(records.map((r) => r.t3777Code));
  // Uniek + behoud van eerste-voorkomen-volgorde.
  const unique = Array.from(new Set(t3777Codes));
  return unique.filter((code) => !covered.has(code));
}
