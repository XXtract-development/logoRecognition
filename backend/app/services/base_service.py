"""Base service class with common database utilities.

US-INT-003: Service Layer with Database Logic
This module provides base service functionality for all service classes.
"""

from typing import TypeVar, Generic, Type, Optional, List
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError, DatabaseError as SQLDatabaseError
from contextlib import contextmanager

from app.models.base import Base

T = TypeVar('T', bound=Base)


class BaseService(Generic[T]):
    """
    Base service with database utilities and transaction management.

    All service classes should inherit from this base to get:
    - Transaction management with automatic rollback
    - Standard CRUD operations
    - Error handling
    """

    def __init__(self, db: Session, model_class: Type[T]):
        """
        Initialize base service.

        Args:
            db: SQLAlchemy database session
            model_class: Model class for this service
        """
        self.db = db
        self.model_class = model_class

    @contextmanager
    def transaction(self):
        """
        Context manager for database transactions with automatic rollback.

        Usage:
            with service.transaction():
                service.db.add(obj)
                # Commits on success, rolls back on exception

        Raises:
            DatabaseError: If database operation fails
        """
        try:
            yield
            self.db.commit()
        except (IntegrityError, SQLDatabaseError) as e:
            self.db.rollback()
            raise DatabaseError(f"Database operation failed: {str(e)}") from e
        except Exception as e:
            self.db.rollback()
            raise

    def get_by_id(self, id: str) -> Optional[T]:
        """
        Get model instance by ID.

        Args:
            id: Instance ID (string or UUID)

        Returns:
            Model instance or None if not found
        """
        return self.db.query(self.model_class).filter(
            self.model_class.id == id
        ).first()

    def get_or_404(self, id: str) -> T:
        """
        Get model instance by ID or raise NotFoundError.

        Args:
            id: Instance ID (string or UUID)

        Returns:
            Model instance

        Raises:
            NotFoundError: If instance not found
        """
        instance = self.get_by_id(id)
        if not instance:
            raise NotFoundError(
                f"{self.model_class.__name__} with id {id} not found"
            )
        return instance

    def list_all(
        self,
        filters: Optional[dict] = None,
        limit: int = 100,
        offset: int = 0,
        order_by: str = "created_at"
    ) -> tuple[List[T], int]:
        """
        List instances with filtering and pagination.

        Args:
            filters: Dictionary of field:value filters
            limit: Maximum results to return
            offset: Pagination offset
            order_by: Field name to order by (descending)

        Returns:
            Tuple of (results list, total count)
        """
        query = self.db.query(self.model_class)

        # Apply filters
        if filters:
            for key, value in filters.items():
                if hasattr(self.model_class, key):
                    query = query.filter(getattr(self.model_class, key) == value)

        # Get total count
        total = query.count()

        # Order and paginate
        if hasattr(self.model_class, order_by):
            query = query.order_by(getattr(self.model_class, order_by).desc())

        results = query.limit(limit).offset(offset).all()

        return results, total


# Custom exceptions

class ServiceError(Exception):
    """Base exception for service layer errors."""
    pass


class DatabaseError(ServiceError):
    """Database operation failed."""
    pass


class NotFoundError(ServiceError):
    """Resource not found."""
    pass


class ValidationError(ServiceError):
    """Business rule validation failed."""
    pass


class DuplicateJobError(ServiceError):
    """
    Duplicate training job detected.

    Attributes:
        existing_job_id: ID of the existing duplicate job
    """

    def __init__(self, message: str, existing_job_id: str):
        """
        Initialize duplicate job error.

        Args:
            message: Error message
            existing_job_id: UUID of existing job
        """
        super().__init__(message)
        self.existing_job_id = existing_job_id


class InvalidStateError(ServiceError):
    """Operation not allowed in current state."""
    pass


class ConcurrencyError(ServiceError):
    """Concurrent update conflict detected (optimistic locking)."""
    pass
