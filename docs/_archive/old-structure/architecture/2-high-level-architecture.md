# 2. High Level Architecture

## 2.1 Technical Summary

The Logo Recognition System employs a microservices architecture with clear separation between the ML pipeline, API layer, and frontend applications. The system uses FastAPI for the backend to leverage Python's ML ecosystem, React with TypeScript for a responsive frontend, and WebSocket connections for real-time training feedback. Infrastructure is containerized using Docker and orchestrated with Coolify for simplified deployment and scaling. The architecture prioritizes accuracy over speed, employing EfficientDet-D4 for detection with a strict 99% confidence threshold, while maintaining sub-500ms response times through intelligent caching and ONNX runtime optimization.

## 2.2 Platform and Infrastructure Choice

**Platform:** Self-hosted with Coolify
**Key Services:** Coolify (deployment), S3/MinIO (storage), PostgreSQL, Redis, Traefik (reverse proxy)
**Deployment:** Single VPS or dedicated server with Coolify orchestration

**Rationale:** Coolify provides a self-hosted alternative to expensive cloud platforms like AWS/Vercel, offering complete control over infrastructure, cost-effective scaling, and simplified Docker-based deployments. This approach reduces vendor lock-in while maintaining professional deployment capabilities with built-in SSL, monitoring, and zero-downtime deployments.

## 2.3 Repository Structure

**Structure:** Monorepo
**Monorepo Tool:** pnpm workspaces
**Package Organization:**
- `apps/` - Web and API applications
- `packages/` - Shared code, types, and utilities
- `infrastructure/` - IaC definitions

## 2.4 High Level Architecture Diagram

```mermaid
graph TB
    subgraph "Client Layer"
        WEB[React Web App]
        CAM[IP Cameras]
        API_CLIENT[API Clients]
    end

    subgraph "API Gateway Layer"
        TRAEFIK[Traefik (Coolify)]
        WS[WebSocket Server]
        RATE[Rate Limiter]
    end

    subgraph "Application Layer"
        FAST[FastAPI Server]
        AUTH[Auth Service]
    end

    subgraph "Processing Layer"
        CELERY[Celery Workers]
        TRAIN[Training Pipeline]
        INFER[Inference Engine]
    end

    subgraph "ML Layer"
        EFFICIENT[EfficientDet-D4]
        ONNX[ONNX Runtime]
        AUGMENT[Data Augmentation]
        RETRO[Retroactive Learning]
    end

    subgraph "Data Layer"
        PG[(PostgreSQL + pgvector)]
        REDIS[(Redis Cache)]
        S3[(S3 Object Storage)]
    end

    WEB --> TRAEFIK
    CAM --> TRAEFIK
    API_CLIENT --> TRAEFIK
    TRAEFIK --> RATE
    RATE --> FAST
    FAST --> AUTH
    FAST --> WS
    FAST --> CELERY
    CELERY --> TRAIN
    CELERY --> INFER
    TRAIN --> EFFICIENT
    INFER --> ONNX
    TRAIN --> AUGMENT
    TRAIN --> RETRO
    FAST --> PG
    FAST --> REDIS
    CELERY --> S3
    TRAIN --> PG
    INFER --> PG
```

## 2.5 Architectural Patterns

- **Microservices Architecture:** Separation of concerns between training, inference, and API services - _Rationale:_ Independent scaling and deployment of ML and web components
- **Event-Driven Processing:** Celery for async task processing - _Rationale:_ Non-blocking training and batch processing workflows
- **Repository Pattern:** Abstract data access logic in backend - _Rationale:_ Testability and potential database migration flexibility
- **Component-Based UI:** Reusable React components with TypeScript - _Rationale:_ Maintainability and type safety across the frontend
- **API Gateway Pattern:** Centralized entry point for all API calls - _Rationale:_ Unified auth, rate limiting, and monitoring
- **CQRS Pattern:** Separate read/write models for training vs inference - _Rationale:_ Optimize for different access patterns
- **Circuit Breaker Pattern:** Resilient external service calls - _Rationale:_ Graceful degradation when ML services are unavailable
- **Jamstack Principles:** Static generation where possible - _Rationale:_ Optimal performance for documentation and marketing pages

---
