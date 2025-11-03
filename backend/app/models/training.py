"""Training related database models.

US-INT-001: Database Migration Setup
This module defines the training_jobs and model_registry tables with all required fields.
"""

from datetime import datetime
from typing import Any, Dict, Optional
from uuid import uuid4

from sqlalchemy import Column, String, Float, DateTime, JSON, ForeignKey, Integer, Boolean, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.models.base import Base


class TrainingJob(Base):
    """Training job database model with full schema for US-INT-001 and US-INT-003."""
    __tablename__ = "training_jobs"

    # Core fields
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    status = Column(String(50), nullable=False, default="pending", index=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # NEW for US-INT-003: Training configuration fields
    dataset_version_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    augmentation_factor = Column(Integer, nullable=True)
    target_categories = Column(JSONB, nullable=True)  # List of category strings
    accuracy_threshold = Column(Float, nullable=True)
    batch_size = Column(Integer, nullable=True, default=32)

    # Configuration and results
    config = Column(JSONB, nullable=False)
    metrics = Column(JSONB, nullable=True)

    # Progress tracking (NEW for US-INT-001)
    phase_progress = Column(JSONB, nullable=True)
    resources = Column(JSONB, nullable=True)
    current_epoch = Column(Integer, nullable=True)
    total_epochs = Column(Integer, nullable=True, default=50)
    eta_seconds = Column(Integer, nullable=True)  # NEW for US-INT-003

    # Notifications and task management (NEW for US-INT-001)
    notifications = Column(JSONB, nullable=True)
    celery_task_id = Column(String(255), nullable=True, index=True)

    # Error handling and versioning
    error_message = Column(String, nullable=True)
    model_version = Column(String(100), nullable=True)

    # NEW for US-INT-003: Duplicate detection and concurrency control
    checksum = Column(String(64), nullable=True, index=True)  # SHA256 checksum for duplicate detection
    version = Column(Integer, nullable=False, default=1)  # Optimistic locking version

    # User tracking (renamed from user_id for clarity)
    created_by = Column(String(255), nullable=True, index=True)  # User who created the job
    user_id = Column(String, nullable=True)  # Backward compatibility
    dataset_info = Column(JSONB, nullable=True)

    # Indexes for query optimization
    __table_args__ = (
        Index('idx_training_jobs_status_created', 'status', 'created_at'),
        Index('idx_training_jobs_celery_task', 'celery_task_id'),
        Index('idx_training_jobs_checksum', 'checksum'),  # NEW: For duplicate detection
        Index('idx_training_jobs_created_by', 'created_by'),  # NEW: For user filtering
        Index('idx_training_jobs_dataset_version', 'dataset_version_id'),  # NEW: For dataset queries
    )


class ModelRegistry(Base):
    """Model registry database model with corrections for US-INT-001 and US-INT-003."""
    __tablename__ = "model_registry"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    version = Column(String(100), unique=True, nullable=False, index=True)
    training_job_id = Column(UUID(as_uuid=True), ForeignKey("training_jobs.id", ondelete="CASCADE"), nullable=False)
    model_path = Column(String, nullable=False)
    onnx_path = Column(String, nullable=True)
    metrics = Column(JSONB, nullable=True)
    model_metadata = Column(JSONB, nullable=True)  # Renamed to avoid SQLAlchemy reserved word
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    is_active = Column(Boolean, default=False, nullable=False)  # Fixed: was String, now Boolean

    # Relationship with cascade delete
    training_job = relationship("TrainingJob", backref="models")

    # Indexes for query optimization
    __table_args__ = (
        Index('idx_model_registry_version', 'version'),
        Index('idx_model_registry_active', 'is_active'),
        Index('idx_model_registry_training_job', 'training_job_id'),
    )