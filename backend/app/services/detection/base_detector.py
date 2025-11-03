"""
Base class for logo detection models.
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class BoundingBox:
    """
    Represents a bounding box for a detected logo.

    Attributes:
        x: X-coordinate of the top-left corner.
        y: Y-coordinate of the top-left corner.
        width: Width of the bounding box.
        height: Height of the bounding box.
    """
    x: int
    y: int
    width: int
    height: int

    def to_dict(self) -> Dict[str, int]:
        """
        Convert bounding box to dictionary format.

        Returns:
            Dictionary representation of the bounding box.
        """
        return {
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height
        }


@dataclass
class Detection:
    """
    Represents a single logo detection result.

    Attributes:
        logo_id: Unique identifier for the logo class.
        brand_name: Name of the detected brand.
        category: Category of the logo (e.g., 'Sportswear').
        confidence: Confidence score between 0 and 1.
        bounding_box: Location of the detection.
        attributes: Additional attributes like color, orientation.
    """
    logo_id: str
    brand_name: str
    category: str
    confidence: float
    bounding_box: BoundingBox
    attributes: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """
        Convert detection to dictionary format for API response.

        Returns:
            Dictionary representation of the detection.
        """
        result = {
            "logoId": self.logo_id,
            "brandName": self.brand_name,
            "category": self.category,
            "confidence": round(self.confidence, 3),
            "boundingBox": self.bounding_box.to_dict()
        }
        if self.attributes:
            result["attributes"] = self.attributes
        return result


class BaseDetector(ABC):
    """
    Abstract base class for logo detection models.

    This class defines the interface that all detection models must implement.
    """

    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the detector with configuration.

        Args:
            config: Configuration dictionary containing model parameters.
        """
        self.config = config
        self.model = None
        self.confidence_threshold = config.get("confidence_threshold", 0.7)
        self.nms_threshold = config.get("nms_threshold", 0.45)
        self.max_detections = config.get("max_detections", 50)

    @abstractmethod
    async def load_model(self) -> None:
        """
        Load the detection model into memory.

        This method should handle model initialization and loading of weights.

        Raises:
            ModelLoadError: When model loading fails.
        """
        pass

    @abstractmethod
    async def detect(self, image: np.ndarray) -> List[Detection]:
        """
        Perform logo detection on an image.

        Args:
            image: Input image as numpy array (H, W, C).

        Returns:
            List of Detection objects for found logos.

        Raises:
            DetectionError: When detection fails.
        """
        pass

    @abstractmethod
    def preprocess_image(self, image: np.ndarray) -> np.ndarray:
        """
        Preprocess image for model input.

        Args:
            image: Raw input image.

        Returns:
            Preprocessed image ready for model inference.
        """
        pass

    def filter_detections(self, detections: List[Detection]) -> List[Detection]:
        """
        Filter detections based on confidence and max count.

        Args:
            detections: Raw detection results.

        Returns:
            Filtered list of detections.
        """
        # Filter by confidence
        filtered = [d for d in detections if d.confidence >= self.confidence_threshold]

        # Sort by confidence and limit count
        filtered.sort(key=lambda x: x.confidence, reverse=True)

        if len(filtered) > self.max_detections:
            filtered = filtered[:self.max_detections]

        logger.info(f"Filtered {len(detections)} detections to {len(filtered)}")
        return filtered

    def non_max_suppression(self, boxes: List[BoundingBox],
                           scores: List[float]) -> List[int]:
        """
        Apply Non-Maximum Suppression to remove overlapping detections.

        Args:
            boxes: List of bounding boxes.
            scores: List of confidence scores.

        Returns:
            Indices of boxes to keep after NMS.
        """
        if not boxes:
            return []

        # Convert to numpy arrays for efficient computation
        boxes_array = np.array([(b.x, b.y, b.x + b.width, b.y + b.height)
                                for b in boxes])
        scores_array = np.array(scores)

        # Compute areas
        x1 = boxes_array[:, 0]
        y1 = boxes_array[:, 1]
        x2 = boxes_array[:, 2]
        y2 = boxes_array[:, 3]
        areas = (x2 - x1 + 1) * (y2 - y1 + 1)

        # Sort by scores
        order = scores_array.argsort()[::-1]

        keep = []
        while order.size > 0:
            i = order[0]
            keep.append(i)

            # Compute IoU
            xx1 = np.maximum(x1[i], x1[order[1:]])
            yy1 = np.maximum(y1[i], y1[order[1:]])
            xx2 = np.minimum(x2[i], x2[order[1:]])
            yy2 = np.minimum(y2[i], y2[order[1:]])

            w = np.maximum(0.0, xx2 - xx1 + 1)
            h = np.maximum(0.0, yy2 - yy1 + 1)
            inter = w * h

            ovr = inter / (areas[i] + areas[order[1:]] - inter)

            # Keep boxes with IoU less than threshold
            inds = np.where(ovr <= self.nms_threshold)[0]
            order = order[inds + 1]

        return keep