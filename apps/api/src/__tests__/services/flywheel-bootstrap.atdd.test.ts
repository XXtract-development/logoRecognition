/**
 * ATDD red-phase scaffold — Stories 17.1 (bootstrap-run per lege klasse, API-deel)
 * en 17.2 (bootstrap-wachtrij: prioritering en beheer)
 *
 * Het ml-service-deel van 17.1 (zaad-zoek-endpoint) staat in
 * apps/ml-service/tests/test_flywheel_atdd.py. Alle tests zijn it.todo (red phase).
 * Beoogde modules: apps/api/src/services/flywheel/bootstrap-run.ts en bootstrap-queue.ts.
 */
import { describe, it } from 'vitest';

describe('Story 17.1 — Bootstrap-run per lege klasse (API-deel) (RED)', () => {
  it.todo(
    'AC1: job flywheel-bootstrap (queue flywheel) zoekt uitsluitend binnen GTINs die de code declareren (declaratie-verificatie per GTIN: reason ok en code in declaratie; niet-declarerende GTIN wordt overgeslagen, geteld en gelogd) en nomineert vondsten >= FLYWHEEL_BOOTSTRAP_THRESHOLD (default 0,93, randgevallen rond de drempel) als kandidaat met herkomst bootstrap via de 13.2-service (incl. /ml/phash-hash, geen directe referentie-writes); bootstrap-kandidaten doorlopen exact dezelfde kwaliteitspoort'
  );

  it.todo(
    'AC2: het gids-zaad wordt nooit referentie — geen reference_candidates-rij, ReferenceLogo-rij of crop-upload voor het zaad; dedup via inhouds-hash sluit een meegelift zaadbeeld uit (NFR-6)'
  );

  it.todo(
    'AC3: run zonder vondsten wordt vastgelegd als bootstrap_queue.status=leeg met lastRunAt gezet; de klasse blijft opneembaar in een volgende run (statusovergangen wachtend->gedraaid->gevuld|leeg)'
  );

  it.todo(
    'AC4: run-budget — maximaal FLYWHEEL_BOOTSTRAP_RUN_BUDGET GTINs (default 200) per run binnen een time-box; het restant blijft in de wachtrij'
  );

  it.todo('AC5: met pauzestand actief start de job niet (AD-11 pauze-scope)');

  it.todo(
    'AC6: met FLYWHEEL_NOMINATION_ENABLED=false draait de job niet en nomineert hij niets (AD-8 hoofdvlag-scope)'
  );
});

describe('Story 17.2 — Bootstrap-wachtrij: prioritering en beheer (RED)', () => {
  it.todo(
    'AC1: eenmalig idempotent seed-script met --dry-run vult de wachtrij met alle klassen zonder actieve referenties, gerangschikt op declaratiefrequentie uit de universum-telling; bestaande FR-15-rijen worden verrijkt met frequentie maar hun status nooit overschreven; niet-visuele codes mogen direct uitgesloten krijgen; tweede run wijzigt niets en de seed/aggregatie zet uitgesloten nooit terug'
  );

  it.todo(
    'AC2: GET/POST/PATCH /api/v1/flywheel/bootstrap-queue — GET levert de gesorteerde lijst (priorityOverride eerst, dan frequentie aflopend, gelijke frequentie deterministisch); mutaties (override zetten/wissen, excluded togglen, klasse toevoegen) worden gelogd met gebruiker + tijdstempel; uitgesloten klassen worden door 17.1 nooit verwerkt'
  );

  it.todo(
    'AC3: "nieuw geactiveerde klasse"-bepaling read-side: wachtrij-status gevuld EN >=1 actieve ReferenceLogo met source=flywheel-promotion en kandidaat-herkomst bootstrap (wel/niet-gevallen)'
  );

  it.todo(
    'AC4: doorklik vanaf de melding toont in de batch-detail-weergave (15.3) de gepromoveerde referenties met hun evidence-contract (herkomst bootstrap)'
  );
});
