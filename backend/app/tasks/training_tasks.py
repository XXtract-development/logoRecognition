"""Celery tasks for training with PostgreSQL database integration.

US-INT-004: Celery Database Integration
This module REPLACES the old JSON file-based approach with PostgreSQL.
All state changes are persisted to database with ACID transactions.

Key Features:
- Database-only operations (NO JSON files)
- Atomic progress updates with transactions
- Model registration in database
- Comprehensive error handling with rollback
- Task cancellation support
- Resource cleanup
- Retry logic for transient errors
"""

import asyncio
import logging
import traceback as tb
from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID

from celery.exceptions import SoftTimeLimitExceeded
from sqlalchemy.orm import Session

from app.celery_app import app, BaseTask
from app.core.database import get_db
from app.models.training import TrainingJob, ModelRegistry
from app.services.training_service import TrainingJobService
from app.services.base_service import InvalidStateError
from app.core.config import settings

logger = logging.getLogger(__name__)


@app.task(
    base=BaseTask,
    bind=True,
    name='execute_training_pipeline',
    max_retries=2,
    default_retry_delay=300,  # 5 minutes
    time_limit=7200,  # 2 hours hard limit
    soft_time_limit=6900,  # 1h 55m soft limit
    queue='ml',
    priority=5,
    acks_late=True,
    reject_on_worker_lost=True
)
def execute_training_pipeline(self, job_id: str) -> Dict[str, Any]:
    """
    Execute training pipeline using DATABASE for all operations.

    This task REPLACES JSON file operations with PostgreSQL:
    - Loads job from database (not training_jobs.json)
    - Updates status in database (not JSON)
    - Progress updates to database (not JSON)
    - Registers model in database (not JSON)

    Acceptance Criteria Coverage:
    - AC1: Execute Training Pipeline with Database
    - AC2: Database Progress Updates During Training
    - AC3: Model Registration in Database
    - AC4: Error Handling with Database Rollback
    - AC5: Task Cancellation Support
    - AC6: No JSON File I/O

    Args:
        job_id: TrainingJob UUID as string

    Returns:
        Dict with job results and status

    Raises:
        Retries on transient errors (network, DB issues)
        Re-raises on non-retryable errors
    """
    db: Session = None
    training_service: TrainingJobService = None

    try:
        # Get database session
        db = next(get_db())
        training_service = TrainingJobService(db)

        # AC1: Load job from DATABASE (replaces JSON file read)
        logger.info(f"[{job_id}] Loading training job from database")
        job = training_service.get_or_404(job_id)

        # Check if already running (idempotency)
        if job.status == "running":
            logger.warning(f"[{job_id}] Job already running, task may be duplicate")
            return {
                "status": "already_running",
                "job_id": str(job.id),
                "message": "Job is already running"
            }

        # AC5: Check if cancelled before starting
        if job.status == "cancelled":
            logger.info(f"[{job_id}] Job was cancelled before execution")
            return {
                "status": "cancelled",
                "job_id": str(job.id),
                "message": "Job was cancelled by user"
            }

        # AC1: Update status to running in DATABASE (replaces JSON write)
        logger.info(f"[{job_id}] Starting training pipeline")
        job = training_service.start_job(
            job_id=UUID(job_id),
            celery_task_id=self.request.id
        )

        # Import orchestrator (lazy import to avoid circular dependencies)
        from app.training.pipeline.enhanced_orchestrator import (
            EnhancedTrainingPipelineOrchestrator,
            EnhancedPipelineConfig
        )

        # Configure pipeline
        config = EnhancedPipelineConfig(
            auto_deploy_threshold=job.accuracy_threshold or 0.85,
            min_training_samples=job.augmentation_factor * len(job.target_categories or []),
            max_training_time=6900,  # 115 minutes soft limit
            enable_drift_detection=True,
            enable_hyperparameter_tuning=True,
            hpo_trials=25
        )

        orchestrator = EnhancedTrainingPipelineOrchestrator(config, db)

        # AC2: Progress callback for DATABASE updates (replaces JSON writes)
        def progress_callback(
            epoch: int,
            total_epochs: int,
            metrics: Dict[str, float],
            phase: str = "training"
        ):
            """
            Update DATABASE on each epoch (AC2).

            This replaces JSON file writes with atomic database transactions.
            Called by training loop on each epoch completion.
            """
            try:
                # Calculate ETA
                eta_seconds = None
                if job.started_at and epoch > 0:
                    elapsed = (datetime.utcnow() - job.started_at).total_seconds()
                    per_epoch = elapsed / epoch
                    remaining = (total_epochs - epoch) * per_epoch
                    eta_seconds = int(remaining)

                # Get GPU resources (if available)
                resources = {}
                try:
                    import torch
                    if torch.cuda.is_available():
                        resources = {
                            "gpu_count": torch.cuda.device_count(),
                            "gpu_memory_allocated_mb": round(
                                torch.cuda.memory_allocated() / (1024 ** 2), 2
                            ),
                            "gpu_memory_reserved_mb": round(
                                torch.cuda.memory_reserved() / (1024 ** 2), 2
                            ),
                            "gpu_memory_total_mb": round(
                                torch.cuda.get_device_properties(0).total_memory / (1024 ** 2), 2
                            )
                        }

                        # Try to get utilization if available
                        try:
                            import pynvml
                            pynvml.nvmlInit()
                            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
                            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                            resources["gpu_utilization_percent"] = util.gpu
                            pynvml.nvmlShutdown()
                        except Exception:
                            pass  # pynvml not available, skip utilization
                except ImportError:
                    pass  # PyTorch not available

                # AC2: Update DATABASE (replaces JSON file write)
                training_service.update_progress(
                    job_id=UUID(job_id),
                    phase_progress={
                        "data_preparation": 100,
                        phase: int((epoch / total_epochs) * 100),
                        "validation": 0 if phase != "validation" else 50
                    },
                    current_epoch=epoch,
                    total_epochs=total_epochs,
                    eta_seconds=eta_seconds,
                    resources=resources if resources else None,
                    metrics=metrics
                )

                logger.debug(
                    f"[{job_id}] Progress saved to DATABASE: epoch {epoch}/{total_epochs}, "
                    f"loss={metrics.get('loss', 0):.4f}, "
                    f"accuracy={metrics.get('accuracy', 0):.4f}"
                )

                # AC5: Check if job was cancelled during training
                db.refresh(job)
                if job.status == "cancelled":
                    logger.info(f"[{job_id}] Job cancelled by user during training")
                    raise InterruptedError(f"Job {job_id} cancelled by user")

            except InterruptedError:
                # Re-raise cancellation to stop training
                raise
            except Exception as e:
                logger.error(f"[{job_id}] Progress callback failed: {e}", exc_info=True)
                # Don't fail training on progress update errors
                # Training can continue even if progress tracking fails

        # Execute training pipeline with progress callback
        logger.info(f"[{job_id}] Executing training pipeline")
        result = asyncio.run(
            orchestrator.run_pipeline(
                trigger="api",
                force_retrain=True,
                priority="normal",
                progress_callback=progress_callback  # DATABASE updates on each epoch
            )
        )

        # AC3: Model registration in DATABASE (replaces JSON)
        if result.get("status") == "completed":
            logger.info(f"[{job_id}] Training completed successfully")

            # Extract model paths from result
            model_path = result.get("model", {}).get("path", f"/models/{job_id}/model.pth")
            onnx_path = result.get("model", {}).get("onnx_path", f"/models/{job_id}/model.onnx")
            final_metrics = result.get("metrics", {})

            # AC3: Register model and complete job in DATABASE (atomic transaction)
            model = training_service.complete_job(
                job_id=UUID(job_id),
                metrics=final_metrics,
                model_path=model_path,
                onnx_path=onnx_path
            )

            logger.info(
                f"[{job_id}] Model registered in DATABASE: {model.version}, "
                f"accuracy={final_metrics.get('accuracy', 0):.4f}"
            )

            # Schedule cleanup task
            cleanup_training_resources.apply_async(
                args=[job_id],
                countdown=300  # 5 minutes after completion
            )

            return {
                "job_id": str(job.id),
                "status": "completed",
                "model_version": model.version,
                "metrics": final_metrics,
                "duration_seconds": result.get("duration"),
                "message": f"Training completed successfully, model {model.version} registered"
            }
        else:
            # Pipeline returned non-completed status
            error_msg = result.get("error", "Pipeline failed with unknown error")
            logger.error(f"[{job_id}] Pipeline failed: {error_msg}")
            raise Exception(error_msg)

    except SoftTimeLimitExceeded:
        # AC4: Timeout handling with DATABASE update
        logger.error(f"[{job_id}] Training timeout (soft limit exceeded)")

        if training_service:
            try:
                training_service.fail_job(
                    job_id=UUID(job_id),
                    error_message="Training exceeded time limit (115 minutes soft limit)"
                )
            except Exception as e:
                logger.error(f"[{job_id}] Failed to update job status after timeout: {e}")

        # Schedule cleanup
        cleanup_training_resources.apply_async(args=[job_id], countdown=60)
        raise

    except InterruptedError as e:
        # AC5: Cancellation handling
        logger.info(f"[{job_id}] Training interrupted by user cancellation")

        # Job status already set to "cancelled" by API
        # Just cleanup resources
        cleanup_training_resources.apply_async(args=[job_id], countdown=60)

        return {
            "job_id": job_id,
            "status": "cancelled",
            "message": str(e)
        }

    except Exception as e:
        # AC4: Error handling with DATABASE update (replaces JSON)
        logger.error(f"[{job_id}] Training failed with exception: {str(e)}", exc_info=True)

        # AC4: Save error to DATABASE (replaces JSON file write)
        if training_service:
            try:
                training_service.fail_job(
                    job_id=UUID(job_id),
                    error_message=f"{type(e).__name__}: {str(e)}\n\n{tb.format_exc()}"
                )
            except Exception as fail_error:
                logger.error(
                    f"[{job_id}] Failed to update job status after error: {fail_error}",
                    exc_info=True
                )

        # AC4: Retry on transient errors
        if _is_retryable_error(e):
            retry_count = self.request.retries + 1
            logger.info(
                f"[{job_id}] Retrying job due to transient error "
                f"(attempt {retry_count}/{self.max_retries})"
            )
            raise self.retry(exc=e, countdown=300)  # Retry after 5 minutes

        # Cleanup resources for non-retryable errors
        cleanup_training_resources.apply_async(args=[job_id], countdown=60)
        raise

    finally:
        # Always close database session
        if db:
            db.close()


@app.task(
    name='cleanup_training_resources',
    time_limit=300,  # 5 minutes
    queue='low',
    priority=1
)
def cleanup_training_resources(job_id: str):
    """
    Cleanup resources for completed/failed training job.

    Cleans up:
    - Redis cache entries
    - GPU memory
    - Temporary files (future: MinIO cleanup)

    Args:
        job_id: TrainingJob UUID as string
    """
    logger.info(f"[{job_id}] Starting resource cleanup")

    try:
        # Clear Redis cache for this job
        try:
            import redis
            r = redis.Redis(
                host=settings.REDIS_HOST,
                port=settings.REDIS_PORT,
                db=0
            )

            # Pattern matching for job-related cache keys
            pattern = f"training:{job_id}:*"
            deleted_count = 0

            for key in r.scan_iter(pattern):
                r.delete(key)
                deleted_count += 1

            if deleted_count > 0:
                logger.info(f"[{job_id}] Deleted {deleted_count} Redis cache keys")

        except Exception as e:
            logger.warning(f"[{job_id}] Failed to clear Redis cache: {e}")

        # Free GPU memory
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                logger.info(f"[{job_id}] Cleared GPU cache")
        except ImportError:
            pass  # PyTorch not available
        except Exception as e:
            logger.warning(f"[{job_id}] Failed to clear GPU cache: {e}")

        # TODO: Remove temporary files from MinIO
        # Query database for job's file paths and delete from storage
        # Example:
        # db = next(get_db())
        # job = db.query(TrainingJob).filter(TrainingJob.id == UUID(job_id)).first()
        # if job and job.config.get("temp_files"):
        #     for file_path in job.config["temp_files"]:
        #         minio_client.remove_object(bucket, file_path)

        logger.info(f"[{job_id}] Resource cleanup completed successfully")

    except Exception as e:
        logger.error(f"[{job_id}] Cleanup failed: {e}", exc_info=True)
        # Don't raise - cleanup failures shouldn't fail the task


def _is_retryable_error(exception: Exception) -> bool:
    """
    Determine if error is transient and should be retried.

    Retryable errors:
    - Network/connection errors
    - Temporary database issues (OperationalError)
    - Resource temporarily unavailable
    - Timeout errors

    Non-retryable errors:
    - Validation errors
    - Data integrity errors
    - OOM errors (OutOfMemoryError)
    - InvalidStateError (business logic violations)

    Args:
        exception: Exception to check

    Returns:
        True if error is retryable, False otherwise
    """
    retryable_types = [
        "ConnectionError",
        "TimeoutError",
        "OperationalError",  # Database temporary issues
        "ResourceUnavailable",
        "NetworkError",
        "BrokenPipeError",
        "ConnectionResetError"
    ]

    error_name = type(exception).__name__

    # Check if exception type matches retryable patterns
    is_retryable = any(t in error_name for t in retryable_types)

    if is_retryable:
        logger.info(f"Error {error_name} is retryable: {str(exception)}")
    else:
        logger.info(f"Error {error_name} is NOT retryable: {str(exception)}")

    return is_retryable
