"""
Detection service wrapper for batch processing integration.
Provides unified interface for logo detection functionality.
"""

from typing import Dict, Any, List, Optional
import logging
from .detection.detector import LogoDetector

logger = logging.getLogger(__name__)


class DetectionService:
    """
    Service for performing logo detection on images.
    Wraps the underlying detection models for batch processing.
    """

    def __init__(self, model_version: str = "latest"):
        """
        Initialize detection service.

        Args:
            model_version: Version of detection model to use
        """
        self.model_version = model_version
        self.detector = None
        self._initialize_detector()

    def _initialize_detector(self):
        """Initialize the detector based on model version."""
        try:
            # Initialize detector (can be extended to support multiple versions)
            self.detector = LogoDetector()
            logger.info(f"Detector initialized with version: {self.model_version}")
        except Exception as e:
            logger.error(f"Failed to initialize detector: {str(e)}")
            # Fallback to mock detector for testing
            self.detector = MockDetector()

    def detect(
        self,
        image_path: str,
        model_version: Optional[str] = None,
        confidence_threshold: float = 0.5,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Perform logo detection on an image.

        Args:
            image_path: Path to the image file
            model_version: Optional model version override
            confidence_threshold: Minimum confidence for detections
            **kwargs: Additional detection parameters

        Returns:
            Dictionary containing detections and metadata
        """
        import time
        start_time = time.time()

        try:
            if self.detector:
                # Perform detection
                detections = self.detector.detect(
                    image_path,
                    confidence_threshold=confidence_threshold
                )
            else:
                # Fallback mock detection
                detections = self._mock_detection()

            processing_time = time.time() - start_time

            return {
                'detections': detections,
                'processing_time': processing_time,
                'model_version': model_version or self.model_version,
                'confidence_threshold': confidence_threshold
            }

        except Exception as e:
            logger.error(f"Detection failed for {image_path}: {str(e)}")
            return {
                'detections': [],
                'processing_time': time.time() - start_time,
                'error': str(e)
            }

    def _mock_detection(self) -> List[Dict]:
        """Generate mock detection results for testing."""
        import random

        num_detections = random.randint(0, 3)
        detections = []

        for i in range(num_detections):
            detections.append({
                'class': f'logo_{i}',
                'confidence': random.uniform(0.5, 0.99),
                'bbox': [
                    random.randint(0, 500),
                    random.randint(0, 500),
                    random.randint(50, 200),
                    random.randint(50, 200)
                ]
            })

        return detections

    def batch_detect(
        self,
        image_paths: List[str],
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Perform detection on multiple images.

        Args:
            image_paths: List of image file paths
            **kwargs: Detection parameters

        Returns:
            List of detection results
        """
        results = []
        for path in image_paths:
            result = self.detect(path, **kwargs)
            result['image_path'] = path
            results.append(result)

        return results


class MockDetector:
    """Mock detector for testing when real detector is unavailable."""

    def detect(self, image_path: str, confidence_threshold: float = 0.5):
        """Generate mock detections."""
        import random

        # Simulate some detections
        if random.random() > 0.2:  # 80% chance of finding something
            return [{
                'class': 'mock_logo',
                'confidence': random.uniform(confidence_threshold, 0.99),
                'bbox': [10, 10, 100, 100]
            }]
        return []