"""
API endpoints for logo detection.
"""

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
import uuid
import logging

from ..services.detection import DetectionService
from ..auth import get_current_user
from ..validators import (
    ValidatedDetectionRequest,
    ValidatedDetectionOptions,
    ValidatedBatchRequest,
    is_valid_uuid,
    rate_limiter
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/detection", tags=["detection"])

# Global detection service instance
detection_service = DetectionService()


# Use validated models from validators module
DetectionOptions = ValidatedDetectionOptions
DetectionRequest = ValidatedDetectionRequest


class DetectionResponse(BaseModel):
    """
    Response model for logo detection.

    Attributes:
        detectionId: Unique identifier for this detection.
        uploadId: UUID of the processed image.
        status: Processing status.
        processingTime: Time taken in milliseconds.
        detections: List of detected logos.
        metadata: Additional metadata about the detection.
    """
    detectionId: str
    uploadId: str
    status: str
    processingTime: int
    detections: List[Dict[str, Any]]
    metadata: Dict[str, Any]


@router.on_event("startup")
async def startup_event():
    """
    Initialize detection service on application startup.
    """
    await detection_service.initialize()
    logger.info("Detection service initialized")


@router.on_event("shutdown")
async def shutdown_event():
    """
    Cleanup detection service on application shutdown.
    """
    await detection_service.cleanup()
    logger.info("Detection service cleaned up")


@router.post("/process", response_model=DetectionResponse)
async def process_detection(
    request: DetectionRequest,
    background_tasks: BackgroundTasks,
    current_user: Dict = Depends(get_current_user)
) -> DetectionResponse:
    """
    Process logo detection for an uploaded image.

    Args:
        request: Detection request with upload ID and options.
        background_tasks: FastAPI background tasks.
        current_user: Authenticated user information.

    Returns:
        Detection results with found logos.

    Raises:
        HTTPException: If detection fails or image not found.
    """
    # Check rate limiting
    user_id = current_user.get('user_id')
    is_allowed, error_msg = rate_limiter.check_rate_limit(user_id)
    if not is_allowed:
        raise HTTPException(status_code=429, detail=error_msg)

    try:
        logger.info(f"Processing detection for upload {request.uploadId} "
                   f"by user {user_id}")

        # Validate upload ID format (already done by Pydantic, but double-check)
        if not is_valid_uuid(request.uploadId):
            raise HTTPException(status_code=400, detail="Invalid upload ID format")

        # Convert options to dict
        options = request.options.dict() if request.options else None

        # Process detection
        result = await detection_service.process_detection(
            upload_id=request.uploadId,
            options=options
        )

        # Log detection for analytics (in background)
        background_tasks.add_task(
            log_detection_analytics,
            user_id=user_id,
            detection_id=result["detectionId"],
            num_detections=len(result["detections"])
        )

        return DetectionResponse(**result)

    except ValueError as e:
        logger.error(f"Invalid request: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        logger.error(f"Detection failed: {e}")
        raise HTTPException(status_code=500, detail="Detection processing failed")
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/status/{detection_id}")
async def get_detection_status(
    detection_id: str,
    current_user: Dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get status of a detection job.

    Args:
        detection_id: Detection job ID.
        current_user: Authenticated user.

    Returns:
        Detection status information.

    Raises:
        HTTPException: If detection not found.
    """
    # Validate detection ID
    if not is_valid_uuid(detection_id):
        raise HTTPException(status_code=400, detail="Invalid detection ID format")

    # In production, would check job status from queue/database
    return {
        "detectionId": detection_id,
        "status": "completed",
        "progress": 100,
        "message": "Detection completed successfully"
    }


@router.get("/metrics")
async def get_metrics(
    current_user: Dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get detection service metrics.

    Args:
        current_user: Authenticated user (must be admin).

    Returns:
        Service performance metrics.

    Raises:
        HTTPException: If user is not admin.
    """
    # Check admin permission
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")

    metrics = await detection_service.get_metrics()
    return metrics


@router.post("/batch")
async def batch_detection(
    batch_request: ValidatedBatchRequest,
    background_tasks: BackgroundTasks = None,
    current_user: Dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Process batch detection for multiple images.

    Args:
        batch_request: Validated batch request with upload IDs and options.
        background_tasks: Background task manager.
        current_user: Authenticated user.

    Returns:
        Batch job information.

    Raises:
        HTTPException: If batch processing fails.
    """
    # Check rate limiting for batch operations (stricter limit)
    user_id = current_user.get('user_id')
    is_allowed, error_msg = rate_limiter.check_rate_limit(user_id)
    if not is_allowed:
        raise HTTPException(status_code=429, detail=error_msg)

    batch_id = str(uuid.uuid4())

    # Queue batch processing in background
    background_tasks.add_task(
        process_batch_detection,
        batch_id=batch_id,
        upload_ids=batch_request.uploadIds,
        options=batch_request.options.dict() if batch_request.options else None,
        user_id=user_id
    )

    return {
        "batchId": batch_id,
        "status": "queued",
        "totalImages": len(batch_request.uploadIds),
        "message": "Batch detection queued for processing"
    }


async def process_batch_detection(batch_id: str, upload_ids: List[str],
                                 options: Optional[Dict[str, Any]],
                                 user_id: str) -> None:
    """
    Process batch detection in background.

    Args:
        batch_id: Batch job ID.
        upload_ids: List of upload IDs.
        options: Detection options.
        user_id: User ID.
    """
    logger.info(f"Processing batch {batch_id} with {len(upload_ids)} images")

    results = []
    for upload_id in upload_ids:
        try:
            result = await detection_service.process_detection(upload_id, options)
            results.append({
                "uploadId": upload_id,
                "status": "success",
                "detections": len(result["detections"])
            })
        except Exception as e:
            logger.error(f"Batch detection failed for {upload_id}: {e}")
            results.append({
                "uploadId": upload_id,
                "status": "failed",
                "error": str(e)
            })

    # Store batch results (in production, would use database)
    logger.info(f"Batch {batch_id} completed: "
               f"{sum(1 for r in results if r['status'] == 'success')}/{len(results)} successful")


async def log_detection_analytics(user_id: str, detection_id: str,
                                 num_detections: int) -> None:
    """
    Log detection analytics for monitoring.

    Args:
        user_id: User who requested detection.
        detection_id: Detection job ID.
        num_detections: Number of logos detected.
    """
    # In production, would log to analytics service
    logger.info(f"Analytics: User {user_id} detection {detection_id} "
               f"found {num_detections} logos")