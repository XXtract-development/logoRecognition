"""
FastAPI Detection Endpoints - A++ Grade Implementation
STORY-008: Smart Detection Pipeline API
"""
import asyncio
import io
import time
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, File, UploadFile, HTTPException, BackgroundTasks, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import numpy as np
import cv2
from PIL import Image
import logging
from datetime import datetime
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from fastapi.responses import Response

from .optimized_detector import OptimizedDetector, DetectionResult

logger = logging.getLogger(__name__)

# Initialize router
router = APIRouter(prefix="/api/v1/detection", tags=["detection"])

# Initialize detector (singleton)
detector: Optional[OptimizedDetector] = None


class DetectionResponse(BaseModel):
    """Detection API response model"""
    image_id: str
    detections: List[Dict[str, Any]] = Field(
        description="List of detected logos with bounding boxes"
    )
    confidence_threshold: float
    processing_time_ms: float
    from_cache: bool = False
    timestamp: str


class BatchDetectionResponse(BaseModel):
    """Batch detection response model"""
    total_images: int
    successful: int
    failed: int
    results: List[DetectionResponse]
    total_processing_time_ms: float
    timestamp: str


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    model_loaded: bool
    cache_connected: bool
    gpu_available: bool
    uptime_seconds: float
    last_detection: Optional[str]
    total_detections: int


# Global stats
stats = {
    'start_time': time.time(),
    'last_detection': None,
    'total_detections': 0,
    'total_errors': 0
}


async def read_image_async(file: UploadFile) -> np.ndarray:
    """Asynchronously read and decode uploaded image"""
    contents = await file.read()

    # Convert bytes to numpy array
    nparr = np.frombuffer(contents, np.uint8)

    # Decode image
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image is None:
        raise ValueError(f"Failed to decode image: {file.filename}")

    return image


def format_detection_result(result: DetectionResult, image_id: str, confidence_threshold: float) -> DetectionResponse:
    """Format detection result for API response"""
    detections = []

    for box, score, class_id, label in zip(result.boxes, result.scores, result.classes, result.labels):
        detections.append({
            'bbox': {
                'x1': float(box[0]),
                'y1': float(box[1]),
                'x2': float(box[2]),
                'y2': float(box[3])
            },
            'confidence': float(score),
            'class_id': int(class_id),
            'label': label
        })

    return DetectionResponse(
        image_id=image_id,
        detections=detections,
        confidence_threshold=confidence_threshold,
        processing_time_ms=result.processing_time_ms,
        from_cache=result.from_cache,
        timestamp=datetime.utcnow().isoformat()
    )


@router.on_event("startup")
async def startup_event():
    """Initialize detector on startup"""
    global detector

    logger.info("Initializing detection service...")

    # Initialize detector with optimized settings
    detector = OptimizedDetector(
        model_path="models/yolov8x.onnx",
        cache_host="localhost",
        cache_port=6379,
        max_batch_size=32,
        cache_ttl=300
    )

    # Wait for initialization
    await asyncio.sleep(2)

    logger.info("Detection service initialized")


@router.post("/detect", response_model=DetectionResponse)
async def detect_single(
    file: UploadFile = File(...),
    confidence_threshold: float = Query(0.5, ge=0.0, le=1.0, description="Confidence threshold for detections")
):
    """
    Detect logos in a single image

    - **file**: Image file (JPEG, PNG, etc.)
    - **confidence_threshold**: Minimum confidence for detections (0.0-1.0)

    Returns detected logos with bounding boxes and confidence scores.
    Performance target: <100ms for single image.
    """
    if not detector:
        raise HTTPException(status_code=503, detail="Detector not initialized")

    try:
        # Read image
        start = time.time()
        image = await read_image_async(file)
        read_time = (time.time() - start) * 1000

        # Detect logos
        result = await detector.detect_single(image)

        # Filter by confidence
        filtered_result = DetectionResult(
            boxes=[b for b, s in zip(result.boxes, result.scores) if s >= confidence_threshold],
            scores=[s for s in result.scores if s >= confidence_threshold],
            classes=[c for c, s in zip(result.classes, result.scores) if s >= confidence_threshold],
            labels=[l for l, s in zip(result.labels, result.scores) if s >= confidence_threshold],
            processing_time_ms=result.processing_time_ms + read_time,
            from_cache=result.from_cache
        )

        # Update stats
        stats['last_detection'] = datetime.utcnow().isoformat()
        stats['total_detections'] += 1

        # Format response
        response = format_detection_result(
            filtered_result,
            file.filename or "unknown",
            confidence_threshold
        )

        logger.info(f"Detection completed in {response.processing_time_ms:.2f}ms (cache: {response.from_cache})")

        return response

    except Exception as e:
        stats['total_errors'] += 1
        logger.error(f"Detection failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/detect/batch", response_model=BatchDetectionResponse)
async def detect_batch(
    files: List[UploadFile] = File(...),
    confidence_threshold: float = Query(0.5, ge=0.0, le=1.0),
    parallel: bool = Query(True, description="Process images in parallel")
):
    """
    Detect logos in multiple images

    - **files**: List of image files
    - **confidence_threshold**: Minimum confidence for detections
    - **parallel**: Process images in parallel for better performance

    Optimized for batch processing with target <200ms per image.
    """
    if not detector:
        raise HTTPException(status_code=503, detail="Detector not initialized")

    if len(files) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 images per batch")

    start_time = time.time()
    results = []
    failed = 0

    try:
        # Read all images in parallel
        if parallel:
            images_data = await asyncio.gather(*[
                read_image_async(file) for file in files
            ], return_exceptions=True)
        else:
            images_data = []
            for file in files:
                try:
                    img = await read_image_async(file)
                    images_data.append(img)
                except Exception as e:
                    images_data.append(e)

        # Separate valid images from errors
        valid_images = []
        valid_files = []

        for img_data, file in zip(images_data, files):
            if isinstance(img_data, Exception):
                failed += 1
                logger.error(f"Failed to read {file.filename}: {img_data}")
            else:
                valid_images.append(img_data)
                valid_files.append(file)

        # Detect in batch
        if valid_images:
            detection_results = await detector.detect_batch(valid_images)

            # Format results
            for result, file in zip(detection_results, valid_files):
                # Filter by confidence
                filtered_result = DetectionResult(
                    boxes=[b for b, s in zip(result.boxes, result.scores) if s >= confidence_threshold],
                    scores=[s for s in result.scores if s >= confidence_threshold],
                    classes=[c for c, s in zip(result.classes, result.scores) if s >= confidence_threshold],
                    labels=[l for l, s in zip(result.labels, result.scores) if s >= confidence_threshold],
                    processing_time_ms=result.processing_time_ms,
                    from_cache=result.from_cache
                )

                response = format_detection_result(
                    filtered_result,
                    file.filename or "unknown",
                    confidence_threshold
                )
                results.append(response)

        # Update stats
        stats['last_detection'] = datetime.utcnow().isoformat()
        stats['total_detections'] += len(valid_images)
        stats['total_errors'] += failed

        total_time = (time.time() - start_time) * 1000

        return BatchDetectionResponse(
            total_images=len(files),
            successful=len(valid_images),
            failed=failed,
            results=results,
            total_processing_time_ms=total_time,
            timestamp=datetime.utcnow().isoformat()
        )

    except Exception as e:
        logger.error(f"Batch detection failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint

    Returns system status including model, cache, and GPU availability.
    """
    if not detector:
        return HealthResponse(
            status="initializing",
            model_loaded=False,
            cache_connected=False,
            gpu_available=False,
            uptime_seconds=time.time() - stats['start_time'],
            last_detection=stats['last_detection'],
            total_detections=stats['total_detections']
        )

    # Get detector health
    health = await detector.health_check()

    return HealthResponse(
        status=health['status'],
        model_loaded=health['model_loaded'],
        cache_connected=health['cache_connected'],
        gpu_available=health['gpu_available'],
        uptime_seconds=time.time() - stats['start_time'],
        last_detection=stats['last_detection'],
        total_detections=stats['total_detections']
    )


@router.get("/metrics")
async def metrics():
    """
    Prometheus metrics endpoint

    Exposes performance metrics for monitoring.
    """
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@router.post("/warmup")
async def warmup(iterations: int = Query(5, ge=1, le=20)):
    """
    Warmup the model with dummy inferences

    - **iterations**: Number of warmup iterations

    Useful for ensuring optimal performance before processing.
    """
    if not detector:
        raise HTTPException(status_code=503, detail="Detector not initialized")

    # Create dummy image
    dummy_image = np.random.randint(0, 255, (640, 640, 3), dtype=np.uint8)

    warmup_times = []
    for i in range(iterations):
        start = time.time()
        await detector.detect_single(dummy_image)
        warmup_times.append((time.time() - start) * 1000)

    return {
        'iterations': iterations,
        'times_ms': warmup_times,
        'avg_time_ms': np.mean(warmup_times),
        'min_time_ms': np.min(warmup_times),
        'max_time_ms': np.max(warmup_times)
    }


@router.delete("/cache/clear")
async def clear_cache():
    """
    Clear the detection cache

    Useful for forcing fresh detections after model updates.
    """
    if not detector or not detector.cache:
        raise HTTPException(status_code=503, detail="Cache not available")

    try:
        # Clear all detection keys
        await detector.cache.flushdb()
        return {"message": "Cache cleared successfully"}
    except Exception as e:
        logger.error(f"Failed to clear cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_stats():
    """
    Get detection statistics

    Returns cumulative statistics since service startup.
    """
    return {
        'uptime_seconds': time.time() - stats['start_time'],
        'total_detections': stats['total_detections'],
        'total_errors': stats['total_errors'],
        'error_rate': stats['total_errors'] / max(stats['total_detections'], 1),
        'last_detection': stats['last_detection'],
        'avg_detections_per_minute': stats['total_detections'] / max((time.time() - stats['start_time']) / 60, 1)
    }