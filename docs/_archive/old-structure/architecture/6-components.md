# 6. Components

## 6.1 Frontend Components

### Web Application
**Responsibility:** User interface for training and recognition

**Key Interfaces:**
- Training wizard for image upload and annotation
- Recognition interface with visual results
- Admin dashboard for system management
- Real-time training progress display

**Dependencies:** API Gateway, WebSocket Server

**Technology Stack:** React 18, TypeScript, Ant Design, TailwindCSS, Vite

### Smart Annotation Canvas
**Responsibility:** Interactive logo selection and annotation

**Key Interfaces:**
- Click-to-detect boundaries
- Manual rectangle adjustment
- Zoom viewer for precision
- Multi-logo support per image

**Dependencies:** Training API, Canvas API

**Technology Stack:** HTML5 Canvas, React hooks, gesture handling

## 6.2 Backend Components

### API Gateway
**Responsibility:** Request routing, authentication, rate limiting

**Key Interfaces:**
- JWT validation
- Request/response transformation
- Rate limiting per user/IP
- CORS handling

**Dependencies:** FastAPI server, Auth service

**Technology Stack:** Nginx/Traefik, Lua scripts for custom logic

### FastAPI Server
**Responsibility:** Core business logic and API endpoints

**Key Interfaces:**
- REST API endpoints
- WebSocket connections
- Database operations
- Job queue management

**Dependencies:** PostgreSQL, Redis, Celery

**Technology Stack:** FastAPI, SQLAlchemy, Pydantic, python-jose

### Training Pipeline
**Responsibility:** Logo training with few-shot learning

**Key Interfaces:**
- Image preprocessing
- Data augmentation (50x)
- Model training
- Accuracy evaluation

**Dependencies:** S3 storage, PostgreSQL, ML models

**Technology Stack:** PyTorch, Learn2Learn, Albumentations, ONNX

### Inference Engine
**Responsibility:** Real-time logo recognition

**Key Interfaces:**
- Image preprocessing
- Model inference
- Confidence thresholding
- Result post-processing

**Dependencies:** ONNX Runtime, Redis cache, pgvector

**Technology Stack:** ONNX Runtime, OpenCV, NumPy

### Celery Workers
**Responsibility:** Asynchronous task processing

**Key Interfaces:**
- Training job execution
- Batch processing
- Retroactive learning
- Report generation

**Dependencies:** Redis/RabbitMQ, PostgreSQL

**Technology Stack:** Celery, Redis, Flower for monitoring

## 6.3 Data Components

### PostgreSQL + pgvector
**Responsibility:** Primary data storage and vector similarity search

**Key Interfaces:**
- CRUD operations
- Vector similarity queries
- Transaction management
- Backup/restore

**Dependencies:** None (primary storage)

**Technology Stack:** PostgreSQL 15, pgvector extension, connection pooling

### Redis Cache
**Responsibility:** Session management and result caching

**Key Interfaces:**
- Session storage
- Recognition result cache
- Job queue backend
- Real-time pubsub

**Dependencies:** None (cache layer)

**Technology Stack:** Redis 7, Redis Streams, Redis Pub/Sub

### S3 Storage
**Responsibility:** Image and model artifact storage

**Key Interfaces:**
- Image upload/download
- Model versioning
- Batch operations
- Pre-signed URLs

**Dependencies:** None (object storage)

**Technology Stack:** AWS S3 or MinIO, boto3 SDK

---
