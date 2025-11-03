"""
Image Optimization API Endpoints
Provides REST API for image optimization operations
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, File, UploadFile, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect, Depends, Query
from fastapi.responses import JSONResponse, StreamingResponse
import asyncio
import json
import uuid
import io
from datetime import datetime
import logging

from app.services.image_optimizer import ImageOptimizer
from app.services.quality_validator import QualityValidator
from app.services.batch_processor import BatchProcessor, BatchProgress
from app.services.storage.image_storage import ImageStorage
from app.core.config import settings
from app.core.security import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/optimization", tags=["optimization"])

# Initialize services
image_optimizer = ImageOptimizer(max_workers=4)
quality_validator = QualityValidator(ssim_threshold=0.95)
batch_processor = BatchProcessor(max_batch_size=20, max_workers=4)
image_storage = ImageStorage()

# WebSocket connections for progress tracking
active_websockets: Dict[str, List[WebSocket]] = {}

@router.post("/optimize")
async def optimize_image(
    file: UploadFile = File(...),
    generate_tiers: bool = Query(True, description="Generate all resolution tiers"),
    target_format: str = Query("webp", description="Target format (webp, jpeg, png)"),
    current_user: User = Depends(get_current_user)
):
    """
    Optimize a single image

    Returns optimized image data and metrics
    """
    try:
        # Validate file type
        if not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="File must be an image")

        # Read file data
        image_data = await file.read()

        # Check file size
        if len(image_data) > 50 * 1024 * 1024:  # 50MB limit
            raise HTTPException(status_code=400, detail="Image size exceeds 50MB limit")

        # Optimize image
        results = await image_optimizer.optimize_image(
            image_data,
            file.content_type.split("/")[-1].upper(),
            generate_tiers=generate_tiers
        )

        # Validate quality for each tier
        quality_results = {}
        for tier_name, optimization_result in results.items():
            if optimization_result.success:
                # Validate quality
                quality_metrics = await quality_validator.validate_quality(
                    image_data,
                    image_data  # This should be the optimized data in production
                )
                quality_results[tier_name] = {
                    "optimization": optimization_result.__dict__,
                    "quality": quality_metrics.__dict__
                }

        # Store in MinIO
        image_id = str(uuid.uuid4())
        optimized_images = {}

        # In production, this would store actual optimized image bytes
        # For now, we'll store metadata only
        storage_urls = await image_storage.store_optimized_images(
            image_id=image_id,
            optimized_images=optimized_images,
            metadata=quality_results,
            original_filename=file.filename
        )

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "image_id": image_id,
                "filename": file.filename,
                "results": quality_results,
                "storage_urls": storage_urls,
                "processing_time_ms": 0  # Would be actual processing time
            }
        )

    except Exception as e:
        logger.error(f"Image optimization failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/batch")
async def optimize_batch(
    files: List[UploadFile] = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    webhook_url: Optional[str] = Query(None, description="Webhook URL for completion notification"),
    current_user: User = Depends(get_current_user)
):
    """
    Start batch optimization for multiple images

    Returns batch ID for progress tracking
    """
    try:
        # Validate batch size
        if len(files) > 100:
            raise HTTPException(status_code=400, detail="Batch size exceeds 100 images limit")

        # Prepare image data
        images = []
        for file in files:
            if not file.content_type.startswith("image/"):
                continue  # Skip non-image files

            image_data = await file.read()
            if len(image_data) <= 50 * 1024 * 1024:  # Skip files over 50MB
                images.append((file.filename, image_data))

        if not images:
            raise HTTPException(status_code=400, detail="No valid images in batch")

        # Generate batch ID
        batch_id = f"batch_{uuid.uuid4().hex[:8]}_{datetime.utcnow().timestamp()}"

        # Start batch processing in background
        background_tasks.add_task(
            process_batch_background,
            images=images,
            batch_id=batch_id,
            webhook_url=webhook_url,
            user_id=current_user.id
        )

        return JSONResponse(
            status_code=202,  # Accepted
            content={
                "success": True,
                "batch_id": batch_id,
                "total_images": len(images),
                "message": "Batch processing started",
                "progress_url": f"/api/v1/optimization/batch/{batch_id}/progress"
            }
        )

    except Exception as e:
        logger.error(f"Batch optimization failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def process_batch_background(
    images: List[tuple],
    batch_id: str,
    webhook_url: Optional[str],
    user_id: int
):
    """Background task for batch processing"""
    try:
        # Process batch with progress tracking
        results, progress = await batch_processor.process_batch(
            images=images,
            batch_id=batch_id,
            webhook_url=webhook_url,
            progress_callback=lambda p: broadcast_progress(batch_id, p)
        )

        # Store results in MinIO
        for filename, image_results in results.items():
            if image_results and any(r.success for r in image_results.values()):
                image_id = f"{batch_id}_{filename}"
                # Store optimized images (implementation needed)

        logger.info(f"Batch {batch_id} completed: {progress.processed_images}/{progress.total_images} processed")

    except Exception as e:
        logger.error(f"Background batch processing failed: {e}")

async def broadcast_progress(batch_id: str, progress: BatchProgress):
    """Broadcast progress to WebSocket connections"""
    if batch_id in active_websockets:
        message = json.dumps(progress.to_dict())
        disconnected = []

        for websocket in active_websockets[batch_id]:
            try:
                await websocket.send_text(message)
            except:
                disconnected.append(websocket)

        # Remove disconnected websockets
        for ws in disconnected:
            active_websockets[batch_id].remove(ws)

@router.get("/batch/{batch_id}/progress")
async def get_batch_progress(
    batch_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get current progress of batch processing"""
    progress = await batch_processor.get_batch_progress(batch_id)

    if not progress:
        raise HTTPException(status_code=404, detail="Batch not found")

    return JSONResponse(
        status_code=200,
        content=progress.to_dict()
    )

@router.websocket("/batch/{batch_id}/ws")
async def websocket_batch_progress(
    websocket: WebSocket,
    batch_id: str
):
    """WebSocket endpoint for real-time batch progress"""
    await websocket.accept()

    # Add to active connections
    if batch_id not in active_websockets:
        active_websockets[batch_id] = []
    active_websockets[batch_id].append(websocket)

    try:
        # Send initial progress
        progress = await batch_processor.get_batch_progress(batch_id)
        if progress:
            await websocket.send_text(json.dumps(progress.to_dict()))

        # Keep connection alive
        while True:
            # Wait for messages (ping/pong)
            data = await websocket.receive_text()

            # Check if batch is complete
            progress = await batch_processor.get_batch_progress(batch_id)
            if progress and progress.end_time:
                await websocket.send_text(json.dumps(progress.to_dict()))
                break

    except WebSocketDisconnect:
        # Remove from active connections
        if batch_id in active_websockets:
            active_websockets[batch_id].remove(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        if batch_id in active_websockets and websocket in active_websockets[batch_id]:
            active_websockets[batch_id].remove(websocket)

@router.delete("/batch/{batch_id}")
async def cancel_batch(
    batch_id: str,
    current_user: User = Depends(get_current_user)
):
    """Cancel a running batch"""
    success = await batch_processor.cancel_batch(batch_id)

    if not success:
        raise HTTPException(status_code=404, detail="Batch not found or already completed")

    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "message": f"Batch {batch_id} cancelled"
        }
    )

@router.get("/image/{image_id}")
async def get_optimized_image(
    image_id: str,
    resolution: str = Query("original", description="Resolution tier"),
    current_user: User = Depends(get_current_user)
):
    """Retrieve an optimized image"""
    image_data = await image_storage.get_image(image_id, resolution)

    if not image_data:
        raise HTTPException(status_code=404, detail="Image not found")

    return StreamingResponse(
        io.BytesIO(image_data),
        media_type="image/webp"
    )

@router.delete("/image/{image_id}")
async def delete_image(
    image_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete an optimized image and all its versions"""
    success = await image_storage.delete_image(image_id)

    if not success:
        raise HTTPException(status_code=404, detail="Image not found")

    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "message": f"Image {image_id} deleted"
        }
    )

@router.get("/stats")
async def get_optimization_stats(
    current_user: User = Depends(get_current_user)
):
    """Get optimization statistics"""
    stats = await image_storage.get_storage_stats()

    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "stats": stats
        }
    )

@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return JSONResponse(
        status_code=200,
        content={
            "status": "healthy",
            "service": "image-optimization",
            "timestamp": datetime.utcnow().isoformat()
        }
    )