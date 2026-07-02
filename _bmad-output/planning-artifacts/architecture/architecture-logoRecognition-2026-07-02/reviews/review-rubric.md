# Rubric Review — ARCHITECTURE-SPINE.md (Referentie-vliegwiel zonder review)

**Reviewer:** BMAD Reviewer Gate — rubric walker (good-spine checklist)
**Datum:** 2026-07-02
**Beoordeeld artefact:** `_bmad-output/planning-artifacts/architecture/architecture-logoRecognition-2026-07-02/ARCHITECTURE-SPINE.md`
**Getoetst tegen:** PRD §4 + Cross-Cutting NFRs (`prds/prd-logoRecognition-2026-07-02/prd.md`) én de feitelijke codebase (`apps/api/prisma/schema.prisma`, `apps/api/src/services/pipeline/`, `apps/ml-service/app/services/database.py`, package-manifests).

---

## Verdict

**Sterke, aantoonbaar brownfield-geratificeerde spine die de meeste divergentiepunten correct fixeert — maar de operationele envelope (deployment/migratie-uitvoerpad/seed-uitvoering/alerting) ontbreekt volledig als beslisdimensie, en de promotie→ReferenceLogo-mechaniek bevat een niet-bestaande "verified"-status plus een ongefixeerd rollback-/embedding-overdrachtsmechanisme.** Bruikbaar voor epics/stories ná adressering van de onderstaande punten; niet blokkerend voor het starten van epic-decompositie, wél blokkerend voor story-finalisatie van promotie/rollback en van elke story met schema- of deploy-impact.

---

## Rubric-walk

### 1. Fixeert de échte divergentiepunten en mist er geen — GEDEELTELIJK

**Goed gefixeerd:** state-eigenaarschap (AD-2), tabellenset met sleutel-kolommen en uniciteitssleutels (Structural Seed), orkestratie-eigenaar (AD-6: BullMQ in de API-worker, expliciet géén tweede scheduler), compute-grens (AD-9), feature-vlag met default false (AD-8), idempotentie-sleutel `(inhouds-hash, t3777Code)` (AD-12), gold-set-opslagmigratie (AD-4), schaduw-evaluatie zonder mutatie (AD-5), audit-patroon expliciet geratificeerd op `model_activation_logs` (AD-13), env-config-naamgeving en Prisma-conventies. De laag-mapping-tabel en de Capability→Architecture Map maken eigenaarschap per FR ondubbelzinnig.

**Gemist (de echte gaten):**

- **Promotie- en rollback-mechaniek op `ReferenceLogo` is onderbeslist.** De kernflow zegt "INSERT ReferenceLogo verified + nieuwe baseline", maar het bestaande model (`schema.prisma` r.243–267) heeft **geen status-kolom** — alleen `active Boolean @default(true)` en `source String?`. Hoe een gepromoveerde referentie zich onderscheidt van een gecureerde (nieuwe kolom? `source`-conventie? uitsluitend de FK vanuit `reference_candidates`?) is niet beslist. Evenmin beslist: rollback-mechanisme. De codebase heeft een werkend soft-delete-patroon (`rl.active = true`-filter in de matcher-queries van `apps/ml-service/app/services/database.py` r.481/520 én in `apps/api/src/api/v1/reference-logos.ts`), dus `active=false` is het voor de hand liggende pad — maar de spine legt het niet vast. Twee onafhankelijke stories (rollback-story vs. detectie-story) kunnen hier divergeren: DELETE vs. soft-delete, wél/niet cascade op `reference_embeddings`, en let op: `@@unique([t3777Code, variantLabel])` telt inactieve rijen mee (de bestaande route errort daar bewust op), wat interacteert met her-promotie na rollback.
- **Embedding-overdracht bij promotie onbeslist.** AD-5 introduceert `candidate_embeddings` als schaduwset, maar wat er bij een gepasseerde batch gebeurt — kopie naar `reference_embeddings`, herberekening, of verplaatsing — staat nergens. De regressietest-story en de promotie-story kunnen hier onafhankelijk verschillende aannames bouwen (met een reëel risico: gemeten wordt de schaduw-embedding, geactiveerd wordt een hérberekende — dan meet de poort iets anders dan wat live gaat).
- **Uitvoerpad van de eenmalige seeds ontbreekt.** AD-4 (seed-import 91 JSON-samples + 74 GTINs) en AD-7 (batch-export prod tradeItems) beslissen *wat*, maar niet *hoe uitgevoerd*: Prisma-seed, eenmalig script, admin-endpoint, tegen welke omgeving(en)? Niet beslist, niet deferred, geen open question. Zie ook rubric-item 7.

### 2. Elke AD-Rule afdwingbaar en divergentie-voorkomend — GROTENDEELS JA

Alle 13 AD's hebben een concreet, toetsbaar Rule-statement en een expliciet Prevents-veld. Bijzonder sterk: AD-6 ("wie de state bezit, bezit de orkestratie" — sluit de Coolify-scheduled-task-route uit die het queue-harvester-precedent juist wél nam), AD-8 (vlag + ongewijzigd verdict-pad is in een test afdwingbaar), AD-12/AD-13 (uniciteitssleutel resp. concreet tabelpatroon). AD-9 centraliseert de hash-berekening in `/ml/phash`, waardoor de "genormaliseerde crop-pixels"-normalisatie één implementatie-eigenaar heeft — dat maakt AD-12 afdwingbaar ondanks dat de normalisatie zelf niet gespecificeerd is. Enige zwakkere: AD-1 is paradigma-niveau (moeilijk mechanisch af te dwingen), maar wordt operationeel gemaakt door AD-3/AD-6/AD-8 eronder. Geen AD-Rule gevonden die zijn genoemde divergentie *niet* voorkomt.

### 3. Niets onder Deferred kan twee units laten divergeren — ÉÉN UITZONDERING

De meeste deferrals zijn veilig: DINOv2, region proposer, leverancier-terugkoppeling, drempel-adaptatie, 39k-capaciteit en referentie-veroudering zijn vervolgtrajecten zonder gedeeld bouwcontract; batch-cadans-optimum is een kalibratieparameter (env-config, AD-9) geen structuurkeuze; endpoint-payloadcontracten hebben één eigenaar per endpoint (API-story levert het contract, web consumeert — laag risico zolang epic-volgorde dat borgt).

**De uitzondering: "Mismatch-trigger-datamodel (FR-14)".** FR-14 (registratie in het crosscheck-pad), FR-15 (werkvoorraad-vertaling), FR-16 (rapport-export) en FR-17 (dashboard-aggregatie) zijn vier afzonderlijke bouw-eenheden die **dezelfde tabel(len)** delen. De deferral is begrensd ("binnen AD-2/AD-13 en de Prisma-conventies"), maar de tabelvorm zelf — per-verwerking-rij vs. voorgeaggregeerd, uitkomst-enum (bevestigd/niet-gevonden/niet-ondersteund), GLN-kolom — is precies het soort gedeeld contract dat een spine hoort te fixeren of expliciet aan het epic-document moet delegeren mét de eis dat het dáár bindend beslist wordt vóór story-split. Nu staat er alleen "op epic-niveau" zonder die verplichting.

### 4. Genoemde technologie actueel/bestaand — JA, GEVERIFIEERD

Alle stack-versies kloppen tegen de manifests: Fastify ^4.24.3, @prisma/client ^5.9.1, BullMQ ^5.1.9, ioredis ^5.3.2, TypeScript ^5.3.3/5.7.2 (`apps/api`/`apps/web/package.json`), antd 5.22.5 + react 18.3.1 (`apps/web/package.json`), FastAPI 0.109.0 / uvicorn 0.27.0 / torch 2.1.2 / torchvision 0.16.2 (`apps/ml-service/requirements.txt`). pgvector is bestaand en in gebruik (`Unsupported("vector(512)")` in schema; ivfflat-index-beheer in `database.py`). `imagehash` is een bestaande, actief onderhouden PyPI-bibliotheek; "nieuw — pinnen in de betreffende story" is de juiste behandeling (let daarbij wel op de gedocumenteerde torch-2.1-pinning-constraint in requirements.txt — imagehash heeft geen torch-dependency, dus laag risico). Geen verzonnen of verouderde technologie aangetroffen.

### 5. Brownfield-ratificatie — JA, AANTOONBAAR STERK

De spine ratificeert de codebase in plaats van hem tegen te spreken, en markeert dat expliciet met [ADOPTED]-tags. Geverifieerd tegen de code:

- Queues `training` / `artwork-detection` en `createPipelineQueues` + repeatable-cron-patroon bestaan exact zoals beschreven (`apps/api/src/services/pipeline/queue.ts`, `trigger.ts`).
- `apps/api/src/services/artwork-crosscheck.ts`, `ml-client.ts` bestaan; `ArtworkImport.gln` bestaat al (schema r.448) — AD-7 vult een bestaande kolom, introduceert er geen.
- `@@unique([t3777Code, variantLabel])` (schema r.264) klopt; de `auto-{batchShortId}-{seq}`-conventie is daarbinnen botsingsvrij zoals geclaimd.
- De memlog-verificaties zijn correct: er is inderdaad géén `system_settings`-model en géén generiek audit-patroon; `ModelActivationLog` (r.492) matcht de beschrijving exact. Dit soort "assumption geratificeerd tegen de code"-annotaties is precies wat een brownfield-spine hoort te doen.
- Constraint 2 (alleen `app/` in de Docker-image) ratificeert de queue-harvester-les; Constraint 1 ratificeert de teamregel migratie-toestemming.
- Statusvelden als `String @db.VarChar(20)` i.p.v. Prisma-enum matcht `ArtworkReviewItem.status` (r.516).

**Eén frictiepunt** (zie rubric 1): het woord "verified" in de kernflow suggereert een status-kolom op `ReferenceLogo` die niet bestaat — dat is de enige plek waar de spine de bestaande tabel impliciet tegenspreekt i.p.v. ratificeert.

**Eén gemiste ratificatiekans:** FR-19 eist een notificatie bij automatische stilstand. De codebase heeft daarvoor al een patroon — `RetrainingNotification` (Story 9.2: persistente notificatie-tabel + Socket.IO, "offline datamanagers missen nooit een trigger"). De deferral "notificatiekanalen buiten het dashboard" is legitiem, maar het *binnen*-dashboard/in-app-mechanisme is onbeslist terwijl er een bestaand per-domein-patroon klaarligt om — analoog aan de AD-13-behandeling van audit — te ratificeren.

### 6. Dekking PRD-capabilities die architectuurkeuzes nodig hebben — JA

Alle acht genoemde capabilities zijn gedekt en gemapt: promotielus (AD-1/5/6 + job `flywheel-promotion`), guardrails (AD-9 drempels/dedup/outlier + `hard_negatives` + AD-12), gold-set (AD-4 + reviewstation-hook FR-10/11), bootstrap (job `flywheel-bootstrap` + AD-6/8/9), mismatch-triggers (gemapt, datamodel deferred — zie rubric 3), dashboard (AD-10/11 + endpoints + pagina's), kruischeck-voeding (AD-8, zelfde vlag en pad als FR-1 — conform FR-20), GLN-backfill (AD-7 met terugvalroute en go/no-go). De Capability→Architecture Map dekt FR-1 t/m FR-21 zonder gat. Cross-cutting NFRs zijn elk aan een AD gebonden (fail-closed→AD-11, idempotentie→AD-12, herleidbaarheid/observability→AD-13, isolatie→AD-1/6, bronrestrictie gids-logo's→ *niet expliciet gebonden* — de PRD-eis dat GS1-gids-beelden nooit in exports/FR-16-rapporten terechtkomen heeft geen AD of conventie; klein maar reëel lek richting de rapport-story).

### 7. Elke dimensie beslist/deferred/open — NEE: operationele envelope ontbreekt

Dit is de klassieke domein-gerichte-draft-blinde-vlek en de spine heeft hem:

- **Deployment/environments: volledig afwezig.** Geen woord over hoe dit op ACC/prod landt, terwijl ACC pre-built ghcr-images uit de GitHub Actions-workflow draait (deploy-les uit het projectgeheugen: Coolify-deploy vóór de image-build draait oude code). Relevant voor élke story: nieuwe queue-workers in de bestaande API-worker-container, nieuwe env-vlaggen die via Coolify geprovisioneerd moeten worden, ml-service-image-rebuild bij `app/`-wijzigingen.
- **Migratie-uitvoerpad: half.** Constraint 1 regelt *toestemming* (correct), maar niet *uitvoering*: hoe draait een goedgekeurde Prisma-migratie op ACC/prod in een pre-built-image-wereld (handmatig `migrate deploy` via SSH? release-stap?)? Zeven nieuwe tabellen maken dit geen randgeval.
- **Observability/alerting: alleen de audit-kant.** AD-13 dekt logging-naar-tabellen en het dashboard als projectie, maar operationele signalering (faalt de nachtelijke job zelf — wie merkt dat? Sentry bestaat al in ml-service; BullMQ-job-failure-afhandeling?) is onbeslist én niet deferred. Een stil gestorven promotielus is onzichtbaar op precies het dashboard dat hem moet tonen.
- **Rollback-operatie:** batch-rollback is functioneel gedekt (AD-1/AD-11 + status `rolled_back`), maar zie rubric 1 voor het ontbrekende mechanisme; deployment-rollback valt onder het ontbrekende deployment-hoofdstuk.
- **Seed-/backfill-uitvoering:** zie rubric 1 — geen uitvoerpad, geen omgeving, geen eigenaar.

Elk van deze had minimaal als Deferred-met-eigenaar of Open Question gemarkeerd moeten zijn; nu bestaan ze simpelweg niet in het document, waardoor iedere story ze zelf gaat invullen — precies de divergentie die een spine moet voorkomen.

---

## Bevindingen (severity = impact op bruikbaarheid voor epics/stories)

| # | Severity | Bevinding |
|---|---|---|
| B-1 | **HOOG** | **Operationele envelope ontbreekt als dimensie.** Geen deployment/environments-sectie (ACC = pre-built ghcr-images uit GitHub Actions), geen migratie-*uitvoerpad* (Constraint 1 regelt alleen toestemming), geen uitvoerpad voor de eenmalige seeds (AD-4 gold-set-import, AD-7 GLN-export), geen operationele alerting bij falen van de nachtelijke job. Niet beslist, niet deferred, niet open — stories gaan dit elk zelf invullen. **Fix:** voeg een korte "Operational Envelope"-sectie toe met 3–5 beslissingen of expliciete deferrals-met-eigenaar. |
| B-2 | **MIDDEL** | **Promotie→`ReferenceLogo`-mechaniek onderbeslist en deels in tegenspraak met de code.** De kernflow zegt "INSERT ReferenceLogo verified", maar `ReferenceLogo` heeft geen status-kolom (wel `active` + `source`). Rollback-mechanisme (soft-delete via bestaand `active=false`-patroon, dat de matcher-queries al respecteren), interactie met `@@unique` over inactieve rijen bij her-promotie, en de embedding-overdracht `candidate_embeddings`→`reference_embeddings` (kopie vs. herberekening — bepaalt of de poort meet wat live gaat) zijn alle drie ongefixeerde divergentiepunten tussen promotie-, rollback- en detectie-stories. **Fix:** breid AD-3/AD-5 uit met deze drie beslissingen. |
| B-3 | **MIDDEL** | **Deferred "mismatch-trigger-datamodel (FR-14)" is een echt gedeeld contract.** FR-14-registratie (crosscheck-pad), FR-15-werkvoorraad, FR-16-export en FR-17-dashboard zijn vier bouw-eenheden op dezelfde tabel(len); "op epic-niveau" zonder bindende verplichting laat story-divergentie toe. **Fix:** ofwel de tabelvorm alsnog in de Structural Seed fixeren, ofwel de deferral aanscherpen tot "moet in het epic-document beslist zijn vóór story-decompositie". |
| B-4 | **LAAG** | **NFR "bronrestrictie gids-logo's" heeft geen bindende regel.** De PRD eist dat GS1 Label Guide-beelden nooit in exports/FR-16-rapporten belanden; geen AD of conventie dekt dit — de rapport-export-story kan dit ongemerkt schenden. **Fix:** één regel bij AD-13 of een conventie ("exports bevatten uitsluitend eigen crop-paden"). |
| B-5 | **LAAG** | **FR-19-notificatiemechanisme in-app onbeslist terwijl een bestaand patroon klaarligt.** `RetrainingNotification` (Story 9.2: persistente tabel + Socket.IO) is het codebase-precedent voor precies dit probleem; de spine defereert alleen kanalen *buiten* het dashboard en laat het binnen-kanaal zweven. **Fix:** ratificeer het 9.2-patroon (analoog aan de AD-13-behandeling van audit) of defereer expliciet. |

## Wat expliciet goed is (behouden)

- [ADOPTED]-markeringen en "memlog-assumption geratificeerd tegen de code"-annotaties (AD-11, AD-13) — voorbeeldig brownfield-gedrag, alle claims bleken bij verificatie correct.
- AD-6's principe "wie de state bezit, bezit de orkestratie" sluit precies het divergentiepad af dat het queue-harvester-precedent nam.
- Structural Seed op het juiste altitude: sleutel-kolommen en uniciteitssleutels wél, kolom-uitputtendheid niet.
- Stack-tabel 100% consistent met de manifests; geen enkel verzonnen versienummer.
