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
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

from app.ml.model_manager import model_manager
from app.services import outlier as outlier_service
from app.services import phash as phash_service
from app.services import regression_eval as regression_eval_service
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


# ============================================
# Story 13.5 — /ml/regression-eval
# ============================================


class GoldSetQuery(BaseModel):
    """Eén geresolvede gold-set-crop (payload van de API, AD-4).

    De ml-service leest de gold-set-tabellen NOOIT zelf; hij krijgt de actieve set
    (``replacedById IS NULL``, crop-niveau) als payload. ``content_hash`` voedt de
    self-match-guard (AD-5).
    """

    id: str
    crop_path: str
    label: str  # ECHT | VALS
    t3777_code: str
    content_hash: Optional[str] = None


class ShadowCandidate(BaseModel):
    """Eén schaduw-kandidaat (uitsluitend ``in_batch`` van deze batch, AD-5).

    De API stuurt de kandidaat-embedding (kopie uit ``candidate_embeddings``) mee;
    de ml-service herberekent hier niets (AD-3). ``content_hash`` + ``t3777_code``
    voeden de self-match-guard en de klasse-scoping.
    """

    id: str
    embedding: List[float]
    t3777_code: str
    content_hash: Optional[str] = None


class RegressionEvalRequest(BaseModel):
    """Gold-set-regressie-eval-verzoek (Story 13.5, AD-4/AD-5).

    ``include_shadow=False`` = nulmeting-modus (uitsluitend de actieve set, AC 2/3).
    ``threshold`` = de matchdrempel (cosine). De API resolvet de gold-set en de
    schaduwset; de ml-service embed de query-crops, leest de actieve referenties
    (read-only) en meet — hij schrijft niets.
    """

    gold_set: List[GoldSetQuery] = Field(default_factory=list)
    shadow_candidates: List[ShadowCandidate] = Field(default_factory=list)
    threshold: float
    include_shadow: bool = True


class RegressionEvalResponse(BaseModel):
    precision: float
    total: int
    correct: int
    per_class: Dict[str, Any]
    samples: List[Dict[str, Any]]


@router.post("/regression-eval", response_model=RegressionEvalResponse)
async def regression_eval(request: RegressionEvalRequest) -> RegressionEvalResponse:
    """Meet precisie@drempel over de gold-set (Story 13.5, AD-4/AD-5).

    Stappen:
      1. Lees de ACTIEVE ``ReferenceEmbedding`` (read-only PG).
      2. In schaduw-modus: neem de meegegeven schaduw-kandidaten (``in_batch`` van
         de batch-onder-meting, AD-5) erbij. In nulmeting-modus (``include_shadow=
         False``) blijft de schaduwset leeg (AC 2/3).
      3. Embed elke gold-set-query-crop (stateless compute; geen gold-set-read).
      4. Meet precisie@drempel met de pure eval-service (self-match-guard, AD-5).

    Een lege gold-set → HTTP 422 (een poort kan niet meten zonder gold-set; de API
    vertaalt dat fail-closed naar quarantaine, AC 7). Een laad-/embed-fout op een
    crop → HTTP 422 zodat de API de hele meting fail-closed quarantaineert (AD-11)
    — nooit een stille partiële meting.
    """
    if not request.gold_set:
        raise HTTPException(
            status_code=422,
            detail="Lege gold-set — regressie-eval niet uitvoerbaar (fail-closed).",
        )

    # 1. Actieve referentie-embeddings (read-only).
    try:
        active_rows = await db_service.get_active_reference_entries()
    except Exception as exc:
        logger.warning(
            "Kon actieve referentie-embeddings niet lezen voor regressie-eval",
            extra={"error": str(exc)},
        )
        raise HTTPException(
            status_code=503,
            detail=f"Kon actieve referentie-embeddings niet lezen: {exc}",
        )

    reference_entries: List[Dict[str, Any]] = [
        {
            "embedding": r["embedding"],
            "t3777Code": r["t3777_code"],
            "contentHash": None,  # referentie-rijen dragen geen bekende inhouds-hash
            "cropPath": r.get("storage_path"),
        }
        for r in active_rows
    ]

    # 2. Schaduwset — uitsluitend in schaduw-modus (AD-5).
    shadow_entries: List[Dict[str, Any]] = []
    if request.include_shadow:
        shadow_entries = [
            {
                "embedding": np.asarray(c.embedding, dtype=np.float32),
                "t3777Code": c.t3777_code,
                "contentHash": c.content_hash,
                "cropPath": None,
            }
            for c in request.shadow_candidates
        ]

    # 3. Embed elke gold-set-query-crop (stateless compute, geen gold-set-read).
    query_records: List[Dict[str, Any]] = []
    for q in request.gold_set:
        try:
            data = storage_service.get_training_image(q.crop_path)
            image = phash_service.load_image_from_bytes(data)
            embedding = await model_manager.generate_embedding(image)
        except Exception as exc:
            logger.warning(
                "Kon gold-set-crop niet embedden voor regressie-eval",
                extra={"crop_path": q.crop_path, "error": str(exc)},
            )
            raise HTTPException(
                status_code=422,
                detail=f"Kon gold-set-crop niet embedden: {q.crop_path}: {exc}",
            )
        query_records.append(
            {
                "id": q.id,
                "embedding": embedding,
                "label": q.label,
                "t3777Code": q.t3777_code,
                "contentHash": q.content_hash,
                "cropPath": q.crop_path,
            }
        )

    # 4. Meet (pure service).
    result = regression_eval_service.evaluate_precision(
        query_records=query_records,
        reference_entries=reference_entries,
        shadow_entries=shadow_entries if request.include_shadow else None,
        threshold=request.threshold,
    )

    return RegressionEvalResponse(
        precision=result["precision"],
        total=result["total"],
        correct=result["correct"],
        per_class=result["perClass"],
        samples=result["samples"],
    )
