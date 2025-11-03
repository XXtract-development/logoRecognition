"""Data models for batch processing system."""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field
from sqlalchemy import Column, String, Integer, DateTime, JSON, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID

from app.models.base import Base


class BatchStatus(str, Enum):
    """Batch job status enumeration."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ItemStatus(str, Enum):
    """Batch item status enumeration."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"


class ProcessingType(str, Enum):
    """Types of batch processing."""
    DETECTION = "detection"
    TRAINING = "training"
    ANNOTATION = "annotation"
    VALIDATION = "validation"


# SQLAlchemy Models
class BatchJob(Base):
    """Batch job database model."""
    __tablename__ = "batch_jobs"
    __table_args__ = {'extend_existing': True}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    status = Column(SQLEnum(BatchStatus), nullable=False, default=BatchStatus.PENDING)
    total_items = Column(Integer, nullable=False)
    processed_items = Column(Integer, default=0)
    failed_items = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    options = Column(JSON, nullable=True)
    results = Column(JSON, nullable=True)
    processing_type = Column(SQLEnum(ProcessingType), nullable=False)
    priority = Column(Integer, default=0)
    user_id = Column(String, nullable=True)


class BatchItem(Base):
    """Batch item database model."""
    __tablename__ = "batch_items"
    __table_args__ = {'extend_existing': True}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    batch_id = Column(UUID(as_uuid=True), nullable=False)
    image_path = Column(String, nullable=False)
    status = Column(SQLEnum(ItemStatus), nullable=False, default=ItemStatus.PENDING)
    retry_count = Column(Integer, default=0)
    error_message = Column(String, nullable=True)
    result = Column(JSON, nullable=True)
    processed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# Pydantic Models
class BatchJobCreate(BaseModel):
    """Request model for creating batch job."""
    processing_type: ProcessingType
    options: Optional[Dict[str, Any]] = None
    priority: int = Field(default=0, ge=0, le=10)
    images: List[str] = Field(..., min_items=1, max_items=100)


class BatchJobResponse(BaseModel):
    """Response model for batch job."""
    id: str
    status: BatchStatus
    total_items: int
    processed_items: int
    failed_items: int
    progress: float
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    estimated_completion: Optional[datetime] = None
    processing_type: ProcessingType
    priority: int

    class Config:
        from_attributes = True

    @property
    def progress_percentage(self) -> float:
        """Calculate progress percentage."""
        if self.total_items == 0:
            return 0.0
        return (self.processed_items / self.total_items) * 100


class BatchItemResponse(BaseModel):
    """Response model for batch item."""
    id: str
    batch_id: str
    image_path: str
    status: ItemStatus
    retry_count: int
    error_message: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    processed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BatchProgressEvent(BaseModel):
    """WebSocket event for batch progress."""
    event_type: str
    batch_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    data: Dict[str, Any]


class BatchStartedEvent(BatchProgressEvent):
    """Event emitted when batch processing starts."""
    event_type: str = "batch.started"


class ItemProcessingEvent(BatchProgressEvent):
    """Event emitted when item processing starts."""
    event_type: str = "item.processing"
    item_id: str
    item_index: int


class ItemCompletedEvent(BatchProgressEvent):
    """Event emitted when item processing completes."""
    event_type: str = "item.completed"
    item_id: str
    item_index: int
    success: bool
    result: Optional[Dict[str, Any]] = None


class ItemFailedEvent(BatchProgressEvent):
    """Event emitted when item processing fails."""
    event_type: str = "item.failed"
    item_id: str
    item_index: int
    error: str
    retry_count: int
    will_retry: bool


class BatchProgressUpdate(BatchProgressEvent):
    """Event emitted for batch progress updates."""
    event_type: str = "batch.progress"
    progress: float
    processed_items: int
    failed_items: int
    total_items: int
    estimated_completion: Optional[datetime] = None


class BatchCompletedEvent(BatchProgressEvent):
    """Event emitted when batch processing completes."""
    event_type: str = "batch.completed"
    total_processed: int
    total_failed: int
    duration_seconds: float
    results_url: Optional[str] = None


class BatchConfiguration(BaseModel):
    """Configuration for batch processing."""
    max_workers: int = Field(default=10, ge=1, le=50)
    chunk_size: int = Field(default=10, ge=1, le=50)
    max_retries: int = Field(default=3, ge=0, le=5)
    retry_delays: List[int] = Field(default=[10, 30, 60])
    timeout_seconds: int = Field(default=300, ge=30, le=600)
    max_concurrent_batches: int = Field(default=10, ge=1, le=20)
    result_ttl_days: int = Field(default=7, ge=1, le=30)

    # Resource limits
    max_cpu_percent: int = Field(default=80, ge=10, le=100)
    max_memory_mb: int = Field(default=4096, ge=512, le=16384)

    # Queue configuration
    queue_name: str = Field(default="batch_processing")
    priority_queues: bool = Field(default=True)
    dead_letter_queue: str = Field(default="batch_failed")


class BatchMetrics(BaseModel):
    """Metrics for batch processing."""
    batch_id: str
    start_time: datetime
    end_time: Optional[datetime] = None
    total_items: int
    processed_items: int
    failed_items: int
    average_item_time: float
    total_processing_time: float
    success_rate: float
    retry_rate: float

    # Resource metrics
    peak_cpu_usage: float
    peak_memory_usage: float
    average_cpu_usage: float
    average_memory_usage: float


class BatchResultStorage(BaseModel):
    """Storage information for batch results."""
    batch_id: str
    storage_path: str
    bucket_name: str
    expiry_date: datetime
    total_size_bytes: int
    file_count: int

    def get_result_url(self, item_id: str) -> str:
        """Get URL for specific item result."""
        return f"{self.storage_path}/{self.batch_id}/{item_id}/result.json"


class BatchErrorReport(BaseModel):
    """Error report for failed batch items."""
    batch_id: str
    item_id: str
    error_type: str
    error_message: str
    stack_trace: Optional[str] = None
    retry_count: int
    timestamp: datetime

    def is_retryable(self) -> bool:
        """Check if error is retryable."""
        non_retryable_errors = [
            "InvalidFormat",
            "CorruptFile",
            "UnsupportedType",
            "PermissionDenied",
        ]
        return self.error_type not in non_retryable_errors