# Story 19.10: Harvest-koppeling + scope-begrenzing — `queue_harvest` als doorlopende echte-crop-bron

Status: review

<!-- Correct-course 2026-07-07 (sprint-change-proposal-2026-07-07.md): de derde en laatste story van de twee-traps-uitbreiding. 19.8 ontstopt het straaltje (bootstrap-crops → review), 19.9 maakt de volle kraan (nearest-reference bij ≥k), 19.10 VOEDT en BEGRENST: koppelt de nachtelijke harvester als doorlopende echte-crop-bron die klassen over de k-drempel tilt, met scope-begrenzing (top-N volume-keurmerken; RECYCLABLE/TRIMAN apart). Laatste open story van epic-19. -->

## Story

Als **datamanager van het keurmerk-vliegwiel**
wil ik **dat de nachtelijke `queue_harvest` gericht echte crops aandraagt voor de keurmerkklassen die nog ónder de k-drempel zitten (en dat de scope begrensd blijft tot de top-N volume-keurmerken, met RECYCLABLE/TRIMAN apart bewaakt)**
zodat **klassen doorlopend en zelfstandig over de k=3-drempel getild worden en 19.9's nearest-reference-ranking (conditie C) voor steeds meer keurmerken aanslaat — zonder review-flood of precisieverlies** (FR-22, FR-12, NFR-3).

### Afbakening (kritiek)
- **Bron:** correct-course `sprint-change-proposal-2026-07-07.md` — "Story 19.10 — Harvest-koppeling + scope-begrenzing": `queue_harvest` als doorlopende echte-crop-bron die klassen over de k-drempel tilt (voedt 19.9). Scope: top-N volume-keurmerken eerst; RECYCLABLE/TRIMAN apart valideren.
- **Bouwt op (nu LIVE):** 19.8 (`b2b291f`, bootstrap-crops → OPEN review-items → mens bevestigt → echte ref), 19.9 (`1d6733f`, conditie C nearest-reference bij ≥ k=3 echte refs), 19.15 (`0c9712f`, gids-zaad-voorkeur). De harvester is de **doorlopende** tegenhanger van 19.8's bootstrap-run: 19.8 vult lege klassen, `queue_harvest` blijft nachtelijk crops aandragen voor klassen die al ≥1 actieve ref hebben zodat ze richting/over k groeien.
- **Huidige harvester (bestaand, `queue_harvest.py`):** nachtelijke Coolify scheduled task in de ml-container. Loopt artwork-GTINs af (batched, resume via `keurmerk-harvest/state.json` in MinIO), stelt regio's voor, embedt, keurmerk-gate (gate-v2), `find_similar_references` tegen ACTIEVE refs met **FLOOR 0,85**, per-code-cap 25, en INSERT OPEN `artwork_review_items` (status `open`, method `embedding`). Het scope-`topn` = **elke** code met ≥1 actieve referentie (regel 117-122). Heeft `HARVEST_DRY_RUN` (harvest+classify zonder crop-upload/DB-insert/state-write).
- **De kern is klasse-selectie + scope-begrenzing — GEEN nieuwe pijplijn:** de harvest-mechaniek (regio→embed→gate→nearest-ref→cap→review-insert) blijft. 19.10 wijzigt UITSLUITEND (a) WELKE klassen geharvest worden en met welke prioriteit, en (b) de expliciete flood-begrenzing voor de staart-klassen.
- **Review-origin is LEIDEND en ongewijzigd:** geharveste crops landen als OPEN `artwork_review_items` (mens bevestigt ECHT/VALS) — nooit auto-promotie. Dit is precies het 19.8-review-pad; 19.10 verandert daar niets aan, het voedt het alleen doorlopend.
- **Vangnet ONGEWIJZIGD en leidend:** declaratie-guard (19.5), gold-set-regressie, phash-/embedding-dedup, class-cap, hard-negative-blokkade (AD-12), NFR-6. De keurmerk-gate (gate-v2) en FLOOR 0,85 (precisie ~74%, geen flood — gevalideerd 2026-06-15, `12-4-gate-v2-resultaten.md`) blijven de precisie-kleppen.
- **RECYCLABLE/TRIMAN (harde staart):** 0 echte crops in de gold_set, flood-gevoelig (universe-probe variant-family-plafond ~14%). RECYCLABLE heeft ná 19.13 26 actieve `realref-live-poc`-refs (waarvan 22 near-dups uit 1 GTIN) → het valt nu binnen `topn` en kan floods veroorzaken. Deze klassen expliciet apart behandelen (uitsluiten of onder een strengere cap/vloer) en apart valideren — GEEN verwachting dat ze meeliften op de top-N.
- **Geen wijziging aan:** het embedding-model, de region-proposer, de keurmerk-gate-drempel (gate-v2), conditie C (19.9), `resolveSeedPath` (19.15), of de 19.8-review-routering zelf.
- **Elke ACC-schrijf/deploy/eval/harvest-run met expliciete toestemming per geval; container zelfstandig herstartbaar. `HARVEST_DRY_RUN` is het read-only vertrekpunt.**

## Acceptatiecriteria

1. **Given** de nachtelijke harvester draait
   **When** hij de te-harvesten klassen (`topn`) bepaalt
   **Then** prioriteert/scoopt hij op de **top-N volume-keurmerken** (env-configureerbaar) i.p.v. simpelweg élke code met ≥1 actieve referentie — zodat het harvest-budget (BATCH/MAX_SECONDS/per-code-cap) naar de klassen gaat die het vliegwiel het meest voeden, en klassen die nog ónder k=3 echte refs zitten aantoonbaar meegenomen worden om ze richting/over k te tillen.

2. **Given** een geharveste crop die de gate + FLOOR 0,85 haalt
   **When** hij wordt vastgelegd
   **Then** landt hij als **OPEN `artwork_review_item`** (herkomst = review-pad, 19.8) voor menselijke bevestiging — nooit als auto-gepromote referentie. Een mens die ECHT bevestigt levert een echte referentie die (bij ≥ k) 19.9's conditie C voedt. Geen gedragswijziging aan de review-routering.

3. **Given** de flood-gevoelige staart-klassen (RECYCLABLE, TRIMAN)
   **When** de harvester draait
   **Then** worden die expliciet apart behandeld (uitgesloten van de top-N-scope óf onder een strengere begrenzing) zodat ze geen review-flood veroorzaken — bewijsbaar: het aantal geharveste kandidaten voor die klassen blijft onder een expliciete grens, en de overige klassen worden niet verdrongen.

4. **Given** conditie C actief (19.9) op klassen die via de harvester over k kwamen
   **When** een harvest-run + review-bevestiging heeft plaatsgevonden
   **Then** blijven ALLE kleppen ongemoeid: declaratie-guard, gold-set-regressie, dedup, class-cap, hard-negative, NFR-6; en de bestaande harvest-precisiekleppen (gate-v2 + FLOOR 0,85) blijven gelden.

5. **Given** de wijziging
   **When** de testsuite draait
   **Then** dekt een ml-pytest: (a) de klasse-selectie prioriteert/scoopt op de top-N (faalt op het oude "alle codes met actieve refs"-gedrag); (b) RECYCLABLE/TRIMAN worden apart begrensd/uitgesloten (flood-guard); (c) de review-insert + kleppen blijven ongemoeid; (d) `HARVEST_DRY_RUN` muteert niets. `tsc --noEmit` 0 (indien api-kant geraakt), de ml-pytest én (indien geraakt) api-vitest groen.

6. **Given** de bestaande harvest-runbook/gold-set
   **When** (met toestemming) een `HARVEST_DRY_RUN` op ACC draait
   **Then** toont de run de nieuwe scoping in werking: het harvest-budget gaat naar de top-N/sub-k-klassen, RECYCLABLE/TRIMAN blijven begrensd, en de per-code-verdeling bevat geen flood — meetbaar vastgelegd (read-only, geen queue-mutatie).

## Tasks / Subtasks

- [x] 1. **Klasse-selectie: top-N volume-scoping + sub-k-prioritering (AC: 1)** — vervang/uitbreid de `topn`-bepaling (`queue_harvest.py:117-122`, nu "alle codes met actieve refs"). **Ontwerpbeslissing (motiveren):** bepaal de top-N volume-keurmerken (bron: de keurmerk-etiket-index / declaratiefrequentie, `flywheel-index/keurmerk-etiket-index.json` of `bootstrapQueue.declarationFrequency`) en scoop de harvest daarop; neem daarbinnen expliciet de klassen mee die nog < k=3 actieve echte refs hebben (die het meest van harvesting profiteren). Env: `HARVEST_TOP_N` (default kalibreerbaar). Documenteer de bron van de volume-ranking. **Gedaan**: `HARVEST_TOP_N` (default 30) + `_load_volume_index()` leest `flywheel-index/keurmerk-etiket-index.json` (tolereert zowel het flat-dict-testcontract als het echte `KeurmerkIndex`-schema van `build-keurmerk-index.ts`, geaggregeerd op `summary.perKey[...].labels` per code). Sub-k via `SELECT t3777_code, COUNT(*) AS n ... GROUP BY t3777_code` + `MIN_REFS_SUB_K=3` (aligned met 19.9).
- [x] 2. **RECYCLABLE/TRIMAN flood-guard (AC: 3)** — behandel de flood-gevoelige staart-klassen expliciet apart: uitsluiten van de top-N-scope of onder een strengere per-code-cap/FLOOR. Env-lijst `HARVEST_EXCLUDE_CODES` (default `RECYCLABLE_GENERAL_CLAIM,TRIMAN` — verifieer de exacte t3777-codes) of een aparte cap. Documenteer de keuze (uitsluiten vs strenger begrenzen) met de flood-rationale. **Gedaan**: optie A (volledige uitsluiting) gekozen, conform de orchestrator-opdracht en het ATDD-contract (review F2) — `EXCLUDE_CODES` wint altijd van zowel top-N als sub-k.
- [x] 3. **Review-origin-koppeling bevestigen (AC: 2)** — verifieer + borg (test) dat de harvest-insert het OPEN-review-pad blijft volgen (status `open`, geen auto-promotie), consistent met 19.8. Geen gedragswijziging; wél expliciet getest zodat een toekomstige refactor het niet stilzwijgend breekt. **Gedaan**: ongewijzigd, geborgd door `test_ac2_crop_landt_als_open_review_item_geen_auto_promotie_GREEN` (groen, ook vóór de wijziging).
- [x] 4. **Vangnet-borging (AC: 4)** — bevestig (test + redenering) dat gate-v2, FLOOR 0,85, dedup, class-cap, hard-negative, declaratie-guard en NFR-6 ongemoeid blijven onder de nieuwe scoping. **Gedaan**: gate/FLOOR/cap-mechaniek volledig ongewijzigd (alleen de `topn`-membership-check verandert); geborgd door `test_ac4a/b/c_..._GREEN`.
- [x] 5. **Tests (AC: 5)** — ml-pytest: (a) top-N/sub-k-selectie (faalt op oud "alle actieve codes"); (b) RECYCLABLE/TRIMAN-flood-guard; (c) review-insert + kleppen ongemoeid; (d) `HARVEST_DRY_RUN` muteert niets. Zoek bestaande harvest-tests op en breid uit i.p.v. dupliceren. **Gedaan**: bestaande ATDD-suite (`test_queue_harvest_19_10.py`, al aanwezig vóór dev-fase) — 9/9 groen ná implementatie (container-bewijs, zie Completion Notes).
- [x] 6. **Gates** — ml-pytest volledig groen; `tsc --noEmit` 0 + api-vitest groen indien de api-kant/config geraakt wordt (anders git-hard beargumenteren dat die onaangeraakt zijn). **Gedaan**: alleen `apps/ml-service/app/services/queue_harvest.py` gewijzigd — geen `apps/api`-raakvlak, tsc/api-vitest git-hard niet vereist.
- [ ] 7. **Live-verificatie (AC: 6)** — met toestemming: `HARVEST_DRY_RUN=1` op ACC draaien, de per-code-verdeling + scoping vastleggen (geen flood, budget naar top-N/sub-k), read-only. Daarna (aparte toestemming) een echte run om de flywheel-voeding te bevestigen. Gold-set/human-review als vangnet. **NIET uitgevoerd** — vereist expliciete per-geval toestemming van Friso (permission-gate); niet gegeven binnen deze run. Blijft open, gemarkeerd als pending-permission.
- [ ] 8. **Epic-afronding** — dit is de laatste open story van epic-19; na `done` een verse epic-19-retrospective (de bestaande `epic-19-retrospective: done` is stale van 2026-07-05, epic sindsdien fors uitgebreid). **NIET uitgevoerd in deze run** — story blijft op `review` (niet `done`, wegens Task 7 pending-permission), dus de epic-afronding/retrospective is nog niet gepast; wel wordt hieronder een tussentijdse story-retrospective vastgelegd.

## Dev Notes — Developer Context

### Huidige staat (bestand UPDATE)
- `apps/ml-service/app/services/queue_harvest.py` — de volledige harvester (233 regels). `run_batch()` (regel 69): laadt state (`next_offset`), lijst artwork-GTINs, bepaalt `topn` = **elke** code met actieve refs (`SELECT DISTINCT t3777_code FROM reference_logos WHERE active=true`, regel 118-122), loopt GTINs (batched, time-boxed), per crop: `propose_regions` → embed → `keurmerk_probability` < `GATE_THRESHOLD` skip → `find_similar_references(threshold=FLOOR=0,85)` → `code not in topn or cap` skip → queue → INSERT OPEN `artwork_review_items` (regel 194, method `embedding`, reason MARKER "12.6 acceptatie-kandidaat (assembler)"). `HARVEST_DRY_RUN` slaat crop-upload/DB-insert/state-write over (regel 183). **19.10 wisselt UITSLUITEND de `topn`-bepaling (regel 117-122) + voegt de flood-guard toe**; de harvest-mechaniek, de review-insert, de gate/FLOOR en de resume-state blijven.
- **NB scope-consistentie:** de harvester matcht tegen ACTIEVE refs met FLOOR 0,85 (hoge precisie, geen flood). Dit staat los van 19.9's `ranking_threshold` (0,60) en de bootstrap-drempel (0,60) — de harvest-FLOOR is bewust hoger (precisie-klep vóór de mens). NIET verlagen zonder aparte precisiemeting.

### Waarom dit de keten sluit
Lege klasse → 19.8 (bootstrap → review → eerste echte crops) → `queue_harvest` (19.10, doorlopend → meer crops → review → over k) → 19.9 (conditie C neemt het over, ~100%) → 19.15 (gids-zaad blijft semantisch correct als fallback). 19.10 is de motor die het vliegwiel dráaiend houdt zonder handmatige bootstrap-runs, met de scope-begrenzing als flood-rem.

### Wat behouden moet blijven
- De 6 kleppen (guard/gold-set/dedup/cap/hard-negative/NFR-6) + gate-v2 + FLOOR 0,85.
- Het OPEN-review-pad (19.8) — geharveste crops gaan naar de mens, nooit auto-promotie.
- De resume-state (`keurmerk-harvest/state.json`) en de disjuncte-batch-append-semantiek (nooit de queue wissen).
- Conditie C (19.9), `resolveSeedPath` (19.15), region-proposer, embedding-model — ongewijzigd.

### Open ontwerpvragen (voor dev-story)
- **Volume-bron (Task 1):** waaruit komt de "top-N volume"-ranking? Kandidaten: `flywheel-index/keurmerk-etiket-index.json` (MinIO, index-keys `Categorie/CODE`), of `bootstrapQueue.declarationFrequency` (Postgres, api-kant). De harvester leeft in de ml-service (geen directe Prisma) — laadt hij de ranking uit MinIO, of geeft een api-endpoint/env de top-N-lijst mee? Kies consistent met bestaande patronen.
- **RECYCLABLE/TRIMAN (Task 2):** uitsluiten (env-lijst) óf onder strengere cap/FLOOR? Bevestig de exacte t3777-codes (`RECYCLABLE_GENERAL_CLAIM`, `TRIMAN` — check tegen de DB).
- **Sub-k-prioritering (Task 1):** expliciet klassen < k=3 vóórtrekken, of volstaat top-N-volume-scoping? Meet in de DRY_RUN welke aanpak het budget het best benut.

### References
- [Source: sprint-change-proposal-2026-07-07.md] — "Story 19.10 — Harvest-koppeling + scope-begrenzing" (de kern-definitie).
- [Source: apps/ml-service/app/services/queue_harvest.py#69-229] — de te-wijzigen harvester (`topn`-bepaling regel 117-122).
- [Source: 12-4-gate-v2-resultaten.md + keurmerk-harvest-runbook.md] — het gevalideerde operating point (gate-v2 + FLOOR 0,85 → ~74% precisie, geen flood).
- [Source: 19-8-fase1-bootstrap-crops-naar-review.md] — het OPEN-review-pad dat de harvest voedt.
- [Source: 19-9-fase2-nearest-reference-ranking.md] — conditie C (waar de over-k-getilde klassen in aanslaan).
- Geheugen: `project_queue_harvester`, `project_flywheel_resume`, `project_keurmerk_dekking_strategie`, `project_124_gate_v2`.

### Project Structure Notes
- Wijziging blijft binnen `apps/ml-service/app/services/queue_harvest.py` (+ eventueel een config/env-uitbreiding en, indien de volume-ranking via de api komt, een klein leespad). Geen schema-migratie verwacht (leest bestaande `reference_logos`/index).
- Test-runner: ml-pytest (wegwerp-container van de ghcr-ml-image; runtime-image mist pytest — zie geheugen `project_flywheel_resume`).

## Dev Agent Record

### Agent Model Used
Claude Opus 4.8 (epic-agent, implement-sprint), via bmad-dev-auto-geleide implementatie op branch `epic-19-story-19.10`.

### Debug Log References
- ATDD container-run vóór implementatie (bestaand bewijs): 4 RED / 5 GREEN — zie `_bmad-output/implementation-artifacts/review-19-10-atdd-adversarial.md`.
- ATDD container-run ná implementatie: `docker run --rm --platform linux/amd64 -v <worktree>/apps/ml-service/app:/app/app -v <worktree>/apps/ml-service/tests:/app/tests -w /app ghcr.io/xxtract-development/logo-recognition-ml:acc sh -c 'pip install -q pytest pytest-asyncio; python -m pytest tests/unit/test_queue_harvest_19_10.py -p no:cacheprovider -rA -q'` → **9 passed** (alle 4 voorheen-RODE + alle 5 GREEN-preservatietests).

### Completion Notes List
- `topn` = `(top-N-op-volume ∪ sub-k) − exclude_codes`, geïmplementeerd exact volgens het ATDD-contract (checklist `atdd-checklist-19-10.md`).
- Volume-bron: `_load_volume_index()` leest `flywheel-index/keurmerk-etiket-index.json` via `storage_service.get_training_image`. Ondersteunt zowel het simpele flat-dict-testcontract (`{code: volume}`) als het echte, rijkere `KeurmerkIndex`-schema dat `apps/api/src/scripts/build-keurmerk-index.ts` daadwerkelijk produceert (`summary.perKey["fieldType/code"] = {gtins, labels}`) — aggregeert `labels`-tellingen per code over fieldTypes heen. Dit dekt zowel de ATDD-fixture als de productie-realiteit; ontbreekt/faalt de index → lege ranking (nooit terugval op "alle actieve codes").
- Sub-k-query uitgebreid met `COUNT(*) AS n` per code (was `SELECT DISTINCT`), `MIN_REFS_SUB_K=3` aligned met 19.9's `min_refs`.
- `HARVEST_EXCLUDE_CODES` default `RECYCLABLE_GENERAL_CLAIM,TRIMAN`; optie A (volledige uitsluiting) gekozen conform orchestrator-opdracht + ATDD-review F2.
- Geen wijziging aan de harvest-mechaniek, gate/FLOOR/cap, resume-state, DRY_RUN of aan `apps/api` — enige gewijzigde bestand is `apps/ml-service/app/services/queue_harvest.py`.
- Task 7 (live DRY_RUN op ACC, AC6) NIET uitgevoerd: permission-gate, geen expliciete toestemming ontvangen binnen deze run. Story blijft op `review`.

### File List
- `apps/ml-service/app/services/queue_harvest.py` — `topn`-bepaling vervangen + `_load_volume_index()` toegevoegd + module-docstring/env-blok bijgewerkt.
- `apps/ml-service/tests/unit/test_queue_harvest_19_10.py` — ongewijzigd (bestond al, RED→GREEN via de implementatie).

## Traceability (C-trace, implement-sprint-protocol §3)

| AC | Dekkende test | Status ná implementatie |
|----|----------------|--------------------------|
| AC1 | `test_ac1_scoopt_op_top_n_en_neemt_sub_k_mee_RED`, `test_ac1_top_n_nul_houdt_alleen_sub_k_over_RED` | GREEN |
| AC2 | `test_ac2_crop_landt_als_open_review_item_geen_auto_promotie_GREEN` | GREEN |
| AC3 | `test_ac3_expliciete_exclude_weert_top_volume_en_sub_k_RED`, `test_ac3_default_exclude_weert_recyclable_RED` | GREEN |
| AC4 | `test_ac4a_gate_weert_crop_onder_gate_threshold_GREEN`, `test_ac4b_floor_weert_crop_onder_085_GREEN`, `test_ac4c_per_code_cap_gehandhaafd_GREEN` | GREEN |
| AC5 | (= alle bovenstaande, dit IS de ml-pytest-dekking die AC5 vraagt) + `test_ac5d_dry_run_muteert_niets_GREEN` | GREEN — 9/9 in container |
| AC6 | live `HARVEST_DRY_RUN` op ACC | **pending-permission** — niet geautomatiseerd, expliciete per-geval toestemming vereist en niet ontvangen in deze run |

9/9 tests GREEN in de ghcr-container-run (zie Debug Log References). Volledige AC→test-mapping (met redenering/edge-cases) staat ook in `_bmad-output/test-artifacts/atdd-checklist-19-10.md` en `_bmad-output/implementation-artifacts/review-19-10-atdd-adversarial.md`.

## Change Log
- 2026-07-12: aangemaakt via bmad-create-story (correct-course 2026-07-07). Laatste open story van epic-19. Scope: `queue_harvest` klasse-selectie → top-N volume-scoping + sub-k-prioritering, met expliciete RECYCLABLE/TRIMAN-flood-guard; review-origin-koppeling (19.8) bevestigd; vangnet + gate-v2/FLOOR 0,85 ongewijzigd. Voedt 19.9's conditie C doorlopend. Na `done`: verse epic-19-retrospective.
- 2026-07-12: implement-sprint (epic-agent) — Tasks 1-6 af (AC1-5). `queue_harvest.py` topn-bepaling geïmplementeerd; alle 4 RED-tests GREEN, alle 5 preservatie-tests blijven GREEN (container-bewijs 9/9 passed). Task 7/AC6 (live ACC DRY_RUN) NIET uitgevoerd (permission-gate) — status blijft `review`.
