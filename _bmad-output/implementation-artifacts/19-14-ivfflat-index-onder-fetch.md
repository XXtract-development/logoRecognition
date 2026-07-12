---
baseline_commit: 0aab6e2920a2f51415eacbc684e040a2763b886f
---
<!-- Story 19.14 — ivfflat-index onder-fetch corrigeren -->
<!-- Aangemaakt 2026-07-11 via bmad-create-story. Bron: ACC-diagnose + adversariële review 2026-07-11 (geheugen project_recyclable_dead_refs). Uitvoervolgorde 1e van 3 (19.14 → 19.12 → 19.13). -->

# Story 19.14: ivfflat-index onder-fetch corrigeren

Status: done

## Story

As a systeembeheerder,
I want dat de nearest-neighbor-zoek de werkelijke dichtstbijzijnde referenties teruggeeft,
so that keurmerkherkenning niet stilletjes buren mist door een verkeerd geconfigureerde vector-index.

## Afbakening (kritiek — geverifieerde root cause)

Op ACC (2026-07-11, read-only geverifieerd):

- De index is `idx_reference_embeddings_embedding = CREATE INDEX ... USING ivfflat (embedding vector_cosine_ops) WITH (lists='100')` op een tabel met **215 rijen**. Met `lists=100` bevat elk cluster ~2 rijen; de standaard `ivfflat.probes=1` scant precies één cluster → de query geeft **~1 buur** terug i.p.v. de gevraagde N.
- **Bewijs:** met de index gaf een nearest-neighbor-query 1 rij; met een geforceerde exacte seqscan gaf dezelfde query 12 rijen. Over een steekproef van 8 codes gaf de index 1–5 rijen (vaak 1) waar N=5 werd gevraagd; de index-top1 klopte 7/8 met de exacte top1 (dus de huidige impact is bescheiden, maar het is een latente correctheidszorg voor **alle** codes).
- **De index staat NIET in de repo-migraties.** Migratie `0005_add_reference_embeddings` maakt alleen een btree-index op `reference_logo_id`; de ivfflat-index is ooit ad-hoc op de ACC-database aangemaakt. Er is dus geen code-artefact dat de `lists`-parameter bevat — de fix moet expliciet committeerbaar worden gemaakt.
- **Scope beperkt tot `reference_embeddings`.** De detector-tabel `logo_embeddings` (via `find_similar_logos`, `apps/ml-service/app/services/database.py:351`) heeft **géén** ivfflat-index en is dus niet onder-fetchend; die query valt buiten deze story.
- **REINDEX lost het niet op.** `reindex_reference_embeddings()` (`database.py:422`, Story 8-N1) herbouwt de index mét dezelfde `lists=100` — het herstelt degenererende clusters ná een table-clear, maar corrigeert de verkeerde `lists`-keuze niet.

**Niet in scope:** de embedding-kwaliteit zelf (model is NIET stale, cosine 1,0 vers vs opgeslagen), de RECYCLABLE-referenties (Story 19.13) en het mens-accept-gat (Story 19.12).

## Acceptatiecriteria

1. **Given** de degenererende ivfflat-index (`lists=100` op 215 rijen, `probes=1`)
   **When** `find_similar_references(embedding, limit=N)` draait
   **Then** geeft die tot N werkelijke naaste buren terug (niet stelselmatig ~1), geverifieerd met een vóór/na-meting: aantal teruggegeven buren én index-top1-vs-exact(seqscan)-top1-agreement over een steekproef.

2. **Given** dat de fix committeerbaar moet zijn terwijl de index niet in de repo staat
   **When** de oplossing wordt gekozen
   **Then** wordt die verankerd in code/migratie — óf een migratie die de index met passende `lists` (≈√N) (her)definieert of dropt (seqscan is prima bij deze N), óf `SET LOCAL ivfflat.probes` binnen een expliciete transactie in `find_similar_references` — en **nooit** een kale `SET` op de pooled connectie (die lekt naar hergebruikte queries).

3. **Given** een regressietest die de under-fetch reproduceert
   **When** de test draait
   **Then** bouwt hij eerst een gevulde ivfflat-index in de degenererende toestand op (anders doet Postgres een seqscan en reproduceert de bug niet), en bewijst rood→groen dat de fix tot N buren teruggeeft.

4. **Given** de ACC-database
   **When** een index-herbouw/REINDEX/DROP nodig is
   **Then** gebeurt dat alleen na expliciete toestemming van Friso, met een read-only verificatie (huidige `indexdef` + teruggegeven-buren-meting) vooraf en ná.

## Tasks / Subtasks

- [x] **Task 1 — Kies en veranker de fix-strategie** (AC: 2)
  - [x] Gekozen: **optie (b)** — `SET LOCAL ivfflat.probes` in een transactie rond de query in `find_similar_references`. Rationale: pure code-wijziging, herstelt recall zónder ACC-schema-mutatie (index-herbouw/DROP niet nodig), robuust of de index nu bestaat of niet (seqscan negeert de setting). Waarde configureerbaar via `settings.REFERENCE_SEARCH_PROBES` (default 100 ≥ lists → volledige recall; Postgres clampt naar het werkelijke list-aantal).
  - [x] Migratiestand-risico vermeden: geen migratie nodig omdat de fix geen index-DDL vereist. Een latere opruiming (index herdefiniëren met `lists≈√N`) blijft optioneel/out-of-scope.
- [x] **Task 2 — Implementeer de fix** (AC: 1, 2)
  - [x] `find_similar_references` (`apps/ml-service/app/services/database.py`) draait de similarity-query nu in `async with conn.transaction():` met `SET LOCAL ivfflat.probes = {int(settings.REFERENCE_SEARCH_PROBES)}` ervóór. `find_similar_logos` ONGEMOEID (out of scope). Setting toegevoegd in `apps/ml-service/app/core/config.py`.
  - [~] Optie (a) migratie: bewust NIET gedaan (zie Task 1-rationale).
- [x] **Task 3 — Regressietest** (AC: 3)
  - [x] Unit (`tests/unit/test_ivfflat_probes_19_14.py`): bewijst dat `SET LOCAL ivfflat.probes` binnen een transactie én vóór de fetch draait, en dat de waarde uit config komt. **Rood→groen geverifieerd** in wegwerp-container: 2 passed met fix, 2 failed tegen de originele code.
  - [x] Integratie (skipif zonder `TEST_DATABASE_URL`): bouwt een gevulde temp-tabel + degenererende ivfflat-index (`lists=100`, 300 rijen) en toont probes=1 → onder-fetch, verhoogde probes → volledige N. Raakt NOOIT `reference_embeddings`. DB-gated (skipt in CI zonder pgvector-DB).
- [x] **Task 4 — ACC-verificatie (post-deploy, read-only)** (AC: 4)
  - [x] **Live geverifieerd 2026-07-12** (commit a4d5312 gedeployed op ACC): `find_similar_references(limit=10)` geeft nu **10 buren** terug (was ~1) met `REFERENCE_SEARCH_PROBES=100` actief; de top-10 komt exact overeen met de exacte seqscan uit de diagnose → de index onder-fetcht niet meer, exacte recall hersteld. Geen ACC-schrijf nodig (code-only fix).

### Review Findings

_Code-review 2026-07-11 (3 adversariële lagen: Blind Hunter, Edge Case Hunter, Acceptance Auditor). Severity door reviewer-triage._

- [x] [Review][Patch] Config-guard: `REFERENCE_SEARCH_PROBES` ≤ 0 / > 32768 crasht álle herkenning — `SET LOCAL ivfflat.probes = 0` aborteert de txn en propageert uit `find_similar_references` (medium) [apps/ml-service/app/core/config.py:63]
- [x] [Review][Patch] F-string interpolatie vervangen door bind-param `set_config('ivfflat.probes', $1, true)` — injectie-proof by construction i.p.v. alleen via `int()` (low) [apps/ml-service/app/services/database.py:627]
- [x] [Review][Patch] Misleidende comments corrigeren: asyncpg-pool reset sessiestate bij release (kale SET lekt feitelijk niet); "Postgres clamps the value" slaat op scanbereik, niet de GUC-waarde (low) [apps/ml-service/app/services/database.py:619]
- [x] [Review][Patch] Unit-test blinde vlek: assert dat de `fetch` zélf binnen de transactie valt (nu alleen `set_idx < fetch_idx`) — een refactor die fetch ná de txn zet blijft anders groen terwijl SET LOCAL al teruggedraaid is (medium) [apps/ml-service/tests/unit/test_ivfflat_probes_19_14.py:96]
- [x] [Review][Patch] Exacte-token-assertie i.p.v. substring (`"42" in sql` matcht ook 421/1042) (low) [apps/ml-service/tests/unit/test_ivfflat_probes_19_14.py:118]
- [x] [Review][Patch] Integratietest-hygiëne: risicovolle pre-`DROP TABLE` weg (kan een echte tabel droppen); niet-deterministische `len(under) < 10` verstevigen (kern-assertie = `len(fixed) == 10`) (low) [apps/ml-service/tests/unit/test_ivfflat_probes_19_14.py:139]
- [x] [Review][Patch] AC-dekking verduidelijken: AC1's index-top1-vs-exact-top1 agreement (7/8) is read-only gemeten tijdens de diagnose en wordt post-deploy herhaald (Task 4); framing = top-1 **correctheid** (callers gebruiken limit=1) i.p.v. alleen buur-aantal (medium) [story]
- [x] [Review][Patch] probes≥lists-invariant expliciteren in comment (probes=100 moet ≥ index-`lists`; groeit lists later, dan keert onder-recall terug) (low) [apps/ml-service/app/core/config.py:63]
- [x] [Review][Defer] Schema-drift: ivfflat-index staat niet in de Prisma-migraties (alleen ad-hoc op ACC + init.sql dev-schema) — bekend/gedocumenteerd; opvolg: index in migratie zetten of bewust op seqscan leunen — deferred, pre-existing [apps/api/prisma/migrations/0005_add_reference_embeddings]
- [x] [Review][Defer] `find_similar_logos` (logo_embeddings) deelt hetzelfde patroon zonder fix; zelfde bug keert terug als daar ooit een ivfflat bijkomt — deferred, out-of-scope [apps/ml-service/app/services/database.py:351]
- [x] [Review][Defer] Performance: probes=lists schakelt het sublineaire indexvoordeel uit (prima bij ~215 rijen, schaalt slecht) — deferred, geaccepteerde trade-off bij huidige schaal [apps/ml-service/app/services/database.py:627]
- [x] [Review][Defer] Geen lege/dim-embedding-guard op de queryvector (pre-existing, ook in `find_similar_logos`) — deferred, pre-existing [apps/ml-service/app/services/database.py:615]

## Dev Notes — Developer Context

### Huidige staat (bestanden UPDATE)

- `apps/ml-service/app/services/database.py:601` — `find_similar_references(embedding, limit, threshold)`: draait `ORDER BY re.embedding <=> $1::vector LIMIT $2` op een **pooled** `get_connection()` **zonder** expliciete transactie. Een kale `SET ivfflat.probes` zou op de hergebruikte connectie blijven plakken en andere queries beïnvloeden → gebruik `SET LOCAL` binnen `conn.transaction()`.
- `apps/ml-service/app/services/database.py:422` — `reindex_reference_embeddings()` (Story 8-N1): REINDEXt de bestaande ivfflat-index (naam dynamisch uit `pg_indexes`), maar behoudt `lists=100`. Nuttig als referentie voor hoe de index dynamisch wordt opgezocht; lost de misconfiguratie niet op.
- `apps/api/prisma/migrations/0005_add_reference_embeddings/migration.sql` — maakt alleen de btree op `reference_logo_id`; de ivfflat-index ontbreekt hier (ad-hoc op ACC aangemaakt).

### Waarom dit klopt (bewijs)

- ACC-`indexdef`: `USING ivfflat (embedding vector_cosine_ops) WITH (lists='100')`, tabel 215 rijen → ~2 rijen/cluster, `probes=1` → ~1 buur.
- Index-pad gaf 1 rij; `SET LOCAL enable_indexscan=off` (in een transactie — buiten een transactie is `SET LOCAL` een no-op in asyncpg) forceerde een seqscan die 12 buren gaf. Vuistregel ivfflat: `lists ≈ √rijen` (~15 voor 215), of `probes` verhogen richting `lists`; bij deze N is exact/seqscan sowieso goedkoop.

### Wat behouden moet blijven

- `find_similar_logos` / `logo_embeddings` (detector-pad) NIET wijzigen — geen ivfflat, geen under-fetch daar.
- De threshold-filter en de `[0,1]`-clamp van `find_similar_references` (regels ~634-645) ongemoeid laten; alleen het aantal teruggegeven kandidaten wordt hersteld.
- `reindex_reference_embeddings()`-gedrag (na table-clear) mag niet regressen als de index-definitie verandert.

### References

- [Bron: `_bmad-output/planning-artifacts/epics-vliegwiel.md`#Story 19.14: ivfflat-index onder-fetch corrigeren]
- [Bron: `apps/ml-service/app/services/database.py:601` — find_similar_references]
- [Bron: `apps/ml-service/app/services/database.py:422` — reindex_reference_embeddings (Story 8-N1)]
- [Bron: `apps/api/prisma/migrations/0005_add_reference_embeddings/migration.sql`]
- [Bron: geheugen `project_recyclable_dead_refs` — ACC-verificatie 2026-07-11]

### ACC-ops (read-only verificatie)

- ML-service PORT=8011; Postgres `10.0.0.6` db `logo_recognition`; app-container: `docker ps | grep qsookwow8koko0kwg00g0cwk`.
- Index-def opvragen: `SELECT indexdef FROM pg_indexes WHERE tablename='reference_embeddings' AND indexdef ILIKE '%ivfflat%'`.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context) — bmad-dev-story

### Debug Log References

- Wegwerp-container (`ghcr.io/xxtract-development/logo-recognition-ml:0aab6e2…`, geen ACC-DB): `python -m pytest tests/unit/test_ivfflat_probes_19_14.py`.
  - Mét fix (database.py+config.py gemount): **2 passed, 1 skipped**.
  - Tegen originele code (alleen config.py+test gemount): **2 failed, 1 skipped** (RED bevestigt dat de test de bug vangt).
- Integratietest skipt zonder `TEST_DATABASE_URL` (geen pgvector-DB in CI); ontworpen om via een temp-tabel te draaien, nooit tegen `reference_embeddings`.

### Completion Notes List

- **Fix (code-only):** `find_similar_references` zet nu `SET LOCAL ivfflat.probes` (uit `settings.REFERENCE_SEARCH_PROBES`, default 100) binnen een transactie vóór de similarity-query. Dit herstelt de recall op de bestaande ivfflat-index (`lists=100` op 215 rijen) zonder index-DDL of ACC-schrijf.
- **Scope-borging:** `find_similar_logos` / `logo_embeddings` (detector) ongemoeid — die tabel heeft geen ivfflat-index.
- **Regressie-check:** de runtime-image bundelt de test-suite niet; de bredere suite draaien vergde het mounten van de lokale `tests/`, wat collectiefouten gaf door **versie-mismatch** (tests verwijzen naar modules als `phash` / padaannames die niet in de 0aab6e2-image zitten) — niet door deze wijziging. De volledige regressie hoort in CI op de commit zelf; de nieuwe test draait daar mee.
- **Task 4 (post-deploy):** read-only ACC-meting ná deploy, met toestemming. Geen ACC-schrijf nodig.
- **Openstaand voor code-review:** bevestig de keuze "probes verhogen i.p.v. lists corrigeren" (index blijft functioneel nutteloos maar correct); overweeg optioneel opvolg-issue om de index met `lists≈√N` te herdefiniëren of te droppen.

### Code-review afhandeling (2026-07-11)

3 adversariële lagen → 8 patch, 4 defer, 1 dismissed. **Alle 8 patches toegepast en groen**:
- Config-guard `Field(ge=1)` op `REFERENCE_SEARCH_PROBES` — `probes=0` wordt nu bij startup geweigerd (ValidationError, bewezen in container) i.p.v. álle herkenning te crashen.
- F-string → `set_config('ivfflat.probes', $1, true)` bind-parameter (injectie-proof by construction).
- Misleidende comments gecorrigeerd (asyncpg-pool reset sessiestate → kale SET lekt niet; "clamp" slaat op scanbereik, niet de GUC-waarde).
- Unit-test: assert dat de `fetch` binnen dezelfde transactie valt (niet alleen `set_idx < fetch_idx`); exacte bind-arg-assertie i.p.v. substring.
- Integratietest: risicovolle pre-`DROP` weg; niet-deterministische assertie verstevigd (`len(fixed)==10` hard + `len(under) < len(fixed)`).
- **AC1-dekking (P7):** de index-top1-vs-exact-top1 agreement (7/8) is read-only gemeten tijdens de diagnose (probe_index.py) en wordt post-deploy herhaald (Task 4). Framing bevestigd: de callers gebruiken `limit=1`, dus dit is een top-1 **correctheids**-fix, niet enkel buur-aantal.
- 4 defers (index niet in migraties, `find_similar_logos`, performance-op-schaal, embedding-guard) → `deferred-work.md`.
- Rood→groen na patches herbevestigd: 2 passed, 1 skipped (DB-gated).

### File List

- `apps/ml-service/app/core/config.py` (M) — nieuwe setting `REFERENCE_SEARCH_PROBES` (default 100).
- `apps/ml-service/app/services/database.py` (M) — `find_similar_references`: query in transactie + `SET LOCAL ivfflat.probes`.
- `apps/ml-service/tests/unit/test_ivfflat_probes_19_14.py` (A) — unit- (mechanisme, rood→groen) + integratietest (DB-gated reproductie).

## Change Log

| Datum | Versie | Wijziging | Auteur |
|-------|--------|-----------|--------|
| 2026-07-11 | 0.1 | Story aangemaakt via bmad-create-story (uit ACC-diagnose + adversariële review) | Friso / AI |
| 2026-07-11 | 0.2 | Dev-story: fix (SET LOCAL ivfflat.probes in txn) + rood→groen unit-test + DB-gated integratietest. Task 1-3 done, Task 4 = post-deploy. Status → review. | AI |
| 2026-07-11 | 0.3 | Code-review (3 lagen): 8 patches toegepast (config-guard ge=1, set_config bind-param, fetch-in-txn-assertie, testhygiëne, comments), 4 defers → deferred-work.md. Tests groen na patches. Status → done. | AI |
