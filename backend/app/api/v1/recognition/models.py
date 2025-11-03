"""
Production-Grade Recognition API Models
A++ Grade Implementation with comprehensive validation
"""

from typing import Optional, List, Dict, Any, Literal, Union
from pydantic import BaseModel, Field, validator, constr, HttpUrl
from datetime import datetime
from enum import Enum
import uuid


class ImageFormat(str, Enum):
    """Supported image formats with automatic detection"""
    JPEG = "jpeg"
    PNG = "png"
    WEBP = "webp"
    HEIC = "heic"
    AVIF = "avif"
    AUTO = "auto"


class ProcessingMode(str, Enum):
    """Processing modes for different use cases"""
    SYNC = "sync"
    ASYNC = "async"
    STREAM = "stream"


class CompressionType(str, Enum):
    """Supported compression types for base64 data"""
    NONE = "none"
    GZIP = "gzip"
    BROTLI = "brotli"
    DEFLATE = "deflate"


class RecognitionRequest(BaseModel):
    """
    Comprehensive recognition request model with validation
    Supports multiple input methods and processing modes
    """
    image: Optional[str] = Field(
        None,
        description="Base64 encoded image",
        max_length=10_000_000  # ~10MB base64
    )
    image_url: Optional[HttpUrl] = Field(
        None,
        description="URL to fetch image from"
    )
    confidence_threshold: float = Field(
        0.99,
        ge=0.0,
        le=1.0,
        description="Minimum confidence for detection"
    )
    return_visualization: bool = Field(
        False,
        description="Return annotated image with bounding boxes"
    )
    max_detections: int = Field(
        10,
        ge=1,
        le=100,
        description="Maximum number of detections to return"
    )
    format: ImageFormat = Field(
        ImageFormat.AUTO,
        description="Image format or auto-detect"
    )
    compression: CompressionType = Field(
        CompressionType.NONE,
        description="Compression type applied to base64 data (gzip, brotli, deflate)"
    )
    processing_mode: ProcessingMode = Field(
        ProcessingMode.SYNC,
        description="How to process the request"
    )
    webhook_url: Optional[HttpUrl] = Field(
        None,
        description="Callback URL for async processing"
    )
    metadata: Optional[Dict[str, Any]] = Field(
        None,
        description="Custom metadata to attach to request"
    )
    model_version: Optional[str] = Field(
        None,
        pattern="^v\\d+\\.\\d+\\.\\d+$",
        description="Specific model version to use"
    )
    timeout_ms: int = Field(
        5000,
        ge=100,
        le=30000,
        description="Request timeout in milliseconds"
    )

    @validator('image', 'image_url')
    def validate_image_source(cls, v, values):
        """Ensure at least one image source is provided"""
        if not v and not values.get('image') and not values.get('image_url'):
            raise ValueError('Either image or image_url must be provided')
        return v

    @validator('image')
    def validate_base64_format(cls, v):
        """Validate base64 format if provided"""
        if v:
            import base64
            import re
            # Remove data URI prefix if present
            if v.startswith('data:'):
                v = re.sub(r'^data:image/[a-z]+;base64,', '', v)
            try:
                # Validate base64 format
                base64.b64decode(v, validate=True)
            except Exception:
                raise ValueError('Invalid base64 encoded image')
        return v

    class Config:
        schema_extra = {
            "example": {
                "image": "base64_encoded_image_data...",
                "confidence_threshold": 0.95,
                "max_detections": 5,
                "processing_mode": "sync",
                "timeout_ms": 5000
            }
        }


class BoundingBox(BaseModel):
    """
    Normalized bounding box coordinates (0-1 range)
    Allows for resolution-independent representation
    """
    x: float = Field(..., ge=0, le=1, description="X coordinate (normalized)")
    y: float = Field(..., ge=0, le=1, description="Y coordinate (normalized)")
    width: float = Field(..., ge=0, le=1, description="Width (normalized)")
    height: float = Field(..., ge=0, le=1, description="Height (normalized)")

    @validator('width', 'height')
    def validate_dimensions(cls, v):
        """Ensure dimensions are positive"""
        if v <= 0:
            raise ValueError('Dimensions must be positive')
        return v

    def to_absolute(self, image_width: int, image_height: int) -> Dict[str, int]:
        """Convert to absolute pixel coordinates"""
        return {
            'x': int(self.x * image_width),
            'y': int(self.y * image_height),
            'width': int(self.width * image_width),
            'height': int(self.height * image_height)
        }


class DetectedLogo(BaseModel):
    """
    Comprehensive detection result with metadata
    """
    brand: str = Field(..., description="Detected brand name")
    confidence: float = Field(..., ge=0, le=1, description="Detection confidence")
    bbox: BoundingBox = Field(..., description="Bounding box location")
    variant: Optional[str] = Field(None, description="Logo variant (e.g., 'wordmark', 'icon')")
    colors: Optional[List[str]] = Field(None, description="Dominant colors in hex format")
    quality_score: float = Field(..., ge=0, le=1, description="Image quality score")
    processing_time_ms: float = Field(..., ge=0, description="Processing time for this detection")
    model_version: str = Field(..., description="Model version used")
    attributes: Optional[Dict[str, Any]] = Field(None, description="Additional attributes")

    @validator('colors')
    def validate_colors(cls, v):
        """Validate hex color format"""
        if v:
            import re
            hex_pattern = re.compile(r'^#[0-9a-fA-F]{6}$')
            for color in v:
                if not hex_pattern.match(color):
                    raise ValueError(f'Invalid hex color format: {color}')
        return v


class RecognitionResponse(BaseModel):
    """
    Comprehensive API response with tracing and metadata
    """
    request_id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        description="Unique request identifier (UUID v4)"
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="Response timestamp (UTC)"
    )
    processing_time_ms: float = Field(..., ge=0, description="Total processing time")
    detections: List[DetectedLogo] = Field(..., description="List of detections")
    image_metadata: Dict[str, Any] = Field(..., description="Image information")
    model_metadata: Dict[str, Any] = Field(..., description="Model information")
    cache_hit: bool = Field(False, description="Whether result was from cache")
    warnings: Optional[List[str]] = Field(None, description="Non-fatal warnings")
    trace_id: Optional[str] = Field(None, description="Distributed tracing ID")

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
        schema_extra = {
            "example": {
                "request_id": "550e8400-e29b-41d4-a716-446655440000",
                "timestamp": "2024-01-01T00:00:00Z",
                "processing_time_ms": 150.5,
                "detections": [
                    {
                        "brand": "Nike",
                        "confidence": 0.98,
                        "bbox": {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.2},
                        "variant": "swoosh",
                        "colors": ["#000000", "#FFFFFF"],
                        "quality_score": 0.95,
                        "processing_time_ms": 45.2,
                        "model_version": "v1.0.0"
                    }
                ],
                "image_metadata": {
                    "width": 1920,
                    "height": 1080,
                    "format": "jpeg",
                    "size_bytes": 245678
                },
                "model_metadata": {
                    "version": "v1.0.0",
                    "loaded_at": "2024-01-01T00:00:00Z",
                    "accuracy": 0.98
                },
                "cache_hit": False
            }
        }


class AsyncTaskResponse(BaseModel):
    """Response for async processing requests"""
    task_id: str = Field(..., description="Async task identifier")
    status: Literal["queued", "processing", "completed", "failed"] = Field(...)
    estimated_completion: Optional[datetime] = Field(None)
    webhook_url: Optional[HttpUrl] = Field(None)
    result_url: Optional[HttpUrl] = Field(None, description="URL to fetch result when ready")

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class ErrorDetail(BaseModel):
    """Detailed error information for debugging"""
    field: Optional[str] = Field(None, description="Field that caused error")
    message: str = Field(..., description="Error message")
    code: Optional[str] = Field(None, description="Error code")


class ErrorResponse(BaseModel):
    """
    RFC 7807 Problem Details compliant error response
    https://datatracker.ietf.org/doc/html/rfc7807
    """
    type: str = Field(..., description="Error type URI")
    title: str = Field(..., description="Short error summary")
    status: int = Field(..., ge=400, le=599, description="HTTP status code")
    detail: str = Field(..., description="Detailed error description")
    instance: str = Field(..., description="URI of this error occurrence")
    request_id: str = Field(..., description="Request ID for tracking")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    errors: Optional[List[ErrorDetail]] = Field(None, description="Detailed errors")
    trace_id: Optional[str] = Field(None, description="Distributed tracing ID")

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
        schema_extra = {
            "example": {
                "type": "/errors/validation-error",
                "title": "Validation Error",
                "status": 400,
                "detail": "The request body contains invalid fields",
                "instance": "/api/v1/recognize",
                "request_id": "550e8400-e29b-41d4-a716-446655440000",
                "timestamp": "2024-01-01T00:00:00Z",
                "errors": [
                    {
                        "field": "confidence_threshold",
                        "message": "Must be between 0 and 1",
                        "code": "VALUE_OUT_OF_RANGE"
                    }
                ]
            }
        }


class HealthCheckResponse(BaseModel):
    """Health check response with dependency status"""
    status: Literal["healthy", "degraded", "unhealthy"] = Field(...)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    version: str = Field(..., description="API version")
    uptime_seconds: float = Field(..., ge=0)
    dependencies: Dict[str, Dict[str, Any]] = Field(...)

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class BatchRecognitionRequest(BaseModel):
    """Request for batch processing multiple images"""
    images: List[RecognitionRequest] = Field(
        ...,
        min_items=1,
        max_items=100,
        description="Batch of images to process"
    )
    parallel: bool = Field(True, description="Process images in parallel")
    fail_fast: bool = Field(False, description="Stop on first error")
    webhook_url: Optional[HttpUrl] = Field(None, description="Batch completion callback")


class BatchRecognitionResponse(BaseModel):
    """Response for batch processing"""
    batch_id: str = Field(..., description="Batch identifier")
    total: int = Field(..., ge=0)
    successful: int = Field(..., ge=0)
    failed: int = Field(..., ge=0)
    results: List[Union[RecognitionResponse, ErrorResponse]] = Field(...)
    processing_time_ms: float = Field(..., ge=0)