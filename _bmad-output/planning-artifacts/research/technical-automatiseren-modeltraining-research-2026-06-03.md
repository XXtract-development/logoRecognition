---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: []
workflowType: 'research'
lastStep: 1
research_type: 'technical'
research_topic: 'Automatiseren van modeltraining in logoRecognition (eventueel met AI agents)'
research_goals: 'Codebase-analyse van de huidige (handmatige) trainingsflow en een onderbouwd advies hoe modeltraining geautomatiseerd kan worden, inclusief de mogelijke inzet van AI agents'
user_name: 'Friso'
date: '2026-06-03'
web_research_enabled: true
source_verification: true
---

# Research Report: technical

**Date:** 2026-06-03
**Author:** Friso
**Research Type:** technical

---

## Research Overview

Dit onderzoek beantwoordt de vraag: *hoe automatiseren we het nu handmatige trainen van logo-herkenningsmodellen in logoRecognition, eventueel met AI-agents?* De methodiek combineerde een diepgaande codebase-analyse (alle trainings-, feedback- en modelroutes, met bestandspad+regelnummer per claim) met geverifieerde webresearch over zes assen: pipeline-orkestratie, job-queues, auto-labeling, agentic MLOps, kwaliteitsgates en adoptiestrategieën.

De kernbevinding: de trainings*uitvoering* is al volledig geautomatiseerd — wat handmatig is, is de **beslislaag** eromheen (wanneer trainen, met welke data, is het goed genoeg, terugdraaien bij regressie). Epic 6 ("Self-Learning System") staat administratief op done maar is feitelijk half af: de trigger-logica heeft geen scheduler, auto-rollback heeft geen monitoring-loop, incrementele updates ontbreken. Het advies: bouw in vier fasen naar MLOps Level 1 (continuous training) op de bestaande stack (BullMQ aan de Node-kant op de al draaiende Redis), met een vaste holdout-set als fundament en de mens als finale goedkeuringsgate. AI-agents (Claude Agent SDK) zijn waardevol als *beoordelende* laag (annotatie-QA, metrics-interpretatie) — niet als orkestrator. Zie de Research Synthesis onderaan voor de volledige managementsamenvatting.

---

<!-- Content will be appended sequentially through research workflow steps -->

## Technical Research Scope Confirmation

**Research Topic:** Automatiseren van modeltraining in logoRecognition (eventueel met AI agents)
**Research Goals:** Codebase-analyse van de huidige (handmatige) trainingsflow en een onderbouwd advies hoe modeltraining geautomatiseerd kan worden, inclusief de mogelijke inzet van AI agents

**Technical Research Scope:**

- Codebase-analyse - feitelijke trainingsflow end-to-end: handmatige stappen, bestaande automatisering (Epic 6), stubs/niet-aangesloten code
- Architecture Analysis - patronen voor geautomatiseerde ML-pipelines: continuous training, active learning, drift-detectie, human-in-the-loop gates
- Implementation Approaches - scheduled retraining vs event-driven triggers vs agent-gestuurde orkestratie
- Technology Stack - job queues, ML-pipeline tools, AI-agent frameworks passend bij Fastify/Node + Python ML-service + Docker/Coolify
- Integration Patterns - aanhaken op bestaande API, WebSocket-updates en model-activatieflow
- Performance Considerations - kwaliteitsgates, evaluatie-metrics, rollback-strategie

**Research Methodology:**

- Current web data with rigorous source verification
- Multi-source validation for critical technical claims
- Confidence level framework for uncertain information
- Code-claims onderbouwd met bestandspad + regelnummer

**Scope Confirmed:** 2026-06-03

## Technology Stack Analysis

### Pipeline-orkestratie voor geautomatiseerde training

De drie dominante orkestrators in 2026 hebben elk een duidelijk profiel. **Airflow** (3.1/3.2, met Human-in-the-Loop operators sinds sept 2025 en asset-partitioning sinds april 2026) past bij platformteams met 100+ pipelines en operationele capaciteit. **Prefect** biedt het snelste pad van Python-script naar geplande productie-pipeline met minimale infrastructuur — de "just works"-keuze voor teams van 20-100 personen. **Dagster** modelleert pipelines rond *assets* (datasets, modelartefacten) met lineage en versioning, en triggert downstream werk automatisch wanneer een upstream asset wijzigt — conceptueel sterk passend bij "dataset gewijzigd → hertrainen".
_Belangrijkste inzicht: voor één enkele trainingspipeline is een volwaardige orkestrator waarschijnlijk overkill; de afweging is orkestrator vs. een lichte job-queue._
_Confidence: hoog (meerdere onafhankelijke bronnen consistent)_
_Bronnen: [ZenML Orchestration Showdown](https://www.zenml.io/blog/orchestration-showdown-dagster-vs-prefect-vs-airflow), [DEV: Picking the Right Orchestrator in 2026](https://dev.to/datastackx/airflow-vs-prefect-vs-dagster-picking-the-right-orchestrator-in-2026-1ifb), [Reintech 2026 vergelijking](https://reintech.io/blog/data-pipeline-orchestration-airflow-dagster-prefect-2026)_

### Job-queue architectuur (Node ↔ Python brug)

**BullMQ** (Redis-gebaseerd) heeft officiële ondersteuning voor zowel **Node.js als Python**: dezelfde queues zijn vanuit beide talen te produceren/consumeren. Dit maakt het patroon mogelijk waarbij de bestaande Fastify-API jobs op een queue zet en een Python ML-worker ze consumeert — zonder extra orkestratie-infrastructuur naast Redis. FlowProducer ondersteunt job-grafen (children → parent), bruikbaar voor meertraps-pipelines (dataset-export → training → evaluatie → promotie). Retry-logica, scheduling (cron-patronen) en events zijn ingebouwd.
_Confidence: hoog (officiële documentatie)_
_Bronnen: [BullMQ](https://bullmq.io/), [BullMQ docs](https://docs.bullmq.io/), [GitHub taskforcesh/bullmq](https://github.com/taskforcesh/bullmq)_

### Automatische annotatie met foundation models

De grootste handmatige kostenpost in een detectie-trainingsloop is annotatie. Het 2026-landschap biedt zero-shot **auto-labeling**: **Grounding DINO** (tekst-prompt → bounding boxes, zonder taakspecifieke training) gecombineerd met **SAM 2** voor segmentatie, en het **Autodistill**-patroon (foundation model labelt → klein snel model zoals YOLO wordt erop gedistilleerd). Recente implementaties claimen 12-300× snellere auto-labeling dan Grounding DINO-T met hogere betrouwbaarheid. Voor logo-detectie betekent dit: een pre-label-stap die menselijke annotatie reduceert tot reviewen/corrigeren in plaats van vanaf nul tekenen.
_Confidence: gemiddeld-hoog (techniek bewezen; claims over versnellingsfactoren variëren per bron en domein)_
_Bronnen: [Label Your Data: AutoDistill 2026](https://labelyourdata.com/articles/data-annotation/autodistill), [PyImageSearch: Grounded SAM 2](https://pyimagesearch.com/2026/01/19/grounded-sam-2-from-open-set-detection-to-segmentation-and-tracking/), [TDS: Automatic Labeling with GroundingDino](https://medium.com/data-science/automatic-labeling-of-object-detection-datasets-using-groundingdino-b66c486656fe), [arXiv: Auto-Labeling Data for Object Detection](https://arxiv.org/pdf/2506.02359)_

### Active learning & retraining-triggers

Productie-best-practice voor YOLO-achtige pipelines: start met een kleine hoogwaardige seed-dataset en automatiseer de repetitieve stappen — prelabeling, selectie (uncertainty sampling), QA en versioning. Retraining triggeren wanneer mAP met een configureerbare delta daalt of feature-distributie-divergentie een drempel overschrijdt; altijd valideren op een strikt menselijk-geverifieerde holdout-set als single source of truth. Elke stap instrumenteren met lineage, metrics en CI-gates zodat hertrainen routine, auditeerbaar en veilig wordt.
_Confidence: hoog (consistent over meerdere bronnen)_
_Bronnen: [SO Development: Fine-Tuning YOLO with Automated Labeling Pipeline](https://so-development.org/fine-tuning-yolo-models-with-an-automated-data-labeling-pipeline/), [Ultralytics: Active Learning](https://www.ultralytics.com/glossary/active-learning), [Medium: Auto-Retraining Pipeline YOLOv12 op AWS](https://medium.com/@nikhilkumar.marepally/building-an-auto-retraining-and-deployment-pipeline-for-yolov12-on-aws-d972ccb54391)_

### AI-agent frameworks voor MLOps-automatisering

"Agentic MLOps" (2026) automatiseert de *beslissingen* tussen monitoring, retraining, validatie en deployment: de agent detecteert problemen, hertraint, draait validatietests — maar finale promotie naar productie vereist menselijke goedkeuring (dominante best practice). Frameworklandschap: **LangGraph** is de meest geadopteerde orkestratielaag (~47M downloads/maand, expliciete state-grafen, sterk voor productiecontrole); **Claude Agent SDK** hanteert een tool-use-first aanpak — bewust simpel, leunend op het model voor redeneren en plannen, sterk voor veiligheid-kritische toepassingen; **CrewAI** scoort op toegankelijkheid. Belangrijke nuance: een groot deel van de automatisering hier vereist géén agent — deterministische triggers en gates volstaan; de agent voegt waarde toe bij de *beoordelende* stappen (metrics interpreteren, annotaties QA'en, beslissen of een trainingsrun afwijkend is).
_Confidence: gemiddeld-hoog (frameworkvergelijkingen deels opiniërend)_
_Bronnen: [ActiveWizards: Agentic MLOps](https://activewizards.com/blog/the-autonomous-mlops-engineer-automating-the-ml-lifecycle/), [QubitTool: AI Agent Framework Showdown 2026](https://qubittool.com/blog/ai-agent-framework-comparison-2026), [Claude API Docs: Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview)_

### Kwaliteitsgates & automatische modelpromotie

Het volwassen patroon voor veilige automatische promotie: **gated offline validatie** (challenger moet champion met drempel X verslaan op holdout-set) → **shadow deployment** (challenger draait parallel op productieverkeer, voorspellingen gelogd maar niet geserveerd) → **gecontroleerde canary rollout** → volledige promotie via alias-update. Strikte approval-workflows en audit trails governen wie challengers mag promoten. Voor een interne applicatie kan dit vereenvoudigd worden tot offline gate + handmatige goedkeuringsknop + automatische rollback.
_Confidence: hoog_
_Bronnen: [DataRobot: Champion/Challenger Models](https://www.datarobot.com/blog/introducing-mlops-champion-challenger-models/), [Snowflake: Automated Model Retraining & Deployment](https://www.snowflake.com/en/developers/guides/ml-champion-challenger-model-deployment/), [Medium: Deployment Evaluation Strategies in MLOps](https://medium.com/@fraidoonomarzai99/deployment-evaluation-strategies-in-mlops-c208585aa3bd)_

### Adoptietrends relevant voor dit vraagstuk

- Verschuiving van "retraining als project" naar "retraining als routine" met CI-gates en lineage als voorwaarde
- Zero-shot VLM's beginnen in sommige use-cases YOLO-hertraining volledig te vervangen — voor hoogvolume logo-detectie blijft een gedistilleerd klein model echter sneller/goedkoper ([Dev|Journal: Zero-Shot Object Detection vs YOLO retraining](https://earezki.com/ai-news/2026-05-22-stop-retraining-yolo-a-developers-guide-to-zero-shot-object-detection-with-generative-vlms/))
- Human-in-the-loop wordt als operator/gate ingebouwd in orkestrators zelf (Airflow 3.1 HITL-operators)
_Confidence: gemiddeld (trends, geen harde data)_

## Codebase-analyse: huidige trainingsflow

_Bron: code-analyse van de repo (Explore agent, 2026-06-03). Alle claims met bestandspad._

### Architectuur

```
React web (apps/web) → Fastify API (apps/api) → FastAPI ML-service (apps/ml-service)
                         PostgreSQL (Prisma + pgvector) · MinIO (images/modellen) · Redis · Socket.IO
```

Training: PyTorch **classificatie**-pipeline (EfficientNet-B0, fallback ResNet-50, 224×224) → ONNX-export → MinIO + `model_versions` registratie → hot-reload activatie. Kerncode: `apps/ml-service/app/services/trainer.py` (volledige loop, regels 147-406), `apps/api/src/api/v1/training.ts:36-322`.

**Opvallend:** annotaties zijn bounding boxes (Konva canvas, `Annotation`-tabel), maar de training is beeldclassificatie — geen objectdetectie zoals YOLO. De webresearch over detectie-pipelines blijft van toepassing op proces-niveau (active learning, gates), maar model-specifieke adviezen moeten hierop aangepast.

### Handmatige stappen (11 menselijke interventiepunten)

1. Dataset samenstellen (upload + selectie)
2. Annotaties tekenen (canvas)
3. Annotaties valideren
4. Trainingsparameters kiezen
5. Training starten (knop)
6. Progress monitoren
7. Metrics beoordelen
8. Model selecteren
9. Model activeren (knop)
10. Feedback incorporeren (handmatige POST `/feedback/incorporate`)
11. Rollback-beslissing (handmatig heractiveren vorige versie)

### Epic 6 werkelijke status (claim "done" vs realiteit)

| Story | Claim | Realiteit |
|-------|-------|-----------|
| 6.1 Feedback loop | done | ✅ Werkend (`feedback.ts:74-152`, `FeedbackEntry` in Prisma) |
| 6.2 Uncertainty sampling | done | ✅ Werkend (`GET /feedback/uncertain`, `feedback.ts:298-382`) |
| 6.3 Auto-retraining triggers | done | ⚠️ Logica bestaat (`checkRetrainingConditions()`, `feedback.ts:709-748`) maar **geen scheduler/cron** — vereist handmatige POST |
| 6.4 Incrementele updates | done | ❌ **Niet geïmplementeerd** (geen layer-freezing/fine-tune code gevonden) |
| 6.5 Model comparison | done | ✅ Werkend (`GET /feedback/model-comparison`, `feedback.ts:641-702`) |
| 6.6 Auto-rollback | done | ⚠️ Activatie werkt; **geen accuracy-monitoring loop, geen auto-rollback** |

### Infrastructurele bevindingen

- **Geen job queue**: BullMQ staat in de architectuurdocs maar is nergens geïmplementeerd. Training draait als `asyncio.create_task()` in-memory in de ML-service — crasht de service, dan is de job weg en niet hervatbaar.
- Hardcoded triggers: `MIN_FEEDBACK_COUNT: 100`, `MIN_UNINCORPORATED_RATIO: 0.1`, `LOW_ACCURACY_THRESHOLD: 0.85` (`feedback.ts:56-60`)
- ML-service: CPU-mode (`CUDA_VISIBLE_DEVICES=""`), Docker compose, model-persistence via volume
- WebSocket-updates per epoch werken (`socket-io-manager.ts`)

### Conclusie codebase

Pipeline ±75-80% compleet. De *uitvoering* van training is al volledig geautomatiseerd; wat ontbreekt is de **beslislaag eromheen**: wanneer trainen (geen scheduler), met welke data (feedback-incorporatie handmatig), is het resultaat goed genoeg (geen gate), en terugdraaien bij regressie (geen monitoring). Plus betrouwbaarheid: geen persistente job queue.

## Integration Patterns Analysis

### Scheduling: waar haakt de trigger-check aan?

Drie integratieopties voor het periodiek draaien van het bestaande `checkRetrainingConditions()` (`feedback.ts:709-748`):

1. **BullMQ repeatable jobs / Job Schedulers** *(aanbevolen patroon)* — Redis draait al in de stack. Jobs persisteren in Redis en overleven herstarts; ingebouwde retries; één scheduler ongeacht aantal API-processen. Lost meteen het bredere betrouwbaarheidsprobleem op (training als persistente job i.p.v. in-memory asyncio-task).
2. **node-cron in de Fastify API** — simpelste integratie (één dependency, geen infra), maar: geen persistentie (gemiste runs bij restart/crash) en bij meerdere processen draait elke instantie de cron.
3. **APScheduler in de FastAPI ML-service** — kan, maar let op de bekende valkuil: bij multi-worker uvicorn/gunicorn ontstaan N schedulers; jobstore-persistentie vereist extra SQLAlchemy-configuratie. De beslislogica leeft bovendien in de Node-API, dus dit zou de logica versnipperen.

_Confidence: hoog_
_Bronnen: [Better Stack: BullMQ scheduled tasks](https://betterstack.com/community/guides/scaling-nodejs/bullmq-scheduled-tasks/), [BullMQ docs: Repeatable](https://docs.bullmq.io/guide/jobs/repeatable), [Better Stack: Node.js schedulers vergeleken](https://betterstack.com/community/guides/scaling-nodejs/best-nodejs-schedulers/), [Medium: FastAPI BackgroundTasks vs APScheduler vs Celery](https://medium.com/@rasifrazak123/fastapi-scheduling-background-tasks-backgroundtasks-vs-apscheduler-vs-celery-complete-guide-ff90d6be524b), [Sentry: Schedule tasks with FastAPI](https://sentry.io/answers/schedule-tasks-with-fastapi/)_

### Event-driven flow: training-completion als event

Het volwassen patroon (MLflow registry webhooks, SageMaker event-pipelines): **modelregistratie is een event** dat downstream werk triggert — evaluatie, vergelijking met champion, notificatie. Vertaald naar deze codebase: de ML-service roept bij completion nu alleen `db_service.update_training_job()` aan; een webhook/callback naar de Fastify-API (of een BullMQ-event) kan daar een **evaluatie-job** aan vastknopen: challenger-metrics vs. actieve model → resultaat klaarzetten voor goedkeuring. De bestaande Socket.IO-manager (`socket-io-manager.ts`) is het kanaal om de gebruiker te notificeren ("nieuw model klaar voor review, +2,3% accuracy").
_Confidence: hoog (patroon), gemiddeld (exacte inpassing — afhankelijk van hoe completion nu precies landt)_
_Bronnen: [Databricks: MLflow Registry Webhooks](https://www.databricks.com/blog/2022/02/01/streamline-mlops-with-mlflow-model-registry-webhooks.html), [Medium: Event-Driven ML Pipelines op AWS](https://medium.com/@gmarun2000/building-event-driven-ml-pipelines-on-aws-from-data-ingestion-to-production-deployment-d86c57f367c3), [Medium: Event-Driven Architecture for ML Model Automation](https://medium.com/@ibhajandeep.singh/event-driven-architecture-for-ml-model-automation-f7325649221e)_

### Feedback-incorporatie: van handmatige POST naar pipeline-stap

`POST /feedback/incorporate` bestaat al — integratiepatroon: maak dit een stap in de geautomatiseerde flow (trigger-check → incorporate → batch samenstellen → training starten), uitgevoerd als BullMQ FlowProducer-graf (children → parent), zodat elke stap afzonderlijk retryable en zichtbaar is.
_Confidence: hoog_
_Bron: [BullMQ docs](https://docs.bullmq.io/)_

### AI-agent integratie: tool-use tegen de bestaande REST API

De **Claude Agent SDK** (Python/TypeScript) draait headless (CI, cron, server) en verbindt met externe systemen via **MCP of custom tools** — de bestaande REST-endpoints (`/feedback/uncertain`, `/feedback/model-comparison`, `/training/start`, `/models/:id/activate`) zijn direct als tools te ontsluiten. Productie-aandachtspunten uit de bronnen: (1) duurzame state in Postgres/Redis — de SDK-sessie is efemeer; (2) per 15 juni 2026 valt Agent SDK-gebruik op abonnementen onder een apart maandelijks credit en zijn oude model-ID's (Sonnet 4/Opus 4) uitgefaseerd — pin actuele model-ID's; (3) de agent hoort *beoordelend* werk te doen (metrics interpreteren, afwijkingen signaleren, samenvatten voor de mens), niet het deterministische sequencen — dat doet de queue.
_Confidence: hoog (SDK-capaciteiten, officiële docs), gemiddeld (billing-details)_
_Bronnen: [Claude Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview), [Claude API Docs: Hosting the Agent SDK](https://platform.claude.com/docs/en/agent-sdk/hosting), [Digital Applied: Agent SDK Production Patterns 2026](https://www.digitalapplied.com/blog/claude-agent-sdk-production-patterns-guide)_

### Interoperabiliteit & beveiliging

- Bestaande auth (xxtractdb03 MySQL-login) geldt voor de web-UI; geautomatiseerde callers (scheduler, agent) hebben een **service-account/API-key-pad** nodig op de trigger- en activatie-endpoints
- Activatie-endpoint is het gevoeligste integratiepunt: hier hoort de human-approval gate (en audit-logging van wie/wat activeerde)
- Socket.IO blijft het notificatiekanaal richting UI; e-mail/Slack-notificatie is een kleine uitbreiding op dezelfde events
_Confidence: hoog (volgt direct uit codebase-analyse + standaard practice)_

## Architectural Patterns and Design

### Positionering: MLOps maturity model

Google's referentiemodel onderscheidt **Level 0** (volledig handmatig proces), **Level 1** (geautomatiseerde trainingspipeline = *continuous training*, met automatische data-/modelvalidatie, pipeline-triggers en metadata-management) en **Level 2** (volledige CI/CD voor de pipeline zelf). logoRecognition zit feitelijk op **Level 0,5**: de trainings*uitvoering* is geautomatiseerd, maar elke *beslissing* (wanneer, met wat, goed genoeg?, activeren) is handmatig. Het realistische doel is **Level 1**; Level 2 is voor één intern model met één team overengineering.
_Confidence: hoog_
_Bronnen: [Google Cloud: MLOps continuous delivery and automation pipelines](https://docs.cloud.google.com/architecture/mlops-continuous-delivery-and-automation-pipelines-in-machine-learning), [ml-ops.org: MLOps Principles](https://ml-ops.org/content/mlops-principles), [Microsoft: MLOps Maturity Model](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/mlops-maturity-model)_

### Ontwerpprincipe: right-sizing voor een klein team

De pragmatische literatuur is eenduidig: *version everything, automate everything, test everything, make rollback trivial* — maar kies saaie, bewezen technologie die al in de stack zit boven nieuwe platforms. Voor een klein team is een homegrown aanpak op bestaande infrastructuur (Redis/Postgres/MinIO) expliciet de aanbevolen route boven het introduceren van een MLOps-platform.
_Confidence: hoog_
_Bronnen: [DEV: MLOps Best Practices Teams Actually Use](https://dev.to/apprecode/mlops-best-practices-10-practical-practices-teams-actually-use-h77), [lakeFS: MLOps Architecture](https://lakefs.io/mlops/mlops-architecture/), [Medium: Architecture & Design Principles for MLOps](https://medium.com/@andrewpmcmahon629/some-architecture-design-principles-for-mlops-llmops-a505628a903e)_

### Drie architectuurvarianten

#### Variant A — Minimaal: scheduler + gate (Level 0,8)

Sluit alleen de bestaande gaten aan, geen nieuwe componenten:
- BullMQ repeatable job (of desnoods node-cron) draait dagelijks `checkRetrainingConditions()`
- Bij trigger: automatisch `POST /feedback/incorporate` → batch → `POST /training/start`
- Na completion: automatische metrics-vergelijking (endpoint 6.5 bestaat al) → Socket.IO-notificatie
- Mens beoordeelt en klikt "Activeren" (bestaande UI)

*Trade-off:* dagen werk, geen nieuwe infra; maar training blijft niet-persistent (crash = job kwijt) en er is geen kwaliteitsgate of auto-rollback.

#### Variant B — Queue-centrische continuous training (Level 1) ⭐ aanbevolen kern

BullMQ als ruggengraat van een event-driven pipeline (FlowProducer-graf):

```
[repeatable: trigger-check] → [incorporate feedback] → [build batch]
   → [train (Python worker, persistent job)] → [evaluate vs champion op vaste holdout]
   → gate gehaald? → [klaarzetten voor goedkeuring + notificatie] → mens activeert
   → [post-activatie monitor: realworld-accuracy per uur] → auto-rollback bij >10% drop
```

- Elke stap retryable, persistent, zichtbaar; training overleeft een service-crash
- Champion/challenger-gate offline (drempel: challenger ≥ champion op holdout); shadow-evaluatie kan later
- Voltooit feitelijk de Epic 6-stories 6.3 en 6.6 zoals oorspronkelijk gespecificeerd

*Trade-off:* ~1-2 weken werk; vereist een vaste holdout-set (zie data-architectuur) en een Python BullMQ-worker in de ML-service.

#### Variant C — Agent-versterkt (B + AI-agents voor beoordelend werk)

Voegt aan Variant B een Claude Agent SDK-laag toe voor de stappen die *oordeel* vragen:
- **Annotatie-QA-agent**: pre-labelt nieuwe uploads (bestaande smart-detection + evt. zero-shot model), QA't twijfelgevallen, zet alleen onzekere annotaties in de menselijke review-queue
- **Trainingsrun-analist**: interpreteert metrics/curves na elke run, signaleert anomalieën (overfitting, class imbalance, dataset-drift), schrijft een leesbare aanbeveling bij de goedkeuringsnotificatie
- **Wekelijkse rapportage-agent**: vat modelprestaties, feedback-trends en datasetgroei samen

Best practice blijft: agent beslist *niet* over productie-activatie — dat is en blijft de menselijke gate.

*Trade-off:* hoogste waarde bij veel feedback-volume; API-kosten en extra beweging delen; pas zinvol als B staat.

_Confidence varianten: hoog (gebaseerd op codebase-feiten + geverifieerde patronen)_
_Bronnen: [ActiveWizards: Agentic MLOps](https://activewizards.com/blog/the-autonomous-mlops-engineer-automating-the-ml-lifecycle/), [Dataloop: Active Learning Pipeline](https://docs.dataloop.ai/docs/active-learning-pipeline), [Toloka: HITL — when, where, how much](https://toloka.ai/blog/hitl-machine-learning/)_

### Data-architectuur: de ontbrekende hoeksteen

Kritieke bevinding uit de codebase: `trainer.py` doet per run een **random 80/20-split** — er is géén vaste, menselijk geverifieerde holdout-set. Elke automatische kwaliteitsgate is betekenisloos zonder stabiel meetpunt: champion en challenger moeten op *dezelfde* data vergeleken worden. Vereiste aanpassing: een `holdout`-vlag op `TrainingData` (of aparte tabel), uitgesloten van training en augmentatie, alleen gebruikt voor evaluatie. Dit is de eerste bouwsteen, vóór welke automatiseringsvariant dan ook.
_Confidence: hoog (best practice unaniem in bronnen; codebase-feit geverifieerd)_
_Bron: [SO Development: holdout als single source of truth](https://so-development.org/fine-tuning-yolo-models-with-an-automated-data-labeling-pipeline/)_

### Security & operations

- Service-account/API-key voor de scheduler en agents; activatie-endpoint alleen via menselijke sessie óf expliciet ge-audit service-pad
- Audit-trail op promotie/rollback (wie/wat/waarom) — sluit aan op governance-best-practice
- Deployment: alles draait in de bestaande Docker compose/Coolify-setup; de Python BullMQ-worker is een extra proces in de ML-service-container of een sidecar
_Confidence: hoog_
_Bron: [DataRobot: Champion/Challenger governance](https://www.datarobot.com/blog/introducing-mlops-champion-challenger-models/)_

## Implementation Approaches and Technology Adoption

### Feasibility-correctie: BullMQ Python-client nog niet productierijp

De officiële BullMQ-documentatie stelt expliciet dat het Python-package *"still in early development"* is en *"not recommended for production deployment just yet"* — niet alle Node-features zijn beschikbaar (huidige versie 2.16.1; dezelfde Lua-scripts als Node, dus de basis is solide, maar het oordeel van de maintainers telt). **Consequentie voor Variant B:** houd de queue volledig aan de **Node-kant** (mature client). De Node-worker orkestreert en roept de ML-service via de bestaande REST-endpoints aan (`POST /ml/train`); completion komt terug via webhook/polling op de bestaande job-status. De ML-service hoeft dus níét te wijzigen naar een queue-consumer — minder werk én minder risico.
_Confidence: hoog (officiële docs; wel checken op actualiteit bij implementatie — de waarschuwing kan inmiddels verouderd zijn)_
_Bronnen: [BullMQ Python Introduction](https://docs.bullmq.io/python/introduction), [PyPI: bullmq](https://pypi.org/project/bullmq/), [BullMQ: Going to production](https://docs.bullmq.io/guide/going-to-production)_

### Adoptiestrategie: gefaseerde vertrouwensopbouw

Het onderzoeksveld rond trust-calibration is eenduidig: begin met **read-only aanbevelingen** en geef het systeem pas gebonden autonomie naarmate de beslisnauwkeurigheid gevalideerd is, met elke fase minimaal ~2 weken. Vertaald naar dit project:

- **Fase 1 — Adviseren:** scheduler draait, systeem *meldt alleen* "retraining aanbevolen want X" (Socket.IO/e-mail). Mens doet alles nog zelf. → bouwt vertrouwen in de trigger-logica
- **Fase 2 — Uitvoeren, mens keurt:** systeem incorporeert feedback, traint en evalueert automatisch; mens beoordeelt het evaluatierapport en activeert. → de kern-automatisering
- **Fase 3 — Bewaken:** post-activatie accuracy-monitoring + auto-rollback. Eventueel: auto-activatie voor challengers die de gate ruim halen, met meldplicht achteraf
- **Fase 4 (optioneel) — Agent-versterking:** Claude-agents voor annotatie-QA en metrics-interpretatie zodra de pipeline bewezen stabiel is

Gefaseerde uitrol levert aantoonbaar hogere gebruikerstevredenheid en geeft per fase een natuurlijk go/no-go-moment.
_Confidence: hoog (patroon), gemiddeld (exacte fasering is maatwerk)_
_Bronnen: [PMC: AI-augmented reliability in CI/CD — phased trust rollout](https://pmc.ncbi.nlm.nih.gov/articles/PMC13079289/), [PMC: Calibrating workers' trust in intelligent automated systems](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11573890/)_

### Testen van de geautomatiseerde pipeline

Best practices uit productie-teams: het doel van pipeline-tests is **niet bewijzen dat het model goed is, maar dat de pipeline draait** en input/output-contracten respecteert. Concreet:
- **Smoke test in CI**: volledige pipeline (incorporate → batch → train → evaluate → registreer) op een mini-dataset (tientallen images, 2-3 epochs) — seconden/minuten, vangt schema-breuken en preprocessing-bugs vóór een echte trainingsrun
- **Data-assertions** als pipeline-stap: minimale samples per klasse, geen lege annotaties, holdout niet gelekt naar training
- Mini-dataset in de repo zelf opslaan (klein genoeg) zodat CI deterministisch is
- De bestaande testinfrastructuur (Vitest/Playwright + in-memory storage adapter, april 2026) is hiervoor een goede basis
_Confidence: hoog_
_Bronnen: [MLOps Community: Smoke Testing for ML Pipelines](https://mlops.community/smoke-testing-for-ml-pipelines/), [Neptune.ai: How 4 Teams Test Their Models](https://neptune.ai/blog/ml-model-testing-teams-share-how-they-test-models), [Deepchecks: Testing ML Models in CI/CD](https://www.deepchecks.com/testing-machine-learning-models-in-your-ci-cd-pipeline/)_

### Team & vaardigheden

- Benodigde kennis is grotendeels aanwezig: Node/TypeScript (queue-worker, triggers), Python/PyTorch (holdout-evaluatie), Docker/Coolify (extra worker-proces)
- Nieuw te leren: BullMQ-concepten (queues, flows, repeatables) — beperkte leercurve, goede docs
- Voor Fase 4: Claude Agent SDK (TypeScript of Python) — sluit aan op bestaande Claude Code-ervaring in het team
_Confidence: hoog_

### Kosten & resources

- Fase 1-3: geen nieuwe infrakosten (Redis/Postgres/MinIO draaien al); alleen ontwikkeltijd (~enkele dagen Fase 1, ~1-2 weken Fase 2-3)
- Training blijft CPU-gebonden op de huidige server — automatisering verhoogt de trainingsfrequentie; bewaak CPU-budget en plan runs desnoods 's nachts (BullMQ repeatables ondersteunen cron-expressies)
- Fase 4: Claude API-kosten schalen met feedback-/annotatievolume; let op de Agent SDK-billingwijziging per 15 juni 2026
_Confidence: gemiddeld (volumes onbekend)_

## Technical Research Recommendations

### Implementatie-roadmap (aanbevolen)

| Fase | Inhoud | Inspanning | Resultaat |
|------|--------|-----------|-----------|
| **0. Fundament** | Vaste holdout-set (vlag op `TrainingData`, uitgesloten van training/augmentatie); evaluatie-stap in `trainer.py` op holdout | 2-3 dagen | Stabiel meetpunt voor alle gates |
| **1. Adviseren** | BullMQ + repeatable trigger-check job (Node); notificatie "retraining aanbevolen" via Socket.IO | 2-3 dagen | Epic 6.3 echt af |
| **2. Uitvoeren** | FlowProducer-pipeline: incorporate → batch → train (via REST naar ML-service) → evaluate vs champion → goedkeuringsnotificatie; training-state persistent in queue | 1-1,5 week | Continuous training met menselijke gate |
| **3. Bewaken** | Uurlijkse realworld-accuracy-monitor job; auto-rollback bij >10% drop; audit-logging op promotie/rollback | 3-5 dagen | Epic 6.6 echt af |
| **4. Agents** (optioneel) | Claude Agent SDK: annotatie-QA, trainingsrun-analyse, wekelijkse rapportage | 1-2 weken | Minder menselijk beoordelingswerk |

### Technology stack aanbevelingen

- **Queue/scheduler:** BullMQ (Node-kant), Redis bestaand — géén Airflow/Prefect/Dagster (overengineering voor één pipeline)
- **ML-service:** ongewijzigd REST; alleen holdout-evaluatie toevoegen; later evt. incrementele fine-tuning (Epic 6.4) als aparte verbetering
- **Agents:** Claude Agent SDK met actuele model-ID's; tools = bestaande REST-endpoints; duurzame state in Postgres
- **Pre-labeling (later):** Autodistill-patroon overwegen zodra annotatievolume de bottleneck wordt

### Succes-metrics / KPI's

1. **Doorlooptijd feedback → actief model** (nu: handmatig/onbepaald; doel: < 1 week automatisch)
2. **Menselijke handelingen per modelversie** (nu: ~11; doel Fase 3: 1 — de goedkeuringsklik)
3. **Realworld-accuracy actieve model** (uit bestaande feedback-data, endpoint 6.5)
4. **Pipeline-betrouwbaarheid**: % runs zonder handmatige interventie; 0 verloren jobs na crash
5. **Annotatie-efficiëntie** (Fase 4): reviewtijd per image met vs. zonder pre-labeling

---

# Research Synthesis: Van handmatig trainen naar continuous training

## Executive Summary

logoRecognition heeft een paradoxale uitgangspositie: het *moeilijke* deel van modeltraining — de PyTorch-pipeline, ONNX-export, versioning, hot-reload activatie — is al volledig geautomatiseerd, terwijl het *automatiseerbare* deel — beslissen wanneer te trainen, met welke data, en of het resultaat goed genoeg is — volledig handmatig is gebleven. Elf menselijke interventiepunten per modelversie. Epic 6 ("Self-Learning System") staat op done in de sprint-administratie, maar de code vertelt een ander verhaal: de retraining-trigger-logica bestaat maar wordt door niets aangeroepen, auto-rollback mist zijn monitoring-loop, en incrementele updates zijn nooit gebouwd.

Het goede nieuws: de afstand naar echte continuous training (MLOps Level 1) is klein en vereist géén nieuwe platforms. Redis draait al; BullMQ erop levert persistente, retryable job-grafen die de bestaande REST-endpoints orkestreren. De cruciale ontbrekende bouwsteen is onverwacht fundamenteel: een **vaste holdout-set**. De trainer doet per run een random 80/20-split, waardoor er geen stabiel meetpunt bestaat om een nieuw model objectief tegen het actieve model af te wegen — en zonder dat is elke automatische kwaliteitsgate betekenisloos.

AI-agents hebben in dit verhaal een specifieke, afgebakende rol. De deterministische flow (triggeren, trainen, evalueren, terugrollen) hoort bij de queue; de *beoordelende* stappen (annotatie-QA, metrics-interpretatie, anomalie-signalering, rapportage) zijn waar een Claude-agent waarde toevoegt. De best practice uit alle bronnen is eenduidig: de agent adviseert, de mens activeert.

**Belangrijkste technische bevindingen:**

- Trainingspipeline ±75-80% compleet; het gat is de beslislaag, niet de uitvoering (codebase-analyse, bestandsverwijzingen in hoofdstuk Codebase-analyse)
- Geen vaste holdout-set — random split per run maakt modelvergelijking onbetrouwbaar (`trainer.py`)
- Training draait als in-memory asyncio-task: crash = job verloren, niet hervatbaar
- BullMQ Python-client nog niet productierijp → queue aan de Node-kant, ML-service blijft REST
- Het model is een classificatie-CNN (EfficientNet-B0), geen detectiemodel — bepaalt welke automatiseringstechnieken passen

**Strategische aanbevelingen (top 5):**

1. **Fase 0 eerst:** vaste holdout-set (2-3 dagen) — fundament voor alles
2. **Variant B als doelarchitectuur:** BullMQ-pipeline met champion/challenger-gate en menselijke goedkeuring (~2-3 weken totaal, Fase 1-3)
3. **Gefaseerde vertrouwensopbouw:** eerst alleen adviseren, dan uitvoeren-met-goedkeuring, dan bewaken met auto-rollback
4. **Agents pas in Fase 4**, voor beoordelend werk — niet voor orkestratie
5. **KPI:** van ~11 menselijke handelingen per modelversie naar 1 (de goedkeuringsklik); doorlooptijd feedback → actief model < 1 week

## Inhoudsopgave van dit rapport

1. **Technical Research Scope Confirmation** — vraagstelling en methodiek
2. **Technology Stack Analysis** — orkestratie, queues, auto-labeling, agent-frameworks, kwaliteitsgates (webresearch)
3. **Codebase-analyse** — feitelijke trainingsflow, 11 handmatige stappen, Epic 6 claim vs realiteit, infra-bevindingen
4. **Integration Patterns Analysis** — scheduling-opties, event-driven completion, feedback-incorporatie, agent-integratie, security
5. **Architectural Patterns and Design** — MLOps-maturity-positionering, drie varianten (A/B/C), data-architectuur, operations
6. **Implementation Approaches** — BullMQ-Python-correctie, gefaseerde adoptie, pipeline-testing, team & kosten
7. **Technical Research Recommendations** — roadmap, stack-keuzes, KPI's
8. **Research Synthesis** — dit hoofdstuk

## Risico-assessment

| Risico | Kans | Impact | Mitigatie |
|--------|------|--------|-----------|
| Automatisch getraind model degradeert stilletjes | Middel | Hoog | Vaste holdout-gate + post-activatie monitoring + auto-rollback (Fase 3) |
| Trainingsfrequentie overbelast CPU-server | Middel | Middel | Cron-window 's nachts; queue-concurrency 1 voor training |
| BullMQ Python-client onvolwassen | Zeker (nu) | Laag | Queue uitsluitend aan Node-kant; ML-service blijft REST |
| Holdout-set raakt vervuild (lekt naar training) | Laag | Hoog | Data-assertion als pipeline-stap; holdout-vlag afdwingen in query's |
| Agent-kosten lopen op (Fase 4) | Laag | Laag | Agent alleen op beoordelmomenten, niet continu; billing-limieten |
| Vertrouwen team in automatisering te laag/te hoog | Middel | Middel | Gefaseerde uitrol met go/no-go per fase; transparante notificaties met redenen |

## Toekomstperspectief

- **Kort (3-6 mnd):** Fase 0-3 operationeel; retraining wordt routine i.p.v. project
- **Middellang (6-18 mnd):** agent-laag voor annotatie-QA zodra feedback-volume groeit; Autodistill-pre-labeling als annotatie de bottleneck wordt; incrementele fine-tuning (Epic 6.4) voor snelle updates
- **Lang (18+ mnd):** her-evalueer zero-shot VLM's — die beginnen in sommige use-cases hertraining volledig te vervangen, al blijft een klein gedistilleerd model voor hoogvolume goedkoper

## Bronverantwoording & methodiek

- **Codebase-claims:** geverifieerd door directe code-inspectie (Explore agent, 37 tool-calls), elk met bestandspad en regelnummers; status per Epic 6-story expliciet gelabeld (werkend / logica-zonder-scheduler / afwezig)
- **Webclaims:** 13 zoekrondes over 6 assen; per claim bron-URL en confidence-niveau in de betreffende secties; conflicterende of opiniërende bronnen als zodanig gemarkeerd
- **Beperkingen:** trainings-/feedbackvolumes onbekend (KPI-baselines nog te meten); BullMQ-Python-status kan inmiddels gewijzigd zijn (check bij implementatie); webbronnen over agent-frameworks deels leveranciersgekleurd

## Conclusie en volgende stappen

De vraag was: *hoe automatiseren we het trainen, eventueel met AI-agents?* Het antwoord uit dit onderzoek: **maak eerst de beslislaag af die Epic 6 beloofde** — op de stack die er al staat, in vier fasen, met de holdout-set als eerste bouwsteen en de mens als laatste gate. AI-agents zijn het sluitstuk (beoordelend werk), niet het startpunt.

**Concrete vervolgstappen:**
1. Beslis over de roadmap (Fase 0-3 als minimum, Fase 4 optioneel)
2. Vertaal de fasen naar epics/stories (bmad-create-epics-and-stories) — Fase 0-3 sluit naadloos aan op de bestaande Epic 6-stories
3. Meet de KPI-baselines (huidige doorlooptijd, handelingen per versie) vóór de bouw start

---

**Onderzoek afgerond:** 2026-06-03
**Bronverificatie:** alle claims voorzien van bron-URL of code-referentie
**Confidence:** hoog — codebase-feiten direct geverifieerd; externe patronen multi-source bevestigd

---

# Addendum: Geautomatiseerde data-acquisitie en annotatie (2026-06-03)

_Aanleiding: verdiepingsvraag van Friso — het oorspronkelijke rapport dekte vooral de trainings-loop (laag 3); de kernvraag omvat ook het automatisch **verkrijgen** (laag 1) en **annoteren** (laag 2) van trainingsafbeeldingen. Scope-verfijning: het gaat primair om **keurmerken/certificaten** (gestandaardiseerde beeldmerken); beeldbronnen: **XXtract productdata + web**._

## Waarom keurmerken dit probleem fundamenteel makkelijker maken

Keurmerken (Beter Leven, EU-Bio, Fairtrade, …) zijn — anders dan merklogo's — **vormvast en publiek gedocumenteerd**. Dat ontsluit twee automatiseringsroutes die voor vrije logo's niet of nauwelijks werken:

### Route 1 — Synthetische datageneratie: annotatie wordt overbodig

Academisch en industrieel bewezen techniek (o.a. Adobe's logo-detectie-pipeline, 173k afbeeldingen / 173 klassen volledig automatisch geannoteerd): neem officiële referentie-afbeeldingen van elk keurmerk, pas random transformaties toe (warp, kleur, blur, schaal) en composit ze op achtergrond-/productafbeeldingen. **De labels zijn gratis en perfect — je weet immers wat je waar geplakt hebt.** Voor jullie classificatiemodel is dit nóg eenvoudiger: gesynthetiseerde crops volstaan. De aanbevolen aanpak uit de literatuur is incrementeel: start met synthetische data, verfijn iteratief met echte afbeeldingen.
- Achtergronden: **packshots uit jullie eigen tradeItems-catalogus** — realistischer context bestaat niet voor deze use-case
- Referentie-keurmerken: officiële bronnen (certificeerders publiceren hun beeldmerken met gebruiksrichtlijnen)
_Confidence: hoog (peer-reviewed + Adobe-productie)_
_Bronnen: [Adobe Research: Scalable Data Augmentation and Training Pipeline for Logo Detection](https://research.adobe.com/publication/a-scalable-data-augmentation-and-training-pipeline-for-logo-detection/), [arXiv: Deep Learning Logo Detection with Data Expansion by Synthesising Context](https://arxiv.org/pdf/1612.09322), [ACM: On the Benefit of Synthetic Data for Company Logo Detection](https://dl.acm.org/doi/10.1145/2733373.2806407)_

### Route 2 — Weak supervision uit jullie eigen GS1-data

GDSN kent het attribuut **`packagingMarkedLabelAccreditationCode`** (T3777): een codelijst die per trade item vastlegt wélke keurmerken op de verpakking staan (bijv. `FAIR_TRADE_MARK`, `EU_ORGANIC_FARMING`). XXtract's tradeItems-collectie (MongoDB `application.tradeItems`) bevat GDSN-data — **jullie zitten dus al op een zelf-annoterende dataset**: productafbeelding + attribuut "bevat EU-Bio-logo" = een zwak gelabeld trainingsvoorbeeld, zonder dat iemand iets hoeft aan te klikken. GS1-regels versterken dit: het toevoegen/verwijderen van een keurmerk vereist een nieuwe GTIN, dus de koppeling afbeelding↔keurmerk is relatief betrouwbaar.
- Verificatiestap nodig: niet elke packshot toont de keurmerk-zijde van de verpakking → pre-label-check met het bestaande model of embedding-similarity (pgvector-infrastructuur bestaat al, `logo_embeddings` vector(512))
- *Te verifiëren bij implementatie:* vullingsgraad van dit attribuut in jullie tradeItems-data (steekproef via mongodb-acc)
_Confidence: hoog (attribuut bestaat, officieel GS1); gemiddeld (datakwaliteit/vullingsgraad onbekend)_
_Bronnen: [GS1 Navigator: packagingMarkedLabelAccreditationCode](https://navigator.gs1.org/gdsn/attribute-details?parent=PackagingMarking&name=packagingMarkedLabelAccreditationCode), [GS1 Web Vocabulary: FAIR_TRADE_MARK](https://ref.gs1.org/voc/PackagingMarkedLabelAccreditationCode-FAIR_TRADE_MARK), [GS1 GTIN-regel: certification mark](https://www.gs1.org/1/gtinrules/en/rule/267/add-or-remove-certification-mark), [GS1 Italië: gids certificatiemerken in GDSN](https://gs1it.org/content/public/64/95/6495266f-e541-443f-9e6c-be473cc04544/eng_gs1_guida_marchi_e_loghi_di_certificazione_v11_2023.pdf)_

### Route 3 — Web-acquisitie via een AI-agent

Een Claude-agent die per keurmerk officiële bronnen afzoekt is vooral waardevol voor het **referentiebestand** (route 1) en het ontdekken van keurmerk-*varianten* (taalversies, mono/kleur). Voor bulk-trainingsdata is het web inferieur aan route 1+2 (licenties, ruis, lagere relevantie). Aanbeveling: agent als curator van de keurmerk-bibliotheek, niet als bulk-scraper.
_Confidence: gemiddeld-hoog_

## De agent-gedreven dataflow (antwoord op de kernvraag)

```
[Acquisitie-agent]                      [Deterministische pipeline]
 ├─ kuratiert keurmerk-bibliotheek       ├─ query tradeItems op T3777-attribuut
 │  (officiële PNG's + varianten)        ├─ haal packshots op (catalog API bestaat)
 │                                       ├─ synthese-job: composit keurmerken op packshots
 ▼                                       ▼
[Pre-label/verificatie]                 → gelabelde trainingsvoorbeelden
 ├─ embedding-similarity (pgvector ✓)
 ├─ bestaand model als pre-labeler
 ├─ hoge confidence → auto-accept
 └─ twijfel → bestaande uncertainty-queue (Epic 6.2 ✓) → mens reviewt alléén twijfelgevallen
                                         ▼
                              [Trainings-pipeline uit hoofdrapport]
                              (BullMQ-flow → train → gate → goedkeuring)
```

**De rolverdeling blijft zoals het hoofdrapport adviseert:** agents doen het cureren en beoordelen; de queue doet het deterministische werk; de mens reviewt alleen wat het systeem zelf onzeker vindt — en die review-UI (uncertainty sampling, annotatie-canvas) bestaat al.

## Aangepaste roadmap-aanvulling

| Fase | Toevoeging | Inspanning |
|------|-----------|-----------|
| **0+. Keurmerk-bibliotheek** | Referentie-PNG's per keurmerk + variant verzamelen (agent-geassisteerd) | 1-2 dagen |
| **1+. Weak-label import** | TradeItems-query (T3777) → packshot-import → pre-label met bestaand model → uncertainty-queue | 3-5 dagen |
| **2+. Synthese-pipeline** | Composit-job (keurmerk × packshot × transformaties) als BullMQ-stap vóór training | 3-5 dagen |
| **4+. Acquisitie-agent** | Claude-agent voor bibliotheek-curatie en variant-ontdekking | in Fase 4 |

Hiermee verdwijnt ook stap 1-2-3 van de elf handmatige handelingen (uploaden, annoteren, valideren) grotendeels — de mens reviewt alleen nog twijfelgevallen.

## Verdieping: etiket-artwork met meerdere logo's (scope-verfijning 2)

_Aanleiding: de afbeeldingen zijn **etiketbestanden (drukwerk-artwork)** — geen productfoto's. Ze bevatten veel meer dan één logo (tekst, barcodes, voedingswaardetabellen, merkgraphics) en vaak meerdere keurmerken tegelijk._

### Waarom dit de modelkeuze raakt

Het huidige model is een **whole-image classifier op 224×224** (`trainer.py`: Resize((224,224))). Voor etiket-artwork is dat dubbel ongeschikt:
1. Een hoogresolutie-etiket terugschalen naar 224×224 maakt keurmerken van enkele centimeters onleesbaar klein — het signaal verdwijnt letterlijk in de downscaling
2. Eén label per afbeelding kan "dit etiket bevat EU-Bio én Beter Leven én Fairtrade" niet uitdrukken

**Conclusie: er is een lokalisatiestap nodig** — eerst vinden wáár logo's staan, dan per gevonden regio classificeren wélk keurmerk het is. Het bestaande classificatiemodel blijft daarbij bruikbaar als tweede trap (crop-classifier).

### Drie technieken voor de lokalisatiestap (combineerbaar)

**a) Tiling/SAHI (Slicing Aided Hyper Inference)** — de standaardaanpak voor kleine objecten in grote afbeeldingen: snijd het artwork in overlappende tegels (bijv. 640×640), detecteer per tegel, voeg resultaten samen. Bewezen winst: +12-14% AP bij kleine objecten t.o.v. directe inference; generiek toepasbaar op elke detector.
_Bronnen: [arXiv: SAHI](https://arxiv.org/abs/2202.06934), [LearnOpenCV: SAHI uitgelegd](https://learnopencv.com/slicing-aided-hyper-inference/), [Encord: SAHI explained](https://encord.com/blog/slicing-aided-hyper-inference-explained/)_

**b) Template-/feature-matching** — het domeinvoordeel van artwork: anders dan foto's is drukwerk **vlak, onvervormd en exact** — het keurmerk in het bestand is een (vrijwel) pixel-perfecte rendering van het officiële beeldmerk, alleen geschaald/geroteerd. Multi-scale template matching of embedding-similarity per kandidaat-regio (pgvector ✓) is hier ongewoon betrouwbaar, deterministisch én uitlegbaar — logo-detectie-patenten gebruiken exact dit (edge matching, template matching met kleurdetectie). Goedkoop als eerste filter.
_Bronnen: [USPTO: Logo detection by edge matching](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/9536171), [USPTO: Logo detection method](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10936911)_

**c) Klein detectiemodel op synthetische data** — train een lichte detector (YOLO-klasse) op composits van keurmerken-op-etiket-achtergronden. Het synthese-domein = het productiedomein (beide vlak drukwerk), dus de synthetic-to-real gap is hier minimaal — gunstiger dan bij foto's. Bounding boxes zijn gratis (je weet wat je waar plakte).

**Bonus voor vector-PDF's:** keurmerken zitten in artwork soms als ingesloten vectorobject — directe extractie uit de PDF-structuur kan detectie in die gevallen zelfs overslaan. _(Te verifiëren op een steekproef van jullie etiketbestanden.)_

### De multi-logo dataflow

```
Etiketbestand (PDF/hi-res) → rasterize → SAHI-tegels
  → lokalisatie (template-match en/of detector) → kandidaat-regio's
  → crop-classificatie (bestaand model / embeddings) → set gevonden keurmerken
  → KRUISCHECK met GS1 T3777 (verwachte set keurmerken voor dit item)
       ├─ match → auto-accept als trainingsdata (boxes + labels gratis)
       ├─ verwacht maar niet gevonden → review-queue
       └─ gevonden maar niet verwacht → review-queue
```

De GS1-kruischeck maakt het systeem **zelf-corrigerend**: de verwachte set keurmerken per GTIN fungeert als onafhankelijke waarheid naast de visuele detectie. Discrepanties zijn precies de waardevolle twijfelgevallen voor de bestaande uncertainty-queue.

### Strategische observatie (business-kans)

Dezelfde kruischeck — *"komen de logo's op het etiket overeen met wat de GS1-data claimt?"* — is behalve een trainingsdata-generator ook een **artwork-QA-product**: automatische signalering van etiketten waar een gedeclareerd keurmerk ontbreekt of een niet-gedeclareerd keurmerk opstaat. Mogelijk meer directe klantwaarde dan de logo-herkenning zelf; verdient een eigen product-gesprek.

### Roadmap-impact

| Aanpassing | Detail |
|-----------|--------|
| Fase 0+ wordt **Fase 0a** | Naast holdout-set: beslissing lokalisatie-aanpak (start: template-matching als baseline, +SAHI-detector als die tekortschiet) |
| Fase 1+ (weak-label import) | Wordt: etiket → lokalisatie → kruischeck T3777 → auto-geaccepteerde crops als trainingsdata |
| Trainingsdoel | Crop-classifier (bestaand model, ongewijzigd concept) + apart lokalisatiemodel indien route c gekozen |
| Epic 6.4 (incrementeel) | Relevanter: nieuwe keurmerk-klassen toevoegen aan de crop-classifier is een klein, snel fine-tune-scenario |

### FAQ: hoe lokaliseert het systeem logo's zónder getraind model? (kip-en-ei)

Schijnbare tegenstelling — de bootstrap vereist geen eigen training:
1. **Template-matching is geen ML**: de officiële keurmerk-referenties zelf zijn de kennis; multi-scale correlatie/edge-matching werkt dag 1, en juist op vlak artwork zeer betrouwbaar
2. **Synthetische data keert de volgorde om**: labels ontstaan bij het genereren (je weet wat je waar plakt) — trainingsdata bestaat vóór het model, zonder enige annotatie
3. **Foundation models zijn al getraind**: zero-shot regio-detectie (Grounding DINO) en voorgetrainde embeddings (pgvector ✓) werken zonder jullie data ooit gezien te hebben

Vliegwiel: template-match + GS1-kruischeck → eerste auto-labels → synthetisch getrainde detector → pre-labelt echte etiketten → kruischeck vangt fouten → correcties voeden de volgende trainingsronde. Elk rondje: beter model, minder menselijke review. (= het Adobe-patroon: start synthetisch, verfijn iteratief met echte data.)

## Steekproef productiedata (2026-06-03)

_Bron: MongoDB prod, `application.tradeItems` (157.593 documenten) + `application.logo_detection`. Methode: server-side sampling ($sample 300-1000) met regex-extractie op de geneste formulierstructuur; extrapolaties indicatief._

### Bevinding 1: er bestaat al een logo-detectie-pilot in productie 🔎

Collectie `application.logo_detection`: **777 documenten, ~3.460 detecties, 49 keurmerk-klassen** — met bounding boxes, confidence-scores (gem. 0,72-0,95), uitgeknipte crops (`/var/www/html/ai_logos/croppedOut/…`) en mapping naar GDSN-attributen (`packagingMarkedLabelAccreditationCode`). Top-klassen: RECYCLABLE_GENERAL_CLAIM (946), GREEN_DOT (821), EUROPEAN_V_LABEL_VEGETARIAN (290), FSC_MIX (163), V-LABEL_VEGAN (161), RAINFOREST_ALLIANCE (153). Dit is exact de architectuur uit dit rapport — er ligt dus al een fundament (detectieklassen, crop-pipeline, GDSN-koppeling) waarvan de status/herkomst uitgezocht moet worden.

### Bevinding 2: T3777-vullingsgraad ~19-21%

| Metriek | Steekproef | Extrapolatie (157.593) |
|---------|-----------|------------------------|
| ≥1 keurmerk gedeclareerd (T3777) | 19-21% | **~30.000-33.000 items** |
| ≥1 afbeeldingslink (GDSN referenced file) | 27% | ~43.000 items |
| Keurmerk én afbeelding | 13,8% | **~21.700 items** |
| Keurmerk én PRODUCT_LABEL_IMAGE (etiket in GDSN) | 1,5% | ~2.400 items |

Gedeclareerde waarden matchen de detectieklassen (GREEN_DOT, TRIMAN, FSC, EU_ORGANIC_FARMING, BETER_LEVEN_1_STER, FAIRTRADE_COCOA, …) — de kruischeck detectie↔declaratie is dus direct mogelijk.

### Bevinding 3: etiketbestanden zitten waarschijnlijk níét primair in GDSN

PRODUCT_LABEL_IMAGE komt in GDSN-referenced-files maar bij ~1,5-2,3% voor. De formulier-metadata (`"Dienst": "etiketcontrole"`) en de crop-paden in `logo_detection` wijzen op een **aparte etiketcontrole-dienst met eigen bestandsopslag** (`file_id`-verwijzingen). → *Actiepunt: vaststellen waar de etiket-artwork fysiek staat en hoe groot die voorraad is — dat is vermoedelijk de echte beeldbron, vele malen groter dan de GDSN-links.*

### Conclusie steekproef

Route 2 (weak supervision uit GS1-data) is **levensvatbaar op schaal**: ~30k items met gedeclareerde keurmerken, waarvan ~22k met afbeelding. Er ligt bovendien een bestaande detectie-pilot met 49 klassen die als vliegwiel-start kan dienen (3.460 voorgelabelde crops!). Belangrijkste open vraag is niet de data maar de **vindplaats van de etiket-artwork-bestanden**.

### Bevinding 4: bestandsnamen zijn deterministisch en direct ontsluitbaar

- **GDSN-bronbestanden**: volledige URL's in tradeItems — `https://gdsnprodwebstorage.blob.core.windows.net/gdsnprodnlwebfileblob/{GLN}/{GTIN}/{TM}/Media/{fileId}/{GTIN}_{aanzichtcode}.{ext}` — GS1-naamconventie (C1N1=vooraanzicht, H1N1=hero, …), veelal **TIFF (drukwerk-kwaliteit, hoge resolutie)** — ideaal voor de tiling/detectie-aanpak
- **Pilot-crops**: `/var/www/html/ai_logos/croppedOut/{GTIN}_{GLN}_{fileId}_{volgnr}.jpg`; fileId matcht het Media-ID in de GDSN-URL → crops zijn terugkoppelbaar aan bron (behalve records met placeholder `file_id: "xxxx"`)
- **plus_images**: zelfde GS1-conventie (`{GTIN}_C1N1.tiff`)
- Hele keten sleutelbaar op **GLN-GTIN-targetMarket** = de `_id`-conventie van tradeItems → pipeline kan zonder mapping-tabel: URL opbouwen → downloaden → tilen → detecteren → kruischecken met T3777

### Bevinding 5: bestandsverwijzingen geverifieerd — echte, publiek toegankelijke hi-res bestanden

HEAD-verificatie (2026-06-03): GDSN-blob-URL's leveren zonder authenticatie HTTP 200 — o.a. `image/tiff` van 5,6 MB (last-modified 2 juni 2026: levende data) en `image/png` van 3,7 MB. Hostverdeling (steekproef 600): ~52% GDSN NL blob storage (TIFF 149, JPG 67, PNG 13), ~45% Unilever asset-CDN's (TIF/TIFF 196), ~3% overig (Brandbank, Atrify, GS1 BelLux). Implicatie voor de pipeline: download-stap is triviaal, maar **cache bestanden naar eigen opslag (MinIO)** — externe CDN-links kunnen rouleren of limiteren.

### Bevinding 6 (CORRECTIE op 4/5): de echte etiket-artwork zit in `xxtractdbmedia.media`, niet in GDSN

_Correctie na feedback Friso: de GDSN-referenced-files (Bevinding 4/5) zijn **packshots** — productfoto's, ongeschikt als logo-databron. De artwork-referenties staan in MySQL `xxtractdbmedia.media` (prod: production-database-nbg1-1); bestanden op te halen via het **mediaserver-endpoint** (container op prod; definitie in repo `projects/mediaserver`)._

Geverifieerd op prod-MySQL (2026-06-03):

| Metriek | Waarde |
|---------|--------|
| Totaal media-records | 44.080 |
| **typeInfo = PACKAGING_ARTWORK** | **39.042 records / 12.498 unieke GTINs** |
| Bestandstypen artwork | 30.150 .jpg · 8.035 .pdf · 672 .png · 175 .jpeg · 9 .tiff |
| Opslag | 100% `storageType=nas`, ontsloten via mediaserver-endpoint |
| Naamconventie | `{GTIN}_{orderNumber}_{volgnr}.{ext}` — meerdere bestanden/pagina's per product |
| Kolom `logo_ai` | aanwezig maar overal NULL bij artwork — de eerdere pilot heeft deze tabel (nog) niet gemarkeerd |
| **Overlap keurmerk-declaratie ↔ artwork** | steekproef 60 keurmerk-GTINs: **19 met artwork (~32%)** |

**Geëxtrapoleerd trainingspotentieel:** ~30k items met keurmerk-declaratie × ~32% artwork-dekking ≈ **~9.500-10.000 producten met én gedeclareerde keurmerken én etiket-artwork** — de directe weak-label-trainingsset. Let op: ~20% van de artwork is PDF (vector!) — daarvoor geldt de rasterize-stap én de mogelijke directe vector-extractie uit het addendum.

De Prisma-schema van de mediaserver (`src/prisma/schema.prisma:30-60`) bevat bovendien velden `ai`, `logo_ai` en `ocr` — er is dus al een datamodel-haakje voor AI-verwerking per mediabestand.

**Addendum afgerond:** 2026-06-03 (multi-logo artwork + bootstrap-FAQ + steekproef + bestandsconventies + URL-verificatie + correctie artwork-bron)
