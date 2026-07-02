# Story 13.2: Automatische nominatie bij dubbele bevestiging

Status: ready-for-dev

<!-- Aangemaakt via create-story workflow, 2026-07-02. Bron: epics-vliegwiel.md Epic 13 / Story 13.2 + ARCHITECTURE-SPINE (AD-1, AD-2, AD-8, AD-12, AD-14, AD-16; ARCH-2, ARCH-5). Vereist: Story 13.1 (/ml/phash) afgerond. -->

## Story

Als **datamanager**
wil ik **dat elke dubbel bevestigde detectie automatisch kandidaat-referentie wordt (uit import/detectie, achter een aparte vlag uit kruischeck-verdicts, én — bij hoofdvlag-aan — uit reviewstation-accepts als absorptie van het 12.3-pad)**
zodat **geen enkel dubbel bewijs meer verdampt in alleen trainingsdata**.

### Afbakening (kritiek)

- Deze story levert **uitsluitend nominatie** (kandidaat-rijen + events). Batching, guardrails en promotie zijn 13.4/13.5; een kandidaat wordt in deze story dus nooit een actieve referentie.
- **Vlag-splitsing is hard (AD-8)**: `FLYWHEEL_NOMINATION_ENABLED` (hoofdvlag, default `false`) bestuurt crosscheck/import- én review-herkomst; `FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED` (default `false`) bestuurt aanvullend de kruischeck-herkomst en vereist óók de hoofdvlag. Beide default uit = gedrag byte-gelijk aan vandaag.
- **12.3-pad-ombuiging**: bij hoofdvlag-aan wordt `similarity.py::register_crop_as_reference` niet meer aangeroepen vanuit de review-accept-flow — geverifieerde aanroepplekken: `apps/api/src/api/v1/artwork-pipeline.ts:1058` (accept-pad) én `:1165` (annotatie-/markeer-pad). Beide ombuigen; vlag uit = legacy ongewijzigd.
- Kruischeck-herkomst (FR-20) haakt op het 12.8-verdict-pad. Story 12.8 is ready-for-dev maar nog niet gemerged (`verify-flow.ts` bestaat nog niet) — bouw de kruischeck-hook als aanroepbare service-functie en koppel hem op de CONFIRMED-verdict-bepaling zodra/waar 12.8 landt; documenteer de koppelplek in het Dev Agent Record.

## Acceptatiecriteria

1. **Migratie met toestemming (ARCH-2).** Given de nieuwe Prisma-migratie voor `reference_candidates`, `candidate_embeddings` en `hard_negatives` (conform Structural Seed, incl. `@@unique([contentHash, t3777Code])`, en met `promotionBatchId` als nullable kolom **ZONDER FK-constraint** — de FK-constraint volgt in de 13.4-migratie), when de migratie wordt voorbereid, then wordt deze als expliciete taak ter goedkeuring aan de gebruiker voorgelegd, nooit automatisch uitgevoerd, en met een gedocumenteerd terugdraaipad (down-script).
2. **Nominatie uit crosscheck.** Given een detectie met dubbele bevestiging waarvan de confidence ≥ de promotiedrempel van de gebruikte methode (per methode configureerbaar: `FLYWHEEL_PROMOTION_THRESHOLD_<METHODE>` voor template/embedding/classifier, alle default 0,90) (FR-5), when de crosscheck-flow deze verwerkt met `FLYWHEEL_NOMINATION_ENABLED=true`, then ontstaat exact één `reference_candidates`-rij (status `candidate`, herkomst `crosscheck`, evidence-contract gevuld, embedding in `candidate_embeddings`) met de synchroon via `/ml/phash` opgehaalde inhouds-hash (FR-1, AD-8, AD-14), **en** blijft de bestaande trainingsdata-registratie (Story 8.6) byte-voor-byte ongewijzigd (FR-1), **en** wordt bij onbereikbare hash-service de nominatie geweigerd (fail-closed, AD-14).
3. **Worker-pad, nooit request-pad.** Given de nominatie-verwerking (inclusief de synchrone `/ml/phash`-aanroep), when een nominatie ontstaat, then draait die volledig in het bestaande pipeline-worker-pad (BullMQ), nooit in het live-API-request-pad (NFR-3, NFR-7).
4. **Kruischeck-herkomst achter dubbele vlag.** Given een CONFIRMED-kruischeck-verdict (12.8) boven de promotiedrempel, when `FLYWHEEL_NOMINATION_ENABLED=true` én `FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED=true`, then ontstaat via hetzelfde pad een kandidaat met herkomst `kruischeck`, terwijl de verdict-response richting n8n op geen enkele wijze verandert (FR-20, AD-8).
5. **Default-uit bewezen.** Given een verse deploy zonder env-overrides, when een CONFIRMED-verdict binnenkomt, then ontstaat er géén kandidaat — `FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED` staat default op `false` en gaat pas aan ná bewezen promotielus op de importstroom (FR-20, AD-8).
6. **Review-herkomst absorbeert het 12.3-pad.** Given een reviewstation-accept met `FLYWHEEL_NOMINATION_ENABLED=true`, when de accept wordt verwerkt, then nomineert het accept-pad een kandidaat met herkomst `review` en is de directe 12.3-registratie (`similarity.py::register_crop_as_reference` → rechtstreeks `reference_logos`/`reference_embeddings`) uitgeschakeld — ml-service schrijft dan geen referentie-tabellen meer (AD-1, AD-2), **en** blijft met de vlag uit het legacy-12.3-gedrag ongewijzigd (geleidelijke migratie), **en** is de herkomst-enum overal `crosscheck`/`kruischeck`/`bootstrap`/`review`.
7. **Gemiste-nominatie-events.** Given een nominatie die geweigerd of overgeslagen wordt (reden: `phash-onbereikbaar`, `pauze` of `vlag-uit`), when de weigering optreedt, then wordt dit als event geregistreerd mét reden en is het als teller "gemiste nominaties" opvraagbaar via de overview-API (dashboard-weergave in Story 15.2) — geen stille brandstofverliezen (NFR-5).
8. **Veiligheidsregels en idempotentie.** Given een detectie zonder declaratie-bevestiging, onder de drempel, met een inhouds-hash die al in `hard_negatives` of `reference_candidates` staat, óf met de vlag uit, when de flow deze verwerkt, then ontstaat er géén nieuwe kandidaat-rij (FR-1-veiligheidsregel, FR-9-hernominatie-blokkade voor hard-negatives, AD-12); een bestaande zacht afgewezen rij (`rejected` met reden cap/duplicaat/outlier) mag wél via status-reset opnieuw `candidate` worden — geen nieuwe insert, de `@@unique` blijft kloppen (AD-12), **en** levert herverwerking van dezelfde GTIN nooit duplicaat-nominaties op (NFR-4).

## Tasks / Subtasks

- [ ] 1. **Prisma-migratie (EXPLICIETE TOESTEMMINGSTAAK, ARCH-2)** (AC: 1)
  - [ ] 1.1 Modellen `ReferenceCandidate`, `CandidateEmbedding`, `HardNegative` conform Structural Seed + Consistency Conventions: PascalCase-model + `@@map` snake_case, camelCase-kolommen + `@map`, `@db.Uuid`/`gen_random_uuid()`, `@db.Timestamptz`, status als `String @db.VarChar(20)` (géén Prisma-enum, patroon `ArtworkReviewItem.status`, schema.prisma:506–523), evidence `Json @default("{}")` (patroon `ArtworkImport.pages`, :458), `candidate_embeddings.embedding` als `Unsupported("vector(512)")` (patroon `ReferenceEmbedding`, :273–283), index `createdAt(sort: Desc)`.
  - [ ] 1.2 `@@unique([contentHash, t3777Code])` op `reference_candidates`; `contentHash` uniek op `hard_negatives`; `promotionBatchId` nullable **zonder** FK-constraint (die volgt in 13.4); `referenceLogoId` nullable FK.
  - [ ] 1.3 Down-script schrijven en in de migratie-map documenteren; migratie ter goedkeuring aan Friso voorleggen; NOOIT zelf `prisma migrate` draaien (uitvoering handmatig via `prisma migrate deploy` na akkoord — operationele envelope §2).
- [ ] 2. Nominatie-service `apps/api/src/services/flywheel/nomination.ts` (AC: 2, 7, 8)
  - [ ] 2.1 Vlag-/drempel-config: `FLYWHEEL_NOMINATION_ENABLED`, `FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED`, `FLYWHEEL_PROMOTION_THRESHOLD_TEMPLATE|EMBEDDING|CLASSIFIER` (default 0,90) — apart van de bestaande `CROSSCHECK_THRESHOLD_*` (artwork-crosscheck.ts:27–34); FLYWHEEL_-prefix-conventie.
  - [ ] 2.2 `nominateCandidate({detection, origin, gtin, declared})`: vlagcheck → drempelcheck per methode → synchrone `mlClient.computePhash` (13.1) → blokkade-checks (`hard_negatives`, bestaande `reference_candidates` op `(contentHash, t3777Code)`) → INSERT kandidaat + `candidate_embeddings` (embedding uit het bestaande classify-resultaat meegeven; embedding-modelversie in evidence, AD-3-vooruitwijzing) → evidence-contract (bron-GTIN, bronbestand, bbox, methode, scores, declaratie-uitkomst; AD-13).
  - [ ] 2.3 Status-reset-pad: bestaande rij met status `rejected` en zachte reden → conditional update (`WHERE status='rejected'`) terug naar `candidate`; nooit een tweede insert (AD-12, AD-16).
  - [ ] 2.4 Gemiste-nominatie-events: bij weigering (`phash-onbereikbaar`, `pauze`, `vlag-uit`) een event registreren mét reden — herstartbestendige tellers (bv. Redis `INCR` per reden zonder TTL, via de bestaande Redis-connectie) + gestructureerde log; ontsluit als `GET /api/v1/flywheel/overview`-veld `missedNominations` (nieuw routebestand, zie taak 5). *(De reden `pauze` wordt pas actief gevoed zodra 13.6 de pauzestand levert — de reden-enum en teller bestaan vanaf nu.)*
- [ ] 3. Crosscheck-hook (AC: 2, 3, 8)
  - [ ] 3.1 Eén instrumentatiepunt in `apps/api/src/services/artwork-crosscheck.ts` op de `autoAccepted`-uitkomst van `crosscheckDetections` (:95–188; `autoAccepted` = gedeclareerd + confidence ≥ drempel = "dubbele bevestiging"). Coördinatie-noot epics: Story 16.1 hergebruikt exact deze hook-plek.
  - [ ] 3.2 Worker-pad-borging: de aanroeper `detection-flow.ts:253` draait al in de BullMQ-detection-worker — nominatie mag daar synchroon in de job. De twééde aanroeper (`artwork-pipeline.ts:687`, request-pad) mag de nominatie uitsluitend **enqueue-en** (bestaande pipeline-queues, `pipeline/queue.ts:98`), nooit inline uitvoeren (NFR-3/NFR-7).
  - [ ] 3.3 Trainingsdata-registratie (`artwork-registration.ts:57 registerCropsTx` / `:118 processAcceptedReviewItems`) blijft byte-voor-byte ongewijzigd — hook staat ernáást, niet erin.
- [ ] 4. 12.3-pad-ombuiging (review-herkomst) (AC: 6)
  - [ ] 4.1 Beide aanroepplekken vlag-gaten: `artwork-pipeline.ts:1058` (accept) en `:1165` (annotatie). Hoofdvlag aan → geen `mlClient.registerReference`-aanroep meer, in plaats daarvan nominatie-werk enqueue-en met herkomst `review` (crop + code + review-context als evidence). Hoofdvlag uit → bestaand pad exact zoals nu (best-effort, non-fatal).
  - [ ] 4.2 `similarity.py` zelf NIET wijzigen — de ombuiging zit aan de Node-kant (aanroep vervalt); het ml-endpoint blijft bestaan voor de legacy-stand.
- [ ] 5. Routebestand-skelet `apps/api/src/api/v1/flywheel.ts` met `GET /api/v1/flywheel/overview` (voorlopig alleen `missedNominations`; latere stories vullen modulair aan — coördinatie-noot epics), registreren in `main.ts` conform patroon :125–134 (`await app.register(flywheelRoutes, { prefix: '/api/v1' })`) (AC: 7)
- [ ] 6. Kruischeck-hook als service-functie (herkomst `kruischeck`, dubbele-vlag-check) + koppelrecept voor de 12.8-CONFIRMED-verdict-plek; verdict-response aantoonbaar ongewijzigd (contract-test) (AC: 4, 5)
- [ ] 7. Tests (zie testrichtlijnen) (AC: 2–8)
- [ ] 8. versions.md zelfde commit; Engelse commit; ghcr-workflow vóór Coolify-deploy; deploy-volgorde ml → api (ml alleen als 13.1 nog mee moet)

## Dev Notes — Developer Context

### Bindende AD's

| AD | Essentie voor deze story |
|---|---|
| **AD-1 / AD-2** | Batch-pipeline-paradigma; API bezit alle vliegwiel-state. Legacy-uitzondering 12.3 gedocumenteerd: met hoofdvlag aan wordt reviewstation-accept **nominatie** (herkomst `review`) i.p.v. directe registratie; ml-service schrijft dan geen referentie-tabellen meer. Vlag uit = legacy ongewijzigd. |
| **AD-8** | Twee vlaggen, beide default `false`; kruischeck-nominatie vereist beide; verdict-response-pad blijft volledig ongewijzigd. |
| **AD-12** | Nominatie-uniciteit op `(inhouds-hash, t3777Code)`; uitsluitend de canonieke AD-14-hash; zachte afwijzing → `rejected` mét reden, hernominatie via status-reset van de bestáánde rij. |
| **AD-14** | `/ml/phash` synchroon vóór de INSERT; onbereikbaar → nominatie geweigerd, fail-closed; geen fallback-hash in Node. |
| **AD-16** | Status-machine `candidate → in_batch → promoted | rejected` (+ terugkeer-overgangen); elke overgang conditional update (`UPDATE ... WHERE status = <verwacht>`); statusovergangen loggen in evidence. |
| **ARCH-2** | Migratie alleen na expliciete toestemming; down-script verplicht; nooit auto-migrate. |
| **NFR-3/NFR-7** | Vliegwiel-verwerking gescheiden van de live-detectiestroom; geen impact op bestaande latency. |

### Wat er AL bestaat (hergebruiken, niet herbouwen)

| Bouwsteen | Waar | Relevantie |
|---|---|---|
| Dubbele-bevestiging-bepaling | `apps/api/src/services/artwork-crosscheck.ts:95` (`crosscheckDetections`); `autoAccepted` gevuld bij declared + confidence ≥ drempel (:123–130); drempels per methode :27–34, `getThresholdForMethod` :52 | Dé hook-plek. LET OP: crosscheck-drempels (0,85/0,80/0,90) ≠ promotiedrempels (alle 0,90) — nominatie checkt zijn éigen drempel bovenop auto-accept. |
| Aanroepers van de crosscheck | `apps/api/src/services/pipeline/detection-flow.ts:253` (BullMQ-worker-pad) en `apps/api/src/api/v1/artwork-pipeline.ts:687` (request-pad) | Bepaalt de worker-pad-strategie van taak 3.2. |
| Trainingsdata-registratie (8.6) | `apps/api/src/services/artwork-registration.ts` — `registerCropsTx` :57, `processAcceptedReviewItems` :118 | Moet byte-voor-byte ongewijzigd blijven (AC 2). |
| 12.3-registratiepad | `apps/api/src/api/v1/artwork-pipeline.ts:1058` en `:1165` → `MLClient.registerReference` (`ml-client.ts:447`) → `POST /ml/artwork/register-reference` (`artwork.py:162`) → `similarity.py:316 register_crop_as_reference` | De om te buigen keten (AC 6). Near-dup-guard 0,97 en idempotentie zitten ml-side — de nominatie-route krijgt zijn eigen dedup pas in 13.4; de `@@unique` + hash-blokkade dekken idempotentie hier. |
| Canonieke hash | Story 13.1: `MLClient.computePhash` → `/ml/phash` | Synchroon aanroepen vóór de INSERT (AD-14). |
| BullMQ-queues | `apps/api/src/services/pipeline/queue.ts:98` (`createPipelineQueues`; queues `training` :103, `artwork-detection` :108); workers `workers.ts:267/:314`; bootstrap in `main.ts:292–322` | Enqueue-pad voor request-side nominaties (taak 3.2/4.1). Geen nieuwe queue in deze story — de `flywheel`-queue komt in 13.4. |
| v1-route-registratie | `apps/api/src/main.ts:125–134` | Patroon voor het nieuwe `flywheel.ts`-routebestand. |
| Statusveld-/evidence-conventies | `schema.prisma`: `ArtworkReviewItem.status` (:506–523), `ArtworkImport.pages Json @default("{}")` (:458), `ReferenceEmbedding` vector(512) (:273–283) | Blauwdruk voor de drie nieuwe modellen. |

### Wat er NIEUW is (de eigenlijke story)

1. Prisma-migratie `reference_candidates` + `candidate_embeddings` + `hard_negatives` (+ down-script; goedkeuringsflow).
2. `apps/api/src/services/flywheel/nomination.ts` (+ evt. `flywheel/config.ts` voor vlaggen/drempels).
3. Hook in `artwork-crosscheck.ts` (één instrumentatiepunt) + enqueue-variant voor het request-pad.
4. Vlag-gating van de twee 12.3-aanroepplekken in `artwork-pipeline.ts`.
5. Routebestand `apps/api/src/api/v1/flywheel.ts` met minimale `overview` (gemiste-nominatie-teller).
6. Kruischeck-hook-functie + koppelrecept 12.8.

### Guardrails (voorkom bekende fouten)

- **Migratie = toestemmingsmoment (ARCH-2).** Voorbereiden mag; uitvoeren alleen Friso, handmatig, met down-script. Ook in tests nooit `migrate` tegen containers (teamregel databaseveiligheid).
- **Beide 12.3-plekken** ombuigen — alleen :1058 vlag-gaten en :1165 vergeten laat een achterdeur open waardoor ml-service tóch referentie-tabellen blijft schrijven bij vlag-aan (AD-2-schending).
- **Fail-closed is hard**: phash-fout → weigeren + event; nooit "insert zonder hash" of een Node-fallback (AD-14).
- **Geen dedup/guardrail-logica hier** (cap, pHash-Hamming, cosine ≥0,97 zijn 13.4) — hier alleen de harde blokkades: hard-negative-hash, bestaande kandidaat-rij, drempel, vlag, declaratie.
- **Verdict-contract 12.8**: de kruischeck-hook mag response-shape, statuscodes en timing-gedrag richting n8n niet raken — regressie hierop breekt een externe afnemer (100–200 producten/dag).
- **Trainingsdata-registratie niet aanraken** — hergebruik ernaast, niet erin (FR-1).
- Commits Engels; versions.md zelfde commit; ghcr vóór Coolify; e2e buiten de stable-subset-gate.

### Testrichtlijnen

- **Unit (vitest, `apps/api/src/__tests__/services/`)**: drempel-per-methode-randgevallen (0,90-grens, methode-fallback); vlag-matrix (hoofdvlag×kruischeckvlag: alleen true×true nomineert kruischeck); hash-blokkade (hard_negative-hit, bestaande kandidaat); status-reset-pad (rejected+zachte reden → candidate, géén insert); fail-closed bij phash-fout (gemockte MLClient) incl. event; evidence-contract-velden.
- **Integratie (vitest)**: crosscheck-flow met gemockte mlClient — autoAccepted → exact één kandidaat-rij + embedding-rij; herverwerking zelfde GTIN → geen duplicaat (NFR-4); review-accept met vlag aan → geen `registerReference`-aanroep, wél nominatie-enqueue; met vlag uit → wél `registerReference` (legacy-regressietest); 12.8-verdict-contract onveranderd (snapshot).
- **Pytest**: niet nodig (ml-service wijzigt niet in deze story).
- E2E: buiten de stable-subset-gate.

### Project Structure Notes

- Conform spine source-tree: `apps/api/src/services/flywheel/` (nieuw), `apps/api/src/api/v1/flywheel.ts` (nieuw), hooks in bestaande bestanden.
- Variance: het "gemiste nominaties"-event heeft géén eigen tabel in de Structural Seed (ARCH-5 fixeert de tabellenset) — daarom Redis-tellers + logging, geen extra migratie. Als de dev tóch persistentie-in-Postgres wil: dat is een spine-afwijking → eerst afstemmen. Bewust restrisico: bij een Redis-flush verdwijnen de tellers; de teller is indicatief, bron van waarheid = de gestructureerde logregels. Bij dev-start desgewenst alsnog system_settings-persistentie (bestaat na 13.6) afstemmen.

### References

- [Source: _bmad-output/planning-artifacts/epics-vliegwiel.md#Story 13.2, #Coördinatie-noot]
- [Source: ARCHITECTURE-SPINE.md#AD-1, #AD-2, #AD-8, #AD-12, #AD-14, #AD-16, #Constraints, #Consistency Conventions, #Structural Seed]
- [Source: prd.md#FR-1, #FR-5, #FR-9, #FR-20; #7 Success Metrics (SM-1-context)]
- [Source: _bmad-output/implementation-artifacts/12-8-kruischeck-endpoint-n8n.md (verdict-contract), 8-6-trainingsdata-registratie-met-herkomst.md]

## Dev Agent Record

_(in te vullen door dev-story)_

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-07-02: Story aangemaakt (create-story workflow); 12.3-aanroepplekken geverifieerd op `artwork-pipeline.ts:1058` en `:1165`; crosscheck-hook-plek geverifieerd op `artwork-crosscheck.ts:95` met aanroepers `detection-flow.ts:253` en `artwork-pipeline.ts:687`.
