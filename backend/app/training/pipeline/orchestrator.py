"""Main training pipeline orchestrator for automated ML lifecycle management."""

import asyncio
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import uuid

from celery import Celery, chain, group, chord
from prometheus_client import Counter, Histogram, Gauge
try:
    import mlflow
except ImportError:
    mlflow = None  # Optional dependency for testing
from sqlalchemy.orm import Session

from ..model_registry import ModelRegistry, ModelStatus
from ..data_loader import DataLoader
from ..training_pipeline import ModelTrainingPipeline as TrainingPipeline
from .data_pipeline import DataPipeline
from .evaluation_pipeline import EvaluationPipeline
from .deployment_pipeline import DeploymentPipeline
from ..monitoring.drift_detector import DriftDetector
from ..ab_testing import ABTestingManager as ExperimentManager

# Metrics
pipeline_runs = Counter('training_pipeline_runs_total', 'Total pipeline runs')
pipeline_duration = Histogram('training_pipeline_duration_seconds', 'Pipeline duration')
pipeline_success = Counter('training_pipeline_success_total', 'Successful pipeline runs')
pipeline_failures = Counter('training_pipeline_failures_total', 'Failed pipeline runs')
models_deployed = Counter('models_deployed_total', 'Models deployed to production')

class PipelineStatus(Enum):
    """Pipeline execution status"""
    PENDING = "pending"
    RUNNING = "running"
    EVALUATING = "evaluating"
    DEPLOYING = "deploying"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"

@dataclass
class PipelineConfig:
    """Pipeline configuration"""
    auto_deploy_threshold: float = 0.85
    min_training_samples: int = 1000
    max_training_time: int = 7200
    enable_ab_testing: bool = True
    ab_test_duration: int = 3600
    canary_percentage: int = 10
    enable_drift_detection: bool = True
    drift_threshold: float = 0.3
    retraining_interval: int = 86400
    enable_hyperparameter_tuning: bool = True
    hpo_trials: int = 50

class TrainingPipelineOrchestrator:
    """Main training pipeline orchestrator"""

    def __init__(self, config: PipelineConfig, db_session: Session):
        self.config = config
        self.db_session = db_session
        self.model_registry = ModelRegistry(db_session)
        self.data_pipeline = DataPipeline()
        self.training_pipeline = TrainingPipeline()
        self.evaluation_pipeline = EvaluationPipeline()
        self.deployment_pipeline = DeploymentPipeline()
        self.drift_detector = DriftDetector()
        self.experiment_manager = ExperimentManager()
        self.celery_app = Celery('training_pipeline')

    async def run_pipeline(
        self,
        trigger: str = "manual",
        force_retrain: bool = False
    ) -> Dict:
        """
        Run complete training pipeline

        Args:
            trigger: What triggered the pipeline (manual, schedule, drift, annotation_threshold)
            force_retrain: Force retraining even if conditions aren't met

        Returns:
            Pipeline execution results
        """
        pipeline_id = str(uuid.uuid4())
        start_time = datetime.now()

        # Initialize tracking
        mlflow.start_run(run_name=f"pipeline_{pipeline_id}")

        try:
            pipeline_runs.inc()

            # Log pipeline start
            self._log_pipeline_event(pipeline_id, PipelineStatus.PENDING, {
                "trigger": trigger,
                "force_retrain": force_retrain
            })

            # Step 1: Check if training is needed
            if not force_retrain and not await self._should_train(trigger):
                return {
                    "pipeline_id": pipeline_id,
                    "status": "skipped",
                    "reason": "Training conditions not met"
                }

            # Step 2: Data preparation
            self._log_pipeline_event(pipeline_id, PipelineStatus.RUNNING, {
                "stage": "data_preparation"
            })

            data_result = await self._prepare_data()
            if not data_result["success"]:
                raise Exception(f"Data preparation failed: {data_result['error']}")

            # Step 3: Check for data drift
            if self.config.enable_drift_detection:
                drift_score = await self._check_drift(data_result["dataset"])
                if drift_score > self.config.drift_threshold:
                    self._log_event("High data drift detected", {
                        "drift_score": drift_score
                    })

            # Step 4: Training with HPO
            self._log_pipeline_event(pipeline_id, PipelineStatus.RUNNING, {
                "stage": "training"
            })

            if self.config.enable_hyperparameter_tuning:
                training_result = await self._train_with_hpo(
                    data_result["dataset"],
                    trials=self.config.hpo_trials
                )
            else:
                training_result = await self._train_model(data_result["dataset"])

            if not training_result["success"]:
                raise Exception(f"Training failed: {training_result['error']}")

            # Step 5: Evaluation
            self._log_pipeline_event(pipeline_id, PipelineStatus.EVALUATING, {
                "stage": "evaluation"
            })

            eval_result = await self._evaluate_model(
                training_result["model_id"],
                data_result["test_dataset"]
            )

            # Step 6: Deployment decision
            if await self._should_deploy(eval_result):
                self._log_pipeline_event(pipeline_id, PipelineStatus.DEPLOYING, {
                    "stage": "deployment"
                })

                deployment_result = await self._deploy_model(
                    training_result["model_id"],
                    eval_result
                )

                if deployment_result["success"]:
                    models_deployed.inc()
                else:
                    raise Exception(f"Deployment failed: {deployment_result['error']}")
            else:
                self._log_event("Model not deployed", {
                    "reason": "Performance below threshold",
                    "metrics": eval_result
                })

            # Step 7: Cleanup and finalization
            self._log_pipeline_event(pipeline_id, PipelineStatus.COMPLETED, {
                "duration": (datetime.now() - start_time).total_seconds()
            })

            pipeline_success.inc()
            pipeline_duration.observe((datetime.now() - start_time).total_seconds())

            return {
                "pipeline_id": pipeline_id,
                "status": "completed",
                "model_id": training_result["model_id"],
                "metrics": eval_result,
                "deployed": deployment_result["success"] if "deployment_result" in locals() else False
            }

        except Exception as e:
            pipeline_failures.inc()
            self._log_pipeline_event(pipeline_id, PipelineStatus.FAILED, {
                "error": str(e)
            })

            # Attempt rollback if needed
            await self._handle_failure(pipeline_id, str(e))

            return {
                "pipeline_id": pipeline_id,
                "status": "failed",
                "error": str(e)
            }
        finally:
            mlflow.end_run()

    async def _should_train(self, trigger: str) -> bool:
        """Check if training conditions are met"""
        # Check last training time
        last_training = await self.model_registry.get_last_training_time()
        if last_training:
            time_since_training = (datetime.now() - last_training).total_seconds()
            if time_since_training < self.config.retraining_interval:
                return False

        # Check annotation count
        annotation_count = await self._get_new_annotation_count()
        if annotation_count < self.config.min_training_samples:
            return False

        # Check for drift
        if trigger == "drift":
            return True

        return True

    async def _prepare_data(self) -> Dict:
        """Prepare training data"""
        try:
            dataset = await self.data_pipeline.prepare_dataset()
            return {
                "success": True,
                "dataset": dataset,
                "test_dataset": dataset.test_split()
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    async def _check_drift(self, dataset) -> float:
        """Check for data drift"""
        return await self.drift_detector.calculate_drift_score(dataset)

    async def _train_with_hpo(self, dataset, trials: int) -> Dict:
        """Train model with hyperparameter optimization"""
        from ..automation.hyperparameter_optimizer import HyperparameterOptimizer

        optimizer = HyperparameterOptimizer()
        best_params = await optimizer.optimize(dataset, n_trials=trials)

        # Train with best parameters
        return await self._train_model(dataset, hyperparameters=best_params)

    async def _train_model(self, dataset, hyperparameters=None) -> Dict:
        """Train a new model"""
        try:
            model = await self.training_pipeline.train(
                dataset,
                hyperparameters=hyperparameters
            )

            # Register model
            model_id = await self.model_registry.register_model(
                model,
                metadata={
                    "hyperparameters": hyperparameters,
                    "training_date": datetime.now().isoformat()
                }
            )

            return {
                "success": True,
                "model_id": model_id
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    async def _evaluate_model(self, model_id: str, test_dataset) -> Dict:
        """Evaluate model performance"""
        return await self.evaluation_pipeline.evaluate(model_id, test_dataset)

    async def _should_deploy(self, eval_result: Dict) -> bool:
        """Determine if model should be deployed"""
        return eval_result.get("accuracy", 0) >= self.config.auto_deploy_threshold

    async def _deploy_model(self, model_id: str, eval_result: Dict) -> Dict:
        """Deploy model to production"""
        if self.config.enable_ab_testing:
            # Deploy with A/B testing
            return await self.experiment_manager.start_experiment(
                model_id,
                duration=self.config.ab_test_duration,
                traffic_percentage=self.config.canary_percentage
            )
        else:
            # Direct deployment
            return await self.deployment_pipeline.deploy(
                model_id,
                strategy="blue_green"
            )

    async def _handle_failure(self, pipeline_id: str, error: str):
        """Handle pipeline failure"""
        # Log failure
        self._log_event("Pipeline failure", {
            "pipeline_id": pipeline_id,
            "error": error
        })

        # Check if rollback is needed
        if "deployment" in error.lower():
            await self._rollback_deployment()

    async def _rollback_deployment(self):
        """Rollback to previous model version"""
        from ..safety.rollback_manager import RollbackManager

        rollback_manager = RollbackManager(self.db_session)
        await rollback_manager.rollback_to_previous()

    def _log_pipeline_event(self, pipeline_id: str, status: PipelineStatus, data: Dict):
        """Log pipeline events"""
        event = {
            "pipeline_id": pipeline_id,
            "status": status.value,
            "timestamp": datetime.now().isoformat(),
            **data
        }
        # Log to MLflow
        mlflow.log_dict(event, f"events/{status.value}.json")

    def _log_event(self, message: str, data: Dict):
        """Log general events"""
        mlflow.log_dict({
            "message": message,
            "timestamp": datetime.now().isoformat(),
            **data
        }, f"events/{message.replace(' ', '_').lower()}.json")

    async def _get_new_annotation_count(self) -> int:
        """Get count of new annotations since last training"""
        # Implementation to get annotation count
        return 1500  # Placeholder

# Celery tasks for async execution
celery_app = Celery('training_pipeline')

@celery_app.task
def run_pipeline_task(trigger: str = "schedule"):
    """Celery task to run pipeline"""
    from ..database import get_session

    session = get_session()
    config = PipelineConfig()
    orchestrator = TrainingPipelineOrchestrator(config, session)

    # Run async pipeline
    loop = asyncio.get_event_loop()
    result = loop.run_until_complete(
        orchestrator.run_pipeline(trigger=trigger)
    )

    return result