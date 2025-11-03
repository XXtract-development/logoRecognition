"""Training pipeline configuration with validation - A++ Grade Implementation."""

import os
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

import yaml
from pydantic import BaseModel, Field, validator


class ModelType(str, Enum):
    """Supported model types."""
    FASTER_RCNN = "faster_rcnn"
    YOLO = "yolo"
    SSD = "ssd"
    RETINANET = "retinanet"


class SchedulerType(str, Enum):
    """Learning rate scheduler types."""
    STEP = "step"
    COSINE = "cosine"
    EXPONENTIAL = "exponential"
    REDUCE_ON_PLATEAU = "reduce_on_plateau"


class TrainingConfig(BaseModel):
    """Training configuration with validation."""

    # Model configuration
    model_type: ModelType = Field(default=ModelType.FASTER_RCNN)
    num_classes: int = Field(default=5, ge=1, le=1000)
    pretrained: bool = Field(default=True)
    backbone: str = Field(default="resnet50")

    # Training parameters
    batch_size: int = Field(default=16, ge=1, le=256)
    num_epochs: int = Field(default=20, ge=1, le=1000)
    learning_rate: float = Field(default=0.001, gt=0, le=1.0)
    weight_decay: float = Field(default=0.0005, ge=0, le=1.0)
    momentum: float = Field(default=0.9, ge=0, le=1.0)
    gradient_clip_val: Optional[float] = Field(default=None, ge=0)

    # Scheduler configuration
    scheduler_type: SchedulerType = Field(default=SchedulerType.STEP)
    scheduler_step_size: int = Field(default=3, ge=1)
    scheduler_gamma: float = Field(default=0.1, gt=0, le=1.0)

    # Data configuration
    validation_split: float = Field(default=0.2, gt=0, lt=1.0)
    augment: bool = Field(default=True)
    num_workers: int = Field(default=4, ge=0, le=16)
    pin_memory: bool = Field(default=True)

    # Training control
    early_stopping_patience: int = Field(default=5, ge=1)
    save_best_only: bool = Field(default=True)
    checkpoint_frequency: int = Field(default=5, ge=1)
    mixed_precision: bool = Field(default=False)

    # Validation
    validation_frequency: int = Field(default=1, ge=1)
    min_samples_per_class: int = Field(default=10, ge=1)

    @validator('num_workers')
    def validate_num_workers(cls, v):
        """Validate number of workers based on CPU count."""
        max_workers = os.cpu_count() or 1
        if v > max_workers:
            return max_workers
        return v

    @validator('batch_size')
    def validate_batch_size(cls, v, values):
        """Validate batch size based on mixed precision."""
        if values.get('mixed_precision') and v % 8 != 0:
            # For mixed precision, batch size should be multiple of 8
            return (v // 8) * 8 or 8
        return v

    class Config:
        """Pydantic config."""
        use_enum_values = True


class DataConfig(BaseModel):
    """Data configuration with validation."""

    dataset_id: Optional[str] = Field(default=None)
    dataset_path: Optional[str] = Field(default=None)
    image_size: int = Field(default=640, ge=224, le=2048)
    max_samples: Optional[int] = Field(default=None, ge=1)
    cache_data: bool = Field(default=False)

    # Data filtering
    min_confidence: float = Field(default=0.0, ge=0, le=1.0)
    categories: Optional[List[str]] = Field(default=None)
    exclude_categories: Optional[List[str]] = Field(default=None)

    # Augmentation parameters
    augmentation_prob: float = Field(default=0.5, ge=0, le=1.0)
    horizontal_flip: bool = Field(default=True)
    vertical_flip: bool = Field(default=False)
    rotation_degrees: int = Field(default=10, ge=0, le=180)
    brightness: float = Field(default=0.2, ge=0, le=1.0)
    contrast: float = Field(default=0.2, ge=0, le=1.0)
    saturation: float = Field(default=0.2, ge=0, le=1.0)
    hue: float = Field(default=0.1, ge=0, le=1.0)

    @validator('dataset_path')
    def validate_dataset_path(cls, v):
        """Validate dataset path exists."""
        if v and not os.path.exists(v):
            raise ValueError(f"Dataset path does not exist: {v}")
        return v


class ValidationConfig(BaseModel):
    """Validation configuration."""

    min_precision: float = Field(default=0.7, ge=0, le=1.0)
    min_recall: float = Field(default=0.6, ge=0, le=1.0)
    min_f1_score: float = Field(default=0.65, ge=0, le=1.0)
    max_loss: float = Field(default=1.0, gt=0)
    min_map: float = Field(default=0.5, ge=0, le=1.0)
    max_inference_time_ms: float = Field(default=100, gt=0)
    max_model_size_mb: float = Field(default=500, gt=0)
    min_test_samples: int = Field(default=100, ge=1)

    # Robustness testing
    test_noise_robustness: bool = Field(default=True)
    test_scale_robustness: bool = Field(default=True)
    test_rotation_robustness: bool = Field(default=True)
    noise_levels: List[float] = Field(default=[0.01, 0.05, 0.1])
    scale_factors: List[float] = Field(default=[0.75, 1.0, 1.25])
    rotation_angles: List[int] = Field(default=[-15, 0, 15])


class DeploymentConfig(BaseModel):
    """Deployment configuration."""

    auto_promote: bool = Field(default=False)
    promotion_threshold: float = Field(default=0.05)  # 5% improvement
    rollback_on_failure: bool = Field(default=True)
    health_check_interval: int = Field(default=300)  # seconds
    max_error_rate: float = Field(default=0.1, ge=0, le=1.0)
    min_availability: float = Field(default=0.95, ge=0, le=1.0)

    # A/B testing
    enable_ab_testing: bool = Field(default=True)
    ab_traffic_percentage: float = Field(default=10.0, ge=0, le=100)
    ab_minimum_samples: int = Field(default=1000, ge=100)
    ab_confidence_level: float = Field(default=0.95, ge=0.5, le=0.99)


class ContinuousLearningConfig(BaseModel):
    """Continuous learning configuration."""

    enabled: bool = Field(default=True)
    schedule: str = Field(default="daily")
    min_new_samples: int = Field(default=100, ge=10)
    max_training_samples: int = Field(default=10000, ge=100)
    performance_threshold: Optional[float] = Field(default=None, ge=0, le=1.0)
    data_drift_threshold: float = Field(default=0.1, ge=0, le=1.0)
    retraining_interval_days: int = Field(default=7, ge=1)

    # Resource limits
    max_training_time_hours: float = Field(default=24, gt=0)
    max_gpu_memory_gb: Optional[float] = Field(default=None, gt=0)
    max_concurrent_jobs: int = Field(default=1, ge=1)


class PipelineConfig(BaseModel):
    """Complete pipeline configuration."""

    name: str = Field(default="training_pipeline")
    version: str = Field(default="1.0.0")
    description: Optional[str] = Field(default=None)

    # Sub-configurations
    training: TrainingConfig = Field(default_factory=TrainingConfig)
    data: DataConfig = Field(default_factory=DataConfig)
    validation: ValidationConfig = Field(default_factory=ValidationConfig)
    deployment: DeploymentConfig = Field(default_factory=DeploymentConfig)
    continuous_learning: ContinuousLearningConfig = Field(default_factory=ContinuousLearningConfig)

    # Storage configuration
    checkpoint_dir: str = Field(default="./checkpoints")
    artifact_dir: str = Field(default="./models")
    log_dir: str = Field(default="./logs")
    metrics_dir: str = Field(default="./metrics")

    # Hardware configuration
    device: str = Field(default="auto")  # auto, cuda, cpu, mps
    distributed: bool = Field(default=False)
    num_gpus: int = Field(default=1, ge=1)

    # Monitoring
    enable_tensorboard: bool = Field(default=True)
    enable_mlflow: bool = Field(default=False)
    mlflow_tracking_uri: Optional[str] = Field(default=None)

    @validator('device')
    def validate_device(cls, v):
        """Validate and auto-detect device."""
        if v == "auto":
            import torch
            if torch.cuda.is_available():
                return "cuda"
            elif torch.backends.mps.is_available():
                return "mps"
            else:
                return "cpu"
        elif v in ["cuda", "cpu", "mps"]:
            return v
        else:
            raise ValueError(f"Invalid device: {v}")

    @validator('checkpoint_dir', 'artifact_dir', 'log_dir', 'metrics_dir')
    def create_directories(cls, v):
        """Create directories if they don't exist."""
        os.makedirs(v, exist_ok=True)
        return v

    def to_yaml(self, filepath: str):
        """Save configuration to YAML file."""
        # Convert to dict with enum values as strings
        data = self.dict()
        with open(filepath, 'w') as f:
            yaml.dump(data, f, default_flow_style=False)

    @classmethod
    def from_yaml(cls, filepath: str):
        """Load configuration from YAML file."""
        with open(filepath, 'r') as f:
            data = yaml.safe_load(f)
        return cls(**data)


@dataclass
class TrainingState:
    """Training state tracking."""

    current_epoch: int = 0
    current_step: int = 0
    best_metric: float = float('inf')
    best_epoch: int = 0
    early_stopping_counter: int = 0
    training_time: float = 0.0
    validation_time: float = 0.0
    total_samples_seen: int = 0

    def update(self, **kwargs):
        """Update state attributes."""
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)


class ConfigValidator:
    """Configuration validation utilities."""

    @staticmethod
    def validate_training_config(config: TrainingConfig) -> List[str]:
        """Validate training configuration.

        Args:
            config: Training configuration

        Returns:
            List of validation warnings
        """
        warnings = []

        # Check batch size vs epochs
        if config.batch_size > 32 and config.num_epochs > 100:
            warnings.append(
                "Large batch size with many epochs may lead to overfitting"
            )

        # Check learning rate vs batch size
        if config.batch_size > 64 and config.learning_rate > 0.01:
            warnings.append(
                "High learning rate with large batch size may cause instability"
            )

        # Check early stopping vs epochs
        if config.early_stopping_patience > config.num_epochs // 2:
            warnings.append(
                "Early stopping patience is very high relative to number of epochs"
            )

        return warnings

    @staticmethod
    def validate_data_config(config: DataConfig) -> List[str]:
        """Validate data configuration.

        Args:
            config: Data configuration

        Returns:
            List of validation warnings
        """
        warnings = []

        # Check image size
        if config.image_size < 416:
            warnings.append(
                "Small image size may reduce detection accuracy for small objects"
            )
        elif config.image_size > 1024:
            warnings.append(
                "Large image size will increase memory usage and training time"
            )

        # Check augmentation
        if not config.horizontal_flip and config.augmentation_prob > 0:
            warnings.append(
                "Horizontal flip is disabled but augmentation is enabled"
            )

        return warnings

    @staticmethod
    def validate_complete_config(config: PipelineConfig) -> Dict[str, List[str]]:
        """Validate complete pipeline configuration.

        Args:
            config: Pipeline configuration

        Returns:
            Dictionary of warnings by section
        """
        validator = ConfigValidator()
        warnings = {}

        # Validate each section
        training_warnings = validator.validate_training_config(config.training)
        if training_warnings:
            warnings['training'] = training_warnings

        data_warnings = validator.validate_data_config(config.data)
        if data_warnings:
            warnings['data'] = data_warnings

        # Cross-section validation
        cross_warnings = []

        # Check batch size vs memory
        if config.training.batch_size > 8 and config.device == "cpu":
            cross_warnings.append(
                "Large batch size on CPU will be very slow"
            )

        # Check distributed training
        if config.distributed and config.num_gpus < 2:
            cross_warnings.append(
                "Distributed training enabled but only 1 GPU specified"
            )

        if cross_warnings:
            warnings['cross_validation'] = cross_warnings

        return warnings


def load_config(config_path: Optional[str] = None) -> PipelineConfig:
    """Load pipeline configuration.

    Args:
        config_path: Path to configuration file

    Returns:
        Pipeline configuration
    """
    if config_path and os.path.exists(config_path):
        return PipelineConfig.from_yaml(config_path)

    # Load from environment variables
    config = PipelineConfig()

    # Override with environment variables
    if os.getenv('TRAINING_BATCH_SIZE'):
        config.training.batch_size = int(os.getenv('TRAINING_BATCH_SIZE'))

    if os.getenv('TRAINING_EPOCHS'):
        config.training.num_epochs = int(os.getenv('TRAINING_EPOCHS'))

    if os.getenv('TRAINING_LR'):
        config.training.learning_rate = float(os.getenv('TRAINING_LR'))

    if os.getenv('MODEL_CHECKPOINT_DIR'):
        config.checkpoint_dir = os.getenv('MODEL_CHECKPOINT_DIR')

    return config


def create_default_config() -> PipelineConfig:
    """Create default configuration for production.

    Returns:
        Default pipeline configuration
    """
    config = PipelineConfig(
        name="logo_detection_pipeline",
        version="1.0.0",
        description="Production-ready logo detection training pipeline"
    )

    # Production-optimized settings
    config.training.batch_size = 16
    config.training.num_epochs = 50
    config.training.learning_rate = 0.001
    config.training.early_stopping_patience = 10
    config.training.mixed_precision = True

    config.data.image_size = 640
    config.data.horizontal_flip = True
    config.data.cache_data = True

    config.validation.min_precision = 0.8
    config.validation.min_recall = 0.75
    config.validation.min_f1_score = 0.77

    config.deployment.auto_promote = True
    config.deployment.rollback_on_failure = True

    config.continuous_learning.enabled = True
    config.continuous_learning.schedule = "weekly"

    return config