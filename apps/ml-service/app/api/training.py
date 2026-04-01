"""
Training API endpoints.
Real implementation using PyTorch training pipeline.
"""

from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field

from app.core.logging import logger
from app.services.trainer import trainer_service, TrainingConfig as TrainerConfig
from app.services.database import db_service


router = APIRouter()


class TrainingConfig(BaseModel):
    """Training configuration."""
    batch_size: int = Field(16, ge=1, le=128)
    epochs: int = Field(100, ge=1, le=1000)
    learning_rate: float = Field(0.001, gt=0, lt=1)
    augmentation_factor: int = Field(50, ge=1, le=100)
    validation_split: float = Field(0.2, ge=0.1, le=0.5)
    early_stopping_patience: int = Field(10, ge=1, le=50)


class TrainingRequest(BaseModel):
    """Training job request."""
    batch_id: str = Field(..., description="Training batch ID")
    config: Optional[TrainingConfig] = None
    model_name: Optional[str] = None


class TrainingJob(BaseModel):
    """Training job status."""
    job_id: str
    batch_id: str
    status: str  # queued, running, completed, failed
    progress: float  # 0-100
    current_epoch: Optional[int] = None
    total_epochs: Optional[int] = None
    current_accuracy: Optional[float] = None
    best_accuracy: Optional[float] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error_message: Optional[str] = None


class TrainingResult(BaseModel):
    """Training completion result."""
    job_id: str
    model_id: str
    model_version: str
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    training_samples: int
    training_time_seconds: int


class LogoTrainingProgress(BaseModel):
    """Training progress per logo type."""
    logo_id: str
    category: str
    value: str
    training_samples: int
    accuracy: Optional[float]
    confidence_threshold: float
    training_status: str  # not_started, in_progress, complete


@router.post("/train", response_model=TrainingJob)
async def start_training(
    request: TrainingRequest,
    background_tasks: BackgroundTasks,
) -> TrainingJob:
    """
    Start a training job for a batch of annotated images.

    - **batch_id**: ID of the training batch with annotations
    - **config**: Optional training configuration

    This endpoint starts REAL training using PyTorch:
    - Loads images from database and storage
    - Applies data augmentation
    - Trains EfficientNet/ResNet model
    - Exports to ONNX format
    - Stores model in MinIO and registers in database
    """
    config_data = request.config or TrainingConfig()

    # Convert to internal config
    trainer_config = TrainerConfig(
        batch_size=config_data.batch_size,
        epochs=config_data.epochs,
        learning_rate=config_data.learning_rate,
        augmentation_factor=config_data.augmentation_factor,
        validation_split=config_data.validation_split,
        early_stopping_patience=config_data.early_stopping_patience,
    )

    # Start training with real trainer service
    progress = await trainer_service.start_training(
        batch_id=request.batch_id,
        config=trainer_config,
    )

    logger.info("Training job started", job_id=progress.job_id, batch_id=request.batch_id)

    return TrainingJob(
        job_id=progress.job_id,
        batch_id=request.batch_id,
        status=progress.status,
        progress=progress.progress_percent,
        total_epochs=progress.total_epochs,
        current_epoch=progress.current_epoch,
        current_accuracy=progress.current_accuracy,
        best_accuracy=progress.best_accuracy,
    )


@router.get("/train/{job_id}", response_model=TrainingJob)
async def get_training_status(job_id: str) -> TrainingJob:
    """
    Get the status of a training job.
    """
    # First check active jobs
    progress = trainer_service.get_job_progress(job_id)
    if progress:
        return TrainingJob(
            job_id=progress.job_id,
            batch_id="",  # Not stored in progress
            status=progress.status,
            progress=progress.progress_percent,
            total_epochs=progress.total_epochs,
            current_epoch=progress.current_epoch,
            current_accuracy=progress.current_accuracy,
            best_accuracy=progress.best_accuracy,
            started_at=progress.started_at.isoformat() if progress.started_at else None,
            completed_at=progress.completed_at.isoformat() if progress.completed_at else None,
            error_message=progress.error_message,
        )

    # Check database for completed jobs
    job = await db_service.get_training_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Training job not found")

    return TrainingJob(
        job_id=str(job["id"]),
        batch_id=job.get("name", ""),
        status=job["status"].lower() if job.get("status") else "unknown",
        progress=100 if job.get("status") == "COMPLETED" else 0,
        total_epochs=0,
    )


@router.get("/train", response_model=List[TrainingJob])
async def list_training_jobs(
    status: Optional[str] = None,
    limit: int = 10,
) -> List[TrainingJob]:
    """
    List training jobs.

    - **status**: Filter by status (queued, running, completed, failed)
    - **limit**: Maximum number of jobs to return
    """
    # Get active jobs
    active_jobs = trainer_service.list_active_jobs()

    # Get historical jobs from database
    db_status = status.upper() if status else None
    db_jobs = await db_service.list_training_jobs(status=db_status, limit=limit)

    # Combine and format
    result = []

    for job in active_jobs:
        result.append(TrainingJob(
            job_id=job["job_id"],
            batch_id="",
            status=job["status"],
            progress=job["progress"],
            total_epochs=job["total_epochs"],
            current_epoch=job["current_epoch"],
            current_accuracy=job["current_accuracy"],
            best_accuracy=job["best_accuracy"],
            started_at=job["started_at"],
            completed_at=job["completed_at"],
            error_message=job["error_message"],
        ))

    for job in db_jobs:
        # Skip if already in active jobs
        if any(a.job_id == str(job["id"]) for a in result):
            continue

        result.append(TrainingJob(
            job_id=str(job["id"]),
            batch_id=job.get("name", ""),
            status=job["status"].lower() if job.get("status") else "unknown",
            progress=100 if job.get("status") == "COMPLETED" else 0,
            total_epochs=0,
        ))

    return result[:limit]


@router.delete("/train/{job_id}")
async def cancel_training(job_id: str) -> dict:
    """
    Cancel a training job.
    """
    cancelled = await trainer_service.cancel_job(job_id)

    if not cancelled:
        raise HTTPException(status_code=404, detail="Training job not found or already completed")

    logger.info("Training job cancelled", job_id=job_id)

    return {"message": "Training job cancelled", "job_id": job_id}


@router.get("/train/progress/logos", response_model=List[LogoTrainingProgress])
async def get_logo_training_progress() -> List[LogoTrainingProgress]:
    """
    Get training progress for all logo types.

    Returns completeness status for each logo:
    - not_started: No training samples
    - in_progress: Has samples but below confidence threshold
    - complete: Accuracy meets or exceeds confidence threshold
    """
    progress = await db_service.get_logo_training_progress()

    return [
        LogoTrainingProgress(
            logo_id=str(p["id"]),
            category=p["category"],
            value=p["value"],
            training_samples=p["training_samples"],
            accuracy=p["accuracy"],
            confidence_threshold=p["confidence_threshold"],
            training_status=p["training_status"],
        )
        for p in progress
    ]
