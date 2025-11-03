"""Training pipeline module for logo detection model."""

from .annotation_connector import AnnotationConnector
from .data_loader import TrainingDataLoader
from .training_pipeline import ModelTrainingPipeline
from .metrics_tracker import MetricsTracker
from .artifact_storage import ModelArtifactStorage
from .validator import ModelValidator
from .model_registry import ModelRegistry
from .ab_testing import ABTestingManager
from .rollback_manager import RollbackManager
from .continuous_learning import ContinuousLearningManager

__all__ = [
    "AnnotationConnector",
    "TrainingDataLoader",
    "ModelTrainingPipeline",
    "MetricsTracker",
    "ModelArtifactStorage",
    "ModelValidator",
    "ModelRegistry",
    "ABTestingManager",
    "RollbackManager",
    "ContinuousLearningManager"
]