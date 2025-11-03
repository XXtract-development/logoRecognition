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
