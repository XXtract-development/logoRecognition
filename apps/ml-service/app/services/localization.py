"""
Keurmerk localization service — Epic 8, Story 8.3 + remediation 8.3R.

Locates certification marks (keurmerken) on artwork images using a tiling
strategy (SAHI-inspired) combined with OpenCV template matching.

Multi-scale design (Story 8.3R, frozen design decisions — see story file):
  The scale ladder lives in the CALLER (the localize endpoint), not in
  ``match_templates``. ``prepare_scaled_templates`` builds, once per request,
  alpha-neutralised template variants at target instance sizes (px max-dim)
  from ``scale_min_px`` up to ``min(scale_max_px, tile_size)`` with factor
  ``scale_step``. ``match_templates`` itself matches each supplied template
  variant single-scale — its public signature is unchanged from Story 8.3.

Public API:
  tile_image(image, tile_size=640, overlap=0.2) → list[dict]
    Each tile: { "image": ndarray, "x_offset": int, "y_offset": int }

  prepare_scaled_templates(templates, *, scale_min_px, scale_max_px,
                           scale_step, tile_size) → list[dict]
    Each variant: { "t3777_code", "image" (BGR, alpha-neutralised),
                    "scale": float, "source_max_dim": int }

  match_templates(tile, templates, min_score=0.8) → list[dict]
    Each match: { "t3777_code": str, "bbox": {"x","y","width","height"}, "score": float }
    Score metric (design decision 3):
      - primary: TM_CCOEFF_NORMED, clipped to [0, 1], match at max_loc;
      - fallback (ONLY for truly degenerate templates, stddev <
        LOCALIZE_DEGENERATE_STD): the legacy TM_SQDIFF ``1 - min/max``
        normalisation, match at min_loc. CCOEFF_NORMED degenerates on
        (near-)constant templates (whole map = 1.0 at (0,0)); real keurmerk
        references measure stddev ≥ 14 even at 48px, so the production path
        is guaranteed single-metric.
    Variance guard: uniform-bright (white-on-white) templates and matched
    regions are rejected; applied per scaled variant.

  merge_detections(detections, iou_threshold=0.5) → list[dict]
    Non-maximum suppression across tile boundaries; highest score wins.

Configuration (env vars):
  LOCALIZE_MIN_VARIANCE   — stddev below which a *bright* region is rejected (default 12)
  LOCALIZE_TILE_SIZE      — default tile size in pixels (default 640)
  LOCALIZE_OVERLAP        — default tile overlap ratio (default 0.2)
  LOCALIZE_MIN_SCORE      — default match-score threshold (default 0.8)
  LOCALIZE_SCALE_MIN_PX   — smallest target instance size on the ladder (default 64; 8-3P)
  LOCALIZE_SCALE_MAX_PX   — largest target instance size, clamped to tile (default 512)
  LOCALIZE_SCALE_STEP     — multiplicative ladder step (default 1.25)
  LOCALIZE_TIME_BUDGET_S  — per-request matching budget in seconds (default 30)
  LOCALIZE_DEGENERATE_STD — stddev below which the SQDIFF fallback fires (default 1.0;
                            deliberately decoupled from LOCALIZE_MIN_VARIANCE)
  LOCALIZE_CLASS_THRESHOLDS — JSON map {t3777_code: threshold} resolved ML-side (8-3P);
                            per-class wins over the request min_score / LOCALIZE_MIN_SCORE.
                            Invalid/empty JSON ⇒ warning + empty map (no crash).
  LOCALIZE_PEAKS_PER_VARIANT — max local maxima extracted per CCOEFF variant map (default 3; 8-3P)
  LOCALIZE_COLLAPSE_TOP_K  — max location-distinct peaks kept per (code, tile) before NMS (default 3; 8-3P)
"""

import json
import os
from typing import Any, Dict, List, Optional

from app.core.logging import logger

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

LOCALIZE_MIN_VARIANCE: float = float(os.environ.get("LOCALIZE_MIN_VARIANCE", "12"))
LOCALIZE_TILE_SIZE: int = int(os.environ.get("LOCALIZE_TILE_SIZE", "640"))
LOCALIZE_OVERLAP: float = float(os.environ.get("LOCALIZE_OVERLAP", "0.2"))
LOCALIZE_MIN_SCORE: float = float(os.environ.get("LOCALIZE_MIN_SCORE", "0.8"))
LOCALIZE_SCALE_MIN_PX: int = int(os.environ.get("LOCALIZE_SCALE_MIN_PX", "64"))
LOCALIZE_SCALE_MAX_PX: int = int(os.environ.get("LOCALIZE_SCALE_MAX_PX", "512"))
LOCALIZE_SCALE_STEP: float = float(os.environ.get("LOCALIZE_SCALE_STEP", "1.25"))
LOCALIZE_TIME_BUDGET_S: float = float(os.environ.get("LOCALIZE_TIME_BUDGET_S", "30"))
LOCALIZE_DEGENERATE_STD: float = float(os.environ.get("LOCALIZE_DEGENERATE_STD", "1.0"))
LOCALIZE_PEAKS_PER_VARIANT: int = int(os.environ.get("LOCALIZE_PEAKS_PER_VARIANT", "3"))
LOCALIZE_COLLAPSE_TOP_K: int = int(os.environ.get("LOCALIZE_COLLAPSE_TOP_K", "3"))


def _parse_class_thresholds(raw: Optional[str]) -> Dict[str, float]:
    """Parse the LOCALIZE_CLASS_THRESHOLDS env-JSON into a {code: threshold} map.

    Contract (8-3P, P1/S1-fix): per-class thresholds live ONLY in this ML-side
    env-map. Invalid JSON, an empty string, ``None`` or a non-object payload
    yields an empty map plus a warning — never an import crash. Non-numeric or
    out-of-range entries are dropped individually (the rest survive).
    """
    if not raw or not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
    except (ValueError, TypeError) as exc:
        logger.warning(
            "Invalid LOCALIZE_CLASS_THRESHOLDS JSON — ignoring",
            extra={"error": str(exc)},
        )
        return {}
    if not isinstance(parsed, dict):
        logger.warning(
            "LOCALIZE_CLASS_THRESHOLDS is not a JSON object — ignoring",
            extra={"type": type(parsed).__name__},
        )
        return {}

    out: Dict[str, float] = {}
    for code, value in parsed.items():
        try:
            thr = float(value)
        except (ValueError, TypeError):
            logger.warning(
                "Dropping non-numeric class threshold",
                extra={"t3777_code": code, "value": value},
            )
            continue
        if not (0.0 <= thr <= 1.0):
            logger.warning(
                "Dropping out-of-range class threshold",
                extra={"t3777_code": code, "value": thr},
            )
            continue
        out[str(code)] = thr
    return out


# Loaded once at import — per-class thresholds resolved ML-side (8-3P).
LOCALIZE_CLASS_THRESHOLDS: Dict[str, float] = _parse_class_thresholds(
    os.environ.get("LOCALIZE_CLASS_THRESHOLDS")
)


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
# Template scaling (Story 8.3R — design decisions 2 and 4)
# ---------------------------------------------------------------------------


def _neutralize_alpha(image: Any) -> Any:
    """Flatten a BGRA template to BGR with transparent pixels set to the mean
    of the opaque pixels (design decision 4).

    Under TM_CCOEFF_NORMED, pixels equal to the template mean contribute ~zero
    deviation, so the (formerly transparent) corners of round marks like
    GREEN_DOT no longer act as a phantom rectangle. BGR input is returned
    unchanged.
    """
    import numpy as np

    if image.ndim != 3 or image.shape[2] != 4:
        return image

    alpha = image[:, :, 3].astype(np.float32) / 255.0
    bgr = image[:, :, :3].astype(np.float32)
    opaque = alpha > 0.5
    if opaque.any():
        mean_val = bgr[opaque].mean(axis=0)
    else:  # fully transparent template — neutral grey, will be guard-rejected anyway
        mean_val = np.array([127.0, 127.0, 127.0], dtype=np.float32)

    out = bgr * alpha[..., None] + mean_val * (1.0 - alpha[..., None])
    return out.astype(np.uint8)


def prepare_scaled_templates(
    templates: List[Dict[str, Any]],
    *,
    scale_min_px: Optional[int] = None,
    scale_max_px: Optional[int] = None,
    scale_step: Optional[float] = None,
    tile_size: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Build the scale ladder of template variants, once per request.

    Ladder definition (design decision 2): target instance sizes in px from
    ``scale_min_px`` to ``min(scale_max_px, tile_size)`` with multiplicative
    step ``scale_step``. Scale factor = target / max(ref_h, ref_w); aspect
    ratio is preserved. Templates larger than the tile are therefore
    downscaled instead of skipped. Alpha is neutralised before scaling
    (design decision 4).

    Returns variants: { "t3777_code", "image" (BGR), "scale", "source_max_dim" }.
    """
    import cv2

    scale_min_px = LOCALIZE_SCALE_MIN_PX if scale_min_px is None else int(scale_min_px)
    scale_max_px = LOCALIZE_SCALE_MAX_PX if scale_max_px is None else int(scale_max_px)
    scale_step = LOCALIZE_SCALE_STEP if scale_step is None else float(scale_step)
    tile_size = LOCALIZE_TILE_SIZE if tile_size is None else int(tile_size)

    if scale_step <= 1.0:
        raise ValueError(f"scale_step must be > 1.0, got {scale_step}")

    cap = min(scale_max_px, tile_size)
    variants: List[Dict[str, Any]] = []

    for tmpl in templates:
        code = tmpl["t3777_code"]
        image = _neutralize_alpha(tmpl["image"])
        h, w = image.shape[:2]
        source_max_dim = max(h, w)
        if source_max_dim < 1:
            logger.warning("Skipping empty template", extra={"t3777_code": code})
            continue

        target = float(scale_min_px)
        while target <= cap + 1e-9:
            scale = target / source_max_dim
            new_w = max(1, int(round(w * scale)))
            new_h = max(1, int(round(h * scale)))
            interp = cv2.INTER_AREA if scale < 1.0 else cv2.INTER_LINEAR
            scaled = cv2.resize(image, (new_w, new_h), interpolation=interp)
            variants.append(
                {
                    "t3777_code": code,
                    "image": scaled,
                    "scale": scale,
                    "source_max_dim": source_max_dim,
                }
            )
            target *= scale_step

    return variants


# ---------------------------------------------------------------------------
# Template matching
# ---------------------------------------------------------------------------


def _variance(arr: Any) -> float:
    """Return pixel-level standard deviation of a numpy array."""
    import numpy as np

    return float(np.std(arr.astype(np.float32)))


def _is_uniform_bright(
    arr: Any,
    min_variance: float = LOCALIZE_MIN_VARIANCE,
    bright_threshold: float = 200.0,
) -> bool:
    """
    Return True if the array is both low-variance AND bright (near-white).

    This distinguishes the problematic white-on-white case (should be rejected)
    from dark-on-dark cases (e.g. all-black template matching a black region,
    which is a valid structural match).
    """
    import numpy as np

    return (
        _variance(arr) < min_variance
        and float(np.mean(arr.astype(np.float32))) > bright_threshold
    )


def _resolve_threshold(t3777_code: str, min_score: float) -> float:
    """Per-class threshold resolution (8-3P, AC2): per-class env value wins over
    the request ``min_score`` (which itself already carries the LOCALIZE_MIN_SCORE
    default when no request value was given). Reads the module global at call
    time so monkeypatched / reloaded maps take effect."""
    return LOCALIZE_CLASS_THRESHOLDS.get(t3777_code, min_score)


def match_templates(
    tile: Any,  # numpy ndarray
    templates: List[Dict[str, Any]],
    min_score: float = 0.8,
) -> List[Dict[str, Any]]:
    """
    Run single-scale template matching for each supplied template against a tile.

    Multi-scale behaviour is achieved by the caller supplying pre-scaled
    variants from ``prepare_scaled_templates`` (Story 8.3R, design decision 1)
    — this function's signature and per-template semantics are unchanged.

    templates: list of { "t3777_code": str, "image": ndarray } (extra keys ignored)
    Returns:   list of { "t3777_code": str, "bbox": {"x","y","width","height"},
                         "score": float, "threshold": float }, score-descending.

    Score metric (design decision 3):
      - TM_CCOEFF_NORMED clipped to [0, 1]; matches at local maxima.
      - Degenerate fallback: template stddev < LOCALIZE_DEGENERATE_STD →
        legacy TM_SQDIFF ``1 - min/max`` score; best match at min_loc.
        This branch exists for (near-)constant templates on which
        CCOEFF_NORMED produces a uniform 1.0 map at (0,0); real references
        never take it (measured stddev ≥ 14 at the smallest ladder scale).

    Per-class thresholds (8-3P, AC2): the effective threshold for a code is
    ``LOCALIZE_CLASS_THRESHOLDS.get(code, min_score)`` and is attached to every
    match as ``threshold`` (both branches).

    Multi-peak extraction (8-3P, P2): the CCOEFF branch extracts up to
    ``LOCALIZE_PEAKS_PER_VARIANT`` location-distinct local maxima per variant
    map — iterative argmax → register peak → suppress a rectangle the size of
    the variant around the peak (set to -1) → repeat until k peaks or the next
    max drops below the effective threshold. The SQDIFF degenerate fallback
    stays single-peak (read as a module global at call time, so reloads /
    monkeypatching take effect).

    Variance guard (white-on-white rejection, per scaled variant):
      Uniform-bright templates are skipped; uniform-bright matched regions
      are rejected. Rejections are logged per scale for calibration.
    """
    try:
        import cv2
    except ImportError:
        logger.error("OpenCV (cv2) not installed — cannot run template matching")
        return []

    tile_gray = (
        cv2.cvtColor(tile, cv2.COLOR_BGR2GRAY) if len(tile.shape) == 3 else tile.copy()
    )
    th, tw = tile_gray.shape[:2]

    peaks_per_variant = max(1, int(LOCALIZE_PEAKS_PER_VARIANT))

    matches: List[Dict[str, Any]] = []

    for tmpl in templates:
        t3777_code = tmpl["t3777_code"]
        tmpl_img = tmpl["image"]
        tmpl_scale = tmpl.get("scale")
        effective_threshold = _resolve_threshold(t3777_code, min_score)

        # Variance guard on the (scaled) template itself — only reject near-white
        # (uniform bright) templates. A uniformly dark template is a valid
        # structural template; the problematic case is white-on-white.
        if _is_uniform_bright(tmpl_img):
            logger.debug(
                "Skipping near-white low-variance template variant",
                extra={
                    "t3777_code": t3777_code,
                    "scale": tmpl_scale,
                    "variance": _variance(tmpl_img),
                },
            )
            continue

        tmpl_gray = (
            cv2.cvtColor(tmpl_img, cv2.COLOR_BGR2GRAY)
            if len(tmpl_img.shape) == 3
            else tmpl_img.copy()
        )
        tmpl_h, tmpl_w = tmpl_gray.shape[:2]

        # A variant must fit within the tile. With the endpoint ladder capped at
        # tile_size this only skips edge cases (boundary tiles smaller than the
        # tile size); native callers of match_templates keep legacy behaviour.
        if tmpl_h > th or tmpl_w > tw:
            logger.debug(
                "Template variant larger than tile — skipping this variant",
                extra={
                    "t3777_code": t3777_code,
                    "scale": tmpl_scale,
                    "tile_size": (tw, th),
                    "tmpl_size": (tmpl_w, tmpl_h),
                },
            )
            continue

        tmpl_std = _variance(tmpl_gray)

        # Each candidate: (x, y, score). The CCOEFF branch may yield up to
        # peaks_per_variant; the SQDIFF fallback always yields a single peak.
        candidates: List = []
        try:
            if tmpl_std < LOCALIZE_DEGENERATE_STD:
                # Degenerate fallback branch (design decision 3): legacy TM_SQDIFF
                # 1 - min/max normalisation; perfect match → 1.0, at min_loc.
                # Single-peak by design (the frozen SQDIFF-fallback contract).
                result = cv2.matchTemplate(tile_gray, tmpl_gray, cv2.TM_SQDIFF)
                min_val, max_val, min_loc, _max_loc = cv2.minMaxLoc(result)
                score = 1.0 - float(min_val) / float(max_val) if max_val > 0 else 1.0
                x, y = min_loc
                candidates.append((x, y, score))
                metric = "sqdiff-fallback"
            else:
                # Primary branch: normalised cross-correlation coefficient with
                # iterative multi-peak extraction (8-3P, P2).
                result = cv2.matchTemplate(tile_gray, tmpl_gray, cv2.TM_CCOEFF_NORMED)
                metric = "ccoeff"
                rh, rw = result.shape[:2]
                # Suppression radius = variant max-dim around each accepted peak.
                radius = max(tmpl_h, tmpl_w)
                for _ in range(peaks_per_variant):
                    _min_val, max_val, _min_loc, max_loc = cv2.minMaxLoc(result)
                    score = max(0.0, min(1.0, float(max_val)))
                    if score < effective_threshold:
                        break
                    px, py = max_loc
                    candidates.append((px, py, score))
                    # Suppress a rectangle the size of the variant around the peak
                    # so the next argmax cannot re-pick the same instance. Clip to
                    # the result-map bounds (no numpy negative-index wraparound).
                    y0 = max(0, py - radius)
                    y1 = min(rh, py + radius + 1)
                    x0 = max(0, px - radius)
                    x1 = min(rw, px + radius + 1)
                    result[y0:y1, x0:x1] = -1.0
        except cv2.error as exc:
            logger.warning(
                "matchTemplate failed",
                extra={
                    "t3777_code": t3777_code,
                    "scale": tmpl_scale,
                    "error": str(exc),
                },
            )
            continue

        for x, y, score in candidates:
            if score < effective_threshold:
                logger.debug(
                    "Match below threshold",
                    extra={
                        "t3777_code": t3777_code,
                        "scale": tmpl_scale,
                        "metric": metric,
                        "score": score,
                        "threshold": effective_threshold,
                    },
                )
                continue

            # Variance guard on the matched region in the tile (per scaled variant).
            matched_region = tile[y : y + tmpl_h, x : x + tmpl_w]
            if _is_uniform_bright(matched_region):
                logger.debug(
                    "Near-white match region rejected",
                    extra={
                        "t3777_code": t3777_code,
                        "scale": tmpl_scale,
                        "score": score,
                        "region_variance": _variance(matched_region),
                    },
                )
                continue

            matches.append(
                {
                    "t3777_code": t3777_code,
                    "bbox": {"x": x, "y": y, "width": tmpl_w, "height": tmpl_h},
                    "score": float(score),
                    "threshold": float(effective_threshold),
                }
            )

    # Score-descending (frozen contract: extra peaks = extra entries, score-aflopend).
    matches.sort(key=lambda m: m["score"], reverse=True)
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

    Note (8.3R): intra-tile best-scale collapse happens in the caller BEFORE
    this NMS (design decision 5) — a 48px and a 286px box on the same centre
    have IoU ≈ 0.03, so NMS alone cannot deduplicate across scales.
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
