"""Unit tests for TrainingJobService.

US-INT-003: Service Layer with Database Logic
Comprehensive tests for training job service including business logic validation.
"""

import pytest
from uuid import uuid4
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.training import TrainingJob, ModelRegistry
from app.services.training_service import TrainingJobService
from app.services.base_service import (
    ValidationError,
    DuplicateJobError,
    InvalidStateError,
    NotFoundError
)


class TestTrainingJobService:
    """Test suite for TrainingJobService."""

    @pytest.fixture(autouse=True)
    def setup_database(self, db_session):
        """Use shared database session with transaction isolation."""
        self.db = db_session
        yield

    @pytest.fixture
    def service(self):
        """Create TrainingJobService instance for testing."""
        return TrainingJobService(self.db)

    @pytest.fixture
    def valid_job_params(self):
        """Valid job parameters for testing."""
        return {
            "dataset_version_id": uuid4(),
            "model_name": "Test Model",
            "augmentation_factor": 50,
            "target_categories": ["brand.nike", "brand.adidas"],
            "accuracy_threshold": 0.85,
            "user_id": "test_user",
            "batch_size": 32,
            "total_epochs": 50
        }

    # Test create_job method

    def test_create_job_success(self, service, valid_job_params):
        """Test successful job creation with valid parameters."""
        # Act
        job = service.create_job(**valid_job_params)

        # Assert
        assert job.id is not None
        assert job.status == "pending"
        assert job.augmentation_factor == 50
        assert job.target_categories == ["brand.nike", "brand.adidas"]
        assert job.accuracy_threshold == 0.85
        assert job.created_by == "test_user"
        assert job.checksum is not None
        assert job.version == 1

    def test_create_job_validates_augmentation_too_low(self, service, valid_job_params):
        """Test augmentation factor validation rejects values below minimum."""
        # Arrange
        valid_job_params["augmentation_factor"] = 5  # < 10

        # Act & Assert
        with pytest.raises(ValidationError, match="must be between 10 and 500"):
            service.create_job(**valid_job_params)

    def test_create_job_validates_augmentation_too_high(self, service, valid_job_params):
        """Test augmentation factor validation rejects values above maximum."""
        # Arrange
        valid_job_params["augmentation_factor"] = 600  # > 500

        # Act & Assert
        with pytest.raises(ValidationError, match="must be between 10 and 500"):
            service.create_job(**valid_job_params)

    def test_create_job_validates_augmentation_at_minimum(self, service, valid_job_params):
        """Test augmentation factor accepts minimum value."""
        # Arrange
        valid_job_params["augmentation_factor"] = 10

        # Act
        job = service.create_job(**valid_job_params)

        # Assert
        assert job.augmentation_factor == 10

    def test_create_job_validates_augmentation_at_maximum(self, service, valid_job_params):
        """Test augmentation factor accepts maximum value."""
        # Arrange
        valid_job_params["augmentation_factor"] = 500

        # Act
        job = service.create_job(**valid_job_params)

        # Assert
        assert job.augmentation_factor == 500

    def test_create_job_validates_categories_empty(self, service, valid_job_params):
        """Test category validation rejects empty list."""
        # Arrange
        valid_job_params["target_categories"] = []

        # Act & Assert
        with pytest.raises(ValidationError, match="At least one target category is required"):
            service.create_job(**valid_job_params)

    def test_create_job_validates_categories_invalid_format(self, service, valid_job_params):
        """Test category validation rejects invalid format."""
        # Arrange
        valid_job_params["target_categories"] = ["invalid_category"]

        # Act & Assert
        with pytest.raises(ValidationError, match="Invalid category format"):
            service.create_job(**valid_job_params)

    def test_create_job_validates_categories_valid_format(self, service, valid_job_params):
        """Test category validation accepts valid formats."""
        # Arrange
        valid_job_params["target_categories"] = [
            "brand.nike",
            "recycling.pet",
            "category.value"
        ]

        # Act
        job = service.create_job(**valid_job_params)

        # Assert
        assert len(job.target_categories) == 3

    def test_create_job_validates_accuracy_threshold_too_low(self, service, valid_job_params):
        """Test accuracy threshold validation rejects values below 0.5."""
        # Arrange
        valid_job_params["accuracy_threshold"] = 0.3

        # Act & Assert
        with pytest.raises(ValidationError, match="must be between 0.5 and 1.0"):
            service.create_job(**valid_job_params)

    def test_create_job_validates_accuracy_threshold_too_high(self, service, valid_job_params):
        """Test accuracy threshold validation rejects values above 1.0."""
        # Arrange
        valid_job_params["accuracy_threshold"] = 1.5

        # Act & Assert
        with pytest.raises(ValidationError, match="must be between 0.5 and 1.0"):
            service.create_job(**valid_job_params)

    def test_create_job_validates_concurrent_jobs_limit(self, service, valid_job_params):
        """Test user concurrent jobs limit is enforced."""
        # Arrange - Create 3 active jobs (max allowed)
        for i in range(3):
            job = TrainingJob(
                status="running",
                created_by="test_user",
                config={}
            )
            self.db.add(job)
        self.db.commit()

        # Act & Assert
        with pytest.raises(ValidationError, match="Maximum 3 concurrent jobs allowed"):
            service.create_job(**valid_job_params)

    def test_create_job_allows_fourth_job_if_one_completed(self, service, valid_job_params):
        """Test user can create new job if previous job completed."""
        # Arrange - Create 2 running jobs and 1 completed job
        for i in range(2):
            job = TrainingJob(status="running", created_by="test_user", config={})
            self.db.add(job)

        completed_job = TrainingJob(status="completed", created_by="test_user", config={})
        self.db.add(completed_job)
        self.db.commit()

        # Act - Should succeed as only 2 active jobs
        job = service.create_job(**valid_job_params)

        # Assert
        assert job.id is not None

    # Test duplicate detection

    def test_duplicate_detection_raises_error(self, service, valid_job_params):
        """Test duplicate job detection raises DuplicateJobError."""
        # Arrange - Create first job
        job1 = service.create_job(**valid_job_params)

        # Act & Assert - Try to create duplicate
        with pytest.raises(DuplicateJobError) as exc_info:
            service.create_job(**valid_job_params)

        assert exc_info.value.existing_job_id == str(job1.id)

    def test_duplicate_detection_allows_after_24_hours(self, service, valid_job_params):
        """Test duplicate job allowed after 24 hour window."""
        # Arrange - Create old job (25 hours ago)
        old_job = service.create_job(**valid_job_params)
        old_job.created_at = datetime.utcnow() - timedelta(hours=25)
        self.db.commit()

        # Act - Should succeed as outside detection window
        new_job = service.create_job(**valid_job_params)

        # Assert
        assert new_job.id != old_job.id

    def test_duplicate_detection_ignores_different_params(self, service, valid_job_params):
        """Test jobs with different parameters are not considered duplicates."""
        # Arrange - Create first job
        service.create_job(**valid_job_params)

        # Act - Create job with different augmentation factor
        valid_job_params["augmentation_factor"] = 100
        job2 = service.create_job(**valid_job_params)

        # Assert
        assert job2.id is not None

    def test_checksum_calculation_is_deterministic(self, service):
        """Test checksum calculation is deterministic for same inputs."""
        # Arrange
        payload = {
            "dataset_version_id": uuid4(),
            "augmentation_factor": 50,
            "target_categories": ["brand.nike", "brand.adidas"],
            "accuracy_threshold": 0.85
        }

        # Act
        checksum1 = service._calculate_checksum(payload)
        checksum2 = service._calculate_checksum(payload)

        # Assert
        assert checksum1 == checksum2

    def test_checksum_calculation_ignores_category_order(self, service):
        """Test checksum is same regardless of category order."""
        # Arrange
        base_uuid = uuid4()
        payload1 = {
            "dataset_version_id": base_uuid,
            "augmentation_factor": 50,
            "target_categories": ["brand.nike", "brand.adidas"],
            "accuracy_threshold": 0.85
        }
        payload2 = {
            "dataset_version_id": base_uuid,
            "augmentation_factor": 50,
            "target_categories": ["brand.adidas", "brand.nike"],  # Different order
            "accuracy_threshold": 0.85
        }

        # Act
        checksum1 = service._calculate_checksum(payload1)
        checksum2 = service._calculate_checksum(payload2)

        # Assert
        assert checksum1 == checksum2

    # Test start_job method

    def test_start_job_success(self, service, valid_job_params):
        """Test successful job start."""
        # Arrange
        job = service.create_job(**valid_job_params)
        celery_task_id = "task-123"

        # Act
        started_job = service.start_job(job.id, celery_task_id)

        # Assert
        assert started_job.status == "running"
        assert started_job.started_at is not None
        assert started_job.celery_task_id == celery_task_id
        assert started_job.version == 2  # Incremented from 1

    def test_start_job_rejects_non_pending(self, service, valid_job_params):
        """Test start_job raises error if job not pending."""
        # Arrange
        job = service.create_job(**valid_job_params)
        job.status = "running"
        self.db.commit()

        # Act & Assert
        with pytest.raises(InvalidStateError, match="Cannot start job with status 'running'"):
            service.start_job(job.id, "task-123")

    # Test update_progress method

    def test_update_progress_success(self, service, valid_job_params):
        """Test successful progress update."""
        # Arrange
        job = service.create_job(**valid_job_params)
        service.start_job(job.id, "task-123")

        # Act
        updated_job = service.update_progress(
            job.id,
            phase_progress={"data_prep": 100, "training": 60},
            current_epoch=30,
            eta_seconds=600,
            resources={"gpu_utilization": 85, "memory_mb": 8192}
        )

        # Assert
        assert updated_job.phase_progress == {"data_prep": 100, "training": 60}
        assert updated_job.current_epoch == 30
        assert updated_job.eta_seconds == 600
        assert updated_job.resources == {"gpu_utilization": 85, "memory_mb": 8192}
        assert updated_job.version == 3  # Incremented

    def test_update_progress_rejects_non_running(self, service, valid_job_params):
        """Test update_progress raises error if job not running."""
        # Arrange
        job = service.create_job(**valid_job_params)

        # Act & Assert
        with pytest.raises(InvalidStateError, match="Cannot update progress"):
            service.update_progress(job.id, current_epoch=10)

    # Test complete_job method

    def test_complete_job_success(self, service, valid_job_params):
        """Test successful job completion and model registration."""
        # Arrange
        job = service.create_job(**valid_job_params)
        service.start_job(job.id, "task-123")

        metrics = {"accuracy": 0.95, "loss": 0.12}
        model_path = "/models/test.pth"

        # Act
        model = service.complete_job(job.id, metrics, model_path)

        # Assert - Job updated
        self.db.refresh(job)
        assert job.status == "completed"
        assert job.completed_at is not None
        assert job.metrics == metrics
        assert job.current_epoch == job.total_epochs
        assert job.model_version is not None

        # Assert - Model registered
        assert model.version is not None
        assert model.training_job_id == job.id
        assert model.model_path == model_path
        assert model.metrics == metrics
        assert model.is_active is False
        assert model.metadata is not None

    def test_complete_job_with_onnx_path(self, service, valid_job_params):
        """Test job completion with ONNX model path."""
        # Arrange
        job = service.create_job(**valid_job_params)
        service.start_job(job.id, "task-123")

        # Act
        model = service.complete_job(
            job.id,
            {"accuracy": 0.95},
            "/models/test.pth",
            onnx_path="/models/test.onnx"
        )

        # Assert
        assert model.onnx_path == "/models/test.onnx"

    def test_complete_job_rejects_non_running(self, service, valid_job_params):
        """Test complete_job raises error if job not running."""
        # Arrange
        job = service.create_job(**valid_job_params)

        # Act & Assert
        with pytest.raises(InvalidStateError, match="Cannot complete job"):
            service.complete_job(job.id, {"accuracy": 0.9}, "/models/test.pth")

    # Test fail_job method

    def test_fail_job_from_pending(self, service, valid_job_params):
        """Test failing a pending job."""
        # Arrange
        job = service.create_job(**valid_job_params)

        # Act
        failed_job = service.fail_job(job.id, "Test error message")

        # Assert
        assert failed_job.status == "failed"
        assert failed_job.completed_at is not None
        assert failed_job.error_message == "Test error message"

    def test_fail_job_from_running(self, service, valid_job_params):
        """Test failing a running job."""
        # Arrange
        job = service.create_job(**valid_job_params)
        service.start_job(job.id, "task-123")

        # Act
        failed_job = service.fail_job(job.id, "Runtime error")

        # Assert
        assert failed_job.status == "failed"
        assert failed_job.error_message == "Runtime error"

    def test_fail_job_rejects_completed(self, service, valid_job_params):
        """Test fail_job raises error if job already completed."""
        # Arrange
        job = service.create_job(**valid_job_params)
        service.start_job(job.id, "task-123")
        service.complete_job(job.id, {"accuracy": 0.9}, "/models/test.pth")

        # Act & Assert
        with pytest.raises(InvalidStateError, match="Cannot fail job"):
            service.fail_job(job.id, "Error")

    # Test cancel_job method

    def test_cancel_job_success(self, service, valid_job_params):
        """Test successful job cancellation."""
        # Arrange
        job = service.create_job(**valid_job_params)

        # Act
        cancelled_job = service.cancel_job(job.id, user_id="test_user")

        # Assert
        assert cancelled_job.status == "cancelled"
        assert cancelled_job.completed_at is not None
        assert cancelled_job.error_message == "Cancelled by user"

    def test_cancel_job_validates_user_authorization(self, service, valid_job_params):
        """Test cancel_job validates user is authorized."""
        # Arrange
        job = service.create_job(**valid_job_params)

        # Act & Assert
        with pytest.raises(ValidationError, match="Cannot cancel job created by another user"):
            service.cancel_job(job.id, user_id="different_user")

    def test_cancel_job_rejects_completed(self, service, valid_job_params):
        """Test cancel_job raises error if job completed."""
        # Arrange
        job = service.create_job(**valid_job_params)
        service.start_job(job.id, "task-123")
        service.complete_job(job.id, {"accuracy": 0.9}, "/models/test.pth")

        # Act & Assert
        with pytest.raises(InvalidStateError, match="Cannot cancel job with status 'completed'"):
            service.cancel_job(job.id)

    # Test list_jobs method

    def test_list_jobs_all(self, service, valid_job_params):
        """Test listing all jobs."""
        # Arrange - Create multiple jobs
        for i in range(5):
            params = valid_job_params.copy()
            params["augmentation_factor"] = 10 + i * 10
            service.create_job(**params)

        # Act
        jobs, total = service.list_jobs()

        # Assert
        assert len(jobs) == 5
        assert total == 5

    def test_list_jobs_filter_by_status(self, service, valid_job_params):
        """Test listing jobs filtered by status."""
        # Arrange
        job1 = service.create_job(**valid_job_params)
        service.start_job(job1.id, "task-123")

        valid_job_params["augmentation_factor"] = 100
        service.create_job(**valid_job_params)  # Still pending

        # Act
        running_jobs, total = service.list_jobs(status="running")

        # Assert
        assert len(running_jobs) == 1
        assert total == 1
        assert running_jobs[0].status == "running"

    def test_list_jobs_filter_by_user(self, service, valid_job_params):
        """Test listing jobs filtered by user."""
        # Arrange
        service.create_job(**valid_job_params)

        valid_job_params["user_id"] = "other_user"
        valid_job_params["augmentation_factor"] = 100
        service.create_job(**valid_job_params)

        # Act
        user_jobs, total = service.list_jobs(user_id="test_user")

        # Assert
        assert len(user_jobs) == 1
        assert total == 1
        assert user_jobs[0].created_by == "test_user"

    def test_list_jobs_pagination(self, service, valid_job_params):
        """Test job listing pagination."""
        # Arrange - Create 10 jobs
        for i in range(10):
            params = valid_job_params.copy()
            params["augmentation_factor"] = 10 + i * 10
            service.create_job(**params)

        # Act
        jobs_page1, total = service.list_jobs(limit=5, offset=0)
        jobs_page2, _ = service.list_jobs(limit=5, offset=5)

        # Assert
        assert len(jobs_page1) == 5
        assert len(jobs_page2) == 5
        assert total == 10
