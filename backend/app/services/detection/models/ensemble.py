"""
Ensemble detector combining multiple models for improved accuracy.
"""

from typing import List, Dict, Any, Tuple
import numpy as np
import logging
import asyncio
from collections import defaultdict

from ..base_detector import BaseDetector, Detection, BoundingBox
from .yolo_detector import YOLODetector
from .detectron_detector import DetectronDetector

logger = logging.getLogger(__name__)


class EnsembleDetector(BaseDetector):
    """
    Ensemble detector combining YOLOv8 and Detectron2 for improved accuracy.

    This detector runs multiple models and combines their predictions
    using weighted voting to achieve better overall performance.
    """

    def __init__(self, config: Dict[str, Any]):
        """
        Initialize ensemble detector with multiple models.

        Args:
            config: Configuration for ensemble and individual models.
        """
        super().__init__(config)

        # Ensemble configuration
        self.voting_method = config.get("voting", "weighted_average")
        self.weights = config.get("weights", {"yolo": 0.7, "detectron": 0.3})
        self.iou_threshold = config.get("iou_threshold", 0.5)

        # Initialize individual detectors
        self.detectors = {
            "yolo": YOLODetector(config.get("yolo_config", {})),
            "detectron": DetectronDetector(config.get("detectron_config", {}))
        }

    async def load_model(self) -> None:
        """
        Load all models in the ensemble.

        Raises:
            ModelLoadError: If any model fails to load.
        """
        logger.info("Loading ensemble models...")

        # Load models in parallel
        tasks = [
            detector.load_model()
            for detector in self.detectors.values()
        ]

        try:
            await asyncio.gather(*tasks)
            logger.info("All ensemble models loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load ensemble models: {e}")
            raise RuntimeError(f"Ensemble load error: {e}")

    def preprocess_image(self, image: np.ndarray) -> np.ndarray:
        """
        Preprocess image for ensemble (minimal preprocessing).

        Args:
            image: Input image.

        Returns:
            Preprocessed image.
        """
        return image

    async def detect(self, image: np.ndarray) -> List[Detection]:
        """
        Perform ensemble detection using multiple models.

        Args:
            image: Input image.

        Returns:
            Combined detection results from all models.

        Raises:
            DetectionError: If ensemble detection fails.
        """
        if any(d.model is None for d in self.detectors.values()):
            await self.load_model()

        try:
            # Run all detectors in parallel
            detection_tasks = [
                detector.detect(image)
                for detector in self.detectors.values()
            ]

            all_detections = await asyncio.gather(*detection_tasks, return_exceptions=True)

            # Handle any failed detections
            valid_detections = []
            for i, (name, detections) in enumerate(zip(self.detectors.keys(), all_detections)):
                if isinstance(detections, Exception):
                    logger.warning(f"Detector {name} failed: {detections}")
                else:
                    valid_detections.append((name, detections))

            if not valid_detections:
                raise RuntimeError("All detectors failed")

            # Combine detections using ensemble strategy
            combined = self._combine_detections(valid_detections)

            logger.info(f"Ensemble detection completed with {len(combined)} final detections")
            return combined

        except Exception as e:
            logger.error(f"Ensemble detection failed: {e}")
            raise RuntimeError(f"Ensemble error: {e}")

    def _combine_detections(self, detector_outputs: List[Tuple[str, List[Detection]]]) -> List[Detection]:
        """
        Combine detections from multiple models using voting strategy.

        Args:
            detector_outputs: List of (detector_name, detections) tuples.

        Returns:
            Combined detection results.
        """
        if self.voting_method == "weighted_average":
            return self._weighted_average_voting(detector_outputs)
        elif self.voting_method == "max_confidence":
            return self._max_confidence_voting(detector_outputs)
        else:
            return self._simple_voting(detector_outputs)

    def _weighted_average_voting(self, detector_outputs: List[Tuple[str, List[Detection]]]) -> List[Detection]:
        """
        Combine detections using weighted average of confidence scores.

        Args:
            detector_outputs: Detections from each model.

        Returns:
            Combined detections with weighted confidence.
        """
        # Group similar detections (high IoU)
        detection_groups = self._group_similar_detections(detector_outputs)

        combined = []
        for group in detection_groups:
            if not group:
                continue

            # Calculate weighted average confidence
            total_weight = 0
            weighted_conf = 0
            best_detection = None
            highest_weighted_conf = 0

            for detector_name, detection in group:
                weight = self.weights.get(detector_name, 0.5)
                weighted_conf += detection.confidence * weight
                total_weight += weight

                current_weighted = detection.confidence * weight
                if current_weighted > highest_weighted_conf:
                    highest_weighted_conf = current_weighted
                    best_detection = detection

            if best_detection and total_weight > 0:
                # Use the best detection but with averaged confidence
                avg_confidence = weighted_conf / total_weight
                best_detection.confidence = avg_confidence
                combined.append(best_detection)

        # Filter and sort by confidence
        combined = self.filter_detections(combined)
        return combined

    def _group_similar_detections(self, detector_outputs: List[Tuple[str, List[Detection]]]) -> List[List[Tuple[str, Detection]]]:
        """
        Group detections with high IoU as the same object.

        Args:
            detector_outputs: Detections from each model.

        Returns:
            Groups of similar detections.
        """
        all_detections = []
        for name, detections in detector_outputs:
            for det in detections:
                all_detections.append((name, det))

        if not all_detections:
            return []

        # Group by IoU similarity
        groups = []
        used = set()

        for i, (name1, det1) in enumerate(all_detections):
            if i in used:
                continue

            group = [(name1, det1)]
            used.add(i)

            for j, (name2, det2) in enumerate(all_detections[i + 1:], i + 1):
                if j in used:
                    continue

                iou = self._calculate_iou(det1.bounding_box, det2.bounding_box)
                if iou >= self.iou_threshold:
                    group.append((name2, det2))
                    used.add(j)

            groups.append(group)

        return groups

    def _calculate_iou(self, box1: BoundingBox, box2: BoundingBox) -> float:
        """
        Calculate Intersection over Union for two bounding boxes.

        Args:
            box1: First bounding box.
            box2: Second bounding box.

        Returns:
            IoU score between 0 and 1.
        """
        # Calculate intersection
        x1 = max(box1.x, box2.x)
        y1 = max(box1.y, box2.y)
        x2 = min(box1.x + box1.width, box2.x + box2.width)
        y2 = min(box1.y + box1.height, box2.y + box2.height)

        if x2 < x1 or y2 < y1:
            return 0.0

        intersection = (x2 - x1) * (y2 - y1)

        # Calculate union
        area1 = box1.width * box1.height
        area2 = box2.width * box2.height
        union = area1 + area2 - intersection

        if union == 0:
            return 0.0

        return intersection / union

    def _max_confidence_voting(self, detector_outputs: List[Tuple[str, List[Detection]]]) -> List[Detection]:
        """
        Select detection with maximum confidence from overlapping detections.

        Args:
            detector_outputs: Detections from each model.

        Returns:
            Detections with highest confidence selected.
        """
        groups = self._group_similar_detections(detector_outputs)

        combined = []
        for group in groups:
            if group:
                # Select detection with highest confidence
                best = max(group, key=lambda x: x[1].confidence)
                combined.append(best[1])

        return self.filter_detections(combined)

    def _simple_voting(self, detector_outputs: List[Tuple[str, List[Detection]]]) -> List[Detection]:
        """
        Simple voting - include all detections from all models.

        Args:
            detector_outputs: Detections from each model.

        Returns:
            All detections combined.
        """
        all_detections = []
        for _, detections in detector_outputs:
            all_detections.extend(detections)

        return self.filter_detections(all_detections)