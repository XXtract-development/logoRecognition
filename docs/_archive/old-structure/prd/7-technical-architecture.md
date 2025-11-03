# 7. Technical Architecture

## 7.1 Technology Stack
| Component | Technology | Rationale |
|-----------|-----------|-----------|
| ML Model | EfficientDet-D4 | 95-99% accuracy achievable |
| Training | Few-shot Learning | Minimal samples needed |
| Backend | FastAPI (Python) | ML integration, async support |
| Database | PostgreSQL + pgvector | Vector similarity search |
| Cache | Redis | Session & result caching |
| Storage | S3-compatible | Scalable image storage |
| Frontend | React + TypeScript | Modern, maintainable UI |
| Deployment | Docker + Coolify | Self-hosted deployment orchestration |

## 7.2 System Architecture
```
┌─────────────────────────────────────────┐
│     Web UI (React) / IP Cameras         │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│     API Gateway (Traefik via Coolify)   │
│         + Rate Limiting                 │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│      FastAPI Server + WebSocket         │
├─────────────────────────────────────────┤
│  Celery Workers │ Background Tasks      │
├─────────────────────────────────────────┤
│   Training      │    Recognition        │
│   Pipeline      │    Pipeline           │
│   - Few-shot    │    - EfficientDet-D4  │
│   - Augmentation│    - ONNX Runtime     │
│   - Retroactive │    - 99% Threshold    │
├─────────────┴───────────────────────────┤
│  PostgreSQL  │  Redis  │  S3/MinIO      │
│  + pgvector  │  Cache  │  Storage       │
└──────────────┴─────────┴────────────────┘
```

## 7.3 Key Architectural Components

| Layer | Component | Purpose |
|-------|-----------|---------|
| **Client** | React SPA | Training UI, result visualization |
| **Client** | IP Camera Integration | Real-time production monitoring |
| **Gateway** | Traefik (via Coolify) | Load balancing, SSL, rate limiting |
| **API** | FastAPI | REST endpoints, business logic |
| **Real-time** | WebSocket Server | Live progress updates, notifications |
| **Processing** | Celery Workers | Async training, batch processing |
| **ML** | EfficientDet-D4 | Logo detection with 99% accuracy |
| **ML** | ONNX Runtime | Optimized inference |
| **ML** | Few-shot Learning | Minimal training samples (5-10) |
| **Storage** | PostgreSQL + pgvector | Metadata + vector similarity |
| **Cache** | Redis | Session management, job queues |
| **Files** | S3/MinIO | Image and model storage |

---
