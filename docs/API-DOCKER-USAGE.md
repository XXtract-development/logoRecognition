# API Docker Gebruikshandleiding

## 🚀 Overzicht

De Logo Recognition API draait succesvol in Docker en is bereikbaar op **http://localhost:8000**

## ✅ Status

- **Container:** `logo-recognition-api`
- **Base Image:** `node:20-alpine`
- **Framework:** Fastify 4.24.3
- **Status:** ✅ Running
- **Port:** 8000 (host) → 8000 (container)

## 🔧 Quick Start

### 1. Start de API

```bash
# Start alleen de API container
docker-compose up -d api

# Of start alle containers
docker-compose up -d
```

### 2. Controleer Status

```bash
# Check of container draait
docker ps | grep logo-recognition-api

# Check logs
docker-compose logs -f api

# Test health endpoint
curl http://localhost:8000/health
```

### 3. Verwachte Response

```json
{
  "status": "ok",
  "timestamp": "2025-11-03T20:30:00.000Z"
}
```

## 📡 Beschikbare Endpoints

### Health Check
```bash
GET http://localhost:8000/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-03T20:30:00.000Z"
}
```

**cURL Example:**
```bash
curl http://localhost:8000/health
```

### API v1 Endpoints

De volledige API heeft deze endpoints (zie `apps/api/src/main.ts`):

```
GET  /health                    # Health check
POST /api/v1/recognition        # Logo recognition
GET  /api/v1/recognition/:id    # Get recognition result
```

## 🛠️ Development Workflow

### Container Beheer

```bash
# Start API container
docker-compose up -d api

# Stop API container
docker-compose stop api

# Herstart API container
docker-compose restart api

# Verwijder API container
docker-compose down api

# Rebuild API container (na code wijzigingen)
docker-compose up -d --build api

# View real-time logs
docker-compose logs -f api
```

### Code Hot Reload

De API container gebruikt **hot reload** met `--watch` flag:

```dockerfile
CMD ["node", "--watch", "src/main-simple.js"]
```

**Wijzigingen worden automatisch opgepakt:**

1. Bewerk code in `apps/api/src/`
2. Node detecteert wijzigingen
3. Server herstart automatisch
4. Geen rebuild nodig!

### Debugging

```bash
# Shell in container openen
docker exec -it logo-recognition-api sh

# Controleer running processes
docker exec logo-recognition-api ps aux

# Check environment variables
docker exec logo-recognition-api env

# Test vanuit container
docker exec logo-recognition-api wget -qO- http://localhost:8000/health
```

## 🔗 Gebruik vanuit Frontend

### Vanuit Host (buiten Docker)

```javascript
// React/TypeScript frontend
const response = await fetch('http://localhost:8000/health');
const data = await response.json();
console.log(data); // { status: 'ok', timestamp: '...' }
```

### Vanuit Andere Container

In `docker-compose.yml` is een bridge network gedefinieerd:

```yaml
networks:
  logo-recognition:
    driver: bridge
```

**Gebruik service naam als hostname:**

```javascript
// Van web container naar api container
const response = await fetch('http://api:8000/health');
```

**Environment variabele in web container:**

```yaml
environment:
  - VITE_API_URL=http://api:8000
```

```javascript
// In je React app
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const response = await fetch(`${API_URL}/health`);
```

## 📦 Container Details

### Dockerfile Structuur

```dockerfile
FROM node:20-alpine

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy application files
COPY apps/api ./apps/api

# Set working directory to api app
WORKDIR /app/apps/api

# Expose port
EXPOSE 8000

# Start with node directly (JavaScript file)
CMD ["node", "--watch", "src/main-simple.js"]
```

### Environment Variabelen

In `docker-compose.yml`:

```yaml
environment:
  - NODE_ENV=development
  - PORT=8000
  - HOST=0.0.0.0
```

**Toevoegen van extra variabelen:**

```yaml
environment:
  - NODE_ENV=development
  - PORT=8000
  - HOST=0.0.0.0
  - DATABASE_URL=postgresql://user:pass@db:5432/logo
  - REDIS_URL=redis://redis:6379
  - CORS_ORIGIN=http://localhost:3000
```

## 🧪 Testing

### Handmatige Tests

```bash
# Health check
curl http://localhost:8000/health

# Met headers
curl -H "Content-Type: application/json" \
     http://localhost:8000/health

# POST request (example)
curl -X POST \
     -H "Content-Type: application/json" \
     -d '{"key":"value"}' \
     http://localhost:8000/api/v1/endpoint
```

### Automated Tests

```bash
# Run tests tegen Docker API
cd apps/api
VITE_API_URL=http://localhost:8000 pnpm test

# Integration tests
pnpm test:integration
```

## 🐛 Troubleshooting

### API Reageert Niet

```bash
# Check of container draait
docker ps | grep logo-recognition-api

# Check logs voor errors
docker-compose logs api

# Herstart container
docker-compose restart api
```

### Port Already in Use

```bash
# Find process op port 8000
lsof -i :8000

# Kill process
kill -9 <PID>

# Of gebruik andere port in docker-compose.yml
ports:
  - "8001:8000"  # Host:Container
```

### Code Wijzigingen Niet Zichtbaar

```bash
# Rebuild container
docker-compose up -d --build api

# Check volumes
docker-compose config
```

### Permission Errors

```bash
# Check file permissions
ls -la apps/api/src/

# Fix permissions if needed
chmod -R 755 apps/api/src/
```

## 📊 Performance Monitoring

### Container Stats

```bash
# Real-time stats
docker stats logo-recognition-api

# One-time stats
docker stats --no-stream logo-recognition-api
```

### Logs Analysis

```bash
# Last 100 lines
docker-compose logs --tail=100 api

# Follow logs with timestamps
docker-compose logs -f -t api

# Filter logs
docker-compose logs api | grep ERROR
```

## 🚀 Production Deployment

### Environment Aanpassen

Maak een `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile.prod
    environment:
      - NODE_ENV=production
      - PORT=8000
      - HOST=0.0.0.0
    restart: always
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

### Security Hardening

```bash
# Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8000/health || exit 1
```

## 📚 Volgende Stappen

1. **Endpoints Uitbreiden** - Voeg je eigen routes toe in `apps/api/src/api/v1/`
2. **Database Connectie** - Voeg Prisma toe met PostgreSQL
3. **Authentication** - Implementeer JWT auth middleware
4. **Rate Limiting** - Is al gedefinieerd in `main.ts`
5. **Monitoring** - Voeg Prometheus/Grafana toe
6. **WebSockets** - Gebruik `@fastify/websocket` voor real-time features

## 🔗 Links

- [Fastify Documentation](https://www.fastify.io/)
- [Docker Compose Reference](https://docs.docker.com/compose/)
- [pnpm Workspace](https://pnpm.io/workspaces)
- [Project README](../README.md)
