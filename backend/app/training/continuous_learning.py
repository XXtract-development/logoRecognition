"""Continuous learning system for model improvement."""

import json
import logging
import os
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from celery import Celery
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker

from .annotation_connector import AnnotationConnector
from .data_loader import TrainingDataLoader
from .model_registry import ModelRegistry
from .training_pipeline import ModelTrainingPipeline

logger = logging.getLogger(__name__)

Base = declarative_base()


class TrainingSchedule(str, Enum):
    """Training schedule types."""
    HOURLY = "hourly"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    ON_DEMAND = "on_demand"
    THRESHOLD_BASED = "threshold_based"


class ContinuousLearningJob(Base):
    """Database model for continuous learning jobs."""

    __tablename__ = "continuous_learning_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_name = Column(String(255), nullable=False, unique=True)
    model_name = Column(String(255), nullable=False)
    schedule = Column(String(50), default=TrainingSchedule.DAILY)
    enabled = Column(Boolean, default=True)

    # Training configuration
    base_model_id = Column(Integer)  # Base model to fine-tune from
    training_config = Column(Text)  # JSON with training parameters
    data_filters = Column(Text)  # JSON with data selection criteria
    min_new_samples = Column(Integer, default=100)
    max_training_samples = Column(Integer, default=10000)

    # Thresholds for triggering
    performance_threshold = Column(Float)  # Trigger if performance drops below
    data_drift_threshold = Column(Float)  # Trigger if data drift detected
    time_since_last_training = Column(Integer)  # Days

    # Tracking
    last_run_at = Column(DateTime)
    next_run_at = Column(DateTime)
    total_runs = Column(Integer, default=0)
    successful_runs = Column(Integer, default=0)
    failed_runs = Column(Integer, default=0)
    last_model_id = Column(Integer)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TrainingRun(Base):
    """Database model for individual training runs."""

    __tablename__ = "training_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(Integer, nullable=False)
    run_number = Column(Integer)
    status = Column(String(50))  # running, completed, failed

    # Data info
    training_samples = Column(Integer)
    validation_samples = Column(Integer)
    new_samples_added = Column(Integer)

    # Results
    final_loss = Column(Float)
    final_accuracy = Column(Float)
    final_precision = Column(Float)
    final_recall = Column(Float)
    final_f1_score = Column(Float)
    improvement_over_baseline = Column(Float)

    # Model info
    input_model_id = Column(Integer)
    output_model_id = Column(Integer)
    model_promoted = Column(Boolean, default=False)

    # Timing
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)
    training_duration_seconds = Column(Integer)

    # Logs
    log_path = Column(Text)
    error_message = Column(Text)


class ContinuousLearningManager:
    """Manages continuous learning workflows."""

    def __init__(
        self,
        database_url: Optional[str] = None,
        model_registry: Optional[ModelRegistry] = None,
        annotation_connector: Optional[AnnotationConnector] = None,
        celery_app: Optional[Celery] = None
    ):
        """Initialize continuous learning manager.

        Args:
            database_url: Database connection URL
            model_registry: Model registry instance
            annotation_connector: Annotation connector instance
            celery_app: Celery app for scheduling
        """
        self.database_url = database_url or "sqlite:///continuous_learning.db"
        self.engine = create_engine(self.database_url)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)

        self.model_registry = model_registry or ModelRegistry()
        self.annotation_connector = annotation_connector or AnnotationConnector()
        self.celery_app = celery_app

        # Training pipeline will be created per job
        self.active_pipelines = {}

        logger.info("Continuous learning manager initialized")

    def create_learning_job(
        self,
        job_name: str,
        model_name: str,
        schedule: TrainingSchedule = TrainingSchedule.DAILY,
        base_model_id: Optional[int] = None,
        training_config: Optional[Dict] = None,
        data_filters: Optional[Dict] = None,
        min_new_samples: int = 100,
        performance_threshold: Optional[float] = None
    ) -> int:
        """Create a continuous learning job.

        Args:
            job_name: Unique job name
            model_name: Model name to train
            schedule: Training schedule
            base_model_id: Base model to start from
            training_config: Training configuration
            data_filters: Data selection filters
            min_new_samples: Minimum new samples required
            performance_threshold: Performance threshold for triggering

        Returns:
            Job ID
        """
        session = self.Session()

        try:
            # Create job
            job = ContinuousLearningJob(
                job_name=job_name,
                model_name=model_name,
                schedule=schedule,
                base_model_id=base_model_id,
                training_config=json.dumps(training_config) if training_config else None,
                data_filters=json.dumps(data_filters) if data_filters else None,
                min_new_samples=min_new_samples,
                performance_threshold=performance_threshold,
                next_run_at=self._calculate_next_run(schedule)
            )

            session.add(job)
            session.commit()

            # Schedule job if using Celery
            if self.celery_app and schedule != TrainingSchedule.ON_DEMAND:
                self._schedule_job(job)

            logger.info(f"Created continuous learning job: {job_name} (ID: {job.id})")
            return job.id

        except Exception as e:
            session.rollback()
            logger.error(f"Error creating learning job: {str(e)}")
            raise
        finally:
            session.close()

    def trigger_training(
        self,
        job_id: int,
        force: bool = False
    ) -> Dict[str, Any]:
        """Trigger a training run for a job.

        Args:
            job_id: Job ID
            force: Force training even if conditions not met

        Returns:
            Training run results
        """
        session = self.Session()

        try:
            job = session.query(ContinuousLearningJob).filter_by(id=job_id).first()
            if not job:
                raise ValueError(f"Job not found: {job_id}")

            if not job.enabled and not force:
                return {
                    'status': 'skipped',
                    'reason': 'Job is disabled'
                }

            # Check conditions
            if not force:
                ready, reason = self._check_training_conditions(job)
                if not ready:
                    return {
                        'status': 'skipped',
                        'reason': reason
                    }

            # Create training run
            run = TrainingRun(
                job_id=job_id,
                run_number=job.total_runs + 1,
                status='running',
                input_model_id=job.base_model_id or job.last_model_id
            )

            session.add(run)
            session.flush()

            # Update job
            job.total_runs += 1
            job.last_run_at = datetime.utcnow()
            job.next_run_at = self._calculate_next_run(job.schedule)
            session.commit()

            # Execute training
            result = self._execute_training(job, run)

            # Update run with results
            self._update_run_results(run.id, result)

            # Update job with results
            if result['success']:
                job.successful_runs += 1
                job.last_model_id = result.get('model_id')
            else:
                job.failed_runs += 1

            session.commit()

            logger.info(
                f"Training run {run.id} for job {job.job_name} "
                f"{'succeeded' if result['success'] else 'failed'}"
            )

            return result

        except Exception as e:
            session.rollback()
            logger.error(f"Error triggering training: {str(e)}")
            return {
                'status': 'failed',
                'error': str(e)
            }
        finally:
            session.close()

    def _check_training_conditions(self, job: ContinuousLearningJob) -> Tuple[bool, str]:
        """Check if training conditions are met.

        Args:
            job: Learning job

        Returns:
            Tuple of (ready_to_train, reason_if_not)
        """
        # Check new data availability
        new_samples = self._count_new_samples(job)
        if new_samples < job.min_new_samples:
            return False, f"Insufficient new samples ({new_samples} < {job.min_new_samples})"

        # Check performance threshold
        if job.performance_threshold:
            current_performance = self._get_current_performance(job)
            if current_performance and current_performance > job.performance_threshold:
                return False, f"Performance above threshold ({current_performance:.3f} > {job.performance_threshold:.3f})"

        # Check time since last training
        if job.last_run_at and job.time_since_last_training:
            days_since = (datetime.utcnow() - job.last_run_at).days
            if days_since < job.time_since_last_training:
                return False, f"Too soon since last training ({days_since} < {job.time_since_last_training} days)"

        return True, ""

    def _execute_training(
        self,
        job: ContinuousLearningJob,
        run: TrainingRun
    ) -> Dict[str, Any]:
        """Execute a training run.

        Args:
            job: Learning job
            run: Training run

        Returns:
            Training results
        """
        try:
            start_time = datetime.utcnow()

            # Parse configuration
            training_config = json.loads(job.training_config) if job.training_config else {}
            data_filters = json.loads(job.data_filters) if job.data_filters else {}

            # Get training data
            data_loader = TrainingDataLoader(
                annotation_connector=self.annotation_connector,
                batch_size=training_config.get('batch_size', 16)
            )

            train_loader, val_loader, data_metadata = data_loader.create_data_loaders(
                dataset_id=data_filters.get('dataset_id'),
                validation_split=training_config.get('validation_split', 0.2),
                augment=training_config.get('augment', True)
            )

            # Update run with data info
            session = self.Session()
            run_db = session.query(TrainingRun).filter_by(id=run.id).first()
            run_db.training_samples = data_metadata.get('total_train_annotations', 0)
            run_db.validation_samples = data_metadata.get('total_val_annotations', 0)
            session.commit()
            session.close()

            # Create training pipeline
            pipeline = ModelTrainingPipeline(
                model_type=training_config.get('model_type', 'faster_rcnn'),
                num_classes=training_config.get('num_classes', 5)
            )

            # Initialize model
            if run.input_model_id:
                # Load existing model
                model_state = self.model_registry.get_model_by_id(run.input_model_id)
                if model_state and model_state.get('artifact_path'):
                    pipeline.load_checkpoint(model_state['artifact_path'])
            else:
                # Initialize new model
                pipeline.initialize_model(pretrained=training_config.get('pretrained', True))

            # Setup training
            pipeline.setup_training(
                learning_rate=training_config.get('learning_rate', 0.001),
                weight_decay=training_config.get('weight_decay', 0.0005),
                scheduler_type=training_config.get('scheduler_type', 'step')
            )

            # Train model
            training_results = pipeline.train(
                train_loader=train_loader,
                val_loader=val_loader,
                num_epochs=training_config.get('num_epochs', 10),
                save_best=True,
                early_stopping_patience=training_config.get('early_stopping_patience', 5)
            )

            # Register model
            model_version = f"cl_{job.job_name}_{run.run_number}"
            model_id = self.model_registry.register_model(
                model_name=job.model_name,
                model_version=model_version,
                model_state={
                    'model_state_dict': pipeline.model.state_dict(),
                    'training_history': training_results['history']
                },
                training_params=training_config,
                training_dataset_id=data_filters.get('dataset_id'),
                tags=['continuous_learning', job.job_name],
                auto_validate=True
            )

            # Calculate improvement
            improvement = None
            if run.input_model_id:
                baseline_model = self.model_registry.get_model_by_id(run.input_model_id)
                if baseline_model and baseline_model.get('f1_score'):
                    new_f1 = training_results['metrics_summary'].get('best_val_f1_score', 0)
                    improvement = new_f1 - baseline_model['f1_score']

            duration = (datetime.utcnow() - start_time).total_seconds()

            return {
                'success': True,
                'model_id': model_id,
                'model_version': model_version,
                'final_loss': training_results.get('final_val_loss'),
                'final_f1_score': training_results['metrics_summary'].get('best_val_f1_score'),
                'improvement': improvement,
                'training_duration': duration,
                'epochs_trained': training_results.get('total_epochs')
            }

        except Exception as e:
            logger.error(f"Error during training execution: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def _update_run_results(self, run_id: int, results: Dict[str, Any]):
        """Update training run with results.

        Args:
            run_id: Run ID
            results: Training results
        """
        session = self.Session()

        try:
            run = session.query(TrainingRun).filter_by(id=run_id).first()
            if not run:
                return

            if results.get('success'):
                run.status = 'completed'
                run.output_model_id = results.get('model_id')
                run.final_loss = results.get('final_loss')
                run.final_f1_score = results.get('final_f1_score')
                run.improvement_over_baseline = results.get('improvement')
                run.training_duration_seconds = results.get('training_duration')
            else:
                run.status = 'failed'
                run.error_message = results.get('error')

            run.completed_at = datetime.utcnow()
            session.commit()

        except Exception as e:
            session.rollback()
            logger.error(f"Error updating run results: {str(e)}")
        finally:
            session.close()

    def _count_new_samples(self, job: ContinuousLearningJob) -> int:
        """Count new samples available for training.

        Args:
            job: Learning job

        Returns:
            Number of new samples
        """
        # Get annotations since last training
        if job.last_run_at:
            # This would query for annotations created after last_run_at
            # Simplified for now
            return 150  # Placeholder

        # Get all available annotations
        annotations = self.annotation_connector.get_training_annotations()
        return len(annotations)

    def _get_current_performance(self, job: ContinuousLearningJob) -> Optional[float]:
        """Get current model performance.

        Args:
            job: Learning job

        Returns:
            Current performance metric or None
        """
        if job.last_model_id:
            model = self.model_registry.get_model_by_id(job.last_model_id)
            if model:
                return model.get('f1_score')

        return None

    def _calculate_next_run(self, schedule: TrainingSchedule) -> datetime:
        """Calculate next run time based on schedule.

        Args:
            schedule: Training schedule

        Returns:
            Next run datetime
        """
        now = datetime.utcnow()

        if schedule == TrainingSchedule.HOURLY:
            return now + timedelta(hours=1)
        elif schedule == TrainingSchedule.DAILY:
            return now + timedelta(days=1)
        elif schedule == TrainingSchedule.WEEKLY:
            return now + timedelta(weeks=1)
        elif schedule == TrainingSchedule.MONTHLY:
            return now + timedelta(days=30)
        else:
            return now + timedelta(days=1)  # Default to daily

    def _schedule_job(self, job: ContinuousLearningJob):
        """Schedule job with Celery.

        Args:
            job: Learning job
        """
        if not self.celery_app:
            return

        # This would set up Celery periodic task
        # Simplified for now
        logger.info(f"Job {job.job_name} scheduled with Celery")

    def monitor_data_drift(
        self,
        job_id: int,
        current_distribution: Dict[str, float],
        reference_distribution: Optional[Dict[str, float]] = None
    ) -> float:
        """Monitor data drift for triggering retraining.

        Args:
            job_id: Job ID
            current_distribution: Current data distribution
            reference_distribution: Reference distribution

        Returns:
            Drift score
        """
        if not reference_distribution:
            # Get distribution from last training
            session = self.Session()
            job = session.query(ContinuousLearningJob).filter_by(id=job_id).first()
            session.close()

            if not job or not job.last_model_id:
                return 0.0

            # Would get reference distribution from model metadata
            reference_distribution = {'class_a': 0.5, 'class_b': 0.5}  # Placeholder

        # Calculate KL divergence or other drift metric
        drift_score = self._calculate_drift(current_distribution, reference_distribution)

        logger.info(f"Data drift score for job {job_id}: {drift_score:.3f}")
        return drift_score

    def _calculate_drift(
        self,
        current: Dict[str, float],
        reference: Dict[str, float]
    ) -> float:
        """Calculate drift between distributions.

        Args:
            current: Current distribution
            reference: Reference distribution

        Returns:
            Drift score
        """
        # Simplified KL divergence
        drift = 0.0
        for key in reference:
            if key in current:
                p = reference[key]
                q = current[key]
                if p > 0 and q > 0:
                    drift += p * np.log(p / q)

        return drift

    def get_job_status(self, job_id: int) -> Dict[str, Any]:
        """Get status of a learning job.

        Args:
            job_id: Job ID

        Returns:
            Job status information
        """
        session = self.Session()

        try:
            job = session.query(ContinuousLearningJob).filter_by(id=job_id).first()
            if not job:
                return {'error': 'Job not found'}

            # Get recent runs
            recent_runs = session.query(TrainingRun).filter_by(
                job_id=job_id
            ).order_by(TrainingRun.started_at.desc()).limit(5).all()

            return {
                'job_id': job.id,
                'job_name': job.job_name,
                'enabled': job.enabled,
                'schedule': job.schedule,
                'last_run': job.last_run_at.isoformat() if job.last_run_at else None,
                'next_run': job.next_run_at.isoformat() if job.next_run_at else None,
                'total_runs': job.total_runs,
                'successful_runs': job.successful_runs,
                'failed_runs': job.failed_runs,
                'last_model_id': job.last_model_id,
                'recent_runs': [
                    {
                        'run_id': run.id,
                        'status': run.status,
                        'started_at': run.started_at.isoformat() if run.started_at else None,
                        'final_f1_score': run.final_f1_score,
                        'improvement': run.improvement_over_baseline
                    }
                    for run in recent_runs
                ]
            }

        finally:
            session.close()

    def enable_job(self, job_id: int, enabled: bool = True):
        """Enable or disable a learning job.

        Args:
            job_id: Job ID
            enabled: Whether to enable
        """
        session = self.Session()

        try:
            job = session.query(ContinuousLearningJob).filter_by(id=job_id).first()
            if job:
                job.enabled = enabled
                session.commit()
                logger.info(f"Job {job_id} {'enabled' if enabled else 'disabled'}")

        except Exception as e:
            session.rollback()
            logger.error(f"Error updating job: {str(e)}")
        finally:
            session.close()