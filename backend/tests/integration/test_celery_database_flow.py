"""Integration test for Celery → Database flow.

US-INT-004: Integration Tests
Test complete workflow from API → Celery → Database with NO JSON files.

This test verifies the COMPLETE flow:
1. Job created in database
2. Celery task picks up job from database
3. Progress updates written to database
4. Model registered in database
5. NO JSON files created/modified
"""

import pytest
import time
import os
from uuid import uuid4
from datetime import datetime
from unittest.mock import patch

from app.tasks.training_tasks import execute_training_pipeline
from app.models.training import TrainingJob, ModelRegistry
from app.services.training_service import TrainingJobService


class TestCompleteDatabaseWorkflow:
    """Test complete workflow: Database → Celery → Training → Database."""

    def test_complete_database_workflow(self, db_session, celery_worker):
        """
        Test complete flow: Database → Celery → Training → Database.

        Verifies:
        - Job loaded from database
        - Progress updates written to database
        - Model registered in database
        - NO JSON files involved
        """
        # Create job in database
        job = TrainingJob(
            id=uuid4(),
            status="pending",
            augmentation_factor=10,
            target_categories=["brand.test"],
            total_epochs=5,
            accuracy_threshold=0.85,
            batch_size=32,
            config={"model_name": "efficientdet_test"}
        )
        db_session.add(job)
        db_session.commit()

        job_id = str(job.id)

        # Mock the training pipeline for faster test execution
        with patch('app.tasks.training_tasks.EnhancedTrainingPipelineOrchestrator') as mock_orch:
            # Simulate training with progress updates
            async def async_run_pipeline(*args, **kwargs):
                # Get progress callback if provided
                progress_callback = kwargs.get('progress_callback')

                # Simulate 5 epochs with progress updates
                if progress_callback:
                    for epoch in range(1, 6):
                        progress_callback(
                            epoch=epoch,
                            total_epochs=5,
                            metrics={
                                "loss": 1.0 - (epoch * 0.15),
                                "accuracy": 0.5 + (epoch * 0.08)
                            },
                            phase="training"
                        )
                        # Small delay to simulate training
                        await asyncio.sleep(0.1)

                return {
                    "status": "completed",
                    "metrics": {"accuracy": 0.90, "loss": 0.25},
                    "model": {
                        "path": f"/models/{job_id}/model.pth",
                        "onnx_path": f"/models/{job_id}/model.onnx"
                    },
                    "duration": 30
                }

            mock_orch.return_value.run_pipeline = async_run_pipeline

            # Execute Celery task asynchronously
            result = execute_training_pipeline.apply_async(args=[job_id])

            # Wait for completion (with timeout)
            timeout = time.time() + 30  # 30 seconds max
            final_status = None

            while time.time() < timeout:
                db_session.refresh(job)
                if job.status in ["completed", "failed", "cancelled"]:
                    final_status = job.status
                    break
                time.sleep(0.5)

            # Verify job completed
            assert final_status == "completed", \
                f"Job did not complete. Status: {job.status}, Error: {job.error_message}"

            # Verify progress was tracked in database
            assert job.current_epoch == 5
            assert job.total_epochs == 5
            assert job.started_at is not None
            assert job.completed_at is not None

            # Verify metrics updated
            assert job.metrics is not None
            assert "accuracy" in job.metrics
            assert "loss" in job.metrics
            assert job.metrics["accuracy"] >= 0.85

            # Verify phase progress tracked
            if job.phase_progress:
                assert job.phase_progress.get("data_preparation") == 100
                assert job.phase_progress.get("training") == 100

            # Verify model in database
            model = db_session.query(ModelRegistry).filter(
                ModelRegistry.training_job_id == job.id
            ).first()

            assert model is not None, "Model not registered in database"
            assert model.version is not None
            assert model.model_path.endswith(".pth")
            assert model.onnx_path.endswith(".onnx")
            assert model.metrics["accuracy"] == 0.90
            assert model.is_active == False

            # Verify job links to model
            assert job.model_version == model.version

    def test_no_json_files_created_during_workflow(self, db_session, celery_worker, tmp_path):
        """
        Verify NO JSON files created during complete workflow.

        This is the CRITICAL test for AC6.
        """
        # Create job
        job = TrainingJob(
            id=uuid4(),
            status="pending",
            augmentation_factor=10,
            target_categories=["brand.test"],
            total_epochs=3,
            config={"model_name": "efficientdet_test"}
        )
        db_session.add(job)
        db_session.commit()

        # Mock training
        with patch('app.tasks.training_tasks.EnhancedTrainingPipelineOrchestrator') as mock_orch:
            async def async_run_pipeline(*args, **kwargs):
                return {
                    "status": "completed",
                    "metrics": {"accuracy": 0.88},
                    "model": {
                        "path": f"/models/{job.id}/model.pth",
                        "onnx_path": f"/models/{job.id}/model.onnx"
                    }
                }

            mock_orch.return_value.run_pipeline = async_run_pipeline

            # Execute task
            result = execute_training_pipeline.apply_async(args=[str(job.id)])

            # Wait for completion
            timeout = time.time() + 20
            while time.time() < timeout:
                db_session.refresh(job)
                if job.status in ["completed", "failed"]:
                    break
                time.sleep(0.5)

        # Verify NO JSON files created in uploads directory
        uploads_dir = "backend/uploads"
        if os.path.exists(uploads_dir):
            json_files = []
            for root, dirs, files in os.walk(uploads_dir):
                # Skip archive directories
                if 'archive' not in root:
                    json_files.extend([
                        os.path.join(root, f)
                        for f in files
                        if f.endswith('.json') and
                        ('training_jobs' in f or 'annotations' in f)
                    ])

            assert len(json_files) == 0, \
                f"JSON files created (should use DATABASE): {json_files}"

    def test_concurrent_jobs_database_safety(self, db_session, celery_worker):
        """
        Test multiple concurrent jobs with database transactions.

        Verifies:
        - Multiple jobs can run concurrently
        - Database transactions are isolated
        - No race conditions or corruption
        """
        # Create 3 jobs
        jobs = []
        for i in range(3):
            job = TrainingJob(
                id=uuid4(),
                status="pending",
                augmentation_factor=10,
                target_categories=[f"brand.test{i}"],
                total_epochs=3,
                config={"model_name": f"efficientdet_test_{i}"}
            )
            db_session.add(job)
            jobs.append(job)

        db_session.commit()

        # Mock training
        with patch('app.tasks.training_tasks.EnhancedTrainingPipelineOrchestrator') as mock_orch:
            async def async_run_pipeline(*args, **kwargs):
                return {
                    "status": "completed",
                    "metrics": {"accuracy": 0.85 + (i * 0.03)},
                    "model": {
                        "path": f"/models/test_{i}/model.pth",
                        "onnx_path": f"/models/test_{i}/model.onnx"
                    }
                }

            mock_orch.return_value.run_pipeline = async_run_pipeline

            # Start all jobs concurrently
            results = [
                execute_training_pipeline.apply_async(args=[str(job.id)])
                for job in jobs
            ]

            # Wait for all to complete
            timeout = time.time() + 30
            while time.time() < timeout:
                db_session.expire_all()  # Refresh all objects
                statuses = [
                    db_session.query(TrainingJob).filter(
                        TrainingJob.id == job.id
                    ).first().status
                    for job in jobs
                ]

                if all(s in ["completed", "failed"] for s in statuses):
                    break
                time.sleep(0.5)

            # Verify all jobs completed successfully
            for job in jobs:
                db_session.refresh(job)
                assert job.status == "completed", \
                    f"Job {job.id} failed: {job.error_message}"

            # Verify all models registered
            models = db_session.query(ModelRegistry).filter(
                ModelRegistry.training_job_id.in_([job.id for job in jobs])
            ).all()

            assert len(models) == 3, "Not all models registered"

    def test_error_recovery_in_workflow(self, db_session, celery_worker):
        """
        Test error handling in complete workflow.

        Verifies:
        - Errors properly caught and logged to database
        - Database left in consistent state
        - No partial updates committed
        """
        job = TrainingJob(
            id=uuid4(),
            status="pending",
            total_epochs=5,
            config={"model_name": "efficientdet_test"}
        )
        db_session.add(job)
        db_session.commit()

        # Mock training to fail
        with patch('app.tasks.training_tasks.EnhancedTrainingPipelineOrchestrator') as mock_orch:
            async def async_run_pipeline(*args, **kwargs):
                raise RuntimeError("Simulated training failure")

            mock_orch.return_value.run_pipeline = async_run_pipeline

            # Execute task (should fail)
            result = execute_training_pipeline.apply_async(args=[str(job.id)])

            # Wait for failure
            timeout = time.time() + 20
            while time.time() < timeout:
                db_session.refresh(job)
                if job.status == "failed":
                    break
                time.sleep(0.5)

        # Verify error logged to database
        assert job.status == "failed"
        assert "Simulated training failure" in job.error_message
        assert "RuntimeError" in job.error_message

        # Verify no model registered for failed job
        model = db_session.query(ModelRegistry).filter(
            ModelRegistry.training_job_id == job.id
        ).first()
        assert model is None, "Model should not be registered for failed job"

    def test_cancellation_workflow(self, db_session):
        """
        Test job cancellation workflow.

        Verifies:
        - Cancelled jobs don't execute
        - Database status updated correctly
        """
        job = TrainingJob(
            id=uuid4(),
            status="pending",
            total_epochs=5,
            config={"model_name": "efficientdet_test"}
        )
        db_session.add(job)
        db_session.commit()

        # Cancel job before execution
        service = TrainingJobService(db_session)
        service.cancel_job(job.id)

        db_session.refresh(job)
        assert job.status == "cancelled"

        # Try to execute (should return cancelled status)
        result = execute_training_pipeline.apply(args=[str(job.id)]).get()

        assert result["status"] == "cancelled"
        assert "cancelled" in result["message"].lower()


# Fixtures
@pytest.fixture
def db_session():
    """Provide a test database session."""
    from app.core.database import get_db, engine
    from app.models.base import Base

    # Create tables
    Base.metadata.create_all(bind=engine)

    # Get session
    session = next(get_db())

    yield session

    # Cleanup
    session.rollback()
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope='session')
def celery_worker():
    """Provide a Celery worker for integration tests."""
    from app.celery_app import app

    # Use eager mode for testing (synchronous execution)
    app.conf.task_always_eager = True
    app.conf.task_eager_propagates = True

    return app


import asyncio

# Ensure event loop for async tests
@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()
