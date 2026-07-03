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
