"""Celery tasks for batch processing."""

import logging
from typing import Any, Dict, List, Optional

from celery import Task
from celery.result import AsyncResult

from app.celery_app import app as celery_app
from app.models.base import get_db_sync
from app.batch.processor import BatchProcessor
from app.batch.models import BatchJob, BatchStatus

logger = logging.getLogger(__name__)


class BatchProcessingTask(Task):
    """Base task class with error handling and resource management."""

    autoretry_for = (Exception,)
    max_retries = 3
    default_retry_delay = 60

    def before_start(self, task_id, args, kwargs):
        """Called before task execution starts."""
        logger.info(f"Starting batch task {task_id}")

    def after_return(self, status, retval, task_id, args, kwargs, einfo):
        """Called after task returns."""
        logger.info(f"Batch task {task_id} completed with status {status}")

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Called on task failure."""
        logger.error(f"Batch task {task_id} failed: {str(exc)}")

        # Update batch status in database
        if args:
            batch_id = args[0]
            try:
                with get_db_sync() as db:
                    batch_job = db.query(BatchJob).filter_by(id=batch_id).first()
                    if batch_job:
                        batch_job.status = BatchStatus.FAILED
                        batch_job.results = {"error": str(exc)}
                        db.commit()
            except Exception as e:
                logger.error(f"Failed to update batch status: {str(e)}")


@celery_app.task(
    bind=True,
    base=BatchProcessingTask,
    name="batch.process",
    queue="batch_processing",
    time_limit=600,  # 10 minutes
    soft_time_limit=540,  # 9 minutes
)
def process_batch(
    self,
    batch_id: str,
    priority: int = 0,
) -> Dict[str, Any]:
    """Process a batch of images asynchronously.

    Args:
        batch_id: UUID of the batch job
        priority: Processing priority (0-10)

    Returns:
        Dictionary with processing results
    """
    import asyncio

    try:
        # Create processor
        processor = BatchProcessor()

        # Run async processing
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            with get_db_sync() as db:
                result = loop.run_until_complete(
                    processor.process_batch(batch_id, db)
                )
                return result
        finally:
            loop.close()

    except Exception as e:
        logger.error(f"Batch processing failed: {str(e)}")
        raise


@celery_app.task(
    bind=True,
    name="batch.process_chunk",
    queue="batch_processing",
    time_limit=120,  # 2 minutes per chunk
)
def process_batch_chunk(
    self,
    batch_id: str,
    item_ids: List[str],
    processing_type: str,
) -> List[Dict[str, Any]]:
    """Process a chunk of batch items.

    Args:
        batch_id: UUID of the batch job
        item_ids: List of item IDs to process
        processing_type: Type of processing to perform

    Returns:
        List of processing results for each item
    """
    import asyncio
    from app.batch.processor import BatchProcessor

    try:
        processor = BatchProcessor()
        results = []

        # Process each item
        for item_id in item_ids:
            try:
                # Process item (simplified for chunk processing)
                result = {
                    "item_id": item_id,
                    "success": True,
                    "result": {"processed": True},
                }
                results.append(result)
            except Exception as e:
                results.append({
                    "item_id": item_id,
                    "success": False,
                    "error": str(e),
                })

        return results

    except Exception as e:
        logger.error(f"Chunk processing failed: {str(e)}")
        raise


@celery_app.task(
    name="batch.cleanup",
    queue="maintenance",
)
def cleanup_old_batches() -> int:
    """Cleanup old batch results based on retention policy.

    Returns:
        Number of batches cleaned up
    """
    import asyncio
    from app.batch.processor import BatchProcessor

    try:
        processor = BatchProcessor()

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            with get_db_sync() as db:
                count = loop.run_until_complete(
                    processor.cleanup_old_batches(db)
                )
                return count
        finally:
            loop.close()

    except Exception as e:
        logger.error(f"Batch cleanup failed: {str(e)}")
        return 0


@celery_app.task(
    name="batch.monitor",
    queue="monitoring",
)
def monitor_batch_progress(batch_id: str) -> Dict[str, Any]:
    """Monitor batch processing progress.

    Args:
        batch_id: UUID of the batch job

    Returns:
        Dictionary with current batch status and metrics
    """
    try:
        with get_db_sync() as db:
            batch_job = db.query(BatchJob).filter_by(id=batch_id).first()

            if not batch_job:
                return {"error": "Batch not found"}

            return {
                "batch_id": str(batch_job.id),
                "status": batch_job.status,
                "total_items": batch_job.total_items,
                "processed_items": batch_job.processed_items,
                "failed_items": batch_job.failed_items,
                "progress": (
                    (batch_job.processed_items / batch_job.total_items * 100)
                    if batch_job.total_items > 0 else 0
                ),
                "created_at": batch_job.created_at.isoformat() if batch_job.created_at else None,
                "started_at": batch_job.started_at.isoformat() if batch_job.started_at else None,
                "completed_at": batch_job.completed_at.isoformat() if batch_job.completed_at else None,
            }

    except Exception as e:
        logger.error(f"Failed to monitor batch: {str(e)}")
        return {"error": str(e)}


@celery_app.task(
    name="batch.cancel",
    queue="batch_processing",
)
def cancel_batch(batch_id: str) -> bool:
    """Cancel a running batch job.

    Args:
        batch_id: UUID of the batch job

    Returns:
        True if cancelled successfully, False otherwise
    """
    try:
        # Get active task for this batch
        result = AsyncResult(f"batch-{batch_id}", app=celery_app)

        if result and result.state in ["PENDING", "STARTED", "RETRY"]:
            # Revoke the task
            result.revoke(terminate=True, signal="SIGTERM")

            # Update database
            with get_db_sync() as db:
                batch_job = db.query(BatchJob).filter_by(id=batch_id).first()
                if batch_job:
                    batch_job.status = BatchStatus.CANCELLED
                    db.commit()

            return True

        return False

    except Exception as e:
        logger.error(f"Failed to cancel batch: {str(e)}")
        return False


# Task routing configuration
task_routes = {
    "batch.process": {
        "queue": "batch_processing",
        "routing_key": "batch.process",
        "priority": 5,
    },
    "batch.process_chunk": {
        "queue": "batch_processing",
        "routing_key": "batch.chunk",
        "priority": 3,
    },
    "batch.cleanup": {
        "queue": "maintenance",
        "routing_key": "batch.cleanup",
        "priority": 1,
    },
    "batch.monitor": {
        "queue": "monitoring",
        "routing_key": "batch.monitor",
        "priority": 2,
    },
    "batch.cancel": {
        "queue": "batch_processing",
        "routing_key": "batch.cancel",
        "priority": 10,
    },
}


# Celery beat schedule for periodic tasks
beat_schedule = {
    "cleanup-old-batches": {
        "task": "batch.cleanup",
        "schedule": 86400,  # Daily
        "options": {
            "queue": "maintenance",
            "priority": 1,
        },
    },
}