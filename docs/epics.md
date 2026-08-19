# logoRecognition - Epic Breakdown

**Author:** Friso
**Date:** 2025-12-05
**Project Level:** Enterprise
**Target Scale:** 10,000+ logo categories

---

## Overview

This document provides the complete epic and story breakdown for the Logo Recognition & Training System, decomposing the requirements from the [PRD](./01-product/prd.md) into implementable stories.

**Context Incorporated:**
- ✅ PRD v2.0.0 - Functional requirements and business goals
- ✅ Architecture v2.0.0 - Technical decisions (Fastify + FastAPI hybrid)
- ✅ UX Specifications - Component specs, design system, interaction patterns

---

## Functional Requirements Inventory

### Training Module (FR-TRAIN)

| ID | Requirement | Description | Priority |
|----|------------|-------------|----------|
| FR-TRAIN-001 | Batch Upload | Support for multiple images at once (JPG/PNG/WEBP, max 10MB, drag & drop) | P0 |
| FR-TRAIN-002 | Smart Click Detection | Automatic logo boundary detection with single click annotation | P0 |
| FR-TRAIN-003 | Category Management | CRUD for categories with hierarchy and bulk operations | P1 |
| FR-TRAIN-004 | Annotation Tools | Bounding box drawing, polygon selection, zoom/pan, keyboard shortcuts | P1 |
| FR-TRAIN-005 | Training Pipeline | Automated data augmentation, progress tracking, model versioning | P0 |

### Recognition Module (FR-RECOG)

| ID | Requirement | Description | Priority |
|----|------------|-------------|----------|
| FR-RECOG-001 | Web Upload | Drag & drop interface with preview before recognition | P0 |
| FR-RECOG-002 | API Endpoint | REST API with multipart support, JSON response, rate limiting | P0 |
| FR-RECOG-003 | Results Display | Bounding boxes overlay, confidence scores, Top-K predictions, export | P0 |
| FR-RECOG-004 | Real-time Processing | WebSocket updates, queue status tracking, progress indicators | P1 |

### Self-Learning Module (FR-LEARN)

| ID | Requirement | Description | Priority |
|----|------------|-------------|----------|
| FR-LEARN-001 | Active Learning | Uncertainty sampling, user feedback loop, automatic retraining triggers | P2 |
| FR-LEARN-002 | Model Evolution | Incremental learning, version comparison, rollback capability | P2 |

### Non-Functional Requirements (NFR)

| Category | ID | Requirement | Target |
|----------|----|-----------|---------|
| Performance | NFR-PERF-001 | API Response Time | <100ms (P95) |
| Performance | NFR-PERF-002 | Training Time | <30min for 1000 images |
| Performance | NFR-PERF-003 | Concurrent Users | 100+ |
| Performance | NFR-PERF-004 | Throughput | 1000 req/sec |
| Reliability | NFR-REL-001 | System Uptime | 99.9% |
| Reliability | NFR-REL-002 | Data Durability | 99.999% |
| Scalability | NFR-SCALE-001 | Logo Categories | 10,000+ |
| Security | NFR-SEC-001 | Authentication | JWT tokens |
| Security | NFR-SEC-002 | Transport | HTTPS only |
| Security | NFR-SEC-003 | Authorization | Role-based access control |
| Security | NFR-SEC-004 | Auditing | Comprehensive audit logs |
| Usability | NFR-USE-001 | Onboarding | <5 minutes |
| Usability | NFR-USE-002 | Task Efficiency | <3 clicks for main tasks |

---

## Epics Summary

| Epic | Title | User Value | FRs Covered | Status |
|------|-------|-----------|-------------|--------|
| 1 | Foundation & Infrastructure | Development environment ready for all teams | NFR-* | 📋 Ready |
| 2 | Image Upload & Management | Users can upload and organize images for training | FR-TRAIN-001, FR-TRAIN-003 | 📋 Ready |
| 3 | Logo Recognition | Users can recognize logos in uploaded images | FR-RECOG-001, FR-RECOG-002, FR-RECOG-003 | 📋 Ready |
| 4 | Training Annotation | Users can annotate images with logo boundaries | FR-TRAIN-002, FR-TRAIN-004 | 📋 Ready |
| 5 | Model Training Pipeline | Users can train custom logo detection models | FR-TRAIN-005, FR-RECOG-004 | 📋 Ready |
| 6 | Self-Learning System | System automatically improves from user feedback | FR-LEARN-001, FR-LEARN-002 | 📋 Ready |

---

## Epic 1: Foundation & Infrastructure

**Goal:** Establish the complete development environment and core infrastructure so that all subsequent feature development can proceed without blockers.

**User Value:** Development team can start building features immediately with a fully functional local environment, CI/CD pipeline, and database schema.

**PRD Coverage:** NFR-PERF-*, NFR-REL-*, NFR-SEC-*, NFR-SCALE-*

**Technical Context:**
- Fastify API Gateway (apps/api)
- FastAPI ML Service (apps/ml-service) - needs to be built
- PostgreSQL 16 + pgvector
- Redis 7 + BullMQ
- MinIO for object storage
- Docker Compose for local development

---

### Story 1.1: Development Environment Setup

As a **developer**,
I want **a complete local development environment with all services**,
So that **I can start developing features without manual setup**.

**Acceptance Criteria:**

**Given** I have cloned the repository
**When** I run `./scripts/start-dev.sh start`
**Then** all services start successfully:
- Web frontend on http://localhost:3000
- API Gateway on http://localhost:8000
- ML Service on http://localhost:8001
- PostgreSQL on localhost:5432
- Redis on localhost:6379
- MinIO on localhost:9000
- Prometheus on localhost:9090
- Grafana on localhost:3001

**And** I can verify all services are healthy via `./scripts/start-dev.sh health`
**And** all services have proper logging visible via `./scripts/start-dev.sh logs`

**Technical Notes:**
- Use docker-compose.full.yml (Architecture section 7.1)
- Scripts in /scripts/start-dev.sh already created
- Health endpoints: /health for each service

**Prerequisites:** None (first story)

---

### Story 1.2: Database Schema & Migrations

As a **developer**,
I want **a complete database schema with Prisma migrations**,
So that **I can interact with the database using type-safe queries**.

**Acceptance Criteria:**

**Given** the development environment is running
**When** I run `pnpm db:migrate`
**Then** all Prisma migrations are applied successfully
**And** the following tables exist in PostgreSQL:
- `logos.logo_images` with vector(512) column for embeddings
- `logos.training_data` for annotations
- `logos.model_versions` for ML model tracking
- `logos.search_history` for analytics
- `monitoring.query_stats` for performance metrics
- `monitoring.health_checks` for service health

**And** I can query the database using Prisma Client
**And** pgvector extension is enabled for similarity search

**Technical Notes:**
- Schema defined in apps/api/prisma/schema.prisma
- Based on infrastructure/docker/postgres/init.sql (Architecture 4.1)
- Run `npx prisma generate` to create client
- Run `npx prisma db push` for development

**Prerequisites:** Story 1.1

---

### Story 1.3: ML Service Skeleton

As a **developer**,
I want **a FastAPI ML service skeleton with health endpoints**,
So that **the API Gateway can communicate with the ML service**.

**Acceptance Criteria:**

**Given** the ML service is started
**When** I call `GET http://localhost:8001/health`
**Then** I receive a JSON response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "gpu_available": false,
  "models_loaded": 0
}
```

**And** the following endpoints are available:
- `POST /ml/detect` - Logo detection (returns 501 Not Implemented initially)
- `POST /ml/embed` - Generate embeddings (returns 501 Not Implemented initially)
- `POST /ml/train` - Start training (returns 501 Not Implemented initially)
- `GET /ml/models` - List models (returns empty array initially)

**And** the service has structured logging with request tracing
**And** the service has Prometheus metrics at `/metrics`

**Technical Notes:**
- Located at apps/ml-service/ (Architecture 3.2)
- Use FastAPI 0.100+ with Pydantic 2.0
- Use structlog for logging
- Include OpenTelemetry instrumentation

**Prerequisites:** Story 1.1

---

### Story 1.4: API Gateway - ML Service Integration

As a **developer**,
I want **the Fastify API Gateway to communicate with the ML Service**,
So that **client requests are properly routed to ML operations**.

**Acceptance Criteria:**

**Given** both API Gateway and ML Service are running
**When** I call `POST http://localhost:8000/api/v1/recognize` with an image
**Then** the request is forwarded to the ML Service
**And** the response is returned to the client with proper error handling

**And** when the ML Service is unavailable
**Then** the API returns a 503 Service Unavailable response
**And** the health check endpoint reflects the degraded status

**And** all requests are logged with correlation IDs
**And** request timing is measured and exposed via Prometheus

**Technical Notes:**
- ML Client: apps/api/src/services/ml-client.ts
- Use axios for HTTP communication
- Implement circuit breaker pattern for resilience
- Forward x-request-id header for tracing

**Prerequisites:** Story 1.2, Story 1.3

---

### Story 1.5: CI/CD Pipeline Setup

As a **developer**,
I want **automated testing and deployment via GitHub Actions**,
So that **code quality is maintained and deployments are automated**.

**Acceptance Criteria:**

**Given** I push code to the repository
**When** a pull request is created
**Then** the following checks run automatically:
- Lint (ESLint for TypeScript, ruff for Python)
- Type check (TypeScript tsc)
- Unit tests (Jest for Node, pytest for Python)
- Build verification

**And** when merging to main branch
**Then** Docker images are built and pushed to registry
**And** security scanning is performed (Trivy)
**And** staging deployment is triggered automatically

**And** production deployment requires manual approval

**Technical Notes:**
- Workflow at .github/workflows/ci-cd.yml
- Use pnpm for Node.js package management
- Use uv for Python package management
- Matrix testing for Node 20.x and 22.x

**Prerequisites:** Story 1.1

---

### Story 1.6: Authentication Foundation

As a **user**,
I want **to authenticate with the system using JWT tokens**,
So that **my data is protected and I can access my training data**.

**Acceptance Criteria:**

**Given** I am on the login page
**When** I enter valid credentials
**Then** I receive a JWT token stored in an httpOnly cookie
**And** I am redirected to the dashboard
**And** subsequent API requests include the authentication token

**Given** I have an expired token
**When** I make an API request
**Then** I receive a 401 Unauthorized response
**And** I am redirected to the login page

**And** rate limiting is applied: 5 login attempts per minute per IP
**And** all authentication events are logged to audit_events table

**Technical Notes:**
- JWT tokens with 24h expiry (Architecture 6.1)
- Store refresh tokens in Redis
- Use @fastify/jwt for token validation
- Password hashing with bcrypt (12 rounds)

**Prerequisites:** Story 1.2, Story 1.4

---

## Epic 2: Image Upload & Management

**Goal:** Enable users to upload, organize, and manage images for training the logo recognition system.

**User Value:** Data Managers can efficiently upload large batches of images and organize them into categories for training.

**PRD Coverage:** FR-TRAIN-001, FR-TRAIN-003

**Technical Context:**
- MinIO for S3-compatible storage
- Multipart upload via @fastify/multipart
- Image validation (format, size, dimensions)
- Ant Design Upload component

**UX Context:**
- Drag & drop interface (UX 13.3)
- Progress indicators for uploads
- Thumbnail previews

---

### Story 2.1: Single Image Upload

As a **Data Manager**,
I want **to upload a single image via the web interface**,
So that **I can add new training data to the system**.

**Acceptance Criteria:**

**Given** I am logged in and on the Training page
**When** I drag an image file onto the upload area
**Then** I see a preview of the image before upload
**And** I see a progress indicator during upload
**And** the image is uploaded to MinIO storage

**And** the following validations are applied:
- File formats: JPG, PNG, WEBP only
- Maximum file size: 10MB
- Minimum dimensions: 100x100 pixels

**And** after successful upload:
- The image appears in my image library
- A thumbnail is generated (280x160px)
- Metadata is stored in the database

**And** if validation fails, I see a clear error message

**Technical Notes:**
- Endpoint: POST /api/v1/training/upload
- Use @fastify/multipart (max 10MB, Architecture 3.1)
- Store in MinIO bucket: training-images/{user_id}/{uuid}.{ext}
- Generate thumbnail using sharp library

**Prerequisites:** Epic 1 complete

---

### Story 2.2: Batch Image Upload

As a **Data Manager**,
I want **to upload multiple images at once**,
So that **I can efficiently add large datasets for training**.

**Acceptance Criteria:**

**Given** I am on the Training page
**When** I select multiple images (up to 50) or drag a folder
**Then** I see all selected images in a preview grid
**And** I can remove individual images before upload
**And** I see overall progress and per-file progress

**And** uploads happen in parallel (max 3 concurrent)
**And** failed uploads can be retried individually
**And** successful uploads are added to my library progressively

**And** I can cancel the entire batch upload at any time
**And** cancelled uploads do not leave orphaned files

**Technical Notes:**
- Frontend: Ant Design Upload with multiple=true
- Backend: Process files in parallel with BullMQ
- Implement resumable uploads for large files
- Track batch progress in Redis

**Prerequisites:** Story 2.1

---

### Story 2.3: Image Library View

As a **Data Manager**,
I want **to view and browse my uploaded images**,
So that **I can find images to annotate or review**.

**Acceptance Criteria:**

**Given** I am on the Training page
**When** I view the Image Library tab
**Then** I see a grid of image thumbnails (320x240px cards, UX 13.3.3)
**And** each card shows:
- Thumbnail image
- Filename
- Upload date
- Annotation status (none/partial/complete)

**And** I can switch between grid view and list view
**And** I can sort by: date, name, status
**And** I can filter by: annotation status, category
**And** pagination loads more images on scroll (infinite scroll)

**Technical Notes:**
- Use TanStack Query for data fetching
- Implement virtual scrolling for large lists
- Lazy load thumbnails
- Cache thumbnails in browser

**Prerequisites:** Story 2.1

---

### Story 2.4: Category Management

As a **Data Manager**,
I want **to create and manage logo categories**,
So that **I can organize training data by brand/logo type**.

**Acceptance Criteria:**

**Given** I am on the Categories page
**When** I click "New Category"
**Then** I can enter:
- Category name (required, unique)
- Parent category (optional, for hierarchy)
- Description (optional)
- Color tag (for visual identification)

**And** I can edit existing categories
**And** I can delete empty categories
**And** I cannot delete categories with assigned images
**And** I can merge two categories into one

**And** categories are displayed in a tree view for hierarchy
**And** I can drag-drop to reorder or change parent

**Technical Notes:**
- Store in logos.categories table with parent_id
- Implement soft delete for audit trail
- Use Ant Design Tree component
- Limit hierarchy depth to 3 levels

**Prerequisites:** Story 1.2

---

### Story 2.5: Bulk Image Assignment

As a **Data Manager**,
I want **to assign multiple images to a category at once**,
So that **I can efficiently organize large datasets**.

**Acceptance Criteria:**

**Given** I am viewing the Image Library
**When** I select multiple images (checkbox or shift+click)
**Then** I see a bulk action toolbar
**And** I can click "Assign to Category"
**And** I can select a category from a searchable dropdown
**And** all selected images are assigned to that category

**And** I can also bulk delete images
**And** I can export selected images as ZIP
**And** selection persists across pagination

**Technical Notes:**
- Implement selection state in Zustand store
- Batch API endpoint: PATCH /api/v1/images/bulk
- Maximum 100 images per bulk operation
- Show progress for bulk operations

**Prerequisites:** Story 2.3, Story 2.4

---

## Epic 3: Logo Recognition

**Goal:** Enable users to recognize logos in images using the ML model and view results with confidence scores.

**User Value:** Production Operators can upload images and instantly see detected logos with confidence levels, enabling quality control workflows.

**PRD Coverage:** FR-RECOG-001, FR-RECOG-002, FR-RECOG-003

**Technical Context:**
- EfficientDet-D4 for detection (Architecture 5.1)
- ONNX Runtime for inference
- Vector similarity search with pgvector
- REST API with multipart support

**UX Context:**
- Drag & drop upload (UX 13.3.3)
- Bounding box overlays
- Confidence score visualization (color-coded)

---

### Story 3.1: Image Recognition Upload

As a **Production Operator**,
I want **to upload an image for logo recognition**,
So that **I can identify logos in the image**.

**Acceptance Criteria:**

**Given** I am on the Recognition page
**When** I drag an image onto the upload area
**Then** I see a preview of the image
**And** the image is sent to the ML service for detection
**And** I see a loading spinner while processing
**And** results appear within 100ms (P95) per NFR-PERF-001

**And** if detection fails, I see a clear error message
**And** I can retry the detection

**Technical Notes:**
- Endpoint: POST /api/v1/recognize
- Forward to ML Service: POST /ml/detect
- Cache results in Redis by image hash (1 hour TTL)
- Return 202 Accepted for async processing

**Prerequisites:** Epic 1 complete, Story 1.3 (ML Service)

---

### Story 3.2: ML Detection Pipeline

As a **system**,
I want **to process images through the detection pipeline**,
So that **logos are detected with bounding boxes and confidence scores**.

**Acceptance Criteria:**

**Given** an image is submitted for recognition
**When** the ML service processes the image
**Then** the following steps occur:
1. Image preprocessing (resize to 640x640, normalize)
2. Run inference through ONNX model
3. Apply Non-Maximum Suppression (NMS) with IoU=0.5
4. Generate embeddings for detected regions
5. Perform similarity search against known logos

**And** each detection includes:
- Bounding box coordinates (x, y, width, height)
- Confidence score (0-100%)
- Matched logo ID (if similarity > 0.8)
- Embedding vector (512 dimensions)

**And** processing time is logged for monitoring

**Technical Notes:**
- Use ONNX Runtime with CPU (GPU optional)
- Model: EfficientDet-D4 (50MB) per PRD
- Similarity search using pgvector cosine distance
- Return top 5 matches per detection

**Prerequisites:** Story 1.3

---

### Story 3.3: Recognition Results Display

As a **Production Operator**,
I want **to view recognition results with visual overlays**,
So that **I can verify detected logos and their confidence**.

**Acceptance Criteria:**

**Given** recognition has completed
**When** I view the results
**Then** I see the original image with bounding box overlays
**And** each bounding box is color-coded by confidence:
- Green (≥99%): High confidence
- Yellow (90-99%): Medium confidence
- Red (<90%): Low confidence

**And** clicking a bounding box shows:
- Logo name/category
- Confidence percentage
- Top 5 similar logos from database
- Option to accept or reject match

**And** I can zoom in/out on the image (50%-400%, UX 13.3.1)
**And** I can toggle bounding box visibility

**Technical Notes:**
- Use Konva for canvas rendering
- Color palette from UX spec (13.2)
- Implement hover states for bounding boxes
- Store result in search_history for analytics

**Prerequisites:** Story 3.1, Story 3.2

---

### Story 3.4: Recognition API Endpoint

As a **developer**,
I want **a REST API endpoint for logo recognition**,
So that **external systems can integrate with the recognition service**.

**Acceptance Criteria:**

**Given** I have a valid API key
**When** I call `POST /api/v1/recognize` with:
```
Content-Type: multipart/form-data
- image: <binary>
- options: { "threshold": 0.5, "max_results": 10 }
```

**Then** I receive a JSON response:
```json
{
  "request_id": "uuid",
  "processing_time_ms": 85,
  "detections": [
    {
      "box": { "x": 100, "y": 200, "width": 50, "height": 50 },
      "confidence": 0.97,
      "logo_id": "uuid",
      "logo_name": "Acme Corp",
      "category": "Technology"
    }
  ]
}
```

**And** rate limiting is applied: 100 requests/minute per API key
**And** request/response is logged for auditing

**Technical Notes:**
- Use @fastify/rate-limit
- API key authentication via x-api-key header
- Max image size: 10MB
- Supported formats: JPG, PNG, WEBP

**Prerequisites:** Story 3.2

---

### Story 3.5: Batch Recognition

As a **Data Manager**,
I want **to recognize logos in multiple images at once**,
So that **I can process large datasets efficiently**.

**Acceptance Criteria:**

**Given** I am on the Recognition page
**When** I upload multiple images (up to 20)
**Then** they are queued for processing
**And** I see a progress indicator for the batch
**And** results appear as each image is processed

**And** I can view all results in a summary grid
**And** I can export results as CSV or JSON
**And** failed images can be retried

**Technical Notes:**
- Use BullMQ for job queue
- Process in parallel (max 4 concurrent)
- WebSocket updates for progress
- Store batch results in Redis (24h TTL)

**Prerequisites:** Story 3.3, Epic 5 (WebSocket)

---

## Epic 4: Training Annotation

**Goal:** Enable users to annotate images with logo boundaries using smart detection and manual tools.

**User Value:** Data Managers can quickly annotate logos with minimal effort using smart click detection, reducing annotation time by 80%.

**PRD Coverage:** FR-TRAIN-002, FR-TRAIN-004

**Technical Context:**
- Konva canvas for annotation
- Smart click detection via ML
- PostgreSQL for annotation storage
- Real-time validation

**UX Context:**
- Annotation canvas specs (UX 13.3.1)
- Cursor states and feedback
- Keyboard shortcuts

---

### Story 4.1: Annotation Canvas

As a **Data Manager**,
I want **an interactive canvas for viewing and annotating images**,
So that **I can draw bounding boxes around logos**.

**Acceptance Criteria:**

**Given** I select an image for annotation
**When** the annotation canvas opens
**Then** I see the image centered in the canvas
**And** I can zoom in/out using scroll wheel (50%-400%)
**And** I can pan by holding space and dragging
**And** I can reset view with double-click

**And** the canvas shows:
- Rulers on edges with pixel coordinates
- Grid overlay (toggleable)
- Current zoom level indicator
- Mouse coordinates in status bar

**Technical Notes:**
- Use Konva Stage with responsive sizing
- Max canvas: 1200x800px (UX 13.3.1)
- Zoom levels: 50%, 75%, 100%, 150%, 200%, 400%
- Implement smooth zoom animation

**Prerequisites:** Story 2.3

---

### Story 4.2: Manual Bounding Box Drawing

As a **Data Manager**,
I want **to draw bounding boxes around logos manually**,
So that **I can annotate logos that smart detection misses**.

**Acceptance Criteria:**

**Given** I am on the annotation canvas
**When** I click and drag on the image
**Then** a bounding box is drawn from start to end point
**And** the box shows resize handles at corners and edges
**And** I can resize the box by dragging handles
**And** I can move the box by dragging the center

**And** when I release the mouse:
- A category selection popup appears
- I can select from existing categories or create new
- The annotation is saved to the database

**And** I can delete a box by selecting it and pressing Delete
**And** I can undo/redo with Ctrl+Z / Ctrl+Shift+Z

**Technical Notes:**
- Use Konva Rect for bounding boxes
- Minimum box size: 20x20 pixels
- Store as x, y, width, height (normalized 0-1)
- Implement undo stack (max 50 operations)

**Prerequisites:** Story 4.1, Story 2.4

---

### Story 4.3: Smart Click Detection

As a **Data Manager**,
I want **to annotate logos with a single click**,
So that **I can annotate images 80% faster than manual drawing**.

**Acceptance Criteria:**

**Given** I am on the annotation canvas
**When** I single-click on a logo in the image
**Then** the system automatically detects the logo boundary
**And** I see a pulsing blue dot at my click point (8px, UX 13.3.1)
**And** I see a dashed blue line around the detected boundary
**And** I can accept the detection by clicking "Accept" or pressing Enter
**And** I can adjust the boundary by dragging handles
**And** I can reject and try again

**And** if detection fails:
- I see a message "Could not detect boundary"
- I can fall back to manual drawing

**Technical Notes:**
- Call ML Service: POST /ml/detect with click coordinates
- Use SAM (Segment Anything Model) for click-to-segment
- Return boundary as polygon or bounding box
- Cache detection model in memory

**Prerequisites:** Story 4.2, Story 3.2

---

### Story 4.4: Annotation Keyboard Shortcuts

As a **Data Manager**,
I want **keyboard shortcuts for common annotation actions**,
So that **I can annotate efficiently without using the mouse**.

**Acceptance Criteria:**

**Given** I am on the annotation canvas
**Then** the following shortcuts are available:

| Shortcut | Action |
|----------|--------|
| Space + Drag | Pan canvas |
| Scroll | Zoom in/out |
| Double-click | Reset view |
| B | Bounding box tool |
| P | Polygon tool |
| V | Selection tool |
| Delete | Delete selected |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Ctrl+S | Save annotations |
| Enter | Accept detection |
| Escape | Cancel current action |
| [ / ] | Previous/Next image |

**And** shortcuts are displayed in a help panel (? to toggle)
**And** shortcuts work regardless of focus (except in input fields)

**Technical Notes:**
- Use useHotkeys hook from react-hotkeys-hook
- Display shortcut hints in toolbar buttons
- Persist shortcut preferences per user

**Prerequisites:** Story 4.2

---

### Story 4.5: Annotation Review & Validation

As a **Data Manager**,
I want **to review and validate annotations before training**,
So that **only high-quality data is used for model training**.

**Acceptance Criteria:**

**Given** I have annotated images
**When** I go to the Review page
**Then** I see images grouped by annotation status:
- Pending review
- Approved
- Needs correction

**And** for each image I can:
- View all annotations overlaid
- Approve all annotations
- Mark specific annotations for correction
- Add notes for corrections needed

**And** I can filter by:
- Annotator (if multiple users)
- Date range
- Category
- Confidence score

**And** I can bulk approve/reject selected images

**Technical Notes:**
- Store validation status in training_data.validated
- Implement reviewer role (RBAC)
- Track validation history for audit

**Prerequisites:** Story 4.2

---

## Epic 5: Model Training Pipeline

**Goal:** Enable users to train custom logo detection models from their annotated data with progress tracking and model versioning.

**User Value:** Data Managers can train new models and track progress in real-time, then activate the best performing model for production.

**PRD Coverage:** FR-TRAIN-005, FR-RECOG-004

**Technical Context:**
- PyTorch for training
- BullMQ for job queue
- WebSocket for real-time updates
- MinIO for model storage
- Model versioning in PostgreSQL

**UX Context:**
- Training progress dashboard (UX 13.3.2)
- Epoch counter and loss graph
- ETA display

---

### Story 5.1: Training Job Creation

As a **Data Manager**,
I want **to start a training job with selected data**,
So that **I can create a new logo detection model**.

**Acceptance Criteria:**

**Given** I have validated annotations
**When** I click "Start Training" on the Training page
**Then** I see a configuration dialog with:
- Data selection (categories, date range, minimum annotations)
- Model name (required, unique)
- Training parameters:
  - Batch size (default: 16)
  - Epochs (default: 100)
  - Learning rate (default: 0.001)
  - Augmentation factor (default: 50)
  - Validation split (default: 20%)

**And** I see a data summary:
- Total images selected
- Total annotations
- Category distribution chart
- Estimated training duration

**And** when I click "Start":
- The job is queued in BullMQ
- I receive a job ID
- I am redirected to the progress page

**Technical Notes:**
- Endpoint: POST /api/v1/training/start
- Store config in model_versions table
- Validate minimum 10 images per category
- Use default EfficientDet-D4 architecture

**Prerequisites:** Story 4.5, Story 1.3

---

### Story 5.2: Training Progress Tracking

As a **Data Manager**,
I want **to monitor training progress in real-time**,
So that **I know how the training is proceeding and when it will complete**.

**Acceptance Criteria:**

**Given** a training job is running
**When** I view the Training Progress page
**Then** I see real-time updates via WebSocket (every 500ms, UX 13.3.2):
- Accuracy gauge (circular, 200x200px)
- Current epoch / total epochs
- Loss graph (line chart, 400x200px)
- Samples processed / total samples
- ETA countdown timer
- Current learning rate

**And** I can see the training log (last 100 lines)
**And** I can pause/resume training
**And** I can cancel training (with confirmation)

**And** when training completes:
- I receive a notification
- I am shown final metrics
- The model is saved to model_versions

**Technical Notes:**
- WebSocket endpoint: /api/v1/ws
- Message type: training_progress
- Store progress in Redis (training:{job_id})
- Use Recharts for loss graph

**Prerequisites:** Story 5.1

---

### Story 5.3: Training Metrics & Evaluation

As a **Data Manager**,
I want **to see detailed training metrics and model evaluation**,
So that **I can assess model quality before deployment**.

**Acceptance Criteria:**

**Given** training has completed
**When** I view the model details page
**Then** I see comprehensive metrics:
- Accuracy (mAP@0.5 IoU)
- Precision per category
- Recall per category
- F1 score per category
- Confusion matrix
- Training loss curve
- Validation loss curve

**And** I can compare with previous model versions
**And** I can see sample predictions on validation data
**And** I can download the training report (PDF)

**Technical Notes:**
- Store metrics in model_versions JSONB column
- Generate confusion matrix from validation set
- Use matplotlib for report generation
- Export metrics to Prometheus

**Prerequisites:** Story 5.2

---

### Story 5.4: Model Version Management

As a **Data Manager**,
I want **to manage multiple model versions**,
So that **I can compare performance and rollback if needed**.

**Acceptance Criteria:**

**Given** I have trained multiple models
**When** I go to the Models page
**Then** I see a list of all model versions with:
- Version number (auto-incremented)
- Model name
- Training date
- Accuracy score
- Status (active/inactive/training/failed)
- Size (MB)

**And** I can:
- Activate a model for production (one active at a time)
- Deactivate the current model
- Delete old models (with confirmation)
- Download model weights (ONNX format)
- Compare two models side-by-side

**And** the active model is highlighted
**And** I see a warning before deleting models with >95% accuracy

**Technical Notes:**
- Store in model_versions table (Architecture 4.1)
- Model artifacts in MinIO: models/{version_id}/
- ONNX export for deployment
- Maximum 10 versions retained (configurable)

**Prerequisites:** Story 5.3

---

### Story 5.5: Model Activation & Deployment

As a **Data Manager**,
I want **to activate a trained model for production use**,
So that **the recognition system uses my latest trained model**.

**Acceptance Criteria:**

**Given** I have a trained model with good metrics
**When** I click "Activate" on the model
**Then** I see a confirmation dialog showing:
- Current active model details
- New model metrics comparison
- Warning about recognition behavior change

**And** when I confirm:
- The new model is loaded into ML service
- The old model is deactivated (not deleted)
- All new recognition requests use the new model
- I receive a success notification

**And** if activation fails:
- The old model remains active
- I see an error message
- The issue is logged for debugging

**Technical Notes:**
- Endpoint: POST /api/v1/models/{id}/activate
- Hot-reload model in ML service without restart
- Use blue-green deployment pattern
- Health check before completing activation

**Prerequisites:** Story 5.4

---

### Story 5.6: WebSocket Real-time Updates

As a **user**,
I want **to receive real-time updates via WebSocket**,
So that **I see progress without refreshing the page**.

**Acceptance Criteria:**

**Given** I am connected to the WebSocket endpoint
**When** I subscribe to a training job
**Then** I receive updates every 500ms with:
```json
{
  "type": "training_progress",
  "job_id": "uuid",
  "data": {
    "epoch": 45,
    "total_epochs": 100,
    "loss": 0.0234,
    "accuracy": 0.956,
    "samples_processed": 4500,
    "eta_seconds": 1200
  }
}
```

**And** when training completes:
```json
{
  "type": "training_complete",
  "job_id": "uuid",
  "data": {
    "model_id": "uuid",
    "final_accuracy": 0.987
  }
}
```

**And** connection is automatically reconnected on disconnect
**And** I receive a ping/pong heartbeat every 30 seconds

**Technical Notes:**
- Endpoint: ws://localhost:8000/api/v1/ws
- Use @fastify/websocket
- Implement subscription pattern for job_id
- Store active connections in memory

**Prerequisites:** Story 1.4

---

## Epic 6: Self-Learning System

**Goal:** Enable the system to automatically improve from user feedback and incrementally learn from new data.

**User Value:** The system continuously improves accuracy over time with minimal manual intervention, reducing ongoing training effort.

**PRD Coverage:** FR-LEARN-001, FR-LEARN-002

**Technical Context:**
- Active learning with uncertainty sampling
- Incremental model updates
- Feedback loop integration
- A/B testing framework

---

### Story 6.1: Recognition Feedback Loop

As a **Production Operator**,
I want **to provide feedback on recognition results**,
So that **the system learns from corrections**.

**Acceptance Criteria:**

**Given** I am viewing recognition results
**When** I see an incorrect detection
**Then** I can click "Incorrect" on the detection
**And** I can provide the correct label from a dropdown
**And** my feedback is stored for retraining

**And** when I confirm a correct detection
**Then** it is marked as validated positive
**And** confidence in that logo increases

**And** I can see my feedback history
**And** I receive credit/stats for contributions

**Technical Notes:**
- Store in feedback_entries table
- Track user_id, detection_id, correct_label
- Use for active learning sample selection
- Implement feedback quality scoring

**Prerequisites:** Story 3.3

---

### Story 6.2: Uncertainty Sampling

As a **system**,
I want **to identify low-confidence predictions for review**,
So that **human feedback is focused on the most valuable samples**.

**Acceptance Criteria:**

**Given** recognition results exist
**When** the system analyzes predictions
**Then** predictions with confidence between 40-80% are flagged
**And** they are added to the "Review Queue"
**And** the queue is sorted by uncertainty (most uncertain first)

**And** the system prioritizes:
- Predictions near decision boundaries
- New/rare categories
- Conflicting predictions (multiple close matches)

**And** reviewed samples are added to training data

**Technical Notes:**
- Calculate entropy of prediction distribution
- Use committee disagreement if ensemble model
- Store uncertainty score in search_history
- Maximum 100 items in review queue per day

**Prerequisites:** Story 6.1, Story 5.1

---

### Story 6.3: Automatic Retraining Triggers

As a **Data Manager**,
I want **the system to suggest retraining when appropriate**,
So that **the model stays current with new data**.

**Acceptance Criteria:**

**Given** the system is collecting feedback
**When** any of these conditions are met:
- 500+ new validated annotations since last training
- Average confidence drops below 90%
- New category added with 50+ samples
- 7 days since last training

**Then** I receive a notification suggesting retraining
**And** the notification shows:
- Number of new samples
- Current vs historical accuracy
- Estimated improvement potential

**And** I can:
- Start training immediately
- Schedule for later
- Dismiss (with reason)

**Technical Notes:**
- Run trigger check daily via cron
- Store thresholds in config table
- Track dismissal history
- Integrate with Slack/email notifications

**Prerequisites:** Story 6.1, Story 5.1

---

### Story 6.4: Incremental Model Updates

As a **Data Manager**,
I want **to update the model incrementally without full retraining**,
So that **the system can quickly adapt to new logos**.

**Acceptance Criteria:**

**Given** I have new annotations for an existing model
**When** I select "Quick Update" instead of full training
**Then** the system performs incremental learning:
- Freezes base model layers
- Fine-tunes only classification head
- Uses only new data + sample of old data
- Completes in <5 minutes for 100 new samples

**And** I can compare quick update vs full retrain metrics
**And** I can rollback if quality decreases

**Technical Notes:**
- Use transfer learning approach
- Save checkpoint before update
- Implement learning rate warmup
- Maximum 3 incremental updates before full retrain

**Prerequisites:** Story 5.5

---

### Story 6.5: Model Version Comparison

As a **Data Manager**,
I want **to compare model versions on the same test set**,
So that **I can make informed decisions about which model to deploy**.

**Acceptance Criteria:**

**Given** I have multiple model versions
**When** I select two models to compare
**Then** I see a side-by-side comparison:
- Accuracy difference per category
- Speed difference (inference time)
- Sample predictions on same images
- Confusion matrix comparison

**And** I can run a fresh evaluation on held-out test set
**And** I can export comparison report

**And** the system recommends which model to activate based on:
- Overall accuracy improvement
- No category regression
- Inference speed within limits

**Technical Notes:**
- Use consistent test set across evaluations
- Store evaluation results in model_versions
- Implement statistical significance testing
- Generate visual diff report

**Prerequisites:** Story 5.4

---

### Story 6.6: Model Rollback

As a **Data Manager**,
I want **to rollback to a previous model version**,
So that **I can recover from a bad model update quickly**.

**Acceptance Criteria:**

**Given** the active model is performing poorly
**When** I click "Rollback" on a previous version
**Then** I see a confirmation showing:
- Time since last activation
- Recognition requests since activation
- Reported issues/feedback

**And** when I confirm:
- The previous model is activated within 30 seconds
- All new requests use the rolled-back model
- The problematic model is marked as "rolled back"
- A notification is sent to administrators

**And** I can add a note explaining the rollback reason

**Technical Notes:**
- Store rollback history with timestamp and reason
- Implement fast model swap (pre-loaded in memory)
- Trigger alert to monitoring system
- Auto-rollback if accuracy drops >10% in 1 hour

**Prerequisites:** Story 5.5

---

## FR Coverage Matrix

| FR ID | Description | Epic | Stories | Status |
|-------|-------------|------|---------|--------|
| FR-TRAIN-001 | Batch Upload | Epic 2 | 2.1, 2.2 | ✅ Covered |
| FR-TRAIN-002 | Smart Click Detection | Epic 4 | 4.3 | ✅ Covered |
| FR-TRAIN-003 | Category Management | Epic 2 | 2.4, 2.5 | ✅ Covered |
| FR-TRAIN-004 | Annotation Tools | Epic 4 | 4.1, 4.2, 4.4 | ✅ Covered |
| FR-TRAIN-005 | Training Pipeline | Epic 5 | 5.1, 5.2, 5.3 | ✅ Covered |
| FR-RECOG-001 | Web Upload | Epic 3 | 3.1 | ✅ Covered |
| FR-RECOG-002 | API Endpoint | Epic 3 | 3.4 | ✅ Covered |
| FR-RECOG-003 | Results Display | Epic 3 | 3.3 | ✅ Covered |
| FR-RECOG-004 | Real-time Processing | Epic 5 | 5.6 | ✅ Covered |
| FR-LEARN-001 | Active Learning | Epic 6 | 6.1, 6.2, 6.3 | ✅ Covered |
| FR-LEARN-002 | Model Evolution | Epic 6 | 6.4, 6.5, 6.6 | ✅ Covered |

---

## Summary

### Epic Breakdown Summary

| Epic | Stories | Priority | Dependencies |
|------|---------|----------|--------------|
| Epic 1: Foundation & Infrastructure | 6 | P0 | None |
| Epic 2: Image Upload & Management | 5 | P0 | Epic 1 |
| Epic 3: Logo Recognition | 5 | P0 | Epic 1 |
| Epic 4: Training Annotation | 5 | P0 | Epic 2 |
| Epic 5: Model Training Pipeline | 6 | P0 | Epic 1, 4 |
| Epic 6: Self-Learning System | 6 | P2 | Epic 3, 5 |
| **Total** | **33** | | |

### Implementation Order

```
Epic 1 (Foundation)
    ↓
    ├── Epic 2 (Upload) ──→ Epic 4 (Annotation)
    │                              ↓
    └── Epic 3 (Recognition)       ↓
              ↓                    ↓
              └────────→ Epic 5 (Training) ←┘
                              ↓
                        Epic 6 (Self-Learning)
```

### Full Context Integration

- **PRD:** All 11 Functional Requirements mapped to 33 stories
- **Architecture:** Fastify + FastAPI hybrid with all endpoints defined
- **UX:** Component specs, interaction patterns, and keyboard shortcuts included

---

_For implementation: Use the `create-story` workflow to generate individual story implementation plans from this epic breakdown._

---

**Document Status:** Complete
**Last Updated:** 2025-12-05
**Author:** Friso (with Architect Agent)
