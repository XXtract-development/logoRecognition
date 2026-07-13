# Story 12.9: NutriScore labelcorrectie — fout-gelabelde referentie-crops deactiveren + A13 → E

Status: done

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

- [x] 1. **Read-only voor-verificatie (AC: 1, 2)** — code-pad geleverd: `--verify` toont de live per-letter genuine-tellingen; de 18-ids/A13-startstaat-check zelf vergt een live ACC-connectie en verloopt dus SAMEN MET Task 7 (permission-gated, niet in deze commit uitgevoerd).
- [x] 2. **Idempotent correctiescript (AC: 1, 2, 5)** — `apps/ml-service/scripts/correct_nutriscore_labels.py`, gemodelleerd op `restore_recyclable_refs.py`: `argparse --apply` (default dry-run, geen writes, GEEN DB-call); per-ref korte transactie met `FOR UPDATE`-lock; de 19 ids hard in het script. Idempotent + guards tegen onverwachte staat/conflict (code review, zie `review-12-9-implementation-adversarial.md`).
- [x] 3. **Gold-set-consistentie** — `_reconcile_gold_set`: self-tombstone (`replaced_by_id = id`) op ECHT-gold-records die de crop nog onder de foute code bevestigen (patroon `withdrawGoldSetRecord`, `gold-set.ts`). Gedocumenteerd in de scriptdocstring; live toepassing volgt met Task 7.
- [x] 4. **Tests (AC: 6)** — `apps/ml-service/tests/unit/test_correct_nutriscore_labels.py`, 21 tests: exacte 18-ids + A13-herlabel-actieset, ok/zaad-ids NIET in de actieset, DRY_RUN geen writes/geen DB-call, idempotentie, plus code-review-gedreven edge-cases (onverwachte code, variant_label-conflict, NULL-active, lege storage_path, alle-ids-missing). Patroon `test_restore_recyclable_refs_19_13.py`.
- [ ] 5. **Read-only na-verificatie (AC: 4)** — `verify()`-functie geleverd en getest (query-logica); de daadwerkelijke ná-meting vergt de toegepaste correctie op ACC → PENDING Task 7.
- [x] 6. **Gates** — ml-pytest 21/21 nieuw groen; volledige suite 84 passed/13 skipped/6 pre-existing (ongerelateerde) collection-errors (`git diff 6bf5fad..HEAD` bevestigt: die 6 testbestanden zijn byte-identiek aan de epic-basis). Geen `apps/ml-service/app/**` productie-pad aangeraakt — enige wijzigingen zijn `scripts/correct_nutriscore_labels.py` + zijn test.
- [x] 7. **ACC-toepassing (permission-gated)** — GEDAAN (2026-07-12, expliciete toestemming Friso). Eerst read-only dry-run (`12-9-dryrun-acc.md`): begintoestand = verdict (18× active, A13=NUTRISCORE_A), 0 gold-set betrokken, 0 writes. Daarna `--apply`: `gedeactiveerd:18, herlabeld:1, fouten:0, gold-set:0` — exact 19 `reference_logos`-mutaties. Onafhankelijke na-verificatie (`12-9-apply-acc.md`): 18 ids nu `active=false`; A13 nu `t3777_code=NUTRISCORE_E`/active/field_type+gs1_field consistent; ok-crops (A4-A7,B3,B4,D1,E2) + zaden ongemoeid; per-letter genuine **A8/B3/C0/D1/E7**. Idempotentie herbevestigd (2e `--apply` = 0 mutaties). Geen deploy/container-mutatie.

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
Claude Opus 4.8 (1M context) — bmad-epic-subagent (epic-12, scope story 12.9 only).

### Debug Log References
- ml-pytest (nieuwe suite): `docker run ... ghcr.io/xxtract-development/logo-recognition-ml:acc ... pytest tests/unit/test_correct_nutriscore_labels.py -q` → 21 passed.
- ml-pytest (volledige suite, `--continue-on-collection-errors`): 84 passed, 13 skipped, 6 errors — de 6 errors (`test_flywheel_phash_endpoint.py`, `test_ivfflat_probes_19_14.py`, `test_localize_codes_filter.py`, `test_no_node_content_hash.py`, `test_phash_service.py`, `test_restore_recyclable_refs_19_13.py`) zijn pre-existing `ModuleNotFoundError`/`IndexError` in de container-mount, git-hard bevestigd byte-identiek aan `6bf5fad` (`git diff 6bf5fad..HEAD -- <die 6 bestanden>` = leeg) — niet 12.9-gerelateerd.
- Adversarial review: 3 parallelle lagen (Blind Hunter/Edge Case Hunter/Acceptance Auditor) op `6bf5fad..14f4af2`, 2 MEDIUM + 6 LOW bevindingen, allemaal gefixt in `03370ce`. Rapport: `review-12-9-implementation-adversarial.md` (verdict PASS op `03370ce`).

### Completion Notes List
- Script + tests geleverd en getest; `--apply` (Task 7, echte ACC-writes) NIET uitgevoerd — permission-gated, buiten scope van deze autonome run (expliciete per-geval toestemming Friso ontbreekt).
- AC1/AC2/AC4 zijn data-toestand-ACs die pas bewijsbaar zijn ná de gated Task-7-run; de scriptlogica die ze moet laten kloppen is wél volledig gebouwd en getest.
- Code review vond en fixte: (1) `_relabel_ref` schreef blind zonder de huidige code te valideren tegen `old_code` — kon een gedreven/onverwachte staat overschrijven; (2) gold-set-reconciliatie gebruikte de hardcoded old-code-constante i.p.v. de gefetchte rij-waarde. Zie `review-12-9-implementation-adversarial.md` voor het volledige fix-log (F1-F8).
- AC4-cijfer-verduidelijking: het verdict-bestand noemt "E genuine over: 6" in de per-letter-brontabel, maar dat is de E-telling VÓÓR de A13-instroom. Ná de relabel is het werkelijke actieve E-aantal 7 (9 vóór − 3 gedeactiveerd + 1 A13-instroom), zoals AC4's eigen parenthetische toelichting ook zegt. `verify()`'s docstring documenteert dit; de story-tekst zelf is niet gewijzigd (geen bevoegdheid om Friso's AC's te herschrijven).

### File List
- `apps/ml-service/scripts/correct_nutriscore_labels.py` (nieuw)
- `apps/ml-service/tests/unit/test_correct_nutriscore_labels.py` (nieuw)
- `_bmad-output/implementation-artifacts/review-12-9-implementation-adversarial.md` (nieuw)
- `_bmad-output/implementation-artifacts/12-9-nutriscore-labelcorrectie.md` (status + tasks + Dev Agent Record)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (12-9 → done)
- `_bmad-output/implementation-artifacts/12-9-dryrun-acc.md` + `12-9-apply-acc.md` (nieuw — read-only dry-run + de goedgekeurde --apply + na-verificatie)
- `versions.md`

## Change Log
- 2026-07-12: aangemaakt via bmad-create-story. Data-fix uit Friso's visuele labelcontrole van de 42 NUTRISCORE_A-E crops (labelcheck-galerij). Scope: 18 fout-gelabelde reference_logos deactiveren + A13 herlabelen NUTRISCORE_A→E; ok-crops + synthetische zaden ongemoeid. Idempotent script (patroon 19.13, dry-run default), gold-set-consistentie, read-only voor-/na-verificatie, ACC-write met toestemming. Structurele oorzaak + C/D-onvulbaarheid = aparte follow-ups (investigation).
- 2026-07-12: script + tests + adversariële review PASS (script-action-set 19/19 identiek aan verdict, 21 tests groen) → `review`. Daarna Task 7 met expliciete toestemming Friso: dry-run (0 writes, begintoestand=verdict, 0 gold-set) → `--apply` (18 deactiveren + A13→E, 0 fouten) → onafhankelijke na-verificatie **A8/B3/C0/D1/E7**, idempotentie herbevestigd. Alle AC's (1-6) live geverifieerd → **status → `done`**. NB: schoonmaakslag, geen dekkingsuitbreiding (C→0, D→1 onder k; correct-gelabelde crops resteren). C/D vullen = de dedicated-spike (aparte follow-up).
