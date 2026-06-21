"""
Pipeline-facing symbol detection contract for Epic 13.

This router is intentionally a thin product layer above the existing detector and
crop-classifier routes. It validates the emitted code universe and maps internal
logoRecognition detections to D8-compatible field objects.
"""

import base64
import hashlib
import io
import time
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from PIL import Image
from pydantic import BaseModel, Field

from app.ml.detector import LogoDetector
from app.ml.model_manager import model_manager
from app.symbol_contract import normalize_detections

router = APIRouter()


class SymbolProfile(BaseModel):
    codes: List[str] = Field(default_factory=list)
    codelists: List[str] = Field(default_factory=list)
    visionThreshold: float = Field(0.75, ge=0.0, le=1.0)


class SymbolRequest(BaseModel):
    image: Optional[str] = Field(None, description="Base64 encoded label image")
    imageUrl: Optional[str] = None
    profile: SymbolProfile = Field(default_factory=SymbolProfile)
    detections: List[Dict[str, Any]] = Field(default_factory=list, description="Precomputed detections for contract tests/replay")


class SymbolDetection(BaseModel):
    code: str
    codelist: Literal["T3777", "NutritionalScore", "GHSSymbolDescriptionCode"]
    confidence: float
    bbox: Optional[Dict[str, int]] = None
    cropRef: Optional[str] = None
    method: Literal["embedding", "classifier"]
    modelVersion: str
    processingTimeMs: int
    uncertain: bool = False


class SymbolResponse(BaseModel):
    requestId: str
    detections: List[SymbolDetection]
    modelVersion: str
    processingTimeMs: int


async def detect_from_image(image_b64: str, confidence_threshold: float) -> List[Dict[str, Any]]:
    image_data = base64.b64decode(image_b64)
    image = Image.open(io.BytesIO(image_data))
    if image.mode != "RGB":
        image = image.convert("RGB")
    detector = LogoDetector(model_manager)
    return await detector.detect(image=image, confidence_threshold=confidence_threshold, return_embeddings=False)


@router.post("/detect-symbols", response_model=SymbolResponse)
async def detect_symbols(request: SymbolRequest) -> SymbolResponse:
    start = time.time()
    model_version = str(getattr(model_manager, "model_version", None) or "unknown")
    request_hash = hashlib.sha1((request.image or request.imageUrl or str(len(request.detections))).encode("utf-8")).hexdigest()[:12]

    try:
        raw_detections = request.detections
        if not raw_detections and request.image:
            raw_detections = await detect_from_image(request.image, request.profile.visionThreshold)
        elapsed_ms = int((time.time() - start) * 1000)
        detections = normalize_detections(raw_detections, request.profile.model_dump(), model_version, elapsed_ms)
        return SymbolResponse(
            requestId=f"sym_{request_hash}",
            detections=detections,
            modelVersion=model_version,
            processingTimeMs=elapsed_ms,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"detect-symbols failed: {exc}") from exc
