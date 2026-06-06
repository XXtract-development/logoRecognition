---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments:
  - _bmad-output/planning-artifacts/research/technical-automatiseren-modeltraining-research-2026-06-03.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
epicNumberingStart: 7
generatedAt: 2026-06-03
mode: YOLO (autonoom gegenereerd na gebruikersgoedkeuring requirements + epic-doornummering)
---

# logoRecognition — Geautomatiseerde Modeltraining - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for de automatisering van modeltraining in logoRecognition, decomposing the requirements from het technisch researchrapport (2026-06-03), de bestaande PRD en de Architecture in implementable stories. Epics nummeren door vanaf Epic 7 (Epic 1-6 zijn afgerond in het oorspronkelijke project).

## Requirements Inventory

### Functional Requirements

**Fundament (Fase 0)**

FR41: Het systeem ondersteunt een vaste holdout-set: trainingsdata kan als holdout gemarkeerd worden en wordt technisch uitgesloten van training en augmentatie
FR42: Elk getraind model wordt automatisch geëvalueerd op de vaste holdout-set; metrics worden vastgelegd bij de modelversie
FR43: Er is een beheerbare keurmerk-referentiebibliotheek met officiële beeldmerken en varianten (taalversies, mono/kleur)

**Data-acquisitie & auto-annotatie**

FR44: Het systeem importeert etiket-artwork via de media-tabel (`xxtractdbmedia.media`, typeInfo=PACKAGING_ARTWORK) en haalt bestanden op via het mediaserver-endpoint, met caching in eigen opslag (MinIO)
FR45: PDF-artwork wordt gerasterized naar hoogresolutie-afbeeldingen vóór verwerking
FR46: Het systeem lokaliseert keurmerk-kandidaten op artwork via template-matching (baseline) en tiling (SAHI-aanpak) voor kleine logo's op grote bestanden
FR47: Gelokaliseerde regio's worden geclassificeerd (welk keurmerk) met de crop-classifier en/of embedding-similarity (pgvector)
FR48: Per GTIN wordt de gedetecteerde keurmerk-set gekruischeckt met de GS1-declaratie (T3777/packagingMarkedLabelAccreditationCode); matches worden auto-geaccepteerd, discrepanties gaan naar de uncertainty-review-queue
FR49: Auto-geaccepteerde crops worden met label en herkomst (bron-bestand, methode, confidence) geregistreerd als trainingsdata
FR50: Het systeem genereert synthetische trainingsdata: composits van referentie-keurmerken op artwork-achtergronden met random transformaties, met automatisch gegenereerde labels

**Retraining-triggers (Fase 1)**

FR51: De bestaande retraining-conditie-check draait periodiek via een scheduler met configureerbare drempels (feedback-aantal, ratio, accuracy)
FR52: Bij een trigger ontvangt de gebruiker een notificatie "retraining aanbevolen" inclusief de reden, via Socket.IO

**Continuous training pipeline (Fase 2)**

FR53: Er is een persistente job-queue-infrastructuur (BullMQ op bestaande Redis, Node-kant) met retries en zichtbare jobstatus
FR54: De trainingspipeline draait als job-flow: feedback incorporeren → batch samenstellen → trainen (via REST naar ML-service) → evalueren vs. champion → klaarzetten voor goedkeuring
FR55: Training-jobstatus is persistent: een crash van API of ML-service leidt niet tot verloren of onvindbare jobs
FR56: Een challenger-model wordt alleen ter goedkeuring aangeboden als het de kwaliteitsgate haalt (≥ champion op de vaste holdout-set)
FR57: De gebruiker kan het evaluatierapport (challenger vs. champion) inzien en het model met één handeling activeren via de bestaande activatieflow

**Bewaking & rollback (Fase 3)**

FR58: Na activatie monitort het systeem periodiek de realworld-accuracy van het actieve model op basis van feedback-data
FR59: Bij een accuracy-daling boven de drempel binnen het meetvenster voert het systeem automatisch een rollback uit naar de vorige modelversie, met notificatie
FR60: Elke promotie en rollback wordt vastgelegd in een audit-trail (wie/wat/wanneer/waarom)

**AI-agents (Fase 4, optioneel)**

FR61: Een annotatie-QA-agent beoordeelt twijfelgevallen uit de detectie-pipeline en vult de uncertainty-queue met onderbouwing
FR62: Een trainingsrun-analyse-agent interpreteert metrics/curves na elke run en voegt een leesbare aanbeveling toe aan de goedkeuringsnotificatie
FR63: Een rapportage-agent genereert periodiek een samenvatting van modelprestaties, feedback-trends en datasetgroei

### NonFunctional Requirements

NFR1: Geen verloren training-jobs bij een crash — jobstatus en queue-state zijn persistent (Redis/Postgres)
NFR2: Trainingsruns zijn planbaar buiten kantooruren (cron-window) om CPU-budget te bewaken; queue-concurrency voor training is 1
NFR3: Holdout-lekkage is technisch afgedwongen op query-niveau (holdout-data kan niet in trainings- of augmentatieselecties terechtkomen)
NFR4: De volledige pipeline heeft een CI-smoke-test op een mini-dataset (tientallen images, 2-3 epochs) die input/output-contracten bewaakt
NFR5: Menselijke goedkeuring is verplicht voor productie-activatie van een model; agents en pipeline mogen nooit autonoom activeren
NFR6: Geautomatiseerde callers (scheduler, agents) gebruiken een service-account/API-key; het activatie-endpoint is ge-audit
NFR7: Extern opgehaalde bestanden (mediaserver/NAS) worden gecachet in eigen opslag (MinIO); de pipeline is niet on-demand afhankelijk van externe bronnen
NFR8: KPI-doelen: doorlooptijd feedback → actief model < 1 week; ≤ 1 menselijke handeling per modelversie; 0 verloren jobs na crash

### Additional Requirements

- BullMQ uitsluitend aan de Node-kant (Python-client niet productierijp); de ML-service blijft REST en wordt aangeroepen via de bestaande endpoints
- Hergebruik bestaande componenten: uncertainty-queue (Epic 6.2), model-comparison endpoint (6.5), activatie-endpoint + hot-reload, Socket.IO-manager, annotatie-canvas/review-UI
- De bestaande `logo_detection`-collectie (777 docs, ~3.460 detecties, 49 klassen) evalueren als bootstrap-input; herkomst/status van die pilot uitzoeken
- Het mediaserver-endpoint is het enige toegangspad tot artwork op de NAS; media-tabel kolommen `ai`/`logo_ai`/`ocr` zijn beschikbaar als verwerkings-markers
- pgvector/logo_embeddings hergebruiken voor embedding-similarity
- Stack-conventies volgen: Fastify/TypeScript (API), FastAPI/PyTorch (ML-service), Redis, MinIO, PostgreSQL/Prisma, Docker/Coolify-deployment
- Trainingsdoel blijft de bestaande crop-classifier (EfficientNet-B0-concept); een apart licht lokalisatiemodel is een latere optie als template-matching tekortschiet
- Agent SDK-implementaties gebruiken actuele Claude model-ID's en duurzame state in Postgres (sessies zijn efemeer)

### UX Design Requirements

Geen apart UX-document. UI-werk is beperkt tot: (a) goedkeuringsscherm met challenger-vs-champion-evaluatierapport (uitbreiding bestaande models-pagina), (b) review-queue toont herkomst/onderbouwing van auto-annotaties (uitbreiding bestaande uncertainty-UI), (c) beheerscherm keurmerk-referentiebibliotheek. Volg het XXtract Design System.

### FR Coverage Map

FR41: Epic 7 — Holdout-markering in datamodel en selectielogica (Story 7.1)
FR42: Epic 7 — Holdout-evaluatie in de trainer (Story 7.2)
FR43: Epic 7 — Keurmerk-referentiebibliotheek (Story 7.3)
FR44: Epic 8 — Artwork-import en caching (Story 8.1)
FR45: Epic 8 — PDF-rasterization (Story 8.2)
FR46: Epic 8 — Keurmerk-lokalisatie (Story 8.3)
FR47: Epic 8 — Crop-classificatie (Story 8.4)
FR48: Epic 8 — T3777-kruischeck en routing (Story 8.5)
FR49: Epic 8 — Trainingsdata-registratie met herkomst (Story 8.6)
FR50: Epic 8 — Synthetische datageneratie (Story 8.7)
FR51: Epic 9 — Geplande trigger-check (Story 9.2)
FR52: Epic 9 — Trigger-notificatie met reden (Story 9.2)
FR53: Epic 9 — Persistente job-queue (Story 9.1)
FR54: Epic 9 — Trainingspipeline als job-flow (Story 9.3)
FR55: Epic 9 — Crash-bestendige jobstatus (Story 9.1, 9.3)
FR56: Epic 9 — Champion/challenger-kwaliteitsgate (Story 9.4)
FR57: Epic 9 — Goedkeuringsscherm en activatie (Story 9.5)
FR58: Epic 10 — Realworld-accuracy-monitoring (Story 10.1)
FR59: Epic 10 — Automatische rollback (Story 10.2)
FR60: Epic 10 — Audit-trail promotie/rollback (Story 10.3)
FR61: Epic 11 — Annotatie-QA-agent (Story 11.1)
FR62: Epic 11 — Trainingsrun-analyse-agent (Story 11.2)
FR63: Epic 11 — Rapportage-agent (Story 11.3)

NFR-dekking: NFR1/NFR2 → Story 9.1, 9.3 · NFR3 → Story 7.1 · NFR4 → Story 9.6 · NFR5 → Story 9.5, 11.2 · NFR6 → Story 9.1, 9.5 · NFR7 → Story 8.1 · NFR8 → KPI-meting in Story 9.5 en 10.1

## Epic List

### Epic 7: Betrouwbaar Evaluatiefundament
Datamanagers kunnen modelversies objectief vergelijken doordat elke training evalueert op een vaste, beschermde holdout-set, en beschikken over een beheerde keurmerk-referentiebibliotheek als kennisbron voor alle automatisering.
**FRs covered:** FR41, FR42, FR43

### Epic 8: Automatische Trainingsdata uit Etiket-Artwork
Het systeem bouwt zelfstandig geannoteerde trainingsdata op uit de ~39.000 etiket-artworkbestanden: ophalen, lokaliseren, classificeren, kruischecken met de GS1-declaratie en registreren — de datamanager reviewt alleen nog twijfelgevallen.
**FRs covered:** FR44, FR45, FR46, FR47, FR48, FR49, FR50

### Epic 9: Automatische Retraining met Menselijke Goedkeuring
Retraining wordt routine: het systeem signaleert wanneer hertrainen zinvol is, voert de volledige trainingspipeline crash-bestendig uit, bewaakt de kwaliteitsgate en biedt het resultaat ter goedkeuring aan — de mens houdt de activatieknop.
**FRs covered:** FR51, FR52, FR53, FR54, FR55, FR56, FR57

### Epic 10: Modelbewaking en Automatische Rollback
Het actieve model wordt continu bewaakt op realworld-prestaties; bij regressie volgt automatisch een rollback met volledige audit-trail — productie is zelfbeschermend.
**FRs covered:** FR58, FR59, FR60

### Epic 11: AI-Agent Ondersteuning (optioneel)
AI-agents nemen het beoordelende routinewerk over: annotatie-QA, metrics-interpretatie en periodieke rapportage — binnen de harde grens dat activatie menselijk blijft.
**FRs covered:** FR61, FR62, FR63

**Afhankelijkheden:** Epic 7 is standalone en randvoorwaardelijk voor 8 en 9. Epic 8 en 9 zijn onderling onafhankelijk (9 werkt ook op bestaande feedback-data) — met één uitvoeringsnuance: de 8.7-batch-hook is bewust deferred naar story 9.3 (besluit 2026-06-04, daar geïmplementeerd). Epic 10 bouwt op 9. Epic 11 bouwt op 8 en 9 en is optioneel.

> **Nazorg-spoor Epic 8 (toegevoegd 2026-06-06, readiness-fix 🟡3):** de acceptatie-fase B legde bloot dat story 8.3 functioneel als facade was opgeleverd (single-scale matching, zwakke score-normalisatie — `fase-b-bevindingen-2026-06-05.md`). De remediatie leeft als drie items onder `epic-8-nazorg` in `sprint-status.yaml`: **8-3R** (multi-scale + score-herijking; story-file + adversarial review + ATDD red-phase compleet, ready-for-dev), **8-3O** (server-side detectie-orkestratie localize→classify→crosscheck + templates uit de referentiebibliotheek; story-file volgt ná het 8-3R-meetrapport), **8-N1** (REINDEX-hook na `rebuild_reference_embeddings`, mini-fix, ready-for-dev). FR46/FR47 zijn pas op productiekwaliteit als 8-3R (engine) én 8-3O (orkestratie) af zijn.

## Epic 7: Betrouwbaar Evaluatiefundament

Datamanagers kunnen modelversies objectief vergelijken doordat elke training evalueert op een vaste, beschermde holdout-set, en beschikken over een beheerde keurmerk-referentiebibliotheek als kennisbron voor alle automatisering. Zonder dit fundament is elke automatische kwaliteitsbeslissing betekenisloos (researchrapport: trainer doet nu een random 80/20-split per run).

### Story 7.1: Holdout-markering op trainingsdata

As a datamanager,
I want trainingsafbeeldingen kunnen markeren als onderdeel van de vaste holdout-set,
So that er een stabiel, beschermd meetpunt ontstaat waarop alle modelversies eerlijk vergeleken kunnen worden.

**Acceptance Criteria:**

**Given** een bestaande trainingsafbeelding in de bibliotheek
**When** ik deze markeer als holdout (via API en via de bestaande beheer-UI)
**Then** krijgt het record een persistente holdout-vlag in het datamodel (`TrainingData`)
**And** is de wijziging zichtbaar in de bibliotheekweergave

**Given** een trainingsrun wordt gestart
**When** de trainer de dataset samenstelt (`get_training_images`)
**Then** worden holdout-records op query-niveau uitgesloten van zowel training als augmentatie (NFR3)
**And** faalt de run met een duidelijke foutmelding als de holdout-set leeg is of onder een configureerbaar minimum zakt

**Given** een initiële holdout-selectie is nodig
**When** de migratie draait
**Then** wordt een gestratificeerde steekproef (per keurmerk-klasse, configureerbaar percentage, default 15%) van bestaande gevalideerde data als holdout gemarkeerd

### Story 7.2: Holdout-evaluatie bij elke training

As a datamanager,
I want dat elk getraind model automatisch wordt geëvalueerd op de vaste holdout-set,
So that ik challenger en champion op exact dezelfde data kan vergelijken.

**Acceptance Criteria:**

**Given** een trainingsrun is afgerond
**When** het model wordt geregistreerd als modelversie
**Then** zijn accuracy, precision, recall en F1 op de holdout-set berekend en opgeslagen bij de modelversie (onderscheiden van de train/val-metrics)
**And** is in de metrics vastgelegd welke holdout-versie (aantal items, hash van de id-set) gebruikt is

**Given** twee modelversies geëvalueerd op dezelfde holdout-set
**When** ik het bestaande model-comparison endpoint aanroep
**Then** toont de vergelijking de holdout-metrics naast de bestaande metrics

### Story 7.3: Keurmerk-referentiebibliotheek

As a datamanager,
I want een beheerbare bibliotheek van officiële keurmerk-beeldmerken met varianten,
So that lokalisatie, classificatie en synthese een betrouwbare kennisbron hebben.

**Acceptance Criteria:**

**Given** een keurmerk (bijv. EU_ORGANIC_FARMING)
**When** ik een referentie-afbeelding upload met metadata (T3777-code, variantlabel zoals taal/mono/kleur, bronvermelding)
**Then** wordt deze opgeslagen (MinIO + databaserecord) en gekoppeld aan de bestaande Logo-categorie
**And** valideert het systeem het bestandsformaat (PNG/SVG) en minimale resolutie

**Given** de bibliotheek bevat referenties
**When** ik het overzichtsscherm open
**Then** zie ik per T3777-code alle varianten met preview, conform het XXtract Design System
**And** kan ik varianten deactiveren zonder ze te verwijderen (historie blijft)

**Given** de 49 klassen uit de bestaande logo_detection-pilot
**When** de bibliotheek initieel gevuld wordt
**Then** is er voor minimaal de top-20 klassen uit de pilot een referentie aanwezig

## Epic 8: Automatische Trainingsdata uit Etiket-Artwork

Het systeem bouwt zelfstandig geannoteerde trainingsdata op uit de ~39.000 etiket-artworkbestanden (12.498 GTINs) in `xxtractdbmedia.media`: ophalen via de mediaserver, lokaliseren (template-matching + tiling), classificeren, kruischecken met de GS1-declaratie (T3777) en registreren met herkomst. De datamanager reviewt alleen nog twijfelgevallen via de bestaande uncertainty-queue. De ~3.460 crops uit de eerdere pilot dienen als bootstrap-validatieset.

### Story 8.1: Artwork-import via mediaserver met caching

As a datamanager,
I want dat het systeem etiket-artwork automatisch ophaalt uit de media-tabel via het mediaserver-endpoint en lokaal cachet,
So that de detectie-pipeline een betrouwbare, eigen voorraad artwork heeft zonder afhankelijkheid van de NAS op verwerkingsmoment.

**Acceptance Criteria:**

**Given** de media-tabel bevat records met typeInfo=PACKAGING_ARTWORK
**When** de import-job draait voor een batch GTINs
**Then** worden de bestanden opgehaald via het mediaserver-endpoint en opgeslagen in MinIO met metadata (gtin, gln, orderNumber, fileName, hash) (NFR7)
**And** worden reeds gecachete bestanden (zelfde hash) niet opnieuw gedownload

**Given** een bestand is niet beschikbaar of het endpoint geeft een fout
**When** de import-job dit detecteert
**Then** wordt het record gemarkeerd met de foutreden en gaat de batch verder (geen abort)
**And** zijn mislukte items zichtbaar in de jobstatus en herstartbaar

**Given** een succesvol geïmporteerd bestand
**When** de import afrondt
**Then** wordt de verwerkingsstatus traceerbaar vastgelegd (eigen tabel; de media-tabel wordt niet gemuteerd zonder expliciete afstemming met het mediaserver-team)

### Story 8.2: PDF-artwork rasterization

As a datamanager,
I want dat PDF-artwork automatisch wordt omgezet naar hoogresolutie-afbeeldingen,
So that de ~8.000 PDF-etiketten dezelfde pipeline in kunnen als JPG/PNG-artwork.

**Acceptance Criteria:**

**Given** een gecachet PDF-artworkbestand
**When** de rasterization-stap draait
**Then** wordt elke pagina gerasterized naar een afbeelding met configureerbare DPI (default 300) en opgeslagen naast het origineel
**And** wordt de paginarelatie vastgelegd (bestand X, pagina N)

**Given** een corrupt of wachtwoord-beveiligd PDF
**When** rasterization faalt
**Then** wordt het item gemarkeerd met foutreden en telt het niet als pipeline-fout

### Story 8.3: Keurmerk-lokalisatie op artwork

As a datamanager,
I want dat het systeem keurmerk-kandidaten lokaliseert op artwork via template-matching en tiling,
So that ook kleine logo's op grote etiketbestanden gevonden worden zonder dat daar een getraind model voor nodig is.

**Acceptance Criteria:**

**Given** een gerasterized artworkbestand en de referentiebibliotheek (Story 7.3)
**When** de lokalisatie-stap draait
**Then** wordt het bestand in overlappende tegels verwerkt (configureerbare tegelgrootte/overlap)
**And** levert multi-scale template-matching per tegel kandidaat-regio's op met bounding box en match-score
**And** worden overlappende kandidaten over tegelgrenzen samengevoegd (non-max suppression)

**Given** de ~3.460 crops met bounding boxes uit de logo_detection-pilot
**When** de lokalisatie gevalideerd wordt
**Then** is de recall op een steekproef van pilot-items gemeten en gerapporteerd (baseline-meting, geen harde drempel in deze story)

### Story 8.4: Crop-classificatie van gelokaliseerde regio's

As a datamanager,
I want dat elke gelokaliseerde regio automatisch geclassificeerd wordt naar een keurmerk,
So that het systeem weet wélk keurmerk op welke plek staat.

**Acceptance Criteria:**

**Given** een kandidaat-regio uit de lokalisatie
**When** de classificatie-stap draait
**Then** wordt de crop geclassificeerd via embedding-similarity tegen de referentiebibliotheek (pgvector) en, indien beschikbaar, de bestaande crop-classifier
**And** levert dit een T3777-label met confidence-score op

**Given** een crop met confidence onder de configureerbare drempel
**When** classificatie afrondt
**Then** wordt de crop gemarkeerd als 'onzeker' (input voor de kruischeck-routing in Story 8.5)

### Story 8.5: T3777-kruischeck en routing

As a datamanager,
I want dat de gedetecteerde keurmerken per product worden vergeleken met de GS1-declaratie,
So that overeenstemmende detecties automatisch geaccepteerd worden en alleen discrepanties mijn aandacht vragen.

**Acceptance Criteria:**

**Given** een product met afgeronde detectie én een T3777-declaratie in de tradeItems-data
**When** de kruischeck draait
**Then** worden detecties die in de gedeclareerde set zitten en boven de confidence-drempel scoren gemarkeerd als auto-geaccepteerd
**And** gaan "verwacht maar niet gevonden" en "gevonden maar niet verwacht" als reviewitems naar de bestaande uncertainty-queue, met de discrepantie-reden als onderbouwing

**Given** een product zonder T3777-declaratie
**When** de kruischeck draait
**Then** worden alle detecties als reviewitems gerouteerd (geen auto-acceptatie zonder onafhankelijke bevestiging)

**Given** reviewitems in de uncertainty-queue
**When** ik er één open in de bestaande review-UI
**Then** zie ik de crop, het voorgestelde label, de confidence, de herkomst (bestand + coördinaten) en de discrepantie-reden

### Story 8.6: Trainingsdata-registratie met herkomst

As a datamanager,
I want dat auto-geaccepteerde en goedgekeurde crops als trainingsdata geregistreerd worden met volledige herkomst,
So that de dataset auditeerbaar groeit en foute bronnen later traceerbaar en corrigeerbaar zijn.

**Acceptance Criteria:**

**Given** een auto-geaccepteerde detectie of een door mij goedgekeurd reviewitem
**When** registratie plaatsvindt
**Then** ontstaat een trainingsdata-record met label, crop-verwijzing (MinIO), bronbestand, bounding box, methode (template/classifier/menselijk) en confidence
**And** telt het mee in de bestaande trainingsdata-statistieken per Logo-categorie

**Given** een bron-artworkbestand blijkt achteraf fout gelabeld
**When** ik de herkomst opvraag
**Then** kan ik alle trainingsdata-records van dat bronbestand vinden en in bulk deactiveren

### Story 8.7: Synthetische trainingsdata-generatie

As a datamanager,
I want dat het systeem synthetische trainingsvoorbeelden genereert door referentie-keurmerken op artwork-achtergronden te composeren,
So that er ook voor zeldzame keurmerken voldoende trainingsdata is, zonder annotatiewerk.

**Acceptance Criteria:**

**Given** de referentiebibliotheek en een voorraad gecachete artwork-achtergronden
**When** de synthese-job draait voor een keurmerk-klasse
**Then** worden composits gegenereerd met random transformaties (schaal, rotatie, kleurvariatie, blur) op realistische posities
**And** worden labels en bounding boxes automatisch vastgelegd met methode 'synthetic'

**Given** een klasse met minder dan een configureerbaar minimum aan echte voorbeelden
**When** de dataset voor training wordt samengesteld
**Then** wordt het tekort aangevuld met synthetische voorbeelden tot een configureerbare ratio echt:synthetisch
**And** komen synthetische voorbeelden nooit in de holdout-set (NFR3)

## Epic 9: Automatische Retraining met Menselijke Goedkeuring

Retraining wordt routine: het systeem signaleert wanneer hertrainen zinvol is (Epic 6.3 wordt écht af), voert de volledige trainingspipeline crash-bestendig uit als persistente job-flow, bewaakt de kwaliteitsgate op de holdout-set en biedt het resultaat ter goedkeuring aan. De mens houdt de activatieknop (NFR5).

### Story 9.1: Persistente job-queue-infrastructuur

As a datamanager,
I want dat geautomatiseerde taken in een persistente queue draaien met zichtbare status,
So that een crash nooit leidt tot verloren werk en ik altijd kan zien wat het systeem doet.

**Acceptance Criteria:**

**Given** de bestaande Redis-instantie
**When** de BullMQ-infrastructuur wordt toegevoegd aan de Fastify-API (Node-kant; de ML-service blijft REST)
**Then** zijn queues, workers en een job-status-endpoint beschikbaar met retries en backoff (FR53)
**And** overleven geplande en lopende jobs een herstart van de API-container (NFR1)

**Given** een geautomatiseerde caller (scheduler/worker)
**When** deze beveiligde endpoints aanroept
**Then** authenticeert die met een service-account/API-key, gescheiden van gebruikerssessies (NFR6)

**Given** een job faalt na alle retries
**When** ik de jobstatus bekijk
**Then** zie ik de foutreden en kan ik de job handmatig herstarten

### Story 9.2: Geplande retraining-trigger met notificatie

As a datamanager,
I want automatisch bericht krijgen wanneer hertrainen zinvol is, met de reden erbij,
So that ik nooit meer zelf hoef te bedenken wanneer het tijd is voor een nieuwe trainingsronde.

**Acceptance Criteria:**

**Given** de bestaande `checkRetrainingConditions()`-logica
**When** de repeatable trigger-job draait (default dagelijks, cron configureerbaar)
**Then** worden de condities geëvalueerd met configureerbare drempels in plaats van hardcoded constanten (FR51)
**And** ontvang ik bij een trigger een Socket.IO-notificatie met de concrete reden ("512 nieuwe gevalideerde annotaties sinds laatste training") (FR52)

**Given** een trigger is al gemeld en er is nog geen training gestart
**When** de check opnieuw draait
**Then** wordt geen duplicaatnotificatie gestuurd (dedup binnen een configureerbaar venster)

### Story 9.3: Trainingspipeline als crash-bestendige job-flow

As a datamanager,
I want dat een volledige trainingsronde als automatische job-flow draait,
So that van feedback-incorporatie tot evaluatie geen enkele handmatige tussenstap meer nodig is.

**Acceptance Criteria:**

**Given** een retraining-trigger (automatisch of handmatig gestart)
**When** de flow draait
**Then** voert deze achtereenvolgens uit: feedback incorporeren (bestaand endpoint) → batch samenstellen → training starten via REST naar de ML-service → wachten op completion → holdout-evaluatie ophalen (FR54)
**And** is elke stap afzonderlijk retryable zonder de hele flow te herhalen

**Given** de ML-service crasht tijdens een training
**When** de flow de jobstatus controleert
**Then** detecteert deze de afgebroken training, markeert de stap als gefaald en biedt herstart aan — de flow-state zelf is nooit kwijt (FR55, NFR1)

**Given** het geconfigureerde trainingsvenster (default buiten kantooruren)
**When** een trainingsstap gepland wordt
**Then** start deze alleen binnen het venster en draait er maximaal één training tegelijk (NFR2)

### Story 9.4: Champion/challenger-kwaliteitsgate

As a datamanager,
I want dat alleen modellen die aantoonbaar beter zijn ter goedkeuring worden aangeboden,
So that ik geen tijd verlies aan beoordelen van modellen die het niet waard zijn.

**Acceptance Criteria:**

**Given** een afgeronde training met holdout-evaluatie (Story 7.2)
**When** de gate-stap draait
**Then** wordt de challenger vergeleken met het actieve model op dezelfde holdout-set
**And** gaat de challenger alleen door naar goedkeuring als deze de configureerbare drempel haalt (default: holdout-accuracy ≥ champion) (FR56)

**Given** een challenger die de gate niet haalt
**When** de flow afrondt
**Then** wordt het model wél geregistreerd (versiebeheer) maar niet aangeboden, en ontvang ik een notificatie met de vergelijkingscijfers en de reden

### Story 9.5: Goedkeuringsscherm en éénklik-activatie

As a datamanager,
I want een goedkeuringsscherm met het volledige challenger-vs-champion-rapport en één activatieknop,
So that mijn enige handeling per modelversie een geïnformeerde goedkeuring is (KPI: ≤ 1 handeling).

**Acceptance Criteria:**

**Given** een challenger die de gate haalde
**When** ik de notificatie volg naar het goedkeuringsscherm (uitbreiding bestaande models-pagina, XXtract Design System)
**Then** zie ik holdout-metrics naast elkaar, het verschil per metric, datasetgroei sinds vorige training en de trigger-reden (FR57)
**And** activeert de bestaande activatieflow (incl. hot-reload) het model bij mijn bevestiging

**Given** welke geautomatiseerde flow of agent dan ook
**When** activatie zonder menselijke bevestiging wordt geprobeerd
**Then** weigert het activatie-endpoint dit voor service-accounts — activatie vereist een menselijke sessie (NFR5, NFR6)
**And** wordt elke activatie gelogd met gebruiker en tijdstip

**Given** een afgeronde activatie
**When** ik het overzicht bekijk
**Then** zie ik de doorlooptijd feedback → actief model als KPI-meting (NFR8)

### Story 9.6: CI-smoke-test van de volledige pipeline

As a ontwikkelaar,
I want een snelle end-to-end smoke-test van de trainingspipeline in CI,
So that schema-wijzigingen en pipeline-breuken bij elke commit zichtbaar worden vóór ze een echte trainingsronde raken.

**Acceptance Criteria:**

**Given** een mini-dataset in de repository (tientallen images, 2-3 klassen, incl. mini-holdout)
**When** de CI-smoke-test draait
**Then** doorloopt deze incorporate → batch → train (2-3 epochs) → holdout-evaluatie → gate-vergelijking op de in-memory/test-infrastructuur (NFR4)
**And** faalt de test bij contractbreuken (schema, API-respons, metrics-formaat) binnen enkele minuten

## Epic 10: Modelbewaking en Automatische Rollback

Het actieve model wordt continu bewaakt op realworld-prestaties (feedback-data); bij regressie volgt automatisch een rollback met volledige audit-trail. Hiermee wordt Epic 6.6 ("auto-rollback bij >10% accuracy-daling") alsnog waargemaakt en is productie zelfbeschermend.

> **Voorwerk-instructies (readiness-fixes 2026-06-06):**
> 1. **Migratieplanning (🟡6, Epic 9-les):** Epic 10 introduceert vermoedelijk 2 migraties (accuracy-tijdreeks bij 10.1, `model_audit_events` bij 10.3). Nummer ze strikt sequentieel óver de stories heen en leg de volgorde vast in de story-files (de 0007/0008-volgordefout uit Epic 9 niet herhalen). Migratie-uitvoering altijd met expliciete toestemming per geval.
> 2. **ACC-validatiestrategie (🟡7, fase-C-les):** realworld-monitoring vereist feedback-volume dat ACC niet organisch heeft. Definieer in de story-files een seed-feedback-strategie (gescripte feedback-records op de bestaande applicatiepaden) plus env-verlaagbare drempels (volume-minimum, meetfrequentie), zodat 10.1/10.2 op ACC end-to-end aantoonbaar zijn — inclusief een geforceerde rollback-demonstratie als AC-bewijs.

### Story 10.1: Realworld-accuracy-monitoring

As a datamanager,
I want dat het systeem na elke activatie de werkelijke prestaties van het actieve model volgt,
So that sluipende regressie zichtbaar wordt voordat gebruikers er last van hebben.

**Acceptance Criteria:**

**Given** een actief model en binnenkomende feedback-data
**When** de monitoring-job draait (repeatable, default per uur)
**Then** wordt de realworld-accuracy berekend over een schuivend venster en opgeslagen als tijdreeks per modelversie (FR58)
**And** geldt als definitie (readiness-fix 2026-06-06, 🟠1): **realworld-accuracy = aantal expliciet als 'correct' beoordeelde voorspellingen ÷ totaal expliciet beoordeelde voorspellingen** (feedback-records met menselijk oordeel) binnen het venster; onbeoordeelde voorspellingen tellen NIET mee (geen aannames over stilte)
**And** is de tijdreeks zichtbaar op de models-pagina als lijngrafiek per modelversie, met laag-volume-meetpunten visueel onderscheiden (gestippeld/gedimd) en activatiemomenten gemarkeerd

**Given** onvoldoende feedback-volume in het venster (configureerbaar minimum, default 50 beoordelingen)
**When** de berekening draait
**Then** wordt het meetpunt gemarkeerd als 'laag volume' en triggert het geen rollback-beslissing

**Given** een zojuist geactiveerde modelversie
**When** het eerste meetpunt mét volume-minimum binnenkomt
**Then** wordt dat meetpunt vastgelegd als **activatie-baseline** van deze modelversie (zelfde metriek en berekening als de tijdreeks — bewust GEEN vergelijking met holdout-metrics: andere dataverdeling, appels-met-peren)
**And** is er tot die baseline bestaat alleen monitoring, geen rollback-beslissing (Story 10.2)

### Story 10.2: Automatische rollback bij regressie

As a datamanager,
I want dat het systeem automatisch terugvalt op de vorige modelversie bij een forse accuracy-daling,
So that een slecht presterend model nooit lang actief blijft.

**Acceptance Criteria:**

**Given** de accuracy-tijdreeks van het actieve model mét vastgestelde activatie-baseline (Story 10.1)
**When** het meest recente meetpunt het volume-minimum haalt én **realworld-accuracy ≤ activatie-baseline − drempel (default 10 procentpunt)** binnen het meetvenster (default 1 uur)
**Then** activeert het systeem automatisch de vorige stabiele modelversie via de bestaande activatieflow (FR59)
**And** ontvang ik direct een notificatie met de meetgegevens die de rollback veroorzaakten (baseline, meetpunt, volume, venster)
**And** is zonder vastgestelde baseline (vers model, nog geen meetpunt met volume) een rollback-beslissing technisch uitgesloten (readiness-fix 2026-06-06, 🟠1)

**Given** een uitgevoerde auto-rollback
**When** de monitoring doorloopt
**Then** wordt voor het teruggerolde model geen tweede automatische rollback-loop gestart (flap-bescherming: handmatige beoordeling vereist vóór heractivatie)

### Story 10.3: Audit-trail voor promotie en rollback

As a beheerder,
I want een volledige audit-trail van elke modelpromotie en rollback,
So that altijd reconstrueerbaar is wie of wat een modelwissel veroorzaakte en waarom.

**Acceptance Criteria:**

**Given** elke activatie, weigering bij de gate, of (auto-)rollback
**When** de gebeurtenis plaatsvindt
**Then** wordt een audit-record geschreven met: modelversies (van/naar), initiator (gebruiker of systeem+reden), tijdstip, en de metrics op beslismoment (FR60)
**And** geldt als integratiebeslissing (readiness-fix 2026-06-06, 🟠2): **één nieuwe tabel `model_audit_events` met `event_type` (activation/gate_rejection/rollback/auto_rollback) als superset van het bestaande `model_activation_logs` (migratie 0008, Story 9.5)** — bestaande activatie-records worden bij de 10.3-migratie overgezet, de activatieflow schrijft daarna uitsluitend naar `model_audit_events` (geen dubbele logging), en het bestaande activatielog-scherm leest via een compatibele view of aangepaste query. Migratie-uitvoering alléén met expliciete toestemming per geval (vaste werkafspraak)

**Given** de audit-trail
**When** ik deze raadpleeg op de models-pagina
**Then** zie ik de chronologie per model als filterbare tabelweergave (filter op event-type en modelversie, nieuwste boven, XXtract Design System)
**And** zijn audit-records onveranderbaar (geen update/delete via API)

## Epic 11: AI-Agent Ondersteuning (optioneel)

AI-agents (Claude Agent SDK, actuele model-ID's, duurzame state in Postgres) nemen het beoordelende routinewerk over: annotatie-QA, metrics-interpretatie en periodieke rapportage. Harde grens: agents adviseren, mensen activeren (NFR5).

> **Voorwerk-instructie (readiness-fix 2026-06-06, 🟡5):** verifieer bij de start van het Epic 11-voorwerk de dan actuele Claude model-ID's tegen de Anthropic-documentatie en leg ze vast als configuratie (env), niet hardcoded — het model-aanbod wijzigt sneller dan dit document.

### Story 11.1: Annotatie-QA-agent

As a datamanager,
I want dat een AI-agent twijfelgevallen uit de detectie-pipeline voorbeoordeelt met onderbouwing,
So that mijn review-queue korter wordt en elk item dat overblijft al een duidelijke analyse heeft.

**Acceptance Criteria:**

**Given** nieuwe reviewitems uit de kruischeck (Story 8.5)
**When** de QA-agent draait
**Then** beoordeelt deze per item crop, voorgesteld label en context, en voegt een gestructureerd advies toe (akkoord/afwijzen/escaleren + redenering) (FR61)
**And** worden items waar de agent met hoge zekerheid 'akkoord' adviseert apart gegroepeerd voor snelle bulk-review — de finale beslissing blijft menselijk

**Given** de agent kan een item niet beoordelen (API-fout, onduidelijke crop)
**When** de run afrondt
**Then** blijft het item gewoon in de queue zonder advies (agent-uitval blokkeert de pipeline nooit)

### Story 11.2: Trainingsrun-analyse-agent

As a datamanager,
I want dat een AI-agent elke trainingsrun analyseert en een leesbare aanbeveling schrijft,
So that ik bij de goedkeuringsbeslissing niet zelf curves en metrics hoef te ontleden.

**Acceptance Criteria:**

**Given** een afgeronde trainingsrun met metrics, curves en gate-uitslag
**When** de analyse-agent draait
**Then** voegt deze aan de goedkeuringsnotificatie een analyse toe: opvallendheden (overfitting, class imbalance, datasetverschuiving), vergelijking met vorige runs en een aanbeveling met onderbouwing (FR62)
**And** is de aanbeveling adviserend — de agent heeft geen toegang tot het activatie-endpoint (NFR5)

### Story 11.3: Periodieke rapportage-agent

As a beheerder,
I want een periodiek, leesbaar rapport over modelprestaties, feedback-trends en datasetgroei,
So that ik zonder dashboards te spitten weet hoe het zelflerende systeem ervoor staat.

**Acceptance Criteria:**

**Given** de beschikbare data (modelversies, holdout-metrics, realworld-tijdreeks, feedback-statistieken, datasetgroei, pipeline-jobs)
**When** de rapportage-agent draait (default wekelijks, configureerbaar)
**Then** genereert deze een rapport in het Nederlands met trends, afwijkingen en aanbevolen acties (FR63)
**And** wordt het rapport verstuurd via het bestaande notificatiekanaal en gearchiveerd

**Given** een week zonder noemenswaardige wijzigingen
**When** het rapport gegenereerd wordt
**Then** is het kort ("geen bijzonderheden") in plaats van kunstmatig uitgebreid
