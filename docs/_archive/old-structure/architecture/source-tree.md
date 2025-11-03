# Source Tree Structure

> Version: 1.0.0
> Last Updated: 2025-09-29
> Status: Active

## Overview

This document describes the complete source tree structure of the logoRecognition project. It serves as a guide for developers to understand the project organization, locate specific functionality, and maintain consistent structure standards.

## Project Root Structure

```
logoRecognition/
├── backend/                 # Backend API service (FastAPI)
├── frontend/                # Frontend application (React)
├── infrastructure/          # Infrastructure as Code
├── models/                  # ML model storage
├── data/                    # Dataset management
├── docs/                    # Project documentation
├── tests/                   # Integration & E2E tests
├── scripts/                 # Utility scripts
├── .bmad-core/             # BMAD agent configuration
├── .claude/                # Claude Code configuration
├── .github/                # GitHub Actions workflows
├── docker-compose.yml      # Service orchestration
├── .env.example            # Environment variables template
├── Makefile               # Build automation
└── README.md              # Project overview
```

## Backend Structure (/backend)

### Overview
The backend follows a layered architecture pattern with clear separation of concerns.

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI app entry point
│   ├── celery_app.py          # Celery worker configuration
│   ├── config.py              # Application configuration
│   ├── ml_model.py           # ML model server
│   │
│   ├── api/                   # API versioning
│   │   ├── __init__.py
│   │   ├── v1/               # Version 1 endpoints
│   │   │   ├── __init__.py
│   │   │   └── endpoints.py
│   │   └── v2/               # Version 2 endpoints
│   │       ├── __init__.py
│   │       └── endpoints.py
│   │
│   ├── routers/              # FastAPI route handlers
│   │   ├── __init__.py
│   │   ├── auth.py          # Authentication endpoints
│   │   ├── images.py        # Image management
│   │   ├── annotations.py   # Annotation CRUD
│   │   ├── training.py      # Training pipeline
│   │   ├── models.py        # Model management
│   │   ├── batch.py         # Batch processing
│   │   ├── exports.py       # Data export
│   │   ├── users.py         # User management
│   │   ├── teams.py         # Team collaboration
│   │   ├── projects.py      # Project organization
│   │   ├── datasets.py      # Dataset management
│   │   ├── websocket.py     # WebSocket connections
│   │   └── health.py        # Health checks
│   │
│   ├── services/             # Business logic layer
│   │   ├── __init__.py
│   │   ├── auth_service.py          # Authentication logic
│   │   ├── image_service.py         # Image processing
│   │   ├── annotation_service.py    # Annotation management
│   │   ├── training_service.py      # Training orchestration
│   │   ├── model_service.py         # Model operations
│   │   ├── batch_service.py         # Batch processing
│   │   ├── export_service.py        # Export formats
│   │   ├── storage_service.py       # Object storage
│   │   ├── cache_service.py         # Caching logic
│   │   ├── notification_service.py  # Notifications
│   │   ├── search_service.py        # Search functionality
│   │   ├── ml_service.py           # ML operations
│   │   ├── vector_service.py       # Vector search
│   │   ├── optimization_service.py # Performance optimization
│   │   ├── audit_service.py        # Audit logging
│   │   ├── metrics_service.py      # Metrics collection
│   │   ├── email_service.py        # Email notifications
│   │   ├── webhook_service.py      # Webhook integration
│   │   ├── rate_limit_service.py   # Rate limiting
│   │   ├── permission_service.py   # RBAC
│   │   ├── session_service.py      # Session management
│   │   └── validation_service.py   # Data validation
│   │
│   ├── models/               # Data models
│   │   ├── __init__.py
│   │   ├── base.py          # Base model classes
│   │   ├── user.py          # User model
│   │   ├── image.py         # Image model
│   │   ├── annotation.py    # Annotation model
│   │   ├── project.py       # Project model
│   │   ├── dataset.py       # Dataset model
│   │   ├── training_job.py  # Training job model
│   │   ├── ml_model.py      # ML model metadata
│   │   ├── team.py          # Team model
│   │   ├── permission.py    # Permission model
│   │   ├── audit_log.py     # Audit log model
│   │   ├── notification.py  # Notification model
│   │   └── cache_entry.py   # Cache model
│   │
│   ├── schemas/              # Pydantic schemas
│   │   ├── __init__.py
│   │   ├── auth.py          # Auth request/response
│   │   ├── image.py         # Image DTOs
│   │   ├── annotation.py    # Annotation DTOs
│   │   ├── training.py      # Training DTOs
│   │   ├── batch.py         # Batch DTOs
│   │   ├── export.py        # Export DTOs
│   │   ├── user.py          # User DTOs
│   │   ├── pagination.py    # Pagination schemas
│   │   ├── error.py         # Error responses
│   │   └── websocket.py     # WebSocket messages
│   │
│   ├── core/                 # Core utilities
│   │   ├── __init__.py
│   │   ├── config.py        # Configuration management
│   │   ├── database.py      # Database connection
│   │   ├── security.py      # Security utilities
│   │   ├── cache.py         # Cache configuration
│   │   ├── logging.py       # Logging setup
│   │   ├── exceptions.py    # Custom exceptions
│   │   ├── dependencies.py  # FastAPI dependencies
│   │   ├── pagination.py    # Pagination helpers
│   │   ├── validators.py    # Input validators
│   │   └── constants.py     # Application constants
│   │
│   ├── middleware/           # Request middleware
│   │   ├── __init__.py
│   │   ├── auth.py          # Authentication middleware
│   │   ├── cors.py          # CORS configuration
│   │   ├── logging.py       # Request logging
│   │   ├── rate_limit.py    # Rate limiting
│   │   ├── security.py      # Security headers
│   │   ├── compression.py   # Response compression
│   │   ├── request_id.py    # Request ID tracking
│   │   └── metrics.py       # Metrics collection
│   │
│   ├── ml/                   # Machine Learning
│   │   ├── __init__.py
│   │   ├── models/          # Model architectures
│   │   │   ├── __init__.py
│   │   │   ├── efficientdet.py
│   │   │   ├── yolo.py
│   │   │   └── base_model.py
│   │   ├── training/        # Training logic
│   │   │   ├── __init__.py
│   │   │   ├── trainer.py
│   │   │   ├── augmentation.py
│   │   │   ├── dataset.py
│   │   │   └── metrics.py
│   │   ├── inference/       # Inference engine
│   │   │   ├── __init__.py
│   │   │   ├── onnx_runtime.py
│   │   │   ├── preprocessing.py
│   │   │   └── postprocessing.py
│   │   └── utils/          # ML utilities
│   │       ├── __init__.py
│   │       ├── transforms.py
│   │       ├── nms.py       # Non-max suppression
│   │       └── anchors.py
│   │
│   ├── storage/             # Storage abstraction
│   │   ├── __init__.py
│   │   ├── base.py         # Base storage interface
│   │   ├── minio_storage.py # MinIO implementation
│   │   ├── s3_storage.py   # AWS S3 implementation
│   │   └── local_storage.py # Local filesystem
│   │
│   ├── workers/             # Background workers
│   │   ├── __init__.py
│   │   ├── celery_worker.py # Celery tasks
│   │   ├── tasks/
│   │   │   ├── __init__.py
│   │   │   ├── image_tasks.py
│   │   │   ├── training_tasks.py
│   │   │   ├── export_tasks.py
│   │   │   └── notification_tasks.py
│   │   └── beat_schedule.py # Scheduled tasks
│   │
│   └── utils/               # General utilities
│       ├── __init__.py
│       ├── image_utils.py  # Image processing
│       ├── file_utils.py   # File operations
│       ├── date_utils.py   # Date/time helpers
│       ├── string_utils.py # String operations
│       ├── crypto_utils.py # Cryptography
│       └── network_utils.py # Network utilities
│
├── tests/                   # Test suite
│   ├── __init__.py
│   ├── conftest.py         # Pytest configuration
│   ├── unit/               # Unit tests
│   │   ├── test_services/
│   │   ├── test_models/
│   │   ├── test_utils/
│   │   └── test_ml/
│   ├── integration/        # Integration tests
│   │   ├── test_api/
│   │   ├── test_database/
│   │   └── test_storage/
│   ├── e2e/               # End-to-end tests
│   │   └── test_workflows.py
│   ├── performance/       # Performance tests
│   │   └── test_load.py
│   └── fixtures/          # Test data
│       ├── images/
│       └── data.json
│
├── alembic/               # Database migrations
│   ├── versions/
│   ├── alembic.ini
│   └── env.py
│
├── scripts/               # Utility scripts
│   ├── setup_db.py
│   ├── seed_data.py
│   └── export_metrics.py
│
├── requirements.txt       # Python dependencies
├── requirements-dev.txt   # Development dependencies
├── Dockerfile            # Container definition
├── .dockerignore        # Docker ignore patterns
├── pyproject.toml       # Python project config
└── setup.py            # Package setup
```

## Frontend Structure (/frontend)

### Overview
The frontend follows React best practices with feature-based organization.

```
frontend/
├── public/
│   ├── index.html          # HTML template
│   ├── manifest.json       # PWA manifest
│   ├── robots.txt         # Search engine rules
│   └── assets/            # Static assets
│       ├── images/
│       └── icons/
│
├── src/
│   ├── index.tsx          # Application entry point
│   ├── App.tsx           # Root component
│   ├── setupTests.ts     # Test configuration
│   ├── react-app-env.d.ts # TypeScript declarations
│   │
│   ├── components/        # Reusable components
│   │   ├── common/       # Generic components
│   │   │   ├── Button/
│   │   │   ├── Card/
│   │   │   ├── Modal/
│   │   │   ├── Table/
│   │   │   ├── Form/
│   │   │   ├── Layout/
│   │   │   ├── Loading/
│   │   │   └── ErrorBoundary/
│   │   ├── features/     # Feature-specific components
│   │   │   ├── ImageUpload/
│   │   │   ├── ImageViewer/
│   │   │   ├── AnnotationCanvas/
│   │   │   ├── ModelSelector/
│   │   │   ├── TrainingMonitor/
│   │   │   ├── BatchProcessor/
│   │   │   ├── ExportDialog/
│   │   │   ├── ProjectCard/
│   │   │   ├── DatasetGrid/
│   │   │   └── UserProfile/
│   │   └── charts/       # Data visualization
│   │       ├── PerformanceChart/
│   │       ├── AccuracyGraph/
│   │       └── ConfusionMatrix/
│   │
│   ├── pages/            # Page components
│   │   ├── HomePage/
│   │   ├── LoginPage/
│   │   ├── DashboardPage/
│   │   ├── ImagesPage/
│   │   ├── AnnotationPage/
│   │   ├── TrainingPage/
│   │   ├── ModelsPage/
│   │   ├── ProjectsPage/
│   │   ├── SettingsPage/
│   │   ├── ProfilePage/
│   │   └── NotFoundPage/
│   │
│   ├── layouts/          # Layout components
│   │   ├── MainLayout/
│   │   ├── AuthLayout/
│   │   └── DashboardLayout/
│   │
│   ├── services/         # API services
│   │   ├── api.ts       # Axios configuration
│   │   ├── authService.ts
│   │   ├── imageService.ts
│   │   ├── annotationService.ts
│   │   ├── trainingService.ts
│   │   ├── modelService.ts
│   │   ├── projectService.ts
│   │   ├── userService.ts
│   │   ├── batchService.ts
│   │   ├── exportService.ts
│   │   ├── websocketService.ts
│   │   └── notificationService.ts
│   │
│   ├── stores/           # Zustand stores
│   │   ├── authStore.ts
│   │   ├── imageStore.ts
│   │   ├── annotationStore.ts
│   │   ├── trainingStore.ts
│   │   ├── uiStore.ts
│   │   ├── notificationStore.ts
│   │   └── websocketStore.ts
│   │
│   ├── hooks/            # Custom hooks
│   │   ├── useAuth.ts
│   │   ├── useApi.ts
│   │   ├── useWebSocket.ts
│   │   ├── useImageUpload.ts
│   │   ├── useAnnotation.ts
│   │   ├── useDebounce.ts
│   │   ├── useLocalStorage.ts
│   │   ├── useInfiniteScroll.ts
│   │   ├── useKeyboard.ts
│   │   └── useMediaQuery.ts
│   │
│   ├── utils/            # Utility functions
│   │   ├── constants.ts
│   │   ├── helpers.ts
│   │   ├── validators.ts
│   │   ├── formatters.ts
│   │   ├── localStorage.ts
│   │   ├── dates.ts
│   │   ├── images.ts
│   │   └── errors.ts
│   │
│   ├── types/            # TypeScript types
│   │   ├── index.ts
│   │   ├── api.types.ts
│   │   ├── models.types.ts
│   │   ├── components.types.ts
│   │   └── store.types.ts
│   │
│   ├── styles/           # Global styles
│   │   ├── index.css
│   │   ├── variables.css
│   │   ├── mixins.css
│   │   └── themes/
│   │       ├── light.css
│   │       └── dark.css
│   │
│   ├── config/           # Configuration
│   │   ├── index.ts
│   │   ├── api.config.ts
│   │   ├── routes.config.ts
│   │   └── features.config.ts
│   │
│   ├── router/           # Routing configuration
│   │   ├── index.tsx
│   │   ├── routes.tsx
│   │   └── PrivateRoute.tsx
│   │
│   └── i18n/            # Internationalization
│       ├── index.ts
│       └── locales/
│           ├── en.json
│           ├── es.json
│           └── fr.json
│
├── tests/               # Test files
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── package.json        # Dependencies
├── package-lock.json   # Lock file
├── tsconfig.json      # TypeScript config
├── .eslintrc.js       # ESLint config
├── .prettierrc        # Prettier config
├── jest.config.js     # Jest configuration
├── Dockerfile         # Container definition
└── nginx.conf        # Nginx configuration
```

## Infrastructure (/infrastructure)

```
infrastructure/
├── docker/             # Docker configurations
│   ├── backend/
│   │   └── Dockerfile
│   ├── frontend/
│   │   └── Dockerfile
│   └── nginx/
│       ├── Dockerfile
│       └── nginx.conf
│
├── kubernetes/        # Kubernetes manifests
│   ├── base/
│   │   ├── namespace.yaml
│   │   ├── configmap.yaml
│   │   └── secrets.yaml
│   ├── deployments/
│   │   ├── backend.yaml
│   │   ├── frontend.yaml
│   │   ├── postgres.yaml
│   │   ├── redis.yaml
│   │   └── minio.yaml
│   ├── services/
│   │   └── *.yaml
│   └── ingress/
│       └── ingress.yaml
│
├── terraform/         # Infrastructure as Code
│   ├── modules/
│   ├── environments/
│   └── main.tf
│
├── helm/             # Helm charts
│   └── logo-recognition/
│       ├── Chart.yaml
│       ├── values.yaml
│       └── templates/
│
└── scripts/          # Deployment scripts
    ├── deploy.sh
    ├── rollback.sh
    └── backup.sh
```

## Documentation (/docs)

```
docs/
├── architecture/           # Architecture documentation
│   ├── README.md
│   ├── coding-standards.md
│   ├── tech-stack.md
│   ├── source-tree.md      # This document
│   ├── system-design.md
│   ├── api-design.md
│   ├── database-schema.md
│   └── deployment.md
│
├── production-readiness/   # Sprint documentation
│   ├── sprint1_foundation/
│   ├── sprint2_core_features/
│   └── sprint3_optimization/
│
├── stories/               # User stories
│   ├── completed/
│   └── backlog/
│
├── qa/                    # QA reports
│   ├── test-reports/
│   └── performance-reports/
│
├── api/                   # API documentation
│   ├── openapi.yaml
│   └── postman-collection.json
│
└── guides/               # Developer guides
    ├── getting-started.md
    ├── development.md
    ├── testing.md
    └── deployment.md
```

## Data & Models

```
data/                    # Dataset storage
├── raw/                # Original datasets
├── processed/          # Preprocessed data
├── augmented/         # Augmented datasets
└── exports/           # Exported data

models/                 # ML models
├── checkpoints/       # Training checkpoints
├── production/        # Production models
├── experiments/       # Experimental models
└── onnx/             # ONNX format models
```

## Configuration Files

### Root Configuration Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Multi-container orchestration |
| `docker-compose.override.yml` | Local development overrides |
| `docker-compose.prod.yml` | Production configuration |
| `.env.example` | Environment variables template |
| `.gitignore` | Git ignore patterns |
| `Makefile` | Build automation commands |
| `README.md` | Project documentation |
| `LICENSE` | Software license |

### Backend Configuration

| File | Purpose |
|------|---------|
| `requirements.txt` | Python dependencies |
| `requirements-dev.txt` | Development dependencies |
| `pyproject.toml` | Python project configuration |
| `setup.py` | Package setup script |
| `.flake8` | Flake8 linter config |
| `.mypy.ini` | MyPy type checker config |
| `pytest.ini` | Pytest configuration |
| `.coveragerc` | Coverage configuration |

### Frontend Configuration

| File | Purpose |
|------|---------|
| `package.json` | Node.js dependencies |
| `tsconfig.json` | TypeScript configuration |
| `.eslintrc.js` | ESLint configuration |
| `.prettierrc` | Prettier formatting |
| `jest.config.js` | Jest testing config |
| `craco.config.js` | CRA customization |

## File Naming Conventions

### Python Files (Backend)
- **Modules**: `snake_case.py`
- **Test files**: `test_*.py`
- **Config files**: `*_config.py`
- **Services**: `*_service.py`
- **Models**: Singular nouns in `snake_case.py`

### TypeScript/JavaScript Files (Frontend)
- **Components**: `PascalCase.tsx`
- **Utilities**: `camelCase.ts`
- **Test files**: `*.test.tsx` or `*.spec.tsx`
- **Styles**: `*.module.css` or `*.styled.ts`
- **Types**: `*.types.ts`
- **Constants**: `UPPER_SNAKE_CASE` in files

### Directory Naming
- **General**: `lowercase` or `kebab-case`
- **React components**: `PascalCase/`
- **Feature modules**: `kebab-case/`

## Import Path Aliases

### Backend (Python)
```python
# Absolute imports from app root
from app.services.image_service import ImageService
from app.models.user import User
from app.core.config import settings
```

### Frontend (TypeScript)
```typescript
// Path aliases configured in tsconfig.json
import { Button } from '@/components/common/Button';
import { useAuth } from '@/hooks/useAuth';
import { imageService } from '@/services/imageService';
import type { User } from '@/types';
```

## Module Responsibilities

### Backend Modules

| Module | Responsibility |
|--------|---------------|
| **routers/** | HTTP endpoint definitions, request/response handling |
| **services/** | Business logic, orchestration, external integrations |
| **models/** | Database models, ORM definitions |
| **schemas/** | Pydantic models for validation and serialization |
| **core/** | Application configuration, shared utilities |
| **ml/** | Machine learning models and inference |
| **workers/** | Background task processing |
| **storage/** | File storage abstraction |

### Frontend Modules

| Module | Responsibility |
|--------|---------------|
| **components/** | Reusable UI components |
| **pages/** | Route-level page components |
| **services/** | API communication layer |
| **stores/** | Global state management |
| **hooks/** | Custom React hooks |
| **utils/** | Helper functions and utilities |
| **types/** | TypeScript type definitions |

## Development Workflow

### Adding New Features

1. **Backend API**:
   - Create router in `/backend/app/routers/`
   - Implement service in `/backend/app/services/`
   - Add models to `/backend/app/models/`
   - Define schemas in `/backend/app/schemas/`
   - Write tests in `/backend/tests/`

2. **Frontend UI**:
   - Create components in `/frontend/src/components/`
   - Add page in `/frontend/src/pages/`
   - Implement service in `/frontend/src/services/`
   - Update store in `/frontend/src/stores/`
   - Add types to `/frontend/src/types/`

3. **Documentation**:
   - Update API docs in `/docs/api/`
   - Add user story to `/docs/stories/`
   - Update architecture if needed

## Best Practices

### Code Organization
1. **Single Responsibility**: Each module should have one clear purpose
2. **Consistent Naming**: Follow established naming conventions
3. **Logical Grouping**: Related files should be in the same directory
4. **Shallow Nesting**: Avoid deep directory structures (max 4 levels)
5. **Clear Dependencies**: Use explicit imports, avoid circular dependencies

### File Size Guidelines
- **Python modules**: < 500 lines
- **React components**: < 300 lines
- **Service files**: < 400 lines
- **Test files**: Can be larger but organize with test classes

### Documentation Requirements
- **Every module**: Must have a module-level docstring
- **Public functions**: Must have docstrings with type hints
- **Complex logic**: Must have inline comments
- **API endpoints**: Must have OpenAPI documentation
- **Components**: Must have JSDoc comments

---

**Note**: This source tree structure is designed for scalability and maintainability. Regular refactoring ensures the structure remains clean and efficient as the project grows.