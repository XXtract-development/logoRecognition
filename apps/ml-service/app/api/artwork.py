"""
Artwork processing API — Epic 8 (Stories 8.2, 8.3, 8.4).

Endpoints:
  POST /ml/artwork/rasterize  (Story 8.2)
    Body: { "storage_path": str, "dpi": int }
    Response: { "storage_path", "dpi", "pages": [{"source_file", "page", "image_path", "dpi"}], "error"? }

  POST /ml/artwork/localize
    Body: { "image_path": str, "templates": [{"t3777_code": str, "image_b64": str}] }
    Response: { "detections": [{"t3777_code", "bbox", "score"}] }

  POST /ml/artwork/classify-crop  (Story 8.4)
    Body: { "image_b64": str, "confidence_threshold": float }
    Response: { "t3777_code": str, "confidence": float, "method": str, "uncertain": bool }
"""

import base64
import os
import tempfile
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.logging import logger
from app.services.artwork import DEFAULT_DPI, rasterize_pdf
from app.services.storage import storage_service

router = APIRouter()


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
    image_b64: str  # base64-encoded PNG/JPEG


class LocalizeRequest(BaseModel):
    image_path: Optional[str] = None
    image_b64: Optional[str] = None
    templates: List[TemplateInput]


class LocalizeResponse(BaseModel):
    detections: List[Dict[str, Any]]


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _decode_image(b64: str) -> np.ndarray:
    """Decode a base64-encoded image to an OpenCV-compatible numpy array."""
    import cv2

    img_bytes = base64.b64decode(b64)
    img_arr = np.frombuffer(img_bytes, dtype=np.uint8)
    img = cv2.imdecode(img_arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image from base64 payload")
    return img


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/artwork/localize", response_model=LocalizeResponse)
async def localize_artwork(request: LocalizeRequest) -> LocalizeResponse:
    """
    Localize certification marks on an artwork image.

    Accepts the artwork either as a file path (on the ML service's FS / mounted volume)
    or as a base64-encoded image. Returns a deduplicated list of detections with
    absolute bbox coordinates.
    """
    import cv2

    from app.services.localization import match_templates, merge_detections, tile_image

    # Load source image
    if request.image_path:
        img = cv2.imread(request.image_path)
        if img is None:
            raise HTTPException(status_code=400, detail=f"Cannot read image at path: {request.image_path}")
    elif request.image_b64:
        try:
            img = _decode_image(request.image_b64)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid image_b64: {exc}")
    else:
        raise HTTPException(status_code=422, detail="Either image_path or image_b64 is required")

    # Decode template images
    templates: List[Dict[str, Any]] = []
    for tmpl in request.templates:
        try:
            tmpl_img = _decode_image(tmpl.image_b64)
        except Exception as exc:
            logger.warning("Skipping template with invalid image", extra={"t3777_code": tmpl.t3777_code, "error": str(exc)})
            continue
        templates.append({"t3777_code": tmpl.t3777_code, "image": tmpl_img})

    if not templates:
        return LocalizeResponse(detections=[])

    # Tile + match
    tiles = tile_image(img)
    raw_detections: List[Dict[str, Any]] = []

    for tile in tiles:
        tile_matches = match_templates(tile["image"], templates)
        for match in tile_matches:
            # Translate bbox back to source image coordinates
            abs_match = dict(match)
            abs_match["bbox"] = {
                "x": match["bbox"]["x"] + tile["x_offset"],
                "y": match["bbox"]["y"] + tile["y_offset"],
                "width": match["bbox"]["width"],
                "height": match["bbox"]["height"],
            }
            raw_detections.append(abs_match)

    # Merge overlapping detections across tile boundaries
    merged = merge_detections(raw_detections)

    logger.info(
        "Artwork localization complete",
        extra={"tiles": len(tiles), "raw_detections": len(raw_detections), "merged": len(merged)},
    )
    return LocalizeResponse(detections=merged)
