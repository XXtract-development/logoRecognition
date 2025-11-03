# Development Setup Guide

**Laatst bijgewerkt:** 2025-11-03

---

## Prerequisites

### Required Software
- **Node.js:** ≥22.12.0 ([Download](https://nodejs.org/))
- **pnpm:** ≥9.15.0 (`npm install -g pnpm`)
- **Python:** 3.x ([Download](https://python.org/))
- **PostgreSQL:** 14+ met pgvector extension
- **Redis:** Latest stable
- **Docker:** Latest (voor MinIO/development)
- **Git:** Latest

### Optional
- **CUDA Toolkit:** Voor GPU training (recommended)
- **Kubernetes CLI (kubectl):** Voor production deployment

---

## Quick Start

### 1. Clone Repository
```bash
git clone <repository-url>
cd logoRecognition
```

### 2. Install Dependencies

#### Root + Frontend + API
```bash
# Install all workspace dependencies
pnpm install
```

#### Python ML Backend
```bash
# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
cd backend
pip install -r requirements.txt
```

### 3. Setup Databases

#### PostgreSQL
```bash
# Create database
createdb logo_recognition

# Install pgvector extension
psql logo_recognition -c 'CREATE EXTENSION vector;'
```

#### Redis
```bash
# Start Redis (if not running)
redis-server
```

#### MinIO (Development S3)
```bash
# Using Docker Compose
docker-compose -f docker-compose.minio.yml up -d
```

### 4. Configure Environment Variables

#### apps/web/.env
```env
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
```

#### apps/api/.env
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/logo_recognition
REDIS_URL=redis://localhost:6379
ML_BACKEND_URL=http://localhost:8000
JWT_SECRET=your-secret-key-change-in-production
PORT=3000
NODE_ENV=development
```

#### backend/.env
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/logo_recognition
REDIS_URL=redis://localhost:6379

# MinIO S3 Configuration
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET_NAME=logo-recognition
S3_USE_SSL=false

# ML Settings
MODEL_PATH=./models
DEVICE=cuda  # or 'cpu' if no GPU
```

### 5. Database Migration

```bash
cd apps/api
pnpm prisma migrate dev
pnpm prisma generate
```

For Python backend (if using Alembic):
```bash
cd backend
alembic upgrade head
```

### 6. Start Development Servers

#### Option A: All Services (Recommended)
```bash
# From root directory
pnpm dev
```

This starts:
- Frontend (http://localhost:5173)
- API (http://localhost:3000)

Then manually start Python backend:
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

#### Option B: Individual Services

**Frontend:**
```bash
cd apps/web
pnpm dev
# Runs on http://localhost:5173
```

**API:**
```bash
cd apps/api
pnpm dev
# Runs on http://localhost:3000
```

**ML Backend:**
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
# Runs on http://localhost:8000
```

---

## Verification

### Check All Services
```bash
# Frontend
curl http://localhost:5173

# API Health Check
curl http://localhost:3000/health

# ML Backend Health Check
curl http://localhost:8000/health

# Redis
redis-cli ping
# Should return: PONG

# PostgreSQL
psql logo_recognition -c 'SELECT version();'

# MinIO (via browser)
# Open http://localhost:9000
# Login: minioadmin / minioadmin
```

---

## Development Workflow

### Daily Workflow
```bash
# 1. Pull latest changes
git pull origin main

# 2. Install any new dependencies
pnpm install
cd backend && pip install -r requirements.txt

# 3. Run migrations (if any)
cd apps/api && pnpm prisma migrate dev

# 4. Start development
pnpm dev
# + Start Python backend separately
```

### Making Changes

#### Frontend Development
```bash
cd apps/web

# Start dev server
pnpm dev

# Run tests
pnpm test

# Run type check
pnpm type-check

# Run linter
pnpm lint
```

#### API Development
```bash
cd apps/api

# Start dev server
pnpm dev

# Run tests
pnpm test

# Prisma Studio (DB GUI)
pnpm prisma studio
```

#### ML Backend Development
```bash
cd backend

# Start dev server
uvicorn app.main:app --reload

# Run tests
pytest

# Format code
black .

# Lint
flake8 .
```

---

## Docker Development (Alternative)

### Full Stack with Docker Compose
```bash
# Start all services
docker-compose up

# Start specific service
docker-compose up frontend

# Rebuild images
docker-compose build

# View logs
docker-compose logs -f api
```

---

## Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Find process using port
lsof -ti:3000  # Replace 3000 with your port

# Kill process
kill -9 <PID>
```

#### Database Connection Error
```bash
# Check PostgreSQL is running
pg_isready

# Check connection
psql logo_recognition -c 'SELECT 1;'
```

#### Module Not Found (Python)
```bash
# Ensure virtual environment is activated
source venv/bin/activate

# Reinstall dependencies
pip install -r requirements.txt
```

#### Prisma Client Error
```bash
# Regenerate Prisma client
cd apps/api
pnpm prisma generate
```

#### Node Version Issues
```bash
# Check version
node -v

# Should be ≥22.12.0
# Use nvm to switch if needed
nvm use 22
```

---

## IDE Setup

### VS Code (Recommended)

**Extensions:**
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- Prisma
- Python
- Docker

**Settings (.vscode/settings.json):**
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[python]": {
    "editor.defaultFormatter": "ms-python.black-formatter"
  },
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

---

## Next Steps

After setup:
1. Review [Workflows](./workflows.md)
2. Read [Coding Standards](./coding-standards.md)
3. Check [Testing Strategy](../05-testing/testing-strategy.md)
4. Explore codebase starting with README files

---

## Additional Resources

- [Architecture Overview](../02-architecture/overview.md)
- [API Specification](../02-architecture/api-specification.md)
- [PRD](../01-product/prd.md)
- [Deployment Guide](../04-deployment/deployment-guide.md)

---

**Need Help?** Check archived detailed docs in `_archive/old-structure/architecture/13-development-workflow.md`
