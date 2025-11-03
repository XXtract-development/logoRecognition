"""
Batch Image Processing Service
Handles parallel processing of multiple images with progress tracking
"""
import asyncio
from typing import List, Dict, Tuple, Optional, Callable, Any
from dataclasses import dataclass
from datetime import datetime, timedelta
import logging
from enum import Enum
import json

from celery import Celery, group, states
from celery.result import AsyncResult
import redis.asyncio as redis
from app.services.image_optimizer import ImageOptimizer, OptimizationResult
from app.core.config import settings

logger = logging.getLogger(__name__)

class ProcessingStatus(Enum):
    """Batch processing status"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIALLY_COMPLETED = "partially_completed"

@dataclass
class BatchProgress:
    """Batch processing progress information"""
    batch_id: str
    total_images: int
    processed_images: int
    failed_images: int
    status: ProcessingStatus
    start_time: datetime
    end_time: Optional[datetime]
    estimated_time_remaining: Optional[timedelta]
    current_image: Optional[str]
    error_messages: List[str]

    @property
    def progress_percentage(self) -> float:
        """Calculate progress percentage"""
        if self.total_images == 0:
            return 0
        return (self.processed_images / self.total_images) * 100

    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization"""
        return {
            'batch_id': self.batch_id,
            'total_images': self.total_images,
            'processed_images': self.processed_images,
            'failed_images': self.failed_images,
            'status': self.status.value,
            'progress_percentage': self.progress_percentage,
            'start_time': self.start_time.isoformat() if self.start_time else None,
            'end_time': self.end_time.isoformat() if self.end_time else None,
            'estimated_time_remaining': str(self.estimated_time_remaining) if self.estimated_time_remaining else None,
            'current_image': self.current_image,
            'error_messages': self.error_messages
        }

class BatchProcessor:
    """
    Handles batch image processing with parallel execution and progress tracking
    """

    def __init__(
        self,
        redis_url: str = None,
        max_batch_size: int = 20,
        max_workers: int = 4
    ):
        """
        Initialize batch processor

        Args:
            redis_url: Redis connection URL
            max_batch_size: Maximum images per batch to prevent memory overflow
            max_workers: Maximum concurrent workers
        """
        self.redis_url = redis_url or f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}"
        self.max_batch_size = max_batch_size
        self.max_workers = max_workers
        self.optimizer = ImageOptimizer(max_workers=max_workers)
        self.redis_client = None
        self.progress_data: Dict[str, BatchProgress] = {}

        # Initialize Celery
        self.celery_app = Celery(
            'batch_processor',
            broker=self.redis_url,
            backend=self.redis_url
        )

        # Configure Celery
        self.celery_app.conf.update(
            task_serializer='json',
            accept_content=['json'],
            result_serializer='json',
            timezone='UTC',
            enable_utc=True,
            task_track_started=True,
            task_time_limit=300,  # 5 minutes per task
            task_soft_time_limit=270,  # 4.5 minutes soft limit
            worker_prefetch_multiplier=1,
            worker_max_tasks_per_child=100,
        )

    async def connect(self):
        """Connect to Redis"""
        if not self.redis_client:
            self.redis_client = await redis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True
            )

    async def disconnect(self):
        """Disconnect from Redis"""
        if self.redis_client:
            await self.redis_client.close()
            self.redis_client = None

    async def process_batch(
        self,
        images: List[Tuple[str, bytes]],
        batch_id: str = None,
        progress_callback: Optional[Callable] = None,
        webhook_url: Optional[str] = None
    ) -> Tuple[Dict[str, Dict[str, OptimizationResult]], BatchProgress]:
        """
        Process a batch of images with parallel execution

        Args:
            images: List of (filename, image_data) tuples
            batch_id: Optional batch ID for tracking
            progress_callback: Optional async callback for progress updates
            webhook_url: Optional webhook URL for completion notification

        Returns:
            Tuple of (results dict, batch progress)
        """
        await self.connect()

        # Generate batch ID if not provided
        if not batch_id:
            batch_id = f"batch_{datetime.utcnow().timestamp()}"

        # Initialize progress tracking
        progress = BatchProgress(
            batch_id=batch_id,
            total_images=len(images),
            processed_images=0,
            failed_images=0,
            status=ProcessingStatus.PROCESSING,
            start_time=datetime.utcnow(),
            end_time=None,
            estimated_time_remaining=None,
            current_image=None,
            error_messages=[]
        )

        self.progress_data[batch_id] = progress

        # Store initial progress in Redis
        await self._update_progress_redis(progress)

        results = {}

        try:
            # Split into chunks to avoid memory overflow
            chunks = [
                images[i:i + self.max_batch_size]
                for i in range(0, len(images), self.max_batch_size)
            ]

            chunk_start_time = datetime.utcnow()

            for chunk_idx, chunk in enumerate(chunks):
                # Process chunk with streaming to manage memory
                if self._should_use_streaming(chunk):
                    chunk_results = await self._process_chunk_streaming(
                        chunk, progress, progress_callback
                    )
                else:
                    chunk_results = await self._process_chunk_parallel(
                        chunk, progress, progress_callback
                    )

                results.update(chunk_results)

                # Update time estimation
                if chunk_idx == 0 and len(chunks) > 1:
                    chunk_time = (datetime.utcnow() - chunk_start_time).total_seconds()
                    estimated_total = chunk_time * len(chunks)
                    progress.estimated_time_remaining = timedelta(
                        seconds=estimated_total - chunk_time
                    )
                    await self._update_progress_redis(progress)

            # Finalize progress
            progress.status = ProcessingStatus.COMPLETED
            if progress.failed_images > 0:
                progress.status = ProcessingStatus.PARTIALLY_COMPLETED
            progress.end_time = datetime.utcnow()
            progress.estimated_time_remaining = None

            await self._update_progress_redis(progress)

            # Send webhook notification if configured
            if webhook_url:
                await self._send_webhook_notification(webhook_url, progress)

        except Exception as e:
            logger.error(f"Batch processing failed: {e}")
            progress.status = ProcessingStatus.FAILED
            progress.error_messages.append(str(e))
            progress.end_time = datetime.utcnow()
            await self._update_progress_redis(progress)

        finally:
            # Clean up progress data after some time
            asyncio.create_task(self._cleanup_progress_data(batch_id))

        return results, progress

    def _should_use_streaming(self, chunk: List[Tuple[str, bytes]]) -> bool:
        """Determine if streaming processing should be used"""
        # Use streaming for large files
        total_size = sum(len(data) for _, data in chunk)
        return total_size > 50 * 1024 * 1024  # 50MB threshold

    async def _process_chunk_parallel(
        self,
        chunk: List[Tuple[str, bytes]],
        progress: BatchProgress,
        progress_callback: Optional[Callable]
    ) -> Dict[str, Dict[str, OptimizationResult]]:
        """Process chunk with parallel execution"""
        tasks = []

        for filename, image_data in chunk:
            # Update current image
            progress.current_image = filename
            await self._update_progress_redis(progress)

            # Create optimization task
            task = self.optimizer.optimize_image(
                image_data,
                self._get_format_from_filename(filename)
            )
            tasks.append((filename, task))

        # Execute all tasks concurrently
        results = {}
        for filename, task in tasks:
            try:
                result = await task
                results[filename] = result
                progress.processed_images += 1
            except Exception as e:
                logger.error(f"Failed to process {filename}: {e}")
                progress.failed_images += 1
                progress.error_messages.append(f"{filename}: {str(e)}")

            # Update progress
            await self._update_progress_redis(progress)

            if progress_callback:
                await progress_callback(progress)

        return results

    async def _process_chunk_streaming(
        self,
        chunk: List[Tuple[str, bytes]],
        progress: BatchProgress,
        progress_callback: Optional[Callable]
    ) -> Dict[str, Dict[str, OptimizationResult]]:
        """Process chunk with streaming to manage memory"""
        results = {}

        for filename, image_data in chunk:
            progress.current_image = filename
            await self._update_progress_redis(progress)

            try:
                # Process one at a time to manage memory
                result = await self.optimizer.optimize_image(
                    image_data,
                    self._get_format_from_filename(filename)
                )
                results[filename] = result
                progress.processed_images += 1

            except Exception as e:
                logger.error(f"Failed to process {filename}: {e}")
                progress.failed_images += 1
                progress.error_messages.append(f"{filename}: {str(e)}")

            # Update progress
            await self._update_progress_redis(progress)

            if progress_callback:
                await progress_callback(progress)

            # Force garbage collection for large files
            if len(image_data) > 10 * 1024 * 1024:  # 10MB
                import gc
                gc.collect()

        return results

    def _get_format_from_filename(self, filename: str) -> str:
        """Extract format from filename"""
        ext = filename.rsplit('.', 1)[-1].upper()
        format_map = {
            'JPG': 'JPEG',
            'JPEG': 'JPEG',
            'PNG': 'PNG',
            'WEBP': 'WebP',
            'BMP': 'BMP'
        }
        return format_map.get(ext, 'JPEG')

    async def _update_progress_redis(self, progress: BatchProgress):
        """Update progress in Redis for real-time tracking"""
        if self.redis_client:
            key = f"batch_progress:{progress.batch_id}"
            await self.redis_client.setex(
                key,
                3600,  # Expire after 1 hour
                json.dumps(progress.to_dict())
            )

            # Publish progress update for WebSocket subscribers
            await self.redis_client.publish(
                f"batch_progress_channel:{progress.batch_id}",
                json.dumps(progress.to_dict())
            )

    async def get_batch_progress(self, batch_id: str) -> Optional[BatchProgress]:
        """Get current batch progress"""
        # Check in-memory first
        if batch_id in self.progress_data:
            return self.progress_data[batch_id]

        # Check Redis
        if self.redis_client:
            key = f"batch_progress:{batch_id}"
            data = await self.redis_client.get(key)

            if data:
                progress_dict = json.loads(data)
                return BatchProgress(
                    batch_id=progress_dict['batch_id'],
                    total_images=progress_dict['total_images'],
                    processed_images=progress_dict['processed_images'],
                    failed_images=progress_dict['failed_images'],
                    status=ProcessingStatus(progress_dict['status']),
                    start_time=datetime.fromisoformat(progress_dict['start_time']) if progress_dict['start_time'] else None,
                    end_time=datetime.fromisoformat(progress_dict['end_time']) if progress_dict['end_time'] else None,
                    estimated_time_remaining=timedelta(seconds=float(progress_dict['estimated_time_remaining'].split(':')[2])) if progress_dict['estimated_time_remaining'] else None,
                    current_image=progress_dict['current_image'],
                    error_messages=progress_dict['error_messages']
                )

        return None

    async def _cleanup_progress_data(self, batch_id: str, delay: int = 300):
        """Clean up progress data after delay"""
        await asyncio.sleep(delay)  # Wait 5 minutes

        if batch_id in self.progress_data:
            del self.progress_data[batch_id]

    async def _send_webhook_notification(self, webhook_url: str, progress: BatchProgress):
        """Send webhook notification on batch completion"""
        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                await session.post(
                    webhook_url,
                    json=progress.to_dict(),
                    timeout=aiohttp.ClientTimeout(total=10)
                )
        except Exception as e:
            logger.error(f"Failed to send webhook notification: {e}")

    async def cancel_batch(self, batch_id: str) -> bool:
        """Cancel a running batch"""
        if batch_id in self.progress_data:
            progress = self.progress_data[batch_id]
            progress.status = ProcessingStatus.FAILED
            progress.error_messages.append("Batch cancelled by user")
            progress.end_time = datetime.utcnow()
            await self._update_progress_redis(progress)
            return True
        return False

    def cleanup(self):
        """Clean up resources"""
        self.optimizer.cleanup()
        if self.redis_client:
            asyncio.create_task(self.disconnect())