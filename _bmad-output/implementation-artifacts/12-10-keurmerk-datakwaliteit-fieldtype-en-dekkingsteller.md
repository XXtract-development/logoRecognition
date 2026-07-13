# Story 12.10: Keurmerk-datakwaliteit — `field_type`/`gs1_field` herstellen + automatische per-categorie-dekkingsteller

Status: done

<!-- Volgt uit de dekkingsmeting (2026-07-12) + de NutriScore-investigation: field_type is projectbreed onbetrouwbaar → geen automatische per-categorie-rapportage mogelijk. Deze story maakt de tags betrouwbaar (backfill + registratie-fix) en de dekking automatisch zichtbaar (teller). NB mogelijk te groot voor één story → dev-analyse mag splitsen. -->

## Story

Als **datamanager van het keurmerk-vliegwiel**
wil ik **dat elke referentie-crop de juiste GS1-categorie (`field_type`/`gs1_field`) draagt — bestaande records gecorrigeerd én nieuwe records meteen goed — en dat de dekking per categorie automatisch opvraagbaar is**
zodat **ik de voortgang per keurmerk-categorie (bio/diet/nutriscore/usage/GHS) betrouwbaar en zonder handwerk kan volgen, en het systeem zichzelf per categorie kan verantwoorden** (datakwaliteit; FR-22; voorwaarde voor coverage-monitoring epic-10/15).

### Afbakening (kritiek)
- **Probleem (bevestigd, read-only ACC 2026-07-12):** `reference_logos.field_type`/`gs1_field` zijn niet onderhouden — **236/241 actieve refs in de default-bak `PackagingMarkedLabelAccreditationCode`**, ook VEGAN/HALAL/PREGNANCY_WARNING en de echte Nutri-Score-crops (zie `keurmerk-dekking-per-categorie-2026-07-12.md`, `nutriscore-…-investigation.md`). Daardoor: geen automatische per-categorie-rapportage (nu hand-mapping), en verhoogd mislabel-risico.
- **Autoritatieve bron van de categorie per code:** onder wélk GS1-declaratieveld de code voorkomt (`t3777-declarations.ts` `MARK_FIELDS`: `packagingMarkedLabelAccreditationCode`→`PackagingMarkedLabelAccreditationCode`, `dietTypeCode`→`DietTypeCode`, `nutritionalScore`→`NutritionalScore`, `localPackagingMarkedLabelAccreditationCodeReference`→`AdditionalPackagingMarkingsCode`, + de gescopete consumerUsage/enumerationValue). De codelijst→veld-tabel staat in `tests/validation/codelist-veld-mapping.json` (5 herkenbare velden + counts) en migratie `0010_field_type_gs1_codelist_names`.
- **AMBIGUE codes (kritiek — niet gokken):** een logo kan in meerdere codelijsten/declaratievelden voorkomen (bv. glutenvrij `CROSSED_GRAIN` in T3777 vs `FREE_FROM_GLUTEN` als DietType-claim; halal `HALAL_CORRECT`). Voor zulke codes: **rapporteren i.p.v. raden**, en een gedocumenteerde **primaire-codelijst-regel** hanteren (of de bestaande seed-herkomst/`source` als tiebreak). Ambigue gevallen apart lijsten voor een expliciete beslissing.
- **Scope-grens:** deze story maakt de **tags** betrouwbaar en de **dekking automatisch zichtbaar**. Of de crops binnen een categorie ook visueel het juiste keurmerk tonen (de mens-in-de-loop-audit à la NutriScore-galerij, 12.9) is een **APARTE follow-up per categorie** — NIET hier.
- **Elke ACC-schrijf met EXPLICIETE toestemming per geval** (backfill = `--apply`-vlag, dry-run default). Geen model/gate/harvest/conditie-C/resolveSeedPath-wijziging. Geen schema-migratie verwacht (kolommen bestaan al sinds 0010/0011).
- **Mogelijk te groot voor één story:** als de dev-analyse dat aangeeft, splitsen in (A) backfill + registratie-fix en (B) de dekkingsteller.

## Acceptatiecriteria

1. **Given** de bestaande `reference_logos` op ACC met verkeerde/default `field_type`
   **When** het backfill-script met `--apply` draait (na toestemming)
   **Then** draagt elke ref de `field_type`/`gs1_field` uit de autoritatieve code→veld-mapping; de eerder read-only vastgestelde per-categorie-verdeling (o.a. NutriScore-refs → `NutritionalScore`, VEGAN/HALAL → `DietTypeCode`, PREGNANCY_WARNING → consumerUsage) klopt nu op DB-niveau. Ambigue codes zijn NIET blind gezet maar gerapporteerd.

2. **Given** een code die in >1 codelijst/declaratieveld voorkomt (ambigu)
   **When** de backfill draait
   **Then** past het script de gedocumenteerde primaire-codelijst-regel toe óf lijst de code apart als "handmatige beslissing nodig" (geen stille gok); de keuze is reproduceerbaar en gedocumenteerd.

3. **Given** het registratie-pad (curatie-upload `reference-logos.ts:154` + promotie `promotion.ts:173`)
   **When** een nieuwe reference_logo wordt aangemaakt
   **Then** krijgt die meteen de juiste `field_type`/`gs1_field` uit dezelfde mapping (niet de default `PackagingMarkedLabelAccreditationCode`), zodat de data na de backfill niet opnieuw drift.

4. **Given** de gecorrigeerde tags
   **When** de per-categorie-dekkingsteller wordt opgevraagd
   **Then** geeft die per `field_type`: vakken gevuld (≥1 actieve ref), codes met ≥3 echte refs (herkenning-klaar), gids-only-wachtend, en (uit de MinIO-index) het gedeclareerde universe — automatisch, zonder hand-mapping. Read-only.

5. **Given** het backfill-script + registratie-fix + teller
   **When** de testsuite draait
   **Then** dekken tests: (a) de code→field_type-afleiding (incl. een ambigu geval → rapport, niet gezet); (b) de dry-run muteert niets + idempotentie; (c) het registratie-pad zet de juiste field_type bij create; (d) de teller aggregeert correct per field_type. `tsc --noEmit` 0 (api-kant geraakt), api-vitest + relevante ml-pytest groen.

6. **Given** de wijziging is toegepast
   **When** de read-only na-verificatie draait
   **Then** is de per-categorie-verdeling op ACC consistent met de teller-output en met de eerdere hand-mapping (Packaging/NutritionalScore/DietType/EU-usage/GHS), en zijn de ambigue codes expliciet benoemd. Meetbaar vastgelegd.

## Tasks / Subtasks

- [x] 1. **Autoritatieve code→field_type-mapping vaststellen (AC: 1, 2)** — `apps/api/src/services/field-type-mapping.ts`. De 4 specifieke codelijsten (DietType/GHS/ConsumerUsage/NutritionalScore) gespiegeld uit `apps/web/src/data/spoor-codes.ts` (counts sluiten 1:1 aan op `codelist-veld-mapping.json`: 34/10/20/5). Ambigue overlap met het T3777-default-universum (`keurmerk-codes.ts`, 884 codes) vastgesteld via een eenmalige intersectie-check: `FODMAP`, `NUTRISCORE_A..E` (6 codes). Primaire regel: specifieke codelijst wint van de generieke default, gerapporteerd (`resolution: 'default-overlap-resolved'`). Twee-specifieke-lijsten-botsing (onoplosbaar) NIET gezet (`resolution: 'unresolved'`) — vandaag geen echt geval, wel structureel ondersteund + unit-getest via geïnjecteerde `classifyCode`.
- [x] 2. **Backfill-script (data-fix) (AC: 1, 2, 5)** — `apps/api/src/scripts/backfill-reference-logo-field-type.ts`. Dry-run default (leest wél `reference_logos` om het plan te tonen — gemotiveerde afwijking van het 12.9-patroon, zie bestandsheader; schrijft NOOIT). `--apply` per-rij transactie (`SELECT ... FOR UPDATE` + conditionele UPDATE, concurrency-guard). Idempotent (unit-getest: plan → simuleer apply → herplan = 0 updates).
- [x] 3. **Registratie-pad fixen (AC: 3)** — `reference-logos.ts:154`(curatie-upload) en `promotion.ts:173`(promotie) roepen `resolveFieldType` aan en zetten `fieldType`/`gs1Field` expliciet in de create-data (schema-default blijft het vangnet bij een onopgeloste ambiguïteit).
- [x] 4. **Per-categorie-dekkingsteller (AC: 4)** — `apps/api/src/services/flywheel/overview/coverage.ts`, gewired als `coverage`-paneel in `overview/index.ts` → `GET /api/v1/flywheel/overview`. Ontwerpbeslissing: overview-sub-service (precedent `cohort-trend.ts`, epic-15), NIET een los endpoint of script — consistent met het bestaande "elke epic een paneel"-patroon, geen nieuw auth-oppervlak. Aggregeert `reference_logos` (2x `groupBy`, totaal vs `REAL_CROP_SOURCES`) + het gedeclareerde universe uit de MinIO-index (`keurmerk-etiket-index.json`, hergebruikt `downloadTrainingObject`/`INDEX_OBJECT_KEY`).
- [x] 5. **Tests (AC: 5)** — `field-type-mapping.test.ts`, `backfill-reference-logo-field-type.test.ts`, `flywheel-coverage-overview.test.ts` + uitbreidingen in `reference-logos.routes.test.ts`/`flywheel-promotion.test.ts`/`flywheel-overview-compose.test.ts`. ml-service niet geraakt.
- [x] 6. **Gates** — `tsc --noEmit` 0; volledige api-vitest 907 passed/2 skipped/0 failed; eslint 0 errors/0 warnings. ml-pytest n.v.t. (geen ml-service-bestand in de diff).
- [x] 7. **ACC-toepassing + verificatie (AC: 6, permission-gated)** — GEDAAN (2026-07-13, expliciete toestemming Friso). Deploy `b352cd3` (app-container healthy → registratie-fix + dekkingsteller + backfill-script live). Backfill via de GEDEPLOYDE, geteste code (`docker exec node dist/scripts/backfill-...js`): dry-run bevestigd (184 te updaten, 0 writes) → `--apply` **184 rijen geschreven, 0 overgeslagen**. Na-verificatie: idempotentie herbevestigd (2e dry-run = 0 te updaten, 223 al correct); per-field_type-verdeling nu correct: DietTypeCode 16 / EU_consumerUsage 4 / NutritionalScore 24 / PackagingMarked 179 / GHS 0 (223 totaal). 0 ambigue handmatige beslissingen (24 NUTRISCORE via tiebreak → NutritionalScore). Zie `12-10-backfill-apply-acc.md`.
- [x] 8. **Afbakening-nota** — binnen-categorie visuele label-integriteit (à la NutriScore 12.9) blijft een aparte follow-up per categorie; deze story raakt uitsluitend `field_type`/`gs1_field` + de read-only teller.

## Dev Notes — Developer Context

### Bronnen (bestaand — GEBRUIKEN, niet dupliceren)
- `apps/api/src/services/t3777-declarations.ts` — `MARK_FIELDS` (declaratie-tag → `fieldType`), `DeclaredMark {code, fieldType}`, en de gescopete consumerUsage/enumerationValue-parse. Dit is de canonieke code→`fieldType`-logica; leid de backfill/registratie-mapping hiervan af.
- `tests/validation/codelist-veld-mapping.json` — 5 herkenbare velden (PackagingMarkedLabelAccreditationCode 894 / NutritionalScore 5 / DietTypeCode 34 / EU_consumerUsageLabelCodeList 20 / GHSSymbolDescriptionCode) met counts + de ambiguïteit-caveat.
- `apps/api/prisma/migrations/0010_field_type_gs1_codelist_names` (+ 0011) — `field_type` = GS1-codelijstnaam; `gs1_field` = het camelCase-veld. Kolommen bestaan al.
- Doc `_bmad-output/implementation-artifacts/12-gs1-veld-codelijst-mapping.md` — de mapping-analyse + welke velden visueel herkenbaar zijn + de DietType-overlap-nuance.

### Bestanden UPDATE (lees vóór wijzigen)
- `apps/api/src/api/v1/reference-logos.ts` (~154, `referenceLogo.create`) — curatie-upload; hier blijft `field_type` op default → fix (Task 3).
- `apps/api/src/services/flywheel/promotion.ts` (~173, `referenceLogo.create`) — promotie-pad; idem.
- (NEW) een backfill-script `apps/api/src/scripts/…` óf `apps/ml-service/scripts/…` (kies de kant met de mapping-logica; de mapping leeft in `apps/api` TS → een api-script is logischer, patroon `restore_recyclable_refs.py` maar dan TS/Prisma; of een read-only diagnose + een Prisma-migratie-achtig data-script). Motiveer de keuze.

### Datamodel (bevestigd)
- `reference_logos.field_type` (`schema.prisma:252`, default `PackagingMarkedLabelAccreditationCode`) + `gs1_field` (`:255`, nullable). `reference_embeddings` per `reference_logo_id` (embedding blijft; alleen tag-update).
- De teller aggregeert `reference_logos` (active, per field_type, per t3777_code met COUNT ≥3 echt via `source ∈ {review-confirmed,realref-live-poc,flywheel-promotion}`) + het gedeclareerde universe uit `flywheel-index/keurmerk-etiket-index.json` (`perKey`-sleutels `fieldType/code`).

### Wat behouden moet blijven
- Geen model/gate/harvest/conditie-C/resolveSeedPath-wijziging. Alleen `field_type`/`gs1_field`-tags + een read-only teller.
- De default-waarde in het schema mag blijven; de registratie-fix zet 'm expliciet bij create (schema-default is de vangnet).

### Ontwerpvragen (voor dev-story)
- **Ambigue codes:** primaire-codelijst-regel (welke wint) vs per-code beslissing. Aanbeveling: de declaratie-context/seed-`source` als tiebreak; anders rapporteren.
- **Teller-surface:** endpoint vs overview-service vs script (Task 4) — kies consistent met epic-15/16-overview-precedent.
- **Backfill-taal/plek:** api-TS (mapping leeft daar) vs ml-Python (bestaand data-fix-patroon 12.9/19.13). Motiveer.

### References
- [Source: keurmerk-dekking-per-categorie-2026-07-12.md] — field_type onbetrouwbaar, per-categorie hand-mapping (het probleem).
- [Source: investigations/nutriscore-letterloze-declaratie-en-labelintegriteit-investigation.md] — de datakwaliteit-oorzaak.
- [Source: apps/api/src/services/t3777-declarations.ts#327-375] — code→fieldType (MARK_FIELDS).
- [Source: tests/validation/codelist-veld-mapping.json] — codelijst→veld + ambiguïteit-caveat.
- [Source: apps/api/src/api/v1/reference-logos.ts#154, apps/api/src/services/flywheel/promotion.ts#173] — de registratie-creatiepaden.
- [Source: 12-9-nutriscore-labelcorrectie.md] — het idempotente data-fix-patroon (backfill spiegelt dit).
- Geheugen: `project_keurmerk_dekking_strategie`, `project_flywheel_resume`.

### Project Structure Notes
- API-kant (TS/Prisma) voor de mapping + registratie-fix + teller-endpoint; eventueel een read-only diagnose-script. Geen schema-migratie (kolommen bestaan). De backfill is een data-script met dry-run + toestemming.

## Dev Agent Record

### Agent Model Used
Claude Sonnet 5 (implement-sprint epic-12 subagent)

### Debug Log References
n.v.t. — geen live ACC-run in deze invocatie (permission-gated).

### Completion Notes List
- Geen splitsing nodig: deel 1 (mapping) + 2 (backfill) + 3 (registratie-fix) + 4 (teller) pasten coherent binnen één story-cyclus.
- `apps/web/src/data/spoor-codes.ts` bleek de facto al de code→codelijst-enumeratie te bevatten (Story 12.6, relabel-picker) — counts sluiten exact aan op `codelist-veld-mapping.json`. Bewust NIET cross-package gewired (packages/shared bestaat maar wordt door geen enkele app gebruikt; dat is een aparte workspace-wiring-wijziging) — de vier code-lijsten zijn 1:1 gespiegeld in `field-type-mapping.ts` met een expliciete "houd in lock-step"-comment.
- Ambiguïteit vastgesteld: `FODMAP` + `NUTRISCORE_A..E` zitten zowel in hun specifieke codelijst als in het T3777-default-universum. Primaire regel "specifiek wint van default" toegepast + gerapporteerd (AC2). Geen echte "twee specifieke lijsten botsen"-gevallen vandaag; dat pad is wel structureel gebouwd + unit-getest (synthetisch, via geïnjecteerde `classifyCode`-lookups).
- `REAL_CROP_SOURCES` in `bootstrap-run.ts` kreeg een `export` (was module-privaat) zodat de coverage-teller exact dezelfde bronwaarden hergebruikt i.p.v. te dupliceren — enige wijziging aan een bestaand, ongerelateerd bestand.
- Permission-gates gerespecteerd: geen live ACC-diagnose, geen `--apply`, geen deploy uitgevoerd. Story blijft op `review`.

### File List
- NEW `apps/api/src/services/field-type-mapping.ts`
- NEW `apps/api/src/scripts/backfill-reference-logo-field-type.ts`
- NEW `apps/api/src/services/flywheel/overview/coverage.ts`
- NEW `apps/api/src/__tests__/services/field-type-mapping.test.ts`
- NEW `apps/api/src/__tests__/scripts/backfill-reference-logo-field-type.test.ts`
- NEW `apps/api/src/__tests__/services/flywheel-coverage-overview.test.ts`
- MODIFIED `apps/api/src/api/v1/reference-logos.ts` (AC3)
- MODIFIED `apps/api/src/services/flywheel/promotion.ts` (AC3)
- MODIFIED `apps/api/src/services/flywheel/bootstrap-run.ts` (export `REAL_CROP_SOURCES`)
- MODIFIED `apps/api/src/services/flywheel/overview/index.ts` (wire `coverage`-paneel)
- MODIFIED `apps/api/src/__tests__/api/reference-logos.routes.test.ts`, `apps/api/src/__tests__/services/flywheel-promotion.test.ts`, `apps/api/src/__tests__/services/flywheel-overview-compose.test.ts`
- NEW `_bmad-output/implementation-artifacts/12-10-ac-trace.md`
- NEW `_bmad-output/implementation-artifacts/12-10-adversarial-review.md`
- MODIFIED `versions.md`

## Change Log
- 2026-07-13: aangemaakt via bmad-create-story. Volgt uit de dekkingsmeting + NutriScore-investigation (field_type projectbreed onbetrouwbaar). Scope: (1) field_type/gs1_field-backfill uit de autoritatieve code→veld-mapping (ambigu → rapporteren), (2) registratie-pad fixen (curatie-upload + promotie) tegen re-drift, (3) automatische per-categorie-dekkingsteller. Within-categorie visuele label-integriteit = aparte follow-up. Mogelijk splitsen (backfill+registratie vs teller). ACC-schrijf met toestemming per geval.
- 2026-07-13: implementatie (code+tests) afgerond, status → review. Geen splitsing nodig. Gated stappen (live ACC-diagnose, backfill --apply, deploy) NIET uitgevoerd — wachten op expliciete toestemming Friso. Zie Completion Notes + `12-10-ac-trace.md` + `12-10-adversarial-review.md`.
- 2026-07-13: code (mapping-resolutie + backfill + registratie-fix + dekkingsteller) + tests + adversarial review PASS (d04a1804); tsc 0, api-vitest 907 passed (orchestrator zelf geverifieerd) -> `review`. Task 7 met expliciete toestemming Friso: deploy b352cd3 (registratie-fix + teller live) -> dry-run (184 te updaten, 0 writes) -> `--apply` 184 rijen geschreven -> na-verificatie (idempotentie 0 te updaten; per-field_type DietType 16/EU-usage 4/NutritionalScore 24/PackagingMarked 179). field_type nu betrouwbaar per categorie; automatische dekkingsteller live. Alle AC1-6 geverifieerd -> **status -> `done`**. Follow-ups: gedeelde code-lijsten (spoor-codes.ts vs backend duplicatie), within-categorie visuele label-audit per categorie.
