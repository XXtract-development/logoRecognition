# Story 12.9: NutriScore labelcorrectie — fout-gelabelde referentie-crops deactiveren + A13 → E

Status: in-progress

<!-- Data-fix (GEEN feature) op de ACC reference_logos-records, volgend uit Friso's visuele labelcontrole (2026-07-12) van de 42 NUTRISCORE_A-E crops. Bron van waarheid: het menselijk verdict, want Nutri-Score is een vaste 5-kleurenschaal. -->

## Story

Als **datamanager van het keurmerk-vliegwiel**
wil ik **de door Friso visueel afgekeurde, fout-gelabelde NutriScore-referentie-crops deactiveren, en de één crop die onder de verkeerde letter staat herlabelen (A13 → E)**
zodat **de NutriScore-referentiebibliotheek de werkelijkheid weerspiegelt (A/B/E herkenning-klaar op genuine crops, C leeg, D op 1) en de herkenning niet op mislabels leunt** (datakwaliteit; FR-22/NFR-6-hygiëne).

### Afbakening (kritiek)
- **DIT IS EEN DATA-FIX, GEEN feature.** Alleen bestaande `reference_logos`-records op ACC muteren (deactiveren/herlabelen). Geen model-, gate-, harvest- of vliegwiel-code-wijziging.
- **Grondwaarheid = Friso's visuele verdict** (`nutriscore-labelverdict-friso-2026-07-12.md`), niet de marker-heuristiek (die zat er beide kanten op naast). De galerij-check (`nutriscore-labelcheck.html`) leverde het verdict.
- **Exacte scope (18 deactiveren + 1 herlabelen), by reference_logo-id — zie het verdict-bestand voor de volledige id-lijst:**
  - **Deactiveren (`active=false`), 18 ids:** A1/A2/A3, B1/B2/B6/B7/B8/B10, C1/C2/C4/C5/C6, D2, E1/E4/E10.
  - **Herlabelen A13** (id `cf18877a-5c8d-4331-b98d-49a464243347`): `t3777_code` NUTRISCORE_A → **NUTRISCORE_E** (het is een E-crop mis-gefiled als A). Zet `field_type`/`gs1_field` consistent (categorie blijft `NutritionalScore`). Embedding blijft ongewijzigd (zie Dev Notes: `reference_embeddings` is per `reference_logo_id` gekoppeld → geen re-embed nodig).
- **ONGEMOEID LATEN (expliciet):** de "marker-was-fout maar plaatje klopt"-crops **A4-A7, B3, B4, D1, E2** (Friso bevestigde dat de registratie klopt) en alle **synthetische zaden** A8/B5/C3/D3/E3. Raak deze NIET aan.
- **Gold-set:** een afgekeurde crop kan een `gold_set_records`-rij (ECHT) hebben (`t3777_code` + `crop_path`). Als dat zo is, moet die gold-record consistent gemaakt worden met de deactivatie/herlabel (anders blijft de gold-set een fout label bevestigen). Verifieer read-only per id; corrigeer alleen waar nodig, gedocumenteerd.
- **Raak GEEN andere keurmerkcodes/categorieën aan.** Alleen deze 19 specifieke ids.
- **Elke ACC-schrijf met EXPLICIETE toestemming Friso per geval.** `--apply`-vlag standaard UIT (dry-run/preview = read-only vertrekpunt). Container zelfstandig herstartbaar.
- **BUITEN SCOPE (aparte follow-ups, zie de investigation):** (1) de structurele oorzaak — het registratie-/labelpad koppelde de geoogste-marker ≠ de geregistreerde code, en `field_type`/`gs1_field` zijn projectbreed onbetrouwbaar; (2) de C/D-onvulbaarheid via het vliegwiel (letterloze `GENERAL_FOODS`-declaratie). Deze story corrigeert UITSLUITEND de bestaande fout-labels per Friso's verdict.

## Acceptatiecriteria

1. **Given** de 18 afgekeurde reference_logo-ids
   **When** de correctie met `--apply` draait (na toestemming)
   **Then** hebben alle 18 `active=false`; de bijbehorende `reference_embeddings` blijven bestaan (koppeling per id intact); geen andere reference_logos gewijzigd.

2. **Given** A13 (id `cf18877a-…`)
   **When** de correctie draait
   **Then** is `t3777_code` = `NUTRISCORE_E` (met consistente `field_type`/`gs1_field`), de embedding-rij ongewijzigd gekoppeld, en de crop `active=true` (blijft een geldige E-referentie).

3. **Given** de "ok"-crops (A4-A7, B3, B4, D1, E2) en de synthetische zaden (A8/B5/C3/D3/E3)
   **When** de correctie draait
   **Then** zijn die volledig ONGEMOEID (active + t3777_code + embedding onveranderd).

4. **Given** de correctie is toegepast
   **When** de read-only na-verificatie draait
   **Then** tonen de genuine echte-crop-tellingen per letter (excl. synthetisch zaad): **A=8, B=3, C=0, D=1, E=6** (na A13→E is E 7 echt-actief incl. de herlabel; genuine-telling zoals in het verdict). A/B/E ≥3 = herkenning-klaar; C leeg; D op 1. Meetbaar vastgelegd.

5. **Given** het correctiescript
   **When** het zonder `--apply` (dry-run) draait, of herhaald mét `--apply`
   **Then** muteert de dry-run niets (alleen preview) en is het script idempotent (tweede apply = zelfde eindstand, geen dubbele actie/fout).

6. **Given** de wijziging
   **When** de testsuite draait
   **Then** dekt een test de selectie-/actielogica: precies deze 18 ids → deactiveren, A13 → herlabel-naar-E, de ok/zaad-ids niet in de actieset; DRY_RUN muteert niets. Gates groen (de relevante suite; geen brede regressie want geen productie-code-pad geraakt).

## Tasks / Subtasks

- [ ] 1. **Read-only voor-verificatie (AC: 1, 2)** — bevestig op ACC dat de 18 ids nu `active=true` zijn en A13 nu `t3777_code=NUTRISCORE_A` is (startsituatie klopt met het verdict). Controleer per id of er een `gold_set_records`-rij bestaat (t3777_code + crop_path-match) → lijst de te-corrigeren gold-records.
- [ ] 2. **Idempotent correctiescript (AC: 1, 2, 5)** — nieuw script `apps/ml-service/scripts/correct_nutriscore_labels.py` (óf een gelijkwaardige plek), gemodelleerd op `restore_recyclable_refs.py`: `argparse` met `--apply` (default dry-run/preview, geen writes); per-ref korte transactie met `FOR UPDATE`-lock; de 19 ids hard in het script (uit het verdict-bestand). Actie: 18× `UPDATE reference_logos SET active=false WHERE id=$1`; 1× `UPDATE reference_logos SET t3777_code='NUTRISCORE_E', field_type=…, gs1_field=… WHERE id=cf18877a-…`. Idempotent: check de huidige waarde vóór write (al gecorrigeerd → skip). Dry-run print het plan.
- [ ] 3. **Gold-set-consistentie (AC: waar nodig)** — voor afgekeurde crops met een gold_set-rij: maak die consistent (deactiveren/markeren of `replaced_by_id` zetten volgens het bestaande gold-set-mechanisme). Documenteer wat en waarom; geen gold-set-mutatie zonder dat een id het echt vereist.
- [ ] 4. **Tests (AC: 6)** — test de selectie-/actielogica: de actieset bevat exact de 18 deactiveer-ids + A13-herlabel; de ok/zaad-ids NIET; DRY_RUN doet geen writes. Volg het ml-service-testpatroon (importlib-stub + gemockte DB), zoals `test_restore_recyclable_refs_19_13.py`.
- [ ] 5. **Read-only na-verificatie (AC: 4)** — na `--apply`: bevestig de 18 `active=false`, A13 = NUTRISCORE_E, en de per-letter genuine-tellingen A8/B3/C0/D1/E6. Leg vast in een kort meetrapport.
- [ ] 6. **Gates** — de relevante testsuite groen; geen productie-code-pad geraakt (git-hard beargumenteren dat model/gate/harvest/vliegwiel ongewijzigd zijn).
- [ ] 7. **ACC-toepassing (permission-gated)** — met EXPLICIETE toestemming Friso: eerst dry-run (read-only preview tonen), dan `--apply`. Container ongemoeid (script draait als wegwerp/exec, geen deploy nodig — het muteert alleen data).

## Dev Notes — Developer Context

### Patroon (bestaand — VOLGEN)
- `apps/ml-service/scripts/restore_recyclable_refs.py` (Story 19.13) — het canonieke idempotente data-fix-script: `argparse --apply` (default dry-run, geen writes), trage stappen buiten de transactie, korte per-ref transactie met `SELECT … FOR UPDATE` + `UPDATE reference_logos SET active=… WHERE id=$1`. Spiegel deze structuur; hier alleen `active=false` (deactiveren) + één `t3777_code`-herlabel i.p.v. reactiveren+embedden.
- Test-patroon: `apps/ml-service/tests/unit/test_restore_recyclable_refs_19_13.py` (importlib-stub + gemockte DB).

### Datamodel (bevestigd)
- `reference_embeddings.reference_logo_id` (`schema.prisma:308-310`) koppelt de embedding aan de reference_logo-id → **deactiveren en herlabelen laten de embedding intact** (geen re-embed nodig; A13's E-embedding = zijn bestaande beeld-embedding, correct).
- `gold_set_records` (`schema.prisma:714-741`): `t3777_code` + `crop_path` (+ `replaced_by_id`). Een afgekeurde crop kán hier als ECHT staan → dan is de gold-set óók fout en moet consistent gemaakt worden (Task 3).
- `reference_logos.field_type`/`gs1_field` zijn projectbreed onbetrouwbaar (default-bak) — voor A13 zet je ze consistent (`NutritionalScore`), maar de brede field_type-fix is een APARTE follow-up (investigation).

### De exacte ids
Staan volledig in `_bmad-output/implementation-artifacts/nutriscore-labelverdict-friso-2026-07-12.md` (tabel met #-nummer, registered, marker, source, verdict, id). Neem de 19 ids daaruit letterlijk over in het script; verifieer ze read-only vóór de write.

### Wat behouden moet blijven
- De ok-crops (A4-A7, B3, B4, D1, E2) en de synthetische zaden — ongemoeid.
- Alle andere keurmerkcodes/categorieën — ongemoeid.
- Geen productie-code-pad (model/gate/harvest/conditie C/resolveSeedPath) — ongewijzigd.

### References
- [Source: nutriscore-labelverdict-friso-2026-07-12.md] — het menselijk verdict + de 19 ids (grondwaarheid).
- [Source: investigations/nutriscore-letterloze-declaratie-en-labelintegriteit-investigation.md] — waarom NutriScore bijzonder is (letterloze declaratie) + de structurele datakwaliteit-oorzaak (aparte follow-ups).
- [Source: keurmerk-dekking-per-categorie-2026-07-12.md] — field_type onbetrouwbaar.
- [Source: apps/ml-service/scripts/restore_recyclable_refs.py] — het te volgen idempotente-script-patroon (Story 19.13).
- [Source: apps/api/prisma/schema.prisma#308,714] — ReferenceEmbedding + GoldSetRecord.
- Geheugen: `project_recyclable_dead_refs` (19.13-patroon), `project_keurmerk_dekking_strategie`.

### Project Structure Notes
- Script in `apps/ml-service/scripts/` (naast `restore_recyclable_refs.py`). Geen schema-migratie (alleen data-updates op bestaande kolommen). Geen deploy nodig — het script muteert data, niet code.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
- 2026-07-12: aangemaakt via bmad-create-story. Data-fix uit Friso's visuele labelcontrole van de 42 NUTRISCORE_A-E crops (labelcheck-galerij). Scope: 18 fout-gelabelde reference_logos deactiveren + A13 herlabelen NUTRISCORE_A→E; ok-crops + synthetische zaden ongemoeid. Idempotent script (patroon 19.13, dry-run default), gold-set-consistentie, read-only voor-/na-verificatie, ACC-write met toestemming. Structurele oorzaak + C/D-onvulbaarheid = aparte follow-ups (investigation).
