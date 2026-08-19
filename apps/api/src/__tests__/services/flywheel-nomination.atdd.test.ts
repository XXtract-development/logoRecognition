/**
 * ATDD red-phase scaffold — Story 13.2: Automatische nominatie bij dubbele bevestiging
 *
 * Alle tests zijn it.todo: ze beschrijven het verwachte gedrag maar draaien nog niet.
 * Geen imports van nog-niet-bestaande modules (het te bouwen contract staat in de checklist:
 * _bmad-output/test-artifacts/atdd-checklist-epics-13-18.md).
 * Beoogde module: apps/api/src/services/flywheel/nomination.ts
 */
import { describe, it } from 'vitest';

describe('Story 13.2 — Automatische nominatie bij dubbele bevestiging (RED)', () => {
  it.todo(
    'AC1: Prisma-migratie voor reference_candidates/candidate_embeddings/hard_negatives bestaat met @@unique([contentHash, t3777Code]), promotionBatchId nullable ZONDER FK, en gedocumenteerd down-script (uitvoering alleen na expliciete goedkeuring, ARCH-2)'
  );

  it.todo(
    'AC2: detectie met dubbele bevestiging en confidence >= FLYWHEEL_PROMOTION_THRESHOLD_<METHODE> (default 0,90) levert bij FLYWHEEL_NOMINATION_ENABLED=true exact een reference_candidates-rij op (status candidate, herkomst crosscheck, evidence-contract gevuld, embedding in candidate_embeddings, inhouds-hash synchroon via /ml/phash); bestaande 8.6-registratie blijft byte-voor-byte ongewijzigd; onbereikbare hash-service => nominatie geweigerd (fail-closed)'
  );

  it.todo(
    'AC3: de nominatie-verwerking (incl. synchrone /ml/phash-aanroep) draait volledig in het BullMQ-worker-pad, nooit in het live-API-request-pad'
  );

  it.todo(
    'AC4: CONFIRMED-kruischeck-verdict boven de drempel nomineert bij FLYWHEEL_NOMINATION_ENABLED=true EN FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED=true een kandidaat met herkomst kruischeck, terwijl de verdict-response richting n8n byte-voor-byte gelijk blijft'
  );

  it.todo(
    'AC5: verse deploy zonder env-overrides: CONFIRMED-verdict levert geen kandidaat op — FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED default false'
  );

  it.todo(
    'AC6: reviewstation-accept nomineert met vlag aan een kandidaat met herkomst review en schakelt de directe 12.3-registratie (register_crop_as_reference) uit; met vlag uit blijft legacy-12.3-gedrag ongewijzigd; herkomst-enum is overal crosscheck/kruischeck/bootstrap/review'
  );

  it.todo(
    'AC7: geweigerde/overgeslagen nominatie (reden phash-onbereikbaar, pauze of vlag-uit) wordt als event met reden geregistreerd en is als teller "gemiste nominaties" opvraagbaar via de overview-API'
  );

  it.todo(
    'AC8: geen nieuwe kandidaat-rij zonder declaratie-bevestiging, onder de drempel, bij hash in hard_negatives of reference_candidates, of met vlag uit; zacht afgewezen rij (rejected wegens cap/duplicaat/outlier) wordt via status-reset opnieuw candidate (geen nieuwe insert); herverwerking van dezelfde GTIN levert nooit duplicaat-nominaties'
  );
});
