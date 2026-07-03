# Story 12.8: Kruischeck-endpoint voor n8n (declared-values verificatie)

Status: ready-for-dev

<!-- Aangemaakt door Mary (analyst) + create-story workflow, 2026-07-02. -->

## Story

Als **n8n-workflow binnen het XXtract-ecosysteem** (n8n.acc.xxtract.com / n8n.stage.xxtract.com)
wil ik **per GTIN de GEDECLAREERDE keurmerken (T3777) laten verifiëren op het artwork van dat product**
zodat **datakwaliteitsbewaking automatisch kan vaststellen of gedeclareerde keurmerken ook daadwerkelijk op de verpakking staan** (100–200 producten/dag).

### Afbakening (kritiek)

- Dit is **optie A: kruischeck** — bevestig uitsluitend wat gedeclareerd is. **GEEN open detectie** ("vind álle keurmerken"); dat blijft Story 12.5 (fase 2) met eigen acceptatienorm en gates. Deze story wacht NIET op de 12.5-gates.
- **Schaduwmodus**: het endpoint rapporteert en logt, maar blokkeert niets en maakt GEEN review-items aan (er is vrijwel geen reviewcapaciteit).
- Geen modeltraining, geen nieuwe detector, geen wijziging aan de live detectie-pipeline van Epic 8/9.

## Acceptatiecriteria

1. **Start-endpoint.** `POST /api/v1/artwork/:gtin/verify-declared` (apps/api, Fastify v1-router):
   - Auth: bestaande `authMiddleware` mét system-API-key-pad (`x-api-key` header tegen `process.env.API_KEY`) zodat n8n zonder JWT kan aanroepen. GEEN nieuw authmechanisme bouwen.
   - Antwoordt `202 { runId }` volgens het bestaande run-patroon (zie `/artwork-import/runs`, apps/api/src/api/v1/artwork-pipeline.ts:513 e.v.).
   - Als voor de GTIN geen artwork geïmporteerd is: importeer eerst via de bestaande import-flow/mediaserver-client (delta: reeds geïmporteerde items overslaan). Geen artwork vindbaar → run eindigt met status `no-artwork` (geen error/throw).
2. **Declaratie-ophaal.** De run gebruikt de bestaande declaratieprovider (`apps/api/src/services/t3777-declarations.ts`, Story 8-3D): gln-lookup → Redis-cache → catalog-API → XML-parse. De `DeclarationReason`-failsafe-redenen (`api-key-ontbreekt`, `gln-ontbreekt`, `404-mogelijk-TM-mismatch`, `api-fout`, `lege-declaratie`, `ok`) worden 1-op-1 doorgegeven in de eindrespons zodat een stille fail-safe nooit op "geverifieerd, niets gevonden" lijkt.
3. **Alias-/normalisatietabel (NIEUW).** Declaratiecode → actieve referentieklasse, als aparte module met unit-tests. Minimaal gedekt: `MARINE_STEWARDSHIP_COUNCIL ↔ MARINE_STEWARDSHIP_COUNCIL_LABEL` en `RAINFOREST_ALLIANCE`-varianten (oud/nieuw, `RAINFOREST_ALLIANCE_PEOPLE_NATURE`). De dev leidt de volledige tabel af door de 43 actieve klassen (`SELECT DISTINCT t3777_code FROM reference_logos WHERE active=true`) naast `tests/validation/keurmerk-declaratie-frequentie.md` (top-30 declaraties) te leggen. Een gedeclareerde code zónder (alias naar een) actieve referentieklasse krijgt verdict `UNSUPPORTED` — nooit stilzwijgend overslaan.
4. **Gerichte detectie.** De verificatie draait het bestaande localize→classify-pad (ml-service) maar UITSLUITEND voor de gedeclareerde codes (na alias-mapping). Implementatie-opties, keuze aan de dev:
   a. `LocalizeRequest` (apps/ml-service/app/api/artwork.py:351) heeft al een optioneel `templates`-veld — subset meesturen vanaf Node; of
   b. (voorkeur) een optioneel `codes: list[str]`-filter toevoegen aan LocalizeRequest dat ML-side de actieve referentiebibliotheek filtert (kleiner request, templates blijven ML-side zoals 8-3P bedoelde).
   De kandidatenkrimp (~43 → 2–6 codes per product) is de kern van de latency-winst; volledige open detectie draaien en achteraf filteren is NIET acceptabel.
5. **Verdict per gedeclareerde code.** Eindrespons bevat per code exact één verdict:
   - `CONFIRMED` — treffer ≥ de bestaande crosscheck-drempels per methode (`CROSSCHECK_THRESHOLD_TEMPLATE` 0.85 / `_EMBEDDING` 0.80 / `_CLASSIFIER` 0.90, zie artwork-crosscheck.ts) — hergebruik `crosscheckDetections`, geen nieuwe drempellogica;
   - `UNCERTAIN` — wel gevonden maar onder de drempel (confidence meegeven);
   - `NOT_FOUND` — niet aangetroffen op het artwork;
   - `UNSUPPORTED` — geen actieve referentieklasse (AC3).
   Per verdict: `confidence`, `bbox`, `sourceFile`/pagina, gebruikte methode en (indien van toepassing) welke alias is toegepast.
6. **Status/resultaat-endpoint.** `GET /api/v1/artwork/verify-declared/runs/:runId` → `200 { status: running|done|no-artwork|failed, gtin, declaration: {reason, codes}, verdicts: [...] , processingTimeMs }`, `404` bij onbekende runId. n8n pollt (Wait-node); documenteer het aanroeprecept (start → poll → interpreteer) in de OpenAPI/route-docblock.
7. **Schaduwlogging zonder migratie.** Elke afgeronde run schrijft naar de bestaande tabellen `recognition_logs` (requestId = runId, detectionCount, processingTimeMs, confidenceThreshold) + `recognition_results` (per code: label, confidence, bbox). **GEEN nieuwe Prisma-modellen/migraties** — een dedicated tabel mag alleen na expliciete toestemming van Friso (teamregel databaseveiligheid); dat is bewust buiten deze story gehouden. Run-state tijdens verwerking leeft in Redis/BullMQ, niet in een nieuwe tabel.
8. **Geen neveneffecten.** De run maakt geen `artwork_review_items` aan en registreert geen trainingsdata (afwijkend van detection-flow.ts die dat wél doet — hergebruik de bouwstenen, niet de hele flow). CPU-getemperd draaien is niet nodig bij dit volume, maar de job draait via de bestaande BullMQ-pipeline-queue zodat parallelle n8n-calls de live-API niet verdringen (les 2026-06-15: ongetemperde bulk deed de frontend-health-check timeouten).
9. **Tests.**
   - Unit (vitest, apps/api): alias-tabel (incl. onbekende code → UNSUPPORTED), verdict-mapping (drempel-randgevallen per methode), declaratie-reason-doorgifte.
   - Integratie (vitest, apps/api/src/.../__tests__ of tests/integration): route-flow met gemockte mlClient + declaratieprovider: 202→poll→verdicts; no-artwork-pad; API-key-auth (401 zonder key).
   - Pytest (ml-service) alléén als optie 4b gekozen wordt: codes-filter filtert de actieve set correct, lege filter = bestaand gedrag.
   - E2E: NIET toevoegen aan de stable-subset-gate (recente quarantaine-les); optioneel een spec buiten de gate.
10. **Bewijs op ACC.** Na deploy: één echte GTIN met bekende declaraties handmatig door het endpoint halen en de respons + `recognition_logs`-rij in de story-file plakken (Dev Agent Record). Deploy-volgorde: eerst GitHub Actions "Build and Push Docker Images" laten slagen, dán Coolify-deploy (ACC draait pre-built ghcr-images — anders draait oude code).

## Dev Notes — Developer Context

### Wat er AL bestaat (hergebruiken, niet herbouwen)

| Bouwsteen | Waar | Relevantie |
|---|---|---|
| Declaratieprovider T3777 per GTIN | `apps/api/src/services/t3777-declarations.ts` (8-3D) | Compleet: gln-lookup, Redis-cache (incl. negative caching), catalog-API (`CATALOG_API_KEY`, `CATALOG_API_BASE`, `T3777_TARGET_MARKET=528`), namespace-agnostische XML-parse, fail-safe met reason-codes. Direct aanroepbaar. |
| Kruischeck-logica | `apps/api/src/services/artwork-crosscheck.ts` (8.5) | `crosscheckDetections(gtin, detections, declared)` met per-methode drempels uit env. Hergebruiken voor de verdict-bepaling. Matcht nu exact op code — de alias-mapping (AC3) vóór de match toepassen. |
| Detectie-orkestratie als voorbeeld | `apps/api/src/services/pipeline/detection-flow.ts` (8-3O) | Toont de keten mlClient.localizeArtwork → classifyArtwork → crosscheckDetections, BullMQ-retry-semantiek, dedup. LET OP: deze flow maakt review-items + registraties aan — dat pad NIET meenemen (AC8). |
| ML-client | `apps/api/src/services/ml-client.ts:360` (`localizeArtwork`), `:386` (`classifyArtwork`) | Bestaande interface naar ml-service. Uitbreiden met codes/templates-subset (AC4). |
| Localize/Classify endpoints | `apps/ml-service/app/api/artwork.py` — `LocalizeRequest` (:351, heeft al optioneel `templates`), `ClassifyRequest` (:612, Story 8.4) | Basis voor AC4; classificatie loopt via pgvector + gate-v2 (`app/services/keurmerk_gate.py`), real-crop-referenties zijn live (12.3). |
| Artwork-import per GTIN | `apps/api/src/api/v1/artwork-pipeline.ts` (`/artwork-import/runs`, run-patroon met 202 + poll, `markStaleRuns`, delta-skip) + `apps/api/src/services/mediaserver-client.ts:202` | Zowel het herbruikbare importmechanisme als het na te volgen API-patroon voor AC1/AC6. |
| Auth met system-API-key | `apps/api/src/middleware/auth.ts` (~:120–160) | `x-api-key` tegen `process.env.API_KEY` → "System" identiteit. n8n gebruikt dit. Bestaande `REQUIRE_ADMIN` is JWT-role-gebaseerd — de nieuwe routes moeten het API-key-pad accepteren; controleer hoe authMiddleware beide combineert. |
| Schaduwlog-tabellen | `apps/api/prisma/schema.prisma` — `model RecognitionLog` (requestId, imageHash, confidenceThreshold, processingTimeMs, detectionCount) + `RecognitionResult` | AC7. Geschreven vanuit `recognition.ts`-flows; volg dat schrijfpatroon. |

### Wat er NIEUW is (de eigenlijke story)

1. Route-paar `POST /artwork/:gtin/verify-declared` + `GET /artwork/verify-declared/runs/:runId` (nieuw bestand `apps/api/src/api/v1/verify-declared.ts` of toevoegen aan artwork-pipeline.ts — volg de registratiewijze van bestaande v1-routes in de server-bootstrap).
2. Alias-module, bv. `apps/api/src/services/t3777-aliases.ts` (AC3) — pure functie + tabel, unit-testbaar.
3. Verificatie-flow, bv. `apps/api/src/services/pipeline/verify-flow.ts`: import-check → declaraties → alias → gerichte localize/classify → crosscheck → verdicts → schaduwlog. BullMQ-job op de bestaande pipeline-queue (`pipeline/queue.ts`).
4. Optioneel ml-service: `codes`-filter op LocalizeRequest (optie 4b) + pytest.

### Guardrails (voorkom bekende fouten)

- **Wiel niet opnieuw uitvinden**: declaratie-ophaal, crosscheck-drempels, run-patroon, mediaserver-import en auth bestaan allemaal al (tabel hierboven). Elke herimplementatie is een review-finding.
- **Geen DB-migraties.** Teamregel: migraties alleen na expliciete toestemming per geval; deze story is bewust migratie-vrij ontworpen (AC7). Ook geen `prisma migrate` in tests tegen containers.
- **Schaduwmodus is hard**: geen review-items, geen trainingsdata-registratie, geen wijziging aan bestaande flows' gedrag (detection-flow.ts alleen als leesvoorbeeld).
- **Fail-safe nooit maskeren**: een lege declaratielijst met reason `api-fout` is GEEN "alles NOT_FOUND" — reason altijd in de respons (AC2), verdicts dan leeg.
- **Beperk tot gedeclareerde codes** vóór de dure stap (AC4) — de latency-budget-aanname (n8n-poll binnen ~1–3 min per product, 100–200/dag) hangt daaraan.
- **E2E stable-subset niet aanraken**: recent zijn 6 stack-incomplete specs gequarantaind; nieuwe e2e buiten de gate houden.
- Commits/PRs in het Engels, `versions.md` (NL, eindgebruikerstaal) in DEZELFDE commit.

### Architectuur-compliance

- Servicegrens: apps/api (Fastify, Prisma, BullMQ) orkestreert; apps/ml-service (FastAPI, pgvector) doet localize/classify. Geen directe DB-writes vanuit ml-service voor deze story.
- Config via env vars met bestaande naamgeving (`CROSSCHECK_THRESHOLD_*`, `CATALOG_API_*`); nieuwe env vars documenteren in het env-voorbeeldbestand van apps/api.
- Logging via `createLogger('<module>')` (core/logger), reason-codes log-stabiel houden (patroon 8-3D).
- Deploy: ghcr-images via GitHub Actions → Coolify (ACC). Nooit Coolify-deployen vóór de image-build klaar is.

### Stand op ACC (gemeten 2026-07-02, input voor tests/verwachtingen)

- 43 actieve klassen, 215 actieve referenties (177 uit echte verpakkingscrops); dekking ≈88% van het declaratievolume (top-30, `tests/validation/keurmerk-declaratie-frequentie.md`).
- 12.7-spike: 97% van declaraties herleidbaar naar controleerbare codes; declared-prior krimpt kandidaten ~900 → 2–6.
- `recognition_logs` is leeg — deze story levert het éérste praktijkgebruik; verwacht geen bestaande rijen in integratietests op ACC.
- Harvest 1857/1857 compleet; review-queue leeg — geen interferentie van nachtelijke jobs te verwachten, maar de harvester deelt wél de host (AC8-les).

### Previous story intelligence (12.x-lessen)

- 12.3: referentie-kwaliteit (echte crops) was de hefboom, niet embeddings-training — verdicts leunen op die referentieset; bij lage confidences eerst referentie-dekking van de code checken vóór drempels te verlagen.
- 12.4: gate-v2 is live default; detector-spike negatief (data-bottleneck) — geen detector-werk in deze story.
- 12.6/harvest: append-patronen en RECYCLABLE-flood-les; RECYCLABLE-declaraties (`RECYCLABLE_GENERAL_CLAIM`, 8.643 declaraties) zijn een bekende ruisbron — expliciet testgeval voor de alias/verdict-mapping.
- CI-1: deploy-volgorde ghcr → Coolify (AC10).

### Latest tech notes

- n8n HTTP Request-node: default timeout is instelbaar per node; het 202+poll-patroon met een Wait-node is de standaard-oplossing voor langlopende calls — geen server-sent events of websockets nodig.
- Geen nieuwe libraries vereist; blijf op de bestaande Fastify/Prisma/BullMQ- en FastAPI-versies uit de lockfiles.

### Project context reference

- `_bmad-output/implementation-artifacts/12-5-herkennings-endpoint-en-acceptatienorm.md` — afbakening open detectie (fase 2), acceptatienorm-denkkader.
- `_bmad-output/implementation-artifacts/12-7-spike-resultaten.md` — declared-values bewijs.
- `tests/validation/keurmerk-declaratie-frequentie.md` — declaratiefrequenties + veldenoverzicht (alleen T3777 in deze story; dietType/nutritionalScore/GHS zijn expliciet out-of-scope).
- `_bmad-output/implementation-artifacts/8-3O-server-side-detectie-orkestratie.md`, `8-5-t3777-kruischeck-en-routing.md`, `8-6-trainingsdata-registratie-met-herkomst.md` — de herbruikte bouwstenen.

## Tasks / Subtasks

- [ ] 1. Alias-module + unit-tests (AC3) — tabel afleiden uit actieve klassen × frequentiedoc.
- [ ] 2. ml-service `codes`-filter op LocalizeRequest + pytest (AC4b), of templates-subset vanaf Node (AC4a) — keuze documenteren in Dev Agent Record.
- [ ] 3. `verify-flow.ts`: BullMQ-job met import-check → declaraties → gerichte detectie → crosscheck → verdicts (AC1/2/4/5/8).
- [ ] 4. Routes `POST .../verify-declared` + `GET .../runs/:runId` met API-key-auth (AC1/6).
- [ ] 5. Schaduwlogging naar recognition_logs/recognition_results (AC7).
- [ ] 6. Unit-/integratietests (AC9).
- [ ] 7. versions.md + Engelse commit; ghcr-build afwachten; ACC-deploy; bewijs-run met echte GTIN (AC10).
- [ ] 8. n8n-aanroeprecept documenteren in route-docblock (AC6).

## Dev Agent Record

_(in te vullen door dev-story)_

### Agent Model Used

### Debug Log References

### Completion Notes

### File List

## Change Log

- 2026-07-02: Story aangemaakt (Mary/analyst, create-story workflow) op basis van live ACC-meting + keuze Friso voor optie A (kruischeck, n8n-afnemer, 100–200/dag, geen reviewcapaciteit).
