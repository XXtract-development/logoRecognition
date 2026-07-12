# Story 19.9: Fase 2 — nearest-reference-ranking zodra een klasse ≥ k echte crops heeft

Status: in-progress

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

- [ ] 1. **Echte-crop-referenties per code laden (AC: 1, 2)** — bepaal per keurmerkcode het aantal + de embeddings van de ACTIEVE echte referentie-crops. **Ontwerpbeslissing (motiveren):** laadt de ml-service ze zelf (uit MinIO/`reference_embeddings`) óf geeft de API ze mee aan `bootstrapSearch`? De embeddings leven in Postgres `reference_embeddings` (pgvector) bij `reference_logos` (prisma/API-kant); de ml-service heeft geen directe Postgres-toegang. Waarschijnlijk: de API laadt de crop-keys/embeddings van de klasse en geeft ze mee (uitbreiding van het `/ml/bootstrap-search`-contract), analoog aan `seed_path`.
- [ ] 2. **Schakelmoment + nearest-reference-rank in `search_with_seed` (AC: 1, 3)** — bij ≥ k meegegeven echte referentie-embeddings: vervang/uitbreid de match-conditie (`sim = cosine(emb, seed_emb); if sim < threshold: continue`, `bootstrap_search.py:219-221`) door **conditie C**: `ref_sim = max(cosine(emb, r) for r in real_refs)`; match als `ref_sim ≥ ranking_threshold` (nearest-reference), met het gids-zaad als aanvulling/fallback. Onder k: ongewijzigd het gids-pad. NFR-6-zaadlek-guard (`:226`) en de gate-voorfilter (`:215-217`) blijven vóór de rank.
- [ ] 3. **Config (AC: 1)** — `k` = `FLYWHEEL_RANKING_MIN_REFS` (default 3) + de nearest-reference-drempel `FLYWHEEL_RANKING_THRESHOLD` (startwaarde uit de spike-verdeling; documenteren, kalibreerbaar). Param wint van env (patroon `getBootstrapThreshold`).
- [ ] 4. **API-aansluiting (AC: 1, 2)** — het zoek-/nominatiepad (`searchAndQueueClassForReview` / `mlClient.bootstrapSearch`) levert per klasse de echte-crop-referenties aan wanneer ≥ k; anders roept het het pad kaal aan (gids-only). Geen wijziging aan de 19.8-review-routering of de kleppen.
- [ ] 5. **Tests (AC: 4)** — ml-pytest: (a) ≥ k refs → echte-crop-nabije regio met lage gids-cosine matcht (faalt op gids-only); (b) < k → gids-pad; (c) NFR-6 + gate + dedup ongemoeid. api-vitest: het contract geeft de refs mee bij ≥ k, niet bij < k. Faalt op het oude gedrag.
- [ ] 6. **Eval-reproductie (AC: 5)** — reproduceer de spike-meting (leave-one-GTIN-out) op de klassen mét echte crops; bevestig top-1 richting ~100% + geen guard-/gold-set-regressie. `sweep.py`/`extract.py` (uit de 19.7-spike) als read-only vertrekpunt.
- [ ] 7. **Gates** — `tsc --noEmit` 0; volledige api-vitest + ml-pytest groen (geen regressies).
- [ ] 8. **Live-verificatie (AC: 5)** — met toestemming: op ACC een klasse met ≥ k echte crops (bouw die desnoods eerst via een extra 19.8-reviewronde) door conditie C halen en het effect meten. Gold-set/human-review als vangnet.

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

### Debug Log References

### Completion Notes List

### File List

## Change Log
- 2026-07-07: aangemaakt via bmad-create-story (na correct-course). Fase-2-story: schakelmoment per klasse — bij ≥ k=3 bevestigde echte crops → nearest-reference-ranking (conditie C) i.p.v. de absolute gids-drempel. Bewezen 44%→100% in de 19.7-spike, zonder training. Bouwt op 19.8 (live op ACC).
