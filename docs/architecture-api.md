# Architectuur — API Backend (apps/api)

**Gegenereerd:** 2026-03-31 | **Scan Level:** Exhaustive | **Taal:** TypeScript | **Framework:** Fastify 4.24.3

---

## Overzicht

De API backend is een Fastify-gebaseerde Node.js server die fungeert als API gateway tussen de React frontend en de Python ML microservice. Het biedt JWT-authenticatie, RBAC, real-time WebSocket communicatie, S3-compatibele opslag via MinIO, en PostgreSQL dataopslag via Prisma ORM.

---

## Entry Points

| Bestand | Doel |
|---------|------|
| `src/main.ts` | Volledige productieserver (port 8000) — Helmet, CORS, rate limiting, multipart, WebSocket, tracing, Sentry |
| `src/main-simple.ts` | Ontwikkelserver met in-memory stats, mock data, Socket.IO training simulatie |

---

## API Routes (prefix: `/api/v1`)

### Authenticatie (`/auth`)

| Methode | Pad | Beschrijving | Auth |
|---------|-----|-------------|------|
| POST | `/auth/login` | Email/wachtwoord login, JWT + refresh tokens, httpOnly cookies | Nee |
| POST | `/auth/register` | Gebruiker aanmaken (email uniek, wachtwoord ≥8 tekens, bcrypt 12 rounds) | Nee |
| POST | `/auth/refresh` | Vernieuw access token via refresh_token | Nee |
| POST | `/auth/logout` | Wis authenticatie cookies | Nee |
| GET | `/auth/me` | Geauthenticeerde gebruiker details | Ja |

**Token configuratie:** Access token 24u, Refresh token 7d, httpOnly secure cookies (productie).

### Herkenning (`/recognize`)

| Methode | Pad | Beschrijving | Auth |
|---------|-----|-------------|------|
| POST | `/recognize` | Base64 afbeelding herkenning (confidence_threshold: 0.99) | Optioneel |
| POST | `/recognize/upload` | Multipart upload herkenning (JPEG/PNG/WebP) | Optioneel |
| POST | `/embed` | Genereer embedding vector voor afbeelding | Optioneel |
| POST | `/recognize/batch` | Batch herkenning (max 20, concurrency 4) | Optioneel |
| GET | `/recognize/history` | Gepagineerde geschiedenis met datumfilter | Ja |
| GET | `/recognize/:requestId` | Specifiek herkenningsresultaat ophalen | Ja |

### Training Afbeeldingen (`/training`)

| Methode | Pad | Beschrijving | Auth |
|---------|-----|-------------|------|
| POST | `/training/upload` | Enkele afbeelding upload met optionele categoryId | Ja |
| POST | `/training/upload/batch` | Batch upload (max 50 bestanden) | Ja |
| GET | `/training/images` | Lijst met paginatie, filtering (status/category), sortering | Ja |
| GET | `/training/images/:id` | Enkele afbeelding met annotaties | Ja |
| DELETE | `/training/images/:id` | Verwijder afbeelding en storage bestanden | Ja |
| PATCH | `/training/images/bulk` | Bulk operaties (assign/delete/export, max 100) | Ja |

### Categorieën (`/categories`)

| Methode | Pad | Beschrijving | Auth |
|---------|-----|-------------|------|
| GET | `/categories` | Lijst met paginatie, zoeken, boomstructuur | Ja |
| POST | `/categories` | Maak logo definitie (uniek category/value) | Ja |
| GET | `/categories/:id` | Details met recente annotaties | Ja |
| PATCH | `/categories/:id` | Update met duplicaatcontrole | Ja |
| DELETE | `/categories/:id` | Verwijder (alleen als geen annotaties) | Ja |
| POST | `/categories/merge` | Merge bron naar doel (ADMIN only) | ADMIN |

### Annotaties (`/annotations`)

| Methode | Pad | Beschrijving | Auth |
|---------|-----|-------------|------|
| POST | `/annotations` | Maak enkele annotatie met bbox | Ja |
| POST | `/annotations/bulk` | Batch aanmaken | Ja |
| GET | `/annotations` | Lijst met imageId/batchId filters | Ja |
| GET | `/annotations/:id` | Details met logo en gebruiker info | Ja |
| PATCH | `/annotations/:id` | Update annotatie | Ja |
| DELETE | `/annotations/:id` | Verwijder annotatie | Ja |
| POST | `/annotations/smart-click` | ML-powered suggestie op klikcoordinaten | Ja |
| POST | `/annotations/:id/review` | Review en valideer (ADMIN only) | ADMIN |
| GET | `/annotations/image/:imageId/canvas` | Afbeelding met alle annotaties voor canvas | Ja |
| GET | `/annotations/shortcuts` | Keyboard shortcuts configuratie | Ja |

### Training Jobs (`/training`)

| Methode | Pad | Beschrijving | Auth |
|---------|-----|-------------|------|
| POST | `/training/start` | Start training job (batch_id + config) → 202 Accepted | Ja |
| GET | `/training/:jobId` | Job status | Ja |
| GET | `/training` | Lijst training jobs | Ja |
| DELETE | `/training/:jobId` | Annuleer training | Ja |

### Modellen (`/models`)

| Methode | Pad | Beschrijving | Auth |
|---------|-----|-------------|------|
| GET | `/models` | Lijst beschikbare ML modellen | Ja |
| POST | `/models/:modelId/activate` | Activeer model | Ja |
| POST | `/models/:modelId/delete` | Verwijder model | ADMIN |

### Feedback (`/feedback`)

| Methode | Pad | Beschrijving | Auth |
|---------|-----|-------------|------|
| POST | `/feedback` | Submit feedback (logId, isCorrect) | Ja |
| POST | `/feedback/bulk` | Bulk submission (max 100) | Ja |
| GET | `/feedback` | Lijst met incorporated filter | Ja |
| GET | `/feedback/uncertain` | Onzekere voorspellingen (0.5-0.9 confidence) — actief leren | Ja |
| GET | `/feedback/stats` | Nauwkeurigheidsmetrics en retraining condities | Ja |
| POST | `/feedback/incorporate` | Verplaats naar training data (ADMIN) | ADMIN |
| POST | `/feedback/trigger-retraining` | Controleer condities en trigger (ADMIN) | ADMIN |
| GET | `/feedback/model-comparison` | Vergelijk versies op feedback nauwkeurigheid | Ja |

**Retraining drempels:** MIN_FEEDBACK_COUNT: 100, MIN_UNINCORPORATED_RATIO: 10%, LOW_ACCURACY_THRESHOLD: 0.85

### Statistieken (`/stats`)

| Methode | Pad | Beschrijving |
|---------|-----|-------------|
| GET | `/stats` | Dashboard stats (totaal, success rate, gemiddelde tijd, vandaag) |
| POST | `/stats/demo` | Demo data toevoegen (alleen development) |

### Health (`/health`)

| Methode | Pad | Beschrijving |
|---------|-----|-------------|
| GET | `/health` | Basis status: 'ok' |
| GET | `/health/ready` | Kubernetes readiness probe (controleert ML service) |
| GET | `/health/live` | Kubernetes liveness probe |
| GET | `/health/detailed` | Component status met latenties (ml-service, redis, postgresql, socket-io) |

---

## Middleware

| Middleware | Bestand | Functie |
|-----------|---------|---------|
| **authMiddleware** | `middleware/auth.ts` | JWT validatie (Bearer header of cookie) |
| **requireRole** | `middleware/auth.ts` | RBAC controle (ADMIN/USER/VIEWER) |
| **optionalAuth** | `middleware/auth.ts` | Valideer indien aanwezig |
| **apiKeyAuth** | `middleware/auth.ts` | X-API-Key validatie (`lr_<org>_<hash>`, min 16 tekens) |
| **errorHandler** | `middleware/errorHandler.ts` | Globale foutafhandeling (400/401/403/404/413/415/429) |
| **tracingMiddleware** | `middleware/tracing.ts` | Request tracing (nanoseconde precisie, requestId) |

---

## Services

### Auth Service (`services/auth.ts`)
- JWT tokens (access 24u + refresh 7d)
- Bcrypt hashing (12 rounds)
- Rate limiting: 5 pogingen per 60s per IP
- Token payload: userId, email, role, organizationId

### ML Client (`services/ml-client.ts`)
- Axios-client naar ML service (http://localhost:8001, timeout 120s)
- Methoden: detectLogos, generateEmbedding, startTraining, getTrainingStatus, listModels, activateModel, healthCheck
- Foutafhandeling: ECONNREFUSED (503), ETIMEDOUT (504)

### Storage Service (`services/storage.ts`)
- MinIO S3-compatibele client
- Buckets: TRAINING, RECOGNITION, THUMBNAILS, MODELS
- Validatie: JPEG/PNG/WebP, max 10MB, min 100x100px
- Automatische thumbnail generatie (280x160, JPEG quality 80)
- SHA256 hashing voor deduplicatie
- Presigned URL's (standaard 1 uur geldig)

### Socket.IO Manager (`services/socket-io-manager.ts`)
- CORS: localhost:5173 + localhost:3000
- Transport: polling → websocket upgrade
- Ping: interval 25s, timeout 60s
- Subscriptions: training:*, recognition:*, feedback:*
- Methoden: sendTrainingUpdate, notifyTrainingStarted/Completed/Failed, notifyFeedbackReceived

### WebSocket Manager (`services/websocket-manager.ts`)
- Native Fastify WebSocket op `/api/v1/ws`
- Ping interval: 30s, timeout: 60s
- Topic-gebaseerde subscriptions

---

## Prisma Schema (20 Modellen)

### Kern Entiteiten
| Model | Beschrijving |
|-------|-------------|
| **User** | Gebruikers met email, password hash, role (ADMIN/USER/VIEWER), organizationId |
| **Organization** | Multi-tenancy ondersteuning |
| **Logo** | Logo definities met unieke category/value constraint |
| **LogoEmbedding** | Vector opslag voor logo similarity search |

### Training Entiteiten
| Model | Beschrijving |
|-------|-------------|
| **LogoImage** | Training afbeeldingen met metadata en storage paden |
| **TrainingData** | Gelabelde dataset |
| **TrainingBatch** | Training jobs met status tracking |
| **Annotation** | Bounding box annotaties op afbeeldingen |
| **ModelVersion** | ML model versies met metrics (accuracy, precision, recall, F1) |

### Herkenning Entiteiten
| Model | Beschrijving |
|-------|-------------|
| **RecognitionLog** | Herkenningsgebeurtenissen |
| **RecognitionResult** | Detectieresultaten met confidence en bbox |
| **FeedbackEntry** | Gebruiker feedback op resultaten |

### Systeem Entiteiten
| Model | Beschrijving |
|-------|-------------|
| **SearchHistory** | Query tracking |
| **QueryStats** | Query analytics |
| **HealthCheck** | Service health monitoring |
| **BackupHistory** | Backup tracking |

### Enums
- **TrainingStatus:** UPLOADING, PROCESSING, ANNOTATING, TRAINING, COMPLETED, FAILED
- **User Roles:** ADMIN, USER, VIEWER

---

## Security

| Maatregel | Implementatie |
|-----------|--------------|
| Authenticatie | JWT (RS256 impliciet), httpOnly cookies |
| Wachtwoord | Bcrypt 12 rounds |
| Autorisatie | RBAC (ADMIN/USER/VIEWER) |
| Rate Limiting | @fastify/rate-limit (100 req/60s default) |
| Headers | @fastify/helmet (CSP, HSTS, etc.) |
| CORS | @fastify/cors (configureerbare origins) |
| Upload | Max 10MB, 10 bestanden, MIME validatie |
| API Keys | `lr_<org>_<hash>` format (min 16 tekens) |
| Cookies | httpOnly, secure (productie), sameSite: lax |

---

## Monitoring & Observability

| Component | Technologie |
|-----------|-------------|
| Logging | Winston (structured JSON) |
| Error Tracking | Sentry |
| Distributed Tracing | OpenTelemetry |
| Metrics | prom-client (Prometheus) |
| Request Tracing | Custom middleware (nanoseconde precisie) |
| Health Probes | Kubernetes readiness + liveness |
