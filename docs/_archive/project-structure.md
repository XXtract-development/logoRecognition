# Project Structuur - Logo Recognition

**Gegenereerd op:** 2025-11-03
**Project Type:** Monorepo
**Aantal Onderdelen:** 6

## Repository Type

Dit is een **monorepo** project met meerdere samenhangende onderdelen georganiseerd via pnpm workspaces.

## Project Onderdelen

### 1. Frontend Web Applicatie (apps/web)
- **Type:** Web
- **Root Path:** `/apps/web`
- **Tech Stack:** React 18.3.1, TypeScript, Vite 6.0.3
- **Primaire Framework:** React met Ant Design UI
- **State Management:** Zustand
- **Belangrijkste Dependencies:**
  - react-router-dom (routing)
  - antd (UI components)
  - axios (HTTP client)
  - socket.io-client (WebSocket)
  - react-i18next (internationalisatie)
  - @tanstack/react-query (data fetching)
  - konva/react-konva (canvas voor image annotation)

### 2. API Backend (apps/api)
- **Type:** Backend
- **Root Path:** `/apps/api`
- **Tech Stack:** Node.js, TypeScript, Fastify 4.24.3
- **Database:** Prisma ORM
- **Belangrijkste Dependencies:**
  - fastify (web framework)
  - @fastify/websocket (real-time communicatie)
  - @prisma/client (database)
  - ioredis (caching)
  - bullmq (job queue)
  - @sentry/node (error tracking)
  - @opentelemetry (observability)

### 3. Python ML Backend (backend/)
- **Type:** Backend (ML/Data)
- **Root Path:** `/backend`
- **Tech Stack:** Python, FastAPI, PyTorch, TensorFlow
- **Belangrijkste Dependencies:**
  - torch, torchvision (deep learning)
  - tensorflow, transformers (ML frameworks)
  - opencv-python (computer vision)
  - fastapi (API framework)
  - albumentations (image augmentation)
  - imagehash, phash (image similarity)
  - chromadb, pymongo (databases)

### 4. Shared Library (packages/shared)
- **Type:** Library
- **Root Path:** `/packages/shared`
- **Tech Stack:** TypeScript
- **Doel:** Gedeelde types, interfaces en utilities tussen web en api

### 5. UI Components Library (packages/ui)
- **Type:** Library
- **Root Path:** `/packages/ui`
- **Tech Stack:** React, TypeScript, Ant Design
- **Doel:** Herbruikbare React UI componenten

### 6. ML Utilities Library (packages/ml)
- **Type:** Library
- **Root Path:** `/packages/ml`
- **Tech Stack:** TypeScript
- **Doel:** ML-gerelateerde TypeScript utilities en types

## Workspace Configuratie

**Package Manager:** pnpm
**Workspace File:** pnpm-workspace.yaml

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'tests/*'
```

## Integratie Architectuur (Overzicht)

- **Frontend (apps/web)** ↔ **API Backend (apps/api)** via REST API + WebSocket
- **API Backend (apps/api)** ↔ **Python ML Backend (backend/)** via HTTP API
- **Shared Libraries** gebruikt door zowel web als api voor type consistency
- **UI Library** gebruikt door web voor herbruikbare componenten
