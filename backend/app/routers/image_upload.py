"""
Image Upload Router for Logo Recognition System
Handles multipart file uploads with validation, optimization, and storage
"""

import os
import uuid
import hashlib
import json
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any

from fastapi import APIRouter, File, UploadFile, Form, Header, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import aiofiles
from PIL import Image
import magic

router = APIRouter(prefix="/api/v1/images", tags=["images"])

# Configuration
UPLOAD_DIR = Path("uploads/temp")
PROCESSED_DIR = Path("uploads/processed")
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
MIN_IMAGE_DIMENSIONS = (100, 100)
MAX_IMAGE_DIMENSIONS = (10000, 10000)
ACCEPTED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/svg+xml",
    "image/bmp",
    "image/gif"
}

# Ensure directories exist
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)


class ImageMetadata(BaseModel):
    """Metadata for uploaded image"""
    originalName: str
    mimeType: str
    fileSize: int
    dimensions: Dict[str, int]
    clientTimestamp: str
    uploadMethod: str


class UploadResponse(BaseModel):
    """Response model for successful upload"""
    uploadId: str
    status: str = "success"
    processingUrl: str
    imageUrl: str
    metadata: Dict[str, Any]
    nextSteps: Dict[str, Any]


def generate_upload_id() -> str:
    """Generate unique upload ID"""
    return str(uuid.uuid4())


def get_file_hash(content: bytes) -> str:
    """Generate SHA256 hash of file content"""
    return hashlib.sha256(content).hexdigest()


async def validate_image_file(
    file_content: bytes,
    filename: str,
    content_type: str
) -> Dict[str, Any]:
    """
    Validate uploaded image file
    Returns validation result with error details if invalid
    """
    # Check file size
    file_size = len(file_content)
    if file_size > MAX_FILE_SIZE:
        return {
            "valid": False,
            "error": f"File size ({file_size / 1024 / 1024:.2f}MB) exceeds maximum allowed size of 10MB"
        }

    # Verify MIME type using python-magic
    try:
        mime = magic.from_buffer(file_content, mime=True)
        if mime not in ACCEPTED_MIME_TYPES:
            return {
                "valid": False,
                "error": f"Invalid file format. Detected: {mime}. Accepted formats: JPEG, PNG, WebP, SVG, BMP, GIF"
            }
    except Exception as e:
        return {
            "valid": False,
            "error": f"Failed to detect file type: {str(e)}"
        }

    # Validate image dimensions (except for SVG)
    if mime != "image/svg+xml":
        try:
            import io
            from PIL import Image

            img = Image.open(io.BytesIO(file_content))
            width, height = img.size

            if width < MIN_IMAGE_DIMENSIONS[0] or height < MIN_IMAGE_DIMENSIONS[1]:
                return {
                    "valid": False,
                    "error": f"Image dimensions ({width}x{height}) are below minimum required ({MIN_IMAGE_DIMENSIONS[0]}x{MIN_IMAGE_DIMENSIONS[1]})"
                }

            if width > MAX_IMAGE_DIMENSIONS[0] or height > MAX_IMAGE_DIMENSIONS[1]:
                return {
                    "valid": False,
                    "error": f"Image dimensions ({width}x{height}) exceed maximum allowed ({MAX_IMAGE_DIMENSIONS[0]}x{MAX_IMAGE_DIMENSIONS[1]})"
                }

            return {
                "valid": True,
                "mime_type": mime,
                "dimensions": {"width": width, "height": height},
                "format": img.format.lower() if img.format else "unknown"
            }
        except Exception as e:
            return {
                "valid": False,
                "error": f"Failed to process image: {str(e)}"
            }

    return {
        "valid": True,
        "mime_type": mime,
        "dimensions": {"width": 0, "height": 0},  # SVG dimensions not determined
        "format": "svg"
    }


async def optimize_image(
    file_path: Path,
    file_size: int
) -> Dict[str, Any]:
    """
    Optimize image if between 5MB and 10MB
    Returns optimization result
    """
    if file_size < 5 * 1024 * 1024 or file_size > MAX_FILE_SIZE:
        return {"optimized": False}

    try:
        # Use context manager for better memory management
        with Image.open(file_path) as img:
            # Calculate new dimensions while maintaining aspect ratio
            max_dimension = 2048
            width, height = img.size

            if width > max_dimension or height > max_dimension:
                if width > height:
                    new_width = max_dimension
                    new_height = int((max_dimension / width) * height)
                else:
                    new_height = max_dimension
                    new_width = int((max_dimension / height) * width)

                img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

            # Save optimized image
            optimized_path = file_path.parent / f"optimized_{file_path.name}"
            img.save(optimized_path, quality=85, optimize=True)

            # Replace original with optimized if smaller
            optimized_size = optimized_path.stat().st_size
            if optimized_size < file_size:
                os.replace(optimized_path, file_path)
                return {
                    "optimized": True,
                    "original_size": file_size,
                    "optimized_size": optimized_size,
                    "reduction": f"{((file_size - optimized_size) / file_size * 100):.1f}%"
                }
            else:
                optimized_path.unlink()
                return {"optimized": False}

    except Exception as e:
        return {"optimized": False, "error": str(e)}


async def trigger_processing(
    upload_id: str,
    file_path: Path,
    metadata: Dict[str, Any]
):
    """
    Background task to trigger logo detection processing
    """
    # In a real implementation, this would:
    # 1. Send message to processing queue
    # 2. Update database with processing status
    # 3. Trigger ML model inference

    # For now, just log the processing request
    processing_request = {
        "upload_id": upload_id,
        "file_path": str(file_path),
        "timestamp": datetime.utcnow().isoformat(),
        "metadata": metadata
    }

    # TODO: Integrate with actual processing pipeline
    print(f"Processing triggered for upload {upload_id}")


@router.post("/upload", response_model=UploadResponse)
async def upload_image(
    background_tasks: BackgroundTasks,
    image: UploadFile = File(...),
    metadata: Optional[str] = Form(None),
    x_client_version: Optional[str] = Header(None),
    x_upload_source: Optional[str] = Header(None)
):
    """
    Upload an image for logo detection

    - **image**: The image file to upload
    - **metadata**: JSON string containing image metadata
    - **x_client_version**: Client application version
    - **x_upload_source**: Upload method (drag-drop, button, paste, camera, url)
    """

    # Generate upload ID
    upload_id = generate_upload_id()

    try:
        # Read file content in chunks to optimize memory usage
        chunk_size = 8192  # 8KB chunks
        file_chunks = []
        total_size = 0

        while True:
            chunk = await image.read(chunk_size)
            if not chunk:
                break
            file_chunks.append(chunk)
            total_size += len(chunk)

            # Check file size limit during reading
            if total_size > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"File size exceeds maximum allowed size of 10MB"
                )

        # Combine chunks efficiently
        file_content = b''.join(file_chunks)
        del file_chunks  # Free memory immediately

        # Validate file
        validation_result = await validate_image_file(
            file_content,
            image.filename or "unknown",
            image.content_type or "application/octet-stream"
        )

        if not validation_result["valid"]:
            raise HTTPException(
                status_code=400,
                detail=validation_result["error"]
            )

        # Parse metadata if provided
        parsed_metadata = {}
        if metadata:
            try:
                parsed_metadata = json.loads(metadata)
            except json.JSONDecodeError:
                pass  # Ignore invalid metadata

        # Generate file hash for deduplication
        file_hash = get_file_hash(file_content)

        # Determine file extension
        extension = Path(image.filename or "").suffix or ".jpg"
        if not extension.startswith("."):
            extension = f".{extension}"

        # Save file to temporary storage
        temp_filename = f"{upload_id}_{file_hash[:8]}{extension}"
        temp_path = UPLOAD_DIR / temp_filename

        async with aiofiles.open(temp_path, 'wb') as f:
            await f.write(file_content)

        # Optimize if needed
        optimization_result = await optimize_image(temp_path, len(file_content))

        # Move to processed directory
        processed_path = PROCESSED_DIR / temp_filename
        os.rename(temp_path, processed_path)

        # Prepare response metadata
        response_metadata = {
            "receivedAt": datetime.utcnow().isoformat(),
            "fileSize": len(file_content),
            "optimized": optimization_result.get("optimized", False),
            "format": validation_result.get("format", "unknown"),
            "dimensions": validation_result.get("dimensions", {}),
            "hash": file_hash[:16],  # Partial hash for reference
            "clientVersion": x_client_version or "unknown",
            "uploadSource": x_upload_source or parsed_metadata.get("uploadMethod", "unknown")
        }

        if optimization_result.get("optimized"):
            response_metadata["optimization"] = {
                "originalSize": optimization_result["original_size"],
                "optimizedSize": optimization_result["optimized_size"],
                "reduction": optimization_result["reduction"]
            }

        # Trigger background processing
        background_tasks.add_task(
            trigger_processing,
            upload_id,
            processed_path,
            response_metadata
        )

        # Prepare response
        response = UploadResponse(
            uploadId=upload_id,
            status="success",
            processingUrl=f"/api/v1/processing/{upload_id}",
            imageUrl=f"/api/v1/images/{upload_id}",
            metadata=response_metadata,
            nextSteps={
                "detectionEndpoint": f"/api/v1/detect/{upload_id}",
                "estimatedProcessingTime": 3000  # milliseconds
            }
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        # Clean up on error
        if 'temp_path' in locals() and temp_path.exists():
            temp_path.unlink()

        raise HTTPException(
            status_code=500,
            detail=f"Internal server error during upload: {str(e)}"
        )


@router.get("/{upload_id}")
async def get_uploaded_image(upload_id: str):
    """
    Retrieve uploaded image by ID
    """
    # Find image in processed directory
    for file_path in PROCESSED_DIR.glob(f"{upload_id}_*"):
        if file_path.is_file():
            from fastapi.responses import FileResponse
            return FileResponse(
                file_path,
                media_type="image/jpeg",  # Should be dynamic based on file
                headers={
                    "Cache-Control": "public, max-age=31536000",
                    "X-Upload-Id": upload_id
                }
            )

    raise HTTPException(
        status_code=404,
        detail=f"Image with upload ID {upload_id} not found"
    )


@router.get("/status/{upload_id}")
async def get_upload_status(upload_id: str):
    """
    Get processing status for uploaded image
    """
    # In a real implementation, this would check database/queue
    # For now, return a mock status

    return {
        "uploadId": upload_id,
        "status": "processing",  # processing, completed, failed
        "progress": 50,
        "message": "Detecting logos in image...",
        "updatedAt": datetime.utcnow().isoformat()
    }


@router.delete("/{upload_id}")
async def delete_uploaded_image(upload_id: str):
    """
    Delete an uploaded image
    """
    deleted = False

    # Check both directories
    for directory in [UPLOAD_DIR, PROCESSED_DIR]:
        for file_path in directory.glob(f"{upload_id}_*"):
            if file_path.is_file():
                file_path.unlink()
                deleted = True

    if deleted:
        return {"message": f"Image {upload_id} deleted successfully"}
    else:
        raise HTTPException(
            status_code=404,
            detail=f"Image with upload ID {upload_id} not found"
        )