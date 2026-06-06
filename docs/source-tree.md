# Source Tree - Logo Recognition System

> Complete source file mapping for AI-assisted development
> Generated: 2025-12-05

---

## Project Structure Overview

```
logoRecognition/
├── apps/                    # Application packages
│   ├── web/                 # React Frontend (Vite + Ant Design)
│   └── api/                 # Node.js API (Fastify + Prisma)
├── packages/                # Shared packages
│   ├── shared/              # Cross-cutting utilities & types
│   ├── ui/                  # Reusable React components
│   └── ml/                  # ML utilities (ONNX, TensorFlow)
├── infrastructure/          # Deployment configurations
│   ├── docker/              # Docker configs
│   ├── kubernetes/          # K8s manifests
│   └── monitoring/          # Prometheus, Grafana
├── tests/                   # Integration & E2E tests
├── scripts/                 # Build & deployment scripts
├── docs/                    # Project documentation
└── .github/                 # CI/CD workflows
```

---

## 1. Frontend Application (`apps/web`)

### Entry Points
| File | Purpose |
|------|---------|
| `src/main.tsx` | Application bootstrap |
| `src/App.tsx` | Root component with routing |

### Configuration Files
| File | Purpose |
|------|---------|
| `package.json` | Dependencies & scripts |
| `vite.config.ts` | Build configuration |
| `tsconfig.json` | TypeScript config |
| `tsconfig.node.json` | Node-specific TS config |
| `vitest.config.ts` | Test configuration |
| `tailwind.config.js` | Tailwind CSS config |
| `postcss.config.js` | PostCSS config |
| `.eslintrc.json` | ESLint rules |
| `.prettierrc.json` | Prettier config |

### Source Modules

#### Types (`src/types/`)
| File | Exports |
|------|---------|
| `index.ts` | Re-exports all types |
| `logo.types.ts` | BoundingBox, LogoDetection, RecognitionResult, RecognitionStatus, UploadProgress, UploadStatus, ImageMetadata, ExportFormat |
| `api.types.ts` | API request/response types |
| `websocket.types.ts` | WebSocket event types |
| `store.types.ts` | Store state types |
| `component.types.ts` | Component prop types |

#### State Management (`src/stores/`)
| File | Store | Key State |
|------|-------|-----------|
| `index.ts` | Re-exports all stores | - |
| `recognitionStore.ts` | Recognition | currentImage, results, isProcessing, progress, history |
| `uploadStore.ts` | Upload | files, uploadProgress, isUploading |
| `websocketStore.ts` | WebSocket | isConnected, messages, connectionStatus |
| `uiStore.ts` | UI | theme, language, sidebarOpen, modalStack, notifications |

#### Custom Hooks (`src/hooks/`)
| File | Hook | Purpose |
|------|------|---------|
| `index.ts` | Re-exports | - |
| `useWebSocket.ts` | useWebSocket | Socket.IO connection management |
| `useTheme.ts` | useTheme | Theme switching (light/dark/system) |
| `useDebounce.ts` | useDebounce | Debounced values |
| `useLocalStorage.ts` | useLocalStorage | Persistent state |
| `useOnScreen.ts` | useOnScreen | Intersection observer |
| `useMediaQuery.ts` | useMediaQuery | Responsive queries |

#### Utilities (`src/utils/`)
| File | Functions |
|------|-----------|
| `index.ts` | Re-exports |
| `validation.ts` | validateImageFile, validateImageFiles, formatBytes, isValidUrl, sanitizeInput, isValidConfidence |
| `image.ts` | getImageMetadata, resizeImage, createImageThumbnail, compressImage |
| `export.ts` | exportToJSON, exportToCSV, exportToPDF |
| `format.ts` | formatDate, formatConfidence |

#### Components (`src/components/`)
| File | Component | Description |
|------|-----------|-------------|
| `recognition/RecognitionInterface.tsx` | RecognitionInterface | Main recognition UI with canvas |

#### Internationalization (`src/i18n/`)
| File | Purpose |
|------|---------|
| `index.ts` | i18next configuration |
| `locales/en.json` | English translations |
| `locales/es.json` | Spanish translations |
| `locales/fr.json` | French translations |
| `locales/de.json` | German translations |
| `locales/ja.json` | Japanese translations |
| `locales/zh.json` | Chinese translations |

#### Constants (`src/constants/`)
| File | Exports |
|------|---------|
| `index.ts` | SUPPORTED_IMAGE_FORMATS, APP_CONFIG |

---

## 2. API Backend (`apps/api`)

### Entry Points
| File | Purpose |
|------|---------|
| `src/main.ts` | Full production server |
| `src/main-simple.ts` | Simplified dev server |
| `src/main-simple.js` | JavaScript fallback |

### Core Modules (`src/core/`)
| File | Purpose |
|------|---------|
| `telemetry.ts` | OpenTelemetry + Jaeger + Prometheus setup |
| `sentry.ts` | Sentry error tracking configuration |

### Model Metadata (`models/`)
| File | Purpose |
|------|---------|
| `efficientdet_lite_metadata.json` | EfficientDet model config |
| `mobilenet_logo_classifier_metadata.json` | MobileNet classifier config |
| `simple_logo_detector_metadata.json` | Simple detector config |

### Configuration
| File | Purpose |
|------|---------|
| `package.json` | Dependencies & scripts |
| `README.md` | API documentation |
| `examples/api-usage.js` | Usage examples |

---

## 3. Shared Package (`packages/shared`)

### Structure
```
packages/shared/src/
├── index.ts              # Public exports
├── types/
│   └── index.ts          # Shared TypeScript types
├── errors/
│   └── errorHandler.ts   # RFC 7807 error handling
├── resilience/
│   ├── circuitBreaker.ts # Circuit breaker pattern
│   └── retry.ts          # Exponential backoff retry
└── utils/
    └── caching.ts        # Multi-layer cache (LRU + Redis)
```

### Key Exports
| Module | Exports |
|--------|---------|
| `errorHandler.ts` | IntelligentErrorHandler, ApiError, ErrorCode |
| `circuitBreaker.ts` | CircuitBreaker, CircuitState, CircuitBreakerOptions |
| `retry.ts` | RetryWithBackoff, RetryOptions |
| `caching.ts` | MultiLayerCache, CacheConfig |

---

## 4. ML Package (`packages/ml`)

### Structure
```
packages/ml/src/
└── optimization/
    └── onnxOptimizer.ts  # ONNX Runtime optimization
```

### Key Exports
| Module | Exports |
|--------|---------|
| `onnxOptimizer.ts` | ONNXOptimizer, OptimizationConfig |

---

## 5. UI Package (`packages/ui`)

### Structure
```
packages/ui/
└── package.json          # React + Ant Design components
```

*Note: UI component source files to be implemented*

---

## 6. Infrastructure

### Docker (`infrastructure/docker/`)
| Path | Purpose |
|------|---------|
| `prometheus/prometheus.yml` | Prometheus config |
| `prometheus/prometheus-minio.yml` | MinIO metrics |
| `prometheus/alerts-minio.yml` | MinIO alerts |
| `grafana/dashboards/` | Grafana dashboards |
| `minio/policies/` | S3 bucket policies |

### Kubernetes (`infrastructure/kubernetes/`)
| Path | Resource |
|------|----------|
| `backend/api-deployment.yaml` | API Deployment (3 replicas) |
| `backend/api-service.yaml` | API Service |
| `backend/api-hpa.yaml` | HPA (3-20 pods) |
| `backend/celery-deployment.yaml` | Celery workers |
| `postgres/postgres-statefulset.yaml` | PostgreSQL StatefulSet |
| `redis/redis-deployment.yaml` | Redis Deployment |

### Monitoring (`infrastructure/monitoring/`)
| File | Purpose |
|------|---------|
| `docker-compose.monitoring.yml` | Full monitoring stack |
| `prometheus.yml` | Prometheus scrape config |

---

## 7. Tests

### Test Organization
```
tests/
├── contract/           # API contract tests
├── e2e/                # Playwright E2E tests
├── e2e-cypress/        # Cypress E2E tests
├── integration/        # Integration tests
├── load/               # Load/performance tests
├── validation/         # Feature validation
├── visual/             # Visual regression
└── fixtures/           # Test data factories
```

### Key Test Files
| File | Purpose |
|------|---------|
| `e2e/example.spec.ts` | Playwright example |
| `e2e/simple-test.spec.ts` | Basic E2E test |
| `integration/test_complete_flow.js` | Full flow test |
| `load/recognition.js` | Recognition load test |
| `load/performance-test.js` | Performance benchmark |
| `contract/recognition-contract.spec.js` | API contract |

---

## 8. CI/CD Workflows (`.github/workflows/`)

| File | Trigger | Purpose |
|------|---------|---------|
| `ci-cd.yml` | Push | Main CI/CD pipeline |
| `test.yml` | PR | Test suite |
| `test-suite.yml` | Push | Full test matrix |
| `comprehensive-tests.yml` | Manual | All tests |
| `security-a-plus-plus.yml` | Schedule | Security scans |
| `deploy-coolify.yml` | Manual | Coolify deployment |
| `deploy-production.yaml` | Tag | Production deployment |

---

## 9. Scripts (`scripts/`)

| Path | Purpose |
|------|---------|
| `deployment/` | Docker compose files |
| `qa/reports/` | QA validation reports |
| `README.md` | Script documentation |

---

## 10. Documentation (`docs/`)

### Documentation Structure
```
docs/
├── 01-product/
│   └── prd.md                    # Product Requirements
├── 02-architecture/
│   ├── overview.md               # Architecture overview
│   ├── api-specification.md      # API specification
│   ├── data-models.md            # Prisma schema
│   ├── security.md               # Security architecture
│   └── tech-stack.md             # Technology stack
├── 03-development/
│   ├── setup.md                  # Development setup
│   ├── workflows.md              # Development workflows
│   └── coding-standards.md       # Coding standards
├── 04-deployment/
│   └── deployment-guide.md       # Deployment guide
├── 05-testing/
│   └── testing-strategy.md       # Testing strategy
└── _meta/
    └── project-scan-report.json  # BMAD scan report
```

---

## 11. Root Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Root workspace config |
| `pnpm-workspace.yaml` | pnpm workspace definition |
| `pnpm-lock.yaml` | Dependency lockfile |
| `docker-compose.yml` | Development stack |
| `playwright.config.ts` | E2E test config |
| `README.md` | Project overview |
| `QUICK_START.md` | Quick start guide |
| `DOCKER-QUICKSTART.md` | Docker quick start |

---

## Update 2026-06-04 — Epic 8: nieuwe modules (Automatische Trainingsdata uit Etiket-Artwork)

Epic 8 introduceert een artwork-pipeline. De FastAPI-router `app/api/artwork.py`
exposeert de stappen als HTTP-endpoints onder `/ml` (rasterize, localize, classify,
synthesize); de zwaardere logica leeft in service-modules die door deze endpoints
worden aangeroepen.

### ML-service (`apps/ml-service`)

| Module | Verantwoordelijkheid |
|--------|----------------------|
| `app/api/artwork.py` | FastAPI-router met vier endpoints: `/ml/artwork/rasterize` (8.2), `/ml/artwork/localize` (8.3R: schaal-ladder → tiling → matching → beste-schaal-collapse → NMS, time-budget) `/ml/artwork/classify` (8.4) en `/ml/artwork/synthesize` (8.7). Decodeert artwork/templates (incl. alpha) en orkestreert de onderliggende services. Meet-/reparatiescripts: `scripts/remeasure_localization.py` (AC4-hermeting, read-only) en `scripts/regen_composites_83r.py` (eenmalige ground-truth-reparatie). |
| `app/services/artwork.py` | `rasterize_pdf(path, dpi=300)` — rastert etiket-PDF's naar PNG's per pagina (PyMuPDF). Pure, path-agnostische functie; corrupte/beveiligde PDF's geven `[]` of een dict met `error`-key terug en gooien nooit. Env: `ARTWORK_RASTER_DPI`. Aangeroepen vanuit het rasterize-endpoint. |
| `app/services/localization.py` | Keurmerk-lokalisatie via tiling (SAHI-geïnspireerd) + OpenCV template-matching. `tile_image()`, `match_templates()` (met variance-guard tegen wit-op-wit) en `merge_detections()` (NMS over tile-grenzen). |
| `app/services/classification.py` | `classify_crop()` — classificeert een crop als T3777-code via embedding-similariteit tegen de referentiebibliotheek (pgvector cosine via `find_similar_references`), met fallback naar een lichte pixel-histogram-classifier. **Bereikbaar via HTTP**: aangeroepen door `/ml/artwork/classify`. Env: `CLASSIFY_MIN_CONFIDENCE` (0.70), `CLASSIFY_UNKNOWN_CODE`. |
| `app/services/synthesis.py` | Synthetische trainingsdata: `compose_synthetic()` plaatst keurmerk-templates op achtergronden; `synthesize_for_class(t3777_code, count, seed)` componeert deterministische samples, schrijft PNG's naar MinIO en geeft crop-descriptors terug; `build_synthetic_batch()` vult klassen onder een drempel aan op basis van echte class-counts. **Bereikbaar via HTTP**: `synthesize_for_class` wordt aangeroepen door `/ml/artwork/synthesize`. Vervuilt de holdout-set niet. |
| `app/services/similarity.py` | Uitgebreid met `rebuild_reference_embeddings()` (Story 8.4): genereert exact één embedding per **actieve** referentievariant en schrijft die naar de `reference_embeddings`-tabel. Idempotent (tabel wordt eerst geleegd); bewust gescheiden van `rebuild_embeddings` (logo-index). |
| `app/main.py` | Lifespan-startup roept `similarity_service.rebuild_reference_embeddings()` aan om de referentie-embeddingindex te bouwen. Non-fataal: bij falen valt classificatie terug op de classifier-route / `UNKNOWN`. |
| `app/services/database.py` | Uitgebreid met `get_class_counts(active_only=True)` (input voor de synthese-batch) en de referentie-embeddinghelpers `get_active_reference_logos()`, `store_reference_embedding()`, `clear_reference_embeddings()` en `find_similar_references()` (pgvector cosine, asyncpg raw SQL). |

### API gateway (`apps/api`)

| Module | Verantwoordelijkheid |
|--------|----------------------|
| `src/api/v1/artwork-pipeline.ts` | Fastify-routes voor importruns, T3777-crosscheck/routing, review-item accept/reject/process-accepted, trainingsdata-registratie met provenance en synthetische generatie (zie `api-specification.md`). |
| `src/services/provenance.ts` | **Nieuw** — single source of truth voor het `provenance`-JSON-blok van `TrainingData`: gedeelde `Provenance`-shape + `buildProvenance()`/`mapProvenance()` (een ontbrekend/leeg blok → `null`; een present-maar-malformed blok → `null` + warning, nooit stille partiële waarden). Exporteert de named constant `KEURMERK_CATEGORY` (Logo-category voor keurmerk-trainingsdata) en het `ProvenanceMethod`-type (`template`/`classifier`/`human`/`synthetic`). Geïmporteerd door `artwork-pipeline.ts` (registratie) en `training.ts` (holdout synthetic-guard). |
| `src/services/ml-client.ts` | Uitgebreid met `rasterizeArtwork(storagePath, dpi?)` (`POST /ml/artwork/rasterize`, Story 8.2) en `synthesizeArtwork(t3777Code, count, seed?)` (`POST /ml/artwork/synthesize`, Story 8.7), inclusief de bijbehorende response-types. |
| `src/services/mediaserver-client.ts` | Client voor de mediaserver: `discoverArtwork(gtin)` (LABEL-artwork via `/uploaded`) en `downloadFile(previewUrl)`. Rate-aware via `ARTWORK_IMPORT_CONCURRENCY` (default 3). |
| `src/services/storage.ts` | Uitgebreid met `uploadArtwork(buffer, path, mimeType)` voor opslag van geïmporteerde artwork in MinIO (prefix `artwork/{gtin}/`). |
| `scripts/stratify-holdout.ts` | Sluit nu synthetische records (`provenance.method === 'synthetic'`, Story 8.7) uit van de holdout-selectie (NFR3: de holdout blijft 100% echt). De filtering gebeurt in JS i.p.v. via een Prisma JSON-`not`-filter, omdat dat ook records zonder `method`-key (veel echte data) zou laten vallen en de holdout-pool stil zou laten krimpen. |

Nieuwe Python-dependencies staan in `apps/ml-service/requirements.txt` (o.a. PDF-rasterisatie en beeldverwerking).

---

## Update 2026-06-05 — Epic 9: nieuwe modules (Automatische Retraining)

Epic 9 voegt een crash-bestendige retraining-pipeline toe op basis van **BullMQ + Redis**. De pipeline-logica leeft in een nieuwe service-module `apps/api/src/services/pipeline/`; HTTP-toegang loopt via `apps/api/src/api/v1/pipeline.ts` (nieuw) en uitbreidingen in `training.ts`. De ML-service krijgt één extra router voor synthetische batch-planning. Redis is als queue-backend toegevoegd aan de compose-bestanden.

### API gateway — pipeline-module (`apps/api/src/services/pipeline/`)

| Module | Verantwoordelijkheid |
|--------|----------------------|
| `queue.ts` | BullMQ-queue-infrastructuur (Story 9.1): Redis-connectie (`getRedisConnection`), de `training`-queue, `getJobStatus(jobId)` (incl. `failedReason` + `retryable`) en de security-helper `isServiceRequest()` — verifieert service-account-callers via `PIPELINE_SERVICE_KEY` met `crypto.timingSafeEqual` (geen fallback: ontbrekende key → `false`). Redis-state overleeft container-restarts (NFR1). |
| `trigger.ts` | Retraining-trigger-service (Story 9.2): evalueert retraining-condities met configureerbare drempels, stuurt Socket.IO-notificaties met reden-tekst, persisteert naar `RetrainingNotification` en dedupt via Redis binnen het dedup-venster. `registerRetrainingCronJob()` plant de cron (`RETRAINING_CRON`, default daags 06:00). |
| `training-flow.ts` | BullMQ-`FlowProducer`-keten (Story 9.3): `incorporate-feedback → build-batch → train-model → evaluate-model`. Elke stap individueel retryable; flow-state in Redis (NFR1). `submitTrainingFlow()`, `getActiveTrainingFlowJobId()` (concurrency=1) en de build-batch-stap die `mlClient.buildSyntheticBatch()` aanroept (ratio-cap wint van `min_per_class`). |
| `workers.ts` | De BullMQ-workers die de vier flow-stappen verwerken (Story 9.3). `registerTrainingFlowWorker()`; de `train-model`-stap draait op Worker-concurrency 1 (AC3). De `evaluate-model`-stap roept de quality-gate aan en persisteert `metrics.gate` (+ `holdout` + `triggerReasons`) op de challenger, of emit `gate_failed` met vergelijkingscijfers. Step-processors zijn los geëxporteerd voor unit-tests (geen Redis nodig). |
| `quality-gate.ts` | Champion/challenger quality-gate (Story 9.4): `evaluateGate()` → `GateVerdict { passed, reason?, comparison? }`. Passeert bij gelijke/betere holdout-accuracy (zelfde `holdoutHash`) + `minImprovement` (env `GATE_MIN_IMPROVEMENT`, default 0.0); auto-pass zonder champion of zonder champion-`holdoutHash`; verschillende holdout-sets falen altijd. `emitGateFailure()` stuurt de faal-notificatie. |
| `feedback-incorporation.ts` | Single source of truth voor "valideerde feedback → trainingsdata" (Story 9.3, incorporate-feedback-stap): `incorporatePendingFeedback()`. Gedeeld door zowel de handmatige route `POST /api/v1/feedback/incorporate` (`feedback.ts` roept nu deze service aan i.p.v. inline) als de worker-stap, zodat de pipeline-stap geen HTTP-self-call met JWT hoeft te doen. Batch-idempotent. |

`apps/api/src/main.ts` registreert de pipeline-routes en — alleen wanneer `REDIS_URL` gezet is en `NODE_ENV !== 'test'` — de retraining-cron en de training-flow-worker (non-fataal bij een nog niet gereed staande Redis).

### API gateway — routes (`apps/api/src/api/v1/`)

| Module | Verantwoordelijkheid |
|--------|----------------------|
| `pipeline.ts` | **Nieuw** — Fastify-routes voor jobstatus, trigger-notificaties (list + mark-read) en handmatige flow-start (`requireRole('ADMIN')`, concurrency-guard 409). Zie `api-specification.md`. |
| `training.ts` | Uitgebreid met `GET /models/approval-queue` (gate-passende challengers, `metrics.gate.passed === true`) en de activatie-guards op `POST /models/:modelId/activate` (403 voor service-accounts via `isServiceRequest()`, 401 anoniem, schrijft `ModelActivationLog`). |
| `ml-client.ts` | Uitgebreid met `buildSyntheticBatch({ minPerClass, ratio })` → `POST /ml/pipeline/build-synthetic-batch` (Story 9.3, wiring van de uitgestelde 8.7-hook). |

### ML-service (`apps/ml-service`)

| Module | Verantwoordelijkheid |
|--------|----------------------|
| `app/api/pipeline.py` | **Nieuw** — FastAPI-router met `POST /ml/pipeline/build-synthetic-batch` (Story 9.3, AC4). Thin compute-only wrapper rond `build_synthetic_batch(..., persist=False)`; splitst de platte planner-output in `{ batches, shortfall_reported }`. Geregistreerd in `app/main.py` onder prefix `/ml`. |

### Frontend (`apps/web`)

| Module | Verantwoordelijkheid |
|--------|----------------------|
| `src/pages/ApprovalQueuePage.tsx` | **Nieuw** — approval-queue-pagina (Story 9.5): toont gate-passende challengers met een volledig evaluatierapport (challenger vs champion, holdout-metrics naast elkaar, diff, trigger-reden) en één-klik-activatie met bevestigingsdialoog. Gemount in `App.tsx` op route `models/approval`. |
| `src/components/training/RetrainingNotificationBanner.tsx` | **Nieuw** — banner die persistente retraining-aanbevelingen toont (Story 9.2). TanStack Query met `refetchOnMount` zodat ook een koude paginabezoek eerder verstuurde notificaties laat zien (AC3). |
| `src/components/training/PipelineJobsPanel.tsx` | **Nieuw** — paneel voor BullMQ-pipelinejobs met live Socket.IO-updates en retry-actie voor gefaalde jobs (Story 9.1). **Nog niet gemount** in de app (geen route/parent rendert het component nog). |

### Tests & infrastructuur

| Pad | Verantwoordelijkheid |
|-----|----------------------|
| `apps/api/src/__tests__/smoke/pipeline-smoke-test.test.ts` | **Nieuw** — end-to-end smoke-test van de volledige pipeline op een mini-dataset (Story 9.6). In-process (Vitest, ML-client + BullMQ/Redis gemockt — geen Docker), asserteert op de volledige response-shape per stap (contractbreuk-detectie) en exerciseert een niet-default gate-drempel via `GATE_MIN_IMPROVEMENT`. Draait in CI als job `smoke-test-pipeline` in `.github/workflows/ci-cd.yml`. |
| `tests/fixtures/mini-dataset/` | **Nieuw** — mini-dataset (51 gelabelde 64×64 PNG's, 3 klassen, incl. `holdout/`-submap en `labels.json`; ~204 KB, onder de no-LFS-limiet). |
| `tests/test_pipeline_endpoint.py` | **Nieuw** — pytest voor het `/ml/pipeline/build-synthetic-batch`-endpoint. |
| `docker-compose.yml` / `.acc.yml` / `.prod.yml` / `.full.yml` | **Redis-service toegevoegd** (Epic 9, Story 9.1) als BullMQ-queue-backend (`redis:7-alpine`, AOF-persistentie, healthcheck). Het `redis-data`-volume bevat alleen queue-state (geen back-up-verplichting); de API krijgt `REDIS_URL` + `depends_on: redis`. `PIPELINE_SERVICE_KEY` moet als secret gezet worden (min. 32 tekens). |

---

## File Count by Category

| Category | Count | Extensions |
|----------|-------|------------|
| TypeScript/TSX | ~50 | .ts, .tsx |
| JavaScript | ~20 | .js |
| JSON | ~30 | .json |
| YAML | ~20 | .yaml, .yml |
| Markdown | ~40 | .md |
| Configuration | ~15 | various |

---

## Import Conventions

### Path Aliases (apps/web)
```typescript
import { Component } from '@/components/Component';
import { useStore } from '@stores/useStore';
import { util } from '@utils/util';
import { Type } from '@types/index';
import { hook } from '@hooks/hook';
import { translation } from '@i18n/index';
import { shared } from '@shared/index';
import { ui } from '@ui/index';
```

### Package Imports
```typescript
// Cross-package imports
import { CircuitBreaker } from '@logo-recognition/shared';
import { ONNXOptimizer } from '@logo-recognition/ml';
import { Button } from '@logo-recognition/ui';
```

---

*Document generated by BMAD document-project workflow*
