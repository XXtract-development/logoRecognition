"""
Logo detection API endpoints.
"""

import base64
import hashlib
import io
import time
from typing import List, Optional

from fastapi import APIRouter, File, UploadFile, HTTPException, Query
from PIL import Image
from pydantic import BaseModel, Field

from app.core.logging import logger
from app.ml.model_manager import model_manager
from app.ml.detector import LogoDetector


router = APIRouter()


class BoundingBox(BaseModel):
    """Bounding box coordinates."""

    x: int
    y: int
    width: int
    height: int


class Detection(BaseModel):
    """Single detection result."""

    category: str
    value: str
    confidence: float
    bbox: BoundingBox
    embedding: Optional[List[float]] = None


class DetectionRequest(BaseModel):
    """Detection request with base64 image."""

    image: str = Field(..., description="Base64 encoded image")
    confidence_threshold: float = Field(0.99, ge=0.0, le=1.0)
    return_embeddings: bool = Field(False, description="Include embeddings in response")


class DetectionResponse(BaseModel):
    """Detection response model."""

    request_id: str
    detections: List[Detection]
    processing_time_ms: int
    image_hash: str
    model_version: str


class EmbeddingRequest(BaseModel):
    """Request for embedding generation."""

    image: str = Field(..., description="Base64 encoded image")


class EmbeddingResponse(BaseModel):
    """Embedding response model."""

    embedding: List[float]
    dimension: int
    processing_time_ms: int


@router.post("/detect", response_model=DetectionResponse)
async def detect_logos(request: DetectionRequest) -> DetectionResponse:
    """
    Detect logos in an image.

    - **image**: Base64 encoded image (JPEG, PNG)
    - **confidence_threshold**: Minimum confidence for detections (default: 0.99)
    - **return_embeddings**: Whether to include embeddings (default: false)
    """
    start_time = time.time()

    try:
        # Decode base64 image
        image_data = base64.b64decode(request.image)
        image_hash = hashlib.md5(image_data).hexdigest()

        # Open image
        image = Image.open(io.BytesIO(image_data))
        if image.mode != "RGB":
            image = image.convert("RGB")

        logger.info(
            "Processing detection request",
            image_hash=image_hash,
            image_size=f"{image.width}x{image.height}",
        )

        # Run detection
        detector = LogoDetector(model_manager)
        detections = await detector.detect(
            image=image,
            confidence_threshold=request.confidence_threshold,
            return_embeddings=request.return_embeddings,
        )

        processing_time = int((time.time() - start_time) * 1000)

        logger.info(
            "Detection complete",
            image_hash=image_hash,
            detection_count=len(detections),
            processing_time_ms=processing_time,
        )

        return DetectionResponse(
            request_id=f"det_{image_hash[:8]}_{int(time.time())}",
            detections=detections,
            processing_time_ms=processing_time,
            image_hash=image_hash,
            model_version=model_manager.model_version,
        )

    except Exception as e:
        logger.error("Detection failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")


@router.post("/detect/upload", response_model=DetectionResponse)
async def detect_logos_upload(
    file: UploadFile = File(...),
    confidence_threshold: float = Query(0.99, ge=0.0, le=1.0),
    return_embeddings: bool = Query(False),
) -> DetectionResponse:
    """
    Detect logos in an uploaded image file.

    - **file**: Image file (JPEG, PNG)
    - **confidence_threshold**: Minimum confidence for detections
    - **return_embeddings**: Whether to include embeddings
    """
    start_time = time.time()

    # Validate file type
    if file.content_type not in ["image/jpeg", "image/png", "image/webp"]:
        raise HTTPException(
            status_code=400, detail=f"Unsupported image type: {file.content_type}"
        )

    try:
        # Read file
        image_data = await file.read()
        image_hash = hashlib.md5(image_data).hexdigest()

        # Open image
        image = Image.open(io.BytesIO(image_data))
        if image.mode != "RGB":
            image = image.convert("RGB")

        logger.info(
            "Processing uploaded image",
            filename=file.filename,
            image_hash=image_hash,
            image_size=f"{image.width}x{image.height}",
        )

        # Run detection
        detector = LogoDetector(model_manager)
        detections = await detector.detect(
            image=image,
            confidence_threshold=confidence_threshold,
            return_embeddings=return_embeddings,
        )

        processing_time = int((time.time() - start_time) * 1000)

        return DetectionResponse(
            request_id=f"det_{image_hash[:8]}_{int(time.time())}",
            detections=detections,
            processing_time_ms=processing_time,
            image_hash=image_hash,
            model_version=model_manager.model_version,
        )

    except Exception as e:
        logger.error("Detection failed", error=str(e), filename=file.filename)
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")


@router.post("/embed", response_model=EmbeddingResponse)
async def generate_embedding(request: EmbeddingRequest) -> EmbeddingResponse:
    """
    Generate embedding vector for an image.

    - **image**: Base64 encoded image
    """
    start_time = time.time()

    try:
        # Decode image
        image_data = base64.b64decode(request.image)
        image = Image.open(io.BytesIO(image_data))
        if image.mode != "RGB":
            image = image.convert("RGB")

        # Generate embedding
        embedding = await model_manager.generate_embedding(image)

        processing_time = int((time.time() - start_time) * 1000)

        return EmbeddingResponse(
            embedding=embedding.tolist(),
            dimension=len(embedding),
            processing_time_ms=processing_time,
        )

    except Exception as e:
        logger.error("Embedding generation failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Embedding failed: {str(e)}")
