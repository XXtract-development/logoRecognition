---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
inputDocuments:
  - docs/index.md
  - docs/project-overview.md
  - docs/01-product/prd.md
  - docs/epics.md
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 13
classification:
  projectType: web_app
  domain: scientific
  complexity: medium
  projectContext: brownfield
workflowType: 'prd'
---

# Product Requirements Document - logoRecognition

**Author:** Friso
**Date:** 2026-03-31

## Executive Summary

Het Logo Recognition & Training System is een end-to-end platform dat organisaties in staat stelt logo-herkenning in te zetten zonder ML-expertise of grote datasets. Het systeem combineert smart click detection voor annotatie, een geautomatiseerde training pipeline (PyTorch/TensorFlow), en een real-time inference API (<100ms) in één geïntegreerd platform. Primaire gebruikers zijn data managers die zelfstandig logo-categorieën trainen en beheren, zonder tussenkomst van een ML-team.

De kernbehoefte is drieledig: **kostenbesparing** (80% reductie in annotatie-tijd), **snelheid** (van upload tot productie-klaar model in minuten), en **schaalbaarheid** (10.000+ logo-categorieën).

### Differentiator

De bottleneck in logo-herkenning zit niet in het model, maar in de data-voorbereiding. Door annotatie te reduceren tot een enkele klik (smart click detection) en een self-learning pipeline die automatisch verbetert op basis van gebruikersfeedback, elimineert het platform de twee grootste kostenposten: handmatige annotatie en herhaalde modeltraining.

## Projectclassificatie

| Eigenschap | Waarde |
|------------|--------|
| Projecttype | Web App (React 18 SPA + Fastify API + FastAPI ML Service) |
| Domein | Scientific/ML (computer vision, deep learning) |
| Complexiteit | Medium |
| Projectcontext | Brownfield (bestaande monorepo, MVP nagenoeg compleet) |
| Doelplatform | Desktop-first (1280px+), moderne browsers (Chrome, Edge, Firefox, Safari latest 2) |

## Success Criteria

### Gebruikerssucces

- Data Manager traint nieuw logo-categorie met >95% accuracy op eerste batch, zonder ML-kennis
- Annotatie via smart click detection <5 seconden per afbeelding
- Upload tot bruikbaar model <30 minuten (1000 afbeeldingen)
- Onboarding tot eerste succesvolle herkenning <5 minuten

### Business Succes

| Tijdlijn | Doel |
|----------|------|
| 2 weken | MVP productie-klaar — Epic 1-5 werkend en deploybaar |
| 3 maanden | Eerste productie-deployment met reële logo-categorieën |
| 12 maanden | 1.000+ actieve categorieën, self-learning pipeline operationeel |

### Meetbare Uitkomsten

- 80% reductie annotatie-tijd vs. handmatige bounding box annotatie
- Eerste-batch accuracy >95% zonder hertraining
- MVP productie-klaar binnen 2 weken (AI-assisted development)

## Product Scope

### MVP (Fase 1) — Status: nagenoeg compleet

| Capability | Epic | Status |
|-----------|------|--------|
| Batch image upload (drag & drop, JPG/PNG/WEBP) | 2 | Geïmplementeerd |
| Categorie management (CRUD) | 2 | Geïmplementeerd |
| Smart click detection annotatie | 4 | Geïmplementeerd |
| Handmatige bounding box correctie | 4 | Geïmplementeerd |
| Training pipeline met voortgang (WebSocket) | 5 | Geïmplementeerd |
| Model versioning en activatie | 5 | Geïmplementeerd |
| Logo herkenning via upload | 3 | Geïmplementeerd |
| REST API voor herkenning | 3 | Geïmplementeerd |
| Resultaatweergave met bounding boxes en confidence | 3 | Geïmplementeerd |
| JWT authenticatie en autorisatie | 1 | Geïmplementeerd |
| Docker-based deployment | 1 | Geïmplementeerd |

**MVP Strategie:** Problem-solving MVP — solo developer met AI-assisted development, 2 weken doorlooptijd. Focus op afronden en stabiliseren.

**Ondersteunde User Journeys:** Sarah — Training (J1), Sarah — Herstel (J2), Lisa — Productie (J3).

### Growth (Fase 2 — Post-MVP)

- **Epic 6:** Self-Learning System (active learning, automatische hertraining, model evolution)
- API consumer journey — batch API, webhooks, rate limiting
- Operations journey — Grafana dashboards, auto-scaling, alerting
- Performance optimalisatie voor 10.000+ categorieën
- Geavanceerde foutanalyse en model vergelijking

### Visie (Fase 3 — Toekomst)

- Volledig autonome self-learning pipeline zonder menselijke interventie
- Multi-model support en ensemble inference
- Edge deployment (ONNX/TensorFlow Lite) voor on-device herkenning
- API marketplace voor third-party integraties
- Multi-tenancy met organisatie-isolatie

### Risico Mitigatie

| Type | Risico | Mitigatie |
|------|--------|-----------|
| Technisch | ML-service integratie complexiteit | FastAPI + ONNX Runtime reeds werkend, focus op stabiliteit |
| Technisch | Canvas performance bij veel annotaties | Konva virtualisatie, lazy loading van bounding boxes |
| Markt | Onvoldoende accuracy voor productie-use | >95% eerste-batch target, iteratieve verbetering via hertraining |
| Resource | Solo developer, strakke deadline | AI-assisted development, focus op afronden bestaande code |

## User Journeys

### Journey 1: Sarah traint een nieuw logo (Primary — Success Path)

**Sarah**, Data Manager bij een FMCG-bedrijf, krijgt het verzoek om een nieuw productlogo toe te voegen. Ze heeft 200 productfoto's ontvangen van het marketingteam.

**Opening:** Sarah opent het platform en maakt een nieuwe categorie aan: "AcmeCorp Logo v2".

**Rising Action:** Ze sleept de 200 afbeeldingen in de upload zone. Het systeem verwerkt de batch en toont de eerste afbeelding. Sarah klikt op het logo — smart click detection herkent automatisch de grenzen en maakt een bounding box. Ze klikt door de afbeeldingen, gemiddeld 3-4 seconden per stuk. Bij twijfelgevallen past ze de box handmatig aan.

**Climax:** Na 15 minuten annotatie start ze de training. De voortgangsbalk toont real-time updates via WebSocket. Na 20 minuten is het model klaar — accuracy op de validatieset: 97.3%.

**Resolution:** Sarah test het nieuwe model met ongeziene afbeeldingen. De herkenning werkt feilloos. Ze activeert het model voor productie. Totale doorlooptijd: 40 minuten, zonder ML-kennis.

### Journey 2: Sarah herstelt van lage accuracy (Primary — Edge Case)

**Opening:** Sarah traint een nieuw logo, maar de accuracy na training is slechts 78%. Het systeem markeert dit als onvoldoende.

**Rising Action:** Ze bekijkt de foutanalyse — het model verwart het logo met een visueel gelijkend merk. Meerdere annotaties waren incorrect (logo deels buiten de bounding box).

**Climax:** Ze corrigeert de problematische annotaties, voegt 50 extra afbeeldingen toe met het verwarde merk als negatief voorbeeld, en start een hertraining.

**Resolution:** De nieuwe training haalt 96.1%. Sarah activeert het verbeterde model — probleem opgelost zonder ML-engineer.

### Journey 3: Lisa gebruikt real-time herkenning (Tertiary — Production)

**Lisa**, Production Operator, monitort een productielijn voor logo-controle op verpakkingen.

**Opening:** Lisa opent het herkenningsscherm en selecteert het actieve model voor de huidige productrun.

**Rising Action:** Ze uploadt foto's van verpakkingen — individueel of in kleine batches. Het systeem toont binnen milliseconden: bounding boxes rond herkende logo's, confidence scores, afwijkingen.

**Climax:** Het systeem detecteert een verpakking met een verouderd logo (confidence 34%). Lisa markeert dit als afwijking.

**Resolution:** In haar shift controleert Lisa 500+ verpakkingen. Afwijkingen zijn gelogd en doorgestuurd naar quality control.

### Journey 4: Mike deployt en monitort (Secondary — Operations)

**Mike**, DevOps Engineer, is verantwoordelijk voor beschikbaarheid en performance.

**Opening:** Mike krijgt een alert: inference latency gestegen naar 180ms (boven 100ms target). Hij opent Grafana.

**Rising Action:** Geheugengebruik ML-service gestegen na activatie van 3 nieuwe modellen. Hij schaalt de ML-service horizontaal via Kubernetes.

**Climax:** Latency daalt naar 45ms. Mike configureert auto-scaling rules.

**Resolution:** Deployment configuratie geüpdatet. Systeem draait stabiel op 99.9% uptime.

### Journey 5: Extern systeem via API (API Consumer)

Een **content management systeem** van een retailer stuurt automatisch productfoto's naar de Logo Recognition API.

**Opening:** Developer integreert de REST API met API key en configureert webhook voor resultaten.

**Rising Action:** Het CMS stuurt dagelijks 10.000 productfoto's in batches. De API verwerkt ze asynchroon via job queue en stuurt resultaten als JSON.

**Climax:** Het CMS tagt automatisch alle producten met het correcte merk — zonder menselijke tussenkomst.

**Resolution:** De retailer bespaart 40 uur per week aan handmatige product-tagging.

### Journey → Capability Mapping

| Journey | Capabilities |
|---------|-------------|
| Sarah — Training | Batch upload, categorieën CRUD, smart click detection, annotatie editor, training pipeline, voortgang tracking, model activatie |
| Sarah — Herstel | Foutanalyse, annotatie correctie, negatieve voorbeelden, hertraining |
| Lisa — Productie | Single/batch upload herkenning, resultaatweergave met bounding boxes, confidence scores, afwijking markering |
| Mike — Operations | Monitoring dashboard, health checks, scaling, deployment configuratie, alerting |
| API Consumer | REST API, API key auth, batch verwerking, async job queue, JSON response, rate limiting |

## Domein-Specifieke Vereisten

### ML/Computer Vision Constraints

- **Modelreproduceerbaarheid:** Training runs reproduceerbaar via seed management en dataset versioning
- **Data kwaliteit:** Annotatie-kwaliteit bepaalt modelkwaliteit — validatie van bounding box overlap (IoU) bij annotatie
- **Model versioning:** Volledige traceerbaarheid: dataset → training run → model versie → deployment
- **GPU/compute:** Training vereist GPU resources (PyTorch/TensorFlow), inference op CPU via ONNX

### Data & Privacy

- Logo-afbeeldingen kunnen intellectueel eigendom bevatten — MinIO storage met access control
- Data retentie beleid nodig voor trainingsdata en modellen
- Multi-tenancy: datasets en modellen strikt gescheiden bij gedeeld platformgebruik

### Technische Risico's

| Risico | Impact | Mitigatie |
|--------|--------|-----------|
| Model degradatie na update | Productie-accuracy daalt | A/B testing, rollback naar vorige modelversie |
| Onvoldoende trainingsdata | Lage accuracy | Minimum dataset size validatie, data augmentation |
| GPU resource exhaustion | Training queue loopt vast | BullMQ queue limits, resource monitoring, graceful degradation |
| Adversarial input | Verkeerde classificatie | Input validatie, confidence thresholds, outlier detectie |

## Web App Vereisten

### Architectuur

Single Page Application (React 18 SPA) met Vite build tool, Fastify API gateway, en FastAPI ML microservice. Intern/enterprise tool — geen publieke website, geen SEO nodig.

### Responsive Design

- **Primair:** Desktop (1280px+) — annotatie-editor en canvas vereisen groot scherm
- **Secundair:** Tablet (768px-1279px) — monitoring en resultaatweergave
- **Mobiel:** Niet prioriteit voor MVP — annotatie op touchscreen niet praktisch

### Real-time Communicatie

- Socket.IO voor training voortgangsrapportage (bevestigd)
- Potentieel voor live herkenningsresultaten en job queue status (nog niet gedefinieerd)

### Implementatie-overwegingen

- Code splitting via React Router lazy loading
- Zustand (client state) + TanStack Query (server state met caching)
- Konva virtualisatie voor grote aantallen bounding boxes
- i18next geïntegreerd voor meertaligheid

## UX Constraints & Interactiepatronen

### Annotatie Canvas

- Canvas-gebied neemt minimaal 70% van het scherm in beslag bij annotatie
- Bounding boxes zijn direct manipuleerbaar (resize, verplaatsen) via drag handles
- Smart click detection toont een visueel preview van de gedetecteerde boundary voordat de gebruiker bevestigt
- Undo/redo stack van minimaal 20 acties per sessie
- Zoom-niveau bereik: 25% tot 400%, met smooth scroll-zoom

### Training Voortgang

- Voortgangsindicatie toont minimaal: huidige epoch, loss-curve grafiek, geschatte resterende tijd
- Training kan op elk moment geannuleerd worden met directe visuele bevestiging
- Na afronding toont het systeem een samenvatting met accuracy metrics en vergelijking met vorige versie

### Resultaatweergave

- Herkenningsresultaten tonen bounding boxes als overlay op de originele afbeelding
- Elke bounding box toont label en confidence score bij hover
- Resultaten zijn sorteerbaar op confidence (hoog→laag, laag→hoog)
- Lage-confidence resultaten (<50%) zijn visueel onderscheidbaar (andere kleur/stijl)

### Navigatie & Feedback

- Alle destructieve acties (verwijderen, annuleren) vereisen een bevestigingsstap
- Systeem toont loading states voor alle asynchrone operaties (upload, training, herkenning)
- Foutmeldingen zijn specifiek en actionable — geen generieke "er ging iets mis" berichten

## Functionele Vereisten

### Beeldbeheer

- FR1: Data Manager kan meerdere afbeeldingen tegelijk uploaden via drag & drop (JPG, PNG, WEBP, max 10MB per bestand)
- FR2: Data Manager kan geüploade afbeeldingen bekijken, filteren (op categorie, datum, annotatiestatus) en doorzoeken op bestandsnaam
- FR3: Data Manager kan afbeeldingen verwijderen en beheren per categorie
- FR4: Systeem valideert bestandsformaat en -grootte bij upload

### Categoriebeheer

- FR5: Data Manager kan logo-categorieën aanmaken, bewerken en verwijderen
- FR6: Data Manager kan categorieën hiërarchisch organiseren (max 3 niveaus diep)
- FR7: Data Manager kan bulk-operaties uitvoeren op categorieën (verwijderen, verplaatsen, hernoemen)
- FR8: Systeem toont overzicht van categorieën met aantal afbeeldingen en trainingsstatus

### Annotatie

- FR9: Data Manager kan logo's annoteren via smart click detection (automatische boundary detectie)
- FR10: Data Manager kan bounding boxes handmatig tekenen en aanpassen
- FR11: Data Manager kan annotaties corrigeren en verwijderen
- FR12: Data Manager kan door afbeeldingen navigeren met keyboard shortcuts (volgende/vorige afbeelding, annotatie bevestigen, ongedaan maken)
- FR13: Data Manager kan in- en uitzoomen en pannen op het canvas
- FR14: Systeem toont annotatie-voortgang per categorie

### Model Training

- FR15: Data Manager kan een training starten voor een geselecteerde categorie of dataset
- FR16: Systeem voert automatische data augmentation uit tijdens training
- FR17: Systeem toont real-time trainingsvoortgang via push updates (loss, accuracy, epoch)
- FR18: Data Manager kan een lopende training annuleren
- FR19: Systeem slaat getrainde modellen op met versienummer en metadata
- FR20: Data Manager kan modelversies vergelijken op accuracy metrics

### Model Beheer

- FR21: Data Manager kan een specifieke modelversie activeren voor productie
- FR22: Data Manager kan terugschakelen naar een eerdere modelversie (rollback)
- FR23: Data Manager kan modelversies bekijken met bijbehorende trainingsresultaten
- FR24: Systeem exporteert modellen naar een geoptimaliseerd inference-formaat voor cross-platform deployment

### Logo Herkenning

- FR25: Gebruiker kan een afbeelding uploaden voor logo-herkenning
- FR26: Systeem toont herkenningsresultaten met bounding boxes, labels en confidence scores
- FR27: Gebruiker kan Top-K voorspellingen bekijken per gedetecteerd logo
- FR28: Gebruiker kan herkenningsresultaten exporteren als JSON of CSV
- FR29: Production Operator kan afwijkingen markeren in herkenningsresultaten

### API & Integratie

- FR30: Extern systeem kan logo-herkenning aanvragen via REST API met multipart upload
- FR31: Systeem ondersteunt API-authenticatie via token-based authenticatie
- FR32: Systeem verwerkt batch-aanvragen asynchroon via job queue
- FR33: Systeem levert herkenningsresultaten als gestructureerde JSON response

### Gebruikersbeheer & Beveiliging

- FR34: Gebruiker kan inloggen met gebruikersnaam en wachtwoord
- FR35: Systeem beheert sessies via tokens met configureerbaar verloop
- FR36: Systeem hanteert role-based access control (RBAC) voor verschillende gebruikersrollen
- FR37: Systeem logt alle gebruikersacties voor audit doeleinden

### Monitoring & Status

- FR38: Systeem toont systeemstatus en gezondheid via health check endpoints
- FR39: Systeem exposeert performance metrics via een standaard metrics endpoint
- FR40: Data Manager kan de status van lopende training jobs bekijken

## Niet-Functionele Vereisten

### Performance

| Metric | Target | Context |
|--------|--------|---------|
| Recognition Accuracy | >99% (mAP@0.5 IoU) | Productie-kwaliteit |
| Inference API Response (P95) | <100ms | Real-time productiegebruik |
| Training Pipeline Start | <5s | Klik tot eerste voortgangsupdate |
| Training Doorlooptijd | <30 min / 1000 afbeeldingen | Data manager workflow |
| Annotatie Snelheid | <5 sec/afbeelding | Smart click detection |
| Model Size (ONNX) | <50MB | Export en deployment |
| Canvas Rendering | 60fps bij 1000+ bounding boxes | Vloeiende annotatie |
| Pagina Laadtijd (LCP) | <2.5s | SPA eerste load |
| WebSocket Latency | <50ms | Real-time training voortgang |
| Concurrent Users | 100+ | Zonder degradatie |
| API Throughput | 1000 req/s | Batch verwerking externe systemen |

### Beveiliging

- Alle communicatie via HTTPS (TLS 1.2+)
- JWT tokens met verloop en refresh mechanisme
- Wachtwoorden gehasht met industry-standard algoritme (cost factor ≥12)
- RBAC met minimaal 3 rollen (admin, data manager, operator)
- Rate limiting op alle publieke API endpoints
- Input validatie op upload endpoints (bestandstype, grootte, MIME-type)
- Audit logging van alle muterende acties
- CORS beperkt tot bekende origins

### Schaalbaarheid

- Horizontale schaling ML-service via container orchestratie replicas
- 10.000+ logo-categorieën zonder performance degradatie (post-MVP)
- Job queue met configureerbare concurrency limits
- S3-compatibele object storage voor onbeperkte afbeeldingsopslag
- Database connection pooling via ORM

### Accessibility

- WCAG 2.1 AA conformiteit als minimum
- Keyboard navigatie voor alle primaire flows
- Screen reader compatibiliteit voor statusmeldingen en resultaten
- Minimaal 4.5:1 kleurcontrast voor tekst
- Focus indicatoren op alle interactieve elementen
- Aria-labels op canvas-elementen waar mogelijk

### Betrouwbaarheid

- Systeem uptime: 99.9% (maandgemiddelde)
- Data durability: 99.999% (object storage + database backups)
- Graceful degradation bij ML-service uitval (herkenning offline, training queued)
- Automatische herstart gefaalde training jobs (max 3 retries)
- Database migraties zonder downtime
