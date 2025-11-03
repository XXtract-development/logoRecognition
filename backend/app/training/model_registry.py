"""Model registry for managing trained models."""

import json
import logging
import os
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional

import torch
from sqlalchemy import Column, DateTime, Float, Integer, String, Text, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker

from .artifact_storage import ModelArtifactStorage
from .validator import ModelValidator

logger = logging.getLogger(__name__)

Base = declarative_base()


class ModelStatus(str, Enum):
    """Model status enum."""
    TRAINING = "training"
    VALIDATING = "validating"
    STAGING = "staging"
    PRODUCTION = "production"
    ARCHIVED = "archived"
    FAILED = "failed"


class ModelRegistryEntry(Base):
    """Database model for model registry."""

    __tablename__ = "model_registry"

    id = Column(Integer, primary_key=True, autoincrement=True)
    model_name = Column(String(255), nullable=False)
    model_version = Column(String(50), nullable=False)
    model_type = Column(String(100))
    status = Column(String(50), default=ModelStatus.TRAINING)
    artifact_path = Column(Text)
    checksum = Column(String(64))

    # Metrics
    precision = Column(Float)
    recall = Column(Float)
    f1_score = Column(Float)
    map_score = Column(Float)
    loss = Column(Float)

    # Metadata
    training_dataset_id = Column(String(255))
    training_params = Column(Text)  # JSON
    validation_results = Column(Text)  # JSON
    tags = Column(Text)  # JSON

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deployed_at = Column(DateTime)

    # Deployment info
    deployment_endpoint = Column(String(255))
    deployment_config = Column(Text)  # JSON


class ModelRegistry:
    """Manages model registry and lifecycle."""

    def __init__(
        self,
        database_url: Optional[str] = None,
        artifact_storage: Optional[ModelArtifactStorage] = None,
        validator: Optional[ModelValidator] = None
    ):
        """Initialize model registry.

        Args:
            database_url: Database connection URL
            artifact_storage: Artifact storage instance
            validator: Model validator instance
        """
        # Setup database
        self.database_url = database_url or os.getenv(
            'DATABASE_URL',
            'sqlite:///model_registry.db'
        )
        self.engine = create_engine(self.database_url)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)

        # Setup components
        self.artifact_storage = artifact_storage or ModelArtifactStorage()
        self.validator = validator or ModelValidator()

        logger.info(f"Model registry initialized with database: {self.database_url}")

    def register_model(
        self,
        model_name: str,
        model_version: str,
        model_state: Dict[str, Any],
        model_type: str = "detection",
        training_params: Optional[Dict] = None,
        training_dataset_id: Optional[str] = None,
        tags: Optional[List[str]] = None,
        auto_validate: bool = True
    ) -> int:
        """Register a new model.

        Args:
            model_name: Name of the model
            model_version: Version of the model
            model_state: Model state dictionary
            model_type: Type of model
            training_params: Training parameters
            training_dataset_id: Dataset ID used for training
            tags: Optional tags
            auto_validate: Whether to auto-validate

        Returns:
            Registry entry ID
        """
        session = self.Session()

        try:
            # Save artifact
            artifact_info = self.artifact_storage.save_model_artifact(
                model_state=model_state,
                artifact_name=model_name,
                version=model_version,
                metadata={
                    'model_type': model_type,
                    'training_params': training_params,
                    'dataset_id': training_dataset_id
                }
            )

            # Create registry entry
            entry = ModelRegistryEntry(
                model_name=model_name,
                model_version=model_version,
                model_type=model_type,
                status=ModelStatus.TRAINING,
                artifact_path=artifact_info['local_path'],
                checksum=artifact_info['checksum'],
                training_dataset_id=training_dataset_id,
                training_params=json.dumps(training_params) if training_params else None,
                tags=json.dumps(tags) if tags else None
            )

            session.add(entry)
            session.commit()

            logger.info(
                f"Model registered: {model_name} v{model_version} "
                f"(ID: {entry.id})"
            )

            # Auto-validate if requested
            if auto_validate:
                self.validate_model(entry.id)

            return entry.id

        except Exception as e:
            session.rollback()
            logger.error(f"Error registering model: {str(e)}")
            raise
        finally:
            session.close()

    def validate_model(
        self,
        model_id: int,
        test_data_loader: Optional[Any] = None
    ) -> Dict[str, Any]:
        """Validate a registered model.

        Args:
            model_id: Model registry ID
            test_data_loader: Optional test data loader

        Returns:
            Validation results
        """
        session = self.Session()

        try:
            # Get model entry
            entry = session.query(ModelRegistryEntry).filter_by(id=model_id).first()
            if not entry:
                raise ValueError(f"Model not found: {model_id}")

            # Update status
            entry.status = ModelStatus.VALIDATING
            session.commit()

            # Load model
            model_state = self.artifact_storage.load_model_artifact(
                artifact_name=entry.model_name,
                version=entry.model_version
            )

            # Create model instance (simplified - should use proper factory)
            from torchvision.models.detection import fasterrcnn_resnet50_fpn
            model = fasterrcnn_resnet50_fpn(pretrained=False)
            model.load_state_dict(model_state['model_state_dict'])

            # Validate
            if test_data_loader:
                validation_results = self.validator.validate_model(
                    model=model,
                    test_loader=test_data_loader,
                    model_name=entry.model_name,
                    model_version=entry.model_version
                )
            else:
                # Basic validation without data
                validation_results = {
                    'passed': True,
                    'metrics': {},
                    'warnings': ['No test data provided for validation']
                }

            # Update registry with validation results
            if validation_results.get('metrics'):
                entry.precision = validation_results['metrics'].get('precision')
                entry.recall = validation_results['metrics'].get('recall')
                entry.f1_score = validation_results['metrics'].get('f1_score')
                entry.map_score = validation_results['metrics'].get('mAP')
                entry.loss = validation_results['metrics'].get('avg_loss')

            entry.validation_results = json.dumps(validation_results)

            # Update status based on validation
            if validation_results.get('passed'):
                entry.status = ModelStatus.STAGING
            else:
                entry.status = ModelStatus.FAILED

            session.commit()

            logger.info(
                f"Model {model_id} validation complete - "
                f"Status: {entry.status}"
            )

            return validation_results

        except Exception as e:
            session.rollback()
            logger.error(f"Error validating model: {str(e)}")
            raise
        finally:
            session.close()

    def promote_to_production(
        self,
        model_id: int,
        deployment_endpoint: Optional[str] = None,
        deployment_config: Optional[Dict] = None
    ) -> bool:
        """Promote model to production.

        Args:
            model_id: Model registry ID
            deployment_endpoint: Deployment endpoint URL
            deployment_config: Deployment configuration

        Returns:
            Success status
        """
        session = self.Session()

        try:
            # Get model entry
            entry = session.query(ModelRegistryEntry).filter_by(id=model_id).first()
            if not entry:
                raise ValueError(f"Model not found: {model_id}")

            # Check if model is in staging
            if entry.status != ModelStatus.STAGING:
                logger.warning(
                    f"Model {model_id} not in staging status "
                    f"(current: {entry.status})"
                )
                return False

            # Archive current production model
            current_prod = session.query(ModelRegistryEntry).filter_by(
                model_name=entry.model_name,
                status=ModelStatus.PRODUCTION
            ).first()

            if current_prod:
                current_prod.status = ModelStatus.ARCHIVED
                logger.info(f"Archived previous production model: {current_prod.id}")

            # Promote to production
            entry.status = ModelStatus.PRODUCTION
            entry.deployed_at = datetime.utcnow()
            entry.deployment_endpoint = deployment_endpoint
            entry.deployment_config = json.dumps(deployment_config) if deployment_config else None

            session.commit()

            logger.info(
                f"Model {model_id} promoted to production - "
                f"{entry.model_name} v{entry.model_version}"
            )

            return True

        except Exception as e:
            session.rollback()
            logger.error(f"Error promoting model: {str(e)}")
            return False
        finally:
            session.close()

    def get_production_model(self, model_name: str) -> Optional[Dict]:
        """Get current production model.

        Args:
            model_name: Name of the model

        Returns:
            Model information or None
        """
        session = self.Session()

        try:
            entry = session.query(ModelRegistryEntry).filter_by(
                model_name=model_name,
                status=ModelStatus.PRODUCTION
            ).first()

            if entry:
                return self._entry_to_dict(entry)

            return None

        finally:
            session.close()

    def get_model_by_id(self, model_id: int) -> Optional[Dict]:
        """Get model by ID.

        Args:
            model_id: Model registry ID

        Returns:
            Model information or None
        """
        session = self.Session()

        try:
            entry = session.query(ModelRegistryEntry).filter_by(id=model_id).first()

            if entry:
                return self._entry_to_dict(entry)

            return None

        finally:
            session.close()

    def list_models(
        self,
        model_name: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict]:
        """List models in registry.

        Args:
            model_name: Filter by model name
            status: Filter by status
            limit: Maximum number of results

        Returns:
            List of model information
        """
        session = self.Session()

        try:
            query = session.query(ModelRegistryEntry)

            if model_name:
                query = query.filter_by(model_name=model_name)

            if status:
                query = query.filter_by(status=status)

            query = query.order_by(ModelRegistryEntry.created_at.desc())
            query = query.limit(limit)

            entries = query.all()

            return [self._entry_to_dict(entry) for entry in entries]

        finally:
            session.close()

    def compare_models(
        self,
        model_id1: int,
        model_id2: int
    ) -> Dict[str, Any]:
        """Compare two models.

        Args:
            model_id1: First model ID
            model_id2: Second model ID

        Returns:
            Comparison results
        """
        model1 = self.get_model_by_id(model_id1)
        model2 = self.get_model_by_id(model_id2)

        if not model1 or not model2:
            raise ValueError("One or both models not found")

        # Get validation results
        val1 = json.loads(model1.get('validation_results', '{}'))
        val2 = json.loads(model2.get('validation_results', '{}'))

        # Use validator to compare
        comparison = self.validator.compare_models(val1, val2)

        # Add registry-specific info
        comparison['model1_id'] = model_id1
        comparison['model2_id'] = model_id2
        comparison['model1_status'] = model1['status']
        comparison['model2_status'] = model2['status']

        return comparison

    def get_model_history(self, model_name: str) -> List[Dict]:
        """Get version history for a model.

        Args:
            model_name: Name of the model

        Returns:
            List of model versions
        """
        session = self.Session()

        try:
            entries = session.query(ModelRegistryEntry).filter_by(
                model_name=model_name
            ).order_by(ModelRegistryEntry.created_at.desc()).all()

            history = []
            for entry in entries:
                history.append({
                    'id': entry.id,
                    'version': entry.model_version,
                    'status': entry.status,
                    'created_at': entry.created_at.isoformat() if entry.created_at else None,
                    'deployed_at': entry.deployed_at.isoformat() if entry.deployed_at else None,
                    'precision': entry.precision,
                    'recall': entry.recall,
                    'f1_score': entry.f1_score,
                    'map_score': entry.map_score
                })

            return history

        finally:
            session.close()

    def rollback_model(self, model_name: str, target_version: str) -> bool:
        """Rollback to a specific model version.

        Args:
            model_name: Name of the model
            target_version: Target version to rollback to

        Returns:
            Success status
        """
        session = self.Session()

        try:
            # Get target model
            target = session.query(ModelRegistryEntry).filter_by(
                model_name=model_name,
                model_version=target_version
            ).first()

            if not target:
                logger.error(f"Target version not found: {model_name} v{target_version}")
                return False

            # Archive current production
            current = session.query(ModelRegistryEntry).filter_by(
                model_name=model_name,
                status=ModelStatus.PRODUCTION
            ).first()

            if current:
                current.status = ModelStatus.ARCHIVED

            # Promote target to production
            target.status = ModelStatus.PRODUCTION
            target.deployed_at = datetime.utcnow()

            session.commit()

            logger.info(f"Rolled back {model_name} to v{target_version}")
            return True

        except Exception as e:
            session.rollback()
            logger.error(f"Error during rollback: {str(e)}")
            return False
        finally:
            session.close()

    def _entry_to_dict(self, entry: ModelRegistryEntry) -> Dict:
        """Convert registry entry to dictionary.

        Args:
            entry: Registry entry

        Returns:
            Dictionary representation
        """
        return {
            'id': entry.id,
            'model_name': entry.model_name,
            'model_version': entry.model_version,
            'model_type': entry.model_type,
            'status': entry.status,
            'artifact_path': entry.artifact_path,
            'checksum': entry.checksum,
            'precision': entry.precision,
            'recall': entry.recall,
            'f1_score': entry.f1_score,
            'map_score': entry.map_score,
            'loss': entry.loss,
            'training_dataset_id': entry.training_dataset_id,
            'training_params': json.loads(entry.training_params) if entry.training_params else None,
            'validation_results': json.loads(entry.validation_results) if entry.validation_results else None,
            'tags': json.loads(entry.tags) if entry.tags else None,
            'created_at': entry.created_at.isoformat() if entry.created_at else None,
            'updated_at': entry.updated_at.isoformat() if entry.updated_at else None,
            'deployed_at': entry.deployed_at.isoformat() if entry.deployed_at else None,
            'deployment_endpoint': entry.deployment_endpoint,
            'deployment_config': json.loads(entry.deployment_config) if entry.deployment_config else None
        }

    def cleanup_old_models(
        self,
        model_name: str,
        keep_versions: int = 5,
        keep_production: bool = True
    ):
        """Clean up old model versions.

        Args:
            model_name: Name of the model
            keep_versions: Number of versions to keep
            keep_production: Whether to keep production models
        """
        session = self.Session()

        try:
            # Get all models sorted by creation date
            query = session.query(ModelRegistryEntry).filter_by(
                model_name=model_name
            )

            if keep_production:
                query = query.filter(
                    ModelRegistryEntry.status != ModelStatus.PRODUCTION
                )

            entries = query.order_by(
                ModelRegistryEntry.created_at.desc()
            ).all()

            # Keep the latest N versions
            if len(entries) > keep_versions:
                to_delete = entries[keep_versions:]

                for entry in to_delete:
                    # Delete artifact
                    self.artifact_storage.delete_artifact(
                        entry.model_name,
                        entry.model_version
                    )

                    # Delete registry entry
                    session.delete(entry)

                session.commit()

                logger.info(
                    f"Cleaned up {len(to_delete)} old versions of {model_name}"
                )

        except Exception as e:
            session.rollback()
            logger.error(f"Error cleaning up models: {str(e)}")
        finally:
            session.close()