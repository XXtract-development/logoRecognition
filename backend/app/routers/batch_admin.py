"""
Admin endpoints for batch processing monitoring and management.
Provides dashboard data, worker status, and system-level controls.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from typing import Optional, Dict, Any
import asyncio
from datetime import datetime, timedelta

from ..batch_processing.progress_tracker import ProgressTracker
from ..batch_processing.priority_manager import PriorityManager
from ..services.batch_service import BatchService
from ..auth import get_current_user
from ..celery_app import app as celery_app

router = APIRouter(prefix="/api/admin/batch", tags=["admin", "batch"])
tracker = ProgressTracker()
priority_manager = PriorityManager(tracker.redis_client)
batch_service = BatchService()

def require_admin(current_user = Depends(get_current_user)):
    """Dependency to require admin access."""
    if not current_user.is_admin:
        raise HTTPException(403, "Admin access required")
    return current_user

@router.get("/dashboard")
async def get_dashboard_data(
    current_user = Depends(require_admin)
):
    """
    Get comprehensive batch processing dashboard data.

    Returns:
        Dashboard statistics including queue depths, active jobs, worker status
    """
    # Get queue depths for all priority levels
    queue_depths = {
        'batch_high': tracker.get_queue_depth('batch_high'),
        'batch_normal': tracker.get_queue_depth('batch_normal'),
        'batch_low': tracker.get_queue_depth('batch_low')
    }

    # Get active jobs
    active_jobs = tracker.get_active_jobs()

    # Get system statistics
    stats = batch_service.get_system_stats()

    # Get worker status
    worker_status = get_worker_status()

    # Calculate metrics
    total_queue_depth = sum(queue_depths.values())
    avg_processing_time = stats.get('avg_processing_time', 0)

    return {
        'timestamp': datetime.now().isoformat(),
        'queue_status': {
            'depths': queue_depths,
            'total': total_queue_depth,
            'distribution': {
                'high': f"{(queue_depths['batch_high'] / max(total_queue_depth, 1)) * 100:.1f}%",
                'normal': f"{(queue_depths['batch_normal'] / max(total_queue_depth, 1)) * 100:.1f}%",
                'low': f"{(queue_depths['batch_low'] / max(total_queue_depth, 1)) * 100:.1f}%"
            }
        },
        'active_jobs': {
            'count': len(active_jobs),
            'job_ids': active_jobs[:20],  # Limit to 20 for display
            'oldest': min(active_jobs, default=None),
            'newest': max(active_jobs, default=None)
        },
        'statistics': {
            'total_processed_today': stats.get('total_processed_today', 0),
            'success_rate': stats.get('success_rate', 0),
            'avg_processing_time': avg_processing_time,
            'peak_hour': stats.get('peak_hour'),
            'total_users': stats.get('total_users', 0)
        },
        'worker_status': worker_status,
        'system_health': {
            'redis_connected': tracker.redis_client.ping(),
            'celery_connected': bool(worker_status),
            'database_connected': batch_service.check_database_connection()
        }
    }

@router.get("/jobs/active")
async def get_active_jobs_detailed(
    include_progress: bool = Query(True),
    include_metrics: bool = Query(True),
    current_user = Depends(require_admin)
):
    """
    Get detailed information about all active jobs.

    Args:
        include_progress: Include progress tracking data
        include_metrics: Include performance metrics

    Returns:
        Detailed active job information
    """
    active_jobs = tracker.get_active_jobs()

    job_details = []
    for job_id in active_jobs:
        job_info = {
            'job_id': job_id,
            'status': 'active'
        }

        if include_progress:
            progress = tracker.get_progress(job_id)
            if progress:
                job_info['progress'] = progress

        if include_metrics:
            metrics = tracker.get_metrics(job_id)
            if metrics:
                job_info['metrics'] = metrics

        # Get job metadata from database
        job = batch_service.get_job(job_id)
        if job:
            job_info.update({
                'user_id': job.user_id,
                'total_images': job.total_images,
                'priority': job.options.get('priority'),
                'created_at': job.created_at.isoformat()
            })

        job_details.append(job_info)

    # Sort by creation time (oldest first)
    job_details.sort(key=lambda x: x.get('created_at', ''))

    return {
        'total': len(job_details),
        'jobs': job_details
    }

@router.post("/jobs/{job_id}/retry")
async def retry_failed_job(
    job_id: str,
    force: bool = Query(False),
    current_user = Depends(require_admin)
):
    """
    Retry a failed job with admin privileges.

    Args:
        job_id: Job ID to retry
        force: Force retry even if job isn't failed

    Returns:
        Retry status
    """
    # Get job details
    job = batch_service.get_job(job_id)

    if not job:
        raise HTTPException(404, f"Job {job_id} not found")

    # Check job status
    from ..models.batch_job import BatchStatus

    if not force and job.status not in [BatchStatus.FAILED, BatchStatus.PARTIAL]:
        raise HTTPException(400, f"Job status is {job.status.value}, use force=true to retry anyway")

    # Requeue the job
    from ..batch_processing.tasks import process_batch

    # Get original job data
    original_images = batch_service.get_job_images(job_id)
    if not original_images:
        raise HTTPException(400, "Cannot retrieve original job images")

    task = process_batch.apply_async(
        args=[job.job_id, original_images, job.options],
        queue=f"batch_{job.options.get('priority', 'normal')}"
    )

    # Update job record
    batch_service.update_job_task(job_id, task.id)

    return {
        'job_id': job_id,
        'new_task_id': task.id,
        'status': 'requeued',
        'message': f'Job {job_id} has been requeued for processing'
    }

@router.post("/jobs/{job_id}/priority")
async def change_job_priority(
    job_id: str,
    new_priority: str = Query(..., regex="^(high|normal|low)$"),
    current_user = Depends(require_admin)
):
    """
    Change the priority of a queued job.

    Args:
        job_id: Job ID
        new_priority: New priority level

    Returns:
        Priority change status
    """
    # Get job
    job = batch_service.get_job(job_id)

    if not job:
        raise HTTPException(404, f"Job {job_id} not found")

    # Check if job is still queued
    from celery.result import AsyncResult
    result = AsyncResult(job.task_id)

    if result.state != 'PENDING':
        raise HTTPException(400, f"Cannot change priority - job is {result.state}")

    # Cancel current task
    result.revoke()

    # Requeue with new priority
    from ..batch_processing.tasks import process_batch

    original_images = batch_service.get_job_images(job_id)
    job.options['priority'] = new_priority

    task = process_batch.apply_async(
        args=[job.job_id, original_images, job.options],
        queue=f"batch_{new_priority}",
        priority={'high': 10, 'normal': 5, 'low': 1}[new_priority]
    )

    # Update job record
    batch_service.update_job_priority(job_id, new_priority, task.id)

    return {
        'job_id': job_id,
        'new_priority': new_priority,
        'new_task_id': task.id,
        'message': f'Job priority changed to {new_priority}'
    }

@router.get("/workers")
async def get_worker_details(
    current_user = Depends(require_admin)
):
    """
    Get detailed worker information.

    Returns:
        Comprehensive worker status and statistics
    """
    inspect = celery_app.control.inspect()

    # Get various worker information
    stats = inspect.stats()
    active = inspect.active()
    reserved = inspect.reserved()
    registered = inspect.registered()
    scheduled = inspect.scheduled()

    worker_details = []

    if stats:
        for worker_name, worker_stats in stats.items():
            detail = {
                'name': worker_name,
                'status': 'online',
                'stats': worker_stats,
                'active_tasks': len(active.get(worker_name, [])) if active else 0,
                'reserved_tasks': len(reserved.get(worker_name, [])) if reserved else 0,
                'registered_tasks': registered.get(worker_name, []) if registered else [],
                'scheduled_tasks': len(scheduled.get(worker_name, [])) if scheduled else 0,
                'pool': worker_stats.get('pool', {}),
                'total_processed': worker_stats.get('total', {})
            }

            # Add active task details
            if active and worker_name in active:
                detail['active_task_details'] = [
                    {
                        'id': task['id'],
                        'name': task['name'],
                        'args': str(task.get('args', ''))[:100],  # Truncate for display
                        'time_start': task.get('time_start')
                    }
                    for task in active[worker_name]
                ]

            worker_details.append(detail)

    return {
        'total_workers': len(worker_details),
        'workers': worker_details,
        'summary': {
            'total_active': sum(w['active_tasks'] for w in worker_details),
            'total_reserved': sum(w['reserved_tasks'] for w in worker_details),
            'total_scheduled': sum(w['scheduled_tasks'] for w in worker_details)
        }
    }

@router.post("/workers/scale")
async def scale_workers(
    action: str = Query(..., regex="^(scale_up|scale_down|restart)$"),
    count: int = Query(1, ge=1, le=10),
    current_user = Depends(require_admin)
):
    """
    Scale worker pool up or down.

    Args:
        action: Scaling action (scale_up/scale_down/restart)
        count: Number of workers to add/remove

    Returns:
        Scaling operation status
    """
    if action == "scale_up":
        # In production, this would trigger container orchestration
        # For now, return a mock response
        return {
            'action': 'scale_up',
            'count': count,
            'status': 'initiated',
            'message': f'Scaling up by {count} workers'
        }
    elif action == "scale_down":
        # Gracefully shutdown workers
        celery_app.control.broadcast('shutdown', destination=[])
        return {
            'action': 'scale_down',
            'count': count,
            'status': 'initiated',
            'message': f'Scaling down by {count} workers'
        }
    elif action == "restart":
        # Restart all workers
        celery_app.control.broadcast('pool_restart', arguments={'reload': True})
        return {
            'action': 'restart',
            'status': 'initiated',
            'message': 'All workers are being restarted'
        }

@router.get("/metrics")
async def get_system_metrics(
    time_range: str = Query("1h", regex="^(1h|6h|24h|7d|30d)$"),
    current_user = Depends(require_admin)
):
    """
    Get system performance metrics.

    Args:
        time_range: Time range for metrics

    Returns:
        Performance metrics and statistics
    """
    # Calculate time range
    time_ranges = {
        '1h': timedelta(hours=1),
        '6h': timedelta(hours=6),
        '24h': timedelta(days=1),
        '7d': timedelta(days=7),
        '30d': timedelta(days=30)
    }

    start_time = datetime.now() - time_ranges[time_range]

    metrics = batch_service.get_metrics(start_time)

    return {
        'time_range': time_range,
        'start_time': start_time.isoformat(),
        'end_time': datetime.now().isoformat(),
        'metrics': metrics,
        'summary': {
            'total_jobs': metrics.get('total_jobs', 0),
            'total_images': metrics.get('total_images', 0),
            'avg_job_size': metrics.get('avg_job_size', 0),
            'success_rate': metrics.get('success_rate', 0),
            'avg_processing_time': metrics.get('avg_processing_time', 0),
            'peak_load': metrics.get('peak_load', {})
        }
    }

@router.delete("/jobs/cleanup")
async def cleanup_old_jobs(
    days_old: int = Query(7, ge=1, le=90),
    dry_run: bool = Query(True),
    current_user = Depends(require_admin)
):
    """
    Clean up old job data.

    Args:
        days_old: Age threshold in days
        dry_run: If true, only show what would be deleted

    Returns:
        Cleanup operation results
    """
    from ..batch_processing.tasks import cleanup_old_jobs

    if dry_run:
        # Just count what would be deleted
        count = batch_service.count_old_jobs(days_old)
        return {
            'dry_run': True,
            'would_delete': count,
            'days_old': days_old,
            'message': f'Would delete {count} jobs older than {days_old} days'
        }
    else:
        # Execute cleanup
        result = cleanup_old_jobs.apply_async(args=[days_old])
        cleanup_result = result.get(timeout=30)

        return {
            'dry_run': False,
            'deleted': cleanup_result.get('deleted', 0),
            'remaining': cleanup_result.get('remaining', 0),
            'cutoff_date': cleanup_result.get('cutoff_date'),
            'message': f'Deleted {cleanup_result.get("deleted", 0)} old jobs'
        }

@router.websocket("/ws/monitor")
async def websocket_monitor(websocket):
    """
    WebSocket endpoint for real-time monitoring.

    Provides live updates on:
    - Queue depths
    - Active jobs
    - Worker status
    - System metrics
    """
    await websocket.accept()

    try:
        while True:
            # Get current status
            dashboard_data = {
                'timestamp': datetime.now().isoformat(),
                'queues': {
                    'high': tracker.get_queue_depth('batch_high'),
                    'normal': tracker.get_queue_depth('batch_normal'),
                    'low': tracker.get_queue_depth('batch_low')
                },
                'active_jobs': len(tracker.get_active_jobs()),
                'workers': len(get_worker_status())
            }

            # Send update
            await websocket.send_json(dashboard_data)

            # Wait before next update
            await asyncio.sleep(2)  # Update every 2 seconds

    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        await websocket.close()

def get_worker_status() -> list:
    """Get Celery worker status."""
    inspect = celery_app.control.inspect()

    stats = inspect.stats()
    active = inspect.active()

    worker_info = []

    if stats:
        for worker_name, worker_stats in stats.items():
            worker_info.append({
                'name': worker_name,
                'status': 'online',
                'pool': worker_stats.get('pool', {}).get('max-concurrency', 0),
                'active_tasks': len(active.get(worker_name, [])) if active else 0,
                'total_processed': worker_stats.get('total', 0)
            })

    return worker_info