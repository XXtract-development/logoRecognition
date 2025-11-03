# Architectuur Overzicht

**Project:** Logo Recognition System
**Type:** Full-Stack Monorepo
**Laatst bijgewerkt:** 2025-11-03

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  React Web App (apps/web)                            │  │
│  │  - Vite Build                                        │  │
│  │  - Ant Design UI                                     │  │
│  │  - Zustand State                                     │  │
│  │  - Socket.IO Client                                  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ REST API + WebSocket
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      API GATEWAY LAYER                       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Fastify API (apps/api)                              │  │
│  │  - Route Handlers                                    │  │
│  │  - Business Logic Services                           │  │
│  │  - Prisma ORM                                        │  │
│  │  - BullMQ Job Queue                                  │  │
│  │  - WebSocket Server                                  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ HTTP API
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      ML PIPELINE LAYER                       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  FastAPI ML Backend (backend/)                       │  │
│  │  - Training Pipeline (PyTorch/TensorFlow)            │  │
│  │  - Inference Engine (ONNX Runtime)                   │  │
│  │  - Data Augmentation (Albumentations)                │  │
│  │  - Vector Search (ChromaDB + FAISS)                  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      DATA LAYER                              │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ PostgreSQL   │  │   Redis      │  │   S3/MinIO       │  │
│  │ + pgvector   │  │   Cache      │  │   Storage        │  │
│  │              │  │   Sessions   │  │   Images/Models  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                              │
│  ┌──────────────┐                                           │
│  │  ChromaDB    │                                           │
│  │  Vectors     │                                           │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Architectuur Patterns

### 1. Monorepo Pattern
**Rationale:** Gedeelde code, unified versioning, atomic changes

**Structure:**
```
logoRecognition/
├── apps/
│   ├── web/          # React Frontend
│   └── api/          # Node.js API
├── backend/          # Python ML Backend
└── packages/
    ├── shared/       # Shared TS types
    ├── ui/           # Shared React components
    └── ml/           # ML TS utilities
```

### 2. Layered Architecture

#### Frontend (apps/web)
```
src/
├── components/       # React components
├── pages/            # Route pages
├── stores/           # Zustand stores
├── services/         # API clients
└── utils/            # Utilities
```

**Pattern:** Component-based met unidirectional data flow

#### API Gateway (apps/api)
```
src/
├── routes/           # Fastify routes
├── services/         # Business logic
├── models/           # Prisma models
├── middleware/       # Auth, validation
└── jobs/             # BullMQ jobs
```

**Pattern:** Service-oriented architecture

#### ML Backend (backend/)
```
app/
├── api/              # FastAPI routes
├── services/         # ML services
├── models/           # ML model definitions
├── pipelines/        # Training pipelines
└── utils/            # Utilities
```

**Pattern:** ML Pipeline architecture

### 3. Communication Patterns

#### Synchronous (REST)
- Frontend → API: REST endpoints
- API → ML Backend: HTTP requests
- Response format: JSON

#### Asynchronous (WebSocket)
- Frontend ↔ API: Real-time updates
- Training progress notifications
- Recognition result streaming

#### Event-Driven (Queue)
- API → BullMQ: Job queuing
- Async training triggers
- Batch processing

---

## Core Workflows

### 1. Training Workflow

```
User uploads images
      ↓
Frontend: Batch upload component
      ↓
API: Upload endpoint → S3 storage
      ↓
API: Create training job → BullMQ
      ↓
ML Backend: Fetch images from S3
      ↓
ML Backend: Data augmentation (Albumentations)
      ↓
ML Backend: Train model (PyTorch/TensorFlow)
      ↓
ML Backend: Export to ONNX
      ↓
ML Backend: Store model in S3
      ↓
API: Update training status → WebSocket
      ↓
Frontend: Display completion
```

### 2. Recognition Workflow

```
User uploads image
      ↓
Frontend: Recognition component
      ↓
API: Recognition endpoint
      ↓
ML Backend: Load ONNX model
      ↓
ML Backend: Preprocess image
      ↓
ML Backend: Inference (ONNX Runtime)
      ↓
ML Backend: Post-process results
      ↓
API: Format response
      ↓
Frontend: Display results with bounding boxes
```

### 3. Self-Learning Workflow

```
Recognition result with low confidence
      ↓
System: Flag for review (Active Learning)
      ↓
User: Provide correct label
      ↓
API: Store feedback
      ↓
ML Backend: Add to training queue
      ↓
ML Backend: Incremental training
      ↓
ML Backend: Model update
      ↓
API: Notify via WebSocket
```

---

## Data Flow

### Training Data Flow
```
Images (S3) → Augmentation → Training → Model (ONNX) → S3
                                 ↓
                            Metrics → PostgreSQL
```

### Recognition Data Flow
```
Image Upload → API → ML Backend → Inference → Results
                         ↓                        ↓
                   PostgreSQL ←───────────────────┘
                   (logging)
```

---

## Security Architecture

### Authentication & Authorization
- **Method:** JWT tokens
- **Storage:** HTTP-only cookies
- **Refresh:** Token rotation
- **RBAC:** Role-based access control

### API Security
- **HTTPS:** TLS 1.3 only
- **CORS:** Restricted origins
- **Rate Limiting:** Per-user limits
- **Input Validation:** Schema validation (Zod/Pydantic)
- **Helmet:** Security headers

### Data Security
- **Encryption at Rest:** AES-256
- **Encryption in Transit:** TLS
- **Secrets Management:** Environment variables
- **Audit Logging:** All mutations logged

Voor details zie: [Security](./security.md)

---

## Performance Optimizations

### Frontend
- **Code Splitting:** Route-based splitting
- **Lazy Loading:** Components on demand
- **Image Optimization:** WebP format, lazy load
- **Virtual Lists:** React Window voor grote lijsten
- **Caching:** TanStack Query caching

### API
- **Connection Pooling:** Prisma connection pool
- **Redis Caching:** Frequent queries cached
- **Response Compression:** Gzip/Brotli
- **Database Indexing:** Optimized indexes

### ML Backend
- **ONNX Runtime:** Optimized inference
- **Model Quantization:** Reduced model size
- **Batch Inference:** Process multiple images
- **GPU Acceleration:** CUDA support
- **Vector Caching:** ChromaDB caching

---

## Scalability Strategy

### Horizontal Scaling
- **Frontend:** Static hosting (CDN)
- **API:** Multiple instances (load balanced)
- **ML Backend:** GPU worker pools
- **Database:** Read replicas

### Auto-Scaling
- **Trigger:** CPU/Memory thresholds
- **Min/Max:** 2-10 instances
- **Cooldown:** 5 minutes

### Data Partitioning
- **Images:** Sharded by user/category
- **Models:** Versioned storage
- **Vectors:** Distributed ChromaDB

---

## Monitoring & Observability

### Metrics (Prometheus)
- Request rate/latency
- Error rates
- Training job status
- Model performance metrics

### Logging (Winston + Python logging)
- Structured JSON logs
- Error tracking (Sentry)
- Request tracing

### Tracing (OpenTelemetry)
- Distributed tracing
- Service mesh visibility
- Performance bottlenecks

Voor details zie: `_archive/old-structure/architecture/19-monitoring-and-observability.md`

---

## Deployment Architecture

### Environments
1. **Development:** Local Docker Compose
2. **Staging:** Kubernetes cluster (staging namespace)
3. **Production:** Kubernetes cluster (prod namespace)

### CI/CD Pipeline
```
Git Push
  ↓
GitHub Actions
  ↓
Build & Test
  ↓
Docker Images
  ↓
Push to Registry
  ↓
Kubernetes Deploy
  ↓
Health Checks
  ↓
Production
```

### Infrastructure
- **Platform:** Coolify (primary) + Kubernetes
- **Container Registry:** Docker Hub / GitHub Container Registry
- **DNS:** Cloudflare
- **SSL:** Let's Encrypt

Voor details zie: [Deployment Guide](../04-deployment/deployment-guide.md)

---

## Technology Decisions

### Key Choices & Rationale

**React 18.3 + Vite:**
- ✅ Modern, fast development
- ✅ Excellent DX (Hot Module Replacement)
- ✅ Strong ecosystem

**Fastify over Express:**
- ✅ 2-3x better performance
- ✅ Built-in schema validation
- ✅ Modern async/await

**Prisma ORM:**
- ✅ Type-safe database access
- ✅ Auto-generated migrations
- ✅ Excellent TypeScript support

**FastAPI for ML:**
- ✅ Fast async Python framework
- ✅ Auto OpenAPI docs
- ✅ Pydantic validation

**PyTorch + TensorFlow:**
- ✅ PyTorch for research/training
- ✅ TensorFlow for production (ONNX)
- ✅ Best of both worlds

**PostgreSQL + pgvector:**
- ✅ Reliable RDBMS
- ✅ Native vector support
- ✅ JSON support

**pnpm Monorepo:**
- ✅ Fast, efficient
- ✅ Workspace support
- ✅ Strict dependency isolation

---

## References

**Detailed Architecture Docs (Archived):**
- Complete architecture: `_archive/old-structure/architecture/`
- Component specs: `_archive/old-structure/architecture/6-components.md`
- Database schema: `_archive/old-structure/architecture/9-database-schema.md`
- Frontend architecture: `_archive/old-structure/architecture/10-frontend-architecture.md`
- Backend architecture: `_archive/old-structure/architecture/11-backend-architecture.md`

**Related Docs:**
- [Tech Stack Details](./tech-stack.md)
- [Data Models](./data-models.md)
- [API Specification](./api-specification.md)
- [Security Architecture](./security.md)

---

**Laatst bijgewerkt:** 2025-11-03
