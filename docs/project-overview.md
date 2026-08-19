# Logo Recognition & Training System — Projectoverzicht

**Gegenereerd:** 2026-03-31
**Type:** Monorepo (pnpm workspace)
**Repository:** logoRecognition

---

## Samenvatting

Het Logo Recognition & Training System is een compleet platform voor automatische logoherkenning, annotatie en modeltraining. Het systeem combineert een React-gebaseerde frontend, een Fastify API-gateway, een Python ML-microservice en gedeelde TypeScript-bibliotheken in één monorepo.

**Kernfunctionaliteit:**
- Automatische logodetectie in afbeeldingen via deep learning (PyTorch/TensorFlow)
- Interactieve annotatie-editor met Konva canvas
- Complete training pipeline met modelversiebeheer
- Real-time voortgang via WebSocket/Socket.IO
- Batch-verwerking van grote datasets
- Feedback-loop met actief leren voor continue modelverbetering

---

## Monorepo Structuur

| Part | Pad | Type | Primaire Technologie |
|------|-----|------|---------------------|
| **web** | `apps/web/` | Frontend | React 18.3 + Vite 6 + Ant Design 5 + Zustand 5 |
| **api** | `apps/api/` | Backend API | Fastify 4 + Prisma 5 + BullMQ + Socket.IO |
| **ml-service** | `apps/ml-service/` | ML Microservice | FastAPI + PyTorch + TensorFlow + ONNX |
| **shared** | `packages/shared/` | Gedeelde Library | TypeScript types + resilience patterns |
| **ui** | `packages/ui/` | UI Library | React + Ant Design (structuur, nog leeg) |
| **ml** | `packages/ml/` | ML Utilities | ONNX Runtime + TensorFlow.js |
| **infrastructure** | `infrastructure/` | Infra-as-Code | Docker + Kubernetes + Terraform + Monitoring |

---

## Technologie Stack Overzicht

### Frontend (apps/web)
| Categorie | Technologie | Versie |
|-----------|-------------|--------|
| Framework | React | 18.3.1 |
| Build Tool | Vite | 6.0.3 |
| UI Library | Ant Design | 5.22.5 |
| State Management | Zustand | 5.0.2 |
| Server State | TanStack React Query | 5.62.0 |
| Canvas | Konva + React-Konva | 9.3.2 / 18.2.10 |
| Styling | Tailwind CSS | 3.4.17 |
| Routing | React Router DOM | 6.21.3 |
| i18n | i18next | 24.0.5 |
| WebSocket | Socket.IO Client | 4.8.1 |
| HTTP Client | Axios | 1.7.9 |
| Taal | TypeScript | 5.7.2 (strict) |

### API Backend (apps/api)
| Categorie | Technologie | Versie |
|-----------|-------------|--------|
| Framework | Fastify | 4.24.3 |
| ORM | Prisma | 5.9.1 |
| Queue | BullMQ | 5.1.9 |
| Cache | ioredis | 5.3.2 |
| WebSocket | Socket.IO Server | 4.8.1 |
| Auth | @fastify/jwt + bcrypt | 8.0.0 / 5.1.1 |
| Storage | MinIO (S3-compatibel) | 7.1.3 |
| Monitoring | Sentry + OpenTelemetry | 7.99.0 / 0.46.0 |
| Image Processing | Sharp | 0.33.2 |
| Logging | Winston | 3.11.0 |
| Metrics | prom-client | 15.1.0 |

### ML Microservice (apps/ml-service)
| Categorie | Technologie | Versie |
|-----------|-------------|--------|
| Framework | FastAPI | ≥0.100.0 |
| Deep Learning | PyTorch | ≥2.0.0 |
| Deep Learning | TensorFlow | ≥2.13.0 |
| Computer Vision | OpenCV | ≥4.8.0 |
| Model Serving | ONNX Runtime | ≥1.15.0 |
| Vector DB | PostgreSQL + pgvector | - |
| Object Storage | MinIO/boto3 | - |
| Async DB | asyncpg | - |
| Logging | structlog | - |

### Infrastructuur
| Categorie | Technologie |
|-----------|-------------|
| Database | PostgreSQL 16 + pgvector |
| Cache | Redis 7 |
| Object Storage | MinIO (S3-compatibel) |
| Container | Docker + Docker Compose |
| Orchestratie | Kubernetes (AWS EKS) |
| IaC | Terraform |
| CI/CD | GitHub Actions + Coolify |
| Monitoring | Prometheus 3.0 + Grafana 11.4 |
| Tracing | Jaeger + OpenTelemetry |
| Log Aggregatie | Loki + OpenSearch 2.18 |
| Security | Helmet + Rate Limiting + CORS |

---

## Architectuur Patroon

Het systeem volgt een **microservices-architectuur** met de volgende hoofdlagen:

1. **Presentatielaag** — React SPA met Ant Design, Konva canvas, Zustand state management
2. **API Gateway** — Fastify server met JWT auth, rate limiting, WebSocket ondersteuning
3. **ML Servicelaag** — FastAPI microservice voor inferentie en training
4. **Datalaag** — PostgreSQL (pgvector), Redis cache, MinIO object storage
5. **Infrastructuurlaag** — Docker, Kubernetes, Terraform, monitoring stack

### Communicatiepatronen
- **REST API** — Frontend ↔ API Backend (Axios)
- **REST API** — API Backend ↔ ML Service (Axios, timeout 120s)
- **WebSocket/Socket.IO** — Real-time updates (training voortgang, herkenningsresultaten)
- **BullMQ** — Asynchrone job queue (training jobs)
- **pgvector** — Vector similarity search voor logo matching

---

## Vereisten

| Vereiste | Minimum Versie |
|----------|---------------|
| Node.js | ≥22.12.0 |
| pnpm | ≥9.15.0 |
| Python | 3.11+ |
| PostgreSQL | 16+ (met pgvector extensie) |
| Redis | 7+ |
| Docker | Latest |
| MinIO | Latest |

---

## Gerelateerde Documentatie

- [Architectuur — Web Frontend](./architecture-web.md)
- [Architectuur — API Backend](./architecture-api.md)
- [Architectuur — ML Service](./architecture-ml-service.md)
- [API Contracts](./api-contracts-api.md)
- [Data Models](./data-models-api.md)
- [Integratie Architectuur](./integration-architecture.md)
- [Component Inventaris — Web](./component-inventory-web.md)
- [Ontwikkelgids](./development-guide.md)
- [Deployment Gids](./deployment-guide.md)
- [Source Tree Analyse](./source-tree-analysis.md)
