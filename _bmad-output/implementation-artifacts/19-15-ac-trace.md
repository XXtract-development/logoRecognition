# Story 19.15 — AC→test-traceability

Bestand: `apps/api/src/services/flywheel/bootstrap-run.ts` (`resolveSeedPath`)
Tests: `apps/api/src/__tests__/services/flywheel-bootstrap-run.test.ts`

## AC1 — GIDS-zaad geprefereerd boven een nieuwere ECHTE crop

- Test: `Story 19.15 — resolveSeedPath prefereert het gids-zaad (source-preferentie) > AC1: kiest het GIDS-zaad boven een NIEUWERE door mensen bevestigde ECHTE crop (faalt op het oude newest-ongeacht-source-gedrag)`
- Bewijs: bevestigd rood tegen de vorige implementatie (git-stash-vergelijking, zie Change Log in het storybestand) — assertie faalt op het oude newest-ongeacht-source-gedrag, slaagt op de fix.
- Dekt: de gids-query (`source: { notIn: REAL_CROP_SOURCES }`, `orderBy createdAt desc`) sluit de fallback-query kort (1 call), levert het gids-pad ook al is de echte crop nieuwer.

## AC2 — Fallback-gedrag zonder gids-referentie (bewust, gedocumenteerd, geen null-breuk)

- Test: `... > AC2: valt terug op newest-any wanneer de klasse GEEN gids-referentie heeft (bewuste, gedocumenteerde fallback — geen null)`
- Test: `... > AC2: retourneert null (geen zaad) wanneer de klasse HELEMAAL geen referentie heeft (lege-klasse-flow 19.8 blijft intact)`
- Dekt: geen gids → 2e (fallback) query zonder source-filter, newest-any; helemaal geen referentie → `null` (ongewijzigd `hadSeed:false`-pad, 19.8-lege-klasse-flow blijft intact — bestaande tests in hetzelfde bestand, o.a. "zonder zaad wordt de run leeg", blijven ongewijzigd groen).

## AC3 — Geen regressie op conditie C / nearest-reference-ranking (Story 19.9)

- Test: `... > AC3-regressieborging: de zaadwijziging raakt searchAndQueueClassForReview/realRefPaths niet — de echte crops komen nog steeds via realRefPaths mee (conditie C, 19.9, ongewijzigd)`
- Aanvullend ongewijzigd groen (regressie-bewijs): het volledige bestaande blok `Story 19.9 — realRefPaths-contract naar mlClient.bootstrapSearch` (5 tests) blijft slagen zonder wijziging — de `realRefPaths`/`rankingThreshold`/`minRefs`-opbouw (referenceLogo.findMany op `REAL_CROP_SOURCES`, `getRankingMaxRefs`, `getRankingMinRefs`) is in deze story NIET aangeraakt.
- Redenering: `resolveSeedPath` en de `realRefPaths`-opbouw in `searchAndQueueClassForReview` zijn twee onafhankelijke Prisma-queries op dezelfde tabel maar met tegengestelde source-filters (gids = complement van `REAL_CROP_SOURCES`, echte refs = `REAL_CROP_SOURCES` zelf). Het zaad wordt bovendien defensief uit `realRefPaths` gefilterd (`.filter((p) => p !== seedPath)`, bestaande code-review-fix uit 19.9) — een wijziging in wélk beeld het zaad is kan dus per definitie nooit de samenstelling van `realRefPaths` veranderen. `search_with_seed` (ml-service) is in deze story niet gewijzigd (geen bestand in de diff).
- `apps/ml-service/app/services/bootstrap_search.py`: NIET in de diff (geverifieerd via `git diff --stat`).

## AC4 — Testsuite + gates

- api-vitest: 33/33 in `flywheel-bootstrap-run.test.ts` (was 29, +4 nieuw + 1 regressie-test) groen; volledige suite groen (zie Gate G-rapportage in het eindverslag).
- `tsc --noEmit`: 0 errors (apps/api).
- NFR-6-borging: `NFR-6: de gids-query sluit exact REAL_CROP_SOURCES uit — het zaad kan nooit een echte-crop-output zijn`.

## Samenvatting

| AC | Test(en) | Status |
|----|----------|--------|
| AC1 | 1 test | PASS (rood bevestigd tegen oude implementatie) |
| AC2 | 2 tests | PASS |
| AC3 | 1 nieuwe test + 5 bestaande 19.9-regressietests ongewijzigd groen | PASS |
| AC4 | tsc 0, gerichte suite 33/33, volledige suite (zie eindrapport) | PASS |

ac_trace: 4/4
