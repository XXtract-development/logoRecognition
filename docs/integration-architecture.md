# Integratie Architectuur

**Gegenereerd:** 2026-03-31 | **Scan Level:** Exhaustive

---

## Overzicht

Het Logo Recognition systeem bestaat uit 3 hoofdservices die via REST API's en WebSocket communiceren. Dit document beschrijft hoe de onderdelen met elkaar integreren.

---

## Service Topologie

```
┌─────────────────────────────┐
│     Web Frontend (React)     │  Port 5173 (dev)
│     apps/web                 │
└──────────┬──────────┬───────┘
           │ REST     │ Socket.IO
           │ (Axios)  │ (polling→ws)
           ▼          ▼
┌─────────────────────────────┐
│    API Backend (Fastify)     │  Port 8000
│    apps/api                  │
└──────┬────┬────┬────┬───────┘
       │    │    │    │
       ▼    ▼    ▼    ▼
   ┌──────┐ ┌─────┐ ┌──────┐ ┌────────────────────┐
   │ PG   │ │Redis│ │MinIO │ │ ML Service (FastAPI)│
   │pgvec.│ │     │ │  S3  │ │ apps/ml-service     │
   └──────┘ └─────┘ └──────┘ │ Port 8001           │
                              └──────┬──────────────┘
                                     │
                              ┌──────┴──────┐
                              │ PG  │ MinIO │
                              │pgvec│  S3   │
                              └─────┴───────┘
```

---

## Integratiepunten

### 1. Frontend → API Backend (REST)

| Categorie | Pad Prefix | Protocol | Timeout |
|-----------|-----------|----------|---------|
| Authenticatie | `/api/v1/auth/*` | HTTP/REST | 30s |
| Herkenning | `/api/v1/recognize/*` | HTTP/REST | 30s |
| Training | `/api/v1/training/*` | HTTP/REST | 30s |
| Categorieën | `/api/v1/categories/*` | HTTP/REST | 30s |
| Annotaties | `/api/v1/annotations/*` | HTTP/REST | 30s |
| Modellen | `/api/v1/models/*` | HTTP/REST | 30s |
| Feedback | `/api/v1/feedback/*` | HTTP/REST | 30s |
| Statistieken | `/api/v1/stats` | HTTP/REST | 30s |
| Health | `/health/*` | HTTP/REST | 5s |

**Client:** Axios met base URL `/api/v1`
**Proxy:** Vite dev server proxy `/api/*` → `http://localhost:8000`

### 2. Frontend → API Backend (WebSocket)

| Protocol | Pad | Transport | Events |
|----------|-----|-----------|--------|
| Socket.IO | `/socket.io/` | polling → websocket | training:*, recognition:*, feedback:* |
| Native WS | `/api/v1/ws` | websocket | training:*, recognition:*, feedback:* |

**Proxy:** Vite dev server proxy `/ws/*` → `ws://localhost:8000`

**Socket.IO Configuratie:**
- Ping interval: 25s
- Ping timeout: 60s
- Reconnect: handmatig (niet automatisch)

### 3. API Backend → ML Service (REST)

| Methode | Pad | Beschrijving | Timeout |
|---------|-----|-------------|---------|
| POST | `/ml/detect` | Logo detectie (base64 image) | 120s |
| POST | `/ml/embed` | Embedding generatie | 120s |
| POST | `/ml/train` | Start training job | 120s |
| GET | `/ml/train/{job_id}` | Training status | 120s |
| GET | `/ml/train` | Lijst jobs | 120s |
| DELETE | `/ml/train/{job_id}` | Annuleer training | 120s |
| GET | `/ml/models` | Lijst modellen | 120s |
| POST | `/ml/models/{id}/activate` | Activeer model | 120s |
| DELETE | `/ml/models/{id}` | Verwijder model | 120s |
| GET | `/health` | Health check | 120s |

**Client:** Axios (ml-client.ts) naar `http://localhost:8001`
**Foutafhandeling:** ECONNREFUSED → 503, ETIMEDOUT → 504

### 4. API Backend → PostgreSQL

| Technologie | Verbinding |
|-------------|-----------|
| Prisma ORM | DATABASE_URL (connection string) |
| Modellen | 20 Prisma modellen (User, Logo, Annotation, etc.) |
| Extensie | pgvector voor vector similarity search |

### 5. API Backend → Redis

| Technologie | Gebruik |
|-------------|--------|
| ioredis | Caching, sessies, job queues |
| BullMQ | Asynchrone training job queue |

### 6. API Backend → MinIO

| Technologie | Buckets |
|-------------|---------|
| MinIO Client | TRAINING, RECOGNITION, THUMBNAILS, MODELS |
| Operaties | Upload, download, presigned URLs, thumbnail generatie |
| Validatie | JPEG/PNG/WebP, max 10MB, min 100×100px |

### 7. ML Service → PostgreSQL

| Technologie | Verbinding |
|-------------|-----------|
| asyncpg | Async connection pool (min 2, max 10) |
| Operaties | Training batches, model versies, logo embeddings |
| Extensie | pgvector — `embedding <=> vector` operator |

### 8. ML Service → MinIO

| Technologie | Buckets |
|-------------|---------|
| MinIO/boto3 | `models`, `training-images` |
| Operaties | Model opslaan/laden, training afbeeldingen ophalen |

---

## Data Flow — Logo Herkenning

```
1. Gebruiker uploadt afbeelding via Frontend
   ↓
2. Frontend POST /api/v1/recognize (Axios, base64)
   ↓
3. API Backend:
   a. Valideert afbeelding (formaat, grootte)
   b. Berekent MD5 hash
   c. Logt naar recognitionLog (Prisma)
   d. Forwarded naar ML Service: POST /ml/detect
   ↓
4. ML Service:
   a. Decodeert base64 afbeelding
   b. Preprocessing (resize 640×640, normalize)
   c. ONNX inferentie (EfficientDet)
   d. NMS (Non-Maximum Suppression)
   e. Embedding generatie (EfficientNet-B0)
   f. Vector similarity search (pgvector)
   g. Retourneert detecties met confidence + bbox
   ↓
5. API Backend:
   a. Slaat resultaten op in recognitionResult
   b. Stuurt response naar Frontend
   c. Notificeert via Socket.IO (RECOGNITION_COMPLETE)
   ↓
6. Frontend:
   a. Toont resultaten in ResultsDisplay
   b. Visualiseert bboxen op BoundingBoxCanvas
   c. Voegt toe aan geschiedenis (max 10)
```

---

## Data Flow — Model Training

```
1. Gebruiker start training via Frontend
   ↓
2. Frontend POST /api/v1/training/start (job config)
   ↓
3. API Backend:
   a. Maakt TrainingBatch record aan
   b. Forwarded naar ML Service: POST /ml/train
   c. Retourneert 202 Accepted
   d. Notificeert Socket.IO (training:started)
   ↓
4. ML Service (asynchroon):
   a. Laadt training afbeeldingen uit database
   b. Maakt label mapping
   c. Past augmentaties toe (rotatie, flip, kleur)
   d. Train/validatie split
   e. Initialiseert model (EfficientNet-B0/ResNet-50)
   f. Training loop (AdamW, ReduceLROnPlateau)
   g. Early stopping bij convergentie
   h. Exporteert naar ONNX formaat
   i. Uploadt model naar MinIO
   j. Registreert versie in database
   ↓
5. API Backend pollt status / ontvangt updates
   → Forwarded via Socket.IO naar Frontend
   ↓
6. Frontend toont voortgang in real-time
```

---

## Data Flow — Feedback Loop (Actief Leren)

```
1. Gebruiker geeft feedback op herkenningsresultaat
   ↓
2. Frontend POST /api/v1/feedback (logId, isCorrect)
   ↓
3. API Backend slaat FeedbackEntry op
   ↓
4. Bij voldoende feedback (≥100, ≥10% onverwerkt, accuracy <85%):
   → ADMIN triggert retraining: POST /api/v1/feedback/trigger-retraining
   → Onverwerkte feedback → training data: POST /api/v1/feedback/incorporate
   ↓
5. Nieuwe training cyclus start
```

---

## Gedeelde Packages

### packages/shared
- **Types:** RecognitionResult, Detection, BoundingBox, ImageMetadata, User
- **Resilience:** Circuit Breaker (CLOSED→OPEN→HALF_OPEN), Retry met exponential backoff + jitter
- **Caching:** Multi-Layer Cache (L1 LRU in-memory, L2 Redis, L3 CDN)
- **Errors:** RFC 7807 error handling met recovery suggesties, error budget tracking

### packages/ml
- **ONNX Optimizer:** Model laden met warmup (5 dummy runs), execution providers (CUDA/CoreML/CPU)
- **Caching:** Hash-gebaseerde input cache (max 100 entries)

### packages/ui
- **Status:** Structuur gedefinieerd, broncode nog leeg

---

## Environment Variabelen

### API Backend
| Variabele | Doel |
|-----------|------|
| PORT | Server poort (default 8000) |
| DATABASE_URL | PostgreSQL connection string |
| JWT_SECRET | JWT signing secret |
| REDIS_URL | Redis connection string |
| MINIO_ENDPOINT/PORT/ACCESS_KEY/SECRET_KEY | MinIO configuratie |
| ML_SERVICE_URL | ML service URL (default http://localhost:8001) |
| CORS_ORIGIN | Toegestane origins |
| SENTRY_DSN | Sentry error tracking |
| OTEL_EXPORTER_OTLP_ENDPOINT | OpenTelemetry endpoint |

### ML Service
| Variabele | Doel |
|-----------|------|
| ML_MODEL_PATH | Pad naar modellen |
| ENABLE_GPU | GPU activeren (default False) |
| PORT | Server poort (default 8001) |
| DATABASE_URL | PostgreSQL connection string |
| REDIS_URL | Redis connection string |
| MINIO_* | MinIO configuratie |

### Frontend
| Variabele | Doel |
|-----------|------|
| VITE_API_URL | API backend URL |
| VITE_WS_URL | WebSocket URL |
