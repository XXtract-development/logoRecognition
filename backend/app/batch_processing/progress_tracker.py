"""Real-time progress tracking for batch jobs."""

import redis
import json
from typing import Dict, List, Optional
from datetime import datetime
import asyncio
import logging
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)

@dataclass
class JobProgress:
    """Job progress data model."""
    job_id: str
    status: str
    total: int
    completed: int
    failed: int = 0
    percentage: float = 0.0
    estimated_time_remaining: Optional[int] = None
    started_at: Optional[str] = None
    updated_at: Optional[str] = None
    error: Optional[str] = None

class ProgressTracker:
    """Track and monitor batch job progress in real-time."""

    def __init__(self, redis_host='localhost', redis_port=6379, redis_db=2):
        self.redis_client = redis.Redis(
            host=redis_host,
            port=redis_port,
            db=redis_db,
            decode_responses=True
        )
        self.pubsub = self.redis_client.pubsub()
        self.subscribers = {}

    async def track_job(self, job_id: str) -> JobProgress:
        """
        Get current progress for a job.

        Args:
            job_id: Job identifier

        Returns:
            JobProgress object with current status
        """
        key = f"job:{job_id}"
        data = self.redis_client.get(key)

        if not data:
            return JobProgress(
                job_id=job_id,
                status='not_found',
                total=0,
                completed=0
            )

        job_data = json.loads(data)

        # Calculate percentage
        total = job_data.get('total', 0)
        completed = job_data.get('completed', 0)
        percentage = (completed / total * 100) if total > 0 else 0

        # Estimate time remaining
        estimated_time = self._estimate_time_remaining(job_data)

        return JobProgress(
            job_id=job_id,
            status=job_data.get('status', 'unknown'),
            total=total,
            completed=completed,
            failed=job_data.get('failed', 0),
            percentage=percentage,
            estimated_time_remaining=estimated_time,
            started_at=job_data.get('created_at'),
            updated_at=job_data.get('updated_at'),
            error=job_data.get('error')
        )

    async def subscribe_to_progress(
        self,
        job_id: str,
        callback=None
    ) -> asyncio.Queue:
        """
        Subscribe to real-time progress updates.

        Args:
            job_id: Job identifier
            callback: Optional callback function for updates

        Returns:
            AsyncIO queue receiving progress updates
        """
        channel = f"job_progress:{job_id}"
        self.pubsub.subscribe(channel)

        # Create queue for updates
        update_queue = asyncio.Queue()

        # Start listener task
        asyncio.create_task(
            self._listen_for_updates(job_id, update_queue, callback)
        )

        self.subscribers[job_id] = {
            'queue': update_queue,
            'callback': callback
        }

        return update_queue

    async def _listen_for_updates(
        self,
        job_id: str,
        queue: asyncio.Queue,
        callback=None
    ):
        """Listen for progress updates on Redis pubsub."""
        try:
            while job_id in self.subscribers:
                message = self.pubsub.get_message(timeout=1.0)

                if message and message['type'] == 'message':
                    data = json.loads(message['data'])
                    progress = await self.track_job(job_id)

                    # Put in queue
                    await queue.put(asdict(progress))

                    # Call callback if provided
                    if callback:
                        await callback(progress)

                    # Stop if job is complete or failed
                    if progress.status in ['completed', 'failed']:
                        break

                await asyncio.sleep(0.1)

        except Exception as e:
            logger.error(f"Error in progress listener: {str(e)}")
        finally:
            self.unsubscribe(job_id)

    def unsubscribe(self, job_id: str):
        """Unsubscribe from job progress updates."""
        if job_id in self.subscribers:
            channel = f"job_progress:{job_id}"
            self.pubsub.unsubscribe(channel)
            del self.subscribers[job_id]

    async def get_all_jobs(
        self,
        status_filter: Optional[str] = None,
        limit: int = 100
    ) -> List[JobProgress]:
        """
        Get all jobs with optional status filter.

        Args:
            status_filter: Filter by status (processing, completed, failed)
            limit: Maximum number of jobs to return

        Returns:
            List of JobProgress objects
        """
        job_keys = self.redis_client.keys('job:*')
        jobs = []

        for key in job_keys[:limit]:
            job_id = key.split(':')[1]
            progress = await self.track_job(job_id)

            if status_filter is None or progress.status == status_filter:
                jobs.append(progress)

        # Sort by updated_at descending
        jobs.sort(
            key=lambda x: x.updated_at or '',
            reverse=True
        )

        return jobs

    def get_job_chunks(self, job_id: str) -> List[Dict]:
        """
        Get chunk-level progress for a job.

        Args:
            job_id: Job identifier

        Returns:
            List of chunk progress dictionaries
        """
        chunk_keys = self.redis_client.keys(f"chunk:{job_id}:*")
        chunks = []

        for key in chunk_keys:
            data = self.redis_client.get(key)
            if data:
                chunk_data = json.loads(data)
                chunks.append(chunk_data)

        # Sort by chunk index
        chunks.sort(key=lambda x: x.get('chunk_idx', 0))

        return chunks

    def _estimate_time_remaining(self, job_data: Dict) -> Optional[int]:
        """
        Estimate remaining time based on progress rate.

        Args:
            job_data: Job data dictionary

        Returns:
            Estimated seconds remaining or None
        """
        try:
            created_at = job_data.get('created_at')
            if not created_at:
                return None

            start_time = datetime.fromisoformat(created_at)
            current_time = datetime.now()
            elapsed = (current_time - start_time).total_seconds()

            completed = job_data.get('completed', 0)
            total = job_data.get('total', 0)

            if completed == 0 or completed >= total:
                return None

            # Calculate rate and estimate
            rate = completed / elapsed
            remaining = total - completed
            estimated_seconds = remaining / rate

            return int(estimated_seconds)

        except:
            return None

    async def cancel_job(self, job_id: str) -> bool:
        """
        Cancel a running job.

        Args:
            job_id: Job identifier

        Returns:
            True if cancelled successfully
        """
        from celery.result import AsyncResult
        from ..celery_app import app

        try:
            # Get task ID from job data
            job_data = self.redis_client.get(f"job:{job_id}")
            if not job_data:
                return False

            data = json.loads(job_data)
            task_id = data.get('task_id')

            if task_id:
                # Cancel Celery task
                result = AsyncResult(task_id, app=app)
                result.revoke(terminate=True)

                # Update job status
                data['status'] = 'cancelled'
                data['updated_at'] = datetime.now().isoformat()
                self.redis_client.set(f"job:{job_id}", json.dumps(data))

                # Publish cancellation
                self.redis_client.publish(
                    f"job_progress:{job_id}",
                    json.dumps(data)
                )

                return True

            return False

        except Exception as e:
            logger.error(f"Failed to cancel job {job_id}: {str(e)}")
            return False

    def get_job_statistics(self, job_id: str) -> Dict:
        """
        Get detailed statistics for a job.

        Args:
            job_id: Job identifier

        Returns:
            Dictionary with job statistics
        """
        job_data = self.redis_client.get(f"job:{job_id}")
        if not job_data:
            return {}

        data = json.loads(job_data)
        chunks = self.get_job_chunks(job_id)

        # Calculate statistics
        total_chunks = len(chunks)
        completed_chunks = sum(
            1 for c in chunks
            if c.get('completed', 0) == c.get('total', 0)
        )

        # Processing time
        created_at = data.get('created_at')
        updated_at = data.get('updated_at')
        processing_time = None

        if created_at and updated_at:
            start = datetime.fromisoformat(created_at)
            end = datetime.fromisoformat(updated_at)
            processing_time = (end - start).total_seconds()

        return {
            'job_id': job_id,
            'status': data.get('status'),
            'total_images': data.get('total', 0),
            'processed_images': data.get('completed', 0),
            'failed_images': data.get('failed', 0),
            'total_chunks': total_chunks,
            'completed_chunks': completed_chunks,
            'processing_time_seconds': processing_time,
            'average_time_per_image': (
                processing_time / data.get('completed', 1)
                if processing_time and data.get('completed', 0) > 0
                else None
            ),
            'success_rate': (
                (data.get('completed', 0) - data.get('failed', 0)) /
                data.get('completed', 1) * 100
                if data.get('completed', 0) > 0
                else 0
            )
        }

# WebSocket support for real-time updates
class ProgressWebSocket:
    """WebSocket handler for real-time progress updates."""

    def __init__(self, tracker: ProgressTracker):
        self.tracker = tracker
        self.connections = {}

    async def handle_connection(self, websocket, path):
        """Handle WebSocket connection."""
        job_id = path.strip('/').split('/')[-1]

        # Store connection
        self.connections[job_id] = websocket

        try:
            # Send initial progress
            progress = await self.tracker.track_job(job_id)
            await websocket.send(json.dumps(asdict(progress)))

            # Subscribe to updates
            queue = await self.tracker.subscribe_to_progress(
                job_id,
                callback=lambda p: self._send_update(websocket, p)
            )

            # Keep connection alive
            async for message in websocket:
                # Handle client messages if needed
                pass

        except Exception as e:
            logger.error(f"WebSocket error: {str(e)}")
        finally:
            # Clean up
            if job_id in self.connections:
                del self.connections[job_id]
            self.tracker.unsubscribe(job_id)

    async def _send_update(self, websocket, progress: JobProgress):
        """Send progress update via WebSocket."""
        try:
            await websocket.send(json.dumps(asdict(progress)))
        except:
            pass  # Connection closed