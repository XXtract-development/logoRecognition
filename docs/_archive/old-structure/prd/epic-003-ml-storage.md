# EPIC-003: ML Model & Storage
**Sprint:** 2 (Week 2)
**Priority:** P2 - HIGH
**Story Points:** 21
**Status:** 🔴 Not Started

---

## 📊 Epic Overview

The core ML functionality exists in code but the actual model files are missing, MinIO storage is configured but not integrated, and the training pipeline is disconnected. This epic enables the core logo recognition functionality.

## 🎯 Epic Goals

1. **Deploy ML models** - ONNX models with versioning
2. **Integrate object storage** - MinIO for image persistence
3. **Setup CDN** - Fast global image delivery
4. **Connect training pipeline** - UI-driven model training

## 🚨 Current Issues

### Critical Problems
- **No ONNX model files deployed**
- **Model loading code exists but fails**
- **MinIO configured but not connected**
- **Images stored temporarily, not persisted**
- **No CDN configured for image serving**
- **Training UI exists but backend disconnected**

### Impact
- 🔴 **Functionality:** Core feature doesn't work
- 🔴 **Performance:** No caching or CDN
- 🔴 **Reliability:** Images lost on restart
- 🔴 **Scalability:** Can't handle production load

---

## 📋 User Stories

### STORY-008: Deploy ML Model Files
**Points:** 8
**As a** Data Scientist
**I want to** deploy the trained models
**So that** the system can perform logo detection

#### Model Deployment Strategy
```python
# backend/app/ml_model.py
import onnxruntime as ort
from pathlib import Path
import hashlib
import json

class ModelManager:
    def __init__(self, model_dir: Path):
        self.model_dir = model_dir
        self.models = {}
        self.current_version = None

    async def load_model(self, version: str = "latest"):
        """Load ONNX model with version management"""
        if version == "latest":
            version = self._get_latest_version()

        model_path = self.model_dir / f"efficientdet_d4_v{version}.onnx"

        if not model_path.exists():
            # Fallback to previous version
            fallback = self._get_fallback_version(version)
            if fallback:
                model_path = self.model_dir / f"efficientdet_d4_v{fallback}.onnx"
            else:
                raise FileNotFoundError(f"No model found for version {version}")

        # Load model with optimization
        session_options = ort.SessionOptions()
        session_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        session_options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL

        # Use CUDA if available
        providers = ['CUDAExecutionProvider'] if self._cuda_available() else ['CPUExecutionProvider']

        self.models[version] = ort.InferenceSession(
            str(model_path),
            sess_options=session_options,
            providers=providers
        )

        self.current_version = version
        await self._warmup_model(self.models[version])

        return version

    async def _warmup_model(self, session):
        """Warmup model with dummy input"""
        import numpy as np

        # Create dummy input for warmup
        dummy_input = np.random.randn(1, 3, 1024, 1024).astype(np.float32)

        # Run warmup inference
        for _ in range(3):
            session.run(None, {'input': dummy_input})

    def get_model_info(self):
        """Get current model information"""
        if not self.current_version:
            return None

        model_path = self.model_dir / f"efficientdet_d4_v{self.current_version}.onnx"
        metadata_path = model_path.with_suffix('.json')

        if metadata_path.exists():
            with open(metadata_path) as f:
                metadata = json.load(f)
        else:
            metadata = {}

        return {
            'version': self.current_version,
            'path': str(model_path),
            'size': model_path.stat().st_size,
            'checksum': self._calculate_checksum(model_path),
            'metadata': metadata,
            'providers': self.models[self.current_version].get_providers()
        }
```

#### Model Version Management
```yaml
# models/versions.yaml
models:
  efficientdet_d4:
    latest: "1.2.0"
    versions:
      "1.2.0":
        file: "efficientdet_d4_v1.2.0.onnx"
        accuracy: 0.99
        created: "2024-09-19"
        size: "157MB"
        checksum: "sha256:abc123..."
      "1.1.0":
        file: "efficientdet_d4_v1.1.0.onnx"
        accuracy: 0.97
        created: "2024-09-01"
        size: "155MB"
        checksum: "sha256:def456..."
    fallback_chain:
      - "1.2.0"
      - "1.1.0"
      - "1.0.0"
```

#### Acceptance Criteria
- [ ] ONNX model files deployed to production
- [ ] Model versioning system implemented
- [ ] Model loading on application startup
- [ ] Warmup requests prevent cold starts
- [ ] Fallback to previous version on failure
- [ ] Model performance metrics tracked

#### Files to Create/Modify
- `backend/app/ml_model.py`
- `backend/app/services/model_manager.py` (create)
- `models/` directory structure (create)
- `backend/app/main.py` (startup sequence)
- `k8s/configmap/model-config.yaml` (create)

---

### STORY-009: MinIO Object Storage Integration
**Points:** 5
**As a** Backend Developer
**I want to** store images in object storage
**So that** images are reliably persisted and served

#### MinIO Integration
```python
# backend/app/storage/minio_client.py
from minio import Minio
from minio.error import S3Error
import io
from typing import BinaryIO
import uuid

class MinIOStorage:
    def __init__(self, config):
        self.client = Minio(
            config['endpoint'],
            access_key=config['access_key'],
            secret_key=config['secret_key'],
            secure=config.get('secure', True)
        )
        self.bucket = config['bucket']
        self._ensure_bucket()

    def _ensure_bucket(self):
        """Ensure bucket exists"""
        if not self.client.bucket_exists(self.bucket):
            self.client.make_bucket(self.bucket)
            # Set bucket policy for public read on certain prefixes
            policy = {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Principal": {"AWS": "*"},
                        "Action": ["s3:GetObject"],
                        "Resource": [f"arn:aws:s3:::{self.bucket}/public/*"]
                    }
                ]
            }
            self.client.set_bucket_policy(self.bucket, json.dumps(policy))

    async def upload_image(
        self,
        file: BinaryIO,
        filename: str,
        content_type: str,
        user_id: str
    ) -> str:
        """Upload image to MinIO"""
        # Generate unique object key
        file_ext = filename.split('.')[-1]
        object_key = f"images/{user_id}/{uuid.uuid4()}.{file_ext}"

        # Upload with metadata
        metadata = {
            'x-amz-meta-original-name': filename,
            'x-amz-meta-user-id': user_id,
            'x-amz-meta-upload-time': datetime.utcnow().isoformat()
        }

        self.client.put_object(
            self.bucket,
            object_key,
            file,
            length=-1,
            part_size=10*1024*1024,  # 10MB parts
            content_type=content_type,
            metadata=metadata
        )

        return object_key

    async def generate_thumbnail(self, object_key: str) -> str:
        """Generate and store thumbnail"""
        from PIL import Image
        import io

        # Get original image
        response = self.client.get_object(self.bucket, object_key)
        img = Image.open(io.BytesIO(response.read()))

        # Create thumbnail
        thumbnail_size = (300, 300)
        img.thumbnail(thumbnail_size, Image.Resampling.LANCZOS)

        # Save thumbnail
        thumb_io = io.BytesIO()
        img.save(thumb_io, format='JPEG', quality=85, optimize=True)
        thumb_io.seek(0)

        # Upload thumbnail
        thumb_key = object_key.replace('/images/', '/thumbnails/')
        self.client.put_object(
            self.bucket,
            thumb_key,
            thumb_io,
            length=thumb_io.getbuffer().nbytes,
            content_type='image/jpeg'
        )

        return thumb_key

    def get_presigned_url(self, object_key: str, expires: int = 3600) -> str:
        """Generate pre-signed URL for secure access"""
        return self.client.presigned_get_object(
            self.bucket,
            object_key,
            expires=timedelta(seconds=expires)
        )
```

#### Update Upload Endpoint
```python
# backend/app/routers/image_upload.py
@router.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
    minio: MinIOStorage = Depends(get_minio),
    db: AsyncSession = Depends(get_db)
):
    # Validate file
    validation = await validate_image_file(
        await file.read(),
        file.filename,
        file.content_type
    )

    if not validation['valid']:
        raise HTTPException(400, validation['error'])

    # Upload to MinIO
    file.file.seek(0)
    object_key = await minio.upload_image(
        file.file,
        file.filename,
        file.content_type,
        user_id
    )

    # Generate thumbnail
    thumb_key = await minio.generate_thumbnail(object_key)

    # Save metadata to database
    image = Image(
        user_id=user_id,
        filename=file.filename,
        object_key=object_key,
        thumbnail_key=thumb_key,
        file_size=file.size,
        mime_type=file.content_type
    )
    db.add(image)
    await db.commit()

    # Generate pre-signed URLs
    image_url = minio.get_presigned_url(object_key)
    thumb_url = minio.get_presigned_url(thumb_key)

    return {
        'id': str(image.id),
        'image_url': image_url,
        'thumbnail_url': thumb_url,
        'filename': file.filename
    }
```

#### Acceptance Criteria
- [ ] Upload endpoint saves to MinIO
- [ ] Unique object keys generated
- [ ] Image metadata stored in database
- [ ] Pre-signed URLs for secure access
- [ ] Automatic thumbnail generation
- [ ] Storage metrics tracked

#### Files to Create/Modify
- `backend/app/storage/minio_client.py` (create)
- `backend/app/routers/image_upload.py`
- `backend/app/models/image.py`
- `backend/app/dependencies.py`
- `docker-compose.yml` (MinIO service)

---

### STORY-010: CDN Configuration
**Points:** 3
**As a** DevOps Engineer
**I want to** setup CDN for images
**So that** images load quickly globally

#### CloudFront Configuration
```yaml
# terraform/cdn.tf
resource "aws_cloudfront_distribution" "images" {
  origin {
    domain_name = var.minio_endpoint
    origin_id   = "MinIO-${var.environment}"

    custom_origin_config {
      http_port              = 9000
      https_port             = 9000
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    custom_header {
      name  = "X-Origin-Secret"
      value = var.origin_secret
    }
  }

  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = ""

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD", "OPTIONS"]
    target_origin_id = "MinIO-${var.environment}"

    forwarded_values {
      query_string = true
      headers      = ["Origin", "Access-Control-Request-Method"]

      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 86400
    max_ttl                = 31536000
    compress               = true
  }

  price_class = "PriceClass_200"

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Environment = var.environment
    Service     = "logo-recognition"
  }
}
```

#### Acceptance Criteria
- [ ] CloudFront/Cloudflare configured
- [ ] Cache headers optimized
- [ ] Image compression enabled
- [ ] WebP format support
- [ ] Cache invalidation mechanism
- [ ] CDN metrics dashboard

#### Files to Create/Modify
- `terraform/cdn.tf` (create)
- `backend/app/config/cdn.py` (create)
- `backend/app/storage/cdn_client.py` (create)
- `.github/workflows/cdn-deploy.yml` (create)

---

### STORY-011: Training Pipeline Integration
**Points:** 5
**As a** ML Engineer
**I want to** run training jobs through the UI
**So that** models can be retrained with new data

#### Training Job Implementation
```python
# backend/app/tasks/training.py
from celery import Task
from app.celery_app import celery_app
import asyncio

class TrainingTask(Task):
    def __init__(self):
        self.current_progress = 0

    def update_progress(self, progress: int, message: str):
        """Send progress update via WebSocket"""
        self.update_state(
            state='PROGRESS',
            meta={
                'current': progress,
                'total': 100,
                'message': message
            }
        )
        # Send WebSocket update
        asyncio.create_task(
            send_ws_update(self.request.id, progress, message)
        )

@celery_app.task(bind=True, base=TrainingTask)
def train_model(self, training_config):
    """Train ML model with progress tracking"""
    self.update_progress(0, "Initializing training")

    # Load training data
    self.update_progress(10, "Loading training data")
    dataset = load_dataset(training_config['dataset_id'])

    # Data augmentation
    self.update_progress(20, "Augmenting data")
    augmented = augment_dataset(dataset)

    # Initialize model
    self.update_progress(30, "Initializing model")
    model = initialize_model(training_config['base_model'])

    # Training loop
    epochs = training_config.get('epochs', 10)
    for epoch in range(epochs):
        progress = 30 + (50 * (epoch + 1) / epochs)
        self.update_progress(
            int(progress),
            f"Training epoch {epoch + 1}/{epochs}"
        )

        # Train epoch
        loss = train_epoch(model, augmented)

        # Log metrics
        log_metrics({
            'epoch': epoch,
            'loss': loss,
            'job_id': self.request.id
        })

    # Validate model
    self.update_progress(80, "Validating model")
    accuracy = validate_model(model, validation_set)

    # Save model
    self.update_progress(90, "Saving model")
    model_path = save_model(model, accuracy)

    # Deploy if accuracy threshold met
    if accuracy >= 0.99:
        self.update_progress(95, "Deploying model")
        deploy_model(model_path)

    self.update_progress(100, "Training complete")

    return {
        'job_id': self.request.id,
        'accuracy': accuracy,
        'model_path': model_path,
        'status': 'completed'
    }
```

#### WebSocket Progress Updates
```python
# backend/app/websocket/training.py
from fastapi import WebSocket
import json

class TrainingWebSocketManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, job_id: str):
        await websocket.accept()
        if job_id not in self.active_connections:
            self.active_connections[job_id] = []
        self.active_connections[job_id].append(websocket)

    async def send_update(self, job_id: str, progress: int, message: str):
        if job_id in self.active_connections:
            update = {
                'type': 'progress',
                'job_id': job_id,
                'progress': progress,
                'message': message,
                'timestamp': datetime.utcnow().isoformat()
            }

            for connection in self.active_connections[job_id]:
                try:
                    await connection.send_json(update)
                except:
                    # Remove dead connections
                    self.active_connections[job_id].remove(connection)
```

#### Acceptance Criteria
- [ ] Training job creation from UI
- [ ] Progress tracking via WebSocket
- [ ] Resource allocation (GPU/CPU)
- [ ] Training metrics visualization
- [ ] Job cancellation support
- [ ] Result notification system

#### Files to Create/Modify
- `backend/app/tasks/training.py` (create)
- `backend/app/websocket/training.py` (create)
- `backend/app/routers/training.py`
- `frontend/src/pages/training/TrainingDashboard.js`
- `backend/app/celery_app.py` (create)

---

## 🔧 Technical Requirements

### Model Specifications
```yaml
Model:
  type: EfficientDet-D4
  format: ONNX
  input_size: [1024, 1024]
  output_classes: dynamic
  precision: FP16
  optimization: TensorRT compatible
  size: ~150MB

Deployment:
  versions: 3 concurrent maximum
  warmup: 3 requests on startup
  fallback: automatic to previous
  monitoring: inference latency, accuracy
```

### Storage Configuration
```yaml
MinIO:
  buckets:
    - images: Original uploads
    - thumbnails: Generated thumbs
    - models: ONNX files
    - datasets: Training data

  retention:
    images: 90 days
    thumbnails: 30 days
    models: indefinite
    datasets: 180 days

CDN:
  provider: CloudFront
  cache_ttl: 86400 (1 day)
  compression: gzip, brotli
  image_formats: JPEG, PNG, WebP
  optimization: Auto-convert to WebP
```

---

## 📈 Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Model Load Time | N/A | <5s | Startup duration |
| Inference Speed | N/A | <300ms | p99 latency |
| Model Accuracy | N/A | ≥99% | Test dataset |
| Storage Usage | 0 | <1TB | MinIO metrics |
| CDN Hit Rate | 0% | >80% | CloudFront metrics |
| Training Time | N/A | <30s | 10 samples |

---

## 🔗 Dependencies

### Prerequisites
- Sprint 1 complete (Database & Auth)
- ONNX model files available
- MinIO deployed and accessible
- CDN account configured
- GPU nodes for training (optional)

### Blocking
- Blocks production launch
- Required for core functionality
- Prerequisites for customer demos

---

## ✅ Definition of Done

- [ ] All story acceptance criteria met
- [ ] ML models deployed and serving predictions
- [ ] Images persisted in MinIO
- [ ] CDN delivering images globally
- [ ] Training pipeline functional via UI
- [ ] Performance benchmarks met
- [ ] Integration tests passing
- [ ] Load tested (100 concurrent inferences)
- [ ] Documentation updated
- [ ] Deployed to staging

---

## 📚 References

- [ONNX Runtime Documentation](https://onnxruntime.ai/docs/)
- [MinIO Python SDK](https://docs.min.io/docs/python-client-api-reference.html)
- [CloudFront Best Practices](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/BestPractices.html)
- [Celery Task Management](https://docs.celeryproject.org/en/stable/)
- Current PRD: `docs/prd_v2.md#sprint-2-requirements`

---

**Epic Owner:** ML Engineering Team
**Sprint:** 2 (Week 2)
**Last Updated:** 2024-09-19