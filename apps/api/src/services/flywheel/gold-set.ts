/**
 * Gold-set-service — referentie-vliegwiel (Story 13.3).
 *
 * De enige plek waar de goudstandaard (`gold_set_records`) wordt geresolved en
 * gemuteerd. De regressietest (13.5) en de reviewstation-aanwas (14.1) bouwen op
 * de functies hier; de ml-service leest de tabel NOOIT zelf (AD-4) en krijgt de
 * geresolvede set als request-payload.
 *
 * Bindende AD's:
 *   AD-4   Actieve gold-set = uitsluitend records zónder opvolger
 *          (`replacedById IS NULL`). Exact één canonieke definitie — GEEN
 *          keten-traversal. Resolutie leeft in apps/api, hier.
 *   AD-13  Records immutable. Herleidbaarheid via source/decidedBy/evidence.
 *   FR-10  De ENIGE toegestane mutatie is `replacedById` zetten op het OUDE
 *          record bij vervanging. Geen update op inhoudskolommen, geen delete.
 *
 * Immutability-contract (bewaakt door gold-set.guard.test.ts): deze module biedt
 * GEEN Prisma-`update` op inhoudskolommen en GEEN `delete`. Correctie = nieuw
 * record + `replacedById` (zie `replaceGoldSetRecord`). Latere ADDITIEVE
 * functies (zoals 14.1's `withdrawGoldSetRecord`) zijn toegestaan zolang ze de
 * immutability niet doorbreken.
 */

import prisma from '../../core/db';
import { createLogger } from '../../core/logger';

const logger = createLogger('flywheel-gold-set');

export interface GoldSetRecordData {
  /** ECHT | VALS (VarChar, geen enum — patroon ArtworkReviewItem.status). */
  label: string;
  t3777Code: string;
  /** Crop-verwijzing; NULL voor GTIN-niveau declaratie-ankers (AD-4). */
  cropPath?: string | null;
  /** Herkomst / dedup-bron, bijv. 'gold-set-oogstrun' of 'declared-marks-goldset'. */
  source: string;
  /** Wie de (vervangings)beslissing nam; NULL voor de eenmalige seed. */
  decidedBy?: string | null;
  /** Volledige bron-evidence zodat niets verloren gaat (AD-13). */
  evidence?: Record<string, unknown>;
}

export interface GoldSetRecord extends GoldSetRecordData {
  id: string;
  cropPath: string | null;
  decidedBy: string | null;
  replacedById: string | null;
  evidence: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Fout wanneer een vervanging op een reeds-vervangen (of niet-bestaand) actief
 * record wordt geprobeerd — de conditional update raakt 0 rijen. Nooit stil
 * overschrijven (dat zou immutability breken).
 */
export class GoldSetReplacementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoldSetReplacementError';
  }
}

/**
 * Resolveer de actieve gold-set (AD-4): uitsluitend records zónder opvolger
 * (`replacedById IS NULL`). Eén WHERE-clausule — geen keten-traversal.
 *
 * @param opts.cropOnly  Wanneer true: alleen crop-niveau-records (cropPath
 *   gezet). De 13.5-regressie-eval consumeert uitsluitend die records; de
 *   GTIN-niveau declaratie-ankers (cropPath NULL) worden dan overgeslagen.
 */
export async function getActiveGoldSet(
  opts: { cropOnly?: boolean } = {}
): Promise<GoldSetRecord[]> {
  const records = await prisma.goldSetRecord.findMany({
    where: {
      replacedById: null,
      ...(opts.cropOnly ? { cropPath: { not: null } } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  return records as unknown as GoldSetRecord[];
}

/**
 * Toegestane MENSELIJKE bronnen van gold-set-aanwas (Story 14.1, AD-12/AD-13).
 * Poort-afwijzingen (cap/duplicaat/outlier — Epic 13) horen NOOIT in de gold-set;
 * `recordReviewDecision` weigert daarom elke bron buiten deze verzameling hard.
 * `quarantaine` is opgenomen zodat Story 15.3 dezelfde aanwas-route kan aanroepen
 * (AC 5) zonder duplicaatlogica.
 */
export const HUMAN_GOLD_SET_SOURCES = [
  'review-accept',
  'review-annotate',
  'review-reject',
  'quarantaine',
] as const;

/** Een toegestane menselijke gold-set-bron (Story 14.1). */
export type HumanGoldSetSource = (typeof HUMAN_GOLD_SET_SOURCES)[number];

/** Is `source` een toegestane menselijke gold-set-bron? */
export function isHumanGoldSetSource(source: string): source is HumanGoldSetSource {
  return (HUMAN_GOLD_SET_SOURCES as readonly string[]).includes(source);
}

/**
 * Fout wanneer een aanwas met een niet-menselijke (of onbekende) bron wordt
 * geprobeerd — een poort-afwijzing mag de gold-set NOOIT voeden (AD-12).
 */
export class GoldSetSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoldSetSourceError';
  }
}

/**
 * Leg één menselijke reviewbeslissing vast als gold-set-record (Story 14.1,
 * AC 1/AC 5, FR-10). Dit is de HERBRUIKBARE aanwas-service: het accept-/annotate-/
 * reject-pad (deze story) én later de quarantaine-afhandeling (Story 15.3) roepen
 * dezelfde functie aan — geen duplicaatlogica.
 *
 * Exact één insert per beslissing (idempotentie is de verantwoordelijkheid van de
 * aanroeper: het reviewstation-pad is per beslissing al idempotent via de
 * item-status-machine). De bron wordt HARD gevalideerd tegen
 * `HUMAN_GOLD_SET_SOURCES` — een poort-afwijzing kan de gold-set nooit voeden
 * (AD-12). Records zijn verder immutable (AD-13); correctie/undo verloopt via
 * `replaceGoldSetRecord` respectievelijk `withdrawGoldSetRecord`.
 *
 * @returns het aangemaakte (actieve) record.
 */
export async function recordReviewDecision(
  data: GoldSetRecordData
): Promise<GoldSetRecord> {
  if (!isHumanGoldSetSource(data.source)) {
    throw new GoldSetSourceError(
      `Gold-set-aanwas geweigerd: bron '${data.source}' is geen menselijke reviewbron (AD-12).`
    );
  }

  const created = await prisma.goldSetRecord.create({
    data: {
      label: data.label,
      t3777Code: data.t3777Code,
      cropPath: data.cropPath ?? null,
      source: data.source,
      decidedBy: data.decidedBy ?? null,
      evidence: (data.evidence ?? {}) as object,
    },
  });

  logger.info('Gold-set-record aangemaakt uit reviewbeslissing', {
    id: (created as { id: string }).id,
    label: data.label,
    t3777Code: data.t3777Code,
    source: data.source,
  });

  return created as unknown as GoldSetRecord;
}

/**
 * Trek een zojuist aangemaakt gold-set-record in bij een undo (Story 14.1, AC 3),
 * zónder opvolger-beslissing: de **self-tombstone** —
 * `UPDATE gold_set_records SET replaced_by_id = id WHERE id = ? AND
 * replaced_by_id IS NULL` (conditional). Het record blijft bewaard (immutability,
 * AD-13/FR-10) maar valt uit de actieve set (`replacedById IS NULL`, AD-4). Bij
 * een échte her-beslissing (relabel-flow reopen→accept) ontstaat daarna een nieuw
 * record — dán zijn "beide bewaard".
 *
 * De 13.3-migratie bevat BEWUST geen constraint die `replaced_by_id = id`
 * blokkeert (zie schema-docblock GoldSetRecord — 14.1-afstempunt).
 *
 * Idempotent: is het record al ingetrokken/vervangen (0 rijen), dan gebeurt er
 * niets — undo (reopen) mag herhaald worden.
 *
 * @returns het aantal ingetrokken records (0 of 1).
 */
export async function withdrawGoldSetRecord(id: string): Promise<number> {
  const result = await prisma.goldSetRecord.updateMany({
    where: { id, replacedById: null },
    data: { replacedById: id },
  });

  if (result.count > 0) {
    logger.info('Gold-set-record ingetrokken (self-tombstone, undo)', { id });
  }

  return result.count;
}

/**
 * Vervang een gold-set-record (FR-10 — de enige toegestane mutatie).
 *
 * Transactie: INSERT nieuw record + conditionele `UPDATE oldRecord SET
 * replacedById = new.id WHERE id = oldId AND replaced_by_id IS NULL`. Raakt de
 * conditionele update 0 rijen (record al vervangen of niet bestaand) → de hele
 * transactie faalt met een `GoldSetReplacementError`; het oude record wordt
 * NOOIT overschreven. Beide schrijfacties slagen samen of geen van beide.
 *
 * Dit is de service-functie die Story 14.1 hergebruikt.
 *
 * @returns het nieuwe (actieve) record.
 */
export async function replaceGoldSetRecord(
  oldId: string,
  newData: GoldSetRecordData
): Promise<GoldSetRecord> {
  return prisma.$transaction(async (tx) => {
    const created = await tx.goldSetRecord.create({
      data: {
        label: newData.label,
        t3777Code: newData.t3777Code,
        cropPath: newData.cropPath ?? null,
        source: newData.source,
        decidedBy: newData.decidedBy ?? null,
        evidence: (newData.evidence ?? {}) as object,
      },
    });

    // Conditionele update: alleen als het oude record nog actief is. 0 rijen
    // betekent "al vervangen of onbekend" → fout, nooit overschrijven.
    const updated = await tx.goldSetRecord.updateMany({
      where: { id: oldId, replacedById: null },
      data: { replacedById: created.id },
    });

    if (updated.count === 0) {
      // Gooit binnen de transactie → rollt de zojuist aangemaakte insert terug.
      throw new GoldSetReplacementError(
        `Gold-set-record ${oldId} is niet (meer) actief; vervanging geweigerd (immutability, FR-10).`
      );
    }

    logger.info('Gold-set-record vervangen', {
      oldId,
      newId: created.id,
      t3777Code: newData.t3777Code,
      label: newData.label,
    });

    return created as unknown as GoldSetRecord;
  });
}
