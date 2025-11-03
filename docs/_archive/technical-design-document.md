# Technical Design Document (TDD)
## Logo Recognition & Training System

**Version:** 1.0
**Date:** 2025-09-14
**Author:** Technical Team
**Status:** Draft

---

## 1. System Architecture Overview

### 1.1 High-Level Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        WEB[React Web App]
        API_CLIENT[API Clients]
    end

    subgraph "API Gateway"
        NGINX[Nginx/Traefik]
        RATE[Rate Limiter]
    end

    subgraph "Application Layer"
        FAST[FastAPI Server]
        WORKER[Celery Workers]
        SOCKET[WebSocket Server]
    end

    subgraph "ML Layer"
        TRAIN[Training Pipeline]
        INFER[Inference Engine]
        AUGMENT[Data Augmentation]
    end

    subgraph "Data Layer"
        PG[(PostgreSQL + pgvector)]
        REDIS[(Redis Cache)]
        S3[(S3 Object Storage)]
    end

    WEB --> NGINX
    API_CLIENT --> NGINX
    NGINX --> RATE
    RATE --> FAST
    FAST --> WORKER
    FAST --> SOCKET
    WORKER --> TRAIN
    WORKER --> INFER
    TRAIN --> AUGMENT
    FAST --> PG
    FAST --> REDIS
    WORKER --> S3
```

### 1.2 Component Responsibilities

| Component | Responsibility | Technology |
|-----------|---------------|------------|
| Web App | User interface for training/recognition | React, TypeScript, TailwindCSS |
| API Gateway | Request routing, SSL, rate limiting | Nginx/Traefik |
| FastAPI Server | REST API, business logic | Python 3.11, FastAPI 0.104+ |
| Celery Workers | Async processing, ML tasks | Celery 5.3+, RabbitMQ |
| Training Pipeline | Few-shot learning, model updates | PyTorch 2.0+, Learn2Learn |
| Inference Engine | Logo detection and recognition | EfficientDet-D4, ONNX Runtime |
| PostgreSQL | Metadata, vectors, relationships | PostgreSQL 15+, pgvector 0.5+ |
| Redis | Session cache, job queue | Redis 7.0+ |
| S3 Storage | Image storage, model artifacts | MinIO/AWS S3 |

---

## 2. API Design

### 2.1 REST API Endpoints

#### Authentication
```yaml
POST /api/v1/auth/login
  body: { email, password }
  response: { access_token, refresh_token, user }

POST /api/v1/auth/refresh
  body: { refresh_token }
  response: { access_token }

POST /api/v1/auth/logout
  headers: Authorization: Bearer {token}
  response: { message }
```

#### Training Endpoints
```yaml
POST /api/v1/training/upload
  headers:
    Authorization: Bearer {token}
    Content-Type: multipart/form-data
  body:
    files: File[] (max 100)
    batch_name: string
  response:
    batch_id: uuid
    files: [{ id, filename, status, url }]

GET /api/v1/training/batch/{batch_id}
  response:
    batch_id: uuid
    status: processing|completed|failed
    files: [{ id, filename, annotations, status }]

POST /api/v1/training/annotate
  body:
    file_id: uuid
    annotations: [{
      x: int, y: int,
      width: int, height: int,
      category: string,
      value: string
    }]
  response: { success, annotation_ids }

POST /api/v1/training/smart-detect
  body:
    file_id: uuid
    click_x: int
    click_y: int
  response:
    detected_boundary: { x, y, width, height }
    confidence: float

POST /api/v1/training/train
  body:
    annotations: [annotation_id]
    model_name: string
  response:
    job_id: uuid
    status: queued

GET /api/v1/training/status/{job_id}
  response:
    status: queued|processing|completed|failed
    progress: int (0-100)
    metrics: { accuracy, loss, samples_processed }
```

#### Recognition Endpoints
```yaml
POST /api/v1/recognize/image
  headers:
    Authorization: Bearer {token}
  body:
    image: base64_string
    model_id?: uuid
    confidence_threshold?: float (default: 0.99)
  response:
    request_id: uuid
    detections: [{
      category: string
      value: string
      confidence: float
      bbox: { x, y, width, height }
    }]
    processing_time_ms: int

POST /api/v1/recognize/batch
  body:
    images: [{ id: string, image: base64_string }]
    model_id?: uuid
  response:
    batch_id: uuid
    status: processing

GET /api/v1/recognize/batch/{batch_id}
  response:
    status: processing|completed
    results: [{ id, detections }]

POST /api/v1/recognize/webhook
  body:
    image: base64_string
    callback_url: string
    metadata: object
  response:
    webhook_id: uuid
    status: accepted
```

#### Category Management
```yaml
GET /api/v1/categories
  response:
    categories: [{
      code: string
      label: string
      values: [{ code, label }]
    }]

POST /api/v1/categories
  body:
    code: string
    label: string
  response: { id, code, label }

PUT /api/v1/categories/{id}
  body: { label }
  response: { id, code, label }

DELETE /api/v1/categories/{id}
  response: { success }

POST /api/v1/categories/import
  body: csv_file
  response: { imported_count, errors }
```

### 2.2 WebSocket Events

```javascript
// Client -> Server
{
  event: "subscribe_training",
  data: { job_id: "uuid" }
}

// Server -> Client
{
  event: "training_progress",
  data: {
    job_id: "uuid",
    progress: 75,
    current_epoch: 3,
    total_epochs: 10,
    current_accuracy: 0.92
  }
}

{
  event: "training_complete",
  data: {
    job_id: "uuid",
    model_id: "uuid",
    final_accuracy: 0.99,
    training_time_seconds: 45
  }
}
```

### 2.3 Error Responses

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input parameters",
    "details": {
      "field": "image",
      "reason": "Image size exceeds 10MB limit"
    }
  },
  "request_id": "uuid",
  "timestamp": "2025-01-14T10:30:00Z"
}
```

Error Codes:
- `AUTH_FAILED` - Authentication failure
- `PERMISSION_DENIED` - Insufficient permissions
- `VALIDATION_ERROR` - Input validation failed
- `RESOURCE_NOT_FOUND` - Requested resource doesn't exist
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `PROCESSING_ERROR` - Internal processing error
- `MODEL_NOT_READY` - Model still training

---

## 3. Database Design

### 3.1 PostgreSQL Schema

```sql
-- Users and Authentication
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Training Batches
CREATE TABLE training_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'uploading',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Uploaded Images
CREATE TABLE images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES training_batches(id),
    filename VARCHAR(255),
    s3_key VARCHAR(500),
    width INTEGER,
    height INTEGER,
    file_size_bytes BIGINT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Logo Annotations
CREATE TABLE annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_id UUID REFERENCES images(id),
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    category_id UUID REFERENCES categories(id),
    value_id UUID REFERENCES category_values(id),
    confidence FLOAT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Categories
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) UNIQUE NOT NULL,
    label VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Category Values
CREATE TABLE category_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES categories(id),
    code VARCHAR(100) NOT NULL,
    label VARCHAR(255) NOT NULL,
    UNIQUE(category_id, code)
);

-- Trained Models
CREATE TABLE models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255),
    version INTEGER DEFAULT 1,
    accuracy FLOAT,
    training_samples INTEGER,
    model_path VARCHAR(500),
    status VARCHAR(50) DEFAULT 'training',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Logo Embeddings (for similarity search)
CREATE TABLE logo_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    annotation_id UUID REFERENCES annotations(id),
    model_id UUID REFERENCES models(id),
    embedding vector(768), -- EfficientDet feature vector
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Recognition Logs
CREATE TABLE recognition_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    model_id UUID REFERENCES models(id),
    image_hash VARCHAR(64),
    detections JSONB,
    confidence_threshold FLOAT,
    processing_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_annotations_image ON annotations(image_id);
CREATE INDEX idx_annotations_category ON annotations(category_id, value_id);
CREATE INDEX idx_embeddings_vector ON logo_embeddings USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_recognition_logs_user ON recognition_logs(user_id, created_at DESC);
```

### 3.2 Redis Data Structures

```python
# Session Management
session:{user_id} = {
    "token": "jwt_token",
    "role": "user",
    "expires_at": timestamp
}

# Training Job Queue
training_queue = [
    {
        "job_id": "uuid",
        "user_id": "uuid",
        "annotations": [...],
        "priority": 1
    }
]

# Recognition Cache
recognition:{image_hash}:{model_id} = {
    "detections": [...],
    "confidence_threshold": 0.99,
    "cached_at": timestamp,
    "ttl": 3600
}

# Real-time Progress
training_progress:{job_id} = {
    "status": "processing",
    "progress": 45,
    "current_epoch": 3,
    "accuracy": 0.89
}

# Rate Limiting
rate_limit:{user_id}:{endpoint} = {
    "count": 45,
    "window_start": timestamp,
    "limit": 100
}
```

---

## 4. ML Pipeline Architecture

### 4.1 Training Pipeline

```python
class FewShotLogoTrainer:
    """
    Few-shot learning pipeline using Prototypical Networks
    """

    def __init__(self):
        self.base_model = EfficientDetD4(pretrained=True)
        self.feature_extractor = self.base_model.backbone
        self.prototype_network = PrototypicalNetwork(
            backbone=self.feature_extractor,
            embedding_dim=768
        )

    def prepare_support_set(self, annotations: List[Annotation]):
        """
        Prepare support set from annotations (5-10 per class)
        """
        support_images = []
        support_labels = []

        for ann in annotations:
            # Load and crop image
            img = load_image(ann.image_path)
            crop = img[ann.y:ann.y+ann.height, ann.x:ann.x+ann.width]

            # Augment to create variations
            augmented = self.augment_image(crop)
            support_images.extend(augmented)
            support_labels.extend([ann.category_value] * len(augmented))

        return support_images, support_labels

    def augment_image(self, image):
        """
        Generate synthetic variations
        """
        augmentations = [
            A.Rotate(limit=15),
            A.RandomBrightnessContrast(p=0.5),
            A.RandomScale(scale_limit=0.1),
            A.GaussianBlur(blur_limit=3),
            A.Perspective(scale=(0.05, 0.1))
        ]

        augmented = [image]
        for aug in augmentations:
            augmented.append(aug(image=image)['image'])

        return augmented

    def train_few_shot(self, support_set, query_set, epochs=10):
        """
        Train using few-shot learning
        """
        optimizer = torch.optim.Adam(self.prototype_network.parameters())

        for epoch in range(epochs):
            # Compute prototypes from support set
            prototypes = self.compute_prototypes(support_set)

            # Calculate loss on query set
            loss = self.prototypical_loss(query_set, prototypes)

            # Update model
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            # Report progress
            self.report_progress(epoch, loss.item())

        return self.save_model()

    def compute_prototypes(self, support_set):
        """
        Calculate class prototypes (mean embeddings)
        """
        class_embeddings = defaultdict(list)

        for img, label in support_set:
            embedding = self.feature_extractor(img)
            class_embeddings[label].append(embedding)

        prototypes = {}
        for label, embeddings in class_embeddings.items():
            prototypes[label] = torch.stack(embeddings).mean(dim=0)

        return prototypes
```

### 4.2 Inference Pipeline

```python
class LogoRecognizer:
    """
    Optimized inference pipeline with 99% confidence threshold
    """

    def __init__(self, model_path: str, confidence_threshold: float = 0.99):
        self.model = self.load_onnx_model(model_path)
        self.confidence_threshold = confidence_threshold
        self.preprocessor = ImagePreprocessor()

    def recognize(self, image_base64: str) -> List[Detection]:
        """
        Main recognition pipeline
        """
        # Decode and preprocess
        image = self.decode_base64(image_base64)
        processed = self.preprocessor.prepare(image)

        # Check cache
        cache_key = self.compute_hash(image)
        cached = self.check_cache(cache_key)
        if cached:
            return cached

        # Run inference
        detections = self.detect_logos(processed)

        # Filter by confidence
        filtered = self.filter_confidence(detections)

        # Match with known logos
        matched = self.match_embeddings(filtered)

        # Cache results
        self.cache_results(cache_key, matched)

        return matched

    def detect_logos(self, image):
        """
        Run EfficientDet detection
        """
        # ONNX inference for speed
        input_tensor = self.prepare_input(image)
        outputs = self.model.run(None, {self.model.get_inputs()[0].name: input_tensor})

        boxes, scores, classes = outputs

        detections = []
        for box, score, cls in zip(boxes, scores, classes):
            if score > 0.5:  # Initial threshold
                detections.append({
                    'bbox': box,
                    'score': score,
                    'class': cls
                })

        return detections

    def match_embeddings(self, detections):
        """
        Match detected regions with known logos using vector similarity
        """
        matched = []

        for det in detections:
            # Extract features from detected region
            crop = self.crop_region(det['bbox'])
            embedding = self.extract_features(crop)

            # Query similar logos from database
            similar = self.vector_search(embedding, top_k=5)

            if similar and similar[0]['similarity'] > self.confidence_threshold:
                matched.append({
                    'category': similar[0]['category'],
                    'value': similar[0]['value'],
                    'confidence': similar[0]['similarity'],
                    'bbox': det['bbox']
                })

        return matched

    def vector_search(self, embedding, top_k=5):
        """
        PostgreSQL pgvector similarity search
        """
        query = """
            SELECT
                cv.code as value,
                c.code as category,
                1 - (le.embedding <=> %s::vector) as similarity
            FROM logo_embeddings le
            JOIN annotations a ON le.annotation_id = a.id
            JOIN category_values cv ON a.value_id = cv.id
            JOIN categories c ON cv.category_id = c.id
            WHERE le.model_id = %s
            ORDER BY le.embedding <=> %s::vector
            LIMIT %s
        """

        results = db.execute(query, [embedding, self.model_id, embedding, top_k])
        return results
```

### 4.3 Smart Click Detection

```python
class SmartBoundaryDetector:
    """
    Automatic logo boundary detection from single click
    """

    def __init__(self):
        self.edge_detector = cv2.Canny
        self.contour_finder = cv2.findContours

    def detect_boundary(self, image, click_x, click_y):
        """
        Find logo boundary from click point
        """
        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # Apply edge detection
        edges = self.edge_detector(gray, 50, 150)

        # Find contours
        contours, _ = self.contour_finder(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # Find contour containing click point
        target_contour = None
        for contour in contours:
            if cv2.pointPolygonTest(contour, (click_x, click_y), False) >= 0:
                target_contour = contour
                break

        if target_contour is None:
            # Fallback: use region growing
            return self.region_growing(gray, click_x, click_y)

        # Get bounding box
        x, y, w, h = cv2.boundingRect(target_contour)

        # Refine with GrabCut for better precision
        refined = self.refine_with_grabcut(image, (x, y, w, h))

        return refined

    def region_growing(self, image, seed_x, seed_y):
        """
        Fallback: region growing algorithm
        """
        mask = np.zeros(image.shape[:2], dtype=np.uint8)
        seed_value = image[seed_y, seed_x]
        threshold = 30

        # BFS to find similar pixels
        queue = [(seed_x, seed_y)]
        visited = set()

        while queue:
            x, y = queue.pop(0)
            if (x, y) in visited:
                continue

            visited.add((x, y))
            mask[y, x] = 255

            # Check neighbors
            for dx, dy in [(-1,0), (1,0), (0,-1), (0,1)]:
                nx, ny = x + dx, y + dy
                if 0 <= nx < image.shape[1] and 0 <= ny < image.shape[0]:
                    if abs(int(image[ny, nx]) - int(seed_value)) < threshold:
                        queue.append((nx, ny))

        # Find bounding box of mask
        coords = np.column_stack(np.where(mask > 0))
        y_min, x_min = coords.min(axis=0)
        y_max, x_max = coords.max(axis=0)

        return {
            'x': x_min,
            'y': y_min,
            'width': x_max - x_min,
            'height': y_max - y_min
        }
```

---

## 5. Frontend Architecture

### 5.1 Component Structure

```typescript
// src/components/
├── common/
│   ├── Layout.tsx
│   ├── Header.tsx
│   ├── ErrorBoundary.tsx
│   └── LoadingSpinner.tsx
├── auth/
│   ├── LoginForm.tsx
│   ├── AuthProvider.tsx
│   └── ProtectedRoute.tsx
├── training/
│   ├── BatchUploader.tsx
│   ├── ImageAnnotator.tsx
│   ├── SmartClickCanvas.tsx
│   ├── CategoryManager.tsx
│   └── TrainingProgress.tsx
├── recognition/
│   ├── ImageUploader.tsx
│   ├── ResultsDisplay.tsx
│   ├── ConfidenceIndicator.tsx
│   └── BoundingBoxOverlay.tsx
└── api/
    ├── apiClient.ts
    ├── websocketClient.ts
    └── types.ts
```

### 5.2 Key React Components

```typescript
// SmartClickCanvas.tsx
interface SmartClickCanvasProps {
  image: string;
  onBoundaryDetected: (boundary: Boundary) => void;
}

export const SmartClickCanvas: React.FC<SmartClickCanvasProps> = ({
  image,
  onBoundaryDetected
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [boundary, setBoundary] = useState<Boundary | null>(null);
  const [zoomArea, setZoomArea] = useState<ZoomArea | null>(null);

  const handleClick = async (e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsProcessing(true);

    try {
      const response = await api.detectBoundary({
        imageId: image,
        clickX: x,
        clickY: y
      });

      setBoundary(response.boundary);
      setZoomArea({
        x: response.boundary.x - 50,
        y: response.boundary.y - 50,
        width: response.boundary.width + 100,
        height: response.boundary.height + 100,
        scale: 2.0
      });

      onBoundaryDetected(response.boundary);
    } catch (error) {
      console.error('Boundary detection failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const drawBoundary = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !boundary) return;

    // Draw main boundary
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      boundary.x,
      boundary.y,
      boundary.width,
      boundary.height
    );

    // Draw corner handles for adjustment
    const handleSize = 8;
    ctx.fillStyle = '#00ff00';

    // Top-left
    ctx.fillRect(
      boundary.x - handleSize/2,
      boundary.y - handleSize/2,
      handleSize,
      handleSize
    );
    // Top-right, bottom-left, bottom-right...
  };

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className={`cursor-crosshair ${isProcessing ? 'opacity-50' : ''}`}
      />

      {zoomArea && (
        <ZoomViewer
          area={zoomArea}
          image={image}
          boundary={boundary}
          onAdjust={(newBoundary) => setBoundary(newBoundary)}
        />
      )}

      {isProcessing && (
        <div className="absolute inset-0 flex items-center justify-center">
          <LoadingSpinner />
        </div>
      )}
    </div>
  );
};
```

### 5.3 State Management

```typescript
// store/trainingSlice.ts
interface TrainingState {
  batches: Batch[];
  currentBatch: Batch | null;
  annotations: Annotation[];
  categories: Category[];
  trainingJobs: TrainingJob[];
  isTraining: boolean;
}

const trainingSlice = createSlice({
  name: 'training',
  initialState,
  reducers: {
    setBatches: (state, action) => {
      state.batches = action.payload;
    },
    addAnnotation: (state, action) => {
      state.annotations.push(action.payload);
    },
    updateTrainingProgress: (state, action) => {
      const job = state.trainingJobs.find(j => j.id === action.payload.jobId);
      if (job) {
        job.progress = action.payload.progress;
        job.accuracy = action.payload.accuracy;
      }
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(uploadBatch.fulfilled, (state, action) => {
        state.currentBatch = action.payload;
      })
      .addCase(startTraining.pending, (state) => {
        state.isTraining = true;
      })
      .addCase(startTraining.fulfilled, (state, action) => {
        state.trainingJobs.push(action.payload);
      });
  }
});
```

---

## 6. Deployment & Infrastructure

### 6.1 Docker Configuration

```dockerfile
# Dockerfile.api
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY ./app ./app

# Download model weights
RUN python -m app.ml.download_models

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: pgvector/pgvector:pg15
    environment:
      POSTGRES_DB: logo_recognition
      POSTGRES_USER: logo_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    ports:
      - "6379:6379"

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY}
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"

  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    depends_on:
      - postgres
      - redis
      - minio
    environment:
      DATABASE_URL: postgresql://logo_user:${DB_PASSWORD}@postgres:5432/logo_recognition
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      S3_ENDPOINT: http://minio:9000
      S3_ACCESS_KEY: ${MINIO_ACCESS_KEY}
      S3_SECRET_KEY: ${MINIO_SECRET_KEY}
    ports:
      - "8000:8000"
    volumes:
      - ./app:/app

  worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    depends_on:
      - postgres
      - redis
      - minio
    environment:
      DATABASE_URL: postgresql://logo_user:${DB_PASSWORD}@postgres:5432/logo_recognition
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      S3_ENDPOINT: http://minio:9000
    volumes:
      - ./app:/app
    command: celery -A app.worker worker --loglevel=info

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    environment:
      REACT_APP_API_URL: http://localhost:8000
    ports:
      - "3000:3000"
    volumes:
      - ./frontend:/app
      - /app/node_modules

volumes:
  postgres_data:
  minio_data:
```

### 6.2 Kubernetes Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: logo-api
  namespace: logo-recognition
spec:
  replicas: 3
  selector:
    matchLabels:
      app: logo-api
  template:
    metadata:
      labels:
        app: logo-api
    spec:
      containers:
      - name: api
        image: logo-recognition/api:latest
        ports:
        - containerPort: 8000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: logo-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: logo-secrets
              key: redis-url
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: logo-api-service
  namespace: logo-recognition
spec:
  selector:
    app: logo-api
  ports:
  - port: 80
    targetPort: 8000
  type: LoadBalancer
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: logo-api-hpa
  namespace: logo-recognition
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: logo-api
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

---

## 7. Security Specifications

### 7.1 Authentication & Authorization

```python
# JWT Token Structure
{
  "sub": "user_id",
  "email": "user@example.com",
  "role": "admin|user|viewer",
  "exp": 1234567890,
  "iat": 1234567880,
  "jti": "unique_token_id"
}

# Role Permissions
PERMISSIONS = {
    "admin": [
        "training:create",
        "training:delete",
        "categories:manage",
        "models:manage",
        "users:manage"
    ],
    "user": [
        "training:create",
        "recognition:use",
        "categories:read"
    ],
    "viewer": [
        "recognition:use",
        "categories:read"
    ]
}
```

### 7.2 API Security

```python
# Rate Limiting Configuration
RATE_LIMITS = {
    "auth/login": "5/minute",
    "training/upload": "10/minute",
    "recognition/image": "100/minute",
    "recognition/batch": "10/hour"
}

# Input Validation
class ImageUploadValidator:
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}
    MAX_BATCH_SIZE = 100

    def validate_image(self, file):
        # Check file size
        if file.size > self.MAX_FILE_SIZE:
            raise ValidationError("File too large")

        # Check extension
        ext = Path(file.filename).suffix.lower()
        if ext not in self.ALLOWED_EXTENSIONS:
            raise ValidationError("Invalid file type")

        # Check image validity
        try:
            img = Image.open(file.file)
            img.verify()
        except:
            raise ValidationError("Invalid image file")

        return True
```

### 7.3 Data Protection

```yaml
Encryption:
  - At Rest: AES-256 for S3 storage
  - In Transit: TLS 1.3 for all API communications
  - Database: Column-level encryption for sensitive data

Access Control:
  - S3: Pre-signed URLs with 1-hour expiration
  - Database: Row-level security for multi-tenancy
  - API: OAuth2 with refresh tokens

Audit Logging:
  - All API calls logged with user, timestamp, IP
  - Training data modifications tracked
  - Model access logged for compliance
```

---

## 8. Monitoring & Observability

### 8.1 Metrics

```python
# Prometheus Metrics
from prometheus_client import Counter, Histogram, Gauge

# API Metrics
api_requests = Counter(
    'api_requests_total',
    'Total API requests',
    ['method', 'endpoint', 'status']
)

api_latency = Histogram(
    'api_latency_seconds',
    'API latency',
    ['endpoint']
)

# ML Metrics
model_accuracy = Gauge(
    'model_accuracy',
    'Current model accuracy',
    ['model_id']
)

recognition_confidence = Histogram(
    'recognition_confidence',
    'Distribution of recognition confidence scores'
)

training_duration = Histogram(
    'training_duration_seconds',
    'Training job duration'
)

# System Metrics
active_users = Gauge('active_users', 'Number of active users')
queue_size = Gauge('queue_size', 'Training queue size')
cache_hit_rate = Gauge('cache_hit_rate', 'Cache hit rate')
```

### 8.2 Logging

```python
# Structured Logging Configuration
import structlog

logger = structlog.get_logger()

# Log Levels
LOG_LEVELS = {
    "DEBUG": "Detailed debugging information",
    "INFO": "General information",
    "WARNING": "Warning messages",
    "ERROR": "Error messages",
    "CRITICAL": "Critical failures"
}

# Example Usage
logger.info(
    "recognition_completed",
    user_id=user.id,
    image_hash=image_hash,
    detections_count=len(detections),
    processing_time_ms=processing_time,
    confidence_threshold=0.99
)
```

### 8.3 Health Checks

```python
# Health Check Endpoints
@app.get("/health")
async def health_check():
    """Basic health check"""
    return {"status": "healthy"}

@app.get("/ready")
async def readiness_check():
    """Detailed readiness check"""
    checks = {
        "database": check_database(),
        "redis": check_redis(),
        "s3": check_s3(),
        "model": check_model_loaded()
    }

    all_ready = all(checks.values())
    status_code = 200 if all_ready else 503

    return JSONResponse(
        content={"ready": all_ready, "checks": checks},
        status_code=status_code
    )

async def check_database():
    try:
        await db.execute("SELECT 1")
        return True
    except:
        return False
```

---

## 9. Testing Strategy

### 9.1 Unit Tests

```python
# test_recognition.py
import pytest
from app.ml.recognition import LogoRecognizer

class TestLogoRecognizer:
    @pytest.fixture
    def recognizer(self):
        return LogoRecognizer(
            model_path="tests/fixtures/test_model.onnx",
            confidence_threshold=0.99
        )

    def test_high_confidence_detection(self, recognizer):
        """Test that high confidence detections are returned"""
        image = load_test_image("nike_logo.jpg")
        results = recognizer.recognize(image)

        assert len(results) > 0
        assert results[0]['confidence'] >= 0.99
        assert results[0]['category'] == 'brand'
        assert results[0]['value'] == 'nike'

    def test_low_confidence_rejection(self, recognizer):
        """Test that low confidence detections are filtered"""
        image = load_test_image("blurry_logo.jpg")
        results = recognizer.recognize(image)

        assert len(results) == 0

    @pytest.mark.parametrize("rotation", [0, 90, 180, 270])
    def test_rotation_invariance(self, recognizer, rotation):
        """Test recognition works with rotated images"""
        image = load_test_image("nike_logo.jpg")
        rotated = rotate_image(image, rotation)
        results = recognizer.recognize(rotated)

        assert len(results) > 0
        assert results[0]['value'] == 'nike'
```

### 9.2 Integration Tests

```python
# test_api_integration.py
import pytest
from fastapi.testclient import TestClient

class TestRecognitionAPI:
    @pytest.fixture
    def client(self):
        from app.main import app
        return TestClient(app)

    @pytest.fixture
    def auth_headers(self, client):
        response = client.post("/api/v1/auth/login", json={
            "email": "test@example.com",
            "password": "testpass"
        })
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def test_recognition_endpoint(self, client, auth_headers):
        """Test complete recognition flow"""
        with open("tests/fixtures/nike_logo.jpg", "rb") as f:
            image_base64 = base64.b64encode(f.read()).decode()

        response = client.post(
            "/api/v1/recognize/image",
            headers=auth_headers,
            json={
                "image": image_base64,
                "confidence_threshold": 0.99
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert "detections" in data
        assert len(data["detections"]) > 0
        assert data["detections"][0]["confidence"] >= 0.99
```

### 9.3 Load Tests

```python
# load_test.py
from locust import HttpUser, task, between

class LogoRecognitionUser(HttpUser):
    wait_time = between(1, 3)

    def on_start(self):
        """Login and get token"""
        response = self.client.post("/api/v1/auth/login", json={
            "email": "load_test@example.com",
            "password": "testpass"
        })
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}

    @task(10)
    def recognize_single_image(self):
        """Most common operation"""
        with open("tests/fixtures/sample_logo.jpg", "rb") as f:
            image_base64 = base64.b64encode(f.read()).decode()

        self.client.post(
            "/api/v1/recognize/image",
            headers=self.headers,
            json={"image": image_base64},
            name="recognize_single"
        )

    @task(2)
    def batch_recognition(self):
        """Less frequent batch operation"""
        images = []
        for i in range(10):
            with open(f"tests/fixtures/logo_{i}.jpg", "rb") as f:
                images.append({
                    "id": str(i),
                    "image": base64.b64encode(f.read()).decode()
                })

        self.client.post(
            "/api/v1/recognize/batch",
            headers=self.headers,
            json={"images": images},
            name="recognize_batch"
        )
```

---

## 10. Performance Optimization

### 10.1 Caching Strategy

```python
class CacheManager:
    """Multi-layer caching strategy"""

    def __init__(self):
        self.redis_client = redis.Redis()
        self.local_cache = LRUCache(maxsize=1000)

    async def get_cached_recognition(self, image_hash: str, model_id: str):
        """Check caches in order: local -> Redis -> Database"""

        # Level 1: Local memory cache (fastest)
        cache_key = f"{image_hash}:{model_id}"
        if cache_key in self.local_cache:
            return self.local_cache[cache_key]

        # Level 2: Redis cache
        redis_result = await self.redis_client.get(f"recognition:{cache_key}")
        if redis_result:
            result = json.loads(redis_result)
            self.local_cache[cache_key] = result
            return result

        # Level 3: Database (slowest, but persistent)
        db_result = await self.get_from_database(image_hash, model_id)
        if db_result:
            # Populate caches
            await self.redis_client.setex(
                f"recognition:{cache_key}",
                3600,  # 1 hour TTL
                json.dumps(db_result)
            )
            self.local_cache[cache_key] = db_result
            return db_result

        return None
```

### 10.2 Model Optimization

```python
# ONNX Runtime optimization
import onnxruntime as ort

class OptimizedInference:
    def __init__(self, model_path):
        # Enable all optimizations
        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        sess_options.enable_cpu_mem_arena = True
        sess_options.enable_mem_pattern = True

        # Use CUDA if available
        providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']

        self.session = ort.InferenceSession(
            model_path,
            sess_options=sess_options,
            providers=providers
        )

    def batch_inference(self, images):
        """Process multiple images in single forward pass"""
        # Batch preprocessing
        batch_tensor = np.stack([self.preprocess(img) for img in images])

        # Single inference call
        outputs = self.session.run(None, {
            self.session.get_inputs()[0].name: batch_tensor
        })

        return outputs
```

### 10.3 Database Optimization

```sql
-- Partitioning for large tables
CREATE TABLE recognition_logs_2025_01 PARTITION OF recognition_logs
FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- Materialized views for common queries
CREATE MATERIALIZED VIEW recognition_stats AS
SELECT
    user_id,
    DATE(created_at) as date,
    COUNT(*) as request_count,
    AVG(processing_time_ms) as avg_processing_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_time_ms) as p95_time
FROM recognition_logs
GROUP BY user_id, DATE(created_at)
WITH DATA;

-- Refresh strategy
CREATE OR REPLACE FUNCTION refresh_recognition_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY recognition_stats;
END;
$$ LANGUAGE plpgsql;

-- Schedule refresh
SELECT cron.schedule('refresh-stats', '0 * * * *', 'SELECT refresh_recognition_stats()');
```

---

## Appendices

### A. API Error Codes Reference

| Code | Description | HTTP Status |
|------|-------------|-------------|
| AUTH_001 | Invalid credentials | 401 |
| AUTH_002 | Token expired | 401 |
| AUTH_003 | Insufficient permissions | 403 |
| VAL_001 | Invalid image format | 400 |
| VAL_002 | Image too large | 413 |
| VAL_003 | Missing required field | 400 |
| PROC_001 | Model not ready | 503 |
| PROC_002 | Recognition failed | 500 |
| RATE_001 | Rate limit exceeded | 429 |

### B. Configuration Reference

```yaml
# config/production.yaml
app:
  name: "Logo Recognition System"
  version: "1.0.0"
  environment: "production"

api:
  host: "0.0.0.0"
  port: 8000
  workers: 4
  cors_origins: ["https://app.example.com"]

database:
  host: "${DB_HOST}"
  port: 5432
  name: "logo_recognition"
  pool_size: 20
  max_overflow: 10

redis:
  host: "${REDIS_HOST}"
  port: 6379
  db: 0
  pool_size: 10

ml:
  model_path: "/models/efficientdet_d4.onnx"
  confidence_threshold: 0.99
  batch_size: 32
  max_detections: 100

storage:
  type: "s3"
  bucket: "logo-recognition"
  region: "eu-west-1"
  max_file_size: 10485760  # 10MB

security:
  jwt_secret: "${JWT_SECRET}"
  jwt_algorithm: "HS256"
  jwt_expiration: 3600  # 1 hour
  bcrypt_rounds: 12

monitoring:
  sentry_dsn: "${SENTRY_DSN}"
  log_level: "INFO"
  metrics_port: 9090
```

---

**Document Status:** Complete
**Version:** 1.0
**Last Updated:** 2025-09-14