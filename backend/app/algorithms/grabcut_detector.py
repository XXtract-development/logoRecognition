"""GrabCut segmentation algorithm"""

import cv2
import numpy as np
from dataclasses import dataclass
from typing import Optional


@dataclass
class GrabCutResult:
    """Result from GrabCut detection"""
    mask: np.ndarray
    foreground: np.ndarray
    bounding_box: Optional[tuple] = None


class GrabCutDetector:
    """GrabCut segmentation for complex backgrounds"""

    def detect(self, image: np.ndarray, click_point: tuple) -> GrabCutResult:
        """Detect logo using GrabCut algorithm"""
        h, w = image.shape[:2]
        x, y = click_point

        # Create initial rectangle around click point
        rect_size = min(w, h) // 4
        rect = (
            max(0, x - rect_size // 2),
            max(0, y - rect_size // 2),
            min(rect_size, w - x + rect_size // 2),
            min(rect_size, h - y + rect_size // 2)
        )

        # Initialize mask
        mask = np.zeros((h, w), np.uint8)

        # Initialize foreground and background models
        bgd_model = np.zeros((1, 65), np.float64)
        fgd_model = np.zeros((1, 65), np.float64)

        # Apply GrabCut algorithm
        try:
            cv2.grabCut(image, mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)

            # Modify mask to get foreground
            mask2 = np.where((mask == 2) | (mask == 0), 0, 1).astype('uint8')

            # Extract foreground
            foreground = image * mask2[:, :, np.newaxis]

            # Find bounding box of foreground region
            coords = np.column_stack(np.where(mask2 > 0))
            if len(coords) > 0:
                y_min, x_min = coords.min(axis=0)
                y_max, x_max = coords.max(axis=0)
                bounding_box = (x_min, y_min, x_max - x_min, y_max - y_min)
            else:
                bounding_box = rect

            return GrabCutResult(
                mask=mask2,
                foreground=foreground,
                bounding_box=bounding_box
            )

        except Exception as e:
            # Fallback to simple rectangle if GrabCut fails
            mask = np.zeros((h, w), np.uint8)
            x, y, w, h = rect
            mask[y:y+h, x:x+w] = 1
            foreground = image * mask[:, :, np.newaxis]

            return GrabCutResult(
                mask=mask,
                foreground=foreground,
                bounding_box=rect
            )