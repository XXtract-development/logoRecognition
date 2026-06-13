"""
Synthetic training data generation service — Epic 8, Story 8.7.

Generates synthetic training samples by compositing reference keurmerk PNGs
onto real cached artwork backgrounds at random, deterministic positions.
Synthetic data supplements scarce real training data WITHOUT polluting the
holdout set (NFR3): the holdout evaluation set stays 100% real.

Public API
==========
compose_synthetic(background, reference, seed=...) -> dict
    Composite a single reference mark onto a background image.
    background: numpy ndarray (H, W, 3) — a real artwork background.
    reference:  { "t3777_code": str, "image": ndarray (h, w, 3 or 4) }
    Returns:    { "label", "method": "synthetic", "image": ndarray,
                  "bbox": {x, y, width, height} }
    The bbox bounds the VISIBLE (rotated) logo and is guaranteed to fall
    entirely within the background — by construction, for any seed.

build_synthetic_batch(min_per_class, real_synthetic_ratio, ...) -> list[dict]
    Loads real per-class counts, the active reference library and real
    artwork backgrounds. For each class below ``min_per_class`` it generates
    synthetic samples up to min(shortage, floor(real_count * ratio)).
    The ratio cap WINS over min_per_class (quality over quantity). When the
    cap prevents reaching min_per_class a shortfall entry is reported.
    No sample is ever marked ``holdout: True``.

synthesize_for_class(t3777_code, count, seed=...) -> list[dict]
    Generate ``count`` deterministic composites for one class and persist each
    PNG to MinIO under ``synthetic/{t3777Code}/{seed}.png``. Returns crop
    descriptors ready for registration through the 8.6 path (registerCropsTx in
    apps/api) — this module never writes ``training_data`` itself.

Determinism
===========
All randomness flows through ``np.random.RandomState(seed)`` — never the
``random`` module nor NumPy global state. Same seed in → same composite out,
so generated datasets are reproducible (PRD model-reproducibility requirement).

Configuration (env vars)
========================
SYNTHESIS_DEFAULT_MIN_PER_CLASS  — default minimum samples per class (default 10)
SYNTHESIS_DEFAULT_RATIO          — default real-to-synthetic ratio (default 0.5)
SYNTHESIS_BUCKET_PREFIX          — MinIO key prefix for composites (default "synthetic")
"""

import math
import os
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from app.core.logging import logger

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SYNTHESIS_DEFAULT_MIN_PER_CLASS: int = int(
    os.environ.get("SYNTHESIS_DEFAULT_MIN_PER_CLASS", "10")
)
SYNTHESIS_DEFAULT_RATIO: float = float(os.environ.get("SYNTHESIS_DEFAULT_RATIO", "0.5"))
SYNTHESIS_BUCKET_PREFIX: str = os.environ.get("SYNTHESIS_BUCKET_PREFIX", "synthetic")

# Transformation parameter ranges (research-addendum Route 1 — print sits nearly
# upright, so rotation is intentionally narrow).
_SCALE_MIN = 0.30  # of the shorter background edge
_SCALE_MAX = 1.00  # of the shorter background edge
_ROTATION_MAX_DEG = 10.0  # ±10°
_HSV_JITTER = 0.10  # ±10%
_BLUR_MAX_PX = 1.5  # 0–1.5px gaussian blur sigma


# ---------------------------------------------------------------------------
# Transformations (all deterministic via RandomState)
# ---------------------------------------------------------------------------


def _ensure_rgba(image: np.ndarray) -> np.ndarray:
    """Return an RGBA copy of ``image``.

    A 2-channel/3-channel image gets a fully opaque alpha mask so the same
    alpha-compositing path handles both transparent reference PNGs and opaque
    ones. The opaque mask also lets rotation introduce transparent corners that
    composite cleanly.
    """
    import cv2

    if image.ndim == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    if image.shape[2] == 4:
        return image.copy()
    h, w = image.shape[:2]
    alpha = np.full((h, w, 1), 255, dtype=np.uint8)
    return np.concatenate([image[:, :, :3], alpha], axis=2)


def _apply_hsv_jitter(bgr: np.ndarray, rng: np.random.RandomState) -> np.ndarray:
    """Apply ±_HSV_JITTER multiplicative jitter to the BGR colour channels.

    Operates in HSV so hue/saturation/value shift independently, mimicking
    print/scan colour variation. Alpha is handled by the caller.
    """
    import cv2

    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    # Independent factor per HSV channel in [1-J, 1+J].
    factors = 1.0 + rng.uniform(-_HSV_JITTER, _HSV_JITTER, size=3).astype(np.float32)
    hsv[:, :, 0] = (hsv[:, :, 0] * factors[0]) % 180.0  # hue wraps at 180 in OpenCV
    hsv[:, :, 1] = np.clip(hsv[:, :, 1] * factors[1], 0, 255)
    hsv[:, :, 2] = np.clip(hsv[:, :, 2] * factors[2], 0, 255)
    return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)


def _rotate_rgba(rgba: np.ndarray, angle_deg: float) -> np.ndarray:
    """Rotate an RGBA image around its centre, expanding the canvas to fit.

    The expanded corners are transparent (alpha 0) so they composite away.
    """
    import cv2

    h, w = rgba.shape[:2]
    center = (w / 2.0, h / 2.0)
    matrix = cv2.getRotationMatrix2D(center, angle_deg, 1.0)
    cos = abs(matrix[0, 0])
    sin = abs(matrix[0, 1])
    new_w = int(math.ceil(h * sin + w * cos))
    new_h = int(math.ceil(h * cos + w * sin))
    matrix[0, 2] += (new_w - w) / 2.0
    matrix[1, 2] += (new_h - h) / 2.0
    return cv2.warpAffine(
        rgba,
        matrix,
        (new_w, new_h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )


def _tight_bbox_from_alpha(rgba: np.ndarray) -> Tuple[int, int, int, int]:
    """Return (x, y, w, h) of the non-transparent region of an RGBA image.

    Falls back to the full image when the alpha channel is entirely zero.
    """
    alpha = rgba[:, :, 3]
    ys, xs = np.where(alpha > 0)
    if xs.size == 0 or ys.size == 0:
        return 0, 0, rgba.shape[1], rgba.shape[0]
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    return x0, y0, (x1 - x0 + 1), (y1 - y0 + 1)


def _alpha_composite(
    background: np.ndarray, overlay_rgba: np.ndarray, x: int, y: int
) -> np.ndarray:
    """Alpha-blend an RGBA overlay onto a BGR background at (x, y)."""
    canvas = background.copy()
    oh, ow = overlay_rgba.shape[:2]
    roi = canvas[y : y + oh, x : x + ow]
    alpha = overlay_rgba[:, :, 3:4].astype(np.float32) / 255.0
    blended = overlay_rgba[:, :, :3].astype(np.float32) * alpha + roi.astype(
        np.float32
    ) * (1.0 - alpha)
    canvas[y : y + oh, x : x + ow] = blended.astype(np.uint8)
    return canvas


# ---------------------------------------------------------------------------
# Single-sample composition
# ---------------------------------------------------------------------------


def compose_synthetic(
    background: np.ndarray,  # (H, W, 3) real artwork background
    reference: Dict[str, Any],  # {"t3777_code": str, "image": ndarray}
    seed: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Composite a reference keurmerk onto a background with random, deterministic
    transformations (scale, rotation, HSV jitter, blur) at a realistic position.

    Containment is guaranteed BY CONSTRUCTION: the rotation angle is drawn first,
    then the scaled size is capped so the rotated footprint can never exceed the
    shorter background edge. The returned bbox bounds the rotated (visible) logo.

    Returns:
      {
        "label":  str,                         # t3777_code
        "method": "synthetic",
        "image":  ndarray,                     # composited BGR image
        "bbox":   {"x","y","width","height"},  # rotated logo footprint
      }
    """
    import cv2

    rng = np.random.RandomState(seed if seed is not None else 0)

    t3777_code: str = reference["t3777_code"]
    ref_img: np.ndarray = reference["image"]
    if ref_img is None or ref_img.size == 0:
        raise ValueError("reference image is empty")

    bg_h, bg_w = background.shape[:2]
    short_side = min(bg_h, bg_w)

    rgba = _ensure_rgba(ref_img)

    # 1. Rotation angle first — its footprint inflation determines the size cap.
    angle = float(rng.uniform(-_ROTATION_MAX_DEG, _ROTATION_MAX_DEG))
    inflate = abs(math.cos(math.radians(angle))) + abs(math.sin(math.radians(angle)))

    # 2. Scale: target longest pre-rotation edge as a fraction of the short side,
    #    capped so the post-rotation footprint still fits the background.
    scale_frac = float(rng.uniform(_SCALE_MIN, _SCALE_MAX))
    # The post-rotation bounding box of a (tw, th) box never exceeds
    # max(tw, th) * inflate, so cap the pre-rotation long edge accordingly.
    max_pre_rot_long = max(1.0, (short_side / inflate))
    target_long = min(scale_frac * short_side, max_pre_rot_long)

    ref_h, ref_w = rgba.shape[:2]
    long_edge = max(ref_h, ref_w, 1)
    resize_scale = target_long / long_edge
    new_w = max(1, int(round(ref_w * resize_scale)))
    new_h = max(1, int(round(ref_h * resize_scale)))
    interp = cv2.INTER_AREA if resize_scale < 1.0 else cv2.INTER_LINEAR
    rgba = cv2.resize(rgba, (new_w, new_h), interpolation=interp)

    # 3. HSV jitter on the colour channels (alpha preserved).
    rgba[:, :, :3] = _apply_hsv_jitter(rgba[:, :, :3], rng)

    # 4. Rotate (expands canvas; corners become transparent).
    rgba = _rotate_rgba(rgba, angle)

    # 5. Gaussian blur 0–_BLUR_MAX_PX (apply to colour + alpha so edges soften).
    sigma = float(rng.uniform(0.0, _BLUR_MAX_PX))
    if sigma > 1e-3:
        rgba = cv2.GaussianBlur(rgba, (0, 0), sigmaX=sigma, sigmaY=sigma)

    # 6. Tight footprint of the visible logo after rotation/blur.
    fx, fy, fw, fh = _tight_bbox_from_alpha(rgba)
    rgba = rgba[fy : fy + fh, fx : fx + fw]

    # Safety clamp: should already fit by construction, but guard rounding.
    fw = min(fw, bg_w)
    fh = min(fh, bg_h)
    rgba = rgba[:fh, :fw]

    # 7. Random placement such that the footprint fits entirely.
    max_x = max(0, bg_w - fw)
    max_y = max(0, bg_h - fh)
    x = int(rng.randint(0, max_x + 1))
    y = int(rng.randint(0, max_y + 1))

    canvas = _alpha_composite(background, rgba, x, y)

    return {
        "label": t3777_code,
        "method": "synthetic",
        "image": canvas,
        "bbox": {"x": x, "y": y, "width": fw, "height": fh},
    }


# ---------------------------------------------------------------------------
# Reference / background loading from MinIO
# ---------------------------------------------------------------------------


def _decode_png_bytes(data: bytes, keep_alpha: bool = True) -> Optional[np.ndarray]:
    """Decode image bytes to a numpy array (BGR or BGRA). Returns None on failure."""
    import cv2

    flag = cv2.IMREAD_UNCHANGED if keep_alpha else cv2.IMREAD_COLOR
    arr = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), flag)
    return arr


def _encode_png(image: np.ndarray) -> bytes:
    """Encode a BGR image to PNG bytes."""
    import cv2

    ok, buf = cv2.imencode(".png", image)
    if not ok:
        raise RuntimeError("PNG encoding failed")
    return buf.tobytes()


async def _load_references_by_class() -> Dict[str, List[Dict[str, Any]]]:
    """Load active reference logos grouped by t3777_code, with decoded images.

    Reads each reference PNG from the TRAINING bucket (prefix reference-logos/).
    Variants that cannot be fetched/decoded are skipped (open-input gate: a class
    without usable references simply produces nothing).
    """
    from app.services.database import db_service
    from app.services.storage import storage_service

    refs = await db_service.get_active_reference_logos()
    by_class: Dict[str, List[Dict[str, Any]]] = {}
    for ref in refs:
        code = ref["t3777_code"]
        path = ref["storage_path"]
        try:
            data = storage_service.get_training_image(path)
            img = _decode_png_bytes(data, keep_alpha=True)
        except Exception as exc:  # pragma: no cover - IO failure path
            logger.warning(
                "Skipping reference (fetch/decode failed)",
                extra={"t3777_code": code, "storage_path": path, "error": str(exc)},
            )
            continue
        if img is None or img.size == 0:
            continue
        by_class.setdefault(code, []).append(
            {"t3777_code": code, "image": img, "storage_path": path}
        )
    return by_class


async def _load_backgrounds(limit: int = 50) -> List[Dict[str, Any]]:
    """Load real cached artwork backgrounds from the TRAINING bucket.

    Returns dicts of {"image": ndarray, "source_file": str}. Backgrounds are the
    rasterized artwork pages under the artwork/ prefix (Story 8.1/8.2) — same
    domain as production, no stock photos (research: realism over volume).
    """
    from app.services.storage import storage_service

    keys = storage_service.list_training_images(prefix="artwork/")
    backgrounds: List[Dict[str, Any]] = []
    for key in keys:
        if not key.lower().endswith((".png", ".jpg", ".jpeg")):
            continue
        try:
            data = storage_service.get_training_image(key)
            img = _decode_png_bytes(data, keep_alpha=False)
        except Exception as exc:  # pragma: no cover - IO failure path
            logger.warning(
                "Skipping background (fetch/decode failed)",
                extra={"storage_path": key, "error": str(exc)},
            )
            continue
        if img is None or img.size == 0:
            continue
        if img.ndim == 2:
            import cv2

            img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        backgrounds.append({"image": img[:, :, :3], "source_file": key})
        if len(backgrounds) >= limit:
            break
    return backgrounds


# ---------------------------------------------------------------------------
# Per-class generation + MinIO persistence
# ---------------------------------------------------------------------------


def _generate_class_samples(
    t3777_code: str,
    references: List[Dict[str, Any]],
    backgrounds: List[Dict[str, Any]],
    count: int,
    base_seed: int,
    persist: bool,
) -> List[Dict[str, Any]]:
    """Generate ``count`` deterministic composites for one class.

    Each composite picks a reference variant and background deterministically
    from ``base_seed + i``, composes, optionally persists the PNG to MinIO under
    ``{prefix}/{t3777Code}/{seed}.png`` and returns a crop descriptor for the
    8.6 registration path. Pure image work is fully deterministic; only the
    MinIO write is a side effect.
    """
    samples: List[Dict[str, Any]] = []
    if not references or not backgrounds:
        return samples

    for i in range(count):
        seed = base_seed + i
        picker = np.random.RandomState(seed)
        ref = references[int(picker.randint(0, len(references)))]
        bg = backgrounds[int(picker.randint(0, len(backgrounds)))]

        composed = compose_synthetic(bg["image"], ref, seed=seed)
        crop_path = f"{SYNTHESIS_BUCKET_PREFIX}/{t3777_code}/{seed}.png"

        if persist:
            from app.services.storage import storage_service

            storage_service.put_training_image(
                crop_path, _encode_png(composed["image"])
            )

        samples.append(
            {
                "label": t3777_code,
                "t3777_code": t3777_code,
                "method": "synthetic",
                "holdout": False,
                "crop_path": crop_path,
                "source_file": bg["source_file"],
                "bbox": composed["bbox"],
                "confidence": 1.0,
                "seed": seed,
            }
        )
    return samples


async def synthesize_for_class(
    t3777_code: str,
    count: int,
    seed: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Generate and persist ``count`` synthetic composites for a single class.

    Loads the active reference variants for ``t3777_code`` and real artwork
    backgrounds, composes ``count`` deterministic samples (seeded from ``seed``),
    writes each PNG to MinIO under ``synthetic/{t3777Code}/{seed}.png`` and
    returns crop descriptors. The caller (apps/api) registers these through the
    8.6 path; this function never writes ``training_data``.

    Returns [] when no usable references or backgrounds exist (open-input gate).
    """
    base_seed = int(seed) if seed is not None else 0
    by_class = await _load_references_by_class()
    references = by_class.get(t3777_code, [])
    if not references:
        logger.warning(
            "No active reference variants for class — nothing to synthesize",
            extra={"t3777_code": t3777_code},
        )
        return []
    backgrounds = await _load_backgrounds()
    if not backgrounds:
        logger.warning(
            "No cached artwork backgrounds available — nothing to synthesize"
        )
        return []

    return _generate_class_samples(
        t3777_code, references, backgrounds, count, base_seed, persist=True
    )


# ---------------------------------------------------------------------------
# Batch generation
# ---------------------------------------------------------------------------


async def build_synthetic_batch(
    min_per_class: int = SYNTHESIS_DEFAULT_MIN_PER_CLASS,
    real_synthetic_ratio: float = SYNTHESIS_DEFAULT_RATIO,
    persist: bool = False,
) -> List[Dict[str, Any]]:
    """
    Generate synthetic samples to supplement under-represented classes.

    Algorithm:
      1. Fetch real, validated, non-holdout counts per class.
      2. Load the active reference library and real artwork backgrounds.
      3. For each class with count < min_per_class:
           shortage  = min_per_class - real_count
           ratio_cap = floor(real_count * real_synthetic_ratio)
           generate  = min(shortage, ratio_cap)
         The ratio cap WINS over min_per_class (quality over quantity). When the
         cap prevents reaching min_per_class the residual is reported via a
         ``shortfall_reported`` entry (and logged) so the datamanager knows the
         class needs more REAL examples.
      4. Generate composites per class; persist PNGs to MinIO when ``persist``.
      5. No sample is ever marked ``holdout: True`` (NFR3).

    ``persist`` defaults to False: this function is the batch-planning entry
    point and is compute-only by default, so a planning call never writes orphan
    PNGs that nothing registers. The wired generation+persistence+registration
    flow runs through ``synthesize_for_class`` → POST /ml/artwork/synthesize →
    the apps/api 8.6 registration path. Pass ``persist=True`` only when the
    caller will also register the returned descriptors through that same path.

    Returns the combined list of crop descriptors + shortfall entries. Each crop
    descriptor is ready for registration via the 8.6 path (method='synthetic').
    """
    from app.services.database import db_service  # may be mocked in tests

    try:
        class_counts: Dict[str, int] = await db_service.get_class_counts()
    except Exception as exc:
        logger.warning(
            "get_class_counts failed — returning empty batch",
            extra={"error": str(exc)},
        )
        return []

    if not class_counts:
        return []

    # Only load references/backgrounds when at least one class needs filling.
    needs_fill = any(c < min_per_class for c in class_counts.values())
    by_class: Dict[str, List[Dict[str, Any]]] = {}
    backgrounds: List[Dict[str, Any]] = []
    if needs_fill:
        try:
            by_class = await _load_references_by_class()
            backgrounds = await _load_backgrounds()
        except Exception as exc:
            logger.warning(
                "Failed to load references/backgrounds — generating no composites",
                extra={"error": str(exc)},
            )

    batch: List[Dict[str, Any]] = []

    for label, real_count in sorted(class_counts.items()):
        if real_count >= min_per_class:
            continue  # already enough real samples

        shortage = min_per_class - real_count
        ratio_cap = math.floor(real_count * real_synthetic_ratio)
        generate = min(shortage, ratio_cap)

        references = by_class.get(label, [])

        if generate <= 0:
            logger.info(
                "Synthetic shortfall (ratio cap blocks supplementation)",
                extra={"label": label, "real_count": real_count, "shortfall": shortage},
            )
            batch.append(
                {
                    "label": label,
                    "method": "synthetic",
                    "holdout": False,
                    "shortfall_reported": True,
                    "shortfall_count": shortage,
                    "real_count": real_count,
                }
            )
            continue

        # Deterministic per-class seed base derived from the label (stable across
        # processes — never Python's salted hash()).
        base_seed = int.from_bytes(label.encode("utf-8")[:4].ljust(4, b"\0"), "big") % (
            2**31
        )

        produced = _generate_class_samples(
            label, references, backgrounds, generate, base_seed, persist=persist
        )
        batch.extend(produced)

        if not produced:
            # References/backgrounds missing (open-input gate): report so the gap
            # is visible rather than silently swallowed.
            logger.info(
                "No composites produced (missing references or backgrounds)",
                extra={"label": label, "wanted": generate},
            )
            batch.append(
                {
                    "label": label,
                    "method": "synthetic",
                    "holdout": False,
                    "shortfall_reported": True,
                    "shortfall_count": shortage,
                    "real_count": real_count,
                }
            )
            continue

        if generate < shortage:
            logger.info(
                "Synthetic supplementation capped below minimum",
                extra={
                    "label": label,
                    "generated": generate,
                    "still_short": shortage - generate,
                },
            )
            batch.append(
                {
                    "label": label,
                    "method": "synthetic",
                    "holdout": False,
                    "shortfall_reported": True,
                    "shortfall_count": shortage - generate,
                    "real_count": real_count,
                }
            )

    return batch
