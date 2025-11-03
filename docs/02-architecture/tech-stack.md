# Technology Stack Analyse - Logo Recognition Monorepo

**Gegenereerd op:** 2025-11-03
**Scan Level:** Exhaustive
**Project Type:** Monorepo

---

## Overzicht

Dit is een **full-stack monorepo** project met 6 delen: 3 applicaties en 3 gedeelde libraries.

---

## 1. Frontend Web Applicatie (apps/web)

### Kern Tech Stack
| Category | Technology | Version | Rol |
|----------|------------|---------|-----|
| **Framework** | React | 18.3.1 | UI framework |
| **Build Tool** | Vite | 6.0.3 | Build & dev server |
| **Language** | TypeScript | 5.7.2 | Type-safe JavaScript |
| **UI Library** | Ant Design | 5.22.5 | Component library |
| **State Management** | Zustand | 5.0.2 | Global state |
| **Routing** | React Router DOM | 6.21.3 | Client-side routing |
| **Data Fetching** | TanStack Query | 5.62.0 | Server state management |
| **HTTP Client** | Axios | 1.7.9 | API requests |
| **Real-time** | Socket.IO Client | 4.8.1 | WebSocket verbinding |
| **i18n** | i18next + react-i18next | 24.0.5 + 15.1.3 | Internationalisatie |

### Canvas & Image Processing
| Technology | Version | Doel |
|------------|---------|------|
| Konva | 9.3.2 | Canvas engine |
| React-Konva | 18.2.10 | React bindings voor Konva |
| React-Dropzone | 14.3.5 | File upload interface |

### Utilities & Formatting
| Technology | Version | Doel |
|------------|---------|------|
| Day.js | 1.11.13 | Date utilities |
| jsPDF | 2.5.2 | PDF generation |
| PapaParse | 5.4.1 | CSV parsing |
| Immer | 10.1.1 | Immutable state |

### Testing
| Technology | Version | Doel |
|------------|---------|------|
| Vitest | 2.1.8 | Unit testing framework |
| @testing-library/react | 16.0.1 | React component testing |
| Playwright | 1.49.1 | E2E testing |
| MSW | 2.6.6 | API mocking |

### Performance & Quality
| Technology | Version | Doel |
|------------|---------|------|
| React Window | 1.8.10 | Virtualized lists |
| React Intersection Observer | 9.14.0 | Lazy loading |
| Web Vitals | 4.2.4 | Performance metrics |
| Axe Core | 4.10.2 | Accessibility testing |
| Lighthouse | 12.3.0 | Performance auditing |

### Styling
| Technology | Version | Doel |
|------------|---------|------|
| Tailwind CSS | 3.4.17 | Utility-first CSS |
| PostCSS | 8.4.49 | CSS processing |
| Autoprefixer | 10.4.20 | CSS vendor prefixes |

### Architecture Pattern
**Component-based Architecture** met:
- Layered structure (components, pages, services)
- State management via Zustand stores
- API layer abstractie met TanStack Query
- Real-time updates via Socket.IO

---

## 2. Node.js API Backend (apps/api)

### Kern Tech Stack
| Category | Technology | Version | Rol |
|----------|------------|---------|-----|
| **Framework** | Fastify | 4.24.3 | Web framework (performance-focused) |
| **Language** | TypeScript | 5.3.3 | Type-safe JavaScript |
| **Runtime** | Node.js | ≥20.11.16 | JavaScript runtime |
| **ORM** | Prisma | 5.9.1 | Database ORM |
| **Cache** | ioredis | 5.3.2 | Redis client |
| **Queue** | BullMQ | 5.1.9 | Job queue |
| **WebSocket** | @fastify/websocket | 8.3.1 | Real-time communicatie |

### Security & Middleware
| Technology | Version | Doel |
|------------|---------|------|
| @fastify/cors | 8.4.2 | CORS handling |
| @fastify/helmet | 11.1.1 | Security headers |
| @fastify/rate-limit | 9.1.0 | Rate limiting |

### Observability
| Technology | Version | Doel |
|------------|---------|------|
| @sentry/node | 7.99.0 | Error tracking |
| @opentelemetry/sdk-node | 0.46.0 | Telemetry |
| prom-client | 15.1.0 | Prometheus metrics |
| Winston | 3.11.0 | Logging |

### Testing
| Technology | Version | Doel |
|------------|---------|------|
| Jest | 29.7.0 | Testing framework |

### Architecture Pattern
**Service-oriented Architecture** met:
- Routes/Controllers layer
- Service layer voor business logic
- Prisma ORM voor data access
- BullMQ voor async jobs
- Redis voor caching en sessions

---

## 3. Python ML Backend (backend/)

### Kern Tech Stack
| Category | Technology | Version | Rol |
|----------|------------|---------|-----|
| **Framework** | FastAPI | ≥0.100.0 | API framework |
| **ML Framework** | PyTorch | ≥2.0.0 | Deep learning |
| **ML Framework** | TensorFlow | ≥2.13.0 | Machine learning |
| **Transformers** | Transformers | ≥4.30.0 | Pre-trained models |
| **Server** | Uvicorn | ≥0.23.0 | ASGI server |
| **Language** | Python | 3.x | Programming language |

### Computer Vision
| Technology | Version | Doel |
|------------|---------|------|
| OpenCV | ≥4.8.0 | Computer vision |
| Pillow | ≥10.0.0 | Image processing |
| scikit-image | ≥0.21.0 | Image algorithms |
| Albumentations | ≥1.3.0 | Image augmentation |

### ML Utilities
| Technology | Version | Doel |
|------------|---------|------|
| scikit-learn | ≥1.3.0 | ML algorithms |
| FAISS | ≥1.7.4 | Similarity search |
| ONNX | ≥1.14.0 | Model interchange |
| ONNX Runtime | ≥1.15.0 | ONNX inference |

### Data Processing
| Technology | Version | Doel |
|------------|---------|------|
| NumPy | ≥1.24.0 | Numerical computing |
| Pandas | ≥2.0.0 | Data manipulation |
| SciPy | ≥1.11.0 | Scientific computing |

### Image Hashing
| Technology | Version | Doel |
|------------|---------|------|
| ImageHash | ≥4.3.1 | Perceptual hashing |
| pHash | ≥0.0.1 | Perceptual hashing |

### Databases
| Technology | Version | Doel |
|------------|---------|------|
| ChromaDB | ≥0.4.0 | Vector database |
| PyMongo | ≥4.4.0 | MongoDB client |

### Caching & Monitoring
| Technology | Version | Doel |
|------------|---------|------|
| Redis | ≥5.0.0 | Caching |
| Prometheus Client | ≥0.18.0 | Metrics |
| Schedule | ≥1.2.0 | Task scheduling |

### Visualization
| Technology | Version | Doel |
|------------|---------|------|
| Matplotlib | ≥3.7.0 | Plotting |
| Seaborn | ≥0.12.0 | Statistical viz |
| Plotly | ≥5.15.0 | Interactive plots |

### Development Tools
| Technology | Version | Doel |
|------------|---------|------|
| pytest | ≥7.4.0 | Testing |
| Black | ≥23.0.0 | Code formatting |
| Flake8 | ≥6.0.0 | Linting |
| JupyterLab | ≥4.0.0 | Notebooks |

### Database Migration
| Technology | Doel |
|------------|------|
| Alembic | Database migrations |

### Architecture Pattern
**ML Pipeline Architecture** met:
- FastAPI voor REST API
- PyTorch/TensorFlow voor model training
- ONNX voor model deployment
- ChromaDB voor vector similarity search
- Albumentations voor data augmentation pipeline

---

## 4. Shared Library (packages/shared)

### Tech Stack
| Technology | Version | Rol |
|------------|---------|-----|
| TypeScript | 5.3.3 | Type definitions |
| UUID | 9.0.1 | ID generation |
| Jest | 29.7.0 | Testing |

### Doel
Gedeelde TypeScript types, interfaces en utilities tussen web en api voor type consistency.

---

## 5. UI Components Library (packages/ui)

### Tech Stack
| Technology | Version | Rol |
|------------|---------|-----|
| React | 18.2.0 | UI framework |
| Ant Design | 5.13.3 | Base components |
| TypeScript | 5.3.3 | Type safety |
| Jest | 29.7.0 | Testing |

### Doel
Herbruikbare React UI componenten die gebruikt worden door web applicatie.

---

## 6. ML Utilities Library (packages/ml)

### Tech Stack
| Technology | Version | Rol |
|------------|---------|-----|
| TypeScript | 5.3.3 | Type definitions |

### Doel
ML-gerelateerde TypeScript utilities en types voor frontend/API integratie met ML backend.

---

## Infrastructuur & DevOps

### Package Management
| Tool | Versie | Scope |
|------|--------|-------|
| pnpm | ≥9.15.0 | Monorepo package manager |
| pip | Latest | Python packages |

### Node.js Requirement
- **Minimum:** Node.js ≥22.12.0

### Docker & Containers
- docker-compose.yml - Development environment
- docker-compose.test.yml - Testing environment
- docker-compose.minio.yml - MinIO storage

### Deployment Platforms
- **Coolify** - Primary deployment platform
  - coolify-backend.yml
  - coolify-frontend.yml
  - coolify-services.yml

### Kubernetes
- k8s/ - Kubernetes configurations voor production

### CI/CD
- .github/workflows/ - GitHub Actions

### Databases
| Database | Gebruik | Toegang Via |
|----------|---------|-------------|
| PostgreSQL + pgvector | Primaire database | Prisma (API), Direct (Python) |
| Redis | Cache & sessions | ioredis (API), redis-py (Python) |
| ChromaDB | Vector embeddings | Python |
| MongoDB | Optional data store | PyMongo |

### Storage
| Storage | Gebruik |
|---------|---------|
| S3 / MinIO | Object storage voor images en models |

### Monitoring & Observability
| Tool | Gebruik |
|------|---------|
| Sentry | Error tracking (API) |
| OpenTelemetry | Distributed tracing (API) |
| Prometheus | Metrics (API + Python) |
| Winston | Logging (API) |

---

## Architectuur Patronen per Part

### apps/web
**Pattern:** Component-based Architecture
**State:** Zustand (global) + React Query (server state)
**Styling:** Tailwind CSS + Ant Design
**Real-time:** Socket.IO client

### apps/api
**Pattern:** Service-oriented Architecture
**Layers:** Routes → Services → Prisma
**Queue:** BullMQ voor async work
**Cache:** Redis

### backend/ (Python ML)
**Pattern:** ML Pipeline Architecture
**Training:** PyTorch/TensorFlow pipelines
**Inference:** ONNX Runtime
**Vector Search:** ChromaDB + FAISS

---

## Integration Stack

### Frontend ↔ API
- **Protocol:** REST API + WebSocket
- **Format:** JSON
- **Auth:** JWT tokens (assumed)
- **Real-time:** Socket.IO

### API ↔ ML Backend
- **Protocol:** HTTP REST
- **Format:** JSON
- **Communication:** Fastify → FastAPI

### Shared Code
- **packages/shared:** TypeScript types shared tussen web en api
- **packages/ui:** React components shared in web
- **packages/ml:** ML-related types/utilities

---

## Build & Development Tools

### TypeScript Ecosystem
- **Compiler:** TypeScript 5.3.3 - 5.7.2
- **Linting:** ESLint met TypeScript parser
- **Formatting:** Prettier

### Testing Ecosystem
- **Frontend:** Vitest + Playwright + Testing Library
- **API:** Jest
- **Python:** pytest

### Build Tools
- **Frontend:** Vite (bundling + dev server)
- **API:** TypeScript compiler (tsc)
- **Python:** Standard Python tooling

---

## Key Technology Decisions

### Why Fastify over Express?
- **Performance:** Significant throughput improvements
- **Modern:** Native async/await, schema validation
- **Ecosystem:** Strong plugin ecosystem

### Why Vite over Webpack?
- **Speed:** Lightning-fast HMR
- **Modern:** ES modules native support
- **DX:** Superior developer experience

### Why Zustand over Redux?
- **Simplicity:** Less boilerplate
- **Performance:** Minimal re-renders
- **TypeScript:** Excellent TS support

### Why Prisma?
- **Type Safety:** Full TypeScript integration
- **DX:** Intuitive query API
- **Migrations:** Built-in migration system

### Why FastAPI for ML Backend?
- **Performance:** ASGI-based, async support
- **Documentation:** Auto-generated OpenAPI
- **Modern:** Python 3.7+ features

### Why PyTorch + TensorFlow?
- **Flexibility:** PyTorch voor research/development
- **Production:** TensorFlow/ONNX voor deployment
- **Ecosystem:** Best of both worlds

---

## Justificatie Architecture Pattern

### Monorepo Structure
**Voordelen:**
- Shared code via packages
- Unified dependency management
- Atomic cross-package changes
- Single CI/CD pipeline

**Challenges:**
- Requires pnpm workspaces knowledge
- Build orchestration complexity
- Careful dependency management

### Why This Stack?
1. **Modern & Performant:** Vite, Fastify, FastAPI - all performance-optimized
2. **Type Safety:** End-to-end TypeScript (waar mogelijk)
3. **Developer Experience:** Excellent tooling across all layers
4. **Production Ready:** Battle-tested technologies
5. **ML-First:** Purpose-built for ML/CV workloads

---

## Version Summary

| Component | Primary Framework | Version |
|-----------|------------------|---------|
| Frontend | React | 18.3.1 |
| API | Fastify | 4.24.3 |
| ML Backend | FastAPI | ≥0.100.0 |
| ML Framework | PyTorch | ≥2.0.0 |
| ORM | Prisma | 5.9.1 |
| Build Tool | Vite | 6.0.3 |
| Language (TS) | TypeScript | 5.3.3 - 5.7.2 |
| Runtime | Node.js | ≥22.12.0 |
| Package Manager | pnpm | ≥9.15.0 |

---

**Generated by:** BMAD Document Project Workflow
**Reference:** See `/docs/architecture/3-tech-stack.md` for original architecture decisions
