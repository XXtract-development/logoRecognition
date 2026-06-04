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
| `/api/v1/artwork/:gtin/register-training-data` | POST | ADMIN | Registreert auto-geaccepteerde of handmatig goedgekeurde crops als trainingsdata. Body `{ items: [{ t3777Code, cropPath, sourceFile, bbox, method, confidence }] }` → `201 { registered, ids }`; `400` bij lege items. Maakt per item een `LogoImage` (`metadata.artworkSource=true`), upsert het `Logo` (category `keurmerk`) en een `TrainingData`-record met volledige provenance. |
| `/api/v1/training/data/deactivate-by-source` | PATCH | ADMIN | Deactiveert (soft delete, `active=false`) in bulk alle trainingsdata afkomstig van één bronbestand. Body `{ sourceFile }` → `200 { deactivated }`; `400` zonder `sourceFile`. Filtert via JSON-path op `provenance.sourceFile`; records worden nooit verwijderd. |

### Nieuwe endpoint (ML-service, `apps/ml-service`)

Route in `apps/ml-service/app/api/artwork.py`, geregistreerd onder prefix `/ml`.

| Endpoint | Methode | Beschrijving |
|----------|---------|--------------|
| `/ml/artwork/localize` | POST | Lokaliseert keurmerken op een artwork-afbeelding via tiling + template-matching + NMS. Body `{ image_path? \| image_b64?, templates: [{ t3777_code, image_b64 }] }` → `{ detections: [{ t3777_code, bbox, score }] }`. `400` bij onleesbare afbeelding; `422` wanneer noch `image_path` noch `image_b64` is opgegeven. |

> De crop-classificatie (`classify_crop`) en synthese-generatie zijn als interne service-functies geïmplementeerd, niet als HTTP-endpoints — zie de moduleparagraaf in `source-tree.md`.
