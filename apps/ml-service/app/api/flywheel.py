"""Flywheel API — referentie-vliegwiel-endpoints (Epics 13/14/17).

Deze router blijft dun: alleen request-parsing + service-aanroep. De
zwaardere logica leeft in ``app/services/`` (13.1: ``app/services/phash.py``).
De router groeit in latere stories met ``/ml/regression-eval`` (13.5). Story 13.4
voegt ``/ml/outlier-audit`` toe; 14.3 hergebruikt datzelfde endpoint met een
top-percentiel-grens.

Endpoints:
  POST /ml/phash  (Story 13.1)
    Body: { "crop_path": str } OF { "image_b64": str }
    Response: { "content_hash": str, "phash": str }

    Levert de canonieke inhouds-hash (SHA-256 over de pixel-buffer na gepinde
    normalisatie) én de perceptual hash (pHash) in één response (AD-14). Dit is
    de enige route voor een inhouds-hash; er bestaat geen Node-implementatie.

  POST /ml/outlier-audit  (Story 13.4)
    Body: { "t3777_code": str, "candidates": [{ "id": str, "embedding": [float] }],
            "percentile": float? }
    Response: { "t3777_code": str, "centroid_size": int, "threshold": float,
                "results": [{ "id": str, "distance": float, "is_outlier": bool }] }

    Berekent per kandidaat de cosine-afstand tot het klasse-centroid (uit de
    ACTIEVE referentie-embeddings van de klasse — read-only) en velt een
    grens-oordeel (AD-9). ml-service schrijft niets.
"""

import base64
import logging
from typing import List, Optional

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

from app.services import outlier as outlier_service
from app.services import phash as phash_service
from app.services.database import db_service
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


# ============================================
# Story 13.4 — /ml/outlier-audit
# ============================================


class OutlierCandidate(BaseModel):
    """Eén kandidaat met zijn embedding-vector."""

    id: str
    embedding: List[float]


class OutlierAuditRequest(BaseModel):
    """Per-batch outlier-audit-verzoek (Story 13.4, AD-9).

    De API stuurt de kandidaat-vectoren; de ml-service leest de actieve
    referentie-embeddings van ``t3777_code`` (read-only) voor het centroid.
    ``percentile`` (0..1) is optioneel — gezet = 14.3-percentiel-pad, weg =
    13.4-absolute-grens-pad.
    """

    t3777_code: str
    candidates: List[OutlierCandidate] = Field(default_factory=list)
    percentile: Optional[float] = None


class OutlierResult(BaseModel):
    id: str
    distance: float
    is_outlier: bool


class OutlierAuditResponse(BaseModel):
    t3777_code: str
    centroid_size: int
    threshold: float
    results: List[OutlierResult]


@router.post("/outlier-audit", response_model=OutlierAuditResponse)
async def outlier_audit(request: OutlierAuditRequest) -> OutlierAuditResponse:
    """Beoordeel kandidaten tegen het klasse-centroid van hun klasse (Story 13.4).

    Leest de actieve referentie-embeddings van ``t3777_code`` (read-only) voor
    het centroid en berekent per kandidaat de cosine-afstand + grens-oordeel. Een
    klasse zonder actieve referentie levert een gedefinieerd antwoord
    (``centroid_size=0``, geen outliers) — geen crash. ml-service schrijft niets.
    """
    try:
        reference_vectors = await db_service.get_reference_embeddings_for_class(
            request.t3777_code
        )
    except Exception as exc:
        logger.warning(
            "Kon referentie-embeddings niet lezen voor outlier-audit",
            extra={"t3777_code": request.t3777_code, "error": str(exc)},
        )
        raise HTTPException(
            status_code=503,
            detail=f"Kon referentie-embeddings niet lezen: {exc}",
        )

    candidates = [
        {"id": c.id, "embedding": np.asarray(c.embedding, dtype=np.float32)}
        for c in request.candidates
    ]

    audit = outlier_service.audit_candidates(
        candidates=candidates,
        reference_vectors=reference_vectors,
        percentile=request.percentile,
    )

    return OutlierAuditResponse(
        t3777_code=request.t3777_code,
        centroid_size=int(audit["centroid_size"]),
        threshold=float(audit["threshold"]),
        results=[OutlierResult(**r) for r in audit["results"]],  # type: ignore[arg-type]
    )
