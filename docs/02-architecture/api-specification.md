# API Specification

**Laatst bijgewerkt:** 2025-11-03

---

## Base URL

**Development:** `http://localhost:3000`
**Production:** `https://api.your-domain.com`

---

## Authentication

### JWT Bearer Token
```http
Authorization: Bearer <token>
```

### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password"
}
```

**Response:**
```json
{
  "token": "eyJhbGc...",
  "refreshToken": "refresh...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name"
  }
}
```

---

## Training API

### Upload Images
```http
POST /api/training/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

{
  "files": [<File>, <File>, ...],
  "category": "logo-category-name"
}
```

### Start Training
```http
POST /api/training/start
Authorization: Bearer <token>
Content-Type: application/json

{
  "categoryId": "uuid",
  "config": {
    "epochs": 50,
    "batchSize": 32,
    "learningRate": 0.001
  }
}
```

### Get Training Status
```http
GET /api/training/status/:jobId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "jobId": "uuid",
  "status": "running|completed|failed",
  "progress": 75,
  "currentEpoch": 38,
  "totalEpochs": 50,
  "metrics": {
    "loss": 0.023,
    "accuracy": 0.987
  }
}
```

---

## Recognition API

### Recognize Image
```http
POST /api/recognition/predict
Authorization: Bearer <token>
Content-Type: multipart/form-data

{
  "image": <File>,
  "topK": 5
}
```

**Response:**
```json
{
  "predictions": [
    {
      "category": "Logo A",
      "confidence": 0.95,
      "boundingBox": {
        "x": 100,
        "y": 150,
        "width": 200,
        "height": 180
      }
    }
  ],
  "processingTime": 45
}
```

### Batch Recognition
```http
POST /api/recognition/batch
Authorization: Bearer <token>
Content-Type: multipart/form-data

{
  "images": [<File>, <File>, ...]
}
```

---

## Category Management

### List Categories
```http
GET /api/categories
Authorization: Bearer <token>
```

### Create Category
```http
POST /api/categories
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "New Logo Category",
  "description": "Description..."
}
```

### Update Category
```http
PUT /api/categories/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name"
}
```

### Delete Category
```http
DELETE /api/categories/:id
Authorization: Bearer <token>
```

---

## WebSocket Events

### Connection
```javascript
import io from 'socket.io-client';

const socket = io('ws://localhost:3000', {
  auth: {
    token: '<jwt-token>'
  }
});
```

### Training Updates
```javascript
socket.on('training:progress', (data) => {
  console.log(data);
  // {
  //   jobId: 'uuid',
  //   progress: 75,
  //   epoch: 38,
  //   loss: 0.023
  // }
});

socket.on('training:completed', (data) => {
  console.log('Training completed:', data);
});

socket.on('training:failed', (error) => {
  console.error('Training failed:', error);
});
```

### Recognition Updates
```javascript
socket.on('recognition:result', (result) => {
  console.log('Recognition result:', result);
});
```

---

## Error Responses

### Standard Error Format
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

### Common Error Codes
- `UNAUTHORIZED` (401): Invalid or missing authentication
- `FORBIDDEN` (403): Insufficient permissions
- `NOT_FOUND` (404): Resource not found
- `VALIDATION_ERROR` (400): Invalid request data
- `RATE_LIMIT_EXCEEDED` (429): Too many requests
- `INTERNAL_ERROR` (500): Server error

---

## Rate Limits

- **Anonymous:** 10 requests/minute
- **Authenticated:** 100 requests/minute
- **Training:** 5 concurrent jobs per user
- **Recognition:** 50 requests/minute per user

---

## Pagination

Standard pagination format:
```http
GET /api/categories?page=1&limit=20&sort=-createdAt
```

**Response:**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

---

Voor gedetailleerde specs en voorbeelden, zie: `_archive/old-structure/architecture/5-api-specification.md`

---

## Update 2026-06-03 — Epic 7: Betrouwbaar Evaluatiefundament

### Nieuwe/uitgebreide endpoints

| Endpoint | Methode | Beschrijving |
|----------|---------|--------------|
| `/api/v1/training/data/:id/holdout` | PATCH | Markeer/demarkeer trainingsdata als holdout (`{ holdout: boolean }` → `{ id, holdout }`; 404 bij onbekend id) |
| `/api/v1/training/data?holdout=true` | GET | Lijst gefilterd op holdout-status |
| `/api/v1/training/start` | POST | **Uitgebreid:** weigert nu met 422 wanneer de holdout-set leeg is of onder `HOLDOUT_MINIMUM` (env, default 25) |
| `/api/v1/models/:modelId` | GET | **Uitgebreid:** response bevat `holdoutMetrics { accuracy, precision, recall, f1, holdoutSize, holdoutHash }` |
| `/api/v1/feedback/model-comparison` | GET | **Uitgebreid:** per vergeleken versie `holdoutMetrics` |
| `/api/v1/reference-logos` | POST | Multipart upload keurmerk-referentie (`t3777Code`, `variantLabel`, `source` + PNG/SVG-bestand) → 201; 400 bij fout formaat of resolutie < `REFERENCE_MIN_RESOLUTION` (default 200px) |
| `/api/v1/reference-logos?code=X` | GET | Varianten per T3777-code, inclusief inactieve (historie) + preview-URL |
| `/api/v1/reference-logos/:id/deactivate` | PATCH | Soft delete (active=false); records worden nooit verwijderd |

ML-service (intern): `get_holdout_images()`, `count_holdout_images()`, holdout-uitsluiting op query-niveau in `get_training_images()`, `compute_holdout_hash()` en holdout-evaluatie bij modelregistratie (`metrics.holdout`).

---

## Update 2026-06-04 — Epic 8: Automatische Trainingsdata uit Etiket-Artwork

### Nieuwe endpoints (API gateway, `apps/api`)

Routes in `apps/api/src/api/v1/artwork-pipeline.ts`, geregistreerd onder prefix `/api/v1`.

| Endpoint | Methode | RBAC | Beschrijving |
|----------|---------|------|--------------|
| `/api/v1/artwork-import/runs` | POST | ADMIN | Start een artwork-importrun. Body `{ gtins?: string[], force?: boolean }`. Antwoordt direct met `202 { runId }`; de import draait op de achtergrond (in-process async; verplaatst naar BullMQ in Epic 9). Reeds geïmporteerde media (zelfde `mediaId`, status `imported`) worden overgeslagen tenzij `force: true`. |
| `/api/v1/artwork-import/runs/:runId` | GET | auth | Status van een importrun → `200 { status, imported, skipped, failed: [{ gtin, reason }] }`; `404` bij onbekend `runId`. |
| `/api/v1/artwork/:gtin/crosscheck` | POST | ADMIN | Vergelijkt gedetecteerde keurmerken met de GS1 T3777-declaratie. Body `{ detections: [{ t3777Code, confidence, bbox, method? }], declared: string[] }` → `200 { autoAccepted, reviewItems }`. Auto-accept alleen wanneer detectie in `declared` zit én `confidence ≥ drempel-per-methode` (`template` 0.85, `embedding` 0.80, `classifier`/onbekend 0.90; env-configureerbaar). Lege `declared` → alles naar review (geen onafhankelijke bevestiging). Niet-gedeclareerde of niet-gevonden codes komen met reden in `reviewItems` (gepersisteerd in `artwork_review_items`). |
| `/api/v1/artwork/review-queue` | GET | auth | Alle openstaande review-items (`status='open'`), nieuwste eerst. |
| `/api/v1/artwork/review-items/:id/accept` | PATCH | ADMIN | Accepteert een open review-item en zet het direct door naar trainingsdata-registratie (Story 8.6 "doorzet", method `human`). Het item wordt eerst op `accepted` gezet; bij aanwezige crop/source-referenties wordt het via de 8.6-registratiepad geregistreerd en op `registered` gezet → `200 { status, registered, skipped }`. Ontbreekt crop/source, dan blijft het `accepted` (skipped, geen fabricage) voor latere aanvulling. `404` bij onbekend id; `409` als het al `registered` is. |
| `/api/v1/artwork/review-items/:id/reject` | PATCH | ADMIN | Verwerpt een open review-item (`status='rejected'`); er wordt geen trainingsdata aangemaakt. `404` bij onbekend id. |
| `/api/v1/artwork/review-items/process-accepted` | POST | ADMIN | Catch-up "doorzet": registreert alle `accepted` review-items die nog niet geregistreerd zijn (bv. eerder geskipt wegens ontbrekende crop, intussen aangevuld). Idempotent — `registered` items worden op status uitgesloten → `200 { processed, registered, skipped }`. |
| `/api/v1/artwork/:gtin/register-training-data` | POST | ADMIN | Registreert auto-geaccepteerde of handmatig goedgekeurde crops als trainingsdata. Body `{ items: [{ t3777Code, cropPath, sourceFile, bbox, method, confidence }] }` → `201 { registered, ids }`; `400` bij lege items. Maakt per item een `LogoImage` (`metadata.artworkSource=true`), upsert het `Logo` (category `keurmerk`) en een `TrainingData`-record met volledige provenance. De hele batch loopt in één transactie (atomair). |
| `/api/v1/training/data/deactivate-by-source` | PATCH | ADMIN | Deactiveert (soft delete, `active=false`) in bulk alle trainingsdata afkomstig van één bronbestand. Body `{ sourceFile }` → `200 { deactivated }`; `400` zonder `sourceFile`. Filtert via JSON-path op `provenance.sourceFile`; records worden nooit verwijderd. |
| `/api/v1/artwork/synthesize` | POST | ADMIN | Genereert synthetische trainingscomposieten voor één keurmerkklasse en registreert ze via het 8.6-pad (`method='synthetic'`, altijd `holdout=false` — NFR3). Body `{ t3777Code, count, seed? }`. Roept de ML-service `/ml/artwork/synthesize` aan en registreert de teruggegeven crop-descriptors atomair via `registerCropsTx` → `201 { generated, registered, ids }`. `400` bij ontbrekende `t3777Code`/`count < 1`; `200 { generated: 0, registered: 0, ids: [] }` wanneer er geen bruikbare referenties/achtergronden zijn (open-input gate, geen fout); `502` als de ML-aanroep faalt. |

### Gewijzigd endpoint (Epic 7-holdout)

| Endpoint | Methode | Beschrijving |
|----------|---------|--------------|
| `/api/v1/training/data/:id/holdout` | PATCH | **Uitgebreid (NFR3):** weigert nu met `422` wanneer `{ holdout: true }` wordt gezet op een record waarvan `provenance.method === 'synthetic'` — synthetische data mag de holdout-set nooit binnenkomen (de holdout blijft 100% echt). Provenance wordt gelezen via de gedeelde `mapProvenance`-mapper. Het bestaande `404`-gedrag bij onbekend id blijft ongewijzigd. |

### Nieuwe/uitgebreide endpoints (ML-service, `apps/ml-service`)

Routes in `apps/ml-service/app/api/artwork.py`, geregistreerd onder prefix `/ml`.

| Endpoint | Methode | Beschrijving |
|----------|---------|--------------|
| `/ml/artwork/rasterize` | POST | **(Story 8.2)** Rastert elke pagina van een gecachte PDF-artwork naar PNG. Body `{ storage_path, dpi? }` (dpi 36–1200, default `ARTWORK_RASTER_DPI`) → `{ storage_path, dpi, pages: [{ source_file, page, image_path, dpi }], error? }`. De PNG's worden naast de bron in MinIO geschreven (`{dir}/{base}.page-{n}.png`). Soft-fail (AC2): een corrupte/beveiligde PDF geeft een lege `pages`-lijst + `error`-reden met HTTP `200`; alleen een storage-/fetchfout geeft `422`. |
| `/ml/artwork/localize` | POST | Lokaliseert keurmerken op een artwork-afbeelding via tiling + template-matching + NMS. Body `{ image_path? \| image_b64?, templates: [{ t3777_code, image_b64 }] }` → `{ detections: [{ t3777_code, bbox, score }] }`. `400` bij onleesbare afbeelding; `422` wanneer noch `image_path` noch `image_b64` is opgegeven. |
| `/ml/artwork/classify` | POST | **(Story 8.4)** Classificeert gelokaliseerde regio's naar een T3777-keurmerkcode via embedding-similariteit tegen de referentiebibliotheek (pgvector cosine), met fallback. Body `{ storage_path? \| image_b64?, crops?: [{ x, y, width, height }], confidence_threshold? }` (zonder `crops` → de hele afbeelding als één regio) → `{ results: [{ bbox?, t3777_code, confidence, method, uncertain }] }`. `uncertain` markeert lage-confidence-regio's voor 8.5-routing (geen filter). `422` bij ophaal-/decodeerfout of ontbrekende invoer; `400` bij ongeldige `image_b64`. |
| `/ml/artwork/synthesize` | POST | **(Story 8.7)** Genereert `count` synthetische composieten voor `t3777_code`. Body `{ t3777_code, count, seed? }` (count 1–500). Laadt actieve referentievarianten + echte cached artwork-achtergronden, componeert deterministische samples (scale/rotatie/HSV/blur via seeded `RandomState`), schrijft elke PNG naar MinIO (`synthetic/{t3777_code}/{seed}.png`) en geeft crop-descriptors terug → `{ t3777_code, generated, samples: [{ t3777_code, crop_path, source_file, bbox, method, confidence, seed }] }`. Geen bruikbare invoer → `generated: 0` met lege `samples` (geen 5xx). Deze service schrijft zelf geen `training_data`: persistentie van records gebeurt in `apps/api` via het 8.6-pad. |

---

## Update 2026-06-05 — Epic 9: Automatische Retraining

Epic 9 voegt een crash-bestendige retraining-pipeline toe (BullMQ + Redis). De Node-routes voor jobstatus, trigger-notificaties, handmatige flow-start en de approval-queue staan in `apps/api/src/api/v1/pipeline.ts` (nieuw) en `apps/api/src/api/v1/training.ts` (uitgebreid), beide geregistreerd onder prefix `/api/v1`. De ML-service krijgt één extra endpoint voor synthetische batch-planning.

### Auth-context (belangrijk)

`apps/api/src/main.ts` registreert **geen** globale auth-hook; RBAC wordt per route afgedwongen via `requireRole(...)`-preHandlers. In de tabel hieronder betekent de RBAC-kolom:
- **ADMIN** → route heeft een expliciete `requireRole('ADMIN')`-preHandler. ADMIN is in deze codebase de data-manager-equivalent (er is geen aparte `DATA_MANAGER`-rol).
- **— (geen guard)** → de routehandler heeft geen role-/auth-preHandler. De activatie-route vormt de uitzondering met eigen, inline 403/401-guards (zie onder).

### Nieuwe endpoints (API gateway, `apps/api`)

Routes in `apps/api/src/api/v1/pipeline.ts`.

| Endpoint | Methode | RBAC | Beschrijving |
|----------|---------|------|--------------|
| `/api/v1/pipeline/notifications` | GET | — (geen guard) | Lijst retraining-trigger-notificaties, ongelezen eerst (`status` oplopend — `'read'` < `'unread'` alfabetisch, dus ongelezen bovenaan), dan `createdAt` aflopend. Gepolld door de frontend bij mount zodat ook offline managers eerder verstuurde triggers nog zien (Story 9.2, AC3) → `200 { data: RetrainingNotification[] }`; `500` bij DB-fout. |
| `/api/v1/pipeline/notifications/:id/read` | PATCH | — (geen guard) | Markeert één notificatie als gelezen (`status='read'`, `readAt=now`) → `200` met het bijgewerkte record; `404` bij onbekend id; `500` bij DB-fout. |
| `/api/v1/pipeline/jobs/:jobId` | GET | — (geen guard) | Status van een BullMQ-pipelinejob via `getJobStatus(jobId)`. Geeft o.a. `state`, en voor gefaalde jobs `failedReason` + een `retryable`-vlag (Story 9.1, AC2) → `200 { ... }`; `404` met code `JOB_NOT_FOUND` wanneer de `jobId` onbekend is (state `not_found`); `500` bij interne fout. |
| `/api/v1/pipeline/training/start` | POST | ADMIN | Start handmatig een volledige training-flow (Story 9.3). Body `{ triggerId?, batchId? }` (default `triggerId = manual-{timestamp}`). Idempotentie/concurrency=1 (AC3): wanneer er al een flow actief is (`getActiveTrainingFlowJobId()`) volgt `409` met code `TRAINING_FLOW_ACTIVE` + `activeJobId`. Anders draait `submitTrainingFlow()` de FlowProducer-keten (incorporate-feedback → build-batch → train-model → evaluate-model) → `202` met het flow-resultaat; `500` bij fout. **Let op:** de route in de code heet `/pipeline/training/start` (niet `/pipeline/training-flow`). |

Routes in `apps/api/src/api/v1/training.ts` (Models-tag).

| Endpoint | Methode | RBAC | Beschrijving |
|----------|---------|------|--------------|
| `/api/v1/models/approval-queue` | GET | — (geen guard) | Lijst challengers die de quality-gate haalden en op menselijke goedkeuring wachten (Story 9.5, AC1/AC2). Filter: `isActive === false` **en** `metrics.gate.passed === true` (Prisma JSONB-path-filter), nieuwste eerst. Per challenger wordt een `evaluationReport` opgebouwd t.o.v. de actieve champion: `{ challenger: { holdoutAccuracy, holdoutHash }, champion: { holdoutAccuracy } \| null, diff: { accuracy } \| null, datasetGrowth: null, triggerReasons: string[] }` → `200 { data: [...] }`; `500` bij DB-fout. (`datasetGrowth` is bewust `null` — gepland voor een volgende iteratie.) |
| `/api/v1/models/:modelId/activate` | POST | menselijk vereist | **Uitgebreid (Story 9.5, NFR5/NFR6).** Activatie vereist altijd een menselijke beslissing. **Service-accounts** (geldige `x-api-key` t.o.v. `PIPELINE_SERVICE_KEY`, gecontroleerd met `isServiceRequest()` / `crypto.timingSafeEqual`) krijgen `403` (AC3, NFR5). **Anonieme** aanroepen zonder geauthenticeerde gebruiker (`request.user.userId` ontbreekt) krijgen `401 UNAUTHORIZED` — dit voorkomt een audit-rij met `userId:'unknown'`, omdat `main.ts` geen globale auth-hook mount. Bij succes roept de route `mlClient.activateModel(modelId)` aan en schrijft een **ModelActivationLog** (`modelVersionId`, `userId`, `triggeredBy: 'manual-approval'`, `activatedAt`) (AC4, NFR6) → `200 { message, model_id }`. |

### Nieuw endpoint (ML-service, `apps/ml-service`)

Route in `apps/ml-service/app/api/pipeline.py`, geregistreerd onder prefix `/ml`.

| Endpoint | Methode | Beschrijving |
|----------|---------|--------------|
| `/ml/pipeline/build-synthetic-batch` | POST | **(Story 9.3, AC4)** Plant een synthetische batch-fill voor ondervertegenwoordigde keurmerkklassen — de wiring van de uitgestelde 8.7-hook. Body `{ min_per_class, real_synthetic_ratio }` (`min_per_class` 1–10000, `real_synthetic_ratio` >0–10). Thin REST-wrapper rond `build_synthetic_batch(..., persist=False)` — **compute-only**: een planningsaanroep schrijft nooit PNG's (echte generatie + MinIO-persistentie loopt via `/ml/artwork/synthesize`). De platte planner-output wordt gesplitst in `{ batches: [...], shortfall_reported: { "<label>": <count> } }`: shortfall-entries worden per label gesommeerd, alle overige crop-descriptors gaan naar `batches`. De ratio-cap wint van `min_per_class` (residueel tekort wordt gerapporteerd, nooit met synthetische ruis opgevuld — conflict-resolutie 2026-06-04). "Niets te vullen" is een `200` met lege resultaten; alleen een echte fout geeft `500`. Aangeroepen door de Node-pipeline via `mlClient.buildSyntheticBatch()` in de build-batch-stap. |
