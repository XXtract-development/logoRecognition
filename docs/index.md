# Logo Recognition & Training System — Documentatie Index

**Gegenereerd:** 2026-03-31 | **Scan Level:** Exhaustive | **Modus:** Initial Scan

---

## Projectoverzicht

- **Type:** Monorepo (pnpm workspace) met 7 onderdelen
- **Primaire Talen:** TypeScript 5.7 (strict), Python 3.11
- **Architectuur:** Microservices (React SPA + Fastify API Gateway + FastAPI ML Service)
- **Database:** PostgreSQL 16 + pgvector | Redis 7 | MinIO (S3)

### Onderdelen

| Part | Pad | Type | Stack |
|------|-----|------|-------|
| web | `apps/web/` | Frontend | React 18.3 + Vite 6 + Ant Design 5 + Zustand 5 |
| api | `apps/api/` | Backend | Fastify 4 + Prisma 5 + BullMQ + Socket.IO |
| ml-service | `apps/ml-service/` | ML Service | FastAPI + PyTorch + ONNX Runtime |
| shared | `packages/shared/` | Library | Types + Circuit Breaker + Cache + Retry |
| ui | `packages/ui/` | Library | React + Ant Design (structuur, nog leeg) |
| ml | `packages/ml/` | Library | ONNX Optimizer + TensorFlow.js |
| infrastructure | `infrastructure/` | Infra | Docker + Kubernetes + Terraform + Monitoring |

---

## Gegenereerde Documentatie

### Architectuur
- [Projectoverzicht](./project-overview.md) — Samenvatting, tech stack, vereisten
- [Architectuur — Web Frontend](./architecture-web.md) — React componenten, state, routing, canvas
- [Architectuur — API Backend](./architecture-api.md) — Fastify routes, Prisma schema, security, services
- [Architectuur — ML Service](./architecture-ml-service.md) — FastAPI endpoints, training pipeline, modellen
- [Integratie Architectuur](./integration-architecture.md) — Service communicatie, data flows, environment vars

### API & Data
- [API Contracts — API Backend](./api-contracts-api.md) — Alle REST endpoints met request/response formaten
- [Data Models — API Backend](./data-models-api.md) — 20 Prisma modellen, relaties, pgvector

### Componenten
- [Component Inventaris — Web](./component-inventory-web.md) — Pagina's, componenten, stores, hooks, utilities

### Ontwikkeling & Deployment
- [Ontwikkelgids](./development-guide.md) — Installatie, commando's, testing, environment vars
- [Deployment Gids](./deployment-guide.md) — Docker, CI/CD, Kubernetes, monitoring

### Structuur
- [Source Tree Analyse](./source-tree-analysis.md) — Geannoteerde directory structuur

---

## Bestaande Documentatie

### Product
- [Product Requirements Document](./01-product/prd.md) — Complete product visie

### Architectuur (Bestaand)
- [Architecture Overview](./02-architecture/overview.md) — Bestaand architectuur overzicht
- [Current Architecture](./02-architecture/current-architecture.md) — Huidige architectuur
- [API Specification](./02-architecture/api-specification.md) — API specificatie
- [Data Models](./02-architecture/data-models.md) — Bestaande data modellen
- [Security](./02-architecture/security.md) — Security ontwerp
- [Tech Stack](./02-architecture/tech-stack.md) — Bestaande tech stack analyse

### Ontwikkeling (Bestaand)
- [Setup Guide](./03-development/setup.md) — Development setup
- [Coding Standards](./03-development/coding-standards.md) — Code standaarden
- [Workflows](./03-development/workflows.md) — Development workflows

### Deployment (Bestaand)
- [Deployment Guide](./04-deployment/deployment-guide.md) — Bestaande deployment gids

### Testing (Bestaand)
- [Testing Strategy](./05-testing/testing-strategy.md) — Test strategie

### Overig
- [Epics](./epics.md) — Epic overzicht
- [API Docker Usage](./API-DOCKER-USAGE.md) — Docker API gebruik

---

## Snel Starten

```bash
# Prerequisites
node --version  # ≥22.12.0
pnpm --version  # ≥9.15.0

# Installatie
pnpm install
cp .env.example .env.local

# Development
pnpm dev                    # Start web + api
# OF
docker-compose up -d        # Start via Docker

# Toegang
# Frontend:  http://localhost:5173 (Vite) of http://localhost:3000 (Docker)
# API:       http://localhost:8000
# ML Service: http://localhost:8001
```

---

## Voor AI-Assisted Development

Bij het werken met dit project:
- **UI features:** Refereer naar [architecture-web.md](./architecture-web.md) + [component-inventory-web.md](./component-inventory-web.md)
- **API features:** Refereer naar [architecture-api.md](./architecture-api.md) + [api-contracts-api.md](./api-contracts-api.md)
- **ML features:** Refereer naar [architecture-ml-service.md](./architecture-ml-service.md)
- **Full-stack:** Refereer naar bovenstaande + [integration-architecture.md](./integration-architecture.md)
- **Data model wijzigingen:** Refereer naar [data-models-api.md](./data-models-api.md)
