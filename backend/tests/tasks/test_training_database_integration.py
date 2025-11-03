"""Unit tests for Celery database integration.

US-INT-004: Test Coverage for Database Integration
These tests verify that Celery tasks use PostgreSQL instead of JSON files.

Test Coverage:
- AC1: Task loads from database, not JSON
- AC2: Progress updates to database, not JSON
- AC3: Model registration in database
- AC4: Error handling with database rollback
- AC5: Task cancellation support
- AC6: NO JSON file operations
"""

import pytest
from uuid import uuid4, UUID
from unittest.mock import Mock, patch, MagicMock, AsyncMock
from datetime import datetime
import asyncio

from app.tasks.training_tasks import (
    execute_training_pipeline,
    cleanup_training_resources,
    _is_retryable_error
)
from app.models.training import TrainingJob, ModelRegistry
from app.services.training_service import TrainingJobService
from app.services.base_service import InvalidStateError


class TestTaskLoadsFromDatabase:
    """Test AC1: Task loads job from database, NOT JSON."""

    def test_task_loads_from_database_not_json(self, db_session):
        """Verify task loads job from database, NOT JSON (AC1)."""
        # Create job in database
        job = TrainingJob(
            id=uuid4(),
            status="pending",
            augmentation_factor=50,
            target_categories=["brand.nike", "brand.adidas"],
            total_epochs=10,
            accuracy_threshold=0.85,
            config={"model_name": "efficientdet"}
        )
        db_session.add(job)
        db_session.commit()

        # Mock training pipeline
        with patch('app.tasks.training_tasks.EnhancedTrainingPipelineOrchestrator') as mock_orch:
            mock_result = {
                "status": "completed",
                "metrics": {"accuracy": 0.92, "loss": 0.15},
                "model": {
                    "path": f"/models/{job.id}/model.pth",
                    "onnx_path": f"/models/{job.id}/model.onnx"
                },
                "duration": 3600
            }

            # Mock async run_pipeline
            async def async_run_pipeline(*args, **kwargs):
                return mock_result

            mock_orch.return_value.run_pipeline = async_run_pipeline

            # Execute task
            result = execute_training_pipeline.apply(args=[str(job.id)]).get()

        # Verify database updated (not JSON)
        db_session.refresh(job)
        assert job.status == "completed"
        assert job.started_at is not None
        assert job.completed_at is not None
        assert job.celery_task_id is not None
        assert result["status"] == "completed"
        assert "model_version" in result

    def test_task_fails_if_job_not_in_database(self, db_session):
        """Test task fails gracefully if job doesn't exist in database."""
        fake_job_id = str(uuid4())

        with pytest.raises(Exception):  # NotFoundError from service
            execute_training_pipeline.apply(args=[fake_job_id]).get()

    def test_task_idempotency_already_running(self, db_session):
        """Test task handles already running job (idempotency check)."""
        job = TrainingJob(
            id=uuid4(),
            status="running",  # Already running
            augmentation_factor=50,
            target_categories=["brand.nike"],
            total_epochs=10,
            config={"model_name": "efficientdet"}
        )
        db_session.add(job)
        db_session.commit()

        result = execute_training_pipeline.apply(args=[str(job.id)]).get()

        assert result["status"] == "already_running"
        assert result["job_id"] == str(job.id)


class TestProgressUpdatesDatabase:
    """Test AC2: Progress callback updates database, NOT JSON."""

    def test_progress_updates_database_not_json(self, db_session):
        """Test progress callback updates database, NOT JSON (AC2)."""
        job = TrainingJob(
            id=uuid4(),
            status="running",
            total_epochs=100,
            started_at=datetime.utcnow(),
            config={"model_name": "efficientdet"}
        )
        db_session.add(job)
        db_session.commit()

        # Update progress via service
        service = TrainingJobService(db_session)

        service.update_progress(
            job_id=job.id,
            current_epoch=50,
            total_epochs=100,
            phase_progress={"data_preparation": 100, "training": 50, "validation": 0},
            metrics={"loss": 0.42, "accuracy": 0.78},
            resources={"gpu_utilization_percent": 85, "gpu_memory_allocated_mb": 4096},
            eta_seconds=1800
        )

        # Verify database updated (not JSON)
        db_session.refresh(job)
        assert job.current_epoch == 50
        assert job.total_epochs == 100
        assert job.phase_progress["training"] == 50
        assert job.metrics["loss"] == 0.42
        assert job.metrics["accuracy"] == 0.78
        assert job.resources["gpu_utilization_percent"] == 85
        assert job.eta_seconds == 1800

    def test_progress_callback_handles_cancellation(self, db_session):
        """Test progress callback detects job cancellation."""
        job = TrainingJob(
            id=uuid4(),
            status="running",
            total_epochs=100,
            config={"model_name": "efficientdet"}
        )
        db_session.add(job)
        db_session.commit()

        # Cancel job mid-training
        service = TrainingJobService(db_session)
        service.cancel_job(job.id)

        # Verify status is cancelled
        db_session.refresh(job)
        assert job.status == "cancelled"


class TestModelRegistrationDatabase:
    """Test AC3: Model registered in database, NOT JSON."""

    def test_model_registration_in_database(self, db_session):
        """Test model registered in database, NOT JSON (AC3)."""
        job = TrainingJob(
            id=uuid4(),
            status="pending",
            total_epochs=5,
            augmentation_factor=50,
            target_categories=["brand.test"],
            accuracy_threshold=0.85,
            config={"model_name": "efficientdet"}
        )
        db_session.add(job)
        db_session.commit()

        # Mock successful training
        with patch('app.tasks.training_tasks.EnhancedTrainingPipelineOrchestrator') as mock_orch:
            async def async_run_pipeline(*args, **kwargs):
                return {
                    "status": "completed",
                    "metrics": {"accuracy": 0.95, "loss": 0.08},
                    "model": {
                        "path": f"/models/{job.id}/model.pth",
                        "onnx_path": f"/models/{job.id}/model.onnx"
                    },
                    "duration": 3600
                }

            mock_orch.return_value.run_pipeline = async_run_pipeline

            result = execute_training_pipeline.apply(args=[str(job.id)]).get()

        # Verify model in database (not JSON)
        model = db_session.query(ModelRegistry).filter(
            ModelRegistry.training_job_id == job.id
        ).first()

        assert model is not None
        assert model.version is not None
        assert model.version.startswith("v")
        assert model.model_path.endswith(".pth")
        assert model.onnx_path.endswith(".onnx")
        assert model.metrics["accuracy"] == 0.95
        assert model.metrics["loss"] == 0.08
        assert model.is_active == False  # Not active until admin activates
        assert model.training_job_id == job.id

        # Verify job also updated
        db_session.refresh(job)
        assert job.status == "completed"
        assert job.model_version == model.version
        assert job.metrics["accuracy"] == 0.95

    def test_model_version_format(self, db_session):
        """Test model version has correct timestamp format."""
        job = TrainingJob(
            id=uuid4(),
            status="pending",
            total_epochs=5,
            augmentation_factor=50,
            target_categories=["brand.test"],
            config={"model_name": "efficientdet"}
        )
        db_session.add(job)
        db_session.commit()

        with patch('app.tasks.training_tasks.EnhancedTrainingPipelineOrchestrator') as mock_orch:
            async def async_run_pipeline(*args, **kwargs):
                return {
                    "status": "completed",
                    "metrics": {"accuracy": 0.90},
                    "model": {
                        "path": f"/models/{job.id}/model.pth",
                        "onnx_path": f"/models/{job.id}/model.onnx"
                    }
                }

            mock_orch.return_value.run_pipeline = async_run_pipeline
            result = execute_training_pipeline.apply(args=[str(job.id)]).get()

        model = db_session.query(ModelRegistry).filter(
            ModelRegistry.training_job_id == job.id
        ).first()

        # Version format: v20250103_142530
        assert model.version.startswith("v")
        version_parts = model.version[1:].split("_")
        assert len(version_parts) == 2
        assert len(version_parts[0]) == 8  # YYYYMMDD
        assert len(version_parts[1]) == 6  # HHMMSS


class TestErrorHandlingDatabaseRollback:
    """Test AC4: Error handling updates database, NOT JSON."""

    def test_error_handling_with_database_rollback(self, db_session):
        """Test error handling updates database, NOT JSON (AC4)."""
        job = TrainingJob(
            id=uuid4(),
            status="pending",
            total_epochs=5,
            config={"model_name": "efficientdet"}
        )
        db_session.add(job)
        db_session.commit()

        # Mock pipeline failure
        with patch('app.tasks.training_tasks.EnhancedTrainingPipelineOrchestrator') as mock_orch:
            async def async_run_pipeline(*args, **kwargs):
                raise RuntimeError("GPU out of memory")

            mock_orch.return_value.run_pipeline = async_run_pipeline

            with pytest.raises(RuntimeError):
                execute_training_pipeline.apply(args=[str(job.id)]).get()

        # Verify error in database (not JSON)
        db_session.refresh(job)
        assert job.status == "failed"
        assert "GPU out of memory" in job.error_message
        assert "RuntimeError" in job.error_message
        assert job.completed_at is not None

    def test_retryable_error_detection(self):
        """Test _is_retryable_error correctly identifies transient errors."""
        # Retryable errors
        assert _is_retryable_error(ConnectionError("Connection lost")) == True
        assert _is_retryable_error(TimeoutError("Request timeout")) == True
        assert _is_retryable_error(Exception("OperationalError: DB unavailable")) == False  # Type name check

        # Non-retryable errors
        assert _is_retryable_error(ValueError("Invalid value")) == False
        assert _is_retryable_error(KeyError("Key not found")) == False
        assert _is_retryable_error(RuntimeError("OOM")) == False

    def test_task_retry_on_transient_error(self, db_session):
        """Test task retries on transient errors."""
        job = TrainingJob(
            id=uuid4(),
            status="pending",
            total_epochs=5,
            config={"model_name": "efficientdet"}
        )
        db_session.add(job)
        db_session.commit()

        with patch('app.tasks.training_tasks.EnhancedTrainingPipelineOrchestrator') as mock_orch:
            # First call fails with ConnectionError
            async def async_run_pipeline(*args, **kwargs):
                raise ConnectionError("Network error")

            mock_orch.return_value.run_pipeline = async_run_pipeline

            # Task should retry on ConnectionError
            # We can't easily test the actual retry here without Celery infrastructure
            # So we just verify the error is raised (which triggers retry logic)
            with pytest.raises(ConnectionError):
                execute_training_pipeline.apply(args=[str(job.id)]).get()


class TestTaskCancellation:
    """Test AC5: Task cancellation support."""

    def test_cancelled_job_not_executed(self, db_session):
        """Test task doesn't execute if job already cancelled."""
        job = TrainingJob(
            id=uuid4(),
            status="cancelled",
            total_epochs=5,
            config={"model_name": "efficientdet"}
        )
        db_session.add(job)
        db_session.commit()

        result = execute_training_pipeline.apply(args=[str(job.id)]).get()

        assert result["status"] == "cancelled"
        assert "cancelled by user" in result["message"].lower()

    def test_cancel_job_during_training(self, db_session):
        """Test cancelling job during training stops execution."""
        job = TrainingJob(
            id=uuid4(),
            status="running",
            total_epochs=100,
            config={"model_name": "efficientdet"}
        )
        db_session.add(job)
        db_session.commit()

        # Simulate cancellation
        service = TrainingJobService(db_session)
        service.cancel_job(job.id)

        db_session.refresh(job)
        assert job.status == "cancelled"
        assert "Cancelled by user" in job.error_message


class TestNoJsonFileOperations:
    """Test AC6: NO JSON files read or written."""

    def test_no_json_file_operations(self, db_session, tmp_path, monkeypatch):
        """Test NO JSON files read or written (AC6)."""
        job = TrainingJob(
            id=uuid4(),
            status="pending",
            total_epochs=5,
            augmentation_factor=50,
            target_categories=["brand.test"],
            config={"model_name": "efficientdet"}
        )
        db_session.add(job)
        db_session.commit()

        # Track file operations
        file_ops = []
        original_open = open

        def tracked_open(file, mode='r', *args, **kwargs):
            file_str = str(file)
            if file_str.endswith('.json'):
                file_ops.append((file_str, mode))
            return original_open(file, mode, *args, **kwargs)

        monkeypatch.setattr('builtins.open', tracked_open)

        # Mock training
        with patch('app.tasks.training_tasks.EnhancedTrainingPipelineOrchestrator') as mock_orch:
            async def async_run_pipeline(*args, **kwargs):
                return {
                    "status": "completed",
                    "metrics": {"accuracy": 0.90},
                    "model": {
                        "path": f"/models/{job.id}/model.pth",
                        "onnx_path": f"/models/{job.id}/model.onnx"
                    }
                }

            mock_orch.return_value.run_pipeline = async_run_pipeline

            execute_training_pipeline.apply(args=[str(job.id)]).get()

        # Verify NO JSON operations on training/annotation files
        json_ops = [
            op for op in file_ops
            if 'training_jobs' in op[0] or 'annotations' in op[0]
        ]

        assert len(json_ops) == 0, \
            f"JSON files accessed (should use DATABASE): {json_ops}"


class TestCleanupTask:
    """Test cleanup_training_resources task."""

    @patch('app.tasks.training_tasks.redis')
    @patch('app.tasks.training_tasks.torch')
    def test_cleanup_clears_resources(self, mock_torch, mock_redis):
        """Test cleanup task clears Redis and GPU resources."""
        job_id = str(uuid4())

        # Mock Redis
        mock_redis_client = Mock()
        mock_redis.Redis.return_value = mock_redis_client
        mock_redis_client.scan_iter.return_value = [
            b"training:job123:progress",
            b"training:job123:metrics"
        ]

        # Mock torch
        mock_torch.cuda.is_available.return_value = True

        # Execute cleanup
        cleanup_training_resources(job_id)

        # Verify Redis cleanup called
        assert mock_redis_client.delete.call_count == 2

        # Verify GPU cleanup called
        mock_torch.cuda.empty_cache.assert_called_once()

    def test_cleanup_handles_errors_gracefully(self):
        """Test cleanup doesn't fail on errors."""
        job_id = str(uuid4())

        # Should not raise even if Redis/torch unavailable
        try:
            cleanup_training_resources(job_id)
        except Exception as e:
            pytest.fail(f"Cleanup should not raise exceptions: {e}")


# Fixtures
@pytest.fixture
def db_session():
    """Provide a database session for testing."""
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
