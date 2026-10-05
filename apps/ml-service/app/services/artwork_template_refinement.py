"""Refine a spatial proposal with the entire reference library, without classifying it."""

import math

import cv2

from app.services.localization import match_templates, prepare_scaled_templates


def refine_proposal(image, bbox, templates):
    """Single-geometry compatibility helper; the caller retains the original."""
    boxes = refine_proposals(image, bbox, templates, max_proposals=1)
    return boxes[0] if boxes else None


def refine_proposals(image, bbox, templates, max_proposals=3):
    """Return bounded location-distinct geometries; retain the original proposal.

    Every active template participates inside this padded region. This is not
    an exhaustive search of the page and its score is never a classifier score.
    Blocking work must run through the strict admission-controlled worker.
    """
    if (
        not isinstance(max_proposals, int)
        or isinstance(max_proposals, bool)
        or not 1 <= max_proposals <= 3
    ):
        raise ValueError("Invalid refinement count")
    height, width = image.shape[:2]
    x, y, w, h = (bbox[key] for key in ("x", "y", "width", "height"))
    if (
        not all(isinstance(v, int) and not isinstance(v, bool) for v in (x, y, w, h))
        or min(x, y) < 0
        or min(w, h) <= 0
        or x + w > width
        or y + h > height
    ):
        raise ValueError("Invalid refinement region")
    if not templates:
        raise ValueError("Required refinement reference library is empty")
    x0, y0 = max(0, x - math.ceil(w * 0.15)), max(0, y - math.ceil(h * 0.15))
    x1, y1 = min(width, x + w + math.ceil(w * 0.15)), min(
        height, y + h + math.ceil(h * 0.15)
    )
    roi = image[y0:y1, x0:x1]
    ratio = min(1.0, 640 / max(roi.shape[:2]))
    if ratio < 1:
        roi = cv2.resize(
            roi,
            (max(1, round(roi.shape[1] * ratio)), max(1, round(roi.shape[0] * ratio))),
            interpolation=cv2.INTER_AREA,
        )
    roi_h, roi_w = roi.shape[:2]
    if max(roi_h, roi_w) < 8:
        return []
    variants = prepare_scaled_templates(
        templates,
        scale_min_px=8,
        scale_max_px=min(512, max(roi_h, roi_w)),
        scale_step=1.2,
        tile_size=640,
    )
    if not variants:
        raise ValueError("Required refinement scale library is empty")
    # A tiny or solid patch supplies no evidence about the complete proposed
    # mark. The original proposal is retained even when refinement abstains.
    minimum_area = max(16 * 16, roi_w * roi_h * 0.05)
    variants = [
        variant
        for variant in variants
        if variant["image"].shape[0] <= roi_h
        and variant["image"].shape[1] <= roi_w
        and variant["image"].shape[0] * variant["image"].shape[1] >= minimum_area
    ]
    if not variants:
        return []
    matches = match_templates(roi, variants, min_score=0.8)
    matches = [
        match
        for match in matches
        if cv2.cvtColor(
            roi[
                match["bbox"]["y"] : match["bbox"]["y"] + match["bbox"]["height"],
                match["bbox"]["x"] : match["bbox"]["x"] + match["bbox"]["width"],
            ],
            cv2.COLOR_BGR2GRAY,
        ).std()
        >= 12
    ]
    if not matches:
        return []
    kept = []
    for match in sorted(matches, key=lambda match: match["score"], reverse=True):
        box = match["bbox"]
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        if any(
            (cx - (old["x"] + old["width"] / 2)) ** 2
            + (cy - (old["y"] + old["height"] / 2)) ** 2
            <= (0.5 * max(box["width"], box["height"], old["width"], old["height"]))
            ** 2
            for old in kept
        ):
            continue
        kept.append(box)
        if len(kept) >= max_proposals:
            break
    # Use actual rounded resize dimensions, not the nominal resize ratio.
    sx, sy = (x1 - x0) / roi_w, (y1 - y0) / roi_h
    output = []
    for best in kept:
        bx0 = max(x0, x0 + math.floor(best["x"] * sx))
        by0 = max(y0, y0 + math.floor(best["y"] * sy))
        bx1 = min(x1, x0 + math.ceil((best["x"] + best["width"]) * sx))
        by1 = min(y1, y0 + math.ceil((best["y"] + best["height"]) * sy))
        output.append({"x": bx0, "y": by0, "width": bx1 - bx0, "height": by1 - by0})
    return output
