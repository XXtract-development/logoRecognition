"""Canny edge detection algorithm"""

import cv2
import numpy as np
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class CannyResult:
    """Result from Canny detection"""
    edges: np.ndarray
    contours: List
    bounding_box: Optional[tuple] = None


class CannyDetector:
    """Canny edge detection for logo boundaries"""

    def detect(self, image: np.ndarray, click_point: tuple) -> CannyResult:
        """Detect logo using Canny edge detection"""
        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # Apply Gaussian blur to reduce noise
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)

        # Calculate adaptive thresholds based on image statistics
        median = np.median(blurred)
        lower = int(max(0, (1.0 - 0.33) * median))
        upper = int(min(255, (1.0 + 0.33) * median))

        # Apply Canny edge detection
        edges = cv2.Canny(blurred, lower, upper)

        # Find contours
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # Filter contours by area
        min_area = 100
        filtered_contours = [c for c in contours if cv2.contourArea(c) > min_area]

        # Find contour containing click point
        x, y = click_point
        selected_contour = None

        for contour in filtered_contours:
            if cv2.pointPolygonTest(contour, (x, y), False) >= 0:
                selected_contour = contour
                break

        bounding_box = None
        if selected_contour is not None:
            x, y, w, h = cv2.boundingRect(selected_contour)
            bounding_box = (x, y, w, h)

        return CannyResult(
            edges=edges,
            contours=filtered_contours,
            bounding_box=bounding_box
        )