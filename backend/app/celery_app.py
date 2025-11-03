"""
Celery with Monitoring
STORY-012: Celery with Monitoring
Enhanced with Batch Processing Support for US-006
"""
from celery import Celery, Task
from celery.signals import task_prerun, task_postrun, task_failure, task_retry
from kombu import Queue, Exchange
import os
import time
import logging
from typing import Any, Dict
from prometheus_client import Counter, Histogram, Gauge
import redis
import json
from datetime import datetime

logger = logging.getLogger(__name__)

# Celery configuration with enhanced batch processing support
app = Celery('logo_recognition')

app.conf.update(
    broker_url=os.getenv('CELERY_BROKER_URL', 'redis://localhost:6379/0'),
    result_backend=os.getenv('CELERY_RESULT_BACKEND', 'redis://localhost:6379/1'),
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    result_expires=86400,  # 24 hours
    task_track_started=True,
    task_time_limit=3900,  # 65 minutes for batch processing
    task_soft_time_limit=3600,  # 60 minutes soft limit
    worker_prefetch_multiplier=4,
    worker_max_tasks_per_child=1000,
    worker_disable_rate_limits=False,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_default_retry_delay=60,
    task_max_retries=3,
    worker_send_task_events=True,
    task_send_sent_event=True,
)

# Define queues with priorities for batch processing
app.conf.task_routes = {
    'app.tasks.high_priority.*': {'queue': 'high'},
    'app.tasks.normal_priority.*': {'queue': 'normal'},
    'app.tasks.low_priority.*': {'queue': 'low'},
    'app.tasks.ml.*': {'queue': 'ml'},
    # Batch processing specific routing
    'batch_processing.tasks.process_batch': {'queue': 'batch_high'},
    'batch_processing.tasks.process_chunk': {'queue': 'batch_normal'},
    'batch_processing.tasks.process_image': {'queue': 'batch_normal'},
    'batch_processing.tasks.aggregate_results': {'queue': 'batch_normal'},
    'batch_processing.tasks.generate_report': {'queue': 'batch_low'},
    'batch_processing.tasks.send_notification': {'queue': 'batch_low'},
}

app.conf.task_queues = (
    Queue('high', Exchange('high'), routing_key='high', priority=10),
    Queue('normal', Exchange('normal'), routing_key='normal', priority=5),
    Queue('low', Exchange('low'), routing_key='low', priority=1),
    Queue('ml', Exchange('ml'), routing_key='ml', priority=5),
    # Batch processing queues with priorities
    Queue('batch_high', Exchange('batch'), routing_key='batch.high', priority=10),
    Queue('batch_normal', Exchange('batch'), routing_key='batch.normal', priority=5),
    Queue('batch_low', Exchange('batch'), routing_key='batch.low', priority=1),
)

# Rate limiting for batch processing
app.conf.task_annotations = {
    'batch_processing.tasks.process_batch': {
        'rate_limit': '10/m',  # 10 batches per minute
    },
}

# Dead letter queue configuration
app.conf.task_dead_letter_queue = 'dead_letter'
app.conf.task_dead_letter_exchange = 'dead_letter'
app.conf.task_dead_letter_routing_key = 'dead_letter'

# Prometheus metrics
task_counter = Counter(
    'celery_tasks_total',
    'Total number of Celery tasks',
    ['task_name', 'status']
)

task_duration = Histogram(
    'celery_task_duration_seconds',
    'Celery task duration',
    ['task_name'],
    buckets=(0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0)
)

queue_depth = Gauge(
    'celery_queue_depth',
    'Number of tasks in queue',
    ['queue_name']
)

worker_utilization = Gauge(
    'celery_worker_utilization',
    'Worker utilization percentage'
)


class BaseTask(Task):
    """Base task with monitoring and retry logic"""

    autoretry_for = (Exception,)
    retry_kwargs = {'max_retries': 3}
    retry_backoff = True
    retry_backoff_max = 600
    retry_jitter = True

    def __init__(self):
        super().__init__()
        self.redis_client = redis.Redis(host='localhost', port=6379, db=2)

    def before_start(self, task_id, args, kwargs):
        """Called before task execution"""
        logger.info(f"Starting task {self.name} with id {task_id}")
        self.start_time = time.time()

    def on_success(self, retval, task_id, args, kwargs):
        """Called on successful task completion"""
        duration = time.time() - self.start_time
        logger.info(f"Task {self.name} completed in {duration:.2f}s")

        # Track metrics
        task_counter.labels(task_name=self.name, status='success').inc()
        task_duration.labels(task_name=self.name).observe(duration)

        # Store result metadata
        self.redis_client.hset(
            f"task:result:{task_id}",
            mapping={
                'status': 'success',
                'duration': duration,
                'completed_at': datetime.utcnow().isoformat()
            }
        )
        self.redis_client.expire(f"task:result:{task_id}", 86400)  # 24 hours

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Called on task failure"""
        logger.error(f"Task {self.name} failed: {exc}")

        # Track metrics
        task_counter.labels(task_name=self.name, status='failure').inc()

        # Store failure info
        self.redis_client.hset(
            f"task:result:{task_id}",
            mapping={
                'status': 'failure',
                'error': str(exc),
                'traceback': str(einfo),
                'failed_at': datetime.utcnow().isoformat()
            }
        )

        # Send to dead letter queue if max retries exceeded
        if self.request.retries >= self.max_retries:
            self.send_to_dead_letter(task_id, args, kwargs, exc)

    def on_retry(self, exc, task_id, args, kwargs, einfo):
        """Called when task is retried"""
        logger.warning(f"Retrying task {self.name} (attempt {self.request.retries + 1})")
        task_counter.labels(task_name=self.name, status='retry').inc()

    def send_to_dead_letter(self, task_id, args, kwargs, exc):
        """Send failed task to dead letter queue"""
        dead_letter_data = {
            'task_id': task_id,
            'task_name': self.name,
            'args': args,
            'kwargs': kwargs,
            'error': str(exc),
            'timestamp': datetime.utcnow().isoformat()
        }

        self.redis_client.lpush('dead_letter_queue', json.dumps(dead_letter_data))
        logger.error(f"Task {task_id} sent to dead letter queue")


# Signal handlers for monitoring
@task_prerun.connect
def task_prerun_handler(sender=None, task_id=None, task=None, **kwargs):
    """Handle task pre-run event"""
    logger.debug(f"Task {task.name} starting with id {task_id}")


@task_postrun.connect
def task_postrun_handler(sender=None, task_id=None, task=None, state=None, **kwargs):
    """Handle task post-run event"""
    logger.debug(f"Task {task.name} finished with state {state}")


@task_failure.connect
def task_failure_handler(sender=None, task_id=None, exception=None, **kwargs):
    """Handle task failure event"""
    logger.error(f"Task {sender.name} failed with exception: {exception}")


@task_retry.connect
def task_retry_handler(sender=None, reason=None, **kwargs):
    """Handle task retry event"""
    logger.warning(f"Task {sender.name} retrying due to: {reason}")


# Memory leak detection
class MemoryMonitor:
    """Monitor for memory leaks in workers"""

    def __init__(self):
        self.baseline_memory = None
        self.task_count = 0
        self.memory_threshold_mb = 500

    def check_memory(self):
        """Check current memory usage"""
        import psutil
        process = psutil.Process()
        memory_mb = process.memory_info().rss / 1024 / 1024

        if self.baseline_memory is None:
            self.baseline_memory = memory_mb

        memory_increase = memory_mb - self.baseline_memory
        self.task_count += 1

        if memory_increase > self.memory_threshold_mb:
            logger.warning(
                f"Potential memory leak detected: {memory_increase:.2f}MB increase "
                f"after {self.task_count} tasks"
            )
            return True

        return False

    def reset(self):
        """Reset memory baseline"""
        self.baseline_memory = None
        self.task_count = 0


memory_monitor = MemoryMonitor()


# Queue monitoring
class QueueMonitor:
    """Monitor queue depths and worker utilization"""

    def __init__(self):
        self.redis_client = redis.Redis(host='localhost', port=6379, db=0)

    def get_queue_depth(self, queue_name: str) -> int:
        """Get number of tasks in queue"""
        return self.redis_client.llen(f"celery:{queue_name}")

    def update_metrics(self):
        """Update Prometheus metrics"""
        for queue_name in ['high', 'normal', 'low', 'ml']:
            depth = self.get_queue_depth(queue_name)
            queue_depth.labels(queue_name=queue_name).set(depth)

    def get_worker_stats(self) -> Dict[str, Any]:
        """Get worker statistics"""
        from celery import current_app
        inspect = current_app.control.inspect()

        active = inspect.active()
        reserved = inspect.reserved()
        stats = inspect.stats()

        total_active = sum(len(tasks) for tasks in active.values()) if active else 0
        total_reserved = sum(len(tasks) for tasks in reserved.values()) if reserved else 0

        return {
            'active_tasks': total_active,
            'reserved_tasks': total_reserved,
            'worker_stats': stats
        }


queue_monitor = QueueMonitor()


# Flower configuration for monitoring dashboard
class FlowerConfig:
    """Flower dashboard configuration"""

    @staticmethod
    def get_config():
        return {
            'broker_api': 'redis://localhost:6379/0',
            'port': 5555,
            'address': '0.0.0.0',
            'basic_auth': ['admin:admin123'],
            'persistent': True,
            'db': '/var/flower/flower.db',
            'max_tasks': 10000,
            'auto_refresh': True,
            'purge_offline_workers': 3600,
            'inspect_timeout': 5000,
            'enable_events': True,
        }


# Task deduplication
class TaskDeduplicator:
    """Prevent duplicate task execution"""

    def __init__(self):
        self.redis_client = redis.Redis(host='localhost', port=6379, db=3)

    def is_duplicate(self, task_name: str, task_args: tuple, ttl: int = 300) -> bool:
        """Check if task is duplicate"""
        import hashlib
        task_key = f"{task_name}:{hashlib.md5(str(task_args).encode()).hexdigest()}"

        if self.redis_client.exists(task_key):
            return True

        # Mark as processing
        self.redis_client.setex(task_key, ttl, 'processing')
        return False

    def clear_task(self, task_name: str, task_args: tuple):
        """Clear task from deduplication cache"""
        import hashlib
        task_key = f"{task_name}:{hashlib.md5(str(task_args).encode()).hexdigest()}"
        self.redis_client.delete(task_key)


deduplicator = TaskDeduplicator()


# Graceful shutdown handler
def handle_shutdown(signum, frame):
    """Handle graceful shutdown"""
    logger.info("Received shutdown signal, finishing current tasks...")

    from celery import current_app
    current_app.control.shutdown()

    # Save current state
    queue_monitor.update_metrics()

    logger.info("Shutdown complete")


import signal
signal.signal(signal.SIGTERM, handle_shutdown)
signal.signal(signal.SIGINT, handle_shutdown)