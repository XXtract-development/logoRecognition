# AC → test-mapping — Story 17.1 (Bootstrap-run per lege klasse)

Elk acceptatiecriterium heeft ≥1 dekkende geautomatiseerde test die het gedrag assert.
Legenda: API = `apps/api/src/__tests__/services/flywheel-bootstrap-run.test.ts` (vitest);
ML = `apps/ml-service/tests/unit/test_bootstrap_search_service.py` (pytest).

| AC | Gedrag | Dekkende test(s) |
|----|--------|------------------|
| **AC1** | Job zoekt uitsluitend binnen declarerende GTINs; per-GTIN declaratie-verificatie (reason ok + code ∈ declaratie); niet-declarerende GTIN overgeslagen + geteld + gelogd | API: "slaat een niet-declarerende GTIN over (telt + logt) en doorzoekt alleen declarerende GTINs"; "slaat een GTIN met reason != ok over" |
| AC1 | Vondsten ≥ drempel (default 0,93) genomineerd als kandidaat met herkomst `bootstrap` via de 13.2-service | API: "nomineert een vondst ≥ drempel via de 13.2-service met herkomst bootstrap"; "geeft de bootstrap-drempel door aan de ml-zoektocht (default 0,93, env-override)" |
| AC1 | Drempel-randgevallen boven/onder 0,93 | ML: "test_matches_boven_en_onder_drempel"; "test_hogere_drempel_sluit_alles_uit"; "test_cosine_*" (pure drempelvergelijking) |
| AC1 | Exact dezelfde kwaliteitspoort; nooit directe referentie-writes | API: "nomineert NOOIT rechtstreeks in reference_candidates — uitsluitend via de 13.2-service" |
| **AC2** | Zaad wordt nooit referentie: geen crop-upload/kandidaat/ReferenceLogo voor het zaad; dedup via inhouds-hash sluit meegelift zaadbeeld uit (NFR-6) | API: "het zaad wordt uitsluitend als zoekinstrument (seedPath) meegegeven, nooit genomineerd"; ML: "test_zaadbeeld_verschijnt_nooit_in_output_crops" |
| AC2 | Zaad ook uit een INACTIEVE referentie-rij (geen active-filter) | API: "resolveSeedPath leest het zaad ook uit een INACTIEVE referentie-rij" |
| AC2 | Geen zaad → run leeg (reden geen-zaad), klasse blijft opneembaar | API: "zonder zaad wordt de run leeg (reden geen-zaad) en de klasse blijft opneembaar" |
| **AC3** | Run zonder vondsten → `bootstrap_queue.status='leeg'` + `lastRunAt`; klasse blijft opneembaar; statusovergangen wachtend→gedraaid→gevuld\|leeg | API: "een run zonder vondsten wordt leeg met lastRunAt"; "zet status → gedraaid bij start"; "een vondst → gevuld met lastRunAt"; "verwerkt nooit een uitgesloten klasse" |
| **AC4** | Max `FLYWHEEL_BOOTSTRAP_RUN_BUDGET` GTINs (default 200) per run binnen time-box; restant blijft `wachtend` | API: "verwerkt maximaal FLYWHEEL_BOOTSTRAP_RUN_BUDGET GTINs; het restant blijft in de wachtrij"; "candidateGtinsForCode begrenst op het budget en dedupliceert GTINs"; "markeert budgetTruncated wanneer ml aangeeft dat de time-box bereikt is" |
| **AC5** | Pauzestand actief → job start niet (AD-11) | API: "met de pauzestand actief start de job niet"; "vraagt de pauze-check op met de bootstrap-jobnaam" |
| **AC6** | `FLYWHEEL_NOMINATION_ENABLED=false` → job draait niet, nomineert niets (AD-8) | API: "met FLYWHEEL_NOMINATION_ENABLED=false draait de job niet en nomineert niets" |
| **AC7** | Tests (unit vitest + pytest + integratie) | Alle bovenstaande. Pytest zacht-falen: ML "test_faalt_zacht_per_gtin"; onleesbaar zaad: ML "test_onleesbaar_zaad_gooit_valueerror". E2E NIET aan de stable-subset toegevoegd. |

## Dekking
- Aantal AC's: 7 (AC7 = testeis, gedekt door de suite zelf).
- AC's met dekkende test: 7/7.
- Geen AC zonder test → geen waiver nodig.

## Testtotalen
- API vitest (nieuw bestand): 18 passed.
- ML pytest (nieuw bestand): 9 passed.
- Volledige API-suite: 754 passed | 2 skipped | 37 todo.
