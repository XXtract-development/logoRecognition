/**
 * Reviewbeslissing → vliegwiel-aanwas (Story 14.1, FR-9/FR-10, AD-12/AD-13/AD-14).
 *
 * De ORCHESTRATIE-laag boven `gold-set.ts`: hij vertaalt een menselijke
 * reviewstation-beslissing naar gold-set-aanwas en — uitsluitend bij reject wegens
 * "geen keurmerk" — een `hard_negatives`-rij. Alle schrijfacties zitten achter de
 * hoofdvlag `FLYWHEEL_NOMINATION_ENABLED` (AD-8); met de vlag uit is het
 * reviewstation byte-gelijk aan vandaag (regressietest verplicht).
 *
 * Bindende AD's:
 *   AD-4/AD-13/FR-10  Gold-set immutable; aanwas via `recordReviewDecision`,
 *                     intrekking via self-tombstone (`withdrawGoldSetRecord`).
 *   AD-12             Hard-negatives UITSLUITEND uit menselijke afkeuring. De
 *                     reject-reden "geen keurmerk" is zo'n afkeuring; "onjuiste
 *                     locatie/verkeerde code" is dat NIET (de beeldinhoud is niet
 *                     fout) → géén register.
 *   AD-14             Inhouds-hash SYNCHROON uit /ml/phash; NOOIT in Node. Fail-
 *                     closed: onbereikbaar → hele beslissing weigeren, geen half
 *                     record (geen VALS zónder hard-negative of andersom).
 */

import prisma from '../../core/db';
import { createLogger } from '../../core/logger';
import { mlClient } from '../ml-client';
import { recordReviewDecision, withdrawGoldSetRecord } from './gold-set';
import type { GoldSetRecord } from './gold-set';
import { HUMAN_HARD_NEGATIVE_REASONS } from './types';

const logger = createLogger('flywheel-review-decision');

/**
 * De reject-redenen van het reviewstation (Story 14.1, AC 2). Alleen deze twee
 * zijn geldig zodra de vlag aan staat; zonder reden (vlag uit / oude client) blijft
 * het legacy-gedrag (alleen status `rejected`, geen registers).
 */
export const REVIEW_REJECT_REASONS = [
  'geen-keurmerk',
  'onjuiste-locatie-verkeerde-code',
] as const;

/** Een geldige reject-reden uit het reviewstation. */
export type ReviewRejectReason = (typeof REVIEW_REJECT_REASONS)[number];

/** Is `reason` een geldige reject-reden? */
export function isReviewRejectReason(reason: string): reason is ReviewRejectReason {
  return (REVIEW_REJECT_REASONS as readonly string[]).includes(reason);
}

/**
 * De canonieke `hard_negatives.reason`-waarde voor een reviewstation-reject wegens
 * "geen keurmerk" (Story 14.1, AC 2). Exact deze string uit de gedeelde 13.6-enum,
 * zodat de hard-negative-export (13.6) en de hernominatie-blokkade (13.2) hem
 * herkennen.
 */
export const REVIEWSTATION_GEEN_KEURMERK_REASON = 'reviewstation-geen-keurmerk';

// Compile-time garantie dat de constante in de gedeelde 13.6-enum zit (AD-12).
const _reasonInEnum: (typeof HUMAN_HARD_NEGATIVE_REASONS)[number] =
  REVIEWSTATION_GEEN_KEURMERK_REASON;
void _reasonInEnum;

/**
 * Fout bij een onbereikbare/gefaalde /ml/phash tijdens reject-"geen keurmerk".
 * FAIL-CLOSED (AD-14): de héle beslissing wordt geweigerd; er ontstaat NOOIT een
 * VALS-record zónder hard-negative of andersom. De route vertaalt dit naar HTTP
 * 503 met een NL-melding.
 */
export class PhashUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhashUnavailableError';
  }
}

/** Menselijke bron + beslisser + T3777-code voor een gold-set-aanwas. */
export interface ReviewDecisionContext {
  t3777Code: string;
  cropPath: string;
  /** Menselijke bron: 'review-accept' | 'review-annotate' | 'review-reject'. */
  source: 'review-accept' | 'review-annotate' | 'review-reject';
  /** Wie de beslissing nam (auth-context); NULL als onbekend. */
  decidedBy?: string | null;
  /** Extra evidence (reviewItemId, gtin, bbox, …) voor herleidbaarheid (AD-13). */
  evidence?: Record<string, unknown>;
}

/**
 * Accept/annotate → één ECHT gold-set-record (Story 14.1, AC 1). Herbruikbaar
 * via `recordReviewDecision`. Idempotentie ligt bij de aanroeper (de item-status-
 * machine); deze functie doet exact één insert.
 */
export async function recordAcceptDecision(
  ctx: ReviewDecisionContext
): Promise<GoldSetRecord> {
  return recordReviewDecision({
    label: 'ECHT',
    t3777Code: ctx.t3777Code,
    cropPath: ctx.cropPath,
    source: ctx.source,
    decidedBy: ctx.decidedBy ?? null,
    evidence: ctx.evidence ?? {},
  });
}

/**
 * Reject wegens "geen keurmerk" (Story 14.1, AC 2) — VALS gold-set-record ÉN een
 * `hard_negatives`-rij, in ÉÉN transactie. De inhouds-hash komt synchroon uit
 * /ml/phash (AD-14); is die onbereikbaar → `PhashUnavailableError` (fail-closed,
 * geen partiële schrijf). Idempotent op de hard-negative-`contentHash` (uniek):
 * een tweede keer dezelfde crop afwijzen dupliceert de hard-negative niet.
 *
 * @returns het aangemaakte VALS-record.
 */
export async function recordRejectGeenKeurmerk(
  ctx: {
    t3777Code: string;
    cropPath: string;
    decidedBy?: string | null;
    evidence?: Record<string, unknown>;
  }
): Promise<GoldSetRecord> {
  // 1. Canonieke inhouds-hash SYNCHROON vóór enige schrijf (AD-14, fail-closed).
  let contentHash: string;
  try {
    const res = await mlClient.computePhash(ctx.cropPath);
    contentHash = res.content_hash;
  } catch (err) {
    logger.warn('Reject "geen keurmerk" geweigerd: /ml/phash onbereikbaar (fail-closed)', {
      cropPath: ctx.cropPath,
      t3777Code: ctx.t3777Code,
      error: err instanceof Error ? err.message : 'unknown',
    });
    throw new PhashUnavailableError(
      'Beslissing niet opgeslagen — inhouds-hash kon niet worden berekend; probeer opnieuw.'
    );
  }

  // 2. VALS-record + hard-negative SAMEN of geen van beide (transactie).
  return prisma.$transaction(async (tx) => {
    const created = await tx.goldSetRecord.create({
      data: {
        label: 'VALS',
        t3777Code: ctx.t3777Code,
        cropPath: ctx.cropPath,
        source: 'review-reject',
        decidedBy: ctx.decidedBy ?? null,
        evidence: {
          ...(ctx.evidence ?? {}),
          rejectReason: 'geen-keurmerk',
          contentHash,
        } as object,
      },
    });

    // Hard-negative: uniek op contentHash (AD-14). Idempotent — een tweede reject
    // van dezelfde crop-inhoud botst op de unieke constraint; upsert lost dat op
    // zonder duplicaat en zonder de bestaande evidence te verliezen.
    await tx.hardNegative.upsert({
      where: { contentHash },
      create: {
        contentHash,
        t3777Code: ctx.t3777Code,
        cropPath: ctx.cropPath,
        reason: REVIEWSTATION_GEEN_KEURMERK_REASON,
        evidence: {
          ...(ctx.evidence ?? {}),
          source: 'review-reject',
          rejectReason: 'geen-keurmerk',
          decidedBy: ctx.decidedBy ?? null,
        } as object,
      },
      update: {},
    });

    logger.info('Reject "geen keurmerk": VALS-record + hard-negative vastgelegd', {
      goldSetId: (created as { id: string }).id,
      t3777Code: ctx.t3777Code,
      contentHash,
    });

    return created as unknown as GoldSetRecord;
  });
}

/**
 * Undo van een reviewbeslissing (Story 14.1, AC 3). Trekt het gold-set-record van
 * deze crop in via self-tombstone (`withdrawGoldSetRecord`) ÉN verwijdert de
 * bijbehorende `hard_negatives`-rij (lookup op `cropPath` — uniek per reviewitem;
 * geen her-berekening van de hash nodig). Idempotent: reopen mag herhaald worden.
 *
 * @returns aantallen ingetrokken gold-records + verwijderde hard-negatives.
 */
export async function withdrawReviewDecision(
  cropPath: string
): Promise<{ goldSetWithdrawn: number; hardNegativesDeleted: number }> {
  // 1. Het (actieve) gold-set-record van deze crop intrekken. Er kan er hoogstens
  //    één actief zijn per crop uit een reviewbeslissing; trek het jongste actieve
  //    in via zijn id (self-tombstone conditional update).
  const active = await prisma.goldSetRecord.findFirst({
    where: { cropPath, replacedById: null, source: { in: ['review-accept', 'review-annotate', 'review-reject'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  let goldSetWithdrawn = 0;
  if (active) {
    goldSetWithdrawn = await withdrawGoldSetRecord(active.id);
  }

  // 2. De hard-negative-rij van deze crop verwijderen (FR-9): de afkeuring wordt
  //    teruggenomen, dus de permanente blokkade vervalt. Lookup op cropPath.
  const deleted = await prisma.hardNegative.deleteMany({
    where: { cropPath, reason: REVIEWSTATION_GEEN_KEURMERK_REASON },
  });

  if (goldSetWithdrawn > 0 || deleted.count > 0) {
    logger.info('Reviewbeslissing ingetrokken (undo)', {
      cropPath,
      goldSetWithdrawn,
      hardNegativesDeleted: deleted.count,
    });
  }

  return { goldSetWithdrawn, hardNegativesDeleted: deleted.count };
}
