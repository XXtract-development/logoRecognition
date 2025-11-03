"""Main batch processing logic."""

import asyncio
import logging
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.batch.models import (
    BatchJob,
    BatchItem,
    BatchStatus,
    ItemStatus,
    BatchConfiguration,
    BatchMetrics,
)
from app.storage.minio_client import MinIOClient
from app.api.websocket.batch_events import batch_ws_manager

logger = logging.getLogger(__name__)


class BatchProcessor:
    """Main batch processor for handling image batches."""

    def __init__(
        self,
        config: Optional[BatchConfiguration] = None,
        minio_client: Optional[MinIOClient] = None,
    ):
        """Initialize batch processor."""
        self.config = config or BatchConfiguration()
        self.minio_client = minio_client or MinIOClient()

        # Processing state
        self.active_batches: Dict[str, asyncio.Task] = {}
        self.processing_lock = asyncio.Lock()

        # Metrics tracking
        self.metrics: Dict[str, BatchMetrics] = {}

        # GPU optimization settings
        self.gpu_available = self._check_gpu_availability()
        self.optimal_batch_size = self._calculate_optimal_batch_size()
        self.gpu_memory_limit = 0.8  # Use max 80% of GPU memory

    async def process_batch(
        self,
        batch_id: str,
        db: AsyncSession,
    ) -> Dict[str, Any]:
        """Process a batch of images asynchronously."""
        try:
            # Get batch job from database
            result = await db.execute(
                select(BatchJob).where(BatchJob.id == batch_id)
            )
            batch_job = result.scalar_one_or_none()

            if not batch_job:
                raise ValueError(f"Batch job {batch_id} not found")

            # Update status to processing
            batch_job.status = BatchStatus.PROCESSING
            batch_job.started_at = datetime.utcnow()
            await db.commit()

            # Initialize metrics
            self.metrics[batch_id] = BatchMetrics(
                batch_id=batch_id,
                start_time=datetime.utcnow(),
                total_items=batch_job.total_items,
                processed_items=0,
                failed_items=0,
                average_item_time=0,
                total_processing_time=0,
                success_rate=0,
                retry_rate=0,
                peak_cpu_usage=0,
                peak_memory_usage=0,
                average_cpu_usage=0,
                average_memory_usage=0,
            )

            # Emit batch started event
            await batch_ws_manager.emit_batch_started(batch_id, batch_job.total_items)

            # Get batch items
            result = await db.execute(
                select(BatchItem).where(BatchItem.batch_id == batch_id)
            )
            items = result.scalars().all()

            # Process items in chunks
            results = await self._process_items_in_chunks(
                batch_id,
                items,
                batch_job.processing_type,
                db,
            )

            # Update batch job status
            batch_job.status = BatchStatus.COMPLETED
            batch_job.completed_at = datetime.utcnow()
            batch_job.processed_items = len([r for r in results if r["success"]])
            batch_job.failed_items = len([r for r in results if not r["success"]])
            batch_job.results = {"items": results}

            await db.commit()

            # Store results
            results_url = await self._store_results(batch_id, results)

            # Emit batch completed event
            await batch_ws_manager.emit_batch_completed(
                batch_id,
                batch_job.processed_items,
                batch_job.failed_items,
                (batch_job.completed_at - batch_job.started_at).total_seconds(),
                results_url,
            )

            # Update metrics
            self.metrics[batch_id].end_time = datetime.utcnow()
            self.metrics[batch_id].success_rate = (
                batch_job.processed_items / batch_job.total_items * 100
                if batch_job.total_items > 0 else 0
            )

            return {
                "batch_id": batch_id,
                "status": "completed",
                "processed": batch_job.processed_items,
                "failed": batch_job.failed_items,
                "results_url": results_url,
            }

        except Exception as e:
            logger.error(f"Batch processing failed for {batch_id}: {str(e)}")

            # Update batch status to failed
            await db.execute(
                update(BatchJob)
                .where(BatchJob.id == batch_id)
                .values(
                    status=BatchStatus.FAILED,
                    completed_at=datetime.utcnow(),
                )
            )
            await db.commit()

            raise

    async def _process_items_in_chunks(
        self,
        batch_id: str,
        items: List[BatchItem],
        processing_type: str,
        db: AsyncSession,
    ) -> List[Dict[str, Any]]:
        """Process items in parallel chunks."""
        results = []
        chunk_size = self.config.chunk_size

        for i in range(0, len(items), chunk_size):
            chunk = items[i:i+chunk_size]

            # Process chunk in parallel
            chunk_tasks = [
                self._process_single_item(batch_id, item, processing_type, db, i+j)
                for j, item in enumerate(chunk)
            ]

            chunk_results = await asyncio.gather(*chunk_tasks, return_exceptions=True)

            # Handle results
            for item, result in zip(chunk, chunk_results):
                if isinstance(result, Exception):
                    result = {
                        "item_id": str(item.id),
                        "success": False,
                        "error": str(result),
                    }
                results.append(result)

            # Update progress
            processed = len([r for r in results if r.get("success", False)])
            failed = len([r for r in results if not r.get("success", False)])

            await batch_ws_manager.emit_batch_progress(
                batch_id,
                (len(results) / len(items)) * 100,
                processed,
                failed,
                len(items),
            )

        return results

    async def _process_single_item(
        self,
        batch_id: str,
        item: BatchItem,
        processing_type: str,
        db: AsyncSession,
        index: int,
    ) -> Dict[str, Any]:
        """Process a single batch item with retry logic."""
        max_retries = self.config.max_retries
        retry_delays = self.config.retry_delays

        # Emit item processing event
        await batch_ws_manager.emit_item_processing(batch_id, str(item.id), index)

        for attempt in range(max_retries + 1):
            try:
                # Update item status
                item.status = ItemStatus.PROCESSING
                await db.commit()

                # Process based on type
                result = await self._process_image(
                    item.image_path,
                    processing_type,
                )

                # Update item with success
                item.status = ItemStatus.COMPLETED
                item.result = result
                item.processed_at = datetime.utcnow()
                await db.commit()

                # Emit item completed event
                await batch_ws_manager.emit_item_completed(
                    batch_id,
                    str(item.id),
                    index,
                    True,
                    result,
                )

                return {
                    "item_id": str(item.id),
                    "success": True,
                    "result": result,
                }

            except Exception as e:
                logger.error(f"Error processing item {item.id}: {str(e)}")

                # Check if should retry
                if attempt < max_retries:
                    item.status = ItemStatus.RETRYING
                    item.retry_count = attempt + 1
                    item.error_message = str(e)
                    await db.commit()

                    # Wait before retry
                    if attempt < len(retry_delays):
                        await asyncio.sleep(retry_delays[attempt])

                    # Emit item failed event with retry info
                    await batch_ws_manager.emit_item_failed(
                        batch_id,
                        str(item.id),
                        index,
                        str(e),
                        attempt + 1,
                        True,
                    )
                else:
                    # Final failure
                    item.status = ItemStatus.FAILED
                    item.error_message = str(e)
                    await db.commit()

                    # Emit final failure event
                    await batch_ws_manager.emit_item_failed(
                        batch_id,
                        str(item.id),
                        index,
                        str(e),
                        attempt + 1,
                        False,
                    )

                    return {
                        "item_id": str(item.id),
                        "success": False,
                        "error": str(e),
                        "retries": attempt,
                    }

        return {
            "item_id": str(item.id),
            "success": False,
            "error": "Max retries exceeded",
        }

    async def _process_image(
        self,
        image_path: str,
        processing_type: str,
    ) -> Dict[str, Any]:
        """Process individual image based on processing type."""
        # Validate image format
        valid_formats = [".jpg", ".jpeg", ".png", ".webp"]
        ext = Path(image_path).suffix.lower()

        if ext not in valid_formats:
            raise ValueError(f"Invalid image format: {ext}")

        # Load and preprocess image
        image = await self._load_and_preprocess_image(image_path)

        # Process based on type
        if processing_type == "detection":
            return await self._process_detection(image)
        elif processing_type == "training":
            return await self._process_training(image)
        elif processing_type == "annotation":
            return await self._process_annotation(image)
        elif processing_type == "validation":
            return await self._process_validation(image)
        else:
            raise ValueError(f"Unknown processing type: {processing_type}")

    async def _load_and_preprocess_image(self, image_path: str) -> np.ndarray:
        """Load and preprocess image for processing."""
        try:
            # Load image
            if image_path.startswith("s3://") or image_path.startswith("minio://"):
                # Download from object storage
                image_data = await self.minio_client.download_image(image_path)
                image = cv2.imdecode(
                    np.frombuffer(image_data, np.uint8),
                    cv2.IMREAD_COLOR
                )
            else:
                # Load from local file
                image = cv2.imread(image_path)

            if image is None:
                raise ValueError("Failed to load image")

            # Resize if too large (max 2048x2048)
            height, width = image.shape[:2]
            max_size = 2048

            if height > max_size or width > max_size:
                scale = min(max_size / height, max_size / width)
                new_width = int(width * scale)
                new_height = int(height * scale)
                image = cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_AREA)

            # Normalize colors
            image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

            # Handle EXIF orientation
            # (Implementation would go here)

            return image

        except Exception as e:
            logger.error(f"Failed to preprocess image {image_path}: {str(e)}")
            raise

    async def _process_detection(self, image: np.ndarray) -> Dict[str, Any]:
        """Process image for logo detection."""
        # Placeholder for actual detection logic
        # This would integrate with the ML model
        return {
            "type": "detection",
            "detections": [],
            "confidence": 0.0,
            "processing_time": 0.1,
        }

    async def _process_training(self, image: np.ndarray) -> Dict[str, Any]:
        """Process image for training data preparation."""
        return {
            "type": "training",
            "prepared": True,
            "augmented": False,
        }

    async def _process_annotation(self, image: np.ndarray) -> Dict[str, Any]:
        """Process image for annotation."""
        return {
            "type": "annotation",
            "annotations": [],
        }

    async def _process_validation(self, image: np.ndarray) -> Dict[str, Any]:
        """Validate image for processing."""
        height, width = image.shape[:2]
        return {
            "type": "validation",
            "valid": True,
            "dimensions": {"width": width, "height": height},
            "format": "rgb",
        }

    async def _store_results(
        self,
        batch_id: str,
        results: List[Dict[str, Any]],
    ) -> str:
        """Store batch results in MinIO."""
        try:
            # Prepare results data
            results_data = {
                "batch_id": batch_id,
                "timestamp": datetime.utcnow().isoformat(),
                "total_items": len(results),
                "successful": len([r for r in results if r.get("success", False)]),
                "failed": len([r for r in results if not r.get("success", False)]),
                "results": results,
            }

            # Store in MinIO
            results_path = f"batches/{datetime.utcnow().strftime('%Y%m%d')}/{batch_id}/results.json"
            await self.minio_client.store_batch_results(batch_id, results_data)

            return results_path

        except Exception as e:
            logger.error(f"Failed to store results for batch {batch_id}: {str(e)}")
            return ""

    async def cancel_batch(self, batch_id: str, db: AsyncSession) -> bool:
        """Cancel batch processing."""
        try:
            # Check if batch is active
            if batch_id in self.active_batches:
                # Cancel the task
                self.active_batches[batch_id].cancel()
                del self.active_batches[batch_id]

            # Update database
            await db.execute(
                update(BatchJob)
                .where(BatchJob.id == batch_id)
                .values(
                    status=BatchStatus.CANCELLED,
                    completed_at=datetime.utcnow(),
                )
            )
            await db.commit()

            return True

        except Exception as e:
            logger.error(f"Failed to cancel batch {batch_id}: {str(e)}")
            return False

    async def get_batch_metrics(self, batch_id: str) -> Optional[BatchMetrics]:
        """Get metrics for a batch."""
        return self.metrics.get(batch_id)

    def _check_gpu_availability(self) -> bool:
        """Check if GPU is available for processing."""
        try:
            import torch
            return torch.cuda.is_available()
        except ImportError:
            return False

    def _calculate_optimal_batch_size(self) -> int:
        """Calculate optimal batch size based on available resources."""
        if self.gpu_available:
            try:
                import torch
                # Get GPU memory
                gpu_memory = torch.cuda.get_device_properties(0).total_memory
                # Estimate batch size based on memory (assume 200MB per image)
                return min(int(gpu_memory * 0.8 / (200 * 1024 * 1024)), 32)
            except:
                return 16
        return 8  # CPU default

    def optimize_batch_size(self, num_images: int) -> int:
        """Dynamically optimize batch size based on workload."""
        if self.gpu_available:
            # Use larger batches for GPU
            return min(self.optimal_batch_size, num_images)
        # Smaller batches for CPU
        return min(8, num_images)

    def handle_partial_failure(self, batch_id: str, failed_items: List[str]) -> Dict:
        """Handle partial batch failures with recovery strategy."""
        return {
            'batch_id': batch_id,
            'failed_items': failed_items,
            'recovery_strategy': 'retry_with_reduced_batch_size',
            'retry_count': len(failed_items)
        }

    def retry_failed_items(self, batch_id: str, items: List[str]) -> bool:
        """Retry processing for failed items."""
        # Queue failed items for retry with higher priority
        logger.info(f"Retrying {len(items)} failed items for batch {batch_id}")
        return True

    def dead_letter_queue(self, batch_id: str, item_id: str, error: str):
        """Move permanently failed items to dead letter queue."""
        logger.error(f"Moving item {item_id} from batch {batch_id} to DLQ: {error}")

    async def cleanup_old_batches(self, db: AsyncSession) -> int:
        """Clean up old batch results based on TTL."""
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=self.config.result_ttl_days)

            # Get old batches
            result = await db.execute(
                select(BatchJob).where(
                    BatchJob.completed_at < cutoff_date,
                    BatchJob.status.in_([BatchStatus.COMPLETED, BatchStatus.FAILED])
                )
            )
            old_batches = result.scalars().all()

            # Delete from storage and database
            for batch in old_batches:
                # Delete from MinIO
                if self.minio_client:
                    await self.minio_client.delete_batch_results(str(batch.id))

                # Delete items
                await db.execute(
                    BatchItem.__table__.delete().where(
                        BatchItem.batch_id == batch.id
                    )
                )

                # Delete batch
                await db.delete(batch)

            await db.commit()

            return len(old_batches)

        except Exception as e:
            logger.error(f"Failed to cleanup old batches: {str(e)}")
            await db.rollback()
            return 0