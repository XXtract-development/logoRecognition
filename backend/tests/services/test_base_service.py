"""Unit tests for BaseService.

US-INT-003: Service Layer with Database Logic
Tests for base service functionality including transaction management and CRUD operations.
"""

import pytest
from uuid import uuid4
from sqlalchemy import Column, String, DateTime, create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError
from datetime import datetime

from app.models.base import Base
from app.services.base_service import (
    BaseService,
    ServiceError,
    DatabaseError,
    NotFoundError,
    ValidationError,
    DuplicateJobError,
    InvalidStateError,
    ConcurrencyError
)


# Test model for BaseService testing
class TestModel(Base):
    """Test model for base service testing."""
    __tablename__ = "test_models"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class TestBaseService:
    """Test suite for BaseService."""

    @pytest.fixture(autouse=True)
    def setup_database(self, db_session):
        """Use shared database session with transaction isolation."""
        self.db = db_session
        yield

    @pytest.fixture
    def service(self):
        """Create BaseService instance for testing."""
        return BaseService(self.db, TestModel)

    def test_get_by_id_found(self, service):
        """Test get_by_id returns instance when found."""
        # Arrange
        test_id = str(uuid4())
        model = TestModel(id=test_id, name="Test")
        self.db.add(model)
        self.db.commit()

        # Act
        result = service.get_by_id(test_id)

        # Assert
        assert result is not None
        assert result.id == test_id
        assert result.name == "Test"

    def test_get_by_id_not_found(self, service):
        """Test get_by_id returns None when not found."""
        # Act
        result = service.get_by_id(str(uuid4()))

        # Assert
        assert result is None

    def test_get_or_404_found(self, service):
        """Test get_or_404 returns instance when found."""
        # Arrange
        test_id = str(uuid4())
        model = TestModel(id=test_id, name="Test")
        self.db.add(model)
        self.db.commit()

        # Act
        result = service.get_or_404(test_id)

        # Assert
        assert result is not None
        assert result.id == test_id

    def test_get_or_404_not_found_raises_error(self, service):
        """Test get_or_404 raises NotFoundError when not found."""
        # Act & Assert
        with pytest.raises(NotFoundError, match="TestModel with id .* not found"):
            service.get_or_404(str(uuid4()))

    def test_transaction_commits_on_success(self, service):
        """Test transaction commits when no exception occurs."""
        # Arrange
        test_id = str(uuid4())

        # Act
        with service.transaction():
            model = TestModel(id=test_id, name="Test")
            self.db.add(model)

        # Assert
        result = self.db.query(TestModel).filter(TestModel.id == test_id).first()
        assert result is not None
        assert result.name == "Test"

    def test_transaction_rolls_back_on_error(self, service):
        """Test transaction rolls back when exception occurs."""
        # Arrange
        test_id = str(uuid4())
        initial_count = self.db.query(TestModel).count()

        # Act & Assert
        with pytest.raises(ValueError):
            with service.transaction():
                model = TestModel(id=test_id, name="Test")
                self.db.add(model)
                raise ValueError("Test error")

        # Assert rollback occurred
        final_count = self.db.query(TestModel).count()
        assert final_count == initial_count, "Transaction was not rolled back"

    def test_list_all_without_filters(self, service):
        """Test list_all returns all instances without filters."""
        # Arrange
        for i in range(5):
            model = TestModel(id=str(uuid4()), name=f"Test {i}")
            self.db.add(model)
        self.db.commit()

        # Act
        results, total = service.list_all()

        # Assert
        assert len(results) == 5
        assert total == 5

    def test_list_all_with_filters(self, service):
        """Test list_all applies filters correctly."""
        # Arrange
        target_name = "Target"
        target_model = TestModel(id=str(uuid4()), name=target_name)
        self.db.add(target_model)

        for i in range(3):
            model = TestModel(id=str(uuid4()), name=f"Other {i}")
            self.db.add(model)
        self.db.commit()

        # Act
        results, total = service.list_all(filters={"name": target_name})

        # Assert
        assert len(results) == 1
        assert total == 1
        assert results[0].name == target_name

    def test_list_all_with_pagination(self, service):
        """Test list_all handles pagination correctly."""
        # Arrange
        for i in range(10):
            model = TestModel(id=str(uuid4()), name=f"Test {i}")
            self.db.add(model)
        self.db.commit()

        # Act - Get first page
        results_page1, total = service.list_all(limit=5, offset=0)

        # Assert
        assert len(results_page1) == 5
        assert total == 10

        # Act - Get second page
        results_page2, _ = service.list_all(limit=5, offset=5)

        # Assert
        assert len(results_page2) == 5


class TestCustomExceptions:
    """Test suite for custom exception classes."""

    def test_service_error_is_exception(self):
        """Test ServiceError is an Exception."""
        error = ServiceError("Test error")
        assert isinstance(error, Exception)

    def test_database_error_is_service_error(self):
        """Test DatabaseError inherits from ServiceError."""
        error = DatabaseError("Database failed")
        assert isinstance(error, ServiceError)

    def test_not_found_error_is_service_error(self):
        """Test NotFoundError inherits from ServiceError."""
        error = NotFoundError("Resource not found")
        assert isinstance(error, ServiceError)

    def test_validation_error_is_service_error(self):
        """Test ValidationError inherits from ServiceError."""
        error = ValidationError("Validation failed")
        assert isinstance(error, ServiceError)

    def test_duplicate_job_error_stores_job_id(self):
        """Test DuplicateJobError stores existing_job_id."""
        job_id = str(uuid4())
        error = DuplicateJobError("Duplicate detected", existing_job_id=job_id)

        assert isinstance(error, ServiceError)
        assert error.existing_job_id == job_id

    def test_invalid_state_error_is_service_error(self):
        """Test InvalidStateError inherits from ServiceError."""
        error = InvalidStateError("Invalid state")
        assert isinstance(error, ServiceError)

    def test_concurrency_error_is_service_error(self):
        """Test ConcurrencyError inherits from ServiceError."""
        error = ConcurrencyError("Concurrent update detected")
        assert isinstance(error, ServiceError)
