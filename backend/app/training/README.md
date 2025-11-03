# Logo Detection Model Training Pipeline

## Overview

This training pipeline provides a complete solution for training, validating, deploying, and continuously improving logo detection models. It includes automatic validation, A/B testing, rollback mechanisms, and continuous learning capabilities.

## Architecture

```
training/
├── __init__.py                    # Module exports
├── annotation_connector.py        # Connect to annotation database
├── data_loader.py                # Training data loading and augmentation
├── training_pipeline.py          # Core model training logic
├── metrics_tracker.py            # Performance metrics tracking
├── artifact_storage.py           # Model artifact management
├── validator.py                  # Automatic model validation
├── model_registry.py             # Model versioning and lifecycle
├── ab_testing.py                 # A/B test configuration
├── rollback_manager.py           # Deployment rollback mechanism
├── continuous_learning.py        # Continuous model improvement
└── README.md                     # This documentation
```

## Quick Start

### 1. Basic Training

```python
from app.training import (
    AnnotationConnector,
    TrainingDataLoader,
    ModelTrainingPipeline,
    ModelRegistry
)

# Connect to annotations
connector = AnnotationConnector()
annotations = connector.get_training_annotations(dataset_id="dataset_001")

# Prepare data
data_loader = TrainingDataLoader(connector)
train_loader, val_loader, metadata = data_loader.create_data_loaders(
    dataset_id="dataset_001",
    validation_split=0.2,
    augment=True
)

# Train model
pipeline = ModelTrainingPipeline(model_type="faster_rcnn", num_classes=5)
pipeline.initialize_model(pretrained=True)
pipeline.setup_training(learning_rate=0.001)

results = pipeline.train(
    train_loader=train_loader,
    val_loader=val_loader,
    num_epochs=10
)

# Register model
registry = ModelRegistry()
model_id = registry.register_model(
    model_name="logo_detector",
    model_version="v1.0.0",
    model_state=pipeline.model.state_dict(),
    auto_validate=True
)
```

### 2. A/B Testing

```python
from app.training import ABTestingManager

ab_manager = ABTestingManager()

# Create experiment
experiment_id = ab_manager.create_experiment(
    name="model_v2_test",
    control_model_id=1,      # Current production model
    treatment_model_id=2,     # New model to test
    primary_metric="f1_score",
    traffic_percentage=50.0,
    minimum_sample_size=1000
)

# Start experiment
ab_manager.start_experiment(experiment_id)

# Assign users to variants
variant = ab_manager.assign_variant(experiment_id, user_id="user_123")

# Record metrics
ab_manager.record_metric(
    experiment_id=experiment_id,
    user_id="user_123",
    variant=variant,
    metrics={
        'f1_score': 0.85,
        'inference_time_ms': 45,
        'user_satisfaction': 4.5
    }
)

# Get results
results = ab_manager.get_experiment_results(experiment_id)
```

### 3. Continuous Learning

```python
from app.training import ContinuousLearningManager

cl_manager = ContinuousLearningManager()

# Create learning job
job_id = cl_manager.create_learning_job(
    job_name="daily_improvement",
    model_name="logo_detector",
    schedule="daily",
    min_new_samples=100,
    training_config={
        'num_epochs': 5,
        'learning_rate': 0.0001,
        'batch_size': 16
    }
)

# Trigger training manually
result = cl_manager.trigger_training(job_id)

# Check job status
status = cl_manager.get_job_status(job_id)
```

## Components

### 1. Annotation Connector

Connects to the annotation database to retrieve training data.

**Key Features:**
- Dataset versioning support
- Confidence-based filtering
- Category filtering
- Automatic train/validation splitting

**Usage:**
```python
connector = AnnotationConnector()

# Get training data
annotations = connector.get_training_annotations(
    dataset_id="dataset_001",
    min_confidence=0.8,
    categories=["logo", "brand"]
)

# Get validation split
train_data, val_data = connector.get_validation_split(
    dataset_id="dataset_001",
    split_ratio=0.2
)
```

### 2. Data Loader

Handles data loading, augmentation, and batching for training.

**Key Features:**
- PyTorch DataLoader integration
- Image augmentation pipeline
- MinIO/local storage support
- Class weight calculation

**Usage:**
```python
data_loader = TrainingDataLoader(batch_size=16, num_workers=4)

train_loader, val_loader, metadata = data_loader.create_data_loaders(
    dataset_id="dataset_001",
    validation_split=0.2,
    augment=True,
    image_dir="/path/to/images"
)
```

### 3. Training Pipeline

Core training logic for logo detection models.

**Key Features:**
- Faster R-CNN support
- Learning rate scheduling
- Early stopping
- Checkpoint saving
- Model export (TorchScript/ONNX)

**Usage:**
```python
pipeline = ModelTrainingPipeline(
    model_type="faster_rcnn",
    num_classes=5,
    checkpoint_dir="./checkpoints"
)

pipeline.initialize_model(pretrained=True)
pipeline.setup_training(
    learning_rate=0.001,
    scheduler_type="cosine"
)

results = pipeline.train(
    train_loader=train_loader,
    val_loader=val_loader,
    num_epochs=20,
    early_stopping_patience=5
)
```

### 4. Metrics Tracker

Comprehensive metrics tracking and analysis.

**Key Features:**
- Training/validation metrics
- Detection-specific metrics (mAP, IoU)
- Experiment tracking
- Visualization support

**Usage:**
```python
tracker = MetricsTracker(save_dir="./metrics")

tracker.start_experiment(
    experiment_name="baseline_training",
    config={'model': 'faster_rcnn', 'lr': 0.001}
)

tracker.update_metrics('train', {'loss': 0.5, 'accuracy': 0.85})
tracker.update_metrics('validation', {'loss': 0.6, 'accuracy': 0.82})

summary = tracker.get_summary()
tracker.plot_training_curves()
```

### 5. Model Registry

Model versioning and lifecycle management.

**Key Features:**
- Version control
- Metadata tracking
- Promotion to production
- Model comparison
- Cleanup policies

**Usage:**
```python
registry = ModelRegistry()

# Register model
model_id = registry.register_model(
    model_name="logo_detector",
    model_version="v1.0.0",
    model_state=model_state,
    training_params={'lr': 0.001},
    auto_validate=True
)

# Promote to production
registry.promote_to_production(model_id)

# Get production model
prod_model = registry.get_production_model("logo_detector")
```

### 6. Validator

Automatic model validation and quality assurance.

**Key Features:**
- Performance validation
- Robustness testing
- Edge case testing
- Model size validation
- Statistical significance testing

**Usage:**
```python
validator = ModelValidator()

validator.set_criteria({
    'min_precision': 0.8,
    'min_recall': 0.75,
    'max_inference_time_ms': 100
})

results = validator.validate_model(
    model=model,
    test_loader=test_loader,
    model_name="logo_detector",
    model_version="v1.0.0"
)
```

### 7. A/B Testing

Configure and manage A/B tests for model deployments.

**Key Features:**
- Traffic splitting
- User segmentation
- Statistical significance testing
- Automatic winner selection
- Metrics collection

**Usage:**
```python
ab_manager = ABTestingManager()

# Create and start experiment
experiment_id = ab_manager.create_experiment(
    name="new_model_test",
    control_model_id=1,
    treatment_model_id=2,
    traffic_percentage=30.0
)

ab_manager.start_experiment(experiment_id)

# End experiment and deploy winner
results = ab_manager.end_experiment(
    experiment_id,
    auto_deploy_winner=True
)
```

### 8. Rollback Manager

Automatic rollback mechanism for failed deployments.

**Key Features:**
- Health monitoring
- Automatic rollback triggers
- Deployment history tracking
- Model backup management

**Usage:**
```python
rollback_manager = RollbackManager()

# Record deployment
deployment_id = rollback_manager.record_deployment(
    model_id=model_id,
    deployment_type="production"
)

# Check health
is_healthy, issues = rollback_manager.check_health(
    deployment_id,
    current_metrics={'error_rate': 0.15, 'precision': 0.65}
)

# Trigger rollback if needed
if not is_healthy:
    result = rollback_manager.trigger_rollback(
        deployment_id,
        reason="performance_degradation"
    )
```

### 9. Continuous Learning

Automated retraining and continuous improvement system.

**Key Features:**
- Scheduled retraining
- Threshold-based triggers
- Data drift monitoring
- Incremental learning
- Performance tracking

**Usage:**
```python
cl_manager = ContinuousLearningManager()

# Create scheduled job
job_id = cl_manager.create_learning_job(
    job_name="weekly_update",
    model_name="logo_detector",
    schedule="weekly",
    min_new_samples=500
)

# Monitor data drift
drift_score = cl_manager.monitor_data_drift(
    job_id,
    current_distribution={'logo': 0.6, 'text': 0.4}
)

# Check job status
status = cl_manager.get_job_status(job_id)
```

## Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost/training_db

# Storage
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=model-artifacts

# Training
CUDA_VISIBLE_DEVICES=0,1
TORCH_HOME=/path/to/torch/cache

# Monitoring
MLFLOW_TRACKING_URI=http://localhost:5000
```

### Training Configuration

```python
training_config = {
    'model_type': 'faster_rcnn',
    'num_classes': 5,
    'batch_size': 16,
    'num_epochs': 20,
    'learning_rate': 0.001,
    'weight_decay': 0.0005,
    'scheduler_type': 'cosine',
    'early_stopping_patience': 5,
    'augment': True,
    'validation_split': 0.2
}
```

## API Integration

### REST Endpoints

```python
from fastapi import FastAPI, BackgroundTasks
from app.training import ModelTrainingPipeline, ModelRegistry

app = FastAPI()

@app.post("/training/start")
async def start_training(
    dataset_id: str,
    background_tasks: BackgroundTasks
):
    """Start model training job."""
    background_tasks.add_task(
        train_model,
        dataset_id=dataset_id
    )
    return {"status": "training started"}

@app.get("/models/{model_id}/validate")
async def validate_model(model_id: int):
    """Validate a specific model."""
    registry = ModelRegistry()
    results = registry.validate_model(model_id)
    return results

@app.post("/experiments/create")
async def create_ab_test(
    control_model_id: int,
    treatment_model_id: int
):
    """Create A/B test experiment."""
    # Implementation
    pass
```

## Monitoring

### Metrics to Track

1. **Training Metrics**
   - Loss curves
   - Learning rate
   - Gradient norms
   - Training time

2. **Validation Metrics**
   - Precision/Recall/F1
   - mAP@IoU
   - Inference time
   - Model size

3. **Production Metrics**
   - Error rate
   - Latency
   - Throughput
   - User satisfaction

### Dashboards

Example Grafana query for monitoring:
```sql
SELECT
    time,
    precision,
    recall,
    f1_score,
    inference_time_ms
FROM model_metrics
WHERE model_name = 'logo_detector'
    AND environment = 'production'
ORDER BY time DESC
```

## Best Practices

### 1. Data Management
- Version your datasets
- Maintain data quality metrics
- Balance class distribution
- Use stratified sampling for splits

### 2. Training
- Start with pretrained models
- Use learning rate scheduling
- Implement early stopping
- Save checkpoints regularly

### 3. Validation
- Use held-out test sets
- Test on edge cases
- Monitor for data drift
- Validate before production

### 4. Deployment
- Always A/B test new models
- Set up automatic rollbacks
- Monitor performance metrics
- Keep deployment history

### 5. Continuous Improvement
- Schedule regular retraining
- Monitor data drift
- Collect user feedback
- Track long-term trends

## Troubleshooting

### Common Issues

1. **Out of Memory**
   - Reduce batch size
   - Use gradient accumulation
   - Enable mixed precision training

2. **Poor Performance**
   - Check data quality
   - Adjust learning rate
   - Increase training data
   - Try different augmentations

3. **Slow Training**
   - Use multiple workers
   - Enable GPU acceleration
   - Optimize data loading
   - Cache preprocessed data

4. **Deployment Failures**
   - Check model compatibility
   - Validate input/output formats
   - Monitor resource usage
   - Review error logs

## Contributing

When adding new features:
1. Follow the existing architecture
2. Add comprehensive tests
3. Update this documentation
4. Include usage examples
5. Consider backward compatibility

## License

See LICENSE file in the project root.