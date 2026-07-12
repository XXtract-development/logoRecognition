# Traceability Matrix — Story 19.9 (fase 2, nearest-reference-ranking / conditie C)

> Graceful degradation: geen `_bmad/tea/testarch/tea-index.csv` in dit project (geen volledige
> BMAD-tea-installatie) — de matrix is direct opgesteld tegen de daadwerkelijke test-bestanden
> en regelnummers, geverifieerd door de tests te draaien.

scope: AC1, AC2, AC3, AC4 (autonome scope van deze implement-sprint-run).
out_of_scope: AC5 — permission-gated eval-reproductie (Task 6) + live-ACC-verificatie (Task 8);
expliciete toestemming van Friso vereist per de story-afbakening. Geen coverage-gap — bewust
buiten scope, zie `blocked_stories`/story-`Status:`.

## AC1 — conditie C matcht op de hoogste cosine over de echte refs (nearest-reference), óók als de gids-cosine onder de drempel valt

| Test | Bestand:regel | Bewijst |
|---|---|---|
| `test_c_ge_k_refs_matcht_ondanks_lage_gids_cosine` | `apps/ml-service/tests/unit/test_bootstrap_search_service.py:486` | ≥k (3) refs → regio met `seed_cosine < 0,6` matcht via `ranking_cosine >= 0,6`. Faalt op het oude gids-only-gedrag (dat kende `real_ref_paths` niet). |
| `test_c_gids_pad_blijft_fallback_ook_met_conditie_c_actief` | `apps/ml-service/tests/unit/test_bootstrap_search_service.py:594` | Het gids-pad blijft ALS AANVULLING/FALLBACK gelden zodra conditie C actief is (OR, geen vervanging) — een regio dicht bij het zaad matcht nog steeds via `seed_cosine`. |

**Status: gedekt.**

## AC2 — onder k refs blijft het bestaande gids-drempel-pad exact gelden

| Test | Bestand:regel | Bewijst |
|---|---|---|
| `test_c_onder_k_refs_ongewijzigd_gids_pad` | `apps/ml-service/tests/unit/test_bootstrap_search_service.py:508` | <k (2 van default k=3) refs → `ranking_active=False`, dezelfde regio (lage gids-cosine) matcht niet. |
| `test_c_onleesbare_ref_telt_niet_mee_voor_k` | `apps/ml-service/tests/unit/test_bootstrap_search_service.py:523` | Een onleesbare ref telt niet mee voor k (zacht falen, NFR-3-patroon) — 2 leesbare + 1 kapotte blijft <k. |
| `'roept de ml-zoektocht KAAL aan ...'` | `apps/api/src/__tests__/services/flywheel-bootstrap-run.test.ts:452` | API-contract: <k actieve refs → `mlClient.bootstrapSearch` zonder `realRefPaths`/`rankingThreshold`/`minRefs`. Faalt op het oude gedrag als het contract per ongeluk altijd refs meegeeft. |

**Status: gedekt.**

## AC3 — alle kleppen (guard/gold-set/dedup/cap/hard-negative) + NFR-6 blijven ongemoeid onder conditie C

| Test | Bestand:regel | Bewijst |
|---|---|---|
| `test_c_gate_blijft_gelden_ondanks_conditie_c` | `apps/ml-service/tests/unit/test_bootstrap_search_service.py:539` | De keurmerk-gate-voorfilter blijft vóór conditie C gelden — een regio die de gate niet haalt wordt geweerd, ook al zou de ranking-cosine matchen. |
| `test_c_nfr6_zaadlek_guard_blijft_gelden_ondanks_conditie_c` | `apps/ml-service/tests/unit/test_bootstrap_search_service.py:555` | Een regio die inhoudelijk het zaadbeeld is, wordt ook onder conditie C nooit als output-crop teruggegeven. |
| `test_c_regio_matcht_niet_als_beide_signalen_onder_de_drempel_blijven` | `apps/ml-service/tests/unit/test_bootstrap_search_service.py:620` | Conditie C matcht niet zomaar alles zodra ≥k refs aanwezig zijn — een regio ver van zowel zaad als refs matcht niet. |
| declaratie-guard (19.5), hard-negative + dedup (19.8) | `apps/api/src/__tests__/services/flywheel-bootstrap-run.test.ts` (bestaande AC1/AC2-blokken, ongewijzigd door 19.9) | Deze kleppen leven in `bootstrap-run.ts`/`queueCropForReview`, NIET aangeraakt door de 19.9-diff (geverifieerd: `git diff` op dat gebied bevat alleen commentaar-toevoegingen) — de bestaande, groen blijvende tests bewijzen dat het gedrag ongewijzigd is. |
| class-cap, gold-set-regressie | niet geraakt door deze diff (buiten de 4 raakpunten) | Geen enkel gewijzigd bestand behoort tot deze modules — regressievrij per constructie, bevestigd door de Acceptance Auditor (code-review cyclus 1). |

**Status: gedekt.**

## AC4 — de testsuite zelf (dekking + groen)

| Vereiste | Bewijs |
|---|---|
| (a) ≥k refs matcht (faalt op gids-only) | `test_c_ge_k_refs_matcht_ondanks_lage_gids_cosine` — zie AC1. |
| (b) <k → gids-pad | `test_c_onder_k_refs_ongewijzigd_gids_pad` + vitest-contracttest — zie AC2. |
| (c) NFR-6 + gate + dedup ongemoeid | `test_c_gate_blijft_gelden_ondanks_conditie_c` + `test_c_nfr6_zaadlek_guard_blijft_gelden_ondanks_conditie_c` + bestaande dedup/hard-negative-tests — zie AC3. |
| `tsc --noEmit` 0 | Geverifieerd (zie code-review-rapport + herhaald na TR-fixes). |
| api-vitest groen | `flywheel-bootstrap-run.test.ts` 28/28; `flywheel-balanced-sampler.test.ts`/`flywheel-guard-5-5.atdd.test.ts`/`flywheel-review-routing-19-8.atdd.test.ts` 23/23. Volledige suite: zie Gate G (na NFR). |
| ml-pytest groen | `test_bootstrap_search_service.py` 20/20. Volledige suite: zie Gate G (na NFR). |

**Status: gedekt** (volledige-suite-bevestiging volgt in Gate G, geen AC4-gat op zich).

## Samenvatting

| AC | Dekking |
|---|---|
| AC1 | 2/2 tests, gedekt |
| AC2 | 3/3 tests, gedekt |
| AC3 | 3 nieuwe + bestaande ongewijzigde tests, gedekt |
| AC4 | volledig gedekt door bovenstaande + Gate G |
| AC5 | pending-permission (Task 6/8), bewust buiten scope — geen gap |

**ac_trace: 4/4** (AC1-4, de autonome scope van deze run).
