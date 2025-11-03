"""
Batch processing API endpoints for handling large-scale image processing jobs.
Supports priority queuing, real-time progress tracking, and multiple export formats.
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, BackgroundTasks, Query
from fastapi.responses import StreamingResponse, FileResponse
from typing import List, Optional, Dict, Any
import uuid
import zipfile
import io
import json
import csv
from datetime import datetime
from celery.result import AsyncResult

from ..batch_processing.tasks import process_batch, send_notification
from ..services.batch_service import BatchService
from ..models.batch_job import BatchJob, BatchStatus
from ..auth import get_current_user

router = APIRouter(prefix="/api/batch", tags=["batch"])
batch_service = BatchService()

@router.get("/")
async def list_batch_jobs(
    status: Optional[str] = Query(None),
    limit: int = Query(10, le=100),
    offset: int = Query(0),
    current_user = Depends(get_current_user)
):
    """List batch jobs for the current user."""
    jobs = batch_service.list_user_jobs(
        user_id=current_user.id,
        status=status,
        limit=limit,
        offset=offset
    )
    return jobs

@router.post("/")
async def create_batch_job(
    files: List[UploadFile] = File(None),
    zip_file: UploadFile = File(None),
    priority: str = Query("normal", regex="^(high|normal|low)$"),
    callback_url: Optional[str] = None,
    notification_email: Optional[str] = None,
    chunk_size: int = Query(10, ge=1, le=50),
    confidence_threshold: float = Query(0.5, ge=0.0, le=1.0),
    model_version: str = Query("latest"),
    current_user = Depends(get_current_user)
):
    """
    Create a new batch processing job.

    Accepts either:
    - Multiple image files (up to 1000)
    - Single ZIP file containing images

    Args:
        files: Individual image files
        zip_file: ZIP archive containing images
        priority: Processing priority (high/normal/low)
        callback_url: URL for completion callback
        notification_email: Email for completion notification
        chunk_size: Number of images to process per chunk (1-50)
        confidence_threshold: Minimum detection confidence (0.0-1.0)
        model_version: Detection model version to use
        current_user: Authenticated user

    Returns:
        Job creation response with job ID and status URLs
    """
    if not files and not zip_file:
        raise HTTPException(400, "Either files or zip_file must be provided")

    if files and zip_file:
        raise HTTPException(400, "Provide either files or zip_file, not both")

    # Generate unique job ID
    job_id = f"batch_{uuid.uuid4().hex}"

    # Extract and validate images
    images = []

    try:
        if zip_file:
            # Handle ZIP file upload
            zip_bytes = await zip_file.read()

            with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
                # Check for zip bombs
                total_size = sum(zf.getinfo(name).file_size for name in zf.namelist())
                if total_size > 5 * 1024 * 1024 * 1024:  # 5GB limit
                    raise HTTPException(400, "ZIP file contents exceed 5GB limit")

                for filename in zf.namelist():
                    if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.bmp')):
                        file_data = zf.read(filename)

                        # Validate individual file size
                        if len(file_data) > 50 * 1024 * 1024:  # 50MB per image
                            continue  # Skip oversized images

                        images.append({
                            'id': f"{job_id}_{len(images)}",
                            'filename': filename,
                            'data': file_data,
                            'size': len(file_data)
                        })
        else:
            # Handle individual file uploads
            for file in files:
                if file.content_type and file.content_type.startswith('image/'):
                    file_data = await file.read()

                    # Validate file size
                    if len(file_data) > 50 * 1024 * 1024:  # 50MB per image
                        continue

                    images.append({
                        'id': f"{job_id}_{len(images)}",
                        'filename': file.filename,
                        'data': file_data,
                        'size': len(file_data)
                    })

        # Validate batch size
        if len(images) == 0:
            raise HTTPException(400, "No valid images found in upload")

        if len(images) > 1000:
            raise HTTPException(400, f"Batch size ({len(images)}) exceeds maximum of 1000 images")

        # Create job options
        options = {
            'priority': priority,
            'callback_url': callback_url,
            'notification_email': notification_email,
            'chunk_size': chunk_size,
            'confidence_threshold': confidence_threshold,
            'model_version': model_version,
            'user_id': current_user.id,
            'username': current_user.username
        }

        # Determine queue based on priority
        queue_name = f'batch_{priority}'
        priority_value = {'high': 10, 'normal': 5, 'low': 1}[priority]

        # Queue the job
        task = process_batch.apply_async(
            args=[job_id, images, options],
            queue=queue_name,
            priority=priority_value
        )

        # Store job metadata in database
        job_record = batch_service.create_job_record(
            job_id=job_id,
            task_id=task.id,
            user_id=current_user.id,
            total_images=len(images),
            options=options
        )

        # Response
        return {
            'job_id': job_id,
            'task_id': task.id,
            'status': 'queued',
            'total_images': len(images),
            'priority': priority,
            'chunk_size': chunk_size,
            'estimated_time': batch_service.estimate_processing_time(len(images)),
            'status_url': f'/api/batch/{job_id}/status',
            'results_url': f'/api/batch/{job_id}/results',
            'cancel_url': f'/api/batch/{job_id}/cancel',
            'created_at': datetime.now().isoformat()
        }

    except zipfile.BadZipFile:
        raise HTTPException(400, "Invalid ZIP file format")
    except Exception as e:
        raise HTTPException(500, f"Failed to create batch job: {str(e)}")

@router.get("/{job_id}")
async def get_job_details(
    job_id: str,
    current_user = Depends(get_current_user)
):
    """Get batch job details."""
    job = batch_service.get_job(job_id)
    if not job:
        raise HTTPException(404, f"Job {job_id} not found")
    if job.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(403, "Access denied")
    return job

@router.get("/{job_id}/status")
async def get_job_status(
    job_id: str,
    detailed: bool = Query(False),
    current_user = Depends(get_current_user)
):
    """
    Get batch job status with optional detailed progress information.

    Args:
        job_id: Batch job ID
        detailed: Include detailed chunk-level progress
        current_user: Authenticated user

    Returns:
        Job status and progress information
    """
    # Get job from database
    job = batch_service.get_job(job_id)

    if not job:
        raise HTTPException(404, f"Job {job_id} not found")

    # Check ownership
    if job.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(403, "Access denied")

    # Get Celery task status
    result = AsyncResult(job.task_id)

    # Build response
    response = {
        'job_id': job_id,
        'task_id': job.task_id,
        'status': result.state,
        'created_at': job.created_at.isoformat(),
        'total_images': job.total_images,
        'priority': job.options.get('priority', 'normal')
    }

    # Add state-specific information
    if result.state == 'PENDING':
        response.update({
            'progress': 0,
            'message': 'Job is queued for processing',
            'queue_position': batch_service.get_queue_position(job_id)
        })
    elif result.state == 'PROCESSING':
        meta = result.info or {}
        response.update({
            'progress': meta.get('progress', 0),
            'current': meta.get('current', 0),
            'message': meta.get('message', 'Processing...'),
            'estimated_remaining': batch_service.estimate_remaining_time(job_id)
        })
    elif result.state == 'SUCCESS':
        response.update({
            'progress': 100,
            'message': 'Job completed successfully',
            'completed_at': job.completed_at.isoformat() if job.completed_at else None,
            'processing_time': job.processing_time
        })
    elif result.state == 'FAILURE':
        response.update({
            'progress': 0,
            'message': 'Job failed',
            'error': str(result.info) if result.info else 'Unknown error'
        })

    # Add detailed progress if requested
    if detailed and result.state in ['PROCESSING', 'SUCCESS']:
        response['chunks'] = batch_service.get_chunk_progress(job_id)
        response['metrics'] = batch_service.get_job_metrics(job_id)

    return response

@router.post("/{job_id}/cancel")
async def cancel_job(
    job_id: str,
    current_user = Depends(get_current_user)
):
    """Cancel a batch processing job."""
    job = batch_service.get_job(job_id)
    if not job:
        raise HTTPException(404, f"Job {job_id} not found")
    if job.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(403, "Access denied")

    # Cancel the Celery task
    result = AsyncResult(job.task_id)
    result.revoke(terminate=True)

    # Update job status
    batch_service.update_job_status(job_id, 'CANCELLED')

    return {"message": f"Job {job_id} cancelled"}

@router.get("/{job_id}/results")
async def get_job_results(
    job_id: str,
    format: str = Query("json", regex="^(json|csv|zip|excel)$"),
    include_failed: bool = Query(True),
    current_user = Depends(get_current_user)
):
    """
    Get batch job results in various formats.

    Args:
        job_id: Batch job ID
        format: Output format (json/csv/zip/excel)
        include_failed: Include failed image results
        current_user: Authenticated user

    Returns:
        Job results in requested format
    """
    # Get job from database
    job = batch_service.get_job(job_id)

    if not job:
        raise HTTPException(404, f"Job {job_id} not found")

    # Check ownership
    if job.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(403, "Access denied")

    # Check if job is complete
    if job.status not in [BatchStatus.COMPLETED, BatchStatus.PARTIAL]:
        raise HTTPException(400, f"Job is {job.status.value}, results not available")

    # Get results
    results = batch_service.get_job_results(job_id, include_failed=include_failed)

    if not results:
        raise HTTPException(404, "No results found for job")

    # Format based on requested type
    if format == "json":
        return {
            'job_id': job_id,
            'total': len(results),
            'successful': sum(1 for r in results if r.get('status') == 'success'),
            'failed': sum(1 for r in results if r.get('status') == 'failed'),
            'results': results,
            'export_formats': ['csv', 'zip', 'excel']
        }

    elif format == "csv":
        # Generate CSV
        output = io.StringIO()

        if results:
            fieldnames = ['image_id', 'filename', 'status', 'detections_count',
                         'max_confidence', 'processing_time', 'error']
            writer = csv.DictWriter(output, fieldnames=fieldnames)
            writer.writeheader()

            for result in results:
                detections = result.get('result', {}).get('detections', []) if result.get('status') == 'success' else []
                writer.writerow({
                    'image_id': result.get('image_id'),
                    'filename': result.get('filename', ''),
                    'status': result.get('status'),
                    'detections_count': len(detections),
                    'max_confidence': max([d.get('confidence', 0) for d in detections], default=0),
                    'processing_time': result.get('result', {}).get('processing_time', 0),
                    'error': result.get('error', '')
                })

        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.read().encode()),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=batch_{job_id}_results.csv"
            }
        )

    elif format == "zip":
        # Generate ZIP with individual result JSON files
        zip_buffer = io.BytesIO()

        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            # Add summary file
            summary = {
                'job_id': job_id,
                'total': len(results),
                'successful': sum(1 for r in results if r.get('status') == 'success'),
                'failed': sum(1 for r in results if r.get('status') == 'failed'),
                'created_at': job.created_at.isoformat(),
                'completed_at': job.completed_at.isoformat() if job.completed_at else None
            }
            zf.writestr('summary.json', json.dumps(summary, indent=2))

            # Add individual result files
            for result in results:
                filename = f"results/{result.get('image_id', 'unknown')}.json"
                zf.writestr(filename, json.dumps(result, indent=2))

        zip_buffer.seek(0)
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename=batch_{job_id}_results.zip"
            }
        )

    elif format == "excel":
        # Generate Excel file (requires pandas and openpyxl)
        try:
            import pandas as pd
            from io import BytesIO

            # Prepare data for DataFrame
            data = []
            for result in results:
                detections = result.get('result', {}).get('detections', []) if result.get('status') == 'success' else []
                data.append({
                    'Image ID': result.get('image_id'),
                    'Filename': result.get('filename', ''),
                    'Status': result.get('status'),
                    'Detections': len(detections),
                    'Max Confidence': max([d.get('confidence', 0) for d in detections], default=0),
                    'Processing Time (s)': result.get('result', {}).get('processing_time', 0),
                    'Error': result.get('error', '')
                })

            df = pd.DataFrame(data)

            # Create Excel writer
            excel_buffer = BytesIO()
            with pd.ExcelWriter(excel_buffer, engine='openpyxl') as writer:
                # Write main results
                df.to_excel(writer, sheet_name='Results', index=False)

                # Write summary
                summary_data = {
                    'Metric': ['Total Images', 'Successful', 'Failed', 'Success Rate'],
                    'Value': [
                        len(results),
                        sum(1 for r in results if r.get('status') == 'success'),
                        sum(1 for r in results if r.get('status') == 'failed'),
                        f"{(sum(1 for r in results if r.get('status') == 'success') / len(results) * 100):.2f}%"
                    ]
                }
                summary_df = pd.DataFrame(summary_data)
                summary_df.to_excel(writer, sheet_name='Summary', index=False)

            excel_buffer.seek(0)
            return StreamingResponse(
                excel_buffer,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={
                    "Content-Disposition": f"attachment; filename=batch_{job_id}_results.xlsx"
                }
            )

        except ImportError:
            raise HTTPException(500, "Excel export requires pandas and openpyxl packages")

@router.delete("/{job_id}")
async def cancel_job(
    job_id: str,
    current_user = Depends(get_current_user)
):
    """
    Cancel a batch processing job.

    Args:
        job_id: Batch job ID to cancel
        current_user: Authenticated user

    Returns:
        Cancellation status
    """
    # Get job from database
    job = batch_service.get_job(job_id)

    if not job:
        raise HTTPException(404, f"Job {job_id} not found")

    # Check ownership
    if job.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(403, "Access denied")

    # Check if job can be cancelled
    if job.status in [BatchStatus.COMPLETED, BatchStatus.FAILED]:
        raise HTTPException(400, f"Cannot cancel job with status {job.status.value}")

    # Cancel Celery task
    result = AsyncResult(job.task_id)
    result.revoke(terminate=True)

    # Update job status in database
    batch_service.cancel_job(job_id)

    # Send cancellation notification if configured
    if job.options.get('notification_email'):
        send_notification.delay(job_id, job.options['notification_email'], 'cancellation')

    return {
        'job_id': job_id,
        'status': 'cancelled',
        'message': f'Job {job_id} has been cancelled'
    }

@router.get("/queue/status")
async def get_queue_status(
    current_user = Depends(get_current_user)
):
    """
    Get current queue status and depths.

    Returns:
        Queue statistics for all priority levels
    """
    if not current_user.is_admin:
        raise HTTPException(403, "Admin access required")

    return batch_service.get_queue_status()

@router.post("/{job_id}/retry")
async def retry_failed_job(
    job_id: str,
    only_failed: bool = Query(True),
    current_user = Depends(get_current_user)
):
    """
    Retry a failed or partially completed job.

    Args:
        job_id: Batch job ID to retry
        only_failed: Only retry failed images
        current_user: Authenticated user

    Returns:
        New job information
    """
    # Get original job
    job = batch_service.get_job(job_id)

    if not job:
        raise HTTPException(404, f"Job {job_id} not found")

    # Check ownership
    if job.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(403, "Access denied")

    # Check if job can be retried
    if job.status not in [BatchStatus.FAILED, BatchStatus.PARTIAL]:
        raise HTTPException(400, f"Cannot retry job with status {job.status.value}")

    # Create retry job
    new_job_id = batch_service.retry_job(job_id, only_failed=only_failed)

    return {
        'original_job_id': job_id,
        'new_job_id': new_job_id,
        'status': 'queued',
        'message': f'Retry job {new_job_id} created'
    }

@router.get("/history")
async def get_job_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    status_filter: Optional[str] = Query(None, regex="^(queued|processing|completed|failed|cancelled)$"),
    current_user = Depends(get_current_user)
):
    """
    Get user's batch job history with pagination.

    Args:
        page: Page number
        page_size: Items per page
        status_filter: Optional status filter
        current_user: Authenticated user

    Returns:
        Paginated job history
    """
    jobs = batch_service.get_user_jobs(
        user_id=current_user.id,
        page=page,
        page_size=page_size,
        status_filter=status_filter
    )

    return {
        'page': page,
        'page_size': page_size,
        'total': jobs['total'],
        'jobs': jobs['items'],
        'has_next': jobs['has_next'],
        'has_prev': page > 1
    }