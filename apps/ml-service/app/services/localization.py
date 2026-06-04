"""
Keurmerk localization service — Epic 8, Story 8.3.

Locates certification marks (keurmerken) on artwork images using a tiling
strategy (SAHI-inspired) combined with OpenCV template matching.

Public API:
  tile_image(image, tile_size=640, overlap=0.2) → list[dict]
    Each tile: { "image": ndarray, "x_offset": int, "y_offset": int }

  match_templates(tile, templates, min_score=0.8) → list[dict]
    Each match: { "t3777_code": str, "bbox": {"x","y","width","height"}, "score": float }
    Variance guard: templates or tiles with low variance are rejected (white-on-white guard).

  merge_detections(detections, iou_threshold=0.5) → list[dict]
    Non-maximum suppression across tile boundaries; highest score wins.

Configuration (env vars):
  LOCALIZE_MIN_VARIANCE  — minimum pixel stddev below which a region is rejected (default 12)
  LOCALIZE_TILE_SIZE     — default tile size in pixels (default 640)
  LOCALIZE_OVERLAP       — default tile overlap ratio (default 0.2)
"""

import math
import os
from typing import Any, Dict, List

from app.core.logging import logger

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

LOCALIZE_MIN_VARIANCE: float = float(os.environ.get("LOCALIZE_MIN_VARIANCE", "12"))
LOCALIZE_TILE_SIZE: int = int(os.environ.get("LOCALIZE_TILE_SIZE", "640"))
LOCALIZE_OVERLAP: float = float(os.environ.get("LOCALIZE_OVERLAP", "0.2"))


# ---------------------------------------------------------------------------
# Tiling
# ---------------------------------------------------------------------------


def tile_image(
    image: Any,  # numpy ndarray
    tile_size: int = LOCALIZE_TILE_SIZE,
    overlap: float = LOCALIZE_OVERLAP,
) -> List[Dict[str, Any]]:
    """
    Slice an image into overlapping tiles (SAHI approach).

    Each returned tile dict:
      { "image": ndarray(h<=tile_size, w<=tile_size, c), "x_offset": int, "y_offset": int }

    The overlap parameter is the fraction of each tile that overlaps with its
    neighbour, so adjacent tile centres are `tile_size * (1 - overlap)` apart.
    Boundary tiles are padded to fit within the source image (no zero-padding).
    """
    import numpy as np

    h, w = image.shape[:2]
    stride = max(1, int(tile_size * (1 - overlap)))

    tiles: List[Dict[str, Any]] = []

    y = 0
    while True:
        x = 0
        while True:
            x1 = min(x, max(0, w - tile_size))
            y1 = min(y, max(0, h - tile_size))
            x2 = min(x1 + tile_size, w)
            y2 = min(y1 + tile_size, h)

            tile_img = image[y1:y2, x1:x2]
            tiles.append({"image": tile_img, "x_offset": x1, "y_offset": y1})

            if x + tile_size >= w:
                break
            x += stride

        if y + tile_size >= h:
            break
        y += stride

    return tiles


# ---------------------------------------------------------------------------
# Template matching
# ---------------------------------------------------------------------------


def _variance(arr: Any) -> float:
    """Return pixel-level standard deviation of a numpy array."""
    import numpy as np

    return float(np.std(arr.astype(np.float32)))


def _is_uniform_bright(arr: Any, min_variance: float = LOCALIZE_MIN_VARIANCE, bright_threshold: float = 200.0) -> bool:
    """
    Return True if the array is both low-variance AND bright (near-white).

    This distinguishes the problematic white-on-white case (should be rejected)
    from dark-on-dark cases (e.g. all-black template matching a black region,
    which is a valid structural match).
    """
    import numpy as np

    return _variance(arr) < min_variance and float(np.mean(arr.astype(np.float32))) > bright_threshold


def match_templates(
    tile: Any,  # numpy ndarray
    templates: List[Dict[str, Any]],
    min_score: float = 0.8,
) -> List[Dict[str, Any]]:
    """
    Run multi-scale template matching for each template against a tile.

    templates: list of { "t3777_code": str, "image": ndarray }
    Returns:   list of { "t3777_code": str, "bbox": {"x","y","width","height"}, "score": float }

    Variance guard (white-on-white rejection):
      If the template standard-deviation < LOCALIZE_MIN_VARIANCE, skip the template.
      If the best matching region's standard-deviation < LOCALIZE_MIN_VARIANCE, reject match.
    """
    try:
        import cv2
        import numpy as np
    except ImportError:
        logger.error("OpenCV (cv2) not installed — cannot run template matching")
        return []

    tile_gray = cv2.cvtColor(tile, cv2.COLOR_BGR2GRAY) if len(tile.shape) == 3 else tile.copy()
    th, tw = tile_gray.shape[:2]

    matches: List[Dict[str, Any]] = []

    for tmpl in templates:
        t3777_code = tmpl["t3777_code"]
        tmpl_img = tmpl["image"]

        # Variance guard on template itself — only reject near-white (uniform bright) templates.
        # A uniformly dark template (e.g. all-black) is a valid structural template;
        # the problematic case is white-on-white where TM_CCOEFF_NORMED gives false positives.
        if _is_uniform_bright(tmpl_img):
            logger.debug(
                "Skipping near-white low-variance template",
                extra={"t3777_code": t3777_code, "variance": _variance(tmpl_img)},
            )
            continue

        tmpl_gray = (
            cv2.cvtColor(tmpl_img, cv2.COLOR_BGR2GRAY) if len(tmpl_img.shape) == 3 else tmpl_img.copy()
        )
        tmpl_h, tmpl_w = tmpl_gray.shape[:2]

        # Template must fit within tile
        if tmpl_h > th or tmpl_w > tw:
            logger.debug(
                "Template larger than tile — skipping",
                extra={"t3777_code": t3777_code, "tile_size": (tw, th), "tmpl_size": (tmpl_w, tmpl_h)},
            )
            continue

        try:
            # Use TM_SQDIFF (lower = better match; 0 = perfect match).
            # We normalise the score as 1 - (min_val / max_val) so that:
            #   perfect match → score 1.0
            #   worst possible → score 0.0
            # This avoids the undefined-behaviour of TM_CCOEFF_NORMED on
            # zero-variance (all-black or all-white) templates.
            result = cv2.matchTemplate(tile_gray, tmpl_gray, cv2.TM_SQDIFF)
            min_val, max_val, min_loc, _max_loc = cv2.minMaxLoc(result)
        except cv2.error as exc:
            logger.warning(
                "matchTemplate failed",
                extra={"t3777_code": t3777_code, "error": str(exc)},
            )
            continue

        # Normalise: avoid div-by-zero when the entire result map is 0
        if max_val > 0:
            score = 1.0 - float(min_val) / float(max_val)
        else:
            # min_val == max_val == 0 → all positions are equally perfect matches
            score = 1.0

        if score < min_score:
            continue

        x, y = min_loc  # best match location for TM_SQDIFF is at minimum value
        max_val = score  # reuse variable for logging below

        # Variance guard on the matched region in the tile.
        # Only reject if the matched region is near-white (uniform bright),
        # which indicates a degenerate uniform-background match.
        matched_region = tile[y : y + tmpl_h, x : x + tmpl_w]
        if _is_uniform_bright(matched_region):
            logger.debug(
                "Near-white match region rejected",
                extra={"t3777_code": t3777_code, "score": max_val, "region_variance": _variance(matched_region)},
            )
            continue

        matches.append(
            {
                "t3777_code": t3777_code,
                "bbox": {"x": x, "y": y, "width": tmpl_w, "height": tmpl_h},
                "score": float(score),
            }
        )

    return matches


# ---------------------------------------------------------------------------
# Non-maximum suppression (merge cross-tile detections)
# ---------------------------------------------------------------------------


def _iou(a: Dict[str, int], b: Dict[str, int]) -> float:
    """Intersection over Union for two bbox dicts { x, y, width, height }."""
    ax1, ay1 = a["x"], a["y"]
    ax2, ay2 = ax1 + a["width"], ay1 + a["height"]
    bx1, by1 = b["x"], b["y"]
    bx2, by2 = bx1 + b["width"], by1 + b["height"]

    inter_w = max(0, min(ax2, bx2) - max(ax1, bx1))
    inter_h = max(0, min(ay2, by2) - max(ay1, by1))
    inter_area = inter_w * inter_h

    if inter_area == 0:
        return 0.0

    area_a = a["width"] * a["height"]
    area_b = b["width"] * b["height"]
    union_area = area_a + area_b - inter_area
    return inter_area / union_area if union_area > 0 else 0.0


def merge_detections(
    detections: List[Dict[str, Any]],
    iou_threshold: float = 0.5,
) -> List[Dict[str, Any]]:
    """
    Non-maximum suppression across tile-boundary detections.

    Input:  list of { "t3777_code": str, "bbox": {"x","y","width","height"}, "score": float }
    Output: same format, one entry per detected mark group.

    Strategy: greedy NMS per t3777_code group — sort descending by score,
    suppress overlapping detections with IoU > iou_threshold.
    """
    if not detections:
        return []

    # Group by code
    by_code: Dict[str, List[Dict[str, Any]]] = {}
    for det in detections:
        by_code.setdefault(det["t3777_code"], []).append(det)

    kept: List[Dict[str, Any]] = []
    for code, dets in by_code.items():
        # Sort descending by score
        dets_sorted = sorted(dets, key=lambda d: d["score"], reverse=True)
        suppressed = [False] * len(dets_sorted)

        for i, det in enumerate(dets_sorted):
            if suppressed[i]:
                continue
            kept.append(det)
            for j in range(i + 1, len(dets_sorted)):
                if not suppressed[j]:
                    if _iou(det["bbox"], dets_sorted[j]["bbox"]) > iou_threshold:
                        suppressed[j] = True

    return kept
