"""Priority queue management for batch processing."""

import redis
import json
from typing import Dict, List, Optional
from datetime import datetime
from enum import Enum
import logging

logger = logging.getLogger(__name__)

class Priority(Enum):
    """Job priority levels."""
    CRITICAL = 15
    HIGH = 10
    NORMAL = 5
    LOW = 1

class PriorityQueueManager:
    """Priority queue manager for batch processing jobs."""

    def __init__(self, redis_host='localhost', redis_port=6379, redis_db=2):
        self.redis_client = redis.Redis(
            host=redis_host,
            port=redis_port,
            db=redis_db,
            decode_responses=True
        )
        self.priorities = ['critical', 'high', 'normal', 'low']

    def add_job(self, job_id: str, priority: str = 'normal'):
        """Add job to priority queue."""
        priority_value = Priority[priority.upper()].value
        self.redis_client.zadd(f"queue:{priority}", {job_id: priority_value})
        return True

    def get_next_job(self) -> Optional[str]:
        """Get next job from highest priority queue."""
        for priority in self.priorities:
            job = self.redis_client.zpopmax(f"queue:{priority}")
            if job:
                return job[0][0] if job else None
        return None

    def update_priority(self, job_id: str, new_priority: str) -> bool:
        """Update job priority by moving to different queue."""
        # Remove from all queues
        for priority in self.priorities:
            self.redis_client.zrem(f"queue:{priority}", job_id)
        # Add to new queue
        return self.add_job(job_id, new_priority)

    def validate_priority(self, priority: str) -> bool:
        """Validate priority level."""
        return priority.lower() in self.priorities

class PriorityManager:
    """Manage job priorities and queue allocation."""

    def __init__(self, redis_host='localhost', redis_port=6379, redis_db=2):
        self.redis_client = redis.Redis(
            host=redis_host,
            port=redis_port,
            db=redis_db,
            decode_responses=True
        )

    def set_job_priority(
        self,
        job_id: str,
        priority: str,
        reason: Optional[str] = None
    ) -> bool:
        """
        Set or update job priority.

        Args:
            job_id: Job identifier
            priority: Priority level (critical, high, normal, low)
            reason: Optional reason for priority change

        Returns:
            True if priority was set successfully
        """
        try:
            priority_value = Priority[priority.upper()].value

            # Store priority information
            priority_data = {
                'job_id': job_id,
                'priority': priority,
                'priority_value': priority_value,
                'reason': reason,
                'updated_at': datetime.now().isoformat()
            }

            key = f"priority:{job_id}"
            self.redis_client.setex(
                key,
                86400,  # 24 hours
                json.dumps(priority_data)
            )

            # Update job data
            job_key = f"job:{job_id}"
            job_data = self.redis_client.get(job_key)
            if job_data:
                data = json.loads(job_data)
                data['priority'] = priority
                self.redis_client.set(job_key, json.dumps(data))

            logger.info(f"Set priority {priority} for job {job_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to set priority: {str(e)}")
            return False

    def get_job_priority(self, job_id: str) -> Dict:
        """
        Get job priority information.

        Args:
            job_id: Job identifier

        Returns:
            Priority information dictionary
        """
        key = f"priority:{job_id}"
        data = self.redis_client.get(key)

        if data:
            return json.loads(data)

        # Default priority
        return {
            'job_id': job_id,
            'priority': 'normal',
            'priority_value': Priority.NORMAL.value
        }

    def requeue_job(
        self,
        job_id: str,
        new_priority: str
    ) -> bool:
        """
        Requeue a job with new priority.

        Args:
            job_id: Job identifier
            new_priority: New priority level

        Returns:
            True if requeued successfully
        """
        try:
            from celery.result import AsyncResult
            from ..celery_app import app
            from .tasks import process_batch

            # Get job data
            job_data = self.redis_client.get(f"job:{job_id}")
            if not job_data:
                return False

            data = json.loads(job_data)

            # Cancel existing task if running
            task_id = data.get('task_id')
            if task_id:
                result = AsyncResult(task_id, app=app)
                result.revoke(terminate=False)

            # Update priority
            self.set_job_priority(job_id, new_priority, "Manual requeue")

            # Resubmit with new priority
            priority_value = Priority[new_priority.upper()].value

            new_task = process_batch.apply_async(
                args=[
                    job_id,
                    data.get('images', []),
                    {**data.get('options', {}), 'priority': new_priority}
                ],
                priority=priority_value
            )

            # Update job data with new task ID
            data['task_id'] = new_task.id
            data['status'] = 'requeued'
            data['priority'] = new_priority
            self.redis_client.set(f"job:{job_id}", json.dumps(data))

            logger.info(f"Requeued job {job_id} with priority {new_priority}")
            return True

        except Exception as e:
            logger.error(f"Failed to requeue job: {str(e)}")
            return False

    def get_queue_status(self) -> Dict:
        """
        Get current queue status and depths.

        Returns:
            Dictionary with queue statistics
        """
        queues = {
            'critical': 'batch_critical',
            'high': 'batch_high',
            'normal': 'batch_normal',
            'low': 'batch_low'
        }

        status = {}
        total_pending = 0

        for priority, queue_name in queues.items():
            # Get queue depth
            queue_key = f"celery-queue-{queue_name}"
            depth = self.redis_client.llen(queue_key)

            # Get active tasks in this queue
            active_key = f"active:{queue_name}"
            active_count = self.redis_client.scard(active_key)

            status[priority] = {
                'queue': queue_name,
                'pending': depth,
                'active': active_count or 0,
                'total': depth + (active_count or 0)
            }

            total_pending += depth

        status['total_pending'] = total_pending

        return status

    def get_jobs_by_priority(
        self,
        priority: str,
        limit: int = 100
    ) -> List[Dict]:
        """
        Get jobs with specific priority.

        Args:
            priority: Priority level to filter by
            limit: Maximum number of jobs to return

        Returns:
            List of job dictionaries
        """
        jobs = []
        job_keys = self.redis_client.keys('job:*')

        for key in job_keys[:limit * 2]:  # Check more to account for filtering
            job_data = self.redis_client.get(key)
            if job_data:
                data = json.loads(job_data)
                if data.get('priority', 'normal') == priority:
                    jobs.append(data)

                if len(jobs) >= limit:
                    break

        return jobs

    def auto_prioritize(self, job_data: Dict) -> str:
        """
        Automatically determine priority based on job characteristics.

        Args:
            job_data: Job data dictionary

        Returns:
            Recommended priority level
        """
        # Factors for auto-prioritization
        batch_size = job_data.get('total', 0)
        user_type = job_data.get('user_type', 'free')
        deadline = job_data.get('deadline')

        # Critical priority for:
        # - Enterprise users with deadlines
        # - Small batches from paid users (likely testing/urgent)
        if user_type == 'enterprise' and deadline:
            return 'critical'

        # High priority for:
        # - Paid users
        # - Batches with deadlines
        # - Small batches (< 10 images) for quick turnaround
        if user_type in ['paid', 'premium'] or deadline or batch_size < 10:
            return 'high'

        # Low priority for:
        # - Very large batches (> 500) from free users
        # - Non-urgent bulk processing
        if batch_size > 500 and user_type == 'free':
            return 'low'

        # Default to normal
        return 'normal'

    def enforce_rate_limits(
        self,
        user_id: str,
        priority: str
    ) -> bool:
        """
        Check and enforce rate limits based on priority.

        Args:
            user_id: User identifier
            priority: Job priority

        Returns:
            True if within rate limits, False otherwise
        """
        # Rate limits per priority (jobs per hour)
        rate_limits = {
            'critical': 100,
            'high': 50,
            'normal': 20,
            'low': 10
        }

        limit = rate_limits.get(priority, 20)
        window = 3600  # 1 hour

        # Redis key for rate limiting
        key = f"rate_limit:{user_id}:{priority}"

        # Get current count
        current = self.redis_client.get(key)
        if current:
            count = int(current)
            if count >= limit:
                return False
            self.redis_client.incr(key)
        else:
            # Set with expiration
            self.redis_client.setex(key, window, 1)

        return True

    def get_priority_statistics(self) -> Dict:
        """
        Get statistics about job priorities.

        Returns:
            Dictionary with priority statistics
        """
        stats = {
            'critical': {'count': 0, 'avg_wait_time': 0},
            'high': {'count': 0, 'avg_wait_time': 0},
            'normal': {'count': 0, 'avg_wait_time': 0},
            'low': {'count': 0, 'avg_wait_time': 0}
        }

        # Analyze recent jobs
        job_keys = self.redis_client.keys('job:*')

        for key in job_keys:
            job_data = self.redis_client.get(key)
            if job_data:
                data = json.loads(job_data)
                priority = data.get('priority', 'normal')

                if priority in stats:
                    stats[priority]['count'] += 1

                    # Calculate wait time if job has started
                    created_at = data.get('created_at')
                    started_at = data.get('started_at')

                    if created_at and started_at:
                        created = datetime.fromisoformat(created_at)
                        started = datetime.fromisoformat(started_at)
                        wait_time = (started - created).total_seconds()

                        # Update average
                        current_avg = stats[priority]['avg_wait_time']
                        current_count = stats[priority]['count']
                        new_avg = ((current_avg * (current_count - 1)) + wait_time) / current_count
                        stats[priority]['avg_wait_time'] = new_avg

        # Add queue status
        queue_status = self.get_queue_status()
        for priority in stats:
            if priority in queue_status:
                stats[priority]['queue_depth'] = queue_status[priority]['pending']
                stats[priority]['active'] = queue_status[priority]['active']

        return stats

    def promote_waiting_jobs(self, threshold_minutes: int = 30):
        """
        Automatically promote jobs that have been waiting too long.

        Args:
            threshold_minutes: Minutes before auto-promotion

        Returns:
            Number of jobs promoted
        """
        promoted = 0
        current_time = datetime.now()

        job_keys = self.redis_client.keys('job:*')

        for key in job_keys:
            job_data = self.redis_client.get(key)
            if job_data:
                data = json.loads(job_data)

                # Check if job is still waiting
                if data.get('status') not in ['pending', 'queued']:
                    continue

                # Check wait time
                created_at = data.get('created_at')
                if created_at:
                    created = datetime.fromisoformat(created_at)
                    wait_time = (current_time - created).total_seconds() / 60

                    if wait_time > threshold_minutes:
                        current_priority = data.get('priority', 'normal')

                        # Promote priority
                        if current_priority == 'low':
                            new_priority = 'normal'
                        elif current_priority == 'normal':
                            new_priority = 'high'
                        else:
                            continue  # Don't promote high/critical

                        job_id = data['job_id']
                        if self.requeue_job(job_id, new_priority):
                            promoted += 1
                            logger.info(f"Auto-promoted job {job_id} from {current_priority} to {new_priority}")

        return promoted