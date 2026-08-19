# API Contracts — API Backend (apps/api)

**Gegenereerd:** 2026-03-31 | **Scan Level:** Exhaustive

---

## Base URL

- **Development:** `http://localhost:8000/api/v1`
- **Health:** `http://localhost:8000/health`

---

## Authenticatie

Alle beveiligde endpoints vereisen een van:
- **Bearer Token:** `Authorization: Bearer <jwt_access_token>`
- **Cookie:** `access_token` (httpOnly, secure in productie)
- **API Key:** `X-API-Key: lr_<org_id>_<key_hash>`

### POST /auth/login
**Request:**
```json
{ "email": "string", "password": "string" }
```
**Response:** `200 OK`
```json
{
  "user": { "id": "string", "email": "string", "role": "ADMIN|USER|VIEWER" },
  "accessToken": "string",
  "refreshToken": "string"
}
```
**Rate Limit:** 5 pogingen per 60s per IP

### POST /auth/register
**Request:**
```json
{ "email": "string", "password": "string (≥8 tekens)", "username": "string" }
```
**Response:** `201 Created` — Zelfde als login

### POST /auth/refresh
**Request:**
```json
{ "refreshToken": "string" }
```
**Response:** `200 OK` — Nieuw access + refresh token

### POST /auth/logout
**Response:** `200 OK` — Cookies gewist

### GET /auth/me
**Response:** `200 OK` — Gebruiker object

---

## Herkenning

### POST /recognize
**Request:**
```json
{
  "image": "base64_string",
  "confidence_threshold": 0.99,
  "include_embeddings": false
}
```
**Response:** `200 OK`
```json
{
  "requestId": "uuid",
  "detections": [
    {
      "brand": "string",
      "confidence": 0.95,
      "boundingBox": { "x": 0, "y": 0, "width": 100, "height": 100 }
    }
  ],
  "processingTime": 150,
  "imageHash": "md5_string"
}
```

### POST /recognize/upload
**Request:** `multipart/form-data` — Velden: file (JPEG/PNG/WebP)
**Response:** Zelfde als POST /recognize

### POST /recognize/batch
**Request:**
```json
{
  "images": ["base64_string (max 20)"],
  "confidence_threshold": 0.99
}
```
**Concurrency:** 4 parallelle verwerking

### GET /recognize/history
**Query:** `page`, `limit`, `startDate`, `endDate`
**Response:** Gepagineerde lijst van herkenningsresultaten

### GET /recognize/:requestId
**Response:** Specifiek herkenningsresultaat

---

## Training Afbeeldingen

### POST /training/upload
**Request:** `multipart/form-data` — file + optioneel categoryId
**Response:** `201 Created` — Afbeelding metadata + thumbnail URL

### POST /training/upload/batch
**Request:** `multipart/form-data` — max 50 bestanden
**Response:** Per-bestand status tracking

### GET /training/images
**Query:** `page`, `limit`, `status`, `categoryId`, `sort`
**Response:** Gepagineerde lijst

### DELETE /training/images/:id
**Response:** `204 No Content` — Verwijdert ook storage bestanden

### PATCH /training/images/bulk
**Request:**
```json
{
  "action": "assign|delete|export",
  "imageIds": ["string (max 100)"],
  "categoryId": "string (voor assign)"
}
```

---

## Categorieën

### GET /categories
**Query:** `page`, `limit`, `search`, `tree` (boomstructuur)

### POST /categories
**Request:**
```json
{ "name": "string", "category": "string", "value": "string", "description": "string" }
```
**Constraint:** Uniek op category + value

### POST /categories/merge
**Request:** `{ "sourceId": "string", "targetId": "string" }` — **ADMIN only**

---

## Annotaties

### POST /annotations
**Request:**
```json
{
  "imageId": "string",
  "categoryId": "string",
  "boundingBox": { "x": 0.1, "y": 0.2, "width": 0.3, "height": 0.4 }
}
```

### POST /annotations/smart-click
**Request:**
```json
{ "imageId": "string", "x": 0.5, "y": 0.5 }
```
**Response:** ML-gesuggereerde bounding box (fallback: 100x100px)

### POST /annotations/:id/review — **ADMIN only**
**Request:** `{ "approved": true, "notes": "string" }`

---

## Training Jobs

### POST /training/start
**Request:**
```json
{
  "batch_id": "string",
  "config": {
    "batch_size": 32,
    "epochs": 50,
    "learning_rate": 0.001,
    "augmentation_factor": 2,
    "validation_split": 0.2
  }
}
```
**Response:** `202 Accepted` — Job ID + Socket.IO notificatie

---

## Feedback

### POST /feedback
**Request:** `{ "logId": "string", "isCorrect": true }`

### GET /feedback/uncertain
**Response:** Voorspellingen met confidence 0.5-0.9 (actief leren)

### GET /feedback/stats
**Response:** Accuracy metrics, retraining condities status

### POST /feedback/trigger-retraining — **ADMIN only**
**Condities:** ≥100 feedback, ≥10% onverwerkt, accuracy <85%

---

## Statistieken

### GET /stats
**Response:**
```json
{
  "stats": {
    "totalRecognitions": 0,
    "successRate": 0,
    "averageTime": 0,
    "todayCount": 0
  },
  "recentActivity": []
}
```

---

## Health

### GET /health
**Response:** `200 OK` — `{ "status": "ok", "timestamp": "ISO" }`

### GET /health/ready
**Checks:** ML service bereikbaarheid
**Response:** `200 OK` of `503 Service Unavailable`

### GET /health/detailed
**Response:** Component status met latenties:
```json
{
  "status": "healthy|degraded|unhealthy",
  "components": {
    "ml-service": { "status": "up", "latency": 50 },
    "redis": { "status": "up", "latency": 2 },
    "postgresql": { "status": "up", "latency": 5 },
    "socket-io": { "status": "up" }
  }
}
```

---

## Foutformaat

Alle fouten volgen een consistent formaat:
```json
{
  "error": {
    "code": "VALIDATION_ERROR|AUTH_ERROR|NOT_FOUND|RATE_LIMIT|INTERNAL",
    "message": "string",
    "timestamp": "ISO",
    "requestId": "uuid",
    "details": {}
  }
}
```

| HTTP Status | Betekenis |
|-------------|-----------|
| 400 | Validatiefout |
| 401 | Niet geauthenticeerd |
| 403 | Onvoldoende rechten |
| 404 | Niet gevonden |
| 413 | Payload te groot |
| 415 | Ongeldig mediatype |
| 429 | Rate limit bereikt |
| 500 | Interne serverfout |
| 503 | Service niet beschikbaar |

---

## Rate Limiting

| Standaard | Waarde |
|-----------|--------|
| Max Requests | 100 per 60s |
| Login | 5 per 60s per IP |
| Upload | Beperkt door multipart (10MB, 10 bestanden) |
