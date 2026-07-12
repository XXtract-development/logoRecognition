<!-- Story 19.13 — RECYCLABLE-referenties herstellen -->
<!-- Aangemaakt 2026-07-11 via bmad-create-story. Bron: ACC-diagnose + adversariële review + ACC-verificatie 2026-07-11 (geheugen project_recyclable_dead_refs). Uitvoervolgorde 3e van 3 (19.14 → 19.12 → 19.13). -->

# Story 19.13: RECYCLABLE-referenties herstellen

Status: ready-for-dev

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

- [ ] **Task 1 — Herstelscript (idempotent)** (AC: 1, 2)
  - [ ] Nieuw script (bv. `apps/ml-service/scripts/restore_recyclable_refs.py`) dat de 26 dode rijen selecteert (`t3777_code='RECYCLABLE_GENERAL_CLAIM' AND source='realref-live-poc' AND active=false`), per rij de crop uit MinIO laadt (`storage_path`), een embedding genereert (`model_manager.generate_embedding`), `reference_embeddings` invoegt en `active=true` zet. Idempotent: sla rijen met een bestaande embedding + `active=true` over.
  - [ ] Beslis en documenteer het near-dup/eindaantal-beleid (alle 26 vs dedup). Overweeg de near-dup-guard van `register_crop_as_reference` als je dat pad hergebruikt.
  - [ ] Dry-run-modus (geen writes) + expliciete apply-modus; `require.main`/`__main__`-guard.
- [ ] **Task 2 — Meetscript top-1 + precisie** (AC: 3, 4)
  - [ ] Benoem/commit een herbruikbaar meetscript + gold-set-crop-lijst voor RECYCLABLE-top-1 en valse-match-telling; meet vóór/na herstel. Leun op de betrouwbare index uit 19.14.
- [ ] **Task 3 — ACC-uitvoer (met toestemming)** (AC: 1)
  - [ ] Read-only verificatie vooraf (26 dode rijen bevestigen). Ná toestemming: script in apply-modus op ACC draaien; daarna classify-meting herhalen. Geen ACC-schrijf zonder go.

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

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Datum | Versie | Wijziging | Auteur |
|-------|--------|-----------|--------|
| 2026-07-11 | 0.1 | Story aangemaakt via bmad-create-story (uit ACC-diagnose + adversariële review + ACC-verificatie) | Friso / AI |
