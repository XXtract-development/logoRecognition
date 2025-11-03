"""A/B testing configuration for model deployments."""

import hashlib
import json
import logging
import random
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker

from .model_registry import ModelRegistry

logger = logging.getLogger(__name__)

Base = declarative_base()


class ExperimentStatus(str, Enum):
    """Experiment status enum."""
    DRAFT = "draft"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"


class ABExperiment(Base):
    """Database model for A/B experiments."""

    __tablename__ = "ab_experiments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(Text)
    status = Column(String(50), default=ExperimentStatus.DRAFT)

    # Models
    control_model_id = Column(Integer, nullable=False)
    treatment_model_id = Column(Integer, nullable=False)

    # Traffic configuration
    traffic_percentage = Column(Float, default=50.0)  # % going to treatment
    user_segmentation = Column(Text)  # JSON with segmentation rules

    # Success metrics
    primary_metric = Column(String(100), nullable=False)
    secondary_metrics = Column(Text)  # JSON list
    minimum_sample_size = Column(Integer, default=1000)
    confidence_level = Column(Float, default=0.95)

    # Results
    control_metrics = Column(Text)  # JSON
    treatment_metrics = Column(Text)  # JSON
    statistical_significance = Column(Float)
    winner = Column(String(50))  # control or treatment

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime)
    ended_at = Column(DateTime)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ABTestMetric(Base):
    """Database model for A/B test metrics."""

    __tablename__ = "ab_test_metrics"

    id = Column(Integer, primary_key=True, autoincrement=True)
    experiment_id = Column(Integer, nullable=False)
    model_variant = Column(String(50))  # control or treatment
    user_id = Column(String(255))
    session_id = Column(String(255))

    # Metrics
    precision = Column(Float)
    recall = Column(Float)
    f1_score = Column(Float)
    inference_time_ms = Column(Float)
    detections_count = Column(Integer)
    confidence_avg = Column(Float)

    # User interaction
    user_satisfaction = Column(Float)  # 1-5 rating
    clicked = Column(Boolean)
    converted = Column(Boolean)

    timestamp = Column(DateTime, default=datetime.utcnow)


class ABTestingManager:
    """Manages A/B testing for model deployments."""

    def __init__(
        self,
        database_url: Optional[str] = None,
        model_registry: Optional[ModelRegistry] = None
    ):
        """Initialize A/B testing manager.

        Args:
            database_url: Database connection URL
            model_registry: Model registry instance
        """
        self.database_url = database_url or "sqlite:///ab_testing.db"
        self.engine = create_engine(self.database_url)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)

        self.model_registry = model_registry or ModelRegistry()

        logger.info("A/B testing manager initialized")

    def create_experiment(
        self,
        name: str,
        control_model_id: int,
        treatment_model_id: int,
        primary_metric: str = "f1_score",
        traffic_percentage: float = 50.0,
        description: Optional[str] = None,
        secondary_metrics: Optional[List[str]] = None,
        user_segmentation: Optional[Dict] = None,
        minimum_sample_size: int = 1000
    ) -> int:
        """Create a new A/B test experiment.

        Args:
            name: Experiment name
            control_model_id: Control model ID from registry
            treatment_model_id: Treatment model ID from registry
            primary_metric: Primary success metric
            traffic_percentage: Percentage of traffic to treatment
            description: Experiment description
            secondary_metrics: Secondary metrics to track
            user_segmentation: User segmentation rules
            minimum_sample_size: Minimum sample size

        Returns:
            Experiment ID
        """
        session = self.Session()

        try:
            # Validate models exist
            control = self.model_registry.get_model_by_id(control_model_id)
            treatment = self.model_registry.get_model_by_id(treatment_model_id)

            if not control or not treatment:
                raise ValueError("One or both models not found in registry")

            # Create experiment
            experiment = ABExperiment(
                name=name,
                description=description,
                control_model_id=control_model_id,
                treatment_model_id=treatment_model_id,
                traffic_percentage=traffic_percentage,
                primary_metric=primary_metric,
                secondary_metrics=json.dumps(secondary_metrics) if secondary_metrics else None,
                user_segmentation=json.dumps(user_segmentation) if user_segmentation else None,
                minimum_sample_size=minimum_sample_size,
                status=ExperimentStatus.DRAFT
            )

            session.add(experiment)
            session.commit()

            logger.info(
                f"Created A/B experiment '{name}' (ID: {experiment.id}) - "
                f"Control: Model {control_model_id}, "
                f"Treatment: Model {treatment_model_id}"
            )

            return experiment.id

        except Exception as e:
            session.rollback()
            logger.error(f"Error creating experiment: {str(e)}")
            raise
        finally:
            session.close()

    def start_experiment(self, experiment_id: int) -> bool:
        """Start an A/B test experiment.

        Args:
            experiment_id: Experiment ID

        Returns:
            Success status
        """
        session = self.Session()

        try:
            experiment = session.query(ABExperiment).filter_by(id=experiment_id).first()
            if not experiment:
                raise ValueError(f"Experiment not found: {experiment_id}")

            if experiment.status != ExperimentStatus.DRAFT:
                logger.warning(
                    f"Cannot start experiment {experiment_id} "
                    f"(status: {experiment.status})"
                )
                return False

            experiment.status = ExperimentStatus.RUNNING
            experiment.started_at = datetime.utcnow()
            session.commit()

            logger.info(f"Started A/B experiment {experiment_id}")
            return True

        except Exception as e:
            session.rollback()
            logger.error(f"Error starting experiment: {str(e)}")
            return False
        finally:
            session.close()

    def assign_variant(
        self,
        experiment_id: int,
        user_id: str,
        session_id: Optional[str] = None
    ) -> str:
        """Assign a model variant to a user.

        Args:
            experiment_id: Experiment ID
            user_id: User ID
            session_id: Optional session ID

        Returns:
            Variant assignment (control or treatment)
        """
        session = self.Session()

        try:
            experiment = session.query(ABExperiment).filter_by(id=experiment_id).first()
            if not experiment:
                raise ValueError(f"Experiment not found: {experiment_id}")

            if experiment.status != ExperimentStatus.RUNNING:
                # Default to control if experiment not running
                return "control"

            # Check user segmentation rules
            if experiment.user_segmentation:
                segmentation = json.loads(experiment.user_segmentation)
                if not self._check_segmentation(user_id, segmentation):
                    return "control"  # User not in target segment

            # Deterministic assignment based on user ID
            hash_value = hashlib.md5(f"{experiment_id}:{user_id}".encode()).hexdigest()
            hash_int = int(hash_value[:8], 16)
            assignment_value = (hash_int % 100) / 100.0

            if assignment_value < experiment.traffic_percentage / 100:
                variant = "treatment"
            else:
                variant = "control"

            logger.debug(f"User {user_id} assigned to {variant} for experiment {experiment_id}")
            return variant

        finally:
            session.close()

    def record_metric(
        self,
        experiment_id: int,
        user_id: str,
        variant: str,
        metrics: Dict[str, Any],
        session_id: Optional[str] = None
    ):
        """Record metrics for an A/B test.

        Args:
            experiment_id: Experiment ID
            user_id: User ID
            variant: Model variant (control or treatment)
            metrics: Metrics dictionary
            session_id: Optional session ID
        """
        session = self.Session()

        try:
            metric = ABTestMetric(
                experiment_id=experiment_id,
                model_variant=variant,
                user_id=user_id,
                session_id=session_id,
                precision=metrics.get('precision'),
                recall=metrics.get('recall'),
                f1_score=metrics.get('f1_score'),
                inference_time_ms=metrics.get('inference_time_ms'),
                detections_count=metrics.get('detections_count'),
                confidence_avg=metrics.get('confidence_avg'),
                user_satisfaction=metrics.get('user_satisfaction'),
                clicked=metrics.get('clicked'),
                converted=metrics.get('converted')
            )

            session.add(metric)
            session.commit()

        except Exception as e:
            session.rollback()
            logger.error(f"Error recording metric: {str(e)}")
        finally:
            session.close()

    def get_experiment_results(
        self,
        experiment_id: int,
        calculate_significance: bool = True
    ) -> Dict[str, Any]:
        """Get experiment results.

        Args:
            experiment_id: Experiment ID
            calculate_significance: Whether to calculate statistical significance

        Returns:
            Experiment results
        """
        session = self.Session()

        try:
            experiment = session.query(ABExperiment).filter_by(id=experiment_id).first()
            if not experiment:
                raise ValueError(f"Experiment not found: {experiment_id}")

            # Get metrics for each variant
            control_metrics = session.query(ABTestMetric).filter_by(
                experiment_id=experiment_id,
                model_variant="control"
            ).all()

            treatment_metrics = session.query(ABTestMetric).filter_by(
                experiment_id=experiment_id,
                model_variant="treatment"
            ).all()

            # Calculate aggregate metrics
            control_stats = self._calculate_stats(control_metrics, experiment.primary_metric)
            treatment_stats = self._calculate_stats(treatment_metrics, experiment.primary_metric)

            results = {
                'experiment_id': experiment_id,
                'experiment_name': experiment.name,
                'status': experiment.status,
                'control': {
                    'model_id': experiment.control_model_id,
                    'sample_size': len(control_metrics),
                    'metrics': control_stats
                },
                'treatment': {
                    'model_id': experiment.treatment_model_id,
                    'sample_size': len(treatment_metrics),
                    'metrics': treatment_stats
                }
            }

            # Calculate statistical significance
            if calculate_significance and len(control_metrics) > 0 and len(treatment_metrics) > 0:
                significance = self._calculate_significance(
                    control_metrics,
                    treatment_metrics,
                    experiment.primary_metric
                )
                results['statistical_significance'] = significance

                # Determine winner if significant
                if significance > experiment.confidence_level:
                    control_primary = control_stats.get(experiment.primary_metric, 0)
                    treatment_primary = treatment_stats.get(experiment.primary_metric, 0)

                    if treatment_primary > control_primary:
                        results['winner'] = 'treatment'
                        results['improvement'] = (
                            (treatment_primary - control_primary) / control_primary * 100
                            if control_primary > 0 else 0
                        )
                    else:
                        results['winner'] = 'control'
                else:
                    results['winner'] = 'no_significant_difference'

            return results

        finally:
            session.close()

    def end_experiment(
        self,
        experiment_id: int,
        auto_deploy_winner: bool = False
    ) -> Dict[str, Any]:
        """End an A/B test experiment.

        Args:
            experiment_id: Experiment ID
            auto_deploy_winner: Whether to auto-deploy the winning model

        Returns:
            Final experiment results
        """
        session = self.Session()

        try:
            experiment = session.query(ABExperiment).filter_by(id=experiment_id).first()
            if not experiment:
                raise ValueError(f"Experiment not found: {experiment_id}")

            # Get final results
            results = self.get_experiment_results(experiment_id)

            # Update experiment
            experiment.status = ExperimentStatus.COMPLETED
            experiment.ended_at = datetime.utcnow()
            experiment.control_metrics = json.dumps(results['control']['metrics'])
            experiment.treatment_metrics = json.dumps(results['treatment']['metrics'])
            experiment.statistical_significance = results.get('statistical_significance')
            experiment.winner = results.get('winner')

            session.commit()

            # Auto-deploy winner if requested
            if auto_deploy_winner and results.get('winner') in ['control', 'treatment']:
                winner_model_id = (
                    experiment.treatment_model_id
                    if results['winner'] == 'treatment'
                    else experiment.control_model_id
                )

                self.model_registry.promote_to_production(winner_model_id)
                results['auto_deployed'] = winner_model_id

            logger.info(
                f"Ended A/B experiment {experiment_id} - "
                f"Winner: {results.get('winner')}"
            )

            return results

        except Exception as e:
            session.rollback()
            logger.error(f"Error ending experiment: {str(e)}")
            raise
        finally:
            session.close()

    def _check_segmentation(self, user_id: str, segmentation: Dict) -> bool:
        """Check if user meets segmentation criteria.

        Args:
            user_id: User ID
            segmentation: Segmentation rules

        Returns:
            Whether user meets criteria
        """
        # Simplified segmentation check
        # In production, this would check user attributes against rules
        return True

    def _calculate_stats(
        self,
        metrics: List[ABTestMetric],
        primary_metric: str
    ) -> Dict[str, float]:
        """Calculate aggregate statistics.

        Args:
            metrics: List of metrics
            primary_metric: Primary metric name

        Returns:
            Aggregate statistics
        """
        if not metrics:
            return {}

        stats = {}

        # Calculate averages for numeric metrics
        numeric_fields = [
            'precision', 'recall', 'f1_score',
            'inference_time_ms', 'confidence_avg'
        ]

        for field in numeric_fields:
            values = [
                getattr(m, field) for m in metrics
                if getattr(m, field) is not None
            ]
            if values:
                stats[field] = np.mean(values)
                stats[f'{field}_std'] = np.std(values)

        # Calculate conversion rate
        conversions = [m.converted for m in metrics if m.converted is not None]
        if conversions:
            stats['conversion_rate'] = sum(conversions) / len(conversions)

        # Calculate click-through rate
        clicks = [m.clicked for m in metrics if m.clicked is not None]
        if clicks:
            stats['click_through_rate'] = sum(clicks) / len(clicks)

        # Calculate average satisfaction
        satisfactions = [
            m.user_satisfaction for m in metrics
            if m.user_satisfaction is not None
        ]
        if satisfactions:
            stats['avg_satisfaction'] = np.mean(satisfactions)

        return stats

    def _calculate_significance(
        self,
        control_metrics: List[ABTestMetric],
        treatment_metrics: List[ABTestMetric],
        metric_name: str
    ) -> float:
        """Calculate statistical significance.

        Args:
            control_metrics: Control group metrics
            treatment_metrics: Treatment group metrics
            metric_name: Metric to test

        Returns:
            P-value or confidence level
        """
        # Get metric values
        control_values = [
            getattr(m, metric_name) for m in control_metrics
            if getattr(m, metric_name) is not None
        ]
        treatment_values = [
            getattr(m, metric_name) for m in treatment_metrics
            if getattr(m, metric_name) is not None
        ]

        if not control_values or not treatment_values:
            return 0.0

        # Perform t-test (simplified)
        from scipy import stats
        try:
            t_stat, p_value = stats.ttest_ind(control_values, treatment_values)
            return 1 - p_value  # Return confidence level
        except:
            # If scipy not available, use simplified calculation
            control_mean = np.mean(control_values)
            treatment_mean = np.mean(treatment_values)
            control_std = np.std(control_values)
            treatment_std = np.std(treatment_values)

            # Simplified confidence calculation
            if control_std == 0 and treatment_std == 0:
                return 1.0 if control_mean != treatment_mean else 0.0

            # Z-score approximation
            z = abs(treatment_mean - control_mean) / np.sqrt(
                control_std**2 / len(control_values) +
                treatment_std**2 / len(treatment_values)
            )

            # Approximate confidence from z-score
            confidence = min(0.99, z / 3.0)  # Simplified mapping
            return confidence

    def get_active_experiments(self) -> List[Dict]:
        """Get all active experiments.

        Returns:
            List of active experiments
        """
        session = self.Session()

        try:
            experiments = session.query(ABExperiment).filter_by(
                status=ExperimentStatus.RUNNING
            ).all()

            return [
                {
                    'id': exp.id,
                    'name': exp.name,
                    'control_model_id': exp.control_model_id,
                    'treatment_model_id': exp.treatment_model_id,
                    'traffic_percentage': exp.traffic_percentage,
                    'started_at': exp.started_at.isoformat() if exp.started_at else None
                }
                for exp in experiments
            ]

        finally:
            session.close()