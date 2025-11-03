"""Batch processing service for handling large-scale image operations."""

import uuid
from typing import List, Dict, Optional, Any
from datetime import datetime, timedelta
import logging
import json
import asyncio
from fastapi import UploadFile

from ..batch_processing.tasks import process_batch, generate_report
from ..batch_processing.progress_tracker import ProgressTracker, JobProgress
from ..batch_processing.priority_manager import PriorityManager
from ..models.batch_job import BatchJob, BatchStatus
from ..database import get_session

logger = logging.getLogger(__name__)

class BatchService:
    """Service for managing batch processing operations."""

    def __init__(self):
        self.progress_tracker = ProgressTracker()
        self.priority_manager = PriorityManager()
        self.cache_ttl = 86400  # 24 hours cache TTL
        self.result_cache = {}  # Simple in-memory cache

    async def create_batch_job(
        self,
        images: List[Dict],
        user_id: str,
        options: Optional[Dict] = None
    ) -> str:
        """
        Create and submit a new batch processing job.

        Args:
            images: List of image dictionaries
            user_id: User identifier
            options: Processing options

        Returns:
            Job ID
        """
        # Generate job ID
        job_id = str(uuid.uuid4())

        # Set default options
        options = options or {}
        options.setdefault('chunk_size', 10)
        options.setdefault('model_version', 'latest')
        options.setdefault('confidence_threshold', 0.5)

        # Auto-determine priority
        job_data = {
            'job_id': job_id,
            'user_id': user_id,
            'total': len(images),
            'user_type': options.get('user_type', 'free')
        }
        priority = self.priority_manager.auto_prioritize(job_data)
        options['priority'] = options.get('priority', priority)

        # Check rate limits
        if not self.priority_manager.enforce_rate_limits(user_id, options['priority']):
            raise ValueError("Rate limit exceeded for this priority level")

        # Store job in database
        session = next(get_session())
        try:
            batch_job = BatchJob(
                id=job_id,
                user_id=user_id,
                status=BatchStatus.PENDING,
                total_images=len(images),
                processed_images=0,
                failed_images=0,
                priority=options['priority'],
                options=json.dumps(options),
                created_at=datetime.now()
            )
            session.add(batch_job)
            session.commit()
        finally:
            session.close()

        # Submit to Celery
        task = process_batch.apply_async(
            args=[job_id, images, options],
            priority=self.priority_manager.get_job_priority(job_id)['priority_value']
        )

        # Store task ID for tracking
        job_data.update({
            'task_id': task.id,
            'status': 'queued',
            'created_at': datetime.now().isoformat(),
            'options': options
        })

        # Store in Redis for tracking
        from ..batch_processing.tasks import update_job_progress
        update_job_progress(job_id, **job_data)

        logger.info(f"Created batch job {job_id} with {len(images)} images")

        return job_id

    async def upload_batch_images(
        self,
        files: List[UploadFile],
        user_id: str,
        options: Optional[Dict] = None
    ) -> str:
        """
        Upload and process batch images.

        Args:
            files: List of uploaded files
            user_id: User identifier
            options: Processing options

        Returns:
            Job ID
        """
        images = []

        # Save uploaded files
        import os
        import aiofiles

        upload_dir = f"/tmp/batch_uploads/{user_id}"
        os.makedirs(upload_dir, exist_ok=True)

        for idx, file in enumerate(files):
            # Generate unique filename
            file_id = f"{uuid.uuid4()}_{file.filename}"
            file_path = os.path.join(upload_dir, file_id)

            # Save file
            async with aiofiles.open(file_path, 'wb') as f:
                content = await file.read()
                await f.write(content)

            images.append({
                'id': file_id,
                'path': file_path,
                'original_name': file.filename,
                'size': len(content)
            })

        # Create batch job
        return await self.create_batch_job(images, user_id, options)

    async def get_job_progress(self, job_id: str) -> JobProgress:
        """
        Get current progress for a job.

        Args:
            job_id: Job identifier

        Returns:
            JobProgress object
        """
        return await self.progress_tracker.track_job(job_id)

    async def subscribe_to_progress(
        self,
        job_id: str,
        callback=None
    ) -> asyncio.Queue:
        """
        Subscribe to real-time progress updates.

        Args:
            job_id: Job identifier
            callback: Optional callback function

        Returns:
            AsyncIO queue for updates
        """
        return await self.progress_tracker.subscribe_to_progress(job_id, callback)

    async def cancel_job(self, job_id: str) -> bool:
        """
        Cancel a running job.

        Args:
            job_id: Job identifier

        Returns:
            True if cancelled successfully
        """
        success = await self.progress_tracker.cancel_job(job_id)

        if success:
            # Update database
            session = next(get_session())
            try:
                job = session.query(BatchJob).filter_by(id=job_id).first()
                if job:
                    job.status = BatchStatus.CANCELLED
                    job.updated_at = datetime.now()
                    session.commit()
            finally:
                session.close()

        return success

    async def change_priority(
        self,
        job_id: str,
        new_priority: str,
        reason: Optional[str] = None
    ) -> bool:
        """
        Change job priority.

        Args:
            job_id: Job identifier
            new_priority: New priority level
            reason: Reason for change

        Returns:
            True if priority changed successfully
        """
        # Update priority
        success = self.priority_manager.set_job_priority(job_id, new_priority, reason)

        if success:
            # Check if job needs requeuing
            progress = await self.get_job_progress(job_id)
            if progress.status in ['queued', 'pending']:
                # Requeue with new priority
                self.priority_manager.requeue_job(job_id, new_priority)

            # Update database
            session = next(get_session())
            try:
                job = session.query(BatchJob).filter_by(id=job_id).first()
                if job:
                    job.priority = new_priority
                    job.updated_at = datetime.now()
                    session.commit()
            finally:
                session.close()

        return success

    async def get_job_results(
        self,
        job_id: str,
        format: str = 'json'
    ) -> Dict:
        """
        Get job results in specified format.

        Args:
            job_id: Job identifier
            format: Output format (json, csv, excel)

        Returns:
            Results dictionary or file path
        """
        # Generate report
        report_task = generate_report.apply_async(args=[job_id, format])
        report = report_task.get(timeout=30)

        # Update database with report path if applicable
        if format in ['csv', 'excel']:
            session = next(get_session())
            try:
                job = session.query(BatchJob).filter_by(id=job_id).first()
                if job:
                    job.result_path = report.get('path')
                    session.commit()
            finally:
                session.close()

        return report

    async def get_user_jobs(
        self,
        user_id: str,
        status_filter: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict]:
        """
        Get jobs for a specific user.

        Args:
            user_id: User identifier
            status_filter: Optional status filter
            limit: Maximum number of jobs

        Returns:
            List of job dictionaries
        """
        session = next(get_session())
        try:
            query = session.query(BatchJob).filter_by(user_id=user_id)

            if status_filter:
                query = query.filter_by(status=status_filter)

            jobs = query.order_by(BatchJob.created_at.desc()).limit(limit).all()

            return [
                {
                    'job_id': job.id,
                    'status': job.status.value,
                    'total_images': job.total_images,
                    'processed_images': job.processed_images,
                    'failed_images': job.failed_images,
                    'priority': job.priority,
                    'created_at': job.created_at.isoformat(),
                    'updated_at': job.updated_at.isoformat() if job.updated_at else None
                }
                for job in jobs
            ]
        finally:
            session.close()

    async def get_queue_statistics(self) -> Dict:
        """
        Get queue statistics and system status.

        Returns:
            Dictionary with queue statistics
        """
        # Get queue status
        queue_status = self.priority_manager.get_queue_status()

        # Get priority statistics
        priority_stats = self.priority_manager.get_priority_statistics()

        # Get active jobs
        active_jobs = await self.progress_tracker.get_all_jobs(status_filter='processing')

        return {
            'queues': queue_status,
            'priorities': priority_stats,
            'active_jobs': len(active_jobs),
            'system_status': 'operational'  # Could be enhanced with health checks
        }

    async def retry_failed_images(
        self,
        job_id: str,
        failed_only: bool = True
    ) -> str:
        """
        Retry failed images from a job.

        Args:
            job_id: Original job identifier
            failed_only: Only retry failed images

        Returns:
            New job ID for retry
        """
        # Get original job results
        progress = await self.get_job_progress(job_id)

        if progress.status != 'completed':
            raise ValueError("Can only retry completed jobs")

        # Get failed images
        results = await self.get_job_results(job_id)
        failed_images = []

        for result in results.get('results', []):
            if result.get('status') == 'failed' or not failed_only:
                # Reconstruct image data
                failed_images.append({
                    'id': result.get('image_id'),
                    'path': result.get('image_path')
                })

        if not failed_images:
            raise ValueError("No failed images to retry")

        # Create new job for retry
        session = next(get_session())
        try:
            original_job = session.query(BatchJob).filter_by(id=job_id).first()
            user_id = original_job.user_id if original_job else 'unknown'

            # Parse original options
            options = json.loads(original_job.options) if original_job else {}
            options['retry_of'] = job_id

            # Create new job
            new_job_id = await self.create_batch_job(
                failed_images,
                user_id,
                options
            )

            logger.info(f"Created retry job {new_job_id} for {len(failed_images)} images from job {job_id}")

            return new_job_id
        finally:
            session.close()

    async def cleanup_old_jobs(self, days: int = 7) -> int:
        """
        Clean up old job data.

        Args:
            days: Number of days to retain

        Returns:
            Number of jobs cleaned up
        """
        from ..batch_processing.tasks import cleanup_old_jobs

        # Run cleanup task
        cleanup_task = cleanup_old_jobs.apply_async(args=[days])
        result = cleanup_task.get(timeout=60)

        # Also cleanup database
        session = next(get_session())
        try:
            cutoff = datetime.now() - timedelta(days=days)
            deleted = session.query(BatchJob).filter(
                BatchJob.created_at < cutoff
            ).delete()
            session.commit()

            logger.info(f"Cleaned up {deleted} old jobs from database")

            return result.get('deleted', 0)
        finally:
            session.close()

    def create_job_record(
        self,
        job_id: str,
        task_id: str,
        user_id: str,
        total_images: int,
        options: Dict
    ) -> BatchJob:
        """Create a job record in the database."""
        session = next(get_session())
        try:
            batch_job = BatchJob(
                id=job_id,
                task_id=task_id,
                user_id=user_id,
                status=BatchStatus.PENDING,
                total_images=total_images,
                processed_images=0,
                failed_images=0,
                priority=options.get('priority', 'normal'),
                options=json.dumps(options),
                created_at=datetime.now()
            )
            session.add(batch_job)
            session.commit()
            return batch_job
        finally:
            session.close()

    def get_job(self, job_id: str) -> Optional[BatchJob]:
        """Get a job from the database."""
        session = next(get_session())
        try:
            return session.query(BatchJob).filter_by(id=job_id).first()
        finally:
            session.close()

    def get_queue_position(self, job_id: str) -> int:
        """Get position of job in queue."""
        # This would check Redis queue position
        # For now, return a mock value
        return 1

    def estimate_processing_time(self, num_images: int) -> int:
        """Estimate processing time in seconds."""
        # Rough estimate: 2 seconds per image
        return num_images * 2

    def estimate_remaining_time(self, job_id: str) -> int:
        """Estimate remaining time for a job."""
        job = self.get_job(job_id)
        if job:
            remaining = job.total_images - job.processed_images
            return self.estimate_processing_time(remaining)
        return 0

    def get_chunk_progress(self, job_id: str) -> List[Dict]:
        """Get progress for all chunks of a job."""
        # This would query Redis for chunk progress
        return []

    def get_job_metrics(self, job_id: str) -> Dict:
        """Get performance metrics for a job."""
        return self.progress_tracker.get_metrics(job_id)

    def get_job_images(self, job_id: str) -> Optional[List[Dict]]:
        """Retrieve original images for a job."""
        # This would retrieve from storage
        return []

    def update_job_task(self, job_id: str, task_id: str):
        """Update job's task ID."""
        session = next(get_session())
        try:
            job = session.query(BatchJob).filter_by(id=job_id).first()
            if job:
                job.task_id = task_id
                job.updated_at = datetime.now()
                session.commit()
        finally:
            session.close()

    def update_job_priority(self, job_id: str, priority: str, task_id: str):
        """Update job priority and task ID."""
        session = next(get_session())
        try:
            job = session.query(BatchJob).filter_by(id=job_id).first()
            if job:
                job.priority = priority
                job.task_id = task_id
                job.updated_at = datetime.now()
                session.commit()
        finally:
            session.close()

    def cancel_job(self, job_id: str):
        """Mark a job as cancelled."""
        session = next(get_session())
        try:
            job = session.query(BatchJob).filter_by(id=job_id).first()
            if job:
                job.status = BatchStatus.CANCELLED
                job.updated_at = datetime.now()
                session.commit()
        finally:
            session.close()

    def retry_job(self, job_id: str, only_failed: bool = True) -> str:
        """Create a retry job."""
        new_job_id = f"batch_{uuid.uuid4().hex}"
        # Implementation would copy job details and create new job
        return new_job_id

    def get_user_jobs(
        self,
        user_id: str,
        page: int,
        page_size: int,
        status_filter: Optional[str] = None
    ) -> Dict:
        """Get paginated user jobs."""
        session = next(get_session())
        try:
            query = session.query(BatchJob).filter_by(user_id=user_id)

            if status_filter:
                query = query.filter_by(status=status_filter)

            total = query.count()
            offset = (page - 1) * page_size

            jobs = query.order_by(BatchJob.created_at.desc()).offset(offset).limit(page_size).all()

            return {
                'total': total,
                'items': [
                    {
                        'job_id': job.id,
                        'status': job.status.value if hasattr(job.status, 'value') else job.status,
                        'total_images': job.total_images,
                        'processed_images': job.processed_images,
                        'failed_images': job.failed_images,
                        'priority': job.priority,
                        'created_at': job.created_at.isoformat(),
                        'updated_at': job.updated_at.isoformat() if job.updated_at else None
                    }
                    for job in jobs
                ],
                'has_next': (offset + page_size) < total
            }
        finally:
            session.close()

    def get_system_stats(self) -> Dict:
        """Get system-wide statistics."""
        session = next(get_session())
        try:
            today = datetime.now().date()

            # Count jobs processed today
            today_count = session.query(BatchJob).filter(
                BatchJob.created_at >= today
            ).count()

            # Calculate success rate
            completed = session.query(BatchJob).filter_by(status=BatchStatus.COMPLETED).count()
            total = session.query(BatchJob).count()
            success_rate = (completed / max(total, 1)) * 100

            return {
                'total_processed_today': today_count,
                'success_rate': success_rate,
                'avg_processing_time': 120,  # Mock value
                'peak_hour': 14,  # Mock value
                'total_users': session.query(BatchJob.user_id).distinct().count()
            }
        finally:
            session.close()

    def check_database_connection(self) -> bool:
        """Check if database is accessible."""
        try:
            session = next(get_session())
            session.execute("SELECT 1")
            session.close()
            return True
        except:
            return False

    def count_old_jobs(self, days: int) -> int:
        """Count jobs older than specified days."""
        session = next(get_session())
        try:
            cutoff = datetime.now() - timedelta(days=days)
            return session.query(BatchJob).filter(
                BatchJob.created_at < cutoff
            ).count()
        finally:
            session.close()

    def get_metrics(self, start_time: datetime) -> Dict:
        """Get metrics for a time range."""
        session = next(get_session())
        try:
            jobs = session.query(BatchJob).filter(
                BatchJob.created_at >= start_time
            ).all()

            total_jobs = len(jobs)
            total_images = sum(job.total_images for job in jobs)
            avg_job_size = total_images / max(total_jobs, 1)

            completed = sum(1 for job in jobs if job.status == BatchStatus.COMPLETED)
            success_rate = (completed / max(total_jobs, 1)) * 100

            return {
                'total_jobs': total_jobs,
                'total_images': total_images,
                'avg_job_size': avg_job_size,
                'success_rate': success_rate,
                'avg_processing_time': 120,  # Mock value
                'peak_load': {'hour': 14, 'jobs': 50}  # Mock value
            }
        finally:
            session.close()

    def get_queue_status(self) -> Dict:
        """Get current queue status."""
        return {
            'high': self.progress_tracker.get_queue_depth('batch_high'),
            'normal': self.progress_tracker.get_queue_depth('batch_normal'),
            'low': self.progress_tracker.get_queue_depth('batch_low'),
            'total_active': len(self.progress_tracker.get_active_jobs())
        }

    def get_job_results(self, job_id: str, include_failed: bool = True) -> List[Dict]:
        """Get job results from Redis."""
        from ..batch_processing.tasks import get_job_progress

        job_data = get_job_progress(job_id)
        if not job_data:
            return []

        results = job_data.get('results', [])

        if not include_failed:
            results = [r for r in results if r.get('status') == 'success']

        return results

    def cache_results(self, job_id: str, results: Dict) -> None:
        """Cache batch processing results."""
        self.result_cache[job_id] = {
            'results': results,
            'timestamp': datetime.now(),
            'expires_at': datetime.now() + timedelta(seconds=self.cache_ttl)
        }

    def get_cached_results(self, job_id: str) -> Optional[Dict]:
        """Get cached batch results if available and not expired."""
        if job_id in self.result_cache:
            cached = self.result_cache[job_id]
            if datetime.now() < cached['expires_at']:
                return cached['results']
            else:
                # Remove expired cache
                del self.result_cache[job_id]
        return None

    def cleanup_expired_cache(self) -> int:
        """Clean up expired cache entries."""
        expired_keys = []
        now = datetime.now()
        for job_id, cached in self.result_cache.items():
            if now >= cached['expires_at']:
                expired_keys.append(job_id)

        for key in expired_keys:
            del self.result_cache[key]

        return len(expired_keys)

    def list_user_jobs(
        self,
        user_id: str,
        status: Optional[str] = None,
        limit: int = 10,
        offset: int = 0
    ) -> List[Dict]:
        """List batch jobs for a user."""
        session = next(get_session())
        try:
            query = session.query(BatchJob).filter_by(user_id=user_id)
            if status:
                query = query.filter_by(status=status)

            jobs = query.order_by(BatchJob.created_at.desc()).offset(offset).limit(limit).all()

            return [
                {
                    'job_id': job.id,
                    'status': job.status.value if hasattr(job.status, 'value') else job.status,
                    'total_images': job.total_images,
                    'processed_images': job.processed_images,
                    'failed_images': job.failed_images,
                    'priority': job.priority,
                    'created_at': job.created_at.isoformat(),
                }
                for job in jobs
            ]
        finally:
            session.close()