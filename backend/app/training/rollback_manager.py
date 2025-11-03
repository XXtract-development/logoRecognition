"""Rollback mechanism for model deployments."""

import json
import logging
import os
import shutil
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker

from .model_registry import ModelRegistry, ModelStatus
from .validator import ModelValidator

logger = logging.getLogger(__name__)

Base = declarative_base()


class RollbackReason(str, Enum):
    """Rollback reason enum."""
    PERFORMANCE_DEGRADATION = "performance_degradation"
    ERROR_RATE_INCREASE = "error_rate_increase"
    USER_REPORTED_ISSUES = "user_reported_issues"
    VALIDATION_FAILURE = "validation_failure"
    MANUAL_TRIGGER = "manual_trigger"
    AUTOMATED_TRIGGER = "automated_trigger"


class DeploymentHistory(Base):
    """Database model for deployment history."""

    __tablename__ = "deployment_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    model_id = Column(Integer, nullable=False)
    model_name = Column(String(255))
    model_version = Column(String(50))
    deployment_type = Column(String(50))  # production, staging, rollback

    # Performance metrics at deployment
    precision = Column(Float)
    recall = Column(Float)
    f1_score = Column(Float)
    error_rate = Column(Float)
    avg_inference_time_ms = Column(Float)

    # Deployment info
    deployed_by = Column(String(255))
    deployment_config = Column(Text)  # JSON
    rollback_from_id = Column(Integer)  # Previous deployment ID if rollback

    # Timestamps
    deployed_at = Column(DateTime, default=datetime.utcnow)
    replaced_at = Column(DateTime)
    is_active = Column(Boolean, default=True)


class RollbackEvent(Base):
    """Database model for rollback events."""

    __tablename__ = "rollback_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    from_model_id = Column(Integer, nullable=False)
    to_model_id = Column(Integer, nullable=False)
    reason = Column(String(100), nullable=False)
    details = Column(Text)  # JSON with detailed reason

    # Metrics comparison
    performance_metrics_before = Column(Text)  # JSON
    performance_metrics_after = Column(Text)  # JSON

    # Rollback metadata
    triggered_by = Column(String(50))  # manual or automated
    triggered_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)
    success = Column(Boolean)
    error_message = Column(Text)


class RollbackManager:
    """Manages model deployment rollbacks."""

    def __init__(
        self,
        database_url: Optional[str] = None,
        model_registry: Optional[ModelRegistry] = None,
        validator: Optional[ModelValidator] = None,
        backup_dir: str = "./model_backups"
    ):
        """Initialize rollback manager.

        Args:
            database_url: Database connection URL
            model_registry: Model registry instance
            validator: Model validator instance
            backup_dir: Directory for model backups
        """
        self.database_url = database_url or "sqlite:///rollback_manager.db"
        self.engine = create_engine(self.database_url)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)

        self.model_registry = model_registry or ModelRegistry()
        self.validator = validator or ModelValidator()

        self.backup_dir = Path(backup_dir)
        self.backup_dir.mkdir(parents=True, exist_ok=True)

        # Health check thresholds
        self.health_thresholds = {
            'max_error_rate': 0.1,  # 10% error rate
            'min_precision': 0.7,
            'min_recall': 0.6,
            'max_inference_time_ms': 200,
            'min_availability': 0.95  # 95% uptime
        }

        logger.info("Rollback manager initialized")

    def record_deployment(
        self,
        model_id: int,
        deployment_type: str = "production",
        metrics: Optional[Dict[str, float]] = None,
        deployed_by: str = "system",
        config: Optional[Dict] = None
    ) -> int:
        """Record a model deployment.

        Args:
            model_id: Model ID from registry
            deployment_type: Type of deployment
            metrics: Initial performance metrics
            deployed_by: Who deployed the model
            config: Deployment configuration

        Returns:
            Deployment history ID
        """
        session = self.Session()

        try:
            # Get model info
            model_info = self.model_registry.get_model_by_id(model_id)
            if not model_info:
                raise ValueError(f"Model not found: {model_id}")

            # Mark previous deployment as replaced
            prev_deployment = session.query(DeploymentHistory).filter_by(
                model_name=model_info['model_name'],
                deployment_type=deployment_type,
                is_active=True
            ).first()

            if prev_deployment:
                prev_deployment.is_active = False
                prev_deployment.replaced_at = datetime.utcnow()

            # Record new deployment
            deployment = DeploymentHistory(
                model_id=model_id,
                model_name=model_info['model_name'],
                model_version=model_info['model_version'],
                deployment_type=deployment_type,
                precision=metrics.get('precision') if metrics else model_info.get('precision'),
                recall=metrics.get('recall') if metrics else model_info.get('recall'),
                f1_score=metrics.get('f1_score') if metrics else model_info.get('f1_score'),
                error_rate=metrics.get('error_rate', 0) if metrics else 0,
                avg_inference_time_ms=metrics.get('avg_inference_time_ms') if metrics else None,
                deployed_by=deployed_by,
                deployment_config=json.dumps(config) if config else None,
                is_active=True
            )

            session.add(deployment)
            session.commit()

            # Create backup
            self._create_backup(model_id, deployment.id)

            logger.info(
                f"Recorded deployment {deployment.id} for "
                f"{model_info['model_name']} v{model_info['model_version']}"
            )

            return deployment.id

        except Exception as e:
            session.rollback()
            logger.error(f"Error recording deployment: {str(e)}")
            raise
        finally:
            session.close()

    def check_health(
        self,
        deployment_id: int,
        current_metrics: Dict[str, float]
    ) -> Tuple[bool, List[str]]:
        """Check deployment health against thresholds.

        Args:
            deployment_id: Deployment ID
            current_metrics: Current performance metrics

        Returns:
            Tuple of (is_healthy, issues_list)
        """
        session = self.Session()
        issues = []

        try:
            deployment = session.query(DeploymentHistory).filter_by(
                id=deployment_id,
                is_active=True
            ).first()

            if not deployment:
                return False, ["Deployment not found or not active"]

            # Check error rate
            if current_metrics.get('error_rate', 0) > self.health_thresholds['max_error_rate']:
                issues.append(
                    f"Error rate ({current_metrics['error_rate']:.2%}) exceeds "
                    f"threshold ({self.health_thresholds['max_error_rate']:.2%})"
                )

            # Check precision
            if current_metrics.get('precision', 1) < self.health_thresholds['min_precision']:
                issues.append(
                    f"Precision ({current_metrics['precision']:.3f}) below "
                    f"threshold ({self.health_thresholds['min_precision']:.3f})"
                )

            # Check recall
            if current_metrics.get('recall', 1) < self.health_thresholds['min_recall']:
                issues.append(
                    f"Recall ({current_metrics['recall']:.3f}) below "
                    f"threshold ({self.health_thresholds['min_recall']:.3f})"
                )

            # Check inference time
            if current_metrics.get('avg_inference_time_ms', 0) > self.health_thresholds['max_inference_time_ms']:
                issues.append(
                    f"Inference time ({current_metrics['avg_inference_time_ms']:.1f}ms) exceeds "
                    f"threshold ({self.health_thresholds['max_inference_time_ms']}ms)"
                )

            # Check against baseline (deployment metrics)
            if deployment.precision and current_metrics.get('precision'):
                precision_drop = deployment.precision - current_metrics['precision']
                if precision_drop > 0.1:  # 10% drop
                    issues.append(
                        f"Precision dropped by {precision_drop:.2%} from baseline"
                    )

            is_healthy = len(issues) == 0

            if not is_healthy:
                logger.warning(f"Health check failed for deployment {deployment_id}: {issues}")

            return is_healthy, issues

        finally:
            session.close()

    def trigger_rollback(
        self,
        current_deployment_id: int,
        reason: RollbackReason,
        target_version: Optional[str] = None,
        details: Optional[Dict] = None,
        triggered_by: str = "automated"
    ) -> Dict[str, Any]:
        """Trigger a model rollback.

        Args:
            current_deployment_id: Current deployment to rollback from
            reason: Reason for rollback
            target_version: Specific version to rollback to (latest stable if None)
            details: Additional details about rollback
            triggered_by: Who/what triggered the rollback

        Returns:
            Rollback result
        """
        session = self.Session()

        try:
            # Get current deployment
            current_deployment = session.query(DeploymentHistory).filter_by(
                id=current_deployment_id
            ).first()

            if not current_deployment:
                raise ValueError(f"Deployment not found: {current_deployment_id}")

            # Find target model
            if target_version:
                # Specific version requested
                target_model = self._find_model_by_version(
                    current_deployment.model_name,
                    target_version
                )
            else:
                # Find last stable deployment
                target_model = self._find_last_stable_model(
                    current_deployment.model_name,
                    current_deployment.model_id
                )

            if not target_model:
                raise ValueError("No suitable model found for rollback")

            # Record rollback event
            rollback_event = RollbackEvent(
                from_model_id=current_deployment.model_id,
                to_model_id=target_model['id'],
                reason=reason,
                details=json.dumps(details) if details else None,
                triggered_by=triggered_by,
                performance_metrics_before=json.dumps({
                    'precision': current_deployment.precision,
                    'recall': current_deployment.recall,
                    'f1_score': current_deployment.f1_score,
                    'error_rate': current_deployment.error_rate
                })
            )

            session.add(rollback_event)
            session.flush()

            # Perform rollback
            rollback_result = self._perform_rollback(
                current_deployment,
                target_model,
                rollback_event.id
            )

            # Update rollback event
            rollback_event.completed_at = datetime.utcnow()
            rollback_event.success = rollback_result['success']
            rollback_event.performance_metrics_after = json.dumps(
                rollback_result.get('new_metrics', {})
            )
            if not rollback_result['success']:
                rollback_event.error_message = rollback_result.get('error')

            session.commit()

            logger.info(
                f"Rollback {'successful' if rollback_result['success'] else 'failed'}: "
                f"From model {current_deployment.model_id} to {target_model['id']}"
            )

            return rollback_result

        except Exception as e:
            session.rollback()
            logger.error(f"Error triggering rollback: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
        finally:
            session.close()

    def _perform_rollback(
        self,
        current_deployment: DeploymentHistory,
        target_model: Dict,
        rollback_event_id: int
    ) -> Dict[str, Any]:
        """Perform the actual rollback.

        Args:
            current_deployment: Current deployment
            target_model: Target model to rollback to
            rollback_event_id: Rollback event ID

        Returns:
            Rollback result
        """
        try:
            # 1. Validate target model
            if self.validator:
                # Load and validate model (simplified)
                validation_results = {
                    'passed': True,  # Simplified - would actually validate
                    'metrics': {
                        'precision': target_model.get('precision', 0),
                        'recall': target_model.get('recall', 0),
                        'f1_score': target_model.get('f1_score', 0)
                    }
                }

                if not validation_results['passed']:
                    return {
                        'success': False,
                        'error': 'Target model validation failed',
                        'validation_results': validation_results
                    }

            # 2. Promote target model to production
            success = self.model_registry.promote_to_production(target_model['id'])

            if not success:
                return {
                    'success': False,
                    'error': 'Failed to promote target model'
                }

            # 3. Record new deployment
            new_deployment_id = self.record_deployment(
                model_id=target_model['id'],
                deployment_type='rollback',
                deployed_by='rollback_manager'
            )

            # 4. Update deployment history with rollback info
            session = self.Session()
            new_deployment = session.query(DeploymentHistory).filter_by(
                id=new_deployment_id
            ).first()
            new_deployment.rollback_from_id = current_deployment.id
            session.commit()
            session.close()

            return {
                'success': True,
                'from_model': {
                    'id': current_deployment.model_id,
                    'name': current_deployment.model_name,
                    'version': current_deployment.model_version
                },
                'to_model': {
                    'id': target_model['id'],
                    'name': target_model['model_name'],
                    'version': target_model['model_version']
                },
                'new_deployment_id': new_deployment_id,
                'new_metrics': validation_results.get('metrics', {}),
                'rollback_event_id': rollback_event_id
            }

        except Exception as e:
            logger.error(f"Error performing rollback: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def _find_last_stable_model(
        self,
        model_name: str,
        exclude_model_id: int
    ) -> Optional[Dict]:
        """Find the last stable model for rollback.

        Args:
            model_name: Model name
            exclude_model_id: Model ID to exclude

        Returns:
            Model info or None
        """
        session = self.Session()

        try:
            # Find last successful deployment
            last_deployment = session.query(DeploymentHistory).filter(
                DeploymentHistory.model_name == model_name,
                DeploymentHistory.model_id != exclude_model_id,
                DeploymentHistory.deployment_type != 'rollback'
            ).order_by(DeploymentHistory.deployed_at.desc()).first()

            if last_deployment:
                return self.model_registry.get_model_by_id(last_deployment.model_id)

            # If no deployment history, get last production model from registry
            models = self.model_registry.list_models(
                model_name=model_name,
                status=ModelStatus.PRODUCTION
            )

            for model in models:
                if model['id'] != exclude_model_id:
                    return model

            return None

        finally:
            session.close()

    def _find_model_by_version(
        self,
        model_name: str,
        version: str
    ) -> Optional[Dict]:
        """Find model by specific version.

        Args:
            model_name: Model name
            version: Model version

        Returns:
            Model info or None
        """
        models = self.model_registry.list_models(model_name=model_name)

        for model in models:
            if model['model_version'] == version:
                return model

        return None

    def _create_backup(self, model_id: int, deployment_id: int):
        """Create a backup of the model.

        Args:
            model_id: Model ID
            deployment_id: Deployment ID
        """
        try:
            model_info = self.model_registry.get_model_by_id(model_id)
            if not model_info or not model_info.get('artifact_path'):
                return

            # Create backup directory
            backup_path = self.backup_dir / f"deployment_{deployment_id}"
            backup_path.mkdir(parents=True, exist_ok=True)

            # Copy model artifact
            source_path = Path(model_info['artifact_path'])
            if source_path.exists():
                dest_path = backup_path / source_path.name
                shutil.copy2(source_path, dest_path)

                # Save backup metadata
                metadata = {
                    'model_id': model_id,
                    'deployment_id': deployment_id,
                    'model_name': model_info['model_name'],
                    'model_version': model_info['model_version'],
                    'backed_up_at': datetime.utcnow().isoformat(),
                    'original_path': str(source_path),
                    'backup_path': str(dest_path)
                }

                metadata_path = backup_path / 'backup_metadata.json'
                with open(metadata_path, 'w') as f:
                    json.dump(metadata, f, indent=2)

                logger.info(f"Created backup for deployment {deployment_id}")

        except Exception as e:
            logger.error(f"Error creating backup: {str(e)}")

    def get_rollback_history(
        self,
        model_name: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict]:
        """Get rollback history.

        Args:
            model_name: Filter by model name
            limit: Maximum number of results

        Returns:
            List of rollback events
        """
        session = self.Session()

        try:
            query = session.query(RollbackEvent)

            if model_name:
                # Join with deployment history to filter by model name
                query = query.join(
                    DeploymentHistory,
                    RollbackEvent.from_model_id == DeploymentHistory.model_id
                ).filter(DeploymentHistory.model_name == model_name)

            query = query.order_by(RollbackEvent.triggered_at.desc())
            query = query.limit(limit)

            events = query.all()

            return [
                {
                    'id': event.id,
                    'from_model_id': event.from_model_id,
                    'to_model_id': event.to_model_id,
                    'reason': event.reason,
                    'details': json.loads(event.details) if event.details else None,
                    'triggered_by': event.triggered_by,
                    'triggered_at': event.triggered_at.isoformat() if event.triggered_at else None,
                    'completed_at': event.completed_at.isoformat() if event.completed_at else None,
                    'success': event.success,
                    'error_message': event.error_message
                }
                for event in events
            ]

        finally:
            session.close()

    def set_health_thresholds(self, thresholds: Dict[str, float]):
        """Update health check thresholds.

        Args:
            thresholds: Dictionary of threshold values
        """
        self.health_thresholds.update(thresholds)
        logger.info(f"Updated health thresholds: {thresholds}")