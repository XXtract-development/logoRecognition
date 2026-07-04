"""
Class-agnostic region proposer (Story 12.2, option B: classical CV).

Finds "logo/mark-like" candidate regions on packaging artwork WITHOUT any
per-class template — cost is INDEPENDENT of the number of keurmerk classes.
Downstream each region is embedded once and classified via the pgvector
reference index. Combines MSER (stable blobs) with adaptive-threshold contours
(solidity-filtered), then de-duplicates via IoU-NMS.

Moved from scripts/spike_region_proposer.py into the app package so the
server-side queue harvester (queue_harvest.py) can import it from the image
(the Docker build only copies app/, not scripts/).
"""

from __future__ import annotations

import time

import cv2
import numpy as np

# Tunables (relative to image area so they scale with artwork resolution).
PROPOSE_MAX_DIM = 1280  # downscale long side before proposing (speed)
MIN_AREA_FRAC = 0.0004  # a logo is at least ~0.04% of the artwork
MAX_AREA_FRAC = 0.08  # ...and at most ~8% (bigger = product imagery, not a mark)
MIN_ASPECT = 0.25
MAX_ASPECT = 4.0
MIN_SOLIDITY = 0.25  # filled-ish region (drops thin lines / borders)
IOU_NMS = 0.3


def _iou(a, b) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    x1, y1 = max(ax, bx), max(ay, by)
    x2, y2 = min(ax + aw, bx + bw), min(ay + ah, by + bh)
    iw, ih = max(0, x2 - x1), max(0, y2 - y1)
    inter = iw * ih
    if inter == 0:
        return 0.0
    return inter / float(aw * ah + bw * bh - inter)


def _nms(boxes):
    # keep larger boxes first; drop boxes that overlap a kept one beyond IOU_NMS
    boxes = sorted(boxes, key=lambda b: b[2] * b[3], reverse=True)
    kept = []
    for b in boxes:
        if all(_iou(b, k) < IOU_NMS for k in kept):
            kept.append(b)
    return kept


def _valid(w: int, h: int, img_area: int) -> bool:
    area = w * h
    if area < MIN_AREA_FRAC * img_area or area > MAX_AREA_FRAC * img_area:
        return False
    ar = w / float(h) if h else 0
    return MIN_ASPECT <= ar <= MAX_ASPECT


def propose_regions(image_bgr: np.ndarray):
    """Return candidate bboxes (x,y,w,h) in ORIGINAL image coords + timing/stats."""
    t0 = time.perf_counter()
    H, W = image_bgr.shape[:2]
    scale = min(1.0, PROPOSE_MAX_DIM / float(max(H, W)))
    small = (
        cv2.resize(image_bgr, (int(W * scale), int(H * scale)))
        if scale < 1.0
        else image_bgr
    )
    sh, sw = small.shape[:2]
    img_area = sh * sw
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

    raw = []

    # 1. MSER — stable extremal regions (logos/text/marks)
    mser = cv2.MSER_create()
    mser.setMinArea(int(MIN_AREA_FRAC * img_area))
    mser.setMaxArea(int(MAX_AREA_FRAC * img_area))
    regions, _ = mser.detectRegions(gray)
    for pts in regions:
        x, y, w, h = cv2.boundingRect(pts.reshape(-1, 1, 2))
        if _valid(w, h, img_area):
            raw.append((x, y, w, h))

    # 2. Contour proposals — adaptive threshold + external contours, solidity-filtered
    thr = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 35, 10
    )
    thr = cv2.morphologyEx(thr, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    contours, _ = cv2.findContours(thr, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        if not _valid(w, h, img_area):
            continue
        hull = cv2.convexHull(c)
        ha = cv2.contourArea(hull)
        solidity = (cv2.contourArea(c) / ha) if ha > 0 else 0
        if solidity >= MIN_SOLIDITY:
            raw.append((x, y, w, h))

    kept = _nms(raw)

    # map back to original coords
    inv = 1.0 / scale
    boxes = [
        (int(x * inv), int(y * inv), int(w * inv), int(h * inv))
        for (x, y, w, h) in kept
    ]
    stats = {
        "image": f"{W}x{H}",
        "raw_regions": len(raw),
        "proposed": len(boxes),
        "propose_ms": round((time.perf_counter() - t0) * 1000, 1),
    }
    return boxes, stats
