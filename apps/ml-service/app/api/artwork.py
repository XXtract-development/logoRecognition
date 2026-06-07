"""
Artwork processing API — Epic 8 (Stories 8.2, 8.3, 8.4).

Endpoints:
  POST /ml/artwork/rasterize  (Story 8.2)
    Body: { "storage_path": str, "dpi": int }
    Response: { "storage_path", "dpi", "pages": [{"source_file", "page", "image_path", "dpi"}], "error"? }

  POST /ml/artwork/localize  (Story 8.3 + 8.3R multi-scale)
    Body: { "storage_path": str?, "image_b64": str?, "templates": [{"t3777_code", "image_b64"}],
            "tile_size"?, "overlap"?, "min_score"?, "scale_min_px"?, "scale_max_px"?, "scale_step"? }
    Response: { "detections": [{"t3777_code", "bbox", "score"}], "truncated": bool }

  POST /ml/artwork/classify  (Story 8.4)
    Body: { "storage_path": str?, "image_b64": str?, "crops": [{"x","y","width","height"}]?,
            "confidence_threshold": float? }
    Response: { "results": [{"bbox"?, "t3777_code", "confidence", "method", "uncertain"?}] }
    Each localised region (8.3) is classified to a T3777 keurmerk via the
    embedding/classifier routes; consumed by the cross-check flow (8.5).
"""

import base64
import hashlib
import os
import tempfile
import time
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.logging import logger
from app.services.artwork import DEFAULT_DPI, rasterize_pdf
from app.services.storage import storage_service

router = APIRouter()


# ---------------------------------------------------------------------------
# Story 8-3O — ML-side reference-template loading with a TTL cache (decision 2)
# ---------------------------------------------------------------------------
#
# When a localize request omits ``templates`` the service loads the active
# reference library itself (db_service.get_active_reference_logos +
# storage_service), caching the decoded BGRA template list in-process for
# TEMPLATE_CACHE_TTL_S seconds. The cache is invalidated explicitly via
# POST /ml/artwork/reload-templates (called best-effort by the Node side after
# reference-library mutations) or implicitly when the TTL expires.
#
# Thread-safety: uvicorn workers are separate PROCESSES and asyncio within one
# worker is single-threaded; the cache is a plain module-global tuple read/
# written without a lock. A race at most recomputes the list twice — never
# corrupts it. Documented choice (no asyncio.Lock needed for correctness).

TEMPLATE_CACHE_TTL_S: float = float(os.environ.get("TEMPLATE_CACHE_TTL_S", "900"))

# (loaded_at_monotonic, templates) — templates is a list of {t3777_code, image}.
_TEMPLATE_CACHE: Tuple[float, Optional[List[Dict[str, Any]]]] = (0.0, None)


def reset_template_cache() -> None:
    """Drop the cached reference templates (next localize reloads them)."""
    global _TEMPLATE_CACHE
    _TEMPLATE_CACHE = (0.0, None)


async def _load_reference_templates() -> List[Dict[str, Any]]:
    """Load active reference variants as decoded BGRA templates from storage.

    Mirrors synthesis._load_references_by_class: each active reference variant's
    PNG is fetched from the training bucket and decoded with alpha preserved.
    Variants that cannot be fetched/decoded are skipped (open-input gate). An
    empty library yields an empty list — the caller logs a warning and returns
    no detections (AC2, same pattern as 8.7).
    """
    from app.services.database import db_service

    refs = await db_service.get_active_reference_logos()
    templates: List[Dict[str, Any]] = []
    for ref in refs:
        code = ref["t3777_code"]
        path = ref["storage_path"]
        try:
            data = storage_service.get_training_image(path)
            img = _decode_image_bytes(data, with_alpha=True)
        except Exception as exc:  # pragma: no cover - IO failure path
            logger.warning(
                "Skipping reference template (fetch/decode failed)",
                extra={"t3777_code": code, "storage_path": path, "error": str(exc)},
            )
            continue
        if img is None or getattr(img, "size", 0) == 0:
            continue
        templates.append({"t3777_code": code, "image": img})
    return templates


async def _get_reference_templates_cached() -> List[Dict[str, Any]]:
    """Return the cached reference templates, reloading if the TTL expired."""
    global _TEMPLATE_CACHE
    loaded_at, cached = _TEMPLATE_CACHE
    now = time.monotonic()
    if cached is not None and (now - loaded_at) < TEMPLATE_CACHE_TTL_S:
        return cached
    templates = await _load_reference_templates()
    _TEMPLATE_CACHE = (now, templates)
    logger.info("Reference templates loaded into cache", extra={"count": len(templates), "ttl_s": TEMPLATE_CACHE_TTL_S})
    return templates


@router.post("/artwork/reload-templates")
async def reload_templates() -> Dict[str, Any]:
    """Invalidate the in-process reference-template cache (Story 8-3O).

    Auth: NONE — this is an internal-service endpoint (same posture as the other
    /ml/* endpoints, which run behind the API gateway on a private network and
    carry no per-endpoint auth). The Node side calls it best-effort after
    reference-library mutations so the next localize reflects the change without
    waiting for the TTL.
    """
    reset_template_cache()
    logger.info("Reference-template cache invalidated via reload-templates")
    return {"status": "reloaded"}


# ---------------------------------------------------------------------------
# Story 8.2 — PDF rasterization endpoint
# ---------------------------------------------------------------------------


class ArtworkStorageError(Exception):
    """Raised when the source artwork cannot be fetched from storage.

    Mapped to HTTP 422 by the endpoint — same specific-exception → HTTPException
    contract as training.py (HoldoutSetTooSmallError). Distinct from a *corrupt*
    PDF, which is handled softly (200 + empty pages) per AC2.
    """


class RasterizeRequest(BaseModel):
    storage_path: str = Field(..., description="Object key in the training bucket, e.g. artwork/{gtin}/{file}.pdf")
    dpi: int = Field(DEFAULT_DPI, ge=36, le=1200, description="Rasterization DPI (default from ARTWORK_RASTER_DPI)")


class RasterizedPage(BaseModel):
    source_file: str
    page: int
    image_path: str
    dpi: int


class RasterizeResponse(BaseModel):
    storage_path: str
    dpi: int
    pages: List[RasterizedPage]
    error: Optional[str] = None


@router.post("/artwork/rasterize", response_model=RasterizeResponse)
async def rasterize_artwork(request: RasterizeRequest) -> RasterizeResponse:
    """
    Rasterize each page of a cached PDF artwork to a high-resolution PNG (FR45).

    Flow:
      1. Download the source PDF from the training bucket (storage_path).
      2. Rasterize each page to PNG at the requested DPI (memory-streamed).
      3. Upload each page PNG next to the source: {dir}/{base}.page-{n}.png.
      4. Return the page list with MinIO object keys as image_path.

    Soft-fail contract (AC2): a corrupt or password-protected PDF yields an empty
    page list (200, with an `error` reason) — it is NOT a pipeline error and does
    NOT raise. Only a genuine storage/fetch failure raises 422.
    """
    storage_path = request.storage_path
    dpi = request.dpi

    # 1. Fetch source PDF from storage. A fetch failure is an input error → 422,
    #    mirroring training.py's HoldoutSetTooSmallError → HTTPException(422) contract.
    try:
        pdf_bytes = storage_service.get_training_image(storage_path)
    except ArtworkStorageError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.warning("Could not fetch artwork PDF from storage", extra={"storage_path": storage_path, "error": str(exc)})
        raise HTTPException(
            status_code=422,
            detail=f"Kon artwork niet ophalen uit storage: {storage_path}",
        ) from exc

    # 2. Rasterize in an isolated temp dir so PNGs are written locally first.
    object_dir = os.path.dirname(storage_path)
    base_name = os.path.splitext(os.path.basename(storage_path))[0]

    with tempfile.TemporaryDirectory(prefix="artwork-raster-") as tmp_dir:
        local_pdf = os.path.join(tmp_dir, os.path.basename(storage_path))
        with open(local_pdf, "wb") as fh:
            fh.write(pdf_bytes)
        del pdf_bytes

        # rasterize_pdf never raises (soft-fail). Returns [] for corrupt/empty,
        # or per-page dicts that may carry an "error" key for a failed page.
        raw_pages = rasterize_pdf(local_pdf, dpi=dpi)

        if not raw_pages:
            logger.warning("PDF rasterization produced no pages (corrupt/empty/protected)", extra={"storage_path": storage_path})
            return RasterizeResponse(
                storage_path=storage_path,
                dpi=dpi,
                pages=[],
                error="PDF kon niet gerasterized worden (corrupt, leeg of beveiligd)",
            )

        uploaded_pages: List[RasterizedPage] = []
        page_errors: List[str] = []

        for entry in raw_pages:
            # A per-page failure inside rasterize_pdf is reported but does not abort.
            if "error" in entry:
                page_errors.append(f"pagina {entry.get('page')}: {entry['error']}")
                continue

            local_png = entry["image_path"]
            object_key = (
                f"{object_dir}/{base_name}.page-{entry['page']}.png"
                if object_dir
                else f"{base_name}.page-{entry['page']}.png"
            )

            try:
                with open(local_png, "rb") as png_fh:
                    png_bytes = png_fh.read()
                storage_service.put_training_image(object_key, png_bytes, content_type="image/png")
                del png_bytes
            except Exception as exc:
                logger.warning("Failed to upload rasterized page", extra={"storage_path": storage_path, "page": entry["page"], "error": str(exc)})
                page_errors.append(f"pagina {entry['page']}: upload mislukt ({exc})")
                continue

            uploaded_pages.append(
                RasterizedPage(
                    source_file=os.path.basename(storage_path),
                    page=entry["page"],
                    image_path=object_key,  # durable MinIO key, not the temp path
                    dpi=entry["dpi"],
                )
            )

    error_reason: Optional[str] = "; ".join(page_errors) if page_errors else None
    logger.info(
        "Artwork rasterization complete",
        extra={"storage_path": storage_path, "pages": len(uploaded_pages), "page_errors": len(page_errors)},
    )
    return RasterizeResponse(storage_path=storage_path, dpi=dpi, pages=uploaded_pages, error=error_reason)


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------


class TemplateInput(BaseModel):
    t3777_code: str
    image_b64: str  # base64-encoded PNG/JPEG (alpha channel preserved)


class LocalizeRequest(BaseModel):
    """Story 8.3R (AC3): source via MinIO object key or inline b64; the
    filesystem ``image_path`` is removed; tunables override env defaults.

    Story 8-3O (decision 2): ``templates`` is OPTIONAL. When omitted the ML
    service loads the active reference library itself (TTL-cached). Callers that
    supply templates (meet-scripts, tests) keep the exact same behaviour.
    """

    storage_path: Optional[str] = Field(
        None, description="Object key in the training bucket, e.g. artwork/{gtin}/{file}.page-1.png"
    )
    image_b64: Optional[str] = None
    templates: Optional[List[TemplateInput]] = None
    # Tunables (optional; env defaults apply — see localization module)
    tile_size: Optional[int] = Field(None, ge=64, le=4096)
    overlap: Optional[float] = Field(None, ge=0.0, lt=1.0)
    min_score: Optional[float] = Field(None, ge=0.0, le=1.0)
    scale_min_px: Optional[int] = Field(None, ge=8, le=4096)
    scale_max_px: Optional[int] = Field(None, ge=8, le=4096)
    scale_step: Optional[float] = Field(None, gt=1.0, le=4.0)
    # 8-3P precision tunables (optional; env defaults apply — see localization module)
    collapse_top_k: Optional[int] = Field(None, ge=1, le=50)
    peaks_per_variant: Optional[int] = Field(None, ge=1, le=50)


class LocalizeResponse(BaseModel):
    detections: List[Dict[str, Any]]
    truncated: bool = False  # True when the time budget cut matching short


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _decode_image_bytes(img_bytes: bytes, with_alpha: bool = False) -> np.ndarray:
    """Decode raw image bytes to an OpenCV-compatible numpy array.

    with_alpha=True preserves a BGRA channel layout (IMREAD_UNCHANGED) so the
    localization ladder can alpha-neutralise transparent references (8.3R,
    design decision 4).
    """
    import cv2

    img_arr = np.frombuffer(img_bytes, dtype=np.uint8)
    img = cv2.imdecode(img_arr, cv2.IMREAD_UNCHANGED if with_alpha else cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image bytes")
    if with_alpha and img.ndim == 2:  # grayscale source — normalise to BGR
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    return img


def _decode_image(b64: str, with_alpha: bool = False) -> np.ndarray:
    """Decode a base64-encoded image to an OpenCV-compatible numpy array."""
    return _decode_image_bytes(base64.b64decode(b64), with_alpha=with_alpha)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/artwork/localize", response_model=LocalizeResponse)
async def localize_artwork(request: LocalizeRequest) -> LocalizeResponse:
    """
    Localize certification marks on an artwork image (Story 8.3 + 8.3R).

    Accepts the artwork as a MinIO object key in the training bucket
    (``storage_path``, same semantics as classify) or as a base64-encoded
    image. Builds the multi-scale template ladder once per request, matches
    per tile, collapses to the best scale per (t3777_code, tile) BEFORE NMS
    (design decision 5), and enforces a per-request time budget. Returns a
    deduplicated list of detections with absolute bbox coordinates.
    """
    import time

    import cv2

    from app.services.localization import (
        LOCALIZE_COLLAPSE_TOP_K,
        LOCALIZE_MIN_SCORE,
        LOCALIZE_OVERLAP,
        LOCALIZE_TILE_SIZE,
        LOCALIZE_TIME_BUDGET_S,
        match_templates,
        merge_detections,
        prepare_scaled_templates,
        tile_image,
    )

    # Load source image (storage_path takes precedence over inline b64) — AC3
    if request.storage_path:
        try:
            img_bytes = storage_service.get_training_image(request.storage_path)
        except Exception as exc:
            logger.warning(
                "Could not fetch localize source from storage",
                extra={"storage_path": request.storage_path, "error": str(exc)},
            )
            raise HTTPException(
                status_code=422,
                detail=f"Kon bronbeeld niet ophalen uit storage: {request.storage_path}",
            )
        img_arr = np.frombuffer(img_bytes, dtype=np.uint8)
        img = cv2.imdecode(img_arr, cv2.IMREAD_COLOR)
        if img is None:
            raise HTTPException(
                status_code=422,
                detail=f"Bronbeeld is geen leesbare afbeelding: {request.storage_path}",
            )
    elif request.image_b64:
        try:
            img = _decode_image(request.image_b64)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid image_b64: {exc}")
    else:
        raise HTTPException(status_code=422, detail="Either storage_path or image_b64 is required")

    # Effective tunables: request overrides env defaults
    eff_tile_size = request.tile_size if request.tile_size is not None else LOCALIZE_TILE_SIZE
    eff_overlap = request.overlap if request.overlap is not None else LOCALIZE_OVERLAP
    eff_min_score = request.min_score if request.min_score is not None else LOCALIZE_MIN_SCORE

    # Templates: caller-supplied (decode b64) OR loaded ML-side from the active
    # reference library with a TTL cache when omitted (Story 8-3O, decision 2).
    templates: List[Dict[str, Any]] = []
    if request.templates is not None:
        for tmpl in request.templates:
            try:
                tmpl_img = _decode_image(tmpl.image_b64, with_alpha=True)
            except Exception as exc:
                logger.warning("Skipping template with invalid image", extra={"t3777_code": tmpl.t3777_code, "error": str(exc)})
                continue
            templates.append({"t3777_code": tmpl.t3777_code, "image": tmpl_img})
    else:
        templates = await _get_reference_templates_cached()

    if not templates:
        # Open-input gate (AC2): an empty library / all-invalid templates yields
        # an empty detection list plus a warning — never an error.
        logger.warning("Localize has no usable templates (empty reference library?) — returning no detections")
        return LocalizeResponse(detections=[])

    # Build the scale ladder ONCE per request (design decisions 1+2)
    variants = prepare_scaled_templates(
        templates,
        scale_min_px=request.scale_min_px,
        scale_max_px=request.scale_max_px,
        scale_step=request.scale_step,
        tile_size=eff_tile_size,
    )

    # Effective collapse top-k: request overrides env default (8-3P).
    eff_collapse_top_k = request.collapse_top_k if request.collapse_top_k is not None else LOCALIZE_COLLAPSE_TOP_K

    # Tile + match with time budget; collapse to the top-k LOCATION-DISTINCT
    # peaks per (code, tile) before NMS (8-3P, P2). match_templates already
    # extracts up to LOCALIZE_PEAKS_PER_VARIANT peaks per variant; here we merge
    # the peaks of all scale variants of the same code in the same tile, keeping
    # the k best-scoring ones whose centres are farther apart than the
    # suppression radius (the variant max-dim) — two real instances in one tile
    # survive, near-duplicate scale echoes collapse to the highest scorer.
    tiles = tile_image(img, tile_size=eff_tile_size, overlap=eff_overlap)
    deadline = time.monotonic() + LOCALIZE_TIME_BUDGET_S
    truncated = False
    per_tile_peaks: Dict[Any, List[Dict[str, Any]]] = {}

    def _center(bbox: Dict[str, int]) -> tuple:
        return (bbox["x"] + bbox["width"] / 2.0, bbox["y"] + bbox["height"] / 2.0)

    for tile_idx, tile in enumerate(tiles):
        if time.monotonic() > deadline:
            truncated = True
            logger.warning(
                "Localize time budget exceeded — truncating",
                extra={"processed_tiles": tile_idx, "total_tiles": len(tiles), "budget_s": LOCALIZE_TIME_BUDGET_S},
            )
            break
        # match_templates returns score-descending; process in that order so the
        # location-distinct top-k keeps the highest scorers.
        for match in match_templates(tile["image"], variants, min_score=eff_min_score):
            key = (match["t3777_code"], tile_idx)
            abs_match = dict(match)
            abs_match["bbox"] = {
                "x": match["bbox"]["x"] + tile["x_offset"],
                "y": match["bbox"]["y"] + tile["y_offset"],
                "width": match["bbox"]["width"],
                "height": match["bbox"]["height"],
            }
            kept = per_tile_peaks.setdefault(key, [])
            cx, cy = _center(abs_match["bbox"])
            # Suppression radius for THIS match = its own variant max-dim.
            radius = max(abs_match["bbox"]["width"], abs_match["bbox"]["height"])
            duplicate = False
            for existing in kept:
                ex, ey = _center(existing["bbox"])
                er = max(existing["bbox"]["width"], existing["bbox"]["height"])
                if (cx - ex) ** 2 + (cy - ey) ** 2 <= max(radius, er) ** 2:
                    # Same location as an already-kept (higher-scoring) peak —
                    # a scale echo of the same instance; collapse it away.
                    duplicate = True
                    break
            if duplicate:
                continue
            if len(kept) < eff_collapse_top_k:
                kept.append(abs_match)

    raw_detections = [d for peaks in per_tile_peaks.values() for d in peaks]

    # Merge overlapping detections across tile boundaries
    merged = merge_detections(raw_detections)

    logger.info(
        "Artwork localization complete",
        extra={
            "tiles": len(tiles),
            "variants": len(variants),
            "collapsed_detections": len(raw_detections),
            "merged": len(merged),
            "truncated": truncated,
        },
    )
    return LocalizeResponse(detections=merged, truncated=truncated)


# ---------------------------------------------------------------------------
# Story 8.4 — Crop classification endpoint
# ---------------------------------------------------------------------------


class CropBBox(BaseModel):
    x: int = Field(..., ge=0)
    y: int = Field(..., ge=0)
    width: int = Field(..., gt=0)
    height: int = Field(..., gt=0)


class ClassifyRequest(BaseModel):
    """Classify localised regions to T3777 keurmerk codes (Story 8.4).

    Supply the source artwork via ``storage_path`` (MinIO object key) or
    ``image_b64``; provide the regions to classify via ``crops`` (bboxes into
    that image). When no crops are given, the whole image is classified as a
    single region. ``confidence_threshold`` overrides the per-method default.
    """

    storage_path: Optional[str] = None
    image_b64: Optional[str] = None
    crops: Optional[List[CropBBox]] = None
    confidence_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    # Story 8-3O (decision 3) — crop persistence extension. Default off so
    # existing callers (Story 8.5 crosscheck, tests) are byte-for-byte unchanged.
    gtin: Optional[str] = None
    persist_crops: bool = False


class ClassifyResult(BaseModel):
    bbox: Optional[Dict[str, int]] = None
    t3777_code: str
    confidence: float
    method: str
    uncertain: bool = False
    # Set only when persist_crops=True: MinIO object key of the saved crop PNG.
    crop_path: Optional[str] = None


def _crop_object_key(gtin: str, source: str, bbox: Optional[Dict[str, int]]) -> str:
    """Idempotent crop key: artwork-crops/{gtin}/{sha1(source+bbox)[:12]}.png.

    The same (source image, bbox) always maps to the same key, so re-running
    classify for an artwork overwrites rather than duplicates (decision 3).
    """
    box = bbox or {}
    digest_src = f"{source}|{box.get('x')}|{box.get('y')}|{box.get('width')}|{box.get('height')}"
    digest = hashlib.sha1(digest_src.encode("utf-8")).hexdigest()[:12]
    return f"artwork-crops/{gtin}/{digest}.png"


class ClassifyResponse(BaseModel):
    results: List[ClassifyResult]


@router.post("/artwork/classify", response_model=ClassifyResponse)
async def classify_artwork(request: ClassifyRequest) -> ClassifyResponse:
    """
    Classify each localised region of an artwork to a T3777 keurmerk (FR47).

    Called by the cross-check flow (8.5) after localization (8.3). Per crop it
    returns the classify_crop result (t3777_code + confidence + method +
    uncertain). 'uncertain' is a marking for 8.5 routing, not a filter — every
    region flows through with its result.
    """
    import cv2

    from app.services.classification import classify_crop

    # Load the source image (storage_path takes precedence over inline b64).
    if request.storage_path:
        try:
            img_bytes = storage_service.get_training_image(request.storage_path)
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Kon artwork niet ophalen uit storage: {request.storage_path}",
            ) from exc
        img_arr = np.frombuffer(img_bytes, dtype=np.uint8)
        img = cv2.imdecode(img_arr, cv2.IMREAD_COLOR)
        if img is None:
            raise HTTPException(status_code=422, detail="Kon artwork niet decoderen")
    elif request.image_b64:
        try:
            img = _decode_image(request.image_b64)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid image_b64: {exc}")
    else:
        raise HTTPException(status_code=422, detail="Either storage_path or image_b64 is required")

    h, w = img.shape[:2]

    # Build the list of (bbox, crop) to classify. No crops → whole image.
    regions: List[Dict[str, Any]] = []
    if request.crops:
        for box in request.crops:
            x0 = max(0, min(box.x, w))
            y0 = max(0, min(box.y, h))
            x1 = max(0, min(box.x + box.width, w))
            y1 = max(0, min(box.y + box.height, h))
            if x1 <= x0 or y1 <= y0:
                logger.warning("Skipping out-of-bounds crop", extra={"bbox": box.model_dump()})
                continue
            regions.append({"bbox": box.model_dump(), "crop": img[y0:y1, x0:x1]})
    else:
        regions.append({"bbox": None, "crop": img})

    # Crop-persistence source label (decision 3): the storage key when available,
    # else a stable inline-source marker so the idempotent key is deterministic.
    persist = request.persist_crops and bool(request.gtin)
    source_label = request.storage_path or "inline"

    results: List[ClassifyResult] = []
    for region in regions:
        outcome = await classify_crop(
            region["crop"],
            confidence_threshold=request.confidence_threshold,
        )

        crop_path: Optional[str] = None
        if persist:
            # Write the crop PNG to MinIO under an idempotent key. A persistence
            # failure must not fail the whole classify call — it is logged and
            # the result simply carries crop_path=None.
            try:
                import cv2 as _cv2

                ok, buf = _cv2.imencode(".png", region["crop"])
                if ok:
                    key = _crop_object_key(request.gtin, source_label, region["bbox"])
                    storage_service.put_training_image(key, buf.tobytes(), content_type="image/png")
                    crop_path = key
                else:
                    logger.warning("Crop PNG encoding failed; crop_path stays null", extra={"bbox": region["bbox"]})
            except Exception as exc:
                logger.warning("Crop persistence failed; crop_path stays null", extra={"bbox": region["bbox"], "error": str(exc)})

        results.append(
            ClassifyResult(
                bbox=region["bbox"],
                t3777_code=outcome.get("t3777_code", "UNKNOWN"),
                confidence=float(outcome.get("confidence", 0.0)),
                method=outcome.get("method", "embedding"),
                uncertain=bool(outcome.get("uncertain", False)),
                crop_path=crop_path,
            )
        )

    logger.info("Artwork classification complete", extra={"regions": len(results), "persisted_crops": persist})
    return ClassifyResponse(results=results)


# ---------------------------------------------------------------------------
# Story 8.7 — Synthetic training-data generation endpoint
# ---------------------------------------------------------------------------


class SynthesizeRequest(BaseModel):
    """Generate synthetic composites for one keurmerk class (Story 8.7).

    ``t3777_code`` selects the class; ``count`` is the number of composites to
    generate; ``seed`` makes the batch reproducible (same seed → same PNGs and
    crop descriptors). Each composite PNG is written to MinIO under
    ``synthetic/{t3777Code}/{seed}.png``.
    """

    t3777_code: str = Field(..., min_length=1, description="Keurmerk class to synthesize for")
    count: int = Field(..., ge=1, le=500, description="Number of composites to generate")
    seed: Optional[int] = Field(None, ge=0, description="Base seed for reproducibility")


class SynthesizedSample(BaseModel):
    t3777_code: str
    crop_path: str
    source_file: str
    bbox: Dict[str, int]
    method: str
    confidence: float
    seed: int


class SynthesizeResponse(BaseModel):
    """Crop descriptors for the generated composites.

    The caller (apps/api) registers these through the 8.6 path
    (POST /artwork/:gtin/register-training-data) with method='synthetic'. This
    service never writes training_data — image work + MinIO persistence here,
    persistence of records in apps/api (single registration path).
    """

    t3777_code: str
    generated: int
    samples: List[SynthesizedSample]


@router.post("/artwork/synthesize", response_model=SynthesizeResponse)
async def synthesize_artwork(request: SynthesizeRequest) -> SynthesizeResponse:
    """
    Generate ``count`` synthetic composites for ``t3777_code`` (FR50).

    Loads the active reference variants and real cached artwork backgrounds,
    composes deterministic samples (scale/rotation/HSV/blur via RandomState),
    writes each PNG to MinIO and returns crop descriptors for 8.6 registration.

    Returns an empty ``samples`` list (generated=0) when no usable references or
    backgrounds exist (open-input gate) — never a 5xx for that expected case.
    """
    from app.services.synthesis import synthesize_for_class

    try:
        samples = await synthesize_for_class(
            request.t3777_code, request.count, seed=request.seed
        )
    except Exception as exc:
        logger.error(
            "Synthetic generation failed",
            extra={"t3777_code": request.t3777_code, "error": str(exc)},
        )
        raise HTTPException(status_code=500, detail="Synthetische generatie mislukt") from exc

    logger.info(
        "Synthetic generation complete",
        extra={"t3777_code": request.t3777_code, "generated": len(samples)},
    )
    return SynthesizeResponse(
        t3777_code=request.t3777_code,
        generated=len(samples),
        samples=[
            SynthesizedSample(
                t3777_code=s["t3777_code"],
                crop_path=s["crop_path"],
                source_file=s["source_file"],
                bbox=s["bbox"],
                method=s["method"],
                confidence=s["confidence"],
                seed=s["seed"],
            )
            for s in samples
        ],
    )
