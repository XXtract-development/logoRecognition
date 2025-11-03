"""Celery tasks for sending notifications triggered by DATABASE changes.

US-INT-006: Database-triggered Notifications
This module contains Celery tasks for asynchronous notification sending.

Key Features:
- Async notification sending (non-blocking)
- Retry logic with exponential backoff
- Error handling and logging
- Database integration
"""

import logging
from typing import Optional

from celery import Task
from sqlalchemy.orm import Session

from app.celery_app import app, BaseTask
from app.core.database import get_db
from app.models.training import TrainingJob
from app.services.notification_service import notification_service

logger = logging.getLogger(__name__)


@app.task(
    base=BaseTask,
    bind=True,
    name='send_training_notification',
    max_retries=3,  # AC5: Retry up to 3 times
    default_retry_delay=60,  # 1 minute
    time_limit=30,  # 30 seconds hard limit
    soft_time_limit=25,  # 25 seconds soft limit
    queue='low',  # Low priority queue (don't block ML tasks)
    acks_late=True
)
def send_training_notification(self, job_id: str, event_type: str):
    """
    Send notification for training event from DATABASE.

    US-INT-006 AC5: Notification Retry Logic
    - Retries up to 3 times
    - Exponential backoff (1min, 2min, 4min)
    - Job completion NOT blocked by notification failure

    Args:
        job_id: TrainingJob UUID
        event_type: "started", "completed", or "failed"

    Raises:
        Retries on network errors (SMTP timeout, HTTP errors)
        Logs on non-retryable errors (validation, template errors)
    """
    db: Optional[Session] = None

    try:
        # Get database session
        db = next(get_db())

        # AC1, AC2: Load job from DATABASE
        job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()

        if not job:
            logger.error(f"Job {job_id} not found in DATABASE for notification")
            return {"status": "error", "message": "Job not found"}

        # Check if notifications configured in DATABASE
        if not job.notifications:
            logger.info(f"No notifications configured for job {job_id}")
            return {"status": "skipped", "message": "No notifications configured"}

        # Send appropriate notification based on DATABASE status
        success = False

        if event_type == "started":
            success = notification_service.send_training_started(job)
        elif event_type == "completed":
            success = notification_service.send_training_completed(job)
        elif event_type == "failed":
            success = notification_service.send_training_failed(job)
        else:
            logger.error(f"Invalid event type: {event_type}")
            return {"status": "error", "message": f"Invalid event type: {event_type}"}

        if success:
            logger.info(f"Notification sent successfully for job {job_id}, event {event_type}")
            return {
                "status": "success",
                "job_id": job_id,
                "event_type": event_type,
                "channels": list(job.notifications.keys())
            }
        else:
            logger.warning(f"Notification sending failed (non-retryable) for job {job_id}")
            return {"status": "failed", "message": "Notification sending failed"}

    except (ConnectionError, TimeoutError, OSError) as e:
        # AC5: Retry with exponential backoff on network errors
        logger.error(f"Notification failed (network error): {e}")

        # Calculate exponential backoff: 1min, 2min, 4min
        countdown = 60 * (2 ** self.request.retries)

        logger.info(f"Retrying notification in {countdown}s (attempt {self.request.retries + 1}/3)")

        raise self.retry(exc=e, countdown=countdown)

    except Exception as e:
        # Don't retry on other errors (validation, template errors, etc.)
        logger.error(f"Notification failed (non-retryable): {e}", exc_info=True)
        return {
            "status": "error",
            "message": str(e),
            "retryable": False
        }

    finally:
        # Clean up database session
        if db:
            db.close()


@app.task(
    name='cleanup_notification_throttle',
    queue='low'
)
def cleanup_notification_throttle():
    """
    Periodic task to clean up old throttle state.

    Runs hourly to prevent memory leaks from throttle tracking.
    """
    try:
        # Clear throttle state older than 24 hours
        cutoff_time = datetime.utcnow() - timedelta(hours=24)

        cleaned_count = 0
        for job_id in list(notification_service.last_sent.keys()):
            for channel in list(notification_service.last_sent[job_id].keys()):
                if notification_service.last_sent[job_id][channel] < cutoff_time:
                    del notification_service.last_sent[job_id][channel]
                    cleaned_count += 1

            # Remove empty job entries
            if not notification_service.last_sent[job_id]:
                del notification_service.last_sent[job_id]

        logger.info(f"Cleaned up {cleaned_count} old throttle entries")
        return {"status": "success", "cleaned": cleaned_count}

    except Exception as e:
        logger.error(f"Error cleaning up throttle state: {e}")
        return {"status": "error", "message": str(e)}


# Import for task registration
from datetime import datetime, timedelta
