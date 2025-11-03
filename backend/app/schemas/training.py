"""
Pydantic schemas for training API endpoints.
US-INT-002: Production-ready request/response models.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import UUID

from pydantic import BaseModel, Field, validator, root_validator


class NotificationSettings(BaseModel):
    """Notification settings for training completion."""
    email: Optional[str] = Field(None, description="Email address for notifications")
    slack_webhook: Optional[str] = Field(None, description="Slack webhook URL")
    callback_url: Optional[str] = Field(None, description="Callback URL for status updates")

    @validator('email')
    def validate_email(cls, v):
        """Validate email format."""
        if v and '@' not in v:
            raise ValueError("Invalid email format")
        return v


class TrainingJobCreate(BaseModel):
    """
    Schema for creating a training job.

    US-INT-002 AC1: Matches story requirements exactly.
    """
    dataset_version_id: UUID = Field(..., description="Dataset version UUID")
    model_name: str = Field(..., min_length=1, max_length=100, description="Model name")
    augmentation_factor: int = Field(50, ge=10, le=500, description="Data augmentation multiplier")
    target_categories: List[str] = Field(..., min_items=1, description="Target category list")
    accuracy_threshold: float = Field(0.85, ge=0.5, le=1.0, description="Minimum accuracy for deployment")
    batch_size: Optional[int] = Field(32, ge=8, le=128, description="Training batch size")
    total_epochs: Optional[int] = Field(50, ge=10, le=200, description="Total training epochs")
    notifications: Optional[NotificationSettings] = Field(None, description="Notification preferences")
    user_id: str = Field(..., min_length=1, description="User ID creating the job")

    @validator('target_categories')
    def validate_categories(cls, v):
        """Ensure categories follow format: category.value"""
        for cat in v:
            if '.' not in cat:
                raise ValueError(f"Invalid category format: {cat}. Must be 'category.value'")
        return v

    class Config:
        schema_extra = {
            "example": {
                "dataset_version_id": "123e4567-e89b-12d3-a456-426614174000",
                "model_name": "Logo Detector v2.0",
                "augmentation_factor": 50,
                "target_categories": ["brand.nike", "brand.adidas", "brand.puma"],
                "accuracy_threshold": 0.85,
                "batch_size": 32,
                "total_epochs": 50,
                "notifications": {
                    "email": "user@example.com",
                    "slack_webhook": "https://hooks.slack.com/..."
                },
                "user_id": "user123"
            }
        }


class ProgressInfo(BaseModel):
    """Training progress information."""
    percentage: float = Field(..., ge=0, le=100, description="Overall progress percentage")
    current_epoch: Optional[int] = Field(None, description="Current training epoch")
    total_epochs: Optional[int] = Field(None, description="Total epochs")
    phase_progress: Optional[Dict[str, int]] = Field(None, description="Progress by phase")
    eta: Optional[str] = Field(None, description="Estimated time remaining")


class TrainingJobResponse(BaseModel):
    """
    Schema for training job response.

    US-INT-002 AC2: Includes real-time progress and ETA.
    """
    job_id: UUID
    status: str
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    progress: Optional[ProgressInfo] = None
    resources: Optional[Dict[str, Any]] = None
    metrics: Optional[Dict[str, float]] = None
    error_message: Optional[str] = None
    celery_task_id: Optional[str] = None

    class Config:
        from_attributes = True


class TrainingJobListResponse(BaseModel):
    """
    Schema for paginated training job list.

    US-INT-002 AC3: Pagination with filtering support.
    """
    total: int
    limit: int
    offset: int
    jobs: List[Dict[str, Any]]


class TrainingJobUpdate(BaseModel):
    """Schema for updating training job progress."""
    status: Optional[str] = None
    current_epoch: Optional[int] = None
    phase_progress: Optional[Dict[str, int]] = None
    eta_seconds: Optional[int] = None
    resources: Optional[Dict[str, Any]] = None
    metrics: Optional[Dict[str, float]] = None


class ModelRegistryResponse(BaseModel):
    """
    Schema for model registry response.

    US-INT-002 AC5: Model registry listing.
    """
    model_id: UUID
    version: str
    training_job_id: UUID
    model_path: str
    onnx_path: Optional[str] = None
    is_active: bool
    metrics: Optional[Dict[str, float]] = None
    created_at: datetime

    class Config:
        from_attributes = True
