"""Unit tests for ModelService.

US-INT-003: Service Layer with Database Logic
Tests for model registry service operations.
"""

import pytest
from uuid import uuid4
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.training import TrainingJob, ModelRegistry
from app.services.model_service import ModelService
from app.services.base_service import NotFoundError


class TestModelService:
    """Test suite for ModelService."""

    @pytest.fixture(autouse=True)
    def setup_database(self, db_session):
        """Use shared database session with transaction isolation."""
        self.db = db_session
        yield

    @pytest.fixture
    def service(self):
        """Create ModelService instance for testing."""
        return ModelService(self.db)

    @pytest.fixture
    def training_job(self):
        """Create a training job for testing."""
        job = TrainingJob(
            status="completed",
            config={"model_name": "Test Model"},
            created_by="test_user"
        )
        self.db.add(job)
        self.db.commit()
        return job

    @pytest.fixture
    def model_registry(self, training_job):
        """Create a model registry entry for testing."""
        model = ModelRegistry(
            version="v20250102_120000",
            training_job_id=training_job.id,
            model_path="/models/test.pth",
            metrics={"accuracy": 0.95},
            is_active=False
        )
        self.db.add(model)
        self.db.commit()
        return model

    # Test activate_model method

    def test_activate_model_success(self, service, model_registry):
        """Test successful model activation."""
        # Act
        activated_model = service.activate_model(model_registry.id)

        # Assert
        assert activated_model.is_active is True

    def test_activate_model_deactivates_others(self, service, training_job):
        """Test activating a model deactivates all other models."""
        # Arrange - Create multiple models, activate one
        model1 = ModelRegistry(
            version="v1",
            training_job_id=training_job.id,
            model_path="/models/m1.pth",
            is_active=True
        )
        model2 = ModelRegistry(
            version="v2",
            training_job_id=training_job.id,
            model_path="/models/m2.pth",
            is_active=False
        )
        model3 = ModelRegistry(
            version="v3",
            training_job_id=training_job.id,
            model_path="/models/m3.pth",
            is_active=False
        )
        self.db.add_all([model1, model2, model3])
        self.db.commit()

        # Act - Activate model2
        service.activate_model(model2.id)

        # Assert
        self.db.refresh(model1)
        self.db.refresh(model2)
        self.db.refresh(model3)

        assert model1.is_active is False
        assert model2.is_active is True
        assert model3.is_active is False

    def test_activate_model_not_found(self, service):
        """Test activate_model raises NotFoundError for non-existent model."""
        # Act & Assert
        with pytest.raises(NotFoundError):
            service.activate_model(uuid4())

    # Test deactivate_model method

    def test_deactivate_model_success(self, service, training_job):
        """Test successful model deactivation."""
        # Arrange
        model = ModelRegistry(
            version="v1",
            training_job_id=training_job.id,
            model_path="/models/m1.pth",
            is_active=True
        )
        self.db.add(model)
        self.db.commit()

        # Act
        deactivated_model = service.deactivate_model(model.id)

        # Assert
        assert deactivated_model.is_active is False

    def test_deactivate_model_not_found(self, service):
        """Test deactivate_model raises NotFoundError for non-existent model."""
        # Act & Assert
        with pytest.raises(NotFoundError):
            service.deactivate_model(uuid4())

    # Test list_models method

    def test_list_models_all(self, service, training_job):
        """Test listing all models."""
        # Arrange - Create multiple models
        for i in range(5):
            model = ModelRegistry(
                version=f"v{i}",
                training_job_id=training_job.id,
                model_path=f"/models/m{i}.pth",
                is_active=i == 2  # Make one active
            )
            self.db.add(model)
        self.db.commit()

        # Act
        models, total = service.list_models()

        # Assert
        assert len(models) == 5
        assert total == 5

    def test_list_models_active_only(self, service, training_job):
        """Test listing only active models."""
        # Arrange - Create multiple models
        active_model = ModelRegistry(
            version="v1",
            training_job_id=training_job.id,
            model_path="/models/m1.pth",
            is_active=True
        )
        inactive_model = ModelRegistry(
            version="v2",
            training_job_id=training_job.id,
            model_path="/models/m2.pth",
            is_active=False
        )
        self.db.add_all([active_model, inactive_model])
        self.db.commit()

        # Act
        models, total = service.list_models(active_only=True)

        # Assert
        assert len(models) == 1
        assert total == 1
        assert models[0].is_active is True

    def test_list_models_pagination(self, service, training_job):
        """Test model listing pagination."""
        # Arrange - Create 10 models
        for i in range(10):
            model = ModelRegistry(
                version=f"v{i}",
                training_job_id=training_job.id,
                model_path=f"/models/m{i}.pth"
            )
            self.db.add(model)
        self.db.commit()

        # Act
        models_page1, total = service.list_models(limit=5, offset=0)
        models_page2, _ = service.list_models(limit=5, offset=5)

        # Assert
        assert len(models_page1) == 5
        assert len(models_page2) == 5
        assert total == 10

    # Test get_active_model method

    def test_get_active_model_found(self, service, training_job):
        """Test getting active model when one exists."""
        # Arrange
        active_model = ModelRegistry(
            version="v1",
            training_job_id=training_job.id,
            model_path="/models/m1.pth",
            is_active=True
        )
        inactive_model = ModelRegistry(
            version="v2",
            training_job_id=training_job.id,
            model_path="/models/m2.pth",
            is_active=False
        )
        self.db.add_all([active_model, inactive_model])
        self.db.commit()

        # Act
        result = service.get_active_model()

        # Assert
        assert result is not None
        assert result.id == active_model.id
        assert result.is_active is True

    def test_get_active_model_none_active(self, service, training_job):
        """Test getting active model when none exists."""
        # Arrange
        inactive_model = ModelRegistry(
            version="v1",
            training_job_id=training_job.id,
            model_path="/models/m1.pth",
            is_active=False
        )
        self.db.add(inactive_model)
        self.db.commit()

        # Act
        result = service.get_active_model()

        # Assert
        assert result is None

    # Test get_model_by_version method

    def test_get_model_by_version_found(self, service, model_registry):
        """Test getting model by version when it exists."""
        # Act
        result = service.get_model_by_version("v20250102_120000")

        # Assert
        assert result is not None
        assert result.id == model_registry.id

    def test_get_model_by_version_not_found(self, service):
        """Test getting model by version when it doesn't exist."""
        # Act
        result = service.get_model_by_version("vNonExistent")

        # Assert
        assert result is None

    # Test get_models_by_training_job method

    def test_get_models_by_training_job(self, service, training_job):
        """Test getting all models for a training job."""
        # Arrange - Create multiple models for same job
        model1 = ModelRegistry(
            version="v1",
            training_job_id=training_job.id,
            model_path="/models/m1.pth"
        )
        model2 = ModelRegistry(
            version="v2",
            training_job_id=training_job.id,
            model_path="/models/m2.pth"
        )
        self.db.add_all([model1, model2])
        self.db.commit()

        # Act
        results = service.get_models_by_training_job(training_job.id)

        # Assert
        assert len(results) == 2
        assert all(m.training_job_id == training_job.id for m in results)

    def test_get_models_by_training_job_empty(self, service):
        """Test getting models for training job with no models."""
        # Arrange
        job = TrainingJob(status="completed", config={})
        self.db.add(job)
        self.db.commit()

        # Act
        results = service.get_models_by_training_job(job.id)

        # Assert
        assert len(results) == 0

    # Test model activation workflow

    def test_model_activation_workflow(self, service, training_job):
        """Test complete model activation workflow."""
        # Arrange - Create 3 models
        models = []
        for i in range(3):
            model = ModelRegistry(
                version=f"v{i}",
                training_job_id=training_job.id,
                model_path=f"/models/m{i}.pth",
                is_active=False
            )
            models.append(model)
            self.db.add(model)
        self.db.commit()

        # Act 1 - Activate first model
        service.activate_model(models[0].id)
        active = service.get_active_model()
        assert active.id == models[0].id

        # Act 2 - Activate second model
        service.activate_model(models[1].id)
        active = service.get_active_model()
        assert active.id == models[1].id

        # Assert - First model is now inactive
        self.db.refresh(models[0])
        assert models[0].is_active is False
