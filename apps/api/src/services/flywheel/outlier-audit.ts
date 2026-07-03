/**
 * Wekelijkse outlier-audit op de referentiebibliotheek (Story 14.3, FR-8/AD-9).
 *
 * De datamanager wil dat afwijkende referenties — óók handmatig gecureerde —
 * wekelijks gesignaleerd worden, zodat een RECYCLABLE-achtig incident (een
 * handmatig geplaatste, afwijkende referentie die de klasse vervuilt) voortaan
 * vooraf gevangen wordt. Deze module is de verwerkerslogica van de repeatable
 * job `flywheel-outlier-audit` (queue `flywheel`, concurrency 1, AD-6).
 *
 * Wat de audit WEL doet: per actieve klasse via de ml-service (bibliotheek-modus
 * van `/ml/outlier-audit`, AD-9) de cosine-afstand van elke actieve referentie
 * tot het klasse-centroid + de percentiel-rang binnen de klasse ophalen, de
 * drempels toepassen (percentiel ≥ `FLYWHEEL_OUTLIER_PERCENTILE` OF absolute
 * afstand > `FLYWHEEL_OUTLIER_ABS_DISTANCE`), en per treffer een
 * `outlier_findings`-rij (status `open`) persisteren met `auditRunAt` als
 * run-tijdstempel (NFR-5).
 *
 * Wat de audit NOOIT doet (FR-8, kritieke afbakening):
 *   - Referenties deactiveren of muteren. De ENIGE writes zijn
 *     `outlier_findings`-inserts. `reference_logos` wordt nergens geschreven.
 *   - De beoordelingsacties (Behouden/Deactiveren) uitvoeren — die verlopen via
 *     de dashboard-flow van Story 15.2 (endpoint `outliers/:id/decision`).
 *
 * Pauze-scope (AD-11, AC5): deze job doet BEWUST GEEN pauze-check. De audit is
 * read-only en valt buiten de pauze-scope — hij draait door terwijl het
 * vliegwiel gepauzeerd is. Laat een latere "consistentie-fix" hier NOOIT een
 * `getPauseState()`-guard inhangen: dat zou de vroegsignalering doven precies
 * wanneer (bij pauze door een incident) je die het hardst nodig hebt.
 *
 * Idempotentie (AC3-herstart-bestendigheid): her-run van dezelfde week voegt
 * GEEN duplicaat toe voor een referentie die al een `open` melding heeft — de
 * dedup is op (`referenceLogoId`, status `open`). Een reeds beoordeelde melding
 * (`behouden`/`gedeactiveerd`) blokkeert een nieuwe `open` melding niet: een
 * referentie die na een eerdere beslissing opnieuw afwijkt, verdient een nieuwe
 * melding.
 */

import prisma from '../../core/db';
import { createLogger } from '../../core/logger';
import { mlClient } from '../ml-client';
import {
  getOutlierPercentile,
  getOutlierAbsDistance,
  getOutlierMinClassSize,
} from './config';

const logger = createLogger('flywheel-outlier-audit');

/** Eén outlier-treffer, klaar om als `outlier_findings`-rij te persisteren. */
export interface OutlierHit {
  referenceLogoId: string;
  t3777Code: string;
  distance: number;
  percentile: number;
  /** Welke drempel(s) de treffer veroorzaakten (transparantie/logging). */
  reason: 'percentile' | 'absolute' | 'both';
}

/** Uitkomst van één audit-run. */
export interface OutlierAuditResult {
  auditRunAt: Date;
  /** Aantal geauditeerde actieve klassen. */
  classesAudited: number;
  /** Aantal referenties dat als outlier gemarkeerd is (over alle klassen). */
  outliersFound: number;
  /** Aantal daadwerkelijk nieuw gepersisteerde findings (na dedup op open). */
  findingsPersisted: number;
}

/**
 * Beslis, gegeven de vergelijkingsdata van de ml-service, welke referenties van
 * één klasse een outlier-melding verdienen. Pure functie (geen I/O) —
 * deterministisch en los te testen.
 *
 * Regels (AD-9):
 *   - Absolute grens: `distance > absDistance` → altijd een treffer, ongeacht
 *     klasse-grootte (vangt een klasse die als geheel ver van het centroid ligt).
 *   - Percentiel-grens: `percentile >= percentileThreshold` → treffer, MAAR
 *     alleen als de klasse ≥ `minClassSize` actieve referenties heeft. Onder die
 *     grens levert "top 5%" op een 1–2-referentie-klasse altijd een schijn-
 *     outlier; daar telt uitsluitend de absolute grens.
 *
 * `centroidSize` = het aantal referenties waarover het centroid berekend is
 * (== het aantal results); dat is de klasse-grootte voor de percentiel-poort.
 */
export function selectOutliers(
  t3777Code: string,
  results: Array<{ reference_logo_id: string; distance: number; percentile: number }>,
  thresholds: { percentileThreshold: number; absDistance: number; minClassSize: number }
): OutlierHit[] {
  const classSize = results.length;
  const percentileEligible = classSize >= thresholds.minClassSize;

  const hits: OutlierHit[] = [];
  for (const r of results) {
    const overAbsolute = r.distance > thresholds.absDistance;
    const overPercentile =
      percentileEligible && r.percentile >= thresholds.percentileThreshold;

    if (!overAbsolute && !overPercentile) continue;

    const reason: OutlierHit['reason'] =
      overAbsolute && overPercentile ? 'both' : overAbsolute ? 'absolute' : 'percentile';

    hits.push({
      referenceLogoId: r.reference_logo_id,
      t3777Code,
      distance: r.distance,
      percentile: r.percentile,
      reason,
    });
  }
  return hits;
}

/**
 * Voer één volledige audit-run uit (de job-handler roept dit aan).
 *
 * Flow:
 *   1. Alle distinct actieve klassen ophalen (plain read, AD-2 — de API bezit de
 *      state, dit is geen ml-werk).
 *   2. Per klasse de ml-service-bibliotheek-audit aanroepen (AD-9) en de drempels
 *      toepassen (`selectOutliers`).
 *   3. Per treffer een `open` finding persisteren, TENZIJ die referentie al een
 *      open finding heeft (dedup, AC3-idempotentie).
 *
 * Eén `auditRunAt`-tijdstempel voor de hele run (NFR-5). Een ml-fout op één
 * klasse laat de run niet vallen — die klasse wordt overgeslagen en gelogd, de
 * overige klassen worden gewoon geauditeerd (een audit die op één klasse crasht
 * mag de wekelijkse signalering niet blokkeren).
 */
export async function runOutlierAudit(): Promise<OutlierAuditResult> {
  const auditRunAt = new Date();
  const thresholds = {
    percentileThreshold: getOutlierPercentile(),
    absDistance: getOutlierAbsDistance(),
    minClassSize: getOutlierMinClassSize(),
  };

  // Distinct actieve klassen (referenties met active = true). Plain DB-read.
  const activeClasses = await prisma.referenceLogo.findMany({
    where: { active: true },
    distinct: ['t3777Code'],
    select: { t3777Code: true },
    orderBy: { t3777Code: 'asc' },
  });

  let outliersFound = 0;
  let findingsPersisted = 0;

  for (const { t3777Code } of activeClasses) {
    let audit;
    try {
      audit = await mlClient.outlierAuditLibrary({ t3777_code: t3777Code });
    } catch (err) {
      logger.error('Outlier-audit ml-aanroep mislukt voor klasse — klasse overgeslagen', {
        t3777Code,
        error: err instanceof Error ? err.message : 'unknown',
      });
      continue;
    }

    if (audit.centroid_size === 0 || audit.results.length === 0) {
      // Klasse zonder bruikbare actieve referentie — niets te auditen.
      continue;
    }

    const hits = selectOutliers(t3777Code, audit.results, thresholds);
    outliersFound += hits.length;

    for (const hit of hits) {
      // Dedup: bestaat er al een OPEN finding voor deze referentie? Dan geen
      // duplicaat (AC3-idempotentie). Een reeds beoordeelde melding telt niet
      // als open en blokkeert dus niet.
      const existingOpen = await prisma.outlierFinding.findFirst({
        where: { referenceLogoId: hit.referenceLogoId, status: 'open' },
        select: { id: true },
      });
      if (existingOpen) continue;

      await prisma.outlierFinding.create({
        data: {
          auditRunAt,
          referenceLogoId: hit.referenceLogoId,
          distance: hit.distance,
          percentile: hit.percentile,
          status: 'open',
        },
      });
      findingsPersisted += 1;
    }
  }

  logger.info('Wekelijkse outlier-audit voltooid', {
    auditRunAt: auditRunAt.toISOString(),
    classesAudited: activeClasses.length,
    outliersFound,
    findingsPersisted,
  });

  return {
    auditRunAt,
    classesAudited: activeClasses.length,
    outliersFound,
    findingsPersisted,
  };
}
