"""Flywheel API — referentie-vliegwiel-endpoints (Epics 13/14/17).

Deze router blijft dun: alleen request-parsing + service-aanroep. De
zwaardere logica leeft in ``app/services/`` (13.1: ``app/services/phash.py``).
De router groeit in latere stories met ``/ml/outlier-audit`` (14.3) en
``/ml/regression-eval`` (13.5).

Endpoints:
  POST /ml/phash  (Story 13.1)
    Body: { "crop_path": str } OF { "image_b64": str }
    Response: { "content_hash": str, "phash": str }

    Levert de canonieke inhouds-hash (SHA-256 over de pixel-buffer na gepinde
    normalisatie) én de perceptual hash (pHash) in één response (AD-14). Dit is
    de enige route voor een inhouds-hash; er bestaat geen Node-implementatie.
"""

import base64
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, model_validator

from app.services import phash as phash_service
from app.services.storage import storage_service

logger = logging.getLogger(__name__)

router = APIRouter()


class PhashRequest(BaseModel):
    """Crop-referentie: MinIO-object-key (``crop_path``) of inline base64.

    ``crop_path`` heeft voorrang boven ``image_b64`` — zelfde conventie als de
    artwork-endpoints (``storage_path`` takes precedence over inline b64).
    """

    crop_path: Optional[str] = None
    image_b64: Optional[str] = None

    @model_validator(mode="after")
    def _require_one_source(self) -> "PhashRequest":
        if not self.crop_path and not self.image_b64:
            raise ValueError("Either crop_path or image_b64 is required")
        return self


class PhashResponse(BaseModel):
    content_hash: str
    phash: str


@router.post("/phash", response_model=PhashResponse)
async def compute_phash(request: PhashRequest) -> PhashResponse:
    """Bereken de canonieke inhouds-hash + pHash voor een crop (Story 13.1, AD-14).

    Laadt de crop uit MinIO (``crop_path``, via de bestaande storage-service) of
    decodeert de inline ``image_b64``. Een laad- of decodeerfout wordt een
    HTTP-fout — nooit een fallback-hash (fail-closed).
    """
    # crop_path takes precedence over inline b64 (zelfde conventie als artwork)
    if request.crop_path:
        try:
            data = storage_service.get_training_image(request.crop_path)
        except Exception as exc:
            logger.warning(
                "Kon crop niet ophalen uit storage",
                extra={"crop_path": request.crop_path, "error": str(exc)},
            )
            raise HTTPException(
                status_code=422,
                detail=f"Kon crop niet ophalen uit storage: {request.crop_path}",
            )
    else:
        try:
            data = base64.b64decode(request.image_b64)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid image_b64: {exc}")

    try:
        image = phash_service.load_image_from_bytes(data)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Crop is geen leesbare afbeelding: {exc}",
        )

    return PhashResponse(
        content_hash=phash_service.content_hash(image),
        phash=phash_service.perceptual_hash(image),
    )
