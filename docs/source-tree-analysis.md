# Source Tree Analyse

**Gegenereerd:** 2026-03-31 | **Scan Level:** Exhaustive

---

## Geannoteerde Directory Structuur

```
logoRecognition/                          # Monorepo root
├── apps/                                 # Applicaties
│   ├── web/                              # React Frontend (Part: web)
│   │   ├── src/
│   │   │   ├── main.tsx                  # ⚡ Entry point — React DOM mount
│   │   │   ├── App.tsx                   # ⚡ Router, providers, code splitting
│   │   │   ├── components/
│   │   │   │   ├── common/               # AppLayout, ErrorBoundary, ConnectionStatus, EmptyState
│   │   │   │   ├── recognition/          # ImageUploader, BoundingBoxCanvas, ResultsDisplay, ExportDialog
│   │   │   │   ├── training/             # ImageLibrary, BatchUploader, CategoryManager
│   │   │   │   └── annotation/           # AnnotationCanvas (Konva bounding box editor)
│   │   │   ├── pages/                    # HomePage, Dashboard, Training, Models, Annotation, Pipeline
│   │   │   ├── stores/                   # Zustand stores (7): recognition, training, model, upload, ws, theme, ui
│   │   │   ├── services/                 # API clients: model, training, dashboard, healthCheck
│   │   │   ├── hooks/                    # Custom hooks (7): useWebSocket, useDebounce, useLocalStorage, etc.
│   │   │   ├── contexts/                 # BackendStatusContext (health checking)
│   │   │   ├── types/                    # TypeScript types (7 bestanden)
│   │   │   ├── utils/                    # export, format, image, validation, performance
│   │   │   ├── constants/                # App configuratie constanten
│   │   │   └── i18n/                     # i18next configuratie (6 talen)
│   │   ├── vite.config.ts                # Vite build + proxy + PWA + chunk splitting
│   │   ├── tailwind.config.js            # Tailwind theme + custom animaties
│   │   ├── tsconfig.json                 # TypeScript strict + path aliases
│   │   ├── Dockerfile                    # Frontend container
│   │   └── package.json                  # @logo-recognition/web
│   │
│   ├── api/                              # Fastify API Backend (Part: api)
│   │   ├── src/
│   │   │   ├── main.ts                   # ⚡ Entry point — Productie server (port 8000)
│   │   │   ├── main-simple.ts            # ⚡ Entry point — Development/demo server
│   │   │   ├── api/v1/                   # REST routes
│   │   │   │   ├── auth.ts               # Login, register, refresh, logout, me
│   │   │   │   ├── recognition.ts        # Detect, upload, batch, history
│   │   │   │   ├── images.ts             # Training image CRUD + bulk
│   │   │   │   ├── categories.ts         # Logo categorie CRUD + merge
│   │   │   │   ├── annotations.ts        # Annotatie CRUD + smart-click + review
│   │   │   │   ├── training.ts           # Training jobs starten/monitoren
│   │   │   │   ├── feedback.ts           # Feedback + actief leren + retraining
│   │   │   │   ├── stats.ts              # Dashboard statistieken
│   │   │   │   └── health.ts             # Health + readiness + liveness probes
│   │   │   ├── middleware/               # auth, errorHandler, tracing
│   │   │   ├── services/                 # auth, ml-client, storage (MinIO), socket-io, websocket
│   │   │   ├── core/                     # logger (Winston), telemetry (OTel), sentry
│   │   │   ├── prisma/                   # Prisma schema (20 modellen)
│   │   │   └── __tests__/                # 13 test bestanden
│   │   ├── Dockerfile                    # API container
│   │   └── package.json                  # @logo-recognition/api
│   │
│   └── ml-service/                       # Python ML Microservice (Part: ml-service)
│       ├── app/
│       │   ├── main.py                   # ⚡ Entry point — FastAPI (port 8001)
│       │   ├── core/                     # config (pydantic-settings), logging (structlog)
│       │   ├── ml/                       # model_manager (ONNX/PyTorch), detector (NMS, contour)
│       │   ├── api/                      # detection, training, models, health endpoints
│       │   └── services/                 # database (asyncpg), storage (MinIO), similarity, trainer
│       ├── requirements.txt              # Python dependencies
│       └── Dockerfile                    # Multi-stage build (python:3.11-slim)
│
├── packages/                             # Gedeelde Libraries
│   ├── shared/                           # @logo-recognition/shared
│   │   └── src/
│   │       ├── types/index.ts            # RecognitionResult, Detection, BoundingBox, User
│   │       ├── resilience/               # circuitBreaker, retry (exponential backoff + jitter)
│   │       ├── utils/caching.ts          # MultiLayerCache (L1 LRU + L2 Redis + L3 CDN)
│   │       └── errors/errorHandler.ts    # RFC 7807 errors, error budget tracking
│   │
│   ├── ui/                               # @logo-recognition/ui (structuur, nog leeg)
│   │   └── src/components/               # (leeg)
│   │
│   └── ml/                               # @logo-recognition/ml
│       └── src/optimization/
│           └── onnxOptimizer.ts           # ONNX model laden, warmup, caching, CUDA/CoreML/CPU
│
├── infrastructure/                       # Infrastructure as Code
│   ├── docker/                           # PostgreSQL init (pgvector), Prometheus, Nginx WAF, Redis
│   ├── kubernetes/                       # Deployments, services, HPA (3-20 replicas)
│   ├── terraform/                        # Cloud infra definities
│   └── monitoring/                       # docker-compose.monitoring.yml
│
├── tests/                                # Test Suites
│   ├── e2e/                              # Playwright specs
│   ├── e2e-cypress/                      # Cypress specs
│   ├── integration/                      # API integratie tests
│   ├── unit/                             # Unit tests
│   ├── load/                             # K6 performance tests (100-200 VU)
│   ├── security/                         # Security tests
│   ├── chaos/                            # Chaos engineering tests
│   ├── contract/                         # Contract tests
│   ├── visual/                           # Visual regression (Backstop)
│   ├── validation/                       # API validatie
│   └── fixtures/                         # Test data
│
├── scripts/                              # Utility Scripts
│   ├── deployment/                       # Docker compose files, start scripts
│   ├── development/                      # Migrations, image optimalisatie
│   ├── testing/                          # 12+ test runner scripts
│   ├── qa/                               # QA validatie scripts
│   └── setup/                            # Implementatie en feature setup
│
├── docs/                                 # Project Documentatie
│   ├── 01-product/                       # PRD
│   ├── 02-architecture/                  # Architecture overview, API spec, data models, security
│   ├── 03-development/                   # Setup, coding standards, workflows
│   ├── 04-deployment/                    # Deployment guide
│   └── 05-testing/                       # Testing strategy
│
├── .github/workflows/                    # CI/CD Pipelines (7 workflow bestanden)
├── backend/migrations/                   # Legacy (leeg)
├── design-artifacts/                     # Product Brief, Trigger Map, UX, PRD, Testing
│
├── package.json                          # Root workspace config
├── pnpm-workspace.yaml                   # Workspace definitie: apps/*, packages/*, tests/*
├── docker-compose.yml                    # Basis stack (web + api)
├── docker-compose.full.yml               # Volledige stack (11+ services)
├── playwright.config.ts                  # E2E test configuratie
├── .env.example                          # Environment template
└── README.md                             # Project documentatie
```

---

## Kritieke Mappen Samenvatting

| Map | Doel | Belang |
|-----|------|--------|
| `apps/web/src/components/` | Alle React componenten | Frontend kern |
| `apps/web/src/stores/` | Zustand state management | Data flow |
| `apps/api/src/api/v1/` | Alle REST endpoints | API definitie |
| `apps/api/src/services/` | Backend business logica | Service laag |
| `apps/api/src/prisma/` | Database schema | Data model |
| `apps/ml-service/app/ml/` | ML inferentie en detectie | AI kern |
| `apps/ml-service/app/services/` | Training pipeline | ML operaties |
| `packages/shared/src/` | Gedeelde types en resilience | Cross-cutting |
| `infrastructure/kubernetes/` | K8s manifests | Productie deployment |
| `.github/workflows/` | CI/CD pipelines | Automatisering |
