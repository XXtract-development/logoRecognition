"""
Logo Detector - Handles logo detection using ML models.
"""

from typing import List, Optional
from PIL import Image

from app.core.logging import logger
from app.core.config import settings


class LogoDetector:
    """
    High-level logo detection interface.
    Combines object detection with embedding generation and similarity search.
    """

    def __init__(self, model_manager):
        self.model_manager = model_manager
        self.confidence_threshold = settings.CONFIDENCE_THRESHOLD
        self.nms_threshold = settings.NMS_THRESHOLD
        self.max_detections = settings.MAX_DETECTIONS

    async def detect(
        self,
        image: Image.Image,
        confidence_threshold: Optional[float] = None,
        return_embeddings: bool = False,
    ) -> List[dict]:
        """
        Detect logos in an image.

        Args:
            image: PIL Image to analyze
            confidence_threshold: Override default confidence threshold
            return_embeddings: Whether to include embeddings in results

        Returns:
            List of detection dictionaries
        """
        threshold = confidence_threshold or self.confidence_threshold

        logger.debug(
            "Running detection",
            image_size=f"{image.width}x{image.height}",
            threshold=threshold,
        )

        # Run object detection
        raw_detections = await self.model_manager.detect(image)

        # Filter by confidence
        detections = [d for d in raw_detections if d.get("confidence", 0) >= threshold]

        # Apply NMS (Non-Maximum Suppression)
        detections = self._apply_nms(detections)

        # Limit detections
        detections = detections[: self.max_detections]

        # Generate embeddings if requested
        if return_embeddings:
            for det in detections:
                try:
                    # Crop the detection region
                    bbox = det["bbox"]
                    crop = image.crop(
                        (
                            bbox["x"],
                            bbox["y"],
                            bbox["x"] + bbox["width"],
                            bbox["y"] + bbox["height"],
                        )
                    )

                    # Generate embedding
                    embedding = await self.model_manager.generate_embedding(crop)
                    det["embedding"] = embedding.tolist()
                except Exception as e:
                    logger.warning("Failed to generate embedding", error=str(e))
                    det["embedding"] = None

        # Match with known logos (similarity search)
        detections = await self._match_logos(detections)

        logger.debug(
            "Detection complete",
            total_raw=len(raw_detections),
            after_filter=len(detections),
        )

        return detections

    def _apply_nms(self, detections: List[dict]) -> List[dict]:
        """
        Apply Non-Maximum Suppression to remove overlapping detections.
        """
        if len(detections) <= 1:
            return detections

        # Sort by confidence
        detections = sorted(detections, key=lambda x: x["confidence"], reverse=True)

        keep = []
        while detections:
            best = detections.pop(0)
            keep.append(best)

            # Remove overlapping detections
            detections = [
                d
                for d in detections
                if self._iou(best["bbox"], d["bbox"]) < self.nms_threshold
            ]

        return keep

    def _iou(self, box1: dict, box2: dict) -> float:
        """Calculate Intersection over Union between two boxes."""
        x1 = max(box1["x"], box2["x"])
        y1 = max(box1["y"], box2["y"])
        x2 = min(box1["x"] + box1["width"], box2["x"] + box2["width"])
        y2 = min(box1["y"] + box1["height"], box2["y"] + box2["height"])

        if x2 <= x1 or y2 <= y1:
            return 0.0

        intersection = (x2 - x1) * (y2 - y1)
        area1 = box1["width"] * box1["height"]
        area2 = box2["width"] * box2["height"]
        union = area1 + area2 - intersection

        return intersection / union if union > 0 else 0.0

    async def _match_logos(self, detections: List[dict]) -> List[dict]:
        """
        Match detections with known logos using embedding similarity.
        Uses vector similarity search against stored logo embeddings.
        """

        matched = []
        for det in detections:
            # If detection already has embedding, use it for matching
            if det.get("embedding"):
                try:
                    import numpy as np

                    embedding = np.array(det["embedding"])
                    from app.services.database import db_service

                    # Search for similar logos
                    matches = await db_service.find_similar_logos(
                        embedding=embedding,
                        limit=3,
                        threshold=0.8,
                    )

                    if matches:
                        best = matches[0]
                        det["category"] = best["category"]
                        det["value"] = best["value"]
                        det["logo_id"] = str(best["logo_id"])
                        det["match_confidence"] = best.get("similarity", 0)
                        det["alternatives"] = [
                            {
                                "category": m["category"],
                                "value": m["value"],
                                "confidence": m.get("similarity", 0),
                            }
                            for m in matches[1:]
                        ]
                    else:
                        det["category"] = "unknown"
                        det["value"] = "no_match"
                        det["logo_id"] = None
                        det["match_confidence"] = 0

                except Exception as e:
                    logger.warning(f"Similarity search failed: {e}")
                    det["category"] = "unknown"
                    det["value"] = "match_error"
            else:
                # No embedding available
                if "category" not in det:
                    det["category"] = "unknown"
                if "value" not in det:
                    det["value"] = "detected_logo"

            matched.append(det)

        return matched

    async def smart_detect(
        self,
        image: Image.Image,
        click_x: int,
        click_y: int,
    ) -> dict:
        """
        Smart detection based on click position.
        Uses edge detection to find logo boundaries.

        Args:
            image: PIL Image
            click_x: X coordinate of click
            click_y: Y coordinate of click

        Returns:
            Detected bounding box
        """
        import numpy as np

        try:
            import cv2

            # Convert to numpy array
            img_array = np.array(image)

            # Convert to grayscale
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)

            # Apply edge detection
            edges = cv2.Canny(gray, 50, 150)

            # Find contours
            contours, _ = cv2.findContours(
                edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )

            # Find contour containing click point
            click_point = (click_x, click_y)
            best_contour = None
            min_area = float("inf")

            for contour in contours:
                if cv2.pointPolygonTest(contour, click_point, False) >= 0:
                    area = cv2.contourArea(contour)
                    if 100 < area < min_area:  # Minimum area threshold
                        min_area = area
                        best_contour = contour

            if best_contour is not None:
                x, y, w, h = cv2.boundingRect(best_contour)
                return {
                    "x": int(x),
                    "y": int(y),
                    "width": int(w),
                    "height": int(h),
                    "confidence": 0.8,
                }

        except ImportError:
            logger.warning("OpenCV not available for smart detection")

        # Fallback: return a default region around click
        default_size = 100
        return {
            "x": max(0, click_x - default_size // 2),
            "y": max(0, click_y - default_size // 2),
            "width": default_size,
            "height": default_size,
            "confidence": 0.5,
        }
