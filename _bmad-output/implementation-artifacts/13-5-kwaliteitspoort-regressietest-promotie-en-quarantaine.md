# Story 13.5: Kwaliteitspoort — regressietest, promotie en quarantaine

Status: done

<!-- Aangemaakt via create-story workflow, 2026-07-02. Bron: epics-vliegwiel.md Epic 13 / Story 13.5 + ARCHITECTURE-SPINE (AD-3, AD-4, AD-5, AD-11, AD-16). Vereist: 13.3 (gold-set) en 13.4 (batching/gateResults) afgerond. -->

## Story

Als **datamanager**
wil ik **dat elke batch langs een gold-set-regressietest gaat vóór promotie**
zodat **een besmette batch de herkenning nooit kan verslechteren**.

### Afbakening (kritiek)

- Deze story is **migratie-vrij**: alle benodigde kolommen bestaan al (`gateResults`/`baselineMeasurement` uit 13.4, evidence + embedding-modelversie uit 13.2, `gold_set_records` uit 13.3, FK-constraint uit de 13.4-migratie). Introduceer géén nieuwe schema-wijziging.
- De regressie-fase draait **binnen de 13.4-worker** (queue `flywheel`, concurrency 1) als vervolg-fase in dezelfde run — nooit via een endpoint (AD-15).
- Rollback, K=2-stilstand en pauze zijn Story 13.6. De **baseline-invalidatie-triggers** zitten daar; deze story implementeert het gedrág (verse nulmeting bij verouderde baseline) via een leesbare marker-abstractie (`services/flywheel/baseline.ts`) die 13.6 aan `system_settings` koppelt.
- De atomaire promotie promoveert **per kandidaat**, maar alleen als de **batch** als geheel de poort passeert (FR-2: de batch is de eenheid).

## Acceptatiecriteria

1. **Schaduw-evaluatie zonder mutatie + self-match-guard.** Given een batch die de guardrails passeerde, when ml-service `/ml/regression-eval` de meting draait (actieve `ReferenceEmbedding` UNION schaduwset = uitsluitend `in_batch`-kandidaten van deze batch; gold-set als payload meegegeven door de API), then wordt precisie@drempel over de volledige actieve gold-set gemeten zonder enige mutatie van de actieve referentieset (FR-3, AD-4, AD-5), **en** sluit de eval per query-crop referenties én schaduw-kandidaten met dezélfde inhouds-hash uit (self-match-guard, leave-one-out), zodat een gold-set-crop die (later) referentie wordt nooit tegen zichzelf matcht (AD-5).
2. **Eenmalige nulmeting.** Given een systeem waarin nog geen enkele batch de poort passeerde, when de allereerste batch zich aandient, then draait vóóraf een eenmalige nulmeting (pre-vliegwiel-precisie over de actieve referentieset, zonder schaduwset) die als initiële baseline wordt vastgelegd, zodat SM-1 een vergelijkingsanker heeft (FR-3, AD-5, SM-1).
3. **Verse nulmeting bij verouderde baseline.** Given een baseline die als verouderd is gemarkeerd (mutatie van de actieve referentieset buiten batch-promotie om — zie Story 13.6), when de eerstvolgende poortrun start, then begint die met een verse nulmeting op de actuele actieve set vóór hij batches meet (baseline-invalidatie, AD-5).
4. **Versie-guard.** Given kandidaten waarvan de embedding-modelversie ≠ de actieve modelversie, when de poort de batch meet, then worden die kandidaten niet gemeten: ze gaan via conditional update terug naar status `candidate` met een her-embed-taak, en modelactivatie (Epic 9-mechanisme) invalideert openstaande `candidate_embeddings` (versie-guard, AD-5, AD-16).
5. **Atomaire promotie binnen tolerantie.** Given een meting binnen de tolerantie t.o.v. de baseline van de meest recente `passed`-batch (sample-gebaseerd zolang de gold-set klein is: quarantaine bij ≥2 netto verslechterde gold-set-samples; de 1pp-drempel geldt pas vanaf een actieve gold-set ≥200 samples), when de batch promoveert, then gebeurt dat per kandidaat als één atomaire transactie: INSERT `ReferenceLogo` (`active=true`, `source='flywheel-promotion'`, variantLabel `auto-{batchShortId}-{seq}`) + kopie van de embedding naar `ReferenceEmbedding` (géén herberekening) + kandidaat-status → `promoted` (AD-3), **en** wordt de nieuwe baseline-meting op de batch vastgelegd en zijn alle metingen historisch opvraagbaar (FR-3, AD-5).
6. **Quarantaine boven tolerantie.** Given een meting boven de tolerantie, when de poort beslist, then krijgt de batch status `quarantined` met de gemeten delta en meest getroffen klassen; niets van de batch wordt actief (FR-2, FR-3), **en** ontstaat een notificatie via het bestaande RetrainingNotification-patroon (AD-11, ARCH-4).
7. **Fail-closed.** Given een niet-uitvoerbare meting (gold-set onbereikbaar, ml-service down), when de poort draait, then wordt de batch fail-closed gequarantaineerd met reden `systeem-fout` (NFR-2, AD-11).

## Tasks / Subtasks

- [ ] 1. ml-service `/ml/regression-eval` (AC: 1)
  - [ ] 1.1 `apps/ml-service/app/services/regression_eval.py`: input = gold-set-payload (crop-records: cropPath, label ECHT/VALS, t3777Code, contentHash) + batch-id/schaduw-embedding-set + drempel; matching = actieve `ReferenceEmbedding` (read-only pgvector-pad, conform invariant "ML -.-> PG alleen lezen") UNION de meegegeven schaduwset; output = precisie@drempel totaal + per klasse + per-sample-uitkomsten (voor de ≥2-netto-verslechterd-vergelijking en "meest getroffen klassen").
  - [ ] 1.2 Self-match-guard: per query-crop worden referenties én schaduw-kandidaten met dezelfde inhouds-hash uitgesloten (leave-one-out; de API levert de contentHash per gold-set-record mee — voor bestaande `ReferenceLogo`-rijen zonder bekende inhouds-hash: hash on-the-fly via de 13.1-service of uitsluiten op identiek cropPath; keuze documenteren, AD-5).
  - [ ] 1.3 Nulmeting-modus: zelfde eval zónder schaduwset (AC 2/3).
  - [ ] 1.4 Endpoint in `apps/ml-service/app/api/flywheel.py` (13.1-router); GEEN mutaties, GEEN gold-set-reads uit de DB (payload-only, AD-4); code onder `app/` (constraint 2).
- [ ] 2. Poort-orkestratie `apps/api/src/services/flywheel/gate.ts` (AC: 1, 2, 3, 6, 7)
  - [ ] 2.1 Regressie-fase in de 13.4-worker-flow: gold-set resolven via `services/flywheel/gold-set.ts` (13.3, crop-records) → `MLClient.regressionEval(...)` (nieuwe methode, patroon ml-client.ts:447) → uitkomst in `gateResults.regression`.
  - [ ] 2.2 Baseline-logica: vergelijkings-baseline = `baselineMeasurement` van de meest recente batch met status `passed` (`rolled_back` telt nooit, AD-5); geen enkele `passed`-batch → nulmeting draaien en vastleggen (AC 2); marker "baseline verouderd" (via `services/flywheel/baseline.ts`-abstractie; bron wordt in 13.6 `system_settings`, tot die tijd default 'niet verouderd') → verse nulmeting vóór batch-meting (AC 3).
  - [ ] 2.3 Tolerantie-beslissing: actieve gold-set < 200 samples → quarantaine bij ≥2 netto verslechterde samples (per-sample-vergelijking t.o.v. de baseline-meting); ≥200 samples → 1pp-drempel op precisie (AD-5-ASSUMPTION, FR-3). Grenzen als env-config (`FLYWHEEL_REGRESSION_MIN_WORSENED=2`, `FLYWHEEL_REGRESSION_TOLERANCE_PP=1`, `FLYWHEEL_REGRESSION_SAMPLE_SWITCH=200`).
  - [ ] 2.4 Quarantaine-pad: batch → `quarantined` + delta + meest getroffen klassen in `gateResults`; kandidaten blijven `in_batch` (afhandeling is 15.3); notificatie via RetrainingNotification-patroon (trigger.ts:141 als voorbeeldmechaniek, eigen reason-code `flywheel-batch-quarantined`).
  - [ ] 2.5 Fail-closed: elke exception/onbereikbaarheid in de meetketen → `quarantined` met reden `systeem-fout` in `gateResults`; nooit doorpromoveerd, nooit stil ge-skipped (NFR-2, AD-11).
- [ ] 3. Versie-guard (AC: 4)
  - [ ] 3.1 Vóór de meting: embedding-modelversie per kandidaat (evidence, 13.2) vergelijken met de actieve modelversie; mismatch → conditional update `in_batch → candidate` + her-embed-taak enqueue-en (bestaand pipeline-queue-mechanisme; de taak herberekent de embedding en zet de nieuwe modelversie in evidence).
  - [ ] 3.2 Koppeling modelactivatie: op het Epic 9-activatiepad een invalidatie-hook die openstaande `candidate_embeddings` markeert (verwijderen + kandidaat terug naar `candidate` met her-embed-taak, of expliciet vlaggen — keuze documenteren); zoek het activatiepad via `ModelActivationLog`-schrijvers (schema.prisma:492–502) en `MLClient.activateModel` (ml-client.ts:509).
- [ ] 4. Atomaire promotie `apps/api/src/services/flywheel/promotion.ts` (AC: 5)
  - [ ] 4.1 Per kandidaat één Prisma-transactie: INSERT `ReferenceLogo` (`active=true`, `source='flywheel-promotion'`, `variantLabel` = `auto-{batchShortId}-{seq}` — naamconventie-placeholders: korte batch-id + volgnummer, botsingsvrij binnen `@@unique([t3777Code, variantLabel])`, schema.prisma:264) + INSERT `ReferenceEmbedding` als **kopie** van de vector uit `candidate_embeddings` (géén herberekening; embedding-modelversie in evidence) + conditional update kandidaat `in_batch → promoted` met `referenceLogoId`. Zonder alle drie de stappen geen promotie (AD-3).
  - [ ] 4.2 Cap-afdwinging ín de transactie: de 13.4-cap-check met `SELECT ... FOR UPDATE`-variant hier aanroepen (AD-6).
  - [ ] 4.3 Na alle kandidaten: batch → `passed`, `baselineMeasurement` = de nieuwe meting, `closedAt` gezet; metingen historisch opvraagbaar via `gateResults`/`baselineMeasurement` per batch (overview/batches-endpoints tonen ze in 15.2/15.3).
  - [ ] 4.4 Template-/embedding-cache ml-side verversen na promotie (best-effort `MLClient.reloadTemplates`, ml-client.ts:417) zodat nieuwe referenties direct meedoen in detectie.
- [ ] 5. Tests (zie testrichtlijnen) (AC: 1–7)
- [ ] 6. versions.md zelfde commit; Engelse commit; ghcr-workflow vóór Coolify-deploy; deploy-volgorde ml-service → api; op ACC: nulmeting-run + eerste batch-meting als bewijs in het Dev Agent Record (metingen + gateResults-JSON)

## Dev Notes — Developer Context

### Bindende AD's

| AD | Essentie voor deze story |
|---|---|
| **AD-3** | Promotie = één atomaire transactie (INSERT ReferenceLogo active=true source='flywheel-promotion' + embedding-kopie zonder herberekening + status `promoted`); `ReferenceLogo` heeft géén status-kolom en krijgt er geen; variantLabel-conventie `auto-{batchShortId}-{seq}` botsingsvrij binnen `@@unique([t3777Code, variantLabel])`. |
| **AD-4** | Actieve gold-set = `replacedById IS NULL`, geresolved in apps/api; ml-service ontvangt de set als payload en leest de gold-set-tabellen nooit zelf. |
| **AD-5** | Schaduwset = uitsluitend `in_batch`-kandidaten van de batch-onder-meting; baseline = veld op de laatst `passed`-batch; self-match-guard (leave-one-out op inhouds-hash); versie-guard; meting = precisie@drempel; tolerantie sample-gebaseerd (≥2 netto verslechterd; 1pp vanaf ≥200 samples). |
| **AD-11** | Fail-closed: elke poortstap die niet kan meten → `quarantined` reden `systeem-fout`; notificatie via RetrainingNotification-patroon. |
| **AD-16** | Alle kandidaat-overgangen conditional updates (`in_batch → promoted`, `in_batch → candidate` bij versie-guard); 0 rows = overslaan. |
| **AD-15 (context)** | De poort draait uitsluitend in de worker — deze story voegt géén endpoints toe die poortlogica draaien. |

### Wat er AL bestaat (hergebruiken, niet herbouwen)

| Bouwsteen | Waar | Relevantie |
|---|---|---|
| Doeltabellen promotie | `apps/api/prisma/schema.prisma` — `ReferenceLogo` :243–266 (`active` :257, `source` :247, `@@unique([t3777Code, variantLabel])` :264), `ReferenceEmbedding` :273–283 (`vector(512)`) | De promotie-INSERTs; source-waarde `'flywheel-promotion'` onderscheidt promotie- van gecureerde referenties (cap/kloon-gat 13.4). |
| Gold-set-resolutie | Story 13.3: `apps/api/src/services/flywheel/gold-set.ts` | Payload-bron voor de eval; crop-records only. |
| Batch + gateResults + baselineMeasurement | Story 13.4: `promotion_batches`, worker-flow met fase-idempotentie, `regression: not-run`-marker | Deze story vult die fase en de beslis-uitkomsten. |
| Kandidaat-evidence met embedding-modelversie | Story 13.2 (evidence-contract) | Versie-guard-input. |
| Modelactivatie (Epic 9) | `MLClient.activateModel` (ml-client.ts:509), `ModelActivationLog` (schema.prisma:492–502) | Koppelpunt voor de invalidatie-hook (taak 3.2). |
| Notificatie-patroon | `trigger.ts:141 notifyRetrainingRecommended` + `RetrainingNotification` (schema.prisma:478–487) | Quarantaine-notificatie (AC 6). |
| MLClient-methodepatroon | `ml-client.ts:447` (registerReference) e.o. | `regressionEval`-methode. |
| Template-cache-verversing | `MLClient.reloadTemplates` :417 → `artwork.py:121` | Post-promotie-verversing (taak 4.4). |
| ml-router | Story 13.1: `apps/ml-service/app/api/flywheel.py` | `/ml/regression-eval` hier toevoegen. |

### Wat er NIEUW is (de eigenlijke story)

1. `apps/ml-service/app/services/regression_eval.py` + endpoint `/ml/regression-eval` + `MLClient.regressionEval`.
2. `apps/api/src/services/flywheel/gate.ts` (regressie-fase, baseline-/nulmeting-logica, tolerantie-beslissing, quarantaine, fail-closed) en `apps/api/src/services/flywheel/baseline.ts` (marker-abstractie; 13.6 koppelt de bron).
3. `apps/api/src/services/flywheel/promotion.ts` (atomaire promotie-transactie + cap-in-transactie + batch-afsluiting).
4. Versie-guard + her-embed-taak + modelactivatie-invalidatie-hook.

### Guardrails (voorkom bekende fouten)

- **GEEN migratie in deze story** — de FK-constraint hoort bij de 13.4-migratie; alle velden bestaan. Ontstaat er tóch schema-behoefte, dan is dat een scope-signaal: eerst afstemmen (ARCH-2 geldt onverkort).
- **Embedding kopiëren, nooit herberekenen** (AD-3): de poort moet exact meten wat live gaat; een herberekende embedding ondermijnt de meting.
- **Schaduwset strikt `in_batch` van déze batch** — gepromoveerde of afgewezen kandidaten mogen nooit dubbel meetellen (adversarial F2 was precies dit gat).
- **Fail-closed zonder uitzondering**: time-out, lege gold-set, ml-service down, payload-fout → `quarantined`/`systeem-fout`. Nooit "bij twijfel door" (NFR-2).
- **`rolled_back`-batches nooit als baseline-bron** (AD-5) — de baseline-terugval van 13.6 leunt hierop.
- **variantLabel-placeholders zijn naamconventie**, geen template-tokens in code (AD-3-noot): bouw de string letterlijk uit korte batch-id + volgnummer.
- **ml-code onder `app/`**; `/ml/regression-eval` leest hoogstens embeddings (read-only), schrijft niets, leest géén gold-set-tabellen.
- Commits Engels; versions.md zelfde commit; ghcr vóór Coolify; deploy ml → api; e2e buiten de stable-subset-gate.

### Testrichtlijnen

- **Unit (vitest, apps/api)**: tolerantie-beslissing (1 verslechterd → door; 2 netto verslechterd → quarantaine; verbeterde samples compenseren = "netto"; switch op 200 samples → 1pp-regel); baseline-selectie (meest recente `passed`; `rolled_back` overgeslagen; geen passed → nulmeting); verouderd-marker → verse nulmeting; versie-guard (mismatch → conditional update terug naar `candidate` + enqueue); fail-closed-mapping (elke fouttak → `systeem-fout`).
- **Integratie (vitest)**: promotie-transactie — alle drie stappen of geen (geforceerde fout na stap 1 → geen ReferenceLogo-rij over); variantLabel-uniciteit bij her-promotie; cap-in-transactie (cap vol → kandidaat afgewezen, geen INSERT); quarantaine-pad schrijft notificatie-rij; metingen landen in `gateResults`/`baselineMeasurement`.
- **Pytest (`apps/ml-service/tests/`)**: eval met synthetische vectoren — precisie@drempel correct (bekende ECHT/VALS-uitkomsten); UNION-gedrag (schaduw-kandidaat verandert een match); self-match-guard (query-crop met zelfde contentHash als referentie → uitgesloten, geen 100%-zelfmatch); nulmeting-modus (zonder schaduwset); geen enkele write.
- E2E: buiten de stable-subset-gate; ACC-bewijsrun conform taak 6.

### Project Structure Notes

- Conform spine source-tree: `services/flywheel/` (gate.ts, promotion.ts, baseline.ts), `app/services/regression_eval.py`, router `app/api/flywheel.py`.
- Variance: `baseline.ts` als abstractielaag is een story-invulling om de 13.5→13.6-volgorde te ontkoppelen (spine schrijft alleen het gedrag voor); documenteren in het Dev Agent Record.

### References

- [Source: _bmad-output/planning-artifacts/epics-vliegwiel.md#Story 13.5]
- [Source: ARCHITECTURE-SPINE.md#AD-3, #AD-4, #AD-5, #AD-11, #AD-15, #AD-16, #Structural Seed (/ml/regression-eval), #Operationele envelope (§4, §5)]
- [Source: prd.md#FR-2, #FR-3; #7 Success Metrics (SM-1 — nulmeting als vergelijkingsanker)]
- [Source: _bmad-output/implementation-artifacts/13-3-gold-set-naar-beheerde-opslag-met-seed-import.md, 13-4-nachtelijke-promotielus-batching-en-guardrails.md (fase-overdracht via gateResults)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (implement-sprint, epic/vliegwiel-13 worktree).

### Debug Log References

- apps/api vitest: 406 passed, 2 skipped (pre-existing). ml-service pure-pytest:
  regression_eval 12 + outlier 11 = 23 passed (lokale venv met numpy/pytest; torch/
  asyncpg niet nodig voor de pure-functie-tests via importlib, zelfde patroon als 13.4).
- Migratie-vrij bevestigd: geen schema-wijziging; alle velden bestonden (13.4-migratie).

### Completion Notes List

**Gemaakte keuzes (gedocumenteerd conform story-taken):**

1. **Query-embedding in ml-service (taak 1.1).** De gold-set-query-crops worden in
   de ml-service ingebed (stateless compute vanaf `cropPath`), niet in de API. Dit
   is géén gold-set-tabel-read (AD-4): de gold-set komt als payload; de ml-service
   embedt uitsluitend de meegegeven crops. Referentie/schaduw-embeddings komen uit
   PG (read-only) resp. de payload (kopie, niet herberekend, AD-3).
2. **Self-match-guard-sleutel (taak 1.2).** Primair op inhouds-hash (beide zijden
   bekend + gelijk → zelfmatch). Bestaande `ReferenceLogo`-rijen dragen geen
   bekende inhouds-hash → terugval op identiek `cropPath` (referentie-`storagePath`
   vs. gold-set-`cropPath`). Schaduw-kandidaten dragen wél een contentHash. Zo
   matcht een gold-set-crop die (later) referentie werd nooit tegen zichzelf.
3. **Versie-guard-modelversie (taak 3.1, M1).** Actieve modelversie = `ModelVersion`
   met `isActive=true`, veld `version`; vergeleken met `evidence.
   embeddingModelVersion` per kandidaat (13.2-contract). Mismatch → conditional
   update `in_batch → candidate` + `promotionBatchId=null` (AD-16) + her-embed-taak
   (`flywheel-reembed`) op de flywheel-queue. Geen actief model → guard overgeslagen.
4. **Baseline-marker-abstractie (`baseline.ts`, Project Structure variance).** De
   invalidatie-triggers zijn 13.6; deze story implementeert het GEDRAG (verse
   nulmeting bij verouderde baseline) achter `isBaselineStale()` (default false;
   env-override `FLYWHEEL_BASELINE_STALE` voor test/handmatig). 13.6 koppelt de
   bron aan `system_settings` zonder de aanroeper (`gate.ts`) te wijzigen.
5. **Modelactivatie-invalidatie-hook (taak 3.2).** De invalidatie is
   pull-gebaseerd via de versie-guard: bij elke poortrun worden kandidaten met een
   verouderde embedding-modelversie teruggezet + her-embed-getaakt. Er is geen
   aparte push-hook op het Epic 9-activatiepad nodig omdat de poort de enige
   consument van `candidate_embeddings` is (AD-15) en fase-idempotent draait; de
   guard vangt elke versie-drift bij de eerstvolgende run. Gedocumenteerd als
   bewuste keuze.
6. **Whole-batch-consistentie (review C1).** Per-kandidaat-promoties zijn atomair
   (AD-3); een gefaalde kandidaat-transactie stopt de batch niet (`result.failed`,
   blijft `in_batch`). De promotie + batch-afsluiting staan BUITEN de
   fail-closed-try zodat een infra-fout ná gecommitte promoties nooit alsnog
   quarantaineert; een gefaalde afsluit-UPDATE laat de batch `pending` voor
   crash-recovery.

**Hook in 13.4:** `promotion-batch.ts:processBatch` roept ná de vier guardrails
`runRegressionGate` aan (vervangt de `not-run`-placeholder); fase-idempotent via
`gateResults.regression.finishedAt`.

### File List

**Nieuw (apps/ml-service):**
- `app/services/regression_eval.py` — pure eval (precisie@drempel, self-match-guard, UNION).

**Gewijzigd (apps/ml-service):**
- `app/api/flywheel.py` — `/ml/regression-eval` endpoint (payload-only, geen writes).
- `app/services/database.py` — `get_active_reference_entries()` (read-only, incl. storage_path).
- `tests/unit/test_regression_eval_service.py` — pytest (12).

**Nieuw (apps/api):**
- `src/services/flywheel/gate.ts` — poort-orkestratie (versie-guard, baseline, meting, tolerantie, promotie/quarantaine, fail-closed).
- `src/services/flywheel/promotion.ts` — atomaire per-kandidaat-promotie + cap-in-tx + variantLabel.
- `src/services/flywheel/baseline.ts` — baseline-marker-abstractie.

**Gewijzigd (apps/api):**
- `src/services/ml-client.ts` — `regressionEval()`-methode.
- `src/services/flywheel/config.ts` — regressie-drempel + tolerantie-env-getters.
- `src/services/flywheel/types.ts` — `RegressionMeasurement`/`RegressionSample`/`GateDecision`/`QuarantineReason`.
- `src/services/flywheel/promotion-batch.ts` — regressie-fase ingehaakt (i.p.v. not-run).
- `src/__tests__/setup.ts` — mock `referenceEmbedding` + `mlClient.regressionEval`.
- `src/__tests__/services/flywheel-{gate,promotion,baseline,config}.test.ts` — nieuwe/uitgebreide tests.
- `src/__tests__/services/flywheel-promotion-batch.test.ts` — 13.4-test bijgewerkt naar 13.5-gedrag.

**Artefacten:** `review-13-5.md`, `ac-trace-13-5.md`.

## Change Log

- 2026-07-02: Story aangemaakt (create-story workflow); doeltabellen en uniekheids-constraint geverifieerd (schema.prisma:243–283); story bewust migratie-vrij gescoped (FK zit in 13.4).
- 2026-07-03: Geïmplementeerd (dev-story). Regressie-eval (ml-service, pure + endpoint), poort-orkestratie, atomaire promotie, quarantaine, fail-closed, versie-guard, baseline/nulmeting. Migratie-vrij bevestigd. Adversarial self-review PASS (C1 gefixt). AC→test 7/7 gedekt. apps/api vitest 406 passed; ml-service pytest 23 passed.
