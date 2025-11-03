"""
Celery tasks for asynchronous image optimization
"""
import asyncio
from typing import Dict, List, Tuple, Any
from datetime import datetime
import logging
import json

from celery import Celery, Task
from celery.exceptions import SoftTimeLimitExceeded
import redis

from app.services.image_optimizer import ImageOptimizer
from app.services.quality_validator import QualityValidator
from app.services.batch_processor import BatchProcessor
from app.services.storage.image_storage import ImageStorage
from app.core.config import settings

logger = logging.getLogger(__name__)

# Initialize Celery
celery_app = Celery(
    'optimization_tasks',
    broker=f'redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}/0',
    backend=f'redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}/1'
)

# Configure Celery
celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,  # 5 minutes hard limit
    task_soft_time_limit=270,  # 4.5 minutes soft limit
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=50,
    task_reject_on_worker_lost=True,
    task_ignore_result=False,
    task_default_retry_delay=60,
    task_max_retries=3,
)

# Initialize services (will be initialized per worker)
image_optimizer = None
quality_validator = None
batch_processor = None
image_storage = None
redis_client = None

class OptimizationTask(Task):
    """Base task with initialization"""
    _optimizer = None
    _validator = None
    _storage = None
    _redis = None

    @property
    def optimizer(self):
        if self._optimizer is None:
            self._optimizer = ImageOptimizer(max_workers=2)  # Less workers in Celery context
        return self._optimizer

    @property
    def validator(self):
        if self._validator is None:
            self._validator = QualityValidator(ssim_threshold=0.95)
        return self._validator

    @property
    def storage(self):
        if self._storage is None:
            self._storage = ImageStorage()
        return self._storage

    @property
    def redis(self):
        if self._redis is None:
            self._redis = redis.Redis(
                host=settings.REDIS_HOST,
                port=settings.REDIS_PORT,
                decode_responses=True
            )
        return self._redis

@celery_app.task(
    base=OptimizationTask,
    bind=True,
    name='optimize_single_image',
    max_retries=3,
    default_retry_delay=60
)
def optimize_single_image(
    self,
    image_data_hex: str,
    image_id: str,
    filename: str,
    original_format: str,
    generate_tiers: bool = True
) -> Dict[str, Any]:
    """
    Optimize a single image (Celery task)

    Args:
        image_data_hex: Hex-encoded image data
        image_id: Unique image ID
        filename: Original filename
        original_format: Original image format
        generate_tiers: Whether to generate all resolution tiers

    Returns:
        Optimization results
    """
    try:
        # Convert hex back to bytes
        image_data = bytes.fromhex(image_data_hex)

        # Update progress
        self.redis.hset(
            f"optimization:{image_id}",
            mapping={
                "status": "processing",
                "started_at": datetime.utcnow().isoformat()
            }
        )

        # Run optimization in async context
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            # Optimize image
            results = loop.run_until_complete(
                self.optimizer.optimize_image(
                    image_data,
                    original_format,
                    generate_tiers
                )
            )

            # Validate quality for each tier
            quality_results = {}
            optimized_images = {}

            for tier_name, optimization_result in results.items():
                if optimization_result.success:
                    # In production, get actual optimized bytes
                    # For now, using original as placeholder
                    optimized_bytes = image_data

                    # Validate quality
                    quality_metrics = loop.run_until_complete(
                        self.validator.validate_quality(
                            image_data,
                            optimized_bytes
                        )
                    )

                    quality_results[tier_name] = {
                        "optimization": optimization_result.__dict__,
                        "quality": quality_metrics.__dict__
                    }

                    optimized_images[tier_name] = optimized_bytes

            # Store in MinIO
            storage_urls = loop.run_until_complete(
                self.storage.store_optimized_images(
                    image_id=image_id,
                    optimized_images=optimized_images,
                    metadata=quality_results,
                    original_filename=filename
                )
            )

            # Update status
            self.redis.hset(
                f"optimization:{image_id}",
                mapping={
                    "status": "completed",
                    "completed_at": datetime.utcnow().isoformat(),
                    "results": json.dumps(quality_results),
                    "storage_urls": json.dumps(storage_urls)
                }
            )

            # Set expiry
            self.redis.expire(f"optimization:{image_id}", 3600)  # 1 hour

            return {
                "success": True,
                "image_id": image_id,
                "results": quality_results,
                "storage_urls": storage_urls
            }

        finally:
            loop.close()

    except SoftTimeLimitExceeded:
        logger.error(f"Task timeout for image {image_id}")
        self.redis.hset(
            f"optimization:{image_id}",
            mapping={
                "status": "failed",
                "error": "Task timeout",
                "failed_at": datetime.utcnow().isoformat()
            }
        )
        raise

    except Exception as e:
        logger.error(f"Optimization failed for {image_id}: {e}")
        self.redis.hset(
            f"optimization:{image_id}",
            mapping={
                "status": "failed",
                "error": str(e),
                "failed_at": datetime.utcnow().isoformat()
            }
        )

        # Retry task
        raise self.retry(exc=e, countdown=60)

@celery_app.task(
    base=OptimizationTask,
    bind=True,
    name='process_batch_images',
    max_retries=2,
    default_retry_delay=120
)
def process_batch_images(
    self,
    batch_id: str,
    images: List[Dict[str, str]],  # List of {filename, data_hex}
    webhook_url: str = None
) -> Dict[str, Any]:
    """
    Process a batch of images (Celery task)

    Args:
        batch_id: Batch identifier
        images: List of image data dictionaries
        webhook_url: Optional webhook for completion

    Returns:
        Batch processing results
    """
    try:
        # Initialize batch progress
        self.redis.hset(
            f"batch:{batch_id}",
            mapping={
                "status": "processing",
                "total": len(images),
                "processed": 0,
                "failed": 0,
                "started_at": datetime.utcnow().isoformat()
            }
        )

        # Create sub-tasks for each image
        from celery import group

        subtasks = []
        for img_data in images:
            image_id = f"{batch_id}_{img_data['filename']}"
            subtask = optimize_single_image.s(
                image_data_hex=img_data['data_hex'],
                image_id=image_id,
                filename=img_data['filename'],
                original_format=img_data.get('format', 'JPEG'),
                generate_tiers=True
            )
            subtasks.append(subtask)

        # Execute subtasks in parallel
        job = group(subtasks)
        results = job.apply_async()

        # Wait for completion with timeout
        all_results = results.get(timeout=300)  # 5 minutes timeout

        # Count successes and failures
        processed = sum(1 for r in all_results if r and r.get('success'))
        failed = len(all_results) - processed

        # Update final status
        self.redis.hset(
            f"batch:{batch_id}",
            mapping={
                "status": "completed" if failed == 0 else "partially_completed",
                "processed": processed,
                "failed": failed,
                "completed_at": datetime.utcnow().isoformat(),
                "results": json.dumps(all_results)
            }
        )

        # Set expiry
        self.redis.expire(f"batch:{batch_id}", 7200)  # 2 hours

        # Send webhook if configured
        if webhook_url:
            send_webhook_notification.delay(
                webhook_url,
                {
                    "batch_id": batch_id,
                    "status": "completed",
                    "processed": processed,
                    "failed": failed,
                    "total": len(images)
                }
            )

        return {
            "success": True,
            "batch_id": batch_id,
            "processed": processed,
            "failed": failed,
            "total": len(images)
        }

    except Exception as e:
        logger.error(f"Batch processing failed for {batch_id}: {e}")
        self.redis.hset(
            f"batch:{batch_id}",
            mapping={
                "status": "failed",
                "error": str(e),
                "failed_at": datetime.utcnow().isoformat()
            }
        )
        raise self.retry(exc=e, countdown=120)

@celery_app.task(
    name='send_webhook_notification',
    max_retries=3,
    default_retry_delay=30
)
def send_webhook_notification(webhook_url: str, data: Dict[str, Any]):
    """
    Send webhook notification

    Args:
        webhook_url: Webhook endpoint
        data: Data to send
    """
    try:
        import requests
        response = requests.post(
            webhook_url,
            json=data,
            timeout=10
        )
        response.raise_for_status()
        logger.info(f"Webhook sent to {webhook_url}")

    except Exception as e:
        logger.error(f"Webhook failed: {e}")
        raise

@celery_app.task(
    base=OptimizationTask,
    bind=True,
    name='cleanup_old_optimizations'
)
def cleanup_old_optimizations(self):
    """
    Cleanup old optimization data

    Runs periodically to clean up expired data
    """
    try:
        # Clean up optimization keys older than 1 hour
        pattern = "optimization:*"
        for key in self.redis.scan_iter(pattern):
            ttl = self.redis.ttl(key)
            if ttl == -1:  # No expiry set
                self.redis.expire(key, 3600)

        # Clean up batch keys older than 2 hours
        pattern = "batch:*"
        for key in self.redis.scan_iter(pattern):
            ttl = self.redis.ttl(key)
            if ttl == -1:  # No expiry set
                self.redis.expire(key, 7200)

        logger.info("Cleanup completed")

    except Exception as e:
        logger.error(f"Cleanup failed: {e}")

# Celery Beat schedule
celery_app.conf.beat_schedule = {
    'cleanup-old-optimizations': {
        'task': 'cleanup_old_optimizations',
        'schedule': 3600.0,  # Run every hour
    },
}

@celery_app.task(
    bind=True,
    name='monitor_optimization_performance'
)
def monitor_optimization_performance(self):
    """
    Monitor and report optimization performance metrics
    """
    try:
        # Collect metrics from Redis
        metrics = {
            'timestamp': datetime.utcnow().isoformat(),
            'active_optimizations': 0,
            'completed_today': 0,
            'failed_today': 0,
            'average_compression_ratio': 0,
            'average_ssim_score': 0
        }

        # Count active optimizations
        for key in self.redis.scan_iter("optimization:*"):
            data = self.redis.hgetall(key)
            if data.get('status') == 'processing':
                metrics['active_optimizations'] += 1

        # Store metrics
        self.redis.hset(
            "metrics:optimization",
            mapping=metrics
        )
        self.redis.expire("metrics:optimization", 86400)  # 24 hours

        logger.info(f"Performance metrics collected: {metrics}")

    except Exception as e:
        logger.error(f"Monitoring failed: {e}")