"""Training module for logo detection system."""

from .pipeline import TrainingPipeline
from .few_shot import FewShotLearner, PrototypicalNetwork
from .augmentation import DataAugmentationPipeline
from .onnx_export import ONNXExporter, ONNXOptimizer

__all__ = [
    "TrainingPipeline",
    "FewShotLearner",
    "PrototypicalNetwork",
    "DataAugmentationPipeline",
    "ONNXExporter",
    "ONNXOptimizer",
]