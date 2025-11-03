"""Integration tests for service layer.

US-INT-003: Service Layer with Database Logic
Tests for transaction rollback, error handling, and database integration.
"""

import pytest
from uuid import uuid4
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError

from app.models.base import Base
from app.models.training import TrainingJob, ModelRegistry
from app.services.training_service import TrainingJobService
from app.services.model_service import ModelService
from app.services.base_service import DatabaseError


class TestServiceTransactionIntegration:
    """Integration tests for transaction management."""

    @pytest.fixture(autouse=True)
    def setup_database(self, db_session):
        """Use shared database session with transaction isolation."""
        self.db = db_session
        yield

    @pytest.fixture
    def training_service(self):
        """Create TrainingJobService instance."""
        return TrainingJobService(self.db)

    @pytest.fixture
    def model_service(self):
        """Create ModelService instance."""
        return ModelService(self.db)

    @pytest.fixture
    def valid_job_params(self):
        """Valid job parameters."""
        return {
            "dataset_version_id": uuid4(),
            "model_name": "Test Model",
            "augmentation_factor": 50,
            "target_categories": ["brand.nike"],
            "accuracy_threshold": 0.85,
            "user_id": "test_user"
        }

    def test_transaction_commits_on_success(self, training_service, valid_job_params):
        """Test that successful operations commit to database."""
        # Arrange
        initial_count = self.db.query(TrainingJob).count()

        # Act
        job = training_service.create_job(**valid_job_params)

        # Assert - Job is in database
        final_count = self.db.query(TrainingJob).count()
        assert final_count == initial_count + 1

        # Verify job can be retrieved
        retrieved_job = training_service.get_by_id(str(job.id))
        assert retrieved_job is not None

    def test_transaction_rolls_back_on_exception(self, training_service, valid_job_params):
        """Test that failed operations roll back database changes."""
        # Arrange
        initial_count = self.db.query(TrainingJob).count()

        # Act - Create a job then cause an error
        try:
            with training_service.transaction():
                job = TrainingJob(
                    status="pending",
                    dataset_version_id=valid_job_params["dataset_version_id"],
                    config={}
                )
                self.db.add(job)
                # Force an error
                raise ValueError("Simulated error")
        except ValueError:
            pass

        # Assert - No job was created
        final_count = self.db.query(TrainingJob).count()
        assert final_count == initial_count

    def test_complete_job_registers_model_atomically(self, training_service, valid_job_params):
        """Test that job completion and model registration happen atomically."""
        # Arrange
        job = training_service.create_job(**valid_job_params)
        training_service.start_job(job.id, "task-123")

        initial_model_count = self.db.query(ModelRegistry).count()

        # Act
        model = training_service.complete_job(
            job.id,
            {"accuracy": 0.95},
            "/models/test.pth"
        )

        # Assert - Both job and model updated
        self.db.refresh(job)
        assert job.status == "completed"
        assert job.model_version == model.version

        final_model_count = self.db.query(ModelRegistry).count()
        assert final_model_count == initial_model_count + 1

    def test_model_activation_deactivates_others_atomically(self, model_service):
        """Test that model activation and deactivation happen atomically."""
        # Arrange - Create training job and models
        job = TrainingJob(status="completed", config={})
        self.db.add(job)
        self.db.commit()

        model1 = ModelRegistry(
            version="v1",
            training_job_id=job.id,
            model_path="/models/m1.pth",
            is_active=True
        )
        model2 = ModelRegistry(
            version="v2",
            training_job_id=job.id,
            model_path="/models/m2.pth",
            is_active=False
        )
        self.db.add_all([model1, model2])
        self.db.commit()

        # Act
        model_service.activate_model(model2.id)

        # Assert - Only model2 is active
        self.db.refresh(model1)
        self.db.refresh(model2)
        assert model1.is_active is False
        assert model2.is_active is True

        # Verify through query
        active_models = self.db.query(ModelRegistry).filter(
            ModelRegistry.is_active == True
        ).all()
        assert len(active_models) == 1
        assert active_models[0].id == model2.id

    def test_multiple_operations_in_sequence_maintain_consistency(
        self, training_service, valid_job_params
    ):
        """Test that multiple service operations maintain database consistency."""
        # Act - Create, start, update, complete job
        job = training_service.create_job(**valid_job_params)
        assert job.status == "pending"
        assert job.version == 1

        training_service.start_job(job.id, "task-123")
        self.db.refresh(job)
        assert job.status == "running"
        assert job.version == 2

        training_service.update_progress(job.id, current_epoch=25)
        self.db.refresh(job)
        assert job.current_epoch == 25
        assert job.version == 3

        model = training_service.complete_job(
            job.id,
            {"accuracy": 0.95},
            "/models/test.pth"
        )
        self.db.refresh(job)
        assert job.status == "completed"
        assert job.version == 4

        # Assert - All changes persisted correctly
        retrieved_job = training_service.get_by_id(str(job.id))
        assert retrieved_job.status == "completed"
        assert retrieved_job.current_epoch == 25
        assert retrieved_job.model_version == model.version


class TestServiceErrorHandling:
    """Integration tests for error handling."""

    @pytest.fixture(autouse=True)
    def setup_database(self, db_session):
        """Use shared database session with transaction isolation."""
        self.db = db_session
        yield

    @pytest.fixture
    def training_service(self):
        """Create TrainingJobService instance."""
        return TrainingJobService(self.db)

    def test_database_error_contains_context(self, training_service):
        """Test that DatabaseError includes helpful context."""
        # This test verifies that DatabaseError wraps underlying exceptions
        # with additional context for debugging

        # Note: Exact implementation depends on database constraints
        # This is a placeholder for database error handling tests
        pass

    def test_version_increments_prevent_lost_updates(self, training_service):
        """Test that version field prevents lost updates (optimistic locking)."""
        # Arrange - Create and start a job
        job = training_service.create_job(
            dataset_version_id=uuid4(),
            model_name="Test",
            augmentation_factor=50,
            target_categories=["brand.test"],
            accuracy_threshold=0.85,
            user_id="test_user"
        )
        training_service.start_job(job.id, "task-123")

        initial_version = job.version

        # Act - Update progress multiple times
        for i in range(5):
            training_service.update_progress(job.id, current_epoch=i * 10)

        # Assert - Version incremented correctly
        self.db.refresh(job)
        assert job.version == initial_version + 5

    def test_concurrent_job_limit_enforced_across_service_calls(self, training_service):
        """Test that concurrent job limit is enforced across multiple service calls."""
        # Arrange - Create 3 running jobs for user
        for i in range(3):
            job = training_service.create_job(
                dataset_version_id=uuid4(),
                model_name=f"Model {i}",
                augmentation_factor=10 + i * 10,
                target_categories=["brand.test"],
                accuracy_threshold=0.85,
                user_id="test_user"
            )
            training_service.start_job(job.id, f"task-{i}")

        # Act & Assert - 4th job should fail
        from app.services.base_service import ValidationError

        with pytest.raises(ValidationError, match="Maximum 3 concurrent jobs"):
            training_service.create_job(
                dataset_version_id=uuid4(),
                model_name="Model 4",
                augmentation_factor=100,
                target_categories=["brand.test"],
                accuracy_threshold=0.85,
                user_id="test_user"
            )

        # Complete one job
        jobs = self.db.query(TrainingJob).filter(
            TrainingJob.created_by == "test_user"
        ).all()
        training_service.complete_job(
            jobs[0].id,
            {"accuracy": 0.9},
            "/models/test.pth"
        )

        # Now 4th job should succeed
        job4 = training_service.create_job(
            dataset_version_id=uuid4(),
            model_name="Model 4",
            augmentation_factor=100,
            target_categories=["brand.test"],
            accuracy_threshold=0.85,
            user_id="test_user"
        )
        assert job4.id is not None


class TestServiceIntegrationWorkflows:
    """Integration tests for complete workflows."""

    @pytest.fixture(autouse=True)
    def setup_database(self, db_session):
        """Use shared database session with transaction isolation."""
        self.db = db_session
        yield

    @pytest.fixture
    def training_service(self):
        """Create TrainingJobService instance."""
        return TrainingJobService(self.db)

    @pytest.fixture
    def model_service(self):
        """Create ModelService instance."""
        return ModelService(self.db)

    def test_complete_training_workflow(self, training_service, model_service):
        """Test complete training workflow from creation to model activation."""
        # Step 1: Create job
        job = training_service.create_job(
            dataset_version_id=uuid4(),
            model_name="Production Model",
            augmentation_factor=100,
            target_categories=["brand.nike", "brand.adidas"],
            accuracy_threshold=0.90,
            user_id="data_scientist"
        )
        assert job.status == "pending"

        # Step 2: Start job
        training_service.start_job(job.id, "celery-task-123")
        self.db.refresh(job)
        assert job.status == "running"

        # Step 3: Update progress
        training_service.update_progress(
            job.id,
            phase_progress={"data_prep": 100, "training": 50},
            current_epoch=25,
            eta_seconds=3600,
            resources={"gpu_utilization": 90}
        )
        self.db.refresh(job)
        assert job.current_epoch == 25

        # Step 4: Complete job and register model
        model = training_service.complete_job(
            job.id,
            {"accuracy": 0.95, "loss": 0.08, "f1_score": 0.93},
            "/models/prod_model.pth",
            onnx_path="/models/prod_model.onnx"
        )
        self.db.refresh(job)
        assert job.status == "completed"
        assert model.is_active is False

        # Step 5: Activate model
        model_service.activate_model(model.id)
        active = model_service.get_active_model()
        assert active.id == model.id

        # Verify complete state
        final_job = training_service.get_by_id(str(job.id))
        assert final_job.status == "completed"
        assert final_job.metrics["accuracy"] == 0.95
        assert final_job.model_version == model.version

    def test_failed_training_workflow(self, training_service):
        """Test training workflow that fails during execution."""
        # Step 1: Create and start job
        job = training_service.create_job(
            dataset_version_id=uuid4(),
            model_name="Test Model",
            augmentation_factor=50,
            target_categories=["brand.test"],
            accuracy_threshold=0.85,
            user_id="test_user"
        )
        training_service.start_job(job.id, "task-123")

        # Step 2: Update progress
        training_service.update_progress(job.id, current_epoch=10)

        # Step 3: Job fails
        training_service.fail_job(job.id, "CUDA out of memory error")

        # Assert final state
        self.db.refresh(job)
        assert job.status == "failed"
        assert job.error_message == "CUDA out of memory error"
        assert job.completed_at is not None

        # Verify no model was registered
        models = self.db.query(ModelRegistry).filter(
            ModelRegistry.training_job_id == job.id
        ).all()
        assert len(models) == 0

    def test_cancelled_training_workflow(self, training_service):
        """Test training workflow that is cancelled by user."""
        # Step 1: Create job
        job = training_service.create_job(
            dataset_version_id=uuid4(),
            model_name="Test Model",
            augmentation_factor=50,
            target_categories=["brand.test"],
            accuracy_threshold=0.85,
            user_id="test_user"
        )

        # Step 2: User cancels before job starts
        training_service.cancel_job(job.id, user_id="test_user")

        # Assert final state
        self.db.refresh(job)
        assert job.status == "cancelled"
        assert job.error_message == "Cancelled by user"
        assert job.completed_at is not None

    def test_multiple_jobs_same_user_workflow(self, training_service):
        """Test workflow with multiple jobs from same user."""
        # Create 3 jobs with different parameters
        jobs = []
        for i in range(3):
            job = training_service.create_job(
                dataset_version_id=uuid4(),
                model_name=f"Model {i}",
                augmentation_factor=10 + i * 20,
                target_categories=["brand.test"],
                accuracy_threshold=0.85,
                user_id="test_user"
            )
            jobs.append(job)

        # Start all jobs
        for i, job in enumerate(jobs):
            training_service.start_job(job.id, f"task-{i}")

        # Complete jobs in different order
        training_service.complete_job(
            jobs[1].id,
            {"accuracy": 0.92},
            "/models/model1.pth"
        )
        training_service.fail_job(jobs[0].id, "Error")
        training_service.complete_job(
            jobs[2].id,
            {"accuracy": 0.94},
            "/models/model2.pth"
        )

        # Verify final states
        user_jobs, total = training_service.list_jobs(user_id="test_user")
        assert total == 3

        statuses = {job.status for job in user_jobs}
        assert "completed" in statuses
        assert "failed" in statuses

        # Verify models registered only for completed jobs
        completed_jobs = [j for j in user_jobs if j.status == "completed"]
        for job in completed_jobs:
            models = self.db.query(ModelRegistry).filter(
                ModelRegistry.training_job_id == job.id
            ).all()
            assert len(models) == 1
