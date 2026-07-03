/**
 * ATDD red-phase scaffold — Stories 16.1 (mismatch-registratie en -aggregatie)
 * en 16.2 (gedeclareerd-niet-gevonden wordt werkvoorraad)
 *
 * Alle tests zijn it.todo (red phase). Beoogde modules:
 * apps/api/src/services/flywheel/mismatch-events.ts en bootstrap-worklist.ts.
 */
import { describe, it } from 'vitest';

describe('Story 16.1 — Mismatch-registratie en aggregatie (RED)', () => {
  it.todo(
    'AC1: Prisma-migratie voor mismatch_events (id, gtin, gln, t3777Code, type, confidence, origin/runId, createdAt; snake_case @@map, type als String @db.VarChar, @db.Timestamptz, indexen createdAt desc + t3777Code + gln) bestaat met down-script, uitvoering alleen na expliciete goedkeuring (ARCH-2)'
  );

  it.todo(
    'AC2: verwerking met declaratie registreert per gedeclareerde code een event (confirmed/declared-not-found/not-supported) en per hoogbetrouwbare niet-gedeclareerde vondst found-not-declared; found-not-declared telt alleen bij confidence >= FLYWHEEL_PROMOTION_THRESHOLD_<METHODE> (randgevallen: op, net onder, net boven de drempel, per methode)'
  );

  it.todo(
    'AC3: vlag-scoping — crosscheck-pad registreert onder FLYWHEEL_NOMINATION_ENABLED, kruischeck-pad onder FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED (uit => schrijft NIETS, 12.8-verdict-response ongewijzigd); beide vlaggen default false (4 vlag-pad-combinaties)'
  );

  it.todo(
    'AC5: aggregatie levert ratio bevestigd/niet-gevonden per T3777-code en per GLN plus trend over tijd via de overview-API (modulaire sub-service, zelfstandig testbaar zolang 15.2 niet bestaat); events zijn per-run-observaties met runId (geen dedup-eis, wel herleidbaar per run)'
  );
});

describe('Story 16.2 — Gedeclareerd-niet-gevonden wordt werkvoorraad (RED)', () => {
  it.todo(
    'AC1: Prisma-migratie voor bootstrap_queue (t3777Code uniek, declarationFrequency, status wachtend/gedraaid/gevuld/leeg/uitgesloten als VarChar, priorityOverride?, excluded, lastRunAt?, createdAt) bestaat met down-script, uitvoering alleen na expliciete goedkeuring (ARCH-2)'
  );

  it.todo(
    'AC2: code met >=FLYWHEEL_STRUCTURAL_N (10) declared-not-found-events over >=FLYWHEEL_STRUCTURAL_M (5) verschillende GTINs verschijnt automatisch in de bootstrap-wachtrij (lege klasse) of als aanvul-signaal (zwakke dekking); randgevallen 9/5, 10/4, 10/5, vermengde codes; tweede aggregatie-run maakt geen duplicaat (status-update i.p.v. insert)'
  );

  it.todo(
    'AC3: doorklik op een werkvoorraad-item levert de onderliggende GTINs en verwerkingen via de mismatch_events-rijen (runId/herkomst) die het item deden ontstaan'
  );
});
