# Logo Recognition & Training System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb)](https://reactjs.org/)
[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688)](https://fastapi.tiangolo.com/)

> Een complete monorepo voor logo detectie, training en annotatie met state-of-the-art ML modellen

## 🚀 Features

- **🎯 Smart Logo Detection** - Automatische logo herkenning met PyTorch & TensorFlow
- **✏️ Interactive Annotation** - Canvas-based annotation interface met Konva
- **🤖 ML Training Pipeline** - Complete training workflow met model versioning
- **📊 Real-time Updates** - WebSocket integratie voor live progress tracking
- **🔄 Batch Processing** - Efficiënte verwerking van grote datasets
- **📈 Analytics Dashboard** - Comprehensive metrics en performance monitoring
- **🔐 Enterprise Security** - JWT auth, rate limiting, audit logging

## 📦 Monorepo Structuur

```
logoRecognition/
├── apps/
│   ├── web/          # React 18.3 + Vite + Ant Design - Frontend
│   ├── api/          # Fastify + Prisma + BullMQ - API Backend
│   └── ...
├── backend/          # FastAPI + PyTorch + TensorFlow - ML Backend
├── packages/
│   ├── shared/       # Shared TypeScript types
│   ├── ui/           # Reusable React components
│   └── ml/           # ML utilities
└── docs/             # Complete project documentation
```

## 🛠️ Tech Stack

### Frontend
- **Framework:** React 18.3.1 + TypeScript 5.6
- **Build Tool:** Vite 6.0.3
- **UI:** Ant Design 5.22.5
- **State:** Zustand 5.0.2 + TanStack Query 5.62
- **Canvas:** Konva + React-Konva

### API Backend
- **Framework:** Fastify 4.24.3
- **ORM:** Prisma 5.9.1
- **Queue:** BullMQ 5.1.9
- **Cache:** ioredis 5.3.2
- **Monitoring:** Sentry + OpenTelemetry

### ML Backend
- **Framework:** FastAPI ≥0.100.0
- **ML:** PyTorch ≥2.0.0 + TensorFlow ≥2.13.0
- **CV:** OpenCV ≥4.8.0
- **Vector DB:** ChromaDB ≥0.4.0

### Infrastructure
- **Database:** PostgreSQL + pgvector
- **Cache:** Redis
- **Storage:** S3 / MinIO
- **Deployment:** Docker + Kubernetes

## 🚀 Quick Start

### Prerequisites
- Node.js ≥22.12.0
- pnpm ≥9.15.0
- Python 3.11+
- PostgreSQL 15+
- Redis 7+

### Installation

```bash
# Clone repository
git clone https://github.com/xxtract/logoRecognition.git
cd logoRecognition

# Install dependencies
pnpm install

# Setup environment variables
cp .env.example .env.local
# Edit .env.local with your configuration

# Start development servers
pnpm dev
```

### Access Points
- **Frontend:** http://localhost:5173
- **API Backend:** http://localhost:3000
- **ML Backend:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs

## 📚 Documentation

Complete documentatie is beschikbaar in de [`docs/`](./docs) directory:

- **[Product Requirements](./docs/01-product/prd.md)** - Complete product visie
- **[Architecture Overview](./docs/02-architecture/overview.md)** - System design
- **[Setup Guide](./docs/03-development/setup.md)** - Development setup
- **[API Specification](./docs/02-architecture/api-specification.md)** - REST & WebSocket API
- **[Testing Strategy](./docs/05-testing/testing-strategy.md)** - Test guidelines

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Frontend tests (Vitest + Playwright)
cd apps/web && pnpm test

# API Backend tests (Jest)
cd apps/api && pnpm test

# ML Backend tests (pytest)
cd backend && pytest
```

## 🏗️ Development

```bash
# Start all services in development mode
pnpm dev

# Lint all code
pnpm lint

# Format all code
pnpm format

# Build all packages
pnpm build
```

## 🐳 Docker Deployment

### Quick Start - Complete Stack ✅

```bash
# Start both API and Frontend
docker-compose up -d

# Test frontend
open http://localhost:3000

# Test API
curl http://localhost:8000/health
# Response: {"status":"ok","timestamp":"..."}

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

**Status:** ✅ **Both Containers Fully Working**
- **Frontend:** http://localhost:3000 (React + Vite)
- **API:** http://localhost:8000 (Fastify)
- **Response Time:** ~22ms
- **Hot Reload:** Enabled for both

### Individual Services

```bash
# Start only API
docker-compose up -d api

# Start only Frontend
docker-compose up -d web

# View specific logs
docker-compose logs -f api
docker-compose logs -f web

# Rebuild after code changes
docker-compose up -d --build
```

**📖 Uitgebreide Docs:**
- **Quick Start:** [DOCKER-QUICKSTART.md](./DOCKER-QUICKSTART.md)
- **API Usage:** [docs/API-DOCKER-USAGE.md](./docs/API-DOCKER-USAGE.md)
- **Code Examples:** [apps/api/examples/](./apps/api/examples/)
- **Test Script:** Run `./apps/api/examples/test-api.sh`

## 📈 Project Stats

- **2500+ Files** committed
- **818K+ Lines** of code
- **6 Packages** (3 apps + 3 shared)
- **100+ Tests** (Unit, Integration, E2E)
- **Complete CI/CD** pipeline

## 🤝 Contributing

Zie [Coding Standards](./docs/03-development/coding-standards.md) en [Workflows](./docs/03-development/workflows.md) voor contribution guidelines.

## 📄 License

MIT License - zie [LICENSE](./LICENSE) bestand

## 🙏 Acknowledgments

- Built with [Claude Code](https://claude.com/claude-code)
- UI components by [Ant Design](https://ant.design/)
- ML powered by [PyTorch](https://pytorch.org/) & [TensorFlow](https://www.tensorflow.org/)

---

**Maintained by:** [@xxtract](https://github.com/xxtract)
**Generated with:** [Claude Code](https://claude.com/claude-code)
