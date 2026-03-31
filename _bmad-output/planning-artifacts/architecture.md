---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-03-31'
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - docs/index.md
  - docs/project-overview.md
  - docs/01-product/prd.md
  - docs/epics.md
workflowType: 'architecture'
project_name: 'logoRecognition'
user_name: 'Friso'
date: '2026-03-31'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
40 FRs over 9 capability areas. Architecturaal relevant: annotatie-canvas (FR9-14) vereist high-performance client-side rendering, training pipeline (FR15-20) vereist async job processing met real-time voortgang, en herkennings-API (FR30-33) vereist low-latency inference met batch support.

**Non-Functional Requirements:**
- Performance: <100ms inference, 60fps canvas, <2.5s page load, 1000 req/s throughput
- Beveiliging: Token-based auth, RBAC (3 rollen), rate limiting, audit logging
- Schaalbaarheid: Horizontale schaling ML-service, 10.000+ categorieën (post-MVP)
- Accessibility: WCAG 2.1 AA
- Betrouwbaarheid: 99.9% uptime, graceful degradation, auto-retry training jobs

**Scale & Complexity:**
- Primair domein: Full-stack + ML
- Complexiteit: High
- Geschatte architecturale componenten: 15-20 (3 services, 3 storage layers, queue, cache, 5+ frontend modules, ML pipeline stages)

### Technical Constraints & Dependencies

- Brownfield project: bestaande monorepo met werkende componenten (pnpm workspace)
- ML training vereist GPU resources — inference kan op CPU
- Model export naar geoptimaliseerd inference-formaat voor cross-platform deployment
- S3-compatibele object storage voor afbeeldingen (potentieel grote volumes)
- Real-time communicatie nodig voor training voortgang en potentieel herkenningsresultaten

### Cross-Cutting Concerns

- **Authenticatie & Autorisatie:** Token-based auth met RBAC over alle 3 services
- **Error Handling:** Consistente foutafhandeling over API gateway ↔ ML service boundary
- **Monitoring:** Health checks, metrics endpoints, logging over alle services
- **Data Consistency:** Afbeeldingsmetadata (DB) moet synchroon zijn met objecten (storage)
- **File Upload Pipeline:** Upload → validatie → opslag → thumbnail generatie → beschikbaarheid

## Starter Template Evaluatie

### Primair Technisch Domein

Full-stack + ML monorepo — bestaande brownfield codebase met werkende componenten.

### Bestaande Tech Stack (Brownfield)

Geen starter template evaluatie nodig — technologie-keuzes zijn al gemaakt en geïmplementeerd in de bestaande monorepo.

### Geselecteerd Fundament: Bestaande pnpm Workspace Monorepo

**Rationale:**
Brownfield project met nagenoeg complete MVP. Alle technologie-beslissingen zijn reeds gemaakt en gevalideerd in productie. Geen reden om te migreren of opnieuw te kiezen.

**Architecturale Beslissingen in Bestaande Stack:**

**Language & Runtime:**
- TypeScript 5.7 (strict mode) — frontend + API
- Python 3.11 — ML service
- Node.js ≥22.12.0

**Frontend (apps/web):**
- React 18.3 + Vite 6 (SPA, route-based code splitting)
- Ant Design 5 (UI component library)
- Zustand 5 (client state) + TanStack React Query 5 (server state)
- Konva + React-Konva (canvas-based annotatie)
- Tailwind CSS 3 (utility-first styling)
- React Router DOM 6 (client-side routing)
- i18next (internationalisatie)
- Socket.IO Client (real-time communicatie)
- Axios (HTTP client)

**API Gateway (apps/api):**
- Fastify 4 (HTTP framework)
- Prisma 5 (ORM, PostgreSQL)
- BullMQ 5 (job queue, Redis-backed)
- Socket.IO Server (real-time push)
- @fastify/jwt + bcrypt (authenticatie)
- Sharp (image processing)
- Winston (logging)
- prom-client (metrics)

**ML Service (apps/ml-service):**
- FastAPI (async HTTP framework)
- PyTorch ≥2.0 + TensorFlow ≥2.13 (training)
- ONNX Runtime ≥1.15 (inference)
- OpenCV ≥4.8 (computer vision)
- asyncpg (async PostgreSQL)
- structlog (structured logging)

**Shared Packages:**
- packages/shared — TypeScript types, circuit breaker, cache, retry patterns
- packages/ml — ONNX optimizer, TensorFlow.js (client-side inference)
- packages/ui — React + Ant Design (structuur, nog leeg)

**Infrastructure:**
- PostgreSQL 16 + pgvector (database + vector search)
- Redis 7 (cache + queue backend)
- MinIO (S3-compatibele object storage)
- Docker + Docker Compose (containerisatie)
- GitHub Actions + Coolify (CI/CD)

**Testing:**
- Vitest (unit tests)
- Playwright (E2E tests)

**Build & Development:**
- pnpm 9.15+ (package manager, workspace protocol)
- Vite 6 (frontend bundling)
- TypeScript strict mode

## Core Architectural Decisions

### Decision Priority Analysis

Alle beslissingen zijn reeds geïmplementeerd — dit document formaliseert de bestaande architectuur voor consistency bij toekomstige development.

**Bekende Gaps (gedefinieerd maar niet geïntegreerd):**
- Circuit breaker pattern (in packages/shared, niet gebruikt in ML client)
- Retry with backoff (in packages/shared, niet gebruikt in ML client)
- Multi-layer cache (in packages/shared, niet gebruikt voor ML responses)
- Error response format inconsistentie (middleware vs. route-level)

### Data Architectuur

| Beslissing | Keuze | Rationale |
|-----------|-------|-----------|
| Database | PostgreSQL 16 + pgvector | Relationeel + vector similarity search in één database |
| ORM | Prisma 5 | Type-safe queries, migraties, connection pooling |
| Cache | Redis 7 | BullMQ queue backend + session/data cache |
| Object Storage | MinIO (S3-compatibel) | 4 buckets: `training-images`, `recognition-images`, `thumbnails`, `models` |
| Bestandsopslag patroon | User-scoped paths: `{userId}/{fileId}.{ext}` | Isolatie per gebruiker |
| Deduplicatie | SHA256 hash per upload | Voorkomt duplicate opslag |

### Authenticatie & Beveiliging

| Beslissing | Keuze | Rationale |
|-----------|-------|-----------|
| Auth methode | JWT (@fastify/jwt) + bcrypt | Token-based stateless auth |
| Autorisatie | RBAC middleware met role checks | 3 rollen: admin, data manager, operator |
| API key auth | Separate API key validatie in auth middleware | Voor externe systeem-integratie |
| Rate limiting | @fastify/rate-limit | Custom error response met code `RATE_LIMIT_EXCEEDED` |
| CORS | Beperkt tot bekende origins | Geconfigureerd in Fastify |

### API & Communicatie

| Beslissing | Keuze | Rationale |
|-----------|-------|-----------|
| API versioning | URL prefix `/api/v1` op alle business routes | Toekomstige backward compatibility |
| Health endpoints | Ongeversioned: `/health`, `/health/ready`, `/health/live`, `/health/detailed` | Kubernetes-compatible probes |
| Error response format | `{ error: { code, message, timestamp, requestId, details? } }` | Gestandaardiseerd in global error handler |
| ML service communicatie | Axios met 120s timeout, request/response logging | Direct HTTP, geen message bus |
| Real-time push | Socket.IO | Training voortgang, job status updates |
| ML service endpoints | `/ml/detect`, `/ml/train`, `/ml/models`, `/ml/embed` | Geen versioning op ML service (intern) |

**Bekende inconsistentie:** Route-level error handling in recognition.ts, training.ts gebruikt een afwijkend format (`{ error: "...", message: "..." }`) i.p.v. het gestandaardiseerde format uit errorHandler.ts.

### Frontend Architectuur

| Beslissing | Keuze | Rationale |
|-----------|-------|-----------|
| State management | Zustand (client) + TanStack Query (server) | Simpel client state, cache-first server state |
| Component library | Ant Design 5 | Enterprise-grade, consistent design |
| Canvas engine | Konva + React-Konva | High-performance 2D canvas voor annotatie |
| Styling | Tailwind CSS 3 | Utility-first, co-exists met Ant Design |
| Routing | React Router DOM 6 | Client-side SPA routing |
| Code splitting | Route-based lazy loading via React Router | Bundle optimalisatie |
| HTTP client | Axios | Interceptors, request cancellation |
| i18n | i18next | Meertaligheid |

### Infrastructure & Deployment

| Beslissing | Keuze | Rationale |
|-----------|-------|-----------|
| Containerisatie | Docker + Docker Compose | Lokale dev + productie |
| CI/CD | GitHub Actions + Coolify | Automated builds en deployment |
| Monitoring | prom-client (metrics) + Winston (logging) | Prometheus-compatible metrics |
| Health checks | Multi-service health met graceful degradation | healthy/degraded/unhealthy status |
| Package manager | pnpm 9.15+ met workspace protocol | Monorepo dependency management |

### ML Model Deployment

| Beslissing | Keuze | Rationale |
|-----------|-------|-----------|
| Model opslag | MinIO `models` bucket | S3-compatibel, versioned |
| Model serving | In-memory singleton (ModelManager) | Één actief model per process |
| Hot-swap strategie | Full unload → DB update → reload cycle | Clean state bij model activatie |
| Inference runtime | ONNX Runtime (detection) + PyTorch (embeddings) | ONNX voor snelle CPU inference, PyTorch voor GPU training |
| Device fallback | CUDA → CPU automatic fallback | GPU als beschikbaar, anders CPU |

### File Upload Pipeline

| Stap | Implementatie |
|------|--------------|
| Upload methode | Multipart form-data via @fastify/multipart |
| Size limit | 10MB per bestand, 10 concurrent files |
| Batch limit | Max 50 bestanden per batch request |
| Validatie | MIME type (jpeg/png/webp), min 100x100px, SHA256 dedup |
| Opslag | Buffer → MinIO putObject met metadata headers |
| Thumbnails | Auto-generated: 280x160, JPEG quality 80, separate bucket |
| Image processing | Sharp library |

### Decision Impact Analysis — Implementation Gaps

| Gap | Impact | Aanbeveling |
|-----|--------|-------------|
| Circuit breaker niet op ML client | Cascading failures bij ML service uitval | Integreer `CircuitBreaker` uit packages/shared rond ML client calls |
| Retry niet op ML client | Transiente fouten veroorzaken directe failures | Integreer `RetryWithBackoff` voor 5xx en timeout errors |
| Error format inconsistentie | Route-level errors wijken af van standaard | Refactor routes om global error handler format te gebruiken |
| Multi-layer cache ongebruikt | Herhaalde inference calls niet gecacht | Integreer voor embedding/detection resultaten |

## Implementation Patterns & Consistency Rules

### Naming Patterns

**Database (Prisma):**
- Tabellen: `snake_case` via `@@map()` — `logo_images`, `training_batches`, `model_versions`
- Kolommen: `camelCase` in Prisma model, `snake_case` in DB via `@map()` — `storagePath` → `storage_path`
- Relaties: Plural nouns — `trainingData`, `annotations`, `embeddings`

**API Endpoints:**
- Structuur: `/api/v1/{resource}/{action}` of `/api/v1/{resource}/:id`
- Resources: Plural of verb-based — `/categories`, `/annotations`, `/recognize`
- Speciale acties: Suffix — `/annotations/bulk`, `/annotations/smart-click`, `/training/start`
- Route parameters: `:id` format (Fastify convention)

**Request/Response JSON:**
- Request bodies en query params: `snake_case` — `confidence_threshold`, `return_embeddings`, `batch_id`
- Response bodies: `camelCase` — `totalPages`, `createdAt`, `annotationCount`
- Uitzondering: ML service responses behouden `snake_case` (Python convention)

**Code:**
- React components: `PascalCase` bestanden en exports — `RecognitionInterface.tsx`
- Hooks: `useXxx` prefix — `useWebSocket.ts`, `useRecognitionStore`
- Services/utilities: `camelCase` of `kebab-case` — `ml-client.ts`, `socket-io-manager.ts`
- Zustand stores: `xxxStore.ts` bestand, `useXxxStore` export — `recognitionStore.ts` → `useRecognitionStore`

### Structure Patterns

**Project Organisatie (type-based):**
```
apps/api/src/
  api/v1/          # Route handlers per resource
  middleware/       # Auth, error handling
  services/         # Business logic (ml-client, storage, socket-io)
  core/             # Logger, config
  __tests__/        # Co-located test directory
    api/            # Route tests
    services/       # Service tests
    helpers/        # Mock data, test setup

apps/web/src/
  components/       # React components (PascalCase.tsx)
    recognition/    # Feature-based subdirectories
    training/
    common/
  hooks/            # Custom hooks (useXxx.ts)
  stores/           # Zustand stores (xxxStore.ts)
  services/         # API client services
  pages/            # Page components
  types/            # TypeScript type definitions
  utils/            # Utility functions
  contexts/         # React contexts
```

**Tests:**
- Locatie: Co-located in `__tests__/` directory, parallel aan source structuur
- Naamgeving: `{module}.routes.test.ts` (routes) of `{module}.test.ts` (services)
- Framework: Vitest met `vi.Mock` voor mocking
- Helpers: `__tests__/helpers/mock-data.ts`, `fastify-test.ts`

### Format Patterns

**API Response Structuur:**
- Success: Direct response body (geen wrapper) — `{ data: [...], pagination: { page, limit, total, totalPages } }`
- Error (global handler): `{ error: { code, message, timestamp, requestId, details? } }`
- Error codes: UPPER_SNAKE_CASE — `VALIDATION_ERROR`, `RATE_LIMIT_EXCEEDED`, `UNAUTHORIZED`

**Datums:** ISO 8601 strings — `createdAt: "2026-03-31T08:00:00.000Z"`

### Communication Patterns

**Socket.IO Events:**
- Event namen: `snake_case` met type prefix — `training_progress`, `training_completed`, `recognition_update`, `feedback_received`
- Room/topic format: `{type}:{id}` of `{type}:*` — `training:job123`, `recognition:*`
- Subscribe pattern: `subscribe_{type}` event — `subscribe_training`, `subscribe_recognition`
- Message structuur: `{ type, event, data, timestamp }`

**Zustand State Management:**
- Middleware stack (altijd in deze volgorde): `devtools` → `persist` → `immer`
- Store interface: State + actions in één interface
- Actions: Verb-based — `setField`, `addItem`, `removeItem`, `reset`, `clear`
- Immer voor immutable updates: `set((state) => { state.field = value; })`
- Persist key: `{store-name}-store` — `recognition-store`, `training-store`

### Process Patterns

**Error Handling:**
- Global: Fastify `setErrorHandler` in `errorHandler.ts` — gestandaardiseerd format
- Route-level: Try-catch met `MLServiceError` voor service boundary errors
- Frontend: Error boundaries met `ErrorFallback` component
- Logging: Winston met requestId correlatie

**Loading States:**
- TanStack Query: `isLoading`, `isError`, `data` pattern voor server state
- Zustand: Expliciete `isLoading` boolean per operatie in store

**Component Pattern:**
- Altijd `React.memo()` wrapped voor optimalisatie
- TypeScript `React.FC<Props>` of interface-based props
- Named exports (geen default exports)

### Enforcement Guidelines

**Alle AI Agents MOETEN:**
1. Database kolommen als `camelCase` in Prisma schrijven met `@map("snake_case")`
2. API responses in `camelCase` JSON teruggeven, requests accepteren in `snake_case`
3. React componenten als `PascalCase.tsx` bestanden met `React.memo()` wrapper
4. Zustand stores met `devtools` → `persist` → `immer` middleware stack
5. Socket.IO events als `snake_case` met type prefix naamgeven
6. Error responses via het global error handler format (`{ error: { code, message, timestamp, requestId } }`)
7. Tests plaatsen in `__tests__/` directory parallel aan source structuur

### Anti-Patterns (Vermijden)

- `snake_case` in API response JSON (behalve ML service passthrough)
- Default exports voor React componenten
- Direct state mutation in Zustand (altijd immer gebruiken)
- Route-level error responses buiten het standaard error format
- Test bestanden naast source bestanden (altijd in `__tests__/`)

## Project Structure & Boundaries

### Complete Project Directory Structure

```
logoRecognition/
├── pnpm-workspace.yaml
├── package.json
├── docker-compose.yml / docker-compose.full.yml
├── playwright.config.ts
├── .github/workflows/ci-cd.yml
│
├── apps/
│   ├── api/                           # Fastify API Gateway
│   │   ├── prisma/schema.prisma       # 20 database modellen
│   │   └── src/
│   │       ├── main.ts                # Entry point + plugin registration
│   │       ├── core/                  # logger, sentry, telemetry
│   │       ├── middleware/            # auth, errorHandler, tracing
│   │       ├── api/v1/               # Route handlers per resource
│   │       │   ├── auth.ts, images.ts, categories.ts, annotations.ts
│   │       │   ├── recognition.ts, training.ts, feedback.ts
│   │       │   ├── stats.ts, health.ts
│   │       ├── services/             # ml-client, storage, socket-io-manager, auth
│   │       └── __tests__/            # Parallel test structuur
│   │
│   ├── web/                           # React SPA Frontend
│   │   └── src/
│   │       ├── App.tsx + main.tsx     # Entry + routing
│   │       ├── pages/                # 6 page components
│   │       ├── components/           # Feature-based: common/, recognition/, training/, annotation/
│   │       ├── stores/               # 7 Zustand stores
│   │       ├── hooks/                # 7 custom hooks
│   │       ├── services/             # API client services
│   │       ├── types/                # TypeScript type definitions
│   │       ├── utils/                # Utility functions
│   │       ├── contexts/             # React contexts
│   │       ├── constants/            # App constants
│   │       └── i18n/                 # Internationalisatie
│   │
│   └── ml-service/                    # FastAPI ML Microservice
│       └── app/
│           ├── main.py               # FastAPI entry + lifespan
│           ├── core/                 # config, logging
│           ├── api/                  # detection, training, models, health
│           ├── ml/                   # model_manager (singleton), detector
│           └── services/             # database, storage, trainer, similarity
│
├── packages/
│   ├── shared/                        # Types, resilience, caching, errors
│   ├── ml/                            # ONNX optimizer
│   └── ui/                            # UI library (leeg)
│
├── infrastructure/                    # Docker, K8s, Terraform, monitoring
├── tests/                             # E2E Playwright tests
└── docs/                              # Project documentatie
```

### Architectural Boundaries

**Service Communicatie:**

| Boundary | Communicatie | Protocol |
|----------|-------------|----------|
| Frontend → API | HTTP REST + Socket.IO | `/api/v1/*` endpoints |
| API → ML Service | HTTP REST (axios, 120s timeout) | `/ml/*` endpoints |
| API → PostgreSQL | Prisma ORM | TCP :5432 |
| API → Redis | ioredis + BullMQ | TCP :6379 |
| API → MinIO | MinIO client | HTTP :9000 |
| ML Service → PostgreSQL | asyncpg | TCP :5432 |
| ML Service → MinIO | boto3/MinIO | HTTP :9000 |

**Data Flow:**
```
Upload:    Browser → Fastify (multipart) → Sharp (validate/thumb) → MinIO
Annotate:  Browser → Fastify → Prisma (save) → Socket.IO (broadcast)
Train:     Browser → Fastify → BullMQ (queue) → ML Service → Socket.IO (progress) → MinIO (model)
Recognize: Browser → Fastify → ML Service (detect) → Response (boxes + confidence)
Activate:  Browser → Fastify → ML Service (unload → DB update → reload)
```

### Requirements to Structure Mapping

| FR Groep | API Route | Frontend | ML Service | Store |
|----------|----------|----------|------------|-------|
| Beeldbeheer (FR1-4) | `images.ts` | `BatchUploader`, `ImageLibrary` | — | `uploadStore` |
| Categoriebeheer (FR5-8) | `categories.ts` | `CategoryManager` | — | `trainingStore` |
| Annotatie (FR9-14) | `annotations.ts` | `AnnotationCanvas` | — | `trainingStore` |
| Model Training (FR15-20) | `training.ts` | `TrainingPipelinePage` | `training.py`, `trainer.py` | `trainingStore` |
| Model Beheer (FR21-24) | `training.ts` | `ModelsPage` | `models.py`, `model_manager.py` | `modelStore` |
| Herkenning (FR25-29) | `recognition.ts` | `RecognitionInterface`, `ResultsDisplay` | `detection.py` | `recognitionStore` |
| API (FR30-33) | `recognition.ts` | — | `detection.py` | — |
| Auth (FR34-37) | `auth.ts` | — | — | — |
| Monitoring (FR38-40) | `health.ts`, `stats.ts` | `DashboardPage` | `health.py` | `uiStore` |

### Cross-Cutting Concerns

| Concern | Locatie |
|---------|---------|
| Auth middleware | `apps/api/src/middleware/auth.ts` |
| Error handling | `apps/api/src/middleware/errorHandler.ts` |
| Logging | `apps/api/src/core/logger.ts`, `apps/ml-service/app/core/logging.py` |
| Real-time events | `apps/api/src/services/socket-io-manager.ts` |
| Storage | `apps/api/src/services/storage.ts`, `apps/ml-service/app/services/storage.py` |
| Shared types | `packages/shared/src/types/index.ts` |
| Resilience (unused) | `packages/shared/src/resilience/` |

## Architecture Validation Results

### Coherence Validation ✓

**Decision Compatibility:** Alle technologie-keuzes zijn compatibel en getest in de bestaande codebase. Geen versieconflicten.

**Pattern Consistency:** Naming conventions, project structure en communication patterns consistent gedefinieerd en gevalideerd tegen bestaande code.

**Structure Alignment:** Project structure reflecteert exact de bestaande codebase. Alle boundaries zijn operationeel.

### Requirements Coverage ✓

**FR Coverage:** Alle 40 FRs gemapped naar concrete bestanden — 9/9 capability areas architecturaal ondersteund.

**NFR Coverage:**
- Performance: <100ms inference via ONNX Runtime op dedicated ML service ✓
- Security: JWT + RBAC middleware + rate limiting ✓
- Scalability: Horizontale schaling via container orchestratie ✓
- Accessibility: WCAG 2.1 AA als frontend vereiste ✓
- Reliability: Health checks + graceful degradation ✓

### Implementation Readiness ✓

**Decision Completeness:** Alle technologie-keuzes gedocumenteerd met versies en rationale.
**Structure Completeness:** Volledige directory tree met FR-mapping.
**Pattern Completeness:** Naming, structure, format, communication en process patterns gedefinieerd met enforcement guidelines.

### Gap Analysis

| Prioriteit | Gap | Impact | Status |
|-----------|-----|--------|--------|
| Important | Circuit breaker niet geïntegreerd op ML client | Cascading failures bij ML service uitval | Post-MVP actie |
| Important | Retry pattern niet geïntegreerd op ML client | Transiente fouten niet afgevangen | Post-MVP actie |
| Important | Error format inconsistentie (route vs global) | Inconsistente error responses | Refactor kandidaat |
| Nice-to-have | Multi-layer cache ongebruikt | Herhaalde inference niet gecacht | Performance optimalisatie |
| Nice-to-have | packages/ui leeg | Geen shared UI library | Niet blokkerend |

### Architecture Completeness Checklist

**✓ Requirements Analysis**
- [x] Project context geanalyseerd (brownfield, 3 services, monorepo)
- [x] Scale en complexiteit vastgesteld (High)
- [x] Technische constraints geïdentificeerd (GPU, S3, pgvector)
- [x] Cross-cutting concerns gemapped (auth, errors, monitoring, storage)

**✓ Architecturale Beslissingen**
- [x] Data architectuur (PostgreSQL + Prisma + Redis + MinIO)
- [x] Auth & security (JWT + RBAC + rate limiting)
- [x] API & communicatie (REST + Socket.IO + axios)
- [x] Frontend (React + Zustand + TanStack Query + Konva)
- [x] Infrastructure (Docker + Coolify + prom-client)
- [x] ML deployment (ModelManager singleton + hot-swap)
- [x] File upload pipeline (multipart + Sharp + MinIO)

**✓ Implementation Patterns**
- [x] Naming conventions (DB, API, code, events)
- [x] Structure patterns (type-based, co-located tests)
- [x] Format patterns (JSON casing, error format, dates)
- [x] Communication patterns (Socket.IO events, Zustand stores)
- [x] Process patterns (error handling, loading states)
- [x] Enforcement guidelines en anti-patterns

**✓ Project Structure**
- [x] Complete directory tree
- [x] Service boundaries + data flow
- [x] FR → bestand mapping
- [x] Cross-cutting concerns mapping

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High — brownfield project met werkende codebase, architectuur gevalideerd tegen bestaande code.

**Key Strengths:**
- Duidelijke service boundaries (frontend / API gateway / ML service)
- Beproefde tech stack met bestaande implementatie
- Comprehensive patterns voor AI agent consistency
- Volledige FR-naar-bestand mapping

**Areas for Future Enhancement:**
- Integratie van resilience patterns (circuit breaker, retry) uit packages/shared
- Unificatie van error response format over alle routes
- Multi-layer caching voor inference resultaten
- Shared UI library (packages/ui) populeren

### Implementation Handoff

**AI Agent Guidelines:**
- Volg alle architecturale beslissingen exact zoals gedocumenteerd
- Gebruik implementation patterns consistent over alle componenten
- Respecteer project structure en boundaries
- Raadpleeg dit document voor alle architecturale vragen
- Bestaande code heeft voorrang bij conflicten met dit document

**Eerste Implementatie Prioriteit:**
MVP afronden en stabiliseren — focus op het completeren van openstaande functionaliteit binnen de bestaande architectuur.
