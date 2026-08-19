# Ontwikkelgids

**Gegenereerd:** 2026-03-31 | **Scan Level:** Exhaustive

---

## Vereisten

| Software | Minimum Versie | Doel |
|----------|---------------|------|
| Node.js | ≥22.12.0 | JavaScript runtime |
| pnpm | ≥9.15.0 | Package manager |
| Python | 3.11+ | ML service |
| PostgreSQL | 16+ | Database (met pgvector extensie) |
| Redis | 7+ | Cache en job queues |
| Docker | Latest | Containerisatie |
| MinIO | Latest | S3-compatibele object storage |

---

## Installatie

```bash
# Clone repository
git clone https://github.com/xxtract/logoRecognition.git
cd logoRecognition

# Installeer Node.js dependencies
pnpm install

# Kopieer environment configuratie
cp .env.example .env.local
# Pas .env.local aan met je configuratie

# Start ontwikkelservers
pnpm dev
```

---

## Ontwikkelcommando's

### Root (Monorepo)

| Commando | Beschrijving |
|----------|-------------|
| `pnpm dev` | Start API + Web tegelijkertijd (concurrently) |
| `pnpm dev:api` | Start alleen API backend |
| `pnpm dev:web` | Start alleen Web frontend |
| `pnpm build` | Bouw alle packages en apps (shared → ui → web → api) |
| `pnpm test` | Voer alle tests uit (unit + integration + e2e) |
| `pnpm test:unit` | Vitest met coverage |
| `pnpm test:e2e` | Playwright tests |
| `pnpm test:load` | K6 load tests |
| `pnpm lint` | ESLint controle |
| `pnpm format` | Prettier formatting |

### Web Frontend (apps/web)

| Commando | Beschrijving |
|----------|-------------|
| `pnpm dev` | Vite dev server (port 5173) |
| `pnpm build` | TypeScript check + Vite productie build |
| `pnpm test` | Vitest unit tests |
| `pnpm test:e2e` | Playwright browser tests |
| `pnpm test:coverage` | Coverage rapport (drempel: 90%) |
| `pnpm type-check` | TypeScript strict check |
| `pnpm validate` | type-check + lint + test:coverage |

### API Backend (apps/api)

| Commando | Beschrijving |
|----------|-------------|
| `pnpm dev` | Nodemon + ts-node (main-simple.ts) |
| `pnpm dev:full` | Nodemon + ts-node (main.ts, volledige setup) |
| `pnpm build` | TypeScript compilatie |
| `pnpm test` | Jest tests |
| `pnpm test:coverage` | Jest met coverage |

### ML Service (apps/ml-service)

```bash
# Installeer Python dependencies
pip install -r apps/ml-service/requirements.txt

# Start ML service
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

---

## Toegangspunten (Development)

| Service | URL | Beschrijving |
|---------|-----|-------------|
| Frontend | http://localhost:5173 | React applicatie (Vite) |
| API Backend | http://localhost:8000 | Fastify server |
| ML Service | http://localhost:8001 | FastAPI server |
| ML API Docs | http://localhost:8001/docs | FastAPI Swagger UI |
| MinIO Console | http://localhost:9001 | Object storage beheer |
| pgAdmin | http://localhost:5050 | Database beheer |
| Redis Insight | http://localhost:8081 | Redis beheer |
| Grafana | http://localhost:3001 | Monitoring dashboards |
| Prometheus | http://localhost:9090 | Metrics |

---

## Docker Development

```bash
# Start volledige stack
docker-compose up -d

# Start met monitoring
docker-compose -f docker-compose.full.yml up -d

# Alleen API + Frontend
docker-compose up -d api web

# Bekijk logs
docker-compose logs -f

# Herbouw na code wijzigingen
docker-compose up -d --build

# Stop alles
docker-compose down
```

### Docker Compose Services

| Service | docker-compose.yml | docker-compose.full.yml |
|---------|-------------------|------------------------|
| Web Frontend | ✅ Port 3000 | ✅ Port 3000 |
| API Backend | ✅ Port 8000 | ✅ Port 8000 |
| ML Service | - | ✅ Port 8001 |
| PostgreSQL | - | ✅ Port 5432 (pgvector) |
| Redis | - | ✅ Port 6379 |
| MinIO | - | ✅ Port 9000/9001 |
| Prometheus | - | ✅ Port 9090 |
| Grafana | - | ✅ Port 3001 |
| Loki | - | ✅ Log aggregatie |
| pgAdmin | - | ✅ Port 5050 |
| Redis Insight | - | ✅ Port 8081 |

---

## Build Volgorde

Packages moeten in deze volgorde gebouwd worden (afhankelijkheden):

```
1. packages/shared    → Gedeelde types en utilities
2. packages/ui        → React UI componenten
3. apps/web           → Frontend applicatie
4. apps/api           → API backend
```

`pnpm build` handelt dit automatisch af.

---

## Environment Variabelen

Kopieer `.env.example` naar `.env.local` en configureer:

```bash
# API
PORT=8000
NODE_ENV=development
DATABASE_URL=postgresql://user:pass@localhost:5432/logo_recognition
JWT_SECRET=your-secret-key
REDIS_URL=redis://localhost:6379

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin

# ML Service
ML_SERVICE_URL=http://localhost:8001

# Frontend (in apps/web/.env)
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
```

---

## Testing

### Test Structuur

```
tests/
├── e2e/           # Playwright E2E tests
├── e2e-cypress/   # Cypress E2E tests
├── integration/   # API integratie tests
├── unit/          # Unit tests
├── load/          # K6 performance tests
├── security/      # Security tests
├── chaos/         # Chaos tests
├── contract/      # Contract tests
├── visual/        # Visual regression (Backstop)
├── validation/    # API validatie tests
└── fixtures/      # Test data
```

### Playwright Configuratie
- Browsers: Chromium, Firefox, WebKit, Pixel 5, iPhone 12
- Base URL: http://localhost:5173
- Retry: 2 op CI
- Reporters: HTML, JSON, JUnit

### Coverage Drempels
- Frontend: 90% minimum
- API: 90% minimum
- Auth module: 100% (A++ security grade)

---

## Code Stijl

| Tool | Configuratie |
|------|-------------|
| ESLint | TypeScript + React plugins, strict regels |
| Prettier | Standaard configuratie |
| Husky | Pre-commit hooks |
| TypeScript | Strict mode (alle strict checks aan) |

---

## Workspace Structuur

```
pnpm-workspace.yaml:
  - apps/*       # Applicaties (web, api, ml-service)
  - packages/*   # Gedeelde libraries (shared, ui, ml)
  - tests/*      # Test suites
```
