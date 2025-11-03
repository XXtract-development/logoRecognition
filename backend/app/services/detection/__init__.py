"""
Detection service for automatic logo detection.
"""

from .detector import DetectionService
from .models.yolo_detector import YOLODetector
from .models.detectron_detector import DetectronDetector
from .models.ensemble import EnsembleDetector

__all__ = [
    "DetectionService",
    "YOLODetector",
    "DetectronDetector",
    "EnsembleDetector"
]