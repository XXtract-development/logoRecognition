"""Model registry service layer.

US-INT-003: Service Layer with Database Logic
This module implements the ModelService for model registry operations.
"""

from typing import Optional, List
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.training import ModelRegistry
from app.services.base_service import BaseService, ValidationError


class ModelService(BaseService[ModelRegistry]):
    """
    Service for model registry operations.

    This service provides:
    - Model activation (only one model can be active at a time)
    - Model listing with filtering
    - Active model retrieval
    """

    def __init__(self, db: Session):
        """
        Initialize model service.

        Args:
            db: SQLAlchemy database session
        """
        super().__init__(db, ModelRegistry)

    def activate_model(self, model_id: UUID) -> ModelRegistry:
        """
        Activate a model (deactivate all others).

        Only one model can be active at a time. This method:
        1. Deactivates all existing models
        2. Activates the selected model

        Args:
            model_id: UUID of model to activate

        Returns:
            Activated ModelRegistry instance

        Raises:
            NotFoundError: If model not found
        """
        model = self.get_or_404(str(model_id))

        with self.transaction():
            # Deactivate all models
            self.db.query(ModelRegistry).update({"is_active": False})

            # Activate selected model
            model.is_active = True

        return model

    def deactivate_model(self, model_id: UUID) -> ModelRegistry:
        """
        Deactivate a specific model.

        Args:
            model_id: UUID of model to deactivate

        Returns:
            Deactivated ModelRegistry instance

        Raises:
            NotFoundError: If model not found
        """
        model = self.get_or_404(str(model_id))

        with self.transaction():
            model.is_active = False

        return model

    def list_models(
        self,
        active_only: bool = False,
        limit: int = 20,
        offset: int = 0
    ) -> tuple[List[ModelRegistry], int]:
        """
        List registered models with optional filtering.

        Args:
            active_only: If True, only return active models
            limit: Maximum results to return
            offset: Pagination offset

        Returns:
            Tuple of (models list, total count)
        """
        filters = {}
        if active_only:
            filters["is_active"] = True

        return self.list_all(filters=filters, limit=limit, offset=offset)

    def get_active_model(self) -> Optional[ModelRegistry]:
        """
        Get currently active model.

        Returns:
            Active ModelRegistry instance or None if no model is active
        """
        return self.db.query(ModelRegistry).filter(
            ModelRegistry.is_active == True
        ).first()

    def get_model_by_version(self, version: str) -> Optional[ModelRegistry]:
        """
        Get model by version string.

        Args:
            version: Model version (e.g., "v20250102_143022")

        Returns:
            ModelRegistry instance or None if not found
        """
        return self.db.query(ModelRegistry).filter(
            ModelRegistry.version == version
        ).first()

    def get_models_by_training_job(self, training_job_id: UUID) -> List[ModelRegistry]:
        """
        Get all models created by a specific training job.

        Args:
            training_job_id: UUID of training job

        Returns:
            List of ModelRegistry instances
        """
        return self.db.query(ModelRegistry).filter(
            ModelRegistry.training_job_id == training_job_id
        ).all()
