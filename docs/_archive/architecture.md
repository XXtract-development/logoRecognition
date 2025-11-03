# Logo Recognition System - Fullstack Architecture Document

**Version:** 1.0
**Date:** 2025-09-14
**Status:** Initial Architecture
**Author:** Winston (System Architect)

---

## 1. Introduction

This document outlines the complete fullstack architecture for the Logo Recognition System, including backend systems, frontend implementation, and their integration. It serves as the single source of truth for development, ensuring consistency across the entire technology stack.

The system is designed to provide intelligent, self-learning logo recognition with minimal training requirements (5-10 samples) while achieving 99% accuracy. It supports both web-based interfaces and API endpoints for integration into production environments.

### 1.1 Starter Template or Existing Project
**Status:** N/A - Greenfield project

This is a new development project without dependency on existing starter templates. The architecture has been designed specifically for the logo recognition requirements with focus on ML pipeline integration and real-time processing capabilities.

### 1.2 Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-09-14 | 1.0 | Initial architecture document | Winston |

---

## 2. High Level Architecture

### 2.1 Technical Summary

The Logo Recognition System employs a microservices architecture with clear separation between the ML pipeline, API layer, and frontend applications. The system uses FastAPI for the backend to leverage Python's ML ecosystem, React with TypeScript for a responsive frontend, and WebSocket connections for real-time training feedback. Infrastructure is containerized using Docker and orchestrated with Kubernetes for scalability. The architecture prioritizes accuracy over speed, employing EfficientDet-D4 for detection with a strict 99% confidence threshold, while maintaining sub-500ms response times through intelligent caching and ONNX runtime optimization.

### 2.2 Platform and Infrastructure Choice

**Platform:** AWS Full Stack
**Key Services:** EC2/EKS, S3, RDS (PostgreSQL), ElastiCache (Redis), CloudFront, API Gateway
**Deployment Regions:** eu-west-1 (primary), eu-central-1 (backup)

**Rationale:** AWS provides mature ML infrastructure with GPU instances for training, comprehensive storage solutions for image handling, and proven scalability for enterprise deployments. The European regions align with GDPR requirements and proximity to target users.

### 2.3 Repository Structure

**Structure:** Monorepo
**Monorepo Tool:** pnpm workspaces
**Package Organization:**
- `apps/` - Web and API applications
- `packages/` - Shared code, types, and utilities
- `infrastructure/` - IaC definitions

### 2.4 High Level Architecture Diagram

```mermaid
graph TB
    subgraph "Client Layer"
        WEB[React Web App]
        CAM[IP Cameras]
        API_CLIENT[API Clients]
    end

    subgraph "API Gateway Layer"
        NGINX[Nginx/Traefik]
        WS[WebSocket Server]
        RATE[Rate Limiter]
    end

    subgraph "Application Layer"
        FAST[FastAPI Server]
        AUTH[Auth Service]
    end

    subgraph "Processing Layer"
        CELERY[Celery Workers]
        TRAIN[Training Pipeline]
        INFER[Inference Engine]
    end

    subgraph "ML Layer"
        EFFICIENT[EfficientDet-D4]
        ONNX[ONNX Runtime]
        AUGMENT[Data Augmentation]
        RETRO[Retroactive Learning]
    end

    subgraph "Data Layer"
        PG[(PostgreSQL + pgvector)]
        REDIS[(Redis Cache)]
        S3[(S3 Object Storage)]
    end

    WEB --> NGINX
    CAM --> NGINX
    API_CLIENT --> NGINX
    NGINX --> RATE
    RATE --> FAST
    FAST --> AUTH
    FAST --> WS
    FAST --> CELERY
    CELERY --> TRAIN
    CELERY --> INFER
    TRAIN --> EFFICIENT
    INFER --> ONNX
    TRAIN --> AUGMENT
    TRAIN --> RETRO
    FAST --> PG
    FAST --> REDIS
    CELERY --> S3
    TRAIN --> PG
    INFER --> PG
```

### 2.5 Architectural Patterns

- **Microservices Architecture:** Separation of concerns between training, inference, and API services - _Rationale:_ Independent scaling and deployment of ML and web components
- **Event-Driven Processing:** Celery for async task processing - _Rationale:_ Non-blocking training and batch processing workflows
- **Repository Pattern:** Abstract data access logic in backend - _Rationale:_ Testability and potential database migration flexibility
- **Component-Based UI:** Reusable React components with TypeScript - _Rationale:_ Maintainability and type safety across the frontend
- **API Gateway Pattern:** Centralized entry point for all API calls - _Rationale:_ Unified auth, rate limiting, and monitoring
- **CQRS Pattern:** Separate read/write models for training vs inference - _Rationale:_ Optimize for different access patterns
- **Circuit Breaker Pattern:** Resilient external service calls - _Rationale:_ Graceful degradation when ML services are unavailable
- **Jamstack Principles:** Static generation where possible - _Rationale:_ Optimal performance for documentation and marketing pages

---

## 3. Tech Stack

### 3.1 Technology Stack Table

| Category | Technology | Version | Purpose | Rationale |
|----------|-----------|---------|---------|-----------|
| Frontend Language | TypeScript | 5.0+ | Type-safe frontend development | Type safety reduces runtime errors |
| Frontend Framework | React | 18.2+ | UI component framework | Mature ecosystem, excellent performance |
| UI Component Library | Ant Design | 5.0+ | Pre-built UI components | Enterprise-ready components with good UX |
| State Management | Zustand | 4.4+ | Client state management | Lightweight, TypeScript-first |
| Backend Language | Python | 3.11+ | Backend development | Best ML ecosystem integration |
| Backend Framework | FastAPI | 0.104+ | REST API framework | Modern, async, automatic OpenAPI |
| API Style | REST + WebSocket | - | API communication | REST for CRUD, WebSocket for real-time |
| Primary Database | PostgreSQL | 15+ | Main data storage | Mature, supports pgvector for similarity |
| Vector Extension | pgvector | 0.5+ | Vector similarity search | Essential for logo matching |
| Cache | Redis | 7.0+ | Session and result caching | Fast, supports complex data structures |
| File Storage | S3/MinIO | - | Image and model storage | Scalable object storage |
| Authentication | JWT + OAuth2 | - | User authentication | Stateless, scalable auth |
| ML Framework | PyTorch | 2.0+ | Model training | Best few-shot learning support |
| ML Runtime | ONNX Runtime | 1.16+ | Model inference | Optimized inference performance |
| Object Detection | EfficientDet-D4 | - | Logo detection | Best accuracy/performance balance |
| Task Queue | Celery | 5.3+ | Async task processing | Mature, Redis/RabbitMQ support |
| Frontend Testing | Vitest | 1.0+ | Unit/integration testing | Fast, Vite-native testing |
| Backend Testing | pytest | 7.4+ | Backend testing | Python standard, great fixtures |
| E2E Testing | Playwright | 1.40+ | End-to-end testing | Cross-browser, reliable |
| Build Tool | Vite | 5.0+ | Frontend build tool | Fast HMR, optimized builds |
| Bundler | Vite/Rollup | - | JavaScript bundling | Tree-shaking, code splitting |
| Container | Docker | 24+ | Containerization | Standard container platform |
| Orchestration | Kubernetes | 1.28+ | Container orchestration | Production-grade scaling |
| IaC Tool | Terraform | 1.6+ | Infrastructure as Code | Multi-cloud support |
| CI/CD | GitHub Actions | - | Continuous Integration | Integrated with repository |
| Monitoring | Prometheus + Grafana | - | Metrics and visualization | Open-source, Kubernetes-native |
| Logging | ELK Stack | 8.0+ | Centralized logging | Comprehensive log analysis |
| CSS Framework | TailwindCSS | 3.3+ | Utility-first CSS | Rapid UI development |

---

## 4. Data Models

### 4.1 User Model

**Purpose:** Represents system users who train and use the logo recognition system

**Key Attributes:**
- id: UUID - Unique identifier
- email: string - User email (unique)
- role: enum - User role (admin/user/viewer)
- organization_id: UUID - Organization reference
- created_at: timestamp - Account creation time

**TypeScript Interface:**
```typescript
interface User {
  id: string;
  email: string;
  role: 'admin' | 'user' | 'viewer';
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Relationships:**
- Has many TrainingBatches
- Belongs to Organization
- Has many RecognitionLogs

### 4.2 TrainingBatch Model

**Purpose:** Groups uploaded images for training sessions

**Key Attributes:**
- id: UUID - Unique identifier
- name: string - Batch name
- status: enum - Upload/processing status
- user_id: UUID - Creator reference
- file_count: integer - Number of images

**TypeScript Interface:**
```typescript
interface TrainingBatch {
  id: string;
  name: string;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  userId: string;
  fileCount: number;
  createdAt: Date;
}
```

**Relationships:**
- Belongs to User
- Has many Images
- Has many Annotations

### 4.3 Logo Model

**Purpose:** Represents a trained logo with its category and value

**Key Attributes:**
- id: UUID - Unique identifier
- category: string - Logo category (e.g., 'brand', 'recycling')
- value: string - Logo value (e.g., 'nike', 'PET')
- confidence_threshold: float - Minimum confidence for positive match
- training_samples: integer - Number of training samples

**TypeScript Interface:**
```typescript
interface Logo {
  id: string;
  category: string;
  value: string;
  confidenceThreshold: number;
  trainingSamples: number;
  accuracy: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

**Relationships:**
- Has many Annotations
- Has many LogoEmbeddings
- Has many RecognitionResults

### 4.4 Annotation Model

**Purpose:** Represents a single logo annotation on an image

**Key Attributes:**
- id: UUID - Unique identifier
- image_id: UUID - Source image reference
- bbox: object - Bounding box coordinates
- logo_id: UUID - Associated logo
- confidence: float - Annotation confidence

**TypeScript Interface:**
```typescript
interface Annotation {
  id: string;
  imageId: string;
  logoId: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  createdBy: string;
  createdAt: Date;
}
```

**Relationships:**
- Belongs to Image
- Belongs to Logo
- Created by User

### 4.5 RecognitionResult Model

**Purpose:** Stores logo recognition results for analysis and feedback

**Key Attributes:**
- id: UUID - Unique identifier
- request_id: string - API request identifier
- detections: JSON - Array of detected logos
- processing_time_ms: integer - Processing duration
- confidence_threshold: float - Applied threshold

**TypeScript Interface:**
```typescript
interface RecognitionResult {
  id: string;
  requestId: string;
  imageHash: string;
  detections: Array<{
    logoId: string;
    category: string;
    value: string;
    confidence: number;
    bbox: BoundingBox;
  }>;
  processingTimeMs: number;
  confidenceThreshold: number;
  createdAt: Date;
}
```

**Relationships:**
- Belongs to User
- References Model version
- May have FeedbackEntry

---

## 5. API Specification

### 5.1 REST API Specification

```yaml
openapi: 3.0.0
info:
  title: Logo Recognition API
  version: 1.0.0
  description: API for logo training and recognition
servers:
  - url: https://api.logo-recognition.com/v1
    description: Production server
  - url: http://localhost:8000/api/v1
    description: Development server

paths:
  /auth/login:
    post:
      summary: User login
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                email:
                  type: string
                password:
                  type: string
      responses:
        200:
          description: Successful login
          content:
            application/json:
              schema:
                type: object
                properties:
                  access_token:
                    type: string
                  refresh_token:
                    type: string
                  user:
                    $ref: '#/components/schemas/User'

  /training/upload:
    post:
      summary: Upload images for training
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                files:
                  type: array
                  items:
                    type: string
                    format: binary
                batch_name:
                  type: string
      responses:
        200:
          description: Upload successful
          content:
            application/json:
              schema:
                type: object
                properties:
                  batch_id:
                    type: string
                  files:
                    type: array

  /training/annotate:
    post:
      summary: Annotate logos in image
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                file_id:
                  type: string
                annotations:
                  type: array
                  items:
                    $ref: '#/components/schemas/Annotation'

  /training/smart-detect:
    post:
      summary: Smart click detection for logo boundaries
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                file_id:
                  type: string
                click_x:
                  type: integer
                click_y:
                  type: integer
      responses:
        200:
          description: Boundary detected
          content:
            application/json:
              schema:
                type: object
                properties:
                  detected_boundary:
                    $ref: '#/components/schemas/BoundingBox'
                  confidence:
                    type: number

  /recognize/image:
    post:
      summary: Recognize logos in image
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                image:
                  type: string
                  format: base64
                confidence_threshold:
                  type: number
                  default: 0.99
      responses:
        200:
          description: Recognition complete
          content:
            application/json:
              schema:
                type: object
                properties:
                  request_id:
                    type: string
                  detections:
                    type: array
                    items:
                      $ref: '#/components/schemas/Detection'
                  processing_time_ms:
                    type: integer

components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
        email:
          type: string
        role:
          type: string
          enum: [admin, user, viewer]

    BoundingBox:
      type: object
      properties:
        x:
          type: integer
        y:
          type: integer
        width:
          type: integer
        height:
          type: integer

    Detection:
      type: object
      properties:
        category:
          type: string
        value:
          type: string
        confidence:
          type: number
        bbox:
          $ref: '#/components/schemas/BoundingBox'

  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

### 5.2 WebSocket Events

```typescript
// Client -> Server Events
interface ClientEvents {
  'subscribe_training': {
    jobId: string;
  };
  'subscribe_recognition': {
    sessionId: string;
  };
}

// Server -> Client Events
interface ServerEvents {
  'training_progress': {
    jobId: string;
    progress: number;
    currentEpoch: number;
    totalEpochs: number;
    currentAccuracy: number;
  };
  'training_complete': {
    jobId: string;
    modelId: string;
    finalAccuracy: number;
    trainingTimeSeconds: number;
  };
  'recognition_result': {
    sessionId: string;
    requestId: string;
    detections: Detection[];
  };
}
```

---

## 6. Components

### 6.1 Frontend Components

#### Web Application
**Responsibility:** User interface for training and recognition

**Key Interfaces:**
- Training wizard for image upload and annotation
- Recognition interface with visual results
- Admin dashboard for system management
- Real-time training progress display

**Dependencies:** API Gateway, WebSocket Server

**Technology Stack:** React 18, TypeScript, Ant Design, TailwindCSS, Vite

#### Smart Annotation Canvas
**Responsibility:** Interactive logo selection and annotation

**Key Interfaces:**
- Click-to-detect boundaries
- Manual rectangle adjustment
- Zoom viewer for precision
- Multi-logo support per image

**Dependencies:** Training API, Canvas API

**Technology Stack:** HTML5 Canvas, React hooks, gesture handling

### 6.2 Backend Components

#### API Gateway
**Responsibility:** Request routing, authentication, rate limiting

**Key Interfaces:**
- JWT validation
- Request/response transformation
- Rate limiting per user/IP
- CORS handling

**Dependencies:** FastAPI server, Auth service

**Technology Stack:** Nginx/Traefik, Lua scripts for custom logic

#### FastAPI Server
**Responsibility:** Core business logic and API endpoints

**Key Interfaces:**
- REST API endpoints
- WebSocket connections
- Database operations
- Job queue management

**Dependencies:** PostgreSQL, Redis, Celery

**Technology Stack:** FastAPI, SQLAlchemy, Pydantic, python-jose

#### Training Pipeline
**Responsibility:** Logo training with few-shot learning

**Key Interfaces:**
- Image preprocessing
- Data augmentation (50x)
- Model training
- Accuracy evaluation

**Dependencies:** S3 storage, PostgreSQL, ML models

**Technology Stack:** PyTorch, Learn2Learn, Albumentations, ONNX

#### Inference Engine
**Responsibility:** Real-time logo recognition

**Key Interfaces:**
- Image preprocessing
- Model inference
- Confidence thresholding
- Result post-processing

**Dependencies:** ONNX Runtime, Redis cache, pgvector

**Technology Stack:** ONNX Runtime, OpenCV, NumPy

#### Celery Workers
**Responsibility:** Asynchronous task processing

**Key Interfaces:**
- Training job execution
- Batch processing
- Retroactive learning
- Report generation

**Dependencies:** Redis/RabbitMQ, PostgreSQL

**Technology Stack:** Celery, Redis, Flower for monitoring

### 6.3 Data Components

#### PostgreSQL + pgvector
**Responsibility:** Primary data storage and vector similarity search

**Key Interfaces:**
- CRUD operations
- Vector similarity queries
- Transaction management
- Backup/restore

**Dependencies:** None (primary storage)

**Technology Stack:** PostgreSQL 15, pgvector extension, connection pooling

#### Redis Cache
**Responsibility:** Session management and result caching

**Key Interfaces:**
- Session storage
- Recognition result cache
- Job queue backend
- Real-time pubsub

**Dependencies:** None (cache layer)

**Technology Stack:** Redis 7, Redis Streams, Redis Pub/Sub

#### S3 Storage
**Responsibility:** Image and model artifact storage

**Key Interfaces:**
- Image upload/download
- Model versioning
- Batch operations
- Pre-signed URLs

**Dependencies:** None (object storage)

**Technology Stack:** AWS S3 or MinIO, boto3 SDK

---

## 7. Component Interaction Diagram

```mermaid
graph LR
    subgraph "Frontend"
        UI[React UI]
        CANVAS[Annotation Canvas]
    end

    subgraph "API Layer"
        GW[API Gateway]
        WS[WebSocket]
        API[FastAPI]
    end

    subgraph "Processing"
        QUEUE[Celery Queue]
        TRAIN[Training Worker]
        INFER[Inference Worker]
    end

    subgraph "Storage"
        PG[(PostgreSQL)]
        REDIS[(Redis)]
        S3[(S3)]
    end

    UI --> GW
    CANVAS --> GW
    UI <--> WS
    GW --> API
    API --> QUEUE
    QUEUE --> TRAIN
    QUEUE --> INFER
    API --> PG
    API --> REDIS
    TRAIN --> S3
    TRAIN --> PG
    INFER --> REDIS
    INFER --> PG
```

---

## 8. Core Workflows

### 8.1 Training Workflow

```mermaid
sequenceDiagram
    participant User
    participant UI
    participant API
    participant Celery
    participant Train
    participant DB
    participant S3

    User->>UI: Upload images
    UI->>API: POST /training/upload
    API->>S3: Store images
    API->>DB: Create batch record
    API-->>UI: Return batch_id

    User->>UI: Click on logo
    UI->>API: POST /training/smart-detect
    API->>API: Edge detection
    API-->>UI: Return boundary

    User->>UI: Confirm annotation
    UI->>API: POST /training/annotate
    API->>DB: Store annotation

    User->>UI: Start training
    UI->>API: POST /training/train
    API->>Celery: Queue training job
    Celery->>Train: Execute training
    Train->>S3: Load images
    Train->>Train: Augment data (50x)
    Train->>Train: Few-shot learning
    Train->>DB: Store model metadata
    Train->>S3: Save model artifacts
    Train->>API: Training complete
    API->>WS: Send progress updates
    WS-->>UI: Display progress
```

### 8.2 Recognition Workflow

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant Cache
    participant Inference
    participant DB
    participant Vector

    Client->>API: POST /recognize/image
    API->>API: Hash image
    API->>Cache: Check cache

    alt Cache Hit
        Cache-->>API: Return cached result
        API-->>Client: Return detections
    else Cache Miss
        API->>Inference: Process image
        Inference->>Inference: Detect logos
        Inference->>Vector: Similarity search
        Vector->>DB: Query embeddings
        DB-->>Vector: Return matches
        Vector-->>Inference: Similar logos
        Inference->>Inference: Apply 99% threshold
        Inference-->>API: Detections
        API->>Cache: Store result
        API->>DB: Log recognition
        API-->>Client: Return detections
    end
```

### 8.3 Self-Learning Workflow

```mermaid
sequenceDiagram
    participant System
    participant Queue
    participant API
    participant Human
    participant Train
    participant DB

    System->>API: Low confidence detection
    API->>Queue: Add to review queue
    API->>DB: Store for feedback

    Human->>API: Review queue
    API->>DB: Fetch pending reviews
    API-->>Human: Display uncertain results

    Human->>API: Provide correct label
    API->>DB: Store feedback
    API->>Queue: Trigger retraining

    Queue->>Train: Retroactive training
    Train->>DB: Fetch feedback data
    Train->>Train: Update model
    Train->>DB: Store improved model
    Train-->>API: Model updated
```

---

## 9. Database Schema

### 9.1 SQL Schema

```sql
-- Core tables
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    organization_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE training_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'uploading',
    file_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES training_batches(id),
    filename VARCHAR(255),
    s3_key VARCHAR(500),
    width INTEGER,
    height INTEGER,
    file_size_bytes BIGINT,
    image_hash VARCHAR(64),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE logos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(100) NOT NULL,
    value VARCHAR(100) NOT NULL,
    confidence_threshold FLOAT DEFAULT 0.99,
    training_samples INTEGER DEFAULT 0,
    accuracy FLOAT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, value)
);

CREATE TABLE annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_id UUID REFERENCES images(id),
    logo_id UUID REFERENCES logos(id),
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    confidence FLOAT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ML-specific tables
CREATE TABLE models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255),
    version INTEGER DEFAULT 1,
    accuracy FLOAT,
    training_samples INTEGER,
    model_path VARCHAR(500),
    status VARCHAR(50) DEFAULT 'training',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

CREATE TABLE logo_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    logo_id UUID REFERENCES logos(id),
    model_id UUID REFERENCES models(id),
    embedding vector(768),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE recognition_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    model_id UUID REFERENCES models(id),
    request_id VARCHAR(100),
    image_hash VARCHAR(64),
    detections JSONB,
    confidence_threshold FLOAT,
    processing_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Feedback and learning tables
CREATE TABLE feedback_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recognition_log_id UUID REFERENCES recognition_logs(id),
    predicted_logo_id UUID REFERENCES logos(id),
    confidence FLOAT,
    correct_logo_id UUID REFERENCES logos(id),
    validated_by UUID REFERENCES users(id),
    validated_at TIMESTAMP,
    incorporated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_annotations_image ON annotations(image_id);
CREATE INDEX idx_annotations_logo ON annotations(logo_id);
CREATE INDEX idx_embeddings_logo ON logo_embeddings(logo_id);
CREATE INDEX idx_embeddings_vector ON logo_embeddings
    USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_recognition_logs_user ON recognition_logs(user_id);
CREATE INDEX idx_recognition_logs_hash ON recognition_logs(image_hash);
CREATE INDEX idx_feedback_queue_status ON feedback_queue(incorporated);
```

---

## 10. Frontend Architecture

### 10.1 Component Architecture

#### Component Organization
```
src/
├── components/
│   ├── common/          # Shared UI components
│   │   ├── Button/
│   │   ├── Modal/
│   │   └── LoadingSpinner/
│   ├── training/        # Training-specific components
│   │   ├── ImageUploader/
│   │   ├── AnnotationCanvas/
│   │   ├── CategorySelector/
│   │   └── TrainingProgress/
│   ├── recognition/     # Recognition components
│   │   ├── ImageInput/
│   │   ├── ResultsDisplay/
│   │   └── ConfidenceBar/
│   └── layout/          # Layout components
│       ├── Header/
│       ├── Sidebar/
│       └── Footer/
├── pages/               # Page components
│   ├── Training/
│   ├── Recognition/
│   ├── Dashboard/
│   └── Settings/
├── hooks/               # Custom React hooks
│   ├── useAuth.ts
│   ├── useWebSocket.ts
│   └── useApiClient.ts
├── services/            # API service layer
│   ├── api.ts
│   ├── auth.ts
│   └── training.ts
├── stores/              # Zustand stores
│   ├── authStore.ts
│   ├── trainingStore.ts
│   └── uiStore.ts
└── utils/               # Utility functions
    ├── validators.ts
    ├── formatters.ts
    └── constants.ts
```

#### Component Template
```typescript
// components/training/AnnotationCanvas/AnnotationCanvas.tsx
import React, { useRef, useState, useCallback } from 'react';
import { useTrainingStore } from '@/stores/trainingStore';
import { BoundingBox } from '@/types';
import styles from './AnnotationCanvas.module.css';

interface AnnotationCanvasProps {
  imageUrl: string;
  onAnnotation: (bbox: BoundingBox) => void;
}

export const AnnotationCanvas: React.FC<AnnotationCanvasProps> = ({
  imageUrl,
  onAnnotation
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const { smartDetect } = useTrainingStore();

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const boundary = await smartDetect(x, y);
    onAnnotation(boundary);
  }, [smartDetect, onAnnotation]);

  return (
    <div className={styles.container}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className={styles.canvas}
      />
    </div>
  );
};
```

### 10.2 State Management Architecture

#### State Structure
```typescript
// stores/types.ts
interface AppState {
  auth: AuthState;
  training: TrainingState;
  recognition: RecognitionState;
  ui: UIState;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
}

interface TrainingState {
  currentBatch: TrainingBatch | null;
  annotations: Annotation[];
  trainingProgress: number;
  isTraining: boolean;
}

interface RecognitionState {
  lastResult: RecognitionResult | null;
  isProcessing: boolean;
  history: RecognitionResult[];
}
```

#### State Management Patterns
- Use Zustand for global state management
- Implement optimistic updates for better UX
- Separate API state from UI state
- Use React Query for server state caching
- Implement undo/redo for annotations

### 10.3 Routing Architecture

#### Route Organization
```
src/router/
├── index.tsx           # Main router configuration
├── routes.ts           # Route definitions
├── guards/             # Route guards
│   ├── AuthGuard.tsx
│   └── RoleGuard.tsx
└── layouts/            # Route layouts
    ├── AppLayout.tsx
    └── AuthLayout.tsx
```

#### Protected Route Pattern
```typescript
// router/guards/AuthGuard.tsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

export const AuthGuard: React.FC = () => {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

// Usage in router
<Route element={<AuthGuard />}>
  <Route path="/dashboard" element={<Dashboard />} />
  <Route path="/training" element={<Training />} />
</Route>
```

### 10.4 Frontend Services Layer

#### API Client Setup
```typescript
// services/api.ts
import axios from 'axios';
import { useAuthStore } from '@/stores/authStore';

const API_BASE_URL = import.meta.env.VITE_API_URL;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Handle token refresh
      await refreshToken();
    }
    return Promise.reject(error);
  }
);
```

#### Service Example
```typescript
// services/training.ts
import { apiClient } from './api';
import { TrainingBatch, Annotation } from '@/types';

export const trainingService = {
  async uploadBatch(files: File[], name: string): Promise<TrainingBatch> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    formData.append('batch_name', name);

    const { data } = await apiClient.post('/training/upload', formData);
    return data;
  },

  async smartDetect(fileId: string, x: number, y: number) {
    const { data } = await apiClient.post('/training/smart-detect', {
      file_id: fileId,
      click_x: x,
      click_y: y
    });
    return data.detected_boundary;
  },

  async saveAnnotations(annotations: Annotation[]) {
    const { data } = await apiClient.post('/training/annotate', {
      annotations
    });
    return data;
  }
};
```

---

## 11. Backend Architecture

### 11.1 Service Architecture

#### Controller/Route Organization
```
app/
├── api/
│   ├── __init__.py
│   ├── dependencies.py     # Shared dependencies
│   └── v1/
│       ├── __init__.py
│       ├── auth.py         # Auth endpoints
│       ├── training.py     # Training endpoints
│       ├── recognition.py  # Recognition endpoints
│       └── admin.py        # Admin endpoints
├── core/
│   ├── config.py           # Configuration
│   ├── security.py         # Security utilities
│   └── exceptions.py       # Custom exceptions
├── models/
│   ├── __init__.py
│   ├── user.py
│   ├── training.py
│   └── recognition.py
├── schemas/
│   ├── __init__.py
│   ├── user.py
│   ├── training.py
│   └── recognition.py
├── services/
│   ├── __init__.py
│   ├── auth.py
│   ├── training.py
│   ├── recognition.py
│   └── ml/
│       ├── inference.py
│       ├── training.py
│       └── augmentation.py
├── repositories/
│   ├── __init__.py
│   ├── base.py
│   └── logo.py
├── tasks/                  # Celery tasks
│   ├── __init__.py
│   ├── training.py
│   └── recognition.py
└── main.py                 # FastAPI app
```

#### Controller Template
```python
# api/v1/training.py
from fastapi import APIRouter, Depends, UploadFile, File
from typing import List
from app.schemas.training import TrainingBatch, Annotation
from app.services.training import TrainingService
from app.api.dependencies import get_current_user

router = APIRouter(prefix="/training", tags=["training"])

@router.post("/upload", response_model=TrainingBatch)
async def upload_batch(
    files: List[UploadFile] = File(...),
    batch_name: str = Form(...),
    current_user = Depends(get_current_user),
    training_service: TrainingService = Depends()
):
    """Upload images for training"""
    return await training_service.create_batch(
        files=files,
        batch_name=batch_name,
        user_id=current_user.id
    )

@router.post("/smart-detect")
async def smart_detect(
    file_id: str,
    click_x: int,
    click_y: int,
    current_user = Depends(get_current_user),
    training_service: TrainingService = Depends()
):
    """Detect logo boundary from click point"""
    boundary = await training_service.smart_detect(
        file_id=file_id,
        x=click_x,
        y=click_y
    )
    return {"detected_boundary": boundary, "confidence": 0.95}
```

### 11.2 Database Architecture

#### Data Access Layer
```python
# repositories/logo.py
from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.logo import Logo, LogoEmbedding
from app.repositories.base import BaseRepository

class LogoRepository(BaseRepository[Logo]):
    def __init__(self, db: Session):
        super().__init__(Logo, db)

    async def find_by_category_value(
        self,
        category: str,
        value: str
    ) -> Optional[Logo]:
        return self.db.query(Logo).filter(
            Logo.category == category,
            Logo.value == value
        ).first()

    async def search_similar(
        self,
        embedding: List[float],
        threshold: float = 0.99,
        limit: int = 5
    ) -> List[Logo]:
        # Use pgvector for similarity search
        query = """
            SELECT l.*, 1 - (le.embedding <=> %s::vector) as similarity
            FROM logos l
            JOIN logo_embeddings le ON l.id = le.logo_id
            WHERE 1 - (le.embedding <=> %s::vector) > %s
            ORDER BY le.embedding <=> %s::vector
            LIMIT %s
        """
        results = self.db.execute(
            query,
            [embedding, embedding, threshold, embedding, limit]
        )
        return results.fetchall()
```

### 11.3 Authentication and Authorization

#### Auth Flow Diagram
```mermaid
sequenceDiagram
    participant Client
    participant API
    participant Auth
    participant DB
    participant Redis

    Client->>API: POST /auth/login
    API->>Auth: Validate credentials
    Auth->>DB: Check user
    DB-->>Auth: User data
    Auth->>Auth: Generate JWT
    Auth->>Redis: Store refresh token
    Auth-->>API: Tokens
    API-->>Client: Access + Refresh tokens

    Client->>API: Request with JWT
    API->>Auth: Validate JWT
    Auth-->>API: User context
    API->>API: Process request
    API-->>Client: Response
```

#### Middleware/Guards
```python
# api/dependencies.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from app.core.config import settings
from app.models.user import User

security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials"
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )

    user = await get_user_by_id(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return user

def require_role(role: str):
    def role_checker(current_user: User = Depends(get_current_user)):
        if current_user.role != role and current_user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions"
            )
        return current_user
    return role_checker
```

---

## 12. Unified Project Structure

```
logo-recognition/
├── .github/                    # CI/CD workflows
│   └── workflows/
│       ├── ci.yaml            # Continuous integration
│       ├── deploy-staging.yaml
│       └── deploy-prod.yaml
├── apps/                       # Application packages
│   ├── web/                    # Frontend application
│   │   ├── src/
│   │   │   ├── components/     # UI components
│   │   │   ├── pages/          # Page components
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   ├── services/       # API client services
│   │   │   ├── stores/         # Zustand stores
│   │   │   ├── styles/         # Global styles
│   │   │   ├── utils/          # Frontend utilities
│   │   │   └── main.tsx        # Entry point
│   │   ├── public/             # Static assets
│   │   ├── tests/              # Frontend tests
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── api/                    # Backend application
│       ├── app/
│       │   ├── api/            # API routes
│       │   ├── core/           # Core functionality
│       │   ├── models/         # SQLAlchemy models
│       │   ├── schemas/        # Pydantic schemas
│       │   ├── services/       # Business logic
│       │   ├── repositories/   # Data access layer
│       │   ├── tasks/          # Celery tasks
│       │   ├── ml/             # ML pipeline
│       │   │   ├── training/   # Training logic
│       │   │   ├── inference/  # Inference logic
│       │   │   └── models/     # Model definitions
│       │   └── main.py         # FastAPI app
│       ├── tests/              # Backend tests
│       ├── alembic/            # Database migrations
│       ├── requirements.txt
│       ├── pyproject.toml
│       └── Dockerfile
├── packages/                   # Shared packages
│   ├── shared/                 # Shared types/utilities
│   │   ├── src/
│   │   │   ├── types/          # TypeScript interfaces
│   │   │   │   ├── user.ts
│   │   │   │   ├── training.ts
│   │   │   │   └── recognition.ts
│   │   │   ├── constants/      # Shared constants
│   │   │   └── utils/          # Shared utilities
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── ui/                     # Shared UI components
│   │   ├── src/
│   │   │   ├── Button/
│   │   │   ├── Modal/
│   │   │   └── index.ts
│   │   └── package.json
│   └── config/                 # Shared configuration
│       ├── eslint/
│       │   └── .eslintrc.js
│       ├── typescript/
│       │   └── tsconfig.base.json
│       └── prettier/
│           └── .prettierrc
├── infrastructure/             # IaC definitions
│   ├── terraform/
│   │   ├── modules/
│   │   ├── environments/
│   │   └── main.tf
│   └── k8s/
│       ├── base/
│       ├── overlays/
│       └── kustomization.yaml
├── scripts/                    # Build/deploy scripts
│   ├── setup.sh               # Initial setup
│   ├── build.sh               # Build all packages
│   └── deploy.sh              # Deployment script
├── docs/                       # Documentation
│   ├── prd/                   # Product requirements
│   ├── architecture.md        # This document
│   ├── api/                   # API documentation
│   └── deployment/            # Deployment guides
├── .env.example                # Environment template
├── docker-compose.yml          # Local development
├── docker-compose.prod.yml     # Production compose
├── pnpm-workspace.yaml         # Monorepo configuration
├── package.json                # Root package.json
├── .gitignore
└── README.md
```

---

## 13. Development Workflow

### 13.1 Local Development Setup

#### Prerequisites
```bash
# Required software
node >= 18.0.0
pnpm >= 8.0.0
python >= 3.11
docker >= 24.0.0
docker-compose >= 2.20.0

# ML dependencies (optional for full local development)
CUDA >= 11.8 (for GPU training)
```

#### Initial Setup
```bash
# Clone repository
git clone https://github.com/org/logo-recognition.git
cd logo-recognition

# Install dependencies
pnpm install

# Python virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r apps/api/requirements.txt

# Setup databases
docker-compose up -d postgres redis minio

# Run migrations
cd apps/api
alembic upgrade head

# Copy environment files
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
```

#### Development Commands
```bash
# Start all services
pnpm dev

# Start frontend only
pnpm dev:web

# Start backend only
pnpm dev:api

# Start Celery workers
pnpm dev:worker

# Run tests
pnpm test              # All tests
pnpm test:web         # Frontend tests
pnpm test:api         # Backend tests
pnpm test:e2e         # E2E tests

# Linting and formatting
pnpm lint
pnpm format
```

### 13.2 Environment Configuration

#### Required Environment Variables
```bash
# Frontend (.env.local)
VITE_API_URL=http://localhost:8000/api/v1
VITE_WS_URL=ws://localhost:8000/ws
VITE_PUBLIC_URL=http://localhost:5173

# Backend (.env)
DATABASE_URL=postgresql://user:pass@localhost:5432/logo_recognition
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=logo-recognition
SECRET_KEY=your-secret-key-here
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1

# Shared
NODE_ENV=development
LOG_LEVEL=debug
```

---

## 14. Deployment Architecture

### 14.1 Deployment Strategy

**Frontend Deployment:**
- **Platform:** AWS CloudFront + S3
- **Build Command:** `pnpm build:web`
- **Output Directory:** `apps/web/dist`
- **CDN/Edge:** CloudFront with edge caching

**Backend Deployment:**
- **Platform:** AWS EKS (Kubernetes)
- **Build Command:** `docker build -f apps/api/Dockerfile`
- **Deployment Method:** Rolling update with blue-green for critical updates

### 14.2 CI/CD Pipeline

```yaml
# .github/workflows/deploy.yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          pnpm install
          pip install -r apps/api/requirements.txt

      - name: Run tests
        run: |
          pnpm test
          pytest apps/api/tests

  deploy-frontend:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build frontend
        run: |
          pnpm install
          pnpm build:web

      - name: Deploy to S3
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: eu-west-1

      - run: |
          aws s3 sync apps/web/dist s3://${{ secrets.S3_BUCKET }}
          aws cloudfront create-invalidation --distribution-id ${{ secrets.CF_DISTRIBUTION_ID }} --paths "/*"

  deploy-backend:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build and push Docker image
        run: |
          docker build -f apps/api/Dockerfile -t logo-api .
          docker tag logo-api:latest ${{ secrets.ECR_REGISTRY }}/logo-api:${{ github.sha }}
          docker push ${{ secrets.ECR_REGISTRY }}/logo-api:${{ github.sha }}

      - name: Deploy to EKS
        run: |
          kubectl set image deployment/api-deployment api=${{ secrets.ECR_REGISTRY }}/logo-api:${{ github.sha }}
          kubectl rollout status deployment/api-deployment
```

### 14.3 Environments

| Environment | Frontend URL | Backend URL | Purpose |
|-------------|-------------|-------------|---------|
| Development | http://localhost:5173 | http://localhost:8000 | Local development |
| Staging | https://staging.logo-recognition.com | https://api-staging.logo-recognition.com | Pre-production testing |
| Production | https://logo-recognition.com | https://api.logo-recognition.com | Live environment |

---

## 15. Security and Performance

### 15.1 Security Requirements

**Frontend Security:**
- CSP Headers: `default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline';`
- XSS Prevention: React's automatic escaping + DOMPurify for user content
- Secure Storage: JWT in httpOnly cookies, sensitive data in memory only

**Backend Security:**
- Input Validation: Pydantic models with strict validation
- Rate Limiting: 100 req/min per user, 1000 req/min per IP
- CORS Policy: Whitelist specific origins only

**Authentication Security:**
- Token Storage: httpOnly, secure, sameSite cookies
- Session Management: 1-hour access tokens, 7-day refresh tokens
- Password Policy: Min 12 chars, complexity requirements

### 15.2 Performance Optimization

**Frontend Performance:**
- Bundle Size Target: <200KB initial, <500KB total
- Loading Strategy: Code splitting by route, lazy loading
- Caching Strategy: Service worker with cache-first for assets

**Backend Performance:**
- Response Time Target: <500ms p95, <100ms p50
- Database Optimization: Connection pooling, query optimization, indexes
- Caching Strategy: Redis for sessions, results cache with 1-hour TTL

---

## 16. Testing Strategy

### 16.1 Testing Pyramid

```
        E2E Tests (10%)
       /              \
    Integration Tests (30%)
    /                    \
Frontend Unit (30%)  Backend Unit (30%)
```

### 16.2 Test Organization

#### Frontend Tests
```
apps/web/tests/
├── unit/
│   ├── components/
│   ├── hooks/
│   └── utils/
├── integration/
│   ├── pages/
│   └── services/
└── setup.ts
```

#### Backend Tests
```
apps/api/tests/
├── unit/
│   ├── services/
│   ├── repositories/
│   └── ml/
├── integration/
│   ├── api/
│   └── tasks/
└── conftest.py
```

#### E2E Tests
```
tests/e2e/
├── specs/
│   ├── training.spec.ts
│   ├── recognition.spec.ts
│   └── auth.spec.ts
├── fixtures/
└── playwright.config.ts
```

### 16.3 Test Examples

#### Frontend Component Test
```typescript
// apps/web/tests/unit/components/AnnotationCanvas.test.tsx
import { render, fireEvent, waitFor } from '@testing-library/react';
import { AnnotationCanvas } from '@/components/training/AnnotationCanvas';

describe('AnnotationCanvas', () => {
  it('should detect boundary on click', async () => {
    const onAnnotation = vi.fn();
    const { container } = render(
      <AnnotationCanvas
        imageUrl="/test.jpg"
        onAnnotation={onAnnotation}
      />
    );

    const canvas = container.querySelector('canvas');
    fireEvent.click(canvas!, { clientX: 100, clientY: 100 });

    await waitFor(() => {
      expect(onAnnotation).toHaveBeenCalledWith(
        expect.objectContaining({
          x: expect.any(Number),
          y: expect.any(Number),
          width: expect.any(Number),
          height: expect.any(Number)
        })
      );
    });
  });
});
```

#### Backend API Test
```python
# apps/api/tests/integration/api/test_training.py
import pytest
from fastapi.testclient import TestClient

def test_smart_detect(client: TestClient, auth_headers):
    response = client.post(
        "/api/v1/training/smart-detect",
        json={
            "file_id": "test-file-id",
            "click_x": 100,
            "click_y": 100
        },
        headers=auth_headers
    )

    assert response.status_code == 200
    data = response.json()
    assert "detected_boundary" in data
    assert data["detected_boundary"]["width"] > 0
    assert data["detected_boundary"]["height"] > 0
```

#### E2E Test
```typescript
// tests/e2e/specs/training.spec.ts
import { test, expect } from '@playwright/test';

test('complete training workflow', async ({ page }) => {
  await page.goto('/training');

  // Upload images
  await page.setInputFiles('input[type="file"]', [
    'tests/fixtures/logo1.jpg',
    'tests/fixtures/logo2.jpg'
  ]);

  // Wait for upload
  await expect(page.locator('.upload-progress')).toHaveText('Upload complete');

  // Click on logo
  await page.click('canvas', { position: { x: 100, y: 100 } });

  // Verify boundary detected
  await expect(page.locator('.boundary-preview')).toBeVisible();

  // Save annotation
  await page.click('button:has-text("Save")');

  // Start training
  await page.click('button:has-text("Start Training")');

  // Wait for completion
  await expect(page.locator('.training-progress')).toHaveText('Training complete', {
    timeout: 60000
  });
});
```

---

## 17. Coding Standards

### 17.1 Critical Fullstack Rules

- **Type Sharing:** Always define types in packages/shared and import from there
- **API Calls:** Never make direct HTTP calls - use the service layer
- **Environment Variables:** Access only through config objects, never process.env directly
- **Error Handling:** All API routes must use the standard error handler
- **State Updates:** Never mutate state directly - use proper state management patterns
- **Async Operations:** Always handle loading and error states in UI
- **Database Queries:** Use repository pattern, never raw SQL in services
- **File Uploads:** Validate size and type on both frontend and backend
- **Authentication:** Check permissions in both UI and API layers
- **Logging:** Use structured logging with correlation IDs

### 17.2 Naming Conventions

| Element | Frontend | Backend | Example |
|---------|----------|---------|---------|
| Components | PascalCase | - | `UserProfile.tsx` |
| Hooks | camelCase with 'use' | - | `useAuth.ts` |
| API Routes | - | kebab-case | `/api/user-profile` |
| Database Tables | - | snake_case | `user_profiles` |
| Environment Vars | SCREAMING_SNAKE | SCREAMING_SNAKE | `API_BASE_URL` |
| CSS Classes | kebab-case | - | `button-primary` |
| Python Classes | - | PascalCase | `TrainingService` |
| Python Functions | - | snake_case | `get_user_by_id` |

---

## 18. Error Handling Strategy

### 18.1 Error Flow

```mermaid
sequenceDiagram
    participant UI
    participant API
    participant Service
    participant DB
    participant Logger

    UI->>API: Request
    API->>Service: Process
    Service->>DB: Query

    alt Success
        DB-->>Service: Data
        Service-->>API: Result
        API-->>UI: Success Response
    else Database Error
        DB-->>Service: Error
        Service->>Logger: Log error
        Service-->>API: ServiceError
        API->>API: Transform to APIError
        API-->>UI: Error Response
    else Validation Error
        API->>Logger: Log validation error
        API-->>UI: 400 Bad Request
    else Auth Error
        API->>Logger: Log auth attempt
        API-->>UI: 401/403 Response
    end
```

### 18.2 Error Response Format

```typescript
interface ApiError {
  error: {
    code: string;          // e.g., "VALIDATION_ERROR"
    message: string;       // User-friendly message
    details?: Record<string, any>;  // Additional context
    timestamp: string;     // ISO timestamp
    requestId: string;     // Correlation ID
  };
}
```

### 18.3 Frontend Error Handling

```typescript
// utils/errorHandler.ts
export class ApiErrorHandler {
  static handle(error: AxiosError): void {
    const apiError = error.response?.data as ApiError;

    switch (apiError?.error.code) {
      case 'VALIDATION_ERROR':
        notification.error({
          message: 'Validation Error',
          description: apiError.error.message
        });
        break;

      case 'AUTH_ERROR':
        // Redirect to login
        window.location.href = '/login';
        break;

      case 'RATE_LIMIT':
        notification.warning({
          message: 'Rate Limited',
          description: 'Please slow down your requests'
        });
        break;

      default:
        notification.error({
          message: 'Error',
          description: 'An unexpected error occurred'
        });
        console.error('Unhandled error:', apiError);
    }
  }
}
```

### 18.4 Backend Error Handling

```python
# core/exceptions.py
from fastapi import HTTPException
from typing import Optional, Dict, Any

class ApiException(HTTPException):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(status_code=status_code)
        self.code = code
        self.message = message
        self.details = details

class ValidationError(ApiException):
    def __init__(self, message: str, details: Dict[str, Any]):
        super().__init__(
            status_code=400,
            code="VALIDATION_ERROR",
            message=message,
            details=details
        )

class NotFoundError(ApiException):
    def __init__(self, resource: str):
        super().__init__(
            status_code=404,
            code="NOT_FOUND",
            message=f"{resource} not found"
        )

# middleware/error_handler.py
from fastapi import Request
from fastapi.responses import JSONResponse
import uuid
from datetime import datetime

async def error_handler(request: Request, exc: ApiException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
                "timestamp": datetime.utcnow().isoformat(),
                "requestId": str(uuid.uuid4())
            }
        }
    )
```

---

## 19. Monitoring and Observability

### 19.1 Monitoring Stack

- **Frontend Monitoring:** Sentry for error tracking, Google Analytics for usage
- **Backend Monitoring:** Prometheus metrics + Grafana dashboards
- **Error Tracking:** Sentry with source maps for frontend, full stack traces for backend
- **Performance Monitoring:** New Relic APM for full-stack performance insights
- **Log Aggregation:** ELK Stack (Elasticsearch, Logstash, Kibana)
- **Uptime Monitoring:** Pingdom for endpoint availability

### 19.2 Key Metrics

**Frontend Metrics:**
- Core Web Vitals (LCP, FID, CLS)
- JavaScript error rate
- API response times
- User interaction events
- Page load times
- Bundle size tracking

**Backend Metrics:**
- Request rate (req/sec)
- Error rate (5xx errors/min)
- Response time (p50, p95, p99)
- Database query performance
- Cache hit rate
- Queue depth (Celery tasks)
- Model inference time
- Training job duration

**ML-Specific Metrics:**
- Recognition accuracy over time
- Confidence score distribution
- False positive/negative rates
- Model version performance
- Training data growth
- Feedback incorporation rate

### 19.3 Monitoring Implementation

```python
# monitoring/metrics.py
from prometheus_client import Counter, Histogram, Gauge

# API Metrics
api_requests = Counter(
    'api_requests_total',
    'Total API requests',
    ['method', 'endpoint', 'status']
)

api_latency = Histogram(
    'api_latency_seconds',
    'API latency in seconds',
    ['endpoint']
)

# ML Metrics
recognition_confidence = Histogram(
    'recognition_confidence',
    'Distribution of confidence scores',
    buckets=[0.5, 0.7, 0.8, 0.9, 0.95, 0.99, 1.0]
)

model_accuracy = Gauge(
    'model_accuracy',
    'Current model accuracy',
    ['model_version']
)

training_duration = Histogram(
    'training_duration_seconds',
    'Training job duration',
    ['model_type']
)

# Usage in API
@router.post("/recognize/image")
async def recognize_image(request: RecognitionRequest):
    with api_latency.labels(endpoint="/recognize/image").time():
        result = await recognition_service.process(request)

        api_requests.labels(
            method="POST",
            endpoint="/recognize/image",
            status=200
        ).inc()

        for detection in result.detections:
            recognition_confidence.observe(detection.confidence)

        return result
```

---

## 20. Disaster Recovery and Backup

### 20.1 Backup Strategy

**Database Backups:**
- Automated daily backups of PostgreSQL
- Point-in-time recovery enabled (7-day retention)
- Cross-region backup replication
- Monthly backup verification tests

**Model Artifacts:**
- All trained models versioned in S3
- Immutable storage with object lock
- Cross-region replication for critical models

**Application State:**
- Redis persistence with AOF + RDB
- Regular snapshots every 6 hours

### 20.2 Recovery Procedures

**RTO (Recovery Time Objective):** 2 hours
**RPO (Recovery Point Objective):** 1 hour

**Disaster Recovery Plan:**
1. Database failure: Restore from latest backup + WAL replay
2. Service failure: Auto-scaling and health checks trigger replacement
3. Region failure: DNS failover to backup region
4. Data corruption: Restore from versioned backups

---

## 21. Checklist Results Report

**Note:** Architecture document complete. Ready for architect-checklist validation when requested.

---

**Document Status:** Complete
**Version:** 1.0
**Last Updated:** 2025-09-14
**Next Review:** 2025-10-14

This architecture document serves as the technical blueprint for the Logo Recognition System implementation. It should be reviewed and updated regularly as the system evolves.