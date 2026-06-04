"""
Artwork processing API — Epic 8 (Stories 8.3, 8.4).

Endpoints:
  POST /ml/artwork/localize
    Body: { "image_path": str, "templates": [{"t3777_code": str, "image_b64": str}] }
    Response: { "detections": [{"t3777_code", "bbox", "score"}] }

  POST /ml/artwork/classify-crop  (Story 8.4)
    Body: { "image_b64": str, "confidence_threshold": float }
    Response: { "t3777_code": str, "confidence": float, "method": str, "uncertain": bool }
"""

import base64
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.logging import logger

router = APIRouter()


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
