# Logo Recognition System - Documentatie

**Project:** Logo Recognition & Training System
**Type:** Monorepo (pnpm workspaces)
**Laatst bijgewerkt:** 2025-11-03

---

## 🚀 Quick Start

```bash
# Installeer dependencies
pnpm install

# Start development servers
pnpm dev

# Run tests
pnpm test
```

**Vereisten:** Node.js ≥22.12.0, pnpm ≥9.15.0, Python 3.x, PostgreSQL, Redis

---

## 📚 Documentatie Structuur

### 1. Product (`01-product/`)
- **[Product Requirements Document](./01-product/prd.md)** - Complete product visie, requirements en roadmap

### 2. Architectuur (`02-architecture/`)
- **[Architectuur Overzicht](./02-architecture/overview.md)** - System design en architectuur patronen
- **[Technology Stack](./02-architecture/tech-stack.md)** - Complete tech stack analyse
- **[Data Models](./02-architecture/data-models.md)** - Database schema en modellen
- **[API Specificatie](./02-architecture/api-specification.md)** - REST API en WebSocket specs
- **[Security](./02-architecture/security.md)** - Security architectuur en best practices

### 3. Development (`03-development/`)
- **[Setup Guide](./03-development/setup.md)** - Development environment setup
- **[Workflows](./03-development/workflows.md)** - Development workflows en processes
- **[Coding Standards](./03-development/coding-standards.md)** - Code stijl en best practices

### 4. Deployment (`04-deployment/`)
- **[Deployment Guide](./04-deployment/deployment-guide.md)** - Deployment strategie en CI/CD

### 5. Testing (`05-testing/`)
- **[Testing Strategy](./05-testing/testing-strategy.md)** - Test strategie en voorbeelden

---

## 🏗️ Project Structuur

Dit is een **monorepo** met 6 onderdelen:

### Apps (3)
| App | Type | Stack | Beschrijving |
|-----|------|-------|--------------|
| **apps/web** | Frontend | React 18.3 + Vite + Ant Design | Web applicatie UI |
| **apps/api** | Backend | Fastify 4.24 + Prisma | Node.js API server |
| **backend/** | ML Backend | FastAPI + PyTorch + TensorFlow | Python ML pipeline |

### Packages (3)
| Package | Beschrijving |
|---------|--------------|
| **packages/shared** | Gedeelde TypeScript types en utilities |
| **packages/ui** | Herbruikbare React UI componenten |
| **packages/ml** | ML-gerelateerde TypeScript utilities |

### Integratie

```
apps/web (React)
    ↓ REST + WebSocket
apps/api (Fastify)
    ↓ HTTP
backend/ (FastAPI ML)
```

---

## ⚡ Tech Stack Highlights

### Frontend
- **Framework:** React 18.3.1
- **Build Tool:** Vite 6.0.3
- **UI Library:** Ant Design 5.22.5
- **State:** Zustand 5.0.2
- **Data Fetching:** TanStack Query 5.62.0
- **Canvas:** Konva + React-Konva

### API Backend
- **Framework:** Fastify 4.24.3
- **ORM:** Prisma 5.9.1
- **Queue:** BullMQ 5.1.9
- **Cache:** ioredis 5.3.2
- **WebSocket:** @fastify/websocket
- **Monitoring:** Sentry + OpenTelemetry

### ML Backend
- **Framework:** FastAPI ≥0.100.0
- **ML:** PyTorch ≥2.0.0 + TensorFlow ≥2.13.0
- **CV:** OpenCV ≥4.8.0
- **Vector DB:** ChromaDB ≥0.4.0
- **Augmentation:** Albumentations ≥1.3.0

### Infrastructure
- **Database:** PostgreSQL + pgvector
- **Cache:** Redis
- **Storage:** S3 / MinIO
- **Deployment:** Coolify + Kubernetes
- **CI/CD:** GitHub Actions

---

## 📖 Gebruik van deze Documentatie

### Voor Nieuwe Developers
1. Start met [Setup Guide](./03-development/setup.md)
2. Lees [PRD](./01-product/prd.md) voor product begrip
3. Bekijk [Architectuur Overzicht](./02-architecture/overview.md)
4. Review [Coding Standards](./03-development/coding-standards.md)

### Voor Feature Development
1. Check [PRD](./01-product/prd.md) voor requirements
2. Review [API Specificatie](./02-architecture/api-specification.md)
3. Check [Data Models](./02-architecture/data-models.md)
4. Volg [Development Workflows](./03-development/workflows.md)

### Voor DevOps/Deployment
1. Lees [Deployment Guide](./04-deployment/deployment-guide.md)
2. Check [Security](./02-architecture/security.md)
3. Review infrastructuur requirements in [Tech Stack](./02-architecture/tech-stack.md)

### Voor Testing
1. Review [Testing Strategy](./05-testing/testing-strategy.md)
2. Check test voorbeelden per component type
3. Run test suites volgens development workflow

---

## 🔧 Development Commands

### Root Level
```bash
pnpm dev          # Start all services
pnpm build        # Build all packages
pnpm test         # Run all tests
pnpm lint         # Lint all code
pnpm format       # Format all code
```

### Per Package
```bash
# Frontend (apps/web)
cd apps/web
pnpm dev          # http://localhost:5173
pnpm test         # Vitest + Playwright
pnpm build        # Production build

# API (apps/api)
cd apps/api
pnpm dev          # Development server
pnpm test         # Jest tests
pnpm build        # TypeScript build

# ML Backend (backend/)
cd backend
uvicorn app.main:app --reload  # Dev server
pytest                          # Tests
```

---

## 📦 Environment Variables

### apps/web (.env)
```env
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
```

### apps/api (.env)
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/logo_recognition
REDIS_URL=redis://localhost:6379
ML_BACKEND_URL=http://localhost:8000
JWT_SECRET=your-secret-key
```

### backend/ (.env)
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/logo_recognition
S3_ENDPOINT=http://localhost:9000
REDIS_URL=redis://localhost:6379
```

---

## 📂 Gearchiveerde Documentatie

Oude/verouderde documentatie is gearchiveerd in:
- **`_archive/old-structure/`** - Originele PRD, Architecture, Stories, etc.
- **`_archive/root-reports/`** - Historical status reports
- **`_meta/`** - Metadata en scan reports

---

## 🤝 Contribution

Zie [Coding Standards](./03-development/coding-standards.md) en [Workflows](./03-development/workflows.md) voor contribution guidelines.

---

## 📞 Support

Voor vragen of issues, raadpleeg de relevante documentatie sectie of check de gearchiveerde detailed reports in `_archive/`.

---

**Gegenereerd door:** BMAD Document Project Workflow
**Versie:** 2.0.0 (Geconsolideerd)
**Datum:** 2025-11-03
