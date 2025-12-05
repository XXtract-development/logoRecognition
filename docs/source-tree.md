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
