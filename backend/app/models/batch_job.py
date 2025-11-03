"""
Database models for batch processing jobs.
Tracks job status, progress, and metadata.
"""

from sqlalchemy import Column, String, Integer, Float, DateTime, Text, Enum as SQLEnum, ForeignKey, Boolean, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any

from .base import Base

class BatchStatus(str, Enum):
    """Batch job status enum."""
    PENDING = "pending"
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    PARTIAL = "partial"  # Some images failed
    FAILED = "failed"
    CANCELLED = "cancelled"

class BatchPriority(str, Enum):
    """Batch job priority enum."""
    HIGH = "high"
    NORMAL = "normal"
    LOW = "low"

class BatchJob(Base):
    """
    Model for batch processing jobs.

    Tracks the lifecycle of batch image processing jobs including
    status, progress, performance metrics, and results.
    """
    __tablename__ = "batch_jobs"

    # Primary key and identifiers
    id = Column(String(64), primary_key=True, index=True)
    task_id = Column(String(255), nullable=True, index=True)  # Celery task ID
    user_id = Column(String(64), nullable=False, index=True)

    # Status and progress
    status = Column(SQLEnum(BatchStatus), default=BatchStatus.PENDING, nullable=False, index=True)
    priority = Column(String(10), default="normal", nullable=False, index=True)

    # Image counts
    total_images = Column(Integer, nullable=False)
    processed_images = Column(Integer, default=0, nullable=False)
    failed_images = Column(Integer, default=0, nullable=False)

    # Processing options stored as JSON
    options = Column(JSON, nullable=True)

    # Timing
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)

    # Performance metrics
    processing_time = Column(Float, nullable=True)  # Total time in seconds
    avg_time_per_image = Column(Float, nullable=True)  # Average time per image

    # Results and errors
    result_path = Column(String(500), nullable=True)  # Path to result file if generated
    error_message = Column(Text, nullable=True)  # Error details if failed

    # Notification tracking
    notification_sent = Column(Boolean, default=False)
    notification_email = Column(String(255), nullable=True)
    callback_url = Column(String(500), nullable=True)
    callback_sent = Column(Boolean, default=False)

    # Queue management
    queue_position = Column(Integer, nullable=True)
    retry_count = Column(Integer, default=0)
    parent_job_id = Column(String(64), nullable=True)  # For retry jobs

    def to_dict(self) -> Dict[str, Any]:
        """Convert model to dictionary."""
        return {
            'id': self.id,
            'task_id': self.task_id,
            'user_id': self.user_id,
            'status': self.status.value if self.status else None,
            'priority': self.priority,
            'total_images': self.total_images,
            'processed_images': self.processed_images,
            'failed_images': self.failed_images,
            'options': self.options,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'processing_time': self.processing_time,
            'avg_time_per_image': self.avg_time_per_image,
            'result_path': self.result_path,
            'error_message': self.error_message,
            'notification_sent': self.notification_sent,
            'callback_sent': self.callback_sent,
            'queue_position': self.queue_position,
            'retry_count': self.retry_count,
            'parent_job_id': self.parent_job_id
        }

    @property
    def progress_percentage(self) -> float:
        """Calculate progress percentage."""
        if self.total_images == 0:
            return 0.0
        return (self.processed_images / self.total_images) * 100

    @property
    def success_rate(self) -> float:
        """Calculate success rate."""
        if self.processed_images == 0:
            return 0.0
        successful = self.processed_images - self.failed_images
        return (successful / self.processed_images) * 100

    @property
    def is_complete(self) -> bool:
        """Check if job is complete."""
        return self.status in [BatchStatus.COMPLETED, BatchStatus.PARTIAL, BatchStatus.FAILED, BatchStatus.CANCELLED]

    @property
    def is_active(self) -> bool:
        """Check if job is actively processing."""
        return self.status == BatchStatus.PROCESSING

    @property
    def can_retry(self) -> bool:
        """Check if job can be retried."""
        return self.status in [BatchStatus.FAILED, BatchStatus.PARTIAL]

    @property
    def can_cancel(self) -> bool:
        """Check if job can be cancelled."""
        return self.status in [BatchStatus.PENDING, BatchStatus.QUEUED, BatchStatus.PROCESSING]

    def update_progress(self, processed: int, failed: int = 0):
        """Update job progress."""
        self.processed_images = processed
        self.failed_images = failed
        self.updated_at = datetime.utcnow()

        # Update status based on progress
        if processed >= self.total_images:
            if failed == 0:
                self.status = BatchStatus.COMPLETED
            elif failed < self.total_images:
                self.status = BatchStatus.PARTIAL
            else:
                self.status = BatchStatus.FAILED
            self.completed_at = datetime.utcnow()

            # Calculate performance metrics
            if self.started_at:
                self.processing_time = (self.completed_at - self.started_at).total_seconds()
                if self.processed_images > 0:
                    self.avg_time_per_image = self.processing_time / self.processed_images

    def start_processing(self):
        """Mark job as started."""
        self.status = BatchStatus.PROCESSING
        self.started_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()

    def mark_failed(self, error_message: str):
        """Mark job as failed."""
        self.status = BatchStatus.FAILED
        self.error_message = error_message
        self.completed_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()

    def mark_cancelled(self):
        """Mark job as cancelled."""
        self.status = BatchStatus.CANCELLED
        self.completed_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()

    def __repr__(self):
        return f"<BatchJob(id={self.id}, status={self.status}, progress={self.processed_images}/{self.total_images})>"


class BatchJobResult(Base):
    """
    Model for storing individual image results within a batch job.

    Stores detailed results for each image processed in a batch.
    """
    __tablename__ = "batch_job_results"

    # Primary key
    id = Column(Integer, primary_key=True, autoincrement=True)

    # Foreign key to batch job
    job_id = Column(String(64), ForeignKey("batch_jobs.id"), nullable=False, index=True)

    # Image identification
    image_id = Column(String(255), nullable=False)
    image_filename = Column(String(500), nullable=True)
    image_path = Column(String(1000), nullable=True)

    # Processing status
    status = Column(String(20), nullable=False)  # success, failed, skipped

    # Detection results
    detections = Column(JSON, nullable=True)  # Array of detection objects
    detection_count = Column(Integer, default=0)
    max_confidence = Column(Float, nullable=True)

    # Processing metadata
    processing_time = Column(Float, nullable=True)  # Time in seconds
    model_version = Column(String(50), nullable=True)

    # Error tracking
    error_message = Column(Text, nullable=True)
    error_code = Column(String(50), nullable=True)

    # Timestamps
    processed_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationship
    batch_job = relationship("BatchJob", backref="results")

    def to_dict(self) -> Dict[str, Any]:
        """Convert model to dictionary."""
        return {
            'id': self.id,
            'job_id': self.job_id,
            'image_id': self.image_id,
            'image_filename': self.image_filename,
            'status': self.status,
            'detections': self.detections,
            'detection_count': self.detection_count,
            'max_confidence': self.max_confidence,
            'processing_time': self.processing_time,
            'model_version': self.model_version,
            'error_message': self.error_message,
            'processed_at': self.processed_at.isoformat() if self.processed_at else None
        }


class BatchQueue(Base):
    """
    Model for managing batch job queue.

    Tracks queue positions and priorities for pending jobs.
    """
    __tablename__ = "batch_queue"

    # Primary key
    id = Column(Integer, primary_key=True, autoincrement=True)

    # Job reference
    job_id = Column(String(64), ForeignKey("batch_jobs.id"), unique=True, nullable=False, index=True)

    # Queue management
    priority_level = Column(SQLEnum(BatchPriority), default=BatchPriority.NORMAL, nullable=False, index=True)
    priority_score = Column(Integer, default=5, nullable=False, index=True)  # Numeric priority for sorting
    position = Column(Integer, nullable=False, index=True)

    # User tier for priority adjustment
    user_tier = Column(String(20), default="free", nullable=False)  # free, standard, premium

    # Queue metadata
    added_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    estimated_start = Column(DateTime, nullable=True)

    # Relationship
    batch_job = relationship("BatchJob", backref="queue_entry")

    def to_dict(self) -> Dict[str, Any]:
        """Convert model to dictionary."""
        return {
            'job_id': self.job_id,
            'priority_level': self.priority_level.value if self.priority_level else None,
            'priority_score': self.priority_score,
            'position': self.position,
            'user_tier': self.user_tier,
            'added_at': self.added_at.isoformat() if self.added_at else None,
            'estimated_start': self.estimated_start.isoformat() if self.estimated_start else None
        }