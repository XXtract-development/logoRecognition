/**
 * ATDD red-phase scaffold — Story 13.4: Nachtelijke promotielus, batching en guardrails
 *
 * Alle tests zijn it.todo (red phase). Beoogde modules:
 * apps/api/src/services/flywheel/promotion-queue.ts (BullMQ-queue "flywheel", Job Schedulers)
 * en apps/api/src/services/flywheel/guardrails.ts (cap/dedup/outlier).
 */
import { describe, it } from 'vitest';

describe('Story 13.4 — Nachtelijke promotielus, batching en guardrails (RED)', () => {
  it.todo(
    'AC1: Prisma-migratie voor promotion_batches incl. het alsnog toevoegen van de FK-constraint op reference_candidates.promotionBatchId bestaat met down-script, uitvoering alleen na expliciete goedkeuring (ARCH-2)'
  );

  it.todo(
    'AC2: repeatable job flywheel-promotion (queue flywheel, concurrency 1, via queue.upsertJobScheduler, cadans FLYWHEEL_PROMOTION_CRON default 01:00 Europe/Amsterdam) bundelt kandidaten met status candidate in een promotion_batches-rij en claimt elke kandidaat via conditional update naar in_batch met promotionBatchId'
  );

  it.todo(
    'AC3: per-klasse cap (FLYWHEEL_CLASS_CAP default 10, geteld over actieve promotie-referenties) wijst kandidaten boven de cap af met reden cap-bereikt; handmatig gecureerde referenties tellen niet mee en worden nooit verdrongen; de cap-check is herbruikbaar zodat 13.5 hem in de promotie-transactie afdwingt'
  );

  it.todo(
    'AC4: tweetraps-dedup (pHash-Hamming + embedding-cosine >= 0,97 via pgvector) laat van bijna-identieke kandidaten hoogstens een over (rest rejected met reden duplicaat) en checkt trap 2 ook tegen inactieve referenties van dezelfde klasse met herkomst flywheel-promotion of review (kloon-gat)'
  );

  it.todo(
    'AC5: zachte afwijzing (cap-bereikt/duplicaat/outlier) zet status rejected met reden via conditional update en maakt GEEN hard_negatives-rij; hernominatie kan via status-reset van de bestaande rij naar candidate (geen nieuwe insert, @@unique blijft kloppen)'
  );

  it.todo(
    'AC6: per-batch outlier-guardrail bepaalt via /ml/outlier-audit de afstand tot het klasse-centroid en wijst kandidaten boven de grens zacht af met reden outlier (geen hard-negative)'
  );

  it.todo(
    'AC7: elke poort-fase (drempel/cap/dedup/outlier/regressie) legt een uitkomst-record vast in gateResults, opvraagbaar voor 15.2/15.3; de regressie-fase staat in deze story op "nog niet uitgevoerd"'
  );

  it.todo(
    'AC8: crash-recovery — bij herstart pakt de job eerst bestaande pending-batches op en hervat de poort idempotent per fase via gateResults; kandidaten raken nooit permanent vast in in_batch'
  );

  it.todo(
    'AC9: watchdog — elke succesvolle run legt zijn tijdstempel vast (opvraagbaar via de overview-API) en een lichte repeatable check notificeert via het RetrainingNotification-patroon zodra de laatste succesvolle run ouder is dan 26 uur'
  );
});
