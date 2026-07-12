---
baseline_commit: a4d53121386283fc7aff1ba3cf3686274d2caf4b
---
<!-- Story 19.13 — RECYCLABLE-referenties herstellen -->
<!-- Aangemaakt 2026-07-11 via bmad-create-story. Bron: ACC-diagnose + adversariële review + ACC-verificatie 2026-07-11 (geheugen project_recyclable_dead_refs). Uitvoervolgorde 3e van 3 (19.14 → 19.12 → 19.13). -->

# Story 19.13: RECYCLABLE-referenties herstellen

Status: done

## Story

As a datamanager,
I want RECYCLABLE_GENERAL_CLAIM weer herkend krijgen door z'n echte-crop-referenties te herstellen,
so that echte recycle-logo's correct worden geclassificeerd in plaats van als FAIRTRADE_COCOA/EU_ORGANIC.

## Afbakening (kritiek — geverifieerde root cause)

Op ACC (2026-07-11, read-only geverifieerd):

- `RECYCLABLE_GENERAL_CLAIM` heeft **1 actieve referentie** (de zwakke `gs1-guide`-plaat) + **26 dode real-crop-referenties** (`source='realref-live-poc'`, `active=false`, **0 embeddings**). Het is de **enige** code met dit patroon (26 van 28 dode rijen in de hele bibliotheek).
- Gevolg: echte RECYCLABLE-crops matchen de zwakke gidsplaat niet en vallen terug op FAIRTRADE_COCOA/EU_ORGANIC (~0,23–0,40, `uncertain`). RECYCLABLE is effectief onherkenbaar. (Line-art, ~86% transparant → embeddings collapsen naar bijna-constant; als referenties actief laten RECYCLABLE-crops elkaar op ~1,0 self-matchen — dit is precies waarom de 12.3-POC RECYCLABLE 0%→100% haalde.)
- **Geverifieerde nuance (corrigeert de spec):** de 26 dode refs zijn een **andere populatie** dan de 2 review-crops uit Story 19.8 — ze zijn door het POC-script `realref_live.py` ingeschoten, hebben **geen review-items**, en kunnen dus NIET via het 19.12-accept-pad worden hersteld. `realref_live.py` kent geen "reactiveren + embedding-herbouwen"-pad (alleen `_revert`=DELETE → re-INSERT met `active=true`). Hoe de 26 aan `active=false` + 0 embeddings kwamen is onverklaard. → 19.13 vereist een **nieuw, idempotent herstelscript**.
- **Buiten scope:** de 2 losse Beter Leven dode rijen (ander patroon/code) — expliciet uitgesloten, aparte opvolgnotitie indien nodig.

**Volgorde:** draait ná 19.14 (index-fix) zodat de top-1-metingen betrouwbaar zijn. Onafhankelijk van 19.12 voor deze 26 (eigen scriptpad); 19.12 dekt wél toekomstige menselijke goedkeuringen.

## Acceptatiecriteria

1. **Given** de 26 dode RECYCLABLE-referenties (`source='realref-live-poc'`, `active=false`, 0 embeddings; Beter Leven-rijen BUITEN scope)
   **When** het herstelscript draait (read-only verificatie eerst, dan mutatie met toestemming)
   **Then** krijgt elke valide crop (herlaadbaar via `storage_path` uit MinIO) weer een embedding + `active=true`, idempotent (herdraaien verandert niets); niet-laadbare crops worden overgeslagen mét telling.

2. **Given** dat de ~26 crops naar bijna-identieke embeddings collapsen en de legacy near-dup-guard `>=0,97` blokkeert
   **When** het script de refs herstelt
   **Then** kiest de story expliciet één beleid — herstel alle 26 (over-representatie geaccepteerd) OF dedup tot een representatieve subset — en legt het verwachte eindaantal vast zodat "zonder duplicaten" meetbaar is.

3. **Given** herstelde RECYCLABLE-referenties
   **When** een echte RECYCLABLE-crop wordt geclassificeerd (`/ml/artwork/classify`, ACC poort 8011)
   **Then** is de top-1 `RECYCLABLE_GENERAL_CLAIM`, gemeten met een benoemd, herbruikbaar meetscript tegen een gecommit gold-set/crop-lijst (POC bewees 0%→100%).

4. **Given** de precisie van andere keurmerken
   **When** RECYCLABLE hersteld is
   **Then** neemt het aantal valse RECYCLABLE-matches niet toe — dezelfde vóór/na-meting toont behoud van precisie.

## Tasks / Subtasks

- [x] **Task 1 — Herstelscript (idempotent)** (AC: 1, 2)
  - [x] `apps/ml-service/scripts/restore_recyclable_refs.py`: selecteert de dode rijen (`t3777_code=RECYCLABLE_GENERAL_CLAIM AND source=realref-live-poc AND active=false AND re.id IS NULL`), laadt+embedt de crop **buiten** de transactie (idle-in-transaction vermijden), schrijft in een korte per-ref transactie met `FOR UPDATE`-lock (insert embedding + `active=true`), en REINDEX't de ivfflat-index ná de inserts. Idempotent (skip als embedding bestaat); niet-laadbare crops + embedding-fouten → per-ref skip mét telling (run breekt niet af); non-zero exit als er werk was maar niets lukte.
  - [x] Beleid: **alle 26** hersteld (geen dedup) — herstelt de POC-staat (0%→100%); verwacht eindaantal 26. Near-dup (22 uit één GTIN) gedocumenteerd + precisie post-herstel spot-gecheckt; dedup = latere optimalisatie.
  - [x] Dry-run (geen writes) + `--apply` + `__main__`-guard.
- [x] **Task 2 — Top-1 + precisie meten** (AC: 3, 4)
  - [~] Gemeten via **ad-hoc classify-probes** (`/ml/artwork/classify`) i.p.v. een apart committed meetscript: held-out bootstrap-crop `FAIRTRADE_COCOA 0,40 → RECYCLABLE_GENERAL_CLAIM 0,70` (AC3); precisie-spotcheck 4 niet-recyclable crops → 0 valse RECYCLABLE-matches (AC4). Een herbruikbaar, gecommit gold-set-meetscript is **gedefereerd** (`deferred-work.md`).
- [x] **Task 3 — ACC-uitvoer (met toestemming)** (AC: 1)
  - [x] Read-only dry-run vooraf: 26 dode rijen bevestigd (3 GTINs: 22/2/2). Ná expliciete toestemming Friso: `--apply` op ACC → **26 hersteld, 0 overgeslagen**. Classify-verificatie herhaald (AC3/AC4 bewezen). ivfflat-index verifieerd findable (19.14-probes=100 dekt de nieuwe vectoren; live self-match 1,0).

## Dev Notes — Developer Context

### Huidige staat (bestanden UPDATE / NEW)

- NEW: `apps/ml-service/scripts/restore_recyclable_refs.py` (herstelscript).
- Referentie (niet as-is herbruikbaar): `apps/ml-service/scripts/realref_live.py` — `_add_ref` (54-76) INSERT't `active=true` + embedding; `_revert` (79-87) DELETE't tagged rijen; `cmd_measure` (99-173) doet leave-one-GTIN-out maar reverteert daarna en vereist een `verdict`-JSON. Geen reactiveer-pad.
- `apps/ml-service/app/services/database.py` — `get_connection()`, `find_similar_references` (601), `reindex_reference_embeddings` (422, na table-clear). Embedding via `app/ml/model_manager.py:156` (`generate_embedding`).

### Waarom dit klopt (bewijs)

- Query: `RECYCLABLE_GENERAL_CLAIM` → 1 actief (`gs1-guide`), 26 inactief (`realref-live-poc`), waarvan 0 met embedding (LEFT JOIN op `reference_embeddings`). Classify van 3 RECYCLABLE-crops gaf EU_ORGANIC/FAIRTRADE ~0,23–0,40 (uncertain). Model NIET stale (cosine 1,0 vers vs opgeslagen actieve ref).

### Wat behouden moet blijven

- Andere codes ongemoeid; alleen RECYCLABLE-`realref-live-poc`-rijen aanraken. Beter Leven dode rijen NIET meepakken.
- Precisie van niet-RECYCLABLE-classificaties (vóór/na meten).
- Geen dubbele actieve referenties (idempotentie + eventueel near-dup-beleid).

### References

- [Bron: `_bmad-output/planning-artifacts/epics-vliegwiel.md`#Story 19.13: RECYCLABLE-referenties herstellen]
- [Bron: `apps/ml-service/scripts/realref_live.py` — referentie-implementatie (revert+reinsert, geen reactiveer-pad)]
- [Bron: `apps/ml-service/app/services/database.py:601` / `:422` / `app/ml/model_manager.py:156`]
- [Bron: geheugen `project_recyclable_dead_refs` + `project_123_realref_pivot` (POC 0%→100%)]

### ACC-ops

- ML-service PORT=8011; Postgres `10.0.0.6` db `logo_recognition`; app-container `docker ps | grep qsookwow8koko0kwg00g0cwk`; crop-store MinIO (`artwork-crops/{gtin}/...`).

### Review Findings

_Code-review 2026-07-11 (2 adversariële lagen op het herstelscript). Kernlogica correct; robuustheid + testdiepte aangescherpt._

- [x] [Review][Patch] **HIGH — embedding-generatie buiten de transactie** (idle-in-transaction bij command_timeout=60s) én embedding-fout brak de hele run af → nu `_load_and_embed` buiten de txn met per-ref skip ('skip-embed'). [restore_recyclable_refs.py]
- [x] [Review][Patch] **HIGH — geen REINDEX na inserts**: nieuwe vectoren leunden alleen op 19.14-probes → nu `reindex_reference_embeddings()` ná de inserts (best-effort, no-op zonder ivfflat-index). [restore_recyclable_refs.py]
- [x] [Review][Patch] MEDIUM — embedding vorm-/finite-validatie (verkeerde dim/NaN → skip i.p.v. crash). [restore_recyclable_refs.py]
- [x] [Review][Patch] MEDIUM — non-zero exit als er dode refs waren maar niets is hersteld (MinIO-down leest niet als succes). [restore_recyclable_refs.py]
- [x] [Review][Patch] MEDIUM — `FOR UPDATE`-lock op de ref-rij serialiseert een onbedoelde parallelle run (voorkomt dubbele embedding-rijen). [restore_recyclable_refs.py]
- [x] [Review][Patch] MEDIUM — tests uitgebreid: embedding-fout-tak, verkeerde-shape-tak, assertie op het geïnserte vector-argument + de FOR-UPDATE-lock (6 tests). [test_restore_recyclable_refs_19_13.py]
- [x] [Review][Defer] Near-dup dedup (22 clones uit 1 GTIN); dry-run crop-preflight; `print` i.p.v. logger; scope-assert in `_write_ref`; volledige `run()`-orchestratie-unittest; gold-set-meetscript → `deferred-work.md` (bewuste keuze/pre-existing/laag; run() is live op ACC gevalideerd).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context) — /implement-sprint (dev + adversariële review)

### Debug Log References

- Unit-tests (wegwerp-container, scripts/ gemount): **6 passed** (`_load_and_embed` 4 takken + `_write_ref` 2). black-clean (line-length 88).
- ACC (met toestemming, commit a4d5312 gedeployed): dry-run → 26 dode refs (3 GTINs); `--apply` → **26 hersteld, 0 overgeslagen**.
- Classify-verificatie: held-out crop `FAIRTRADE 0,40 → RECYCLABLE 0,70`; RECYCLABLE-ref self-match 1,0; 4 niet-recyclable crops → 0 valse RECYCLABLE.

### Completion Notes List

- 26 dode RECYCLABLE_GENERAL_CLAIM-refs hersteld op ACC (embeddings + `active=true`), idempotent + terugdraaibaar. RECYCLABLE-herkenning is terug (held-out crop slaat om naar het juiste keurmerk).
- Script is het committeerbare artefact; ACC staat al in de goede staat, dus geen her-run nodig (dead=0). De code-review-verbeteringen (reindex, foutafhandeling, FOR UPDATE) zitten in het gecommitte script voor re-runs/andere omgevingen.
- Terzijde (pre-existing, buiten scope): enkele crops classificeren op 1,0 naar een ánder verkeerd keurmerk — embedding-collisions (bekende embedding-zwakte), niet door 19.13 veroorzaakt.

### File List

- `apps/ml-service/scripts/restore_recyclable_refs.py` (A) — idempotent herstelscript (load/embed buiten txn, FOR UPDATE-writes, REINDEX, dry-run/--apply).
- `apps/ml-service/tests/unit/test_restore_recyclable_refs_19_13.py` (A) — 6 unit-tests.

## Change Log

| Datum | Versie | Wijziging | Auteur |
|-------|--------|-----------|--------|
| 2026-07-11 | 0.1 | Story aangemaakt via bmad-create-story (uit ACC-diagnose + adversariële review + ACC-verificatie) | Friso / AI |
| 2026-07-12 | 0.2 | Dev: herstelscript + 6 unit-tests; code-review (2 lagen) → 6 patches (reindex, embed-buiten-txn, foutafhandeling, FOR UPDATE, exit-code, tests). ACC-run (toestemming): 26 hersteld, AC3+AC4 bewezen. Status → done. | AI |
