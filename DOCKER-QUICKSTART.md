# 🐳 Docker Quick Start Guide

## TL;DR - Start de API

```bash
# Start de API container
docker-compose up -d api

# Test de API
curl http://localhost:8000/health

# Expected response:
# {"status":"ok","timestamp":"2025-11-03T20:30:00.000Z"}
```

## ✅ Huidige Status

### API Container - **WERKT PERFECT** ✅

- **URL:** http://localhost:8000
- **Container:** `logo-recognition-api`
- **Status:** Up and running
- **Health Check:** `GET /health` → `{"status":"ok"}`

### Web Container - Niet actief (optioneel)

De frontend container heeft momenteel 404 issues. **Gebruik de API direct!**

## 🚀 Snelstart Commando's

### Container Beheer

```bash
# Start API
docker-compose up -d api

# Stop API
docker-compose stop api

# Herstart API
docker-compose restart api

# Bekijk logs
docker-compose logs -f api

# Container status
docker ps | grep logo-recognition-api
```

### API Testen

```bash
# Health check
curl http://localhost:8000/health

# Met mooie JSON output
curl -s http://localhost:8000/health | jq

# Uitgebreide test suite
./apps/api/examples/test-api.sh
```

### Development

```bash
# Rebuild na code wijzigingen
docker-compose up -d --build api

# Shell in container
docker exec -it logo-recognition-api sh

# Bekijk environment vars
docker exec logo-recognition-api env

# Container stats
docker stats logo-recognition-api
```

## 📡 API Gebruiken

### Vanuit JavaScript/TypeScript

```javascript
// Simple fetch
const response = await fetch('http://localhost:8000/health');
const data = await response.json();
console.log(data); // { status: 'ok', timestamp: '...' }

// Met error handling (zie apps/api/examples/api-usage.js)
import { LogoRecognitionAPI } from './apps/api/examples/api-usage.js';

const api = new LogoRecognitionAPI();
const health = await api.health();
```

### Vanuit React Component

```jsx
import { useQuery } from '@tanstack/react-query';

function APIStatus() {
  const { data, isLoading } = useQuery({
    queryKey: ['health'],
    queryFn: () => fetch('http://localhost:8000/health').then(r => r.json()),
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h2>API Status: {data.status}</h2>
      <p>Timestamp: {new Date(data.timestamp).toLocaleString()}</p>
    </div>
  );
}
```

### Vanuit cURL

```bash
# GET request
curl http://localhost:8000/health

# POST request (example voor toekomstige endpoints)
curl -X POST http://localhost:8000/api/v1/recognition \
  -H "Content-Type: application/json" \
  -d '{"image": "base64..."}'

# Met headers
curl -H "Authorization: Bearer token" \
     -H "Content-Type: application/json" \
     http://localhost:8000/api/v1/endpoint
```

## 📁 Project Structuur

```
logoRecognition/
├── docker-compose.yml           # Docker orchestration
├── DOCKER-QUICKSTART.md        # Dit bestand
├── docs/
│   └── API-DOCKER-USAGE.md     # Uitgebreide API docs
├── apps/
│   ├── api/
│   │   ├── Dockerfile.dev      # API container definitie
│   │   ├── src/
│   │   │   ├── main-simple.js  # Simple API server (ACTIEF)
│   │   │   └── main.ts         # Full API server (optioneel)
│   │   └── examples/
│   │       ├── api-usage.js    # JavaScript examples
│   │       └── test-api.sh     # Test script
│   └── web/
│       └── Dockerfile          # Frontend container (optioneel)
```

## 🔧 Troubleshooting

### Port 8000 al in gebruik?

```bash
# Vind proces
lsof -i :8000

# Kill proces
kill -9 <PID>

# Of gebruik andere port
# Edit docker-compose.yml:
#   ports:
#     - "8001:8000"
```

### API reageert niet?

```bash
# Check container status
docker ps

# Check logs
docker-compose logs api

# Herstart
docker-compose restart api

# Rebuild (bij code wijzigingen)
docker-compose up -d --build api
```

### Container start niet?

```bash
# Bekijk alle containers (ook gestopte)
docker ps -a

# Bekijk logs van gestopte container
docker logs logo-recognition-api

# Verwijder en herbouw
docker-compose down
docker-compose up -d --build api
```

## 🎯 Volgende Stappen

### 1. Test de API

```bash
# Run test suite
./apps/api/examples/test-api.sh
```

### 2. Bekijk Voorbeelden

Open `apps/api/examples/api-usage.js` voor:
- API Client class
- React hooks
- Error handling
- TypeScript examples

### 3. Voeg Endpoints Toe

Edit `apps/api/src/main-simple.js`:

```javascript
// Nieuwe route toevoegen
app.get('/api/v1/hello', async (request, reply) => {
  return { message: 'Hello from Docker!' };
});
```

Code wordt automatisch herladen dankzij `--watch` flag!

### 4. Lees Documentatie

- **Uitgebreid:** [docs/API-DOCKER-USAGE.md](docs/API-DOCKER-USAGE.md)
- **Project:** [README.md](README.md)

## 📊 Performance

De API container is geoptimaliseerd voor development:

- **Base Image:** `node:20-alpine` (klein en snel)
- **Package Manager:** pnpm (sneller dan npm)
- **Hot Reload:** `--watch` flag (automatische herstart)
- **Response Time:** <100ms (health endpoint)

## 🔗 Handige Links

- API Health: http://localhost:8000/health
- Docker Dashboard: Open Docker Desktop
- Container Logs: `docker-compose logs -f api`

---

**Klaar om te bouwen!** 🚀

De API draait in Docker en is klaar voor gebruik. Start met het toevoegen van je eigen endpoints!
