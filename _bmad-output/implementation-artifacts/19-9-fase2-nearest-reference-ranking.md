# Story 19.9: Fase 2 — nearest-reference-ranking zodra een klasse ≥ k echte crops heeft

Status: done

<!-- Twee-traps-fase-2, uit correct-course (sprint-change-proposal-2026-07-07.md). Bouwt op 19.8: zodra een keurmerkklasse ≥ k door mensen bevestigde ECHTE crops heeft, schakelt de match van de absolute cosine-drempel tegen het GIDS-zaad naar nearest-reference-ranking tegen de ECHTE crops (conditie C). Bewezen 44%->100% in de 19.7-spike, zonder nieuwe training. -->

## Story

Als **datamanager**
wil ik **dat een keurmerkklasse die ≥ k (default 3) door mensen bevestigde ECHTE crops heeft, nieuwe regio's matcht tegen díe echte crops (nearest-reference) in plaats van tegen de absolute cosine-drempel op het gids-logo**
zodat **de herkenning van die klasse van ~44% naar ~100% top-1 springt (bewezen in de 19.7-spike, zonder enige training) — de "volle kraan" die het vliegwiel zelfversterkend maakt** (FR-22, FR-12).

### Afbakening (kritiek)
- **Bewezen mechanisme (19.7-spike, `19-7-spike-resultaten.md`):** leave-one-GTIN-out over 75 crops/4 klassen — top-1 **44% → 100%** door te ranken tegen echte crops i.p.v. het gids-zaad. GEEN nieuwe training, GEEN nieuw model (zelfde efficientnet-embedding). Sluit aan op [[project_123_realref_pivot]] (POC 36%→100%: het knelpunt was de gids-referentie, niet de embedding).
- **Voorwaarde is nu vervuld:** 19.8 (live op ACC, commit `b2b291f`) levert de eerste echte referentie-crops — bootstrap-crops → review-wachtrij → mens bevestigt (gold-set ECHT `review-accept` + `registered` referentie). Op ACC staan al 4 bevestigde crops (SEPARATE_COLLECTION, PREGNANCY_WARNING, RAINFOREST×2).
- **De kern is een SCHAKELMOMENT per klasse, GEEN vervanging van het gids-pad:**
  - Klasse met **≥ k actieve echte referentie-crops** → **conditie C**: rank een regio op de **hoogste cosine over de echte crops** (nearest-reference); een regio die dicht bij ≥1 echte crop ligt matcht óók als de gids-cosine onder de drempel valt. Het gids-zaad blijft beschikbaar als aanvulling/fallback.
  - Klasse met **< k echte crops** → ONGEWIJZIGD het bestaande gids-drempel-pad (19.6-drempel 0,60 + 19.8-review-routering). Geen gedragswijziging voor lege/schaarse klassen.
- **k = default 3, env-configureerbaar** (startwaarde uit de spike; kalibreerbaar). Onder k is de nearest-reference-schatting te wankel.
- **Vangnet ONGEWIJZIGD en leidend:** declaratie-guard (19.5), gold-set-regressie, phash-/embedding-dedup, class-cap (10), hard-negative-blokkade, NFR-6 (zaad nooit als output-crop). Conditie C wisselt UITSLUITEND het rank-/matchsignaal — alle kleppen blijven.
- **Scope:** de top-N volume-keurmerken die via 19.8 echte crops verzamelen. **RECYCLABLE/TRIMAN** hadden in de spike 0 echte crops (harde staart) → die blijven op het gids-pad tot ze crops hebben; apart valideren zodra dat zo is (geen verwachting van 100% daar).
- **Geen wijziging aan:** het embedding-model, de region-proposer, de gate-drempels (19.6), de crosscheck/kruischeck-paden, of de 19.8-review-routering zelf.
- **Elke ACC-schrijf/deploy/eval-run met expliciete toestemming per geval; container zelfstandig herstartbaar.**

## Acceptatiecriteria

1. **Given** een keurmerkklasse met ≥ k (3) actieve, door mensen bevestigde ECHTE referentie-crops
   **When** de ml-service een kandidaat-regio evalueert
   **Then** bepaalt de match de **hoogste cosine over die echte crops** (nearest-reference), niet (enkel) de absolute cosine tegen het gids-zaad — een regio die dicht bij ≥1 echte crop ligt matcht óók wanneer de gids-cosine onder de bootstrap-drempel (0,60) valt.

2. **Given** een keurmerkklasse met < k echte crops
   **When** een regio wordt geëvalueerd
   **Then** blijft het bestaande gids-drempel-pad (19.6 + 19.8) exact gelden — geen gedragswijziging; de klasse verzamelt eerst via het 19.8-review-pad tot ≥ k.

3. **Given** conditie C actief
   **When** een regio matcht via nearest-reference
   **Then** blijven ALLE kleppen ongemoeid: declaratie-guard, gold-set-regressie, dedup, class-cap, hard-negative; en het zaad blijft NFR-6 (nooit geüpload, nooit in de output). Een reeds-afgekeurde (hard-negative) of duplicaat-crop wordt nog steeds geweigerd/overgeslagen.

4. **Given** de wijziging
   **When** de testsuite draait
   **Then** dekt een test: (a) een echte-crop-nabije regio met gids-cosine < drempel matcht nu bij ≥ k (faalt op het oude gids-only-gedrag); (b) een klasse met < k blijft op het gids-pad; (c) de kleppen + NFR-6 blijven; `tsc --noEmit` 0, de api-vitest én de ml-pytest groen.

5. **Given** de bestaande gold-set/spike-set (leave-one-GTIN-out)
   **When** de eval-meting draait op de klassen mét echte crops
   **Then** reproduceert de meting de spike-verbetering (top-1 richting ~100% voor die klassen) ZONDER regressie op de guard-precisie of de gold-set-regressie-gate. Meetbaar vastgelegd (sweep/extract als read-only vertrekpunt, `19-7-spike-resultaten.md`).

## Tasks / Subtasks

- [x] 1. **Echte-crop-referenties per code laden (AC: 1, 2)** — BESLIST + geïmplementeerd: de API laadt de crop-PADEN (`reference_logos`, active=true, `source ∈ {review-confirmed, realref-live-poc, flywheel-promotion}`) en geeft ze mee aan `bootstrapSearch` als `realRefPaths: string[]`; de ml-service embedt ze zelf (analoog aan `seed_path`). `apps/api/src/services/flywheel/bootstrap-run.ts`.
- [x] 2. **Schakelmoment + nearest-reference-rank in `search_with_seed` (AC: 1, 3)** — conditie C geïmplementeerd: `ref_sim = max(cosine(emb, r) for r in real_ref_embs)`; match als `sim >= threshold OR ref_sim >= ranking_threshold` (gids-pad blijft als fallback/aanvulling). Onder k (SUCCESVOL geëmbede refs): ongewijzigd enkel het gids-pad. NFR-6-guard en de gate-voorfilter blijven vóór de rank-conditie. `apps/ml-service/app/services/bootstrap_search.py`.
- [x] 3. **Config (AC: 1)** — `getRankingMinRefs()` (`FLYWHEEL_RANKING_MIN_REFS`, default 3) + `getRankingThreshold()` (`FLYWHEEL_RANKING_THRESHOLD`, default = `getBootstrapThreshold()` = 0,60 — conservatieve startwaarde, kalibratie is Task 6, permission-gated). `apps/api/src/services/flywheel/config.ts`.
- [x] 4. **API-aansluiting (AC: 1, 2)** — `searchAndQueueClassForReview` geeft `realRefPaths` + `rankingThreshold` + `minRefs` mee aan `mlClient.bootstrapSearch` ALLEEN wanneer het aantal actieve echte-crop-refs ≥ k; anders kaal (gids-only). 19.8-review-routering en de kleppen ongewijzigd.
- [x] 5. **Tests (AC: 4)** — ml-pytest (`test_bootstrap_search_service.py`, 8 nieuwe tests, incl. 2 test-review-aanvullingen + 1 code-review-regressietest): (a) `test_c_ge_k_refs_matcht_ondanks_lage_gids_cosine`; (b) `test_c_onder_k_refs_ongewijzigd_gids_pad` + `test_c_onleesbare_ref_telt_niet_mee_voor_k`; (c) `test_c_gate_blijft_gelden_ondanks_conditie_c` + `test_c_nfr6_zaadlek_guard_blijft_gelden_ondanks_conditie_c` + `test_c_regio_matcht_niet_als_beide_signalen_onder_de_drempel_blijven`; plus `test_c_gids_pad_blijft_fallback_ook_met_conditie_c_actief` (OR-fallback, AC1) en `test_c_min_refs_kleiner_of_gelijk_aan_nul_activeert_conditie_c_niet` (code-review-regressie). api-vitest (`flywheel-bootstrap-run.test.ts`, 5 nieuwe tests): realRefPaths-contract bij ≥k/< k/env-override + take-cap + confidence-fix. Alle groen.
- [x] 6. **Eval-reproductie (AC: 5)** — GEDAAN (2026-07-12, expliciete toestemming Friso). Read-only leave-one-GTIN-out op ACC (ml-container `7b9e2a7`): micro top-1 **61% → 99%** (52/85 → 84/85), conditie A (gids-only) → C (nearest-reference). Alle klassen met ≥ k=3 echte crops naar ~100% (GREEN_DOT 50→100, FSC 59→100, RAINFOREST 60→100, RECYCLABLE 0→100 met 0 false-pull). Geen guard-/gold-set-regressie. `_bmad-output/implementation-artifacts/19-9-eval-reproductie.md`.
- [x] 7. **Gates** — `tsc --noEmit` 0; api-vitest volledige suite groen (877/916, 2 skip, 37 todo — 0 gefaald). ml-pytest volledige suite: 83 passed/14 skipped/1 gefaald (98 totaal) — de ENIGE faling (`test_no_node_content_hash.py::test_13_1_ac4_...`) is PRE-EXISTING en NIET door deze story veroorzaakt: het gevlagde bestand (`artwork-pipeline.ts`) is door 19.9 niet aangeraakt en byte-identiek aan base `7b9e2a7` (geverifieerd via `git diff`/`diff`). 0 regressies toe te schrijven aan Story 19.9.
- [x] 8. **Live-verificatie (AC: 5)** — GEDAAN (2026-07-12, expliciete toestemming Friso). Conditie C gedeployd op ACC (image `1d6733f`, beide containers healthy) en de GEDEPLOYDE `search_with_seed` direct aangeroepen op GREEN_DOT: `ranking_active=true`, 16 echte refs, **12/12 matches conditie-C-winst** (seed_cosine 0,389–0,540 < 0,60 maar ranking_cosine 0,602–0,703 ≥ 0,60 — regio's die het oude gids-only-pad zou missen). Contrast-run zonder refs: **0 matches** (ranking_active=false) — sluitend bewijs. NFR-6 intact (seed_leaks_skipped=0). Alleen crop-staging-writes. `_bmad-output/implementation-artifacts/19-9-eval-reproductie.md`.

## Dev Notes — Developer Context

### Huidige staat (bestanden UPDATE)
- `apps/ml-service/app/services/bootstrap_search.py` — `search_with_seed` (regel 96) embedt het gids-zaad, stelt per GTIN regio's voor (`propose_regions`), voorfiltert met de keurmerk-gate (`kp < effective_gate`, `:215-217`), en matcht op **absolute cosine tegen het zaad**: `sim = cosine(emb, seed_emb); if sim < threshold: continue` (`:219-221`). Elke overlevende regio → crop naar `artwork-crops/{gtin}/...`. **19.9 wisselt UITSLUITEND dit matchsignaal bij ≥ k echte refs**; de rest (gate, NFR-6-zaadlek-guard `:226`, crop-upload, budget/time-box) blijft. De functie is model-agnostisch (efficientnet-embedding via `model_manager`).
- `apps/api/src/services/flywheel/bootstrap-run.ts` — `searchAndQueueClassForReview` roept `mlClient.bootstrapSearch({ seedPath, gtinPages, threshold, maxSeconds })` (Story 19.8). 19.9 breidt dit uit met de echte-crop-referenties van de klasse (bij ≥ k). De crops/embeddings zijn de bij 19.8 bevestigde referenties (gold-set ECHT `review-accept` → `registered` `reference_logos` + `reference_embeddings`).
- `apps/api/src/services/flywheel/config.ts` — patroon voor de nieuwe drempels (`getBootstrapThreshold`, `getClassCap`). Voeg `k`/`ranking_threshold` toe volgens hetzelfde env-patroon.

### Waarom dit werkt (bewijs, geen speculatie)
- 19.7-spike (`19-7-spike-resultaten.md`): leave-one-GTIN-out, 75 crops/4 klassen, **top-1 44% → 100%** door nearest-reference i.p.v. gids-zaad. GREEN_DOT/EU_ORGANIC sprongen van laag → 100%; RECYCLABLE/TRIMAN hadden 0 echte crops (harde staart). 12.3-POC bevestigde ditzelfde (36%→100%). Het knelpunt was de GIDS-referentie, niet de embedding — dus geen training nodig.

### Wat behouden moet blijven
- De 5 kleppen (guard/gold-set/dedup/cap/hard-negative) en NFR-6 (zaad nooit output).
- Het < k-gids-pad (19.6-drempel 0,60 + 19.8-review-routering) — ongewijzigd.
- De gate-voorfilter (19.6) en de region-proposer — ongewijzigd.

### Waarom dit de keten sluit
Lege klasse → 19.8 (bootstrap vindt crops → review → mens bevestigt → eerste echte crops) → bij ≥ k neemt 19.9 (nearest-reference-ranking, bewezen ~100%) het over → de klasse herkent voortaan zelfstandig, en elke nieuwe bevestigde crop maakt de ranking sterker. Zelfversterkend vliegwiel, zonder training.

### References
- [Source: sprint-change-proposal-2026-07-07.md] — de twee-traps-scope (19.8 fase 1, 19.9 fase 2).
- [Source: 19-7-spike-resultaten.md] — leave-one-GTIN-out-bewijs 44%→100% + implementatie-blauwdruk.
- [Source: 19-8-fase1-bootstrap-crops-naar-review.md] — de crops-bron (review → bevestigde referenties), live op ACC.
- [Source: apps/ml-service/app/services/bootstrap_search.py#96-265] — het te wisselen matchsignaal.
- Geheugen: `project_flywheel_recall_research`, `project_123_realref_pivot`, `project_124_detector_spike`.

### Open ontwerpvraag (voor dev-story)
- Referentie-transport (Task 1): API-levert-mee vs ml-laadt-zelf. Aanbeveling: API levert de crop-keys/embeddings mee (ml-service heeft geen Postgres-toegang; consistent met hoe `seed_path` al wordt meegegeven). Bevestig of de nearest-reference-vergelijking op embeddings (goedkoop, geen re-embed) of op crop-beelden gebeurt.

## Dev Agent Record

### Agent Model Used
Claude Sonnet 5 (epic-agent, implement-sprint) — 2026-07-12.

### Debug Log References
- `review-19-9-code-review.md` — 2 cycli adversariële review (Blind Hunter + Edge Case Hunter + Acceptance Auditor, parallel), verdict PASS.
- `review-19-9-test-review.md` — test-kwaliteitsreview, 2 dekkingslacunes gedicht, verdict PASS.
- `trace-19-9.md` — AC1-4 traceability-matrix, ac_trace 4/4.
- `nfr-19-9.md` — NFR-assessment (performance/betrouwbaarheid/security/observability), verdict PASS.

### Completion Notes List
- Tasks 1-8 volledig af (AC1-5). Tasks 1-5,7 (AC1-4) autonoom geïmplementeerd + getest; Tasks 6 (eval, AC5) en 8 (live, AC5) uitgevoerd op 2026-07-12 na expliciete per-geval toestemming van Friso. Story → `done`.
- AC5 eval (Task 6, read-only ACC): micro top-1 61% → 99%; alle ≥k-klassen naar ~100%, geen regressie. AC5 live (Task 8, gedeployde code op ACC `1d6733f`): conditie C activeert live, 12/12 conditie-C-winst-matches, contrast-run zonder refs = 0 matches. Zie `19-9-eval-reproductie.md`.
- FOLLOW-UP (geen blocker voor 19.9): de gedeployde `resolveSeedPath` kiest de nieuwste `reference_logo` ongeacht `source` — voor klassen met echte crops (o.a. GREEN_DOT) is het "zaad" inmiddels een echte crop i.p.v. het gids-logo. Dit raakt de 19.9-schakel niet (die hangt aan `real_ref_paths` + `min_refs`), maar is een aandachtspunt voor een aparte story (zaadkeuze-semantiek). Bij Task 8 bewust het gids-zaad gebruikt om de conditie-C-marge aantoonbaar te maken.
- Code-review (cyclus 1) vond 6 bevindingen (3× HIGH, 1× MEDIUM, 2× LOW) — allemaal gefixt in commit `a807cca`: confidence-sortering van de review-wachtrij, een `take`-cap op de refs-query, een time-box-fix, een min_refs≤0-crash-guard, en een defensieve seed/ref-scheiding. Cyclus 2 bevestigde de fixes zonder nieuwe bevindingen.
- Test-review vond 1 echte dekkingslacune (AC1's OR-fallback-semantiek was niet expliciet getest) — gedicht met 2 nieuwe tests.
- Alle betrokken suites groen: ml-pytest `test_bootstrap_search_service.py` 20/20; api-vitest (4 bestanden) 51/51; `tsc --noEmit` 0.

### File List
- `apps/ml-service/app/services/bootstrap_search.py` — conditie C (nearest-reference-ranking), min_refs-guard, time-box-fix.
- `apps/ml-service/app/api/flywheel.py` — `/ml/bootstrap-search`-contract uitgebreid (`real_ref_paths`/`ranking_threshold`/`min_refs`/`ranking_cosine`/`ranking_active`/`real_refs_used`), Pydantic-bounds.
- `apps/api/src/services/ml-client.ts` — `bootstrapSearch`-request/response uitgebreid.
- `apps/api/src/services/flywheel/bootstrap-run.ts` — `searchAndQueueClassForReview` haalt actieve ECHTE-crop-refs op en geeft ze mee bij ≥k; `confidence`-fix; `take`-cap; logging.
- `apps/api/src/services/flywheel/config.ts` — `getRankingMinRefs`, `getRankingThreshold`, `getRankingMaxRefs`.
- `apps/ml-service/tests/unit/test_bootstrap_search_service.py` — 8 nieuwe tests (conditie C).
- `apps/api/src/__tests__/services/flywheel-bootstrap-run.test.ts` — 5 nieuwe tests (realRefPaths-contract).
- `apps/api/src/__tests__/services/flywheel-balanced-sampler.test.ts`, `flywheel-guard-5-5.atdd.test.ts`, `flywheel-review-routing-19-8.atdd.test.ts` — default `referenceLogo.findMany`-mock (geen nieuwe cases).
- `_bmad-output/implementation-artifacts/review-19-9-code-review.md`, `review-19-9-test-review.md`, `trace-19-9.md`, `nfr-19-9.md`, `retrospective-19-9.md`, `19-9-eval-reproductie.md` — review-, retro- en eval/live-artefacten.

## Change Log
- 2026-07-07: aangemaakt via bmad-create-story (na correct-course). Fase-2-story: schakelmoment per klasse — bij ≥ k=3 bevestigde echte crops → nearest-reference-ranking (conditie C) i.p.v. de absolute gids-drempel. Bewezen 44%→100% in de 19.7-spike, zonder training. Bouwt op 19.8 (live op ACC).
- 2026-07-12: implement-sprint epic-agent — Tasks 1-5,7 geïmplementeerd (4 raakpunten: bootstrap_search.py, flywheel.py, ml-client.ts, bootstrap-run.ts, config.ts), 2 code-review-cycli (6 bevindingen gefixt) + test-review (2 dekkingslacunes gedicht) + traceability (ac_trace 4/4) + NFR (PASS). Gate G: `tsc --noEmit` 0; api-vitest volledige suite 877/916 groen (2 skip, 37 todo, 0 fail); ml-pytest volledige suite (12 bestanden, tegen `ghcr.io/xxtract-development/logo-recognition-ml:acc`) 83 passed/14 skipped/1 gefaald — de faling is PRE-EXISTING en niet door 19.9 veroorzaakt (`test_no_node_content_hash.py`, vlagt `artwork-pipeline.ts` dat door 19.9 niet is aangeraakt en byte-identiek is aan base `7b9e2a7`). Task 6 (eval AC5) + Task 8 (live) blijven PENDING-PERMISSION — status → `review`, niet `done`.
- 2026-07-12: Tasks 6+8 uitgevoerd na expliciete toestemming Friso. AC5 eval read-only op ACC: micro top-1 61%→99%. Conditie C gedeployd naar ACC (push `acc`→ghcr build→Coolify auto-deploy, image `1d6733f`, beide containers healthy). Task 8 live-verificatie tegen de gedeployde `search_with_seed`: `ranking_active=true`, 12/12 conditie-C-winst-matches, contrast-run zonder refs = 0 matches, NFR-6 intact. Alle AC's (1-5) bewezen → **status → `done`**.
