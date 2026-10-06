# Logo Recognition API

Fast and lightweight API service voor logo detection en recognition.

## 🚀 Status

**✅ Volledig operationeel in Docker**

- **Container:** `logo-recognition-api`
- **Port:** 8000
- **Framework:** Fastify 4.24.3
- **Response Time:** ~22ms
- **Resource Usage:** 20MB RAM, 0.01% CPU

## Quick Start

### Docker (Recommended)

```bash
# Start API container
docker-compose up -d api

# Test health endpoint
curl http://localhost:8000/health

# Expected response:
# {"status":"ok","timestamp":"2025-11-03T20:30:00.000Z"}
```

### Local Development

```bash
# Install dependencies
pnpm install

# Start development server (TypeScript)
pnpm run dev

# Start development server (JavaScript - simple)
pnpm run dev:simple

# API beschikbaar op http://localhost:8000
```

## 📡 Available Endpoints

### Health Check
```
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-03T20:30:00.000Z"
}
```

### API v1 (Placeholder)
```
POST /api/v1/recognition
GET  /api/v1/recognition/:id
```

*Implementatie volgt in `src/api/v1/recognition.ts`*

### GS1-omzettabel (verhaal 1.4)
`src/services/gs1-mapping.json` is gegenereerd door `node scripts/generate-gs1-mapping.js` uit `reference-code-mapping.json`, `apps/web/src/data/keurmerk-codes.ts` en de bronnen in `scripts/gs1-mapping-sources/` (61 actieve codes uit `logodekking-2026-10-02`, 52 codes buiten GS1 3.1.37.1 uit `q4-q5-q7-uitkomst.md`); het JSON wordt nooit met de hand bewerkt: standwijzigingen gaan via `scripts/gs1-mapping-sources/stand-overrides.json` en vragen een `rapportverwijzing` (`validateMapping`, getest in `gs1-mapping.test.ts`, samen met een controle dat het JSON gelijk is aan de scriptuitvoer). Twee van de 61 actieve codes (ECC_HALAL, HALAL_QUALITY_CONTROL) staan ook in de 52 en gaan dus op `uit`.

### GS1-codelijsten regenereren (verhaal 1.6)
`src/services/gs1-codelists/gs1-codelists-<release>.json` bevat alleen codewaarden uit het GS1 Benelux datamodel (nu 3.1.37.1) en is de enige bron voor de controle `isValidGs1Value` (gebruikt door de blokbouwer en door `gs1-codelists.test.ts`); de xlsx wordt nooit gecommit en CI leest hem niet. Bij een nieuwe GS1-release:
1. Zet release, sha256 en de verwachte aantallen (`EXPECTED`) bovenin `scripts/generate-gs1-codelists.py`, en de bestandsnaam in `src/services/gs1-codelists/index.ts` en in `gs1-codelists.test.ts` (import en aantallen).
2. `uv run --with openpyxl python apps/api/scripts/generate-gs1-codelists.py <pad-naar-xlsx> YYYY-MM-DD` (de xlsx staat niet in git; in een worktree dus het pad naar de hoofdmap geven). De datum is verplicht, zodat dezelfde invoer een byte-gelijk bestand geeft. Het script stopt als de sha256 of een aantal afwijkt.
3. Commit het nieuwe afgeleide JSON; draai `pnpm --filter @logo-recognition/api exec vitest run src/__tests__/services/gs1-codelists.test.ts src/__tests__/services/gs1-mapping.test.ts src/__tests__/services/gs1-block.test.ts` en pas de omzettabel aan voor codes die uit de lijst zijn verdwenen.

## 📁 Project Structure

```
apps/api/
├── src/
│   ├── main.ts              # Full-featured server (TypeScript)
│   ├── main-simple.ts       # Minimal server (TypeScript)
│   ├── main-simple.js       # Minimal server (JavaScript - USED IN DOCKER)
│   ├── api/
│   │   └── v1/
│   │       ├── health.ts    # Health check routes
│   │       └── recognition.ts # Recognition routes
│   ├── core/
│   │   ├── logger.ts        # Winston logger
│   │   └── config.ts        # Configuration
│   └── middleware/
│       ├── errorHandler.ts  # Error handling
│       └── tracing.ts       # Request tracing
├── examples/
│   ├── api-usage.js         # JavaScript usage examples
│   └── test-api.sh          # Comprehensive test suite
├── Dockerfile.dev           # Development Docker image
└── package.json
```

## 🛠️ Development

### Available Scripts

```bash
# Development (TypeScript with nodemon)
pnpm run dev

# Development (Full-featured server)
pnpm run dev:full

# Build TypeScript to JavaScript
pnpm run build

# Start production build
pnpm run start

# Run tests
pnpm run test

# Run tests with coverage
pnpm run test:coverage

# Lint code
pnpm run lint
```

### Docker Development

```bash
# Build and start container
docker-compose up -d --build api

# View logs
docker-compose logs -f api

# Shell into container
docker exec -it logo-recognition-api sh

# Restart container
docker-compose restart api

# Stop container
docker-compose stop api
```

### Hot Reload

De Docker container gebruikt **Node.js watch mode** voor automatische code reload:

```dockerfile
CMD ["node", "--watch", "src/main-simple.js"]
```

**Code changes worden automatisch opgepakt!** Geen rebuild nodig.

## 🧪 Testing

### Run Test Suite

```bash
# Comprehensive test script
./examples/test-api.sh
```

**Tests Include:**
- ✅ Container status check
- ✅ Health endpoint verification
- ✅ Response time measurement
- ✅ CORS configuration
- ✅ Container logs analysis
- ✅ Port accessibility
- ✅ Load testing (10 concurrent requests)
- ✅ Resource usage monitoring
- ✅ Environment variables check
- ✅ Endpoint discovery

### Manual Testing

```bash
# Health check
curl http://localhost:8000/health

# With headers
curl -H "Content-Type: application/json" http://localhost:8000/health

# Pretty JSON output
curl -s http://localhost:8000/health | jq
```

## 📦 Dependencies

### Production
- `fastify` ^4.24.3 - Fast web framework
- `@fastify/cors` ^8.4.2 - CORS support
- `@fastify/helmet` ^11.1.1 - Security headers
- `@fastify/rate-limit` ^9.1.0 - Rate limiting
- `@fastify/websocket` ^8.3.1 - WebSocket support
- `@opentelemetry/api` ^1.9.0 - OpenTelemetry API
- `@sentry/node` ^7.99.0 - Error tracking
- `prom-client` ^15.1.0 - Prometheus metrics
- `winston` ^3.11.0 - Logging
- `ioredis` ^5.3.2 - Redis client
- `prisma` ^5.9.1 - ORM
- `bullmq` ^5.1.9 - Queue management

### Development
- `typescript` ^5.3.3
- `ts-node` ^10.9.2
- `nodemon` ^3.0.3
- `jest` ^29.7.0

## 🔧 Configuration

### Environment Variables

```bash
# Server
NODE_ENV=development
PORT=8000
HOST=0.0.0.0

# CORS
CORS_ORIGIN=http://localhost:3000

# Database (optional)
DATABASE_URL=postgresql://user:pass@localhost:5432/logo

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Monitoring (optional)
SENTRY_DSN=https://...
```

### Docker Environment

Configureer in `docker-compose.yml`:

```yaml
environment:
  - NODE_ENV=development
  - PORT=8000
  - HOST=0.0.0.0
```

## 📊 Performance

### Metrics

- **Response Time:** ~22ms (health endpoint)
- **Memory Usage:** ~20MB idle
- **CPU Usage:** ~0.01% idle
- **Container Size:** ~150MB (node:20-alpine)

### Optimization

De API is geoptimaliseerd voor:
- ✅ Snelle response times met Fastify
- ✅ Lage memory footprint met Alpine Linux
- ✅ Hot reload voor development productivity
- ✅ Minimal production bundle size

## 🔗 API Client Usage

### JavaScript/Node.js

```javascript
import { LogoRecognitionAPI } from './examples/api-usage.js';

const api = new LogoRecognitionAPI({
  baseURL: 'http://localhost:8000'
});

// Check health
const health = await api.health();
console.log(health); // { status: 'ok', timestamp: '...' }
```

### React

```jsx
import { useQuery } from '@tanstack/react-query';

function APIStatus() {
  const { data } = useQuery({
    queryKey: ['health'],
    queryFn: () => fetch('http://localhost:8000/health').then(r => r.json())
  });

  return <div>Status: {data?.status}</div>;
}
```

### cURL

```bash
curl http://localhost:8000/health
```

## 🐛 Troubleshooting

### Port Already in Use

```bash
# Find process
lsof -i :8000

# Kill process
kill -9 <PID>
```

### Container Not Starting

```bash
# Check logs
docker-compose logs api

# Rebuild
docker-compose up -d --build api
```

### Code Changes Not Reflected

De container gebruikt `--watch` mode, dus changes worden automatisch opgepakt.
Als het niet werkt:

```bash
# Rebuild container
docker-compose up -d --build api
```

## 📚 Documentation

- **Quick Start:** [../../DOCKER-QUICKSTART.md](../../DOCKER-QUICKSTART.md)
- **API Usage Guide:** [../../docs/API-DOCKER-USAGE.md](../../docs/API-DOCKER-USAGE.md)
- **Code Examples:** [examples/api-usage.js](examples/api-usage.js)
- **Main README:** [../../README.md](../../README.md)

## 🔗 Links

- [Fastify Documentation](https://www.fastify.io/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [pnpm Workspace](https://pnpm.io/workspaces)

---

**Status:** ✅ Production-ready API running in Docker
**Maintained by:** [@xxtract](https://github.com/xxtract)
