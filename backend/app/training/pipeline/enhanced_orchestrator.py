"""
Enhanced Training Pipeline Orchestrator with A++ Implementation
Includes error recovery, retry mechanisms, and comprehensive monitoring
"""

import asyncio
import json
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from enum import Enum
from contextlib import asynccontextmanager
import logging
from collections import deque

from celery import Celery, chain, group, chord
from prometheus_client import Counter, Histogram, Gauge, Summary
import mlflow
import wandb
from sqlalchemy.orm import Session
import redis.asyncio as redis
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log
)

from ..model_registry import ModelRegistry, ModelStatus
from ..data_loader import DataLoader
from ..training_pipeline import TrainingPipeline
from .data_pipeline import EnhancedDataPipeline
from .evaluation_pipeline import EvaluationPipeline
from .deployment_pipeline import DeploymentPipeline
from ..monitoring.drift_detector import DriftDetector
from ..ab_testing.experiment_manager import ExperimentManager
from .resource_manager import ResourceManager
from .alert_manager import AlertManager
from .model_version_manager import ModelVersionManager
from ..safety.circuit_breaker import CircuitBreaker

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Enhanced Metrics with SLO tracking
pipeline_runs = Counter('training_pipeline_runs_total', 'Total pipeline runs', ['trigger', 'status'])
pipeline_duration = Histogram('training_pipeline_duration_seconds', 'Pipeline duration',
                            buckets=[60, 300, 600, 1800, 3600, 7200])
pipeline_success_rate = Gauge('training_pipeline_success_rate', 'Pipeline success rate')
pipeline_failures = Counter('training_pipeline_failures_total', 'Failed pipeline runs', ['reason'])
models_deployed = Counter('models_deployed_total', 'Models deployed to production', ['strategy'])
resource_usage = Gauge('training_resource_usage', 'Resource usage', ['resource_type'])
data_quality_score = Gauge('training_data_quality_score', 'Data quality score')
model_performance = Summary('model_performance_metrics', 'Model performance metrics', ['metric_name'])

class PipelineStatus(Enum):
    """Pipeline execution status with enhanced states"""
    PENDING = "pending"
    VALIDATING = "validating"
    PREPARING = "preparing"
    RUNNING = "running"
    EVALUATING = "evaluating"
    DEPLOYING = "deploying"
    MONITORING = "monitoring"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"
    RETRYING = "retrying"
    CANCELLED = "cancelled"

@dataclass
class EnhancedPipelineConfig:
    """Enhanced pipeline configuration with A++ features"""
    # Core configuration
    auto_deploy_threshold: float = 0.85
    min_training_samples: int = 1000
    max_training_time: int = 7200

    # A/B testing configuration
    enable_ab_testing: bool = True
    ab_test_duration: int = 3600
    ab_test_confidence_level: float = 0.95
    ab_test_min_samples: int = 1000

    # Deployment configuration
    canary_percentage: int = 10
    canary_increment: int = 20
    canary_wait_time: int = 600
    deployment_strategy: str = "blue_green"  # blue_green, canary, rolling

    # Drift detection configuration
    enable_drift_detection: bool = True
    drift_threshold: float = 0.3
    drift_detection_method: str = "ks"  # ks, wasserstein, psi

    # Retraining configuration
    retraining_interval: int = 86400
    enable_auto_retrain: bool = True
    retrain_on_drift: bool = True

    # Hyperparameter optimization
    enable_hyperparameter_tuning: bool = True
    hpo_trials: int = 50
    hpo_timeout: int = 3600

    # Resource limits
    max_gpu_memory: int = 16384  # MB
    max_cpu_memory: int = 32768  # MB
    max_concurrent_pipelines: int = 3
    gpu_utilization_limit: float = 90.0

    # Retry and resilience
    max_retries: int = 3
    retry_delay: int = 60
    circuit_breaker_threshold: int = 5
    circuit_breaker_timeout: int = 300

    # Monitoring and alerting
    enable_monitoring: bool = True
    monitoring_interval: int = 30
    alert_on_failure: bool = True
    alert_on_degradation: bool = True

    # Compliance and audit
    enable_audit_logging: bool = True
    enable_model_explanations: bool = True
    data_retention_days: int = 90

    # Performance thresholds
    latency_threshold_p95: float = 100.0  # ms
    error_rate_threshold: float = 0.01
    min_accuracy_improvement: float = 0.02

class EnhancedTrainingPipelineOrchestrator:
    """Enhanced training pipeline orchestrator with A++ features"""

    def __init__(self, config: EnhancedPipelineConfig, db_session: Session):
        self.config = config
        self.db_session = db_session

        # Initialize components
        self.model_registry = ModelRegistry(db_session)
        self.data_pipeline = EnhancedDataPipeline()
        self.training_pipeline = TrainingPipeline()
        self.evaluation_pipeline = EvaluationPipeline()
        self.deployment_pipeline = DeploymentPipeline()
        self.drift_detector = DriftDetector()
        self.experiment_manager = ExperimentManager()

        # Enhanced components
        self.resource_manager = ResourceManager(
            max_gpu_memory=config.max_gpu_memory,
            max_cpu_memory=config.max_cpu_memory,
            max_concurrent=config.max_concurrent_pipelines
        )
        self.alert_manager = AlertManager()
        self.version_manager = ModelVersionManager()

        # Circuit breaker for external services
        self.circuit_breaker = CircuitBreaker(
            failure_threshold=config.circuit_breaker_threshold,
            recovery_timeout=config.circuit_breaker_timeout
        )

        # Celery app with enhanced configuration
        self.celery_app = Celery('training_pipeline')
        self.celery_app.conf.update(
            task_serializer='json',
            accept_content=['json'],
            result_serializer='json',
            timezone='UTC',
            enable_utc=True,
            task_track_started=True,
            task_time_limit=config.max_training_time,
            task_soft_time_limit=config.max_training_time - 300
        )

        # Redis connection pool for better performance
        self.redis_pool = redis.ConnectionPool(
            host='localhost',
            port=6379,
            max_connections=50,
            decode_responses=True
        )

        # Audit logger
        self.audit_logger = self._setup_audit_logger()

        # Pipeline state tracking
        self.active_pipelines = {}
        self.pipeline_history = deque(maxlen=100)

    def _setup_audit_logger(self) -> logging.Logger:
        """Setup audit logger for compliance"""
        audit_logger = logging.getLogger('audit')
        audit_handler = logging.FileHandler('audit.log')
        audit_handler.setFormatter(
            logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        )
        audit_logger.addHandler(audit_handler)
        return audit_logger

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10),
        retry=retry_if_exception_type((ConnectionError, TimeoutError)),
        before_sleep=before_sleep_log(logger, logging.WARNING)
    )
    async def run_pipeline(
        self,
        trigger: str = "manual",
        force_retrain: bool = False,
        priority: str = "normal",
        progress_callback: Optional[callable] = None
    ) -> Dict:
        """
        Run complete training pipeline with enhanced error recovery

        Args:
            trigger: What triggered the pipeline (manual, schedule, drift, annotation_threshold)
            force_retrain: Force retraining even if conditions aren't met
            priority: Pipeline priority (low, normal, high, critical)
            progress_callback: Optional callback for progress updates
                              Signature: callback(epoch, total_epochs, metrics, phase)
                              Called on each epoch to update DATABASE

        Returns:
            Pipeline execution results with comprehensive metrics
        """
        # Store progress callback for use during training
        self.progress_callback = progress_callback
        pipeline_id = str(uuid.uuid4())
        start_time = datetime.utcnow()

        # Check resource availability
        if not await self.resource_manager.can_acquire_resources():
            return {
                "pipeline_id": pipeline_id,
                "status": "queued",
                "reason": "Insufficient resources, pipeline queued",
                "queue_position": await self.resource_manager.get_queue_position()
            }

        # Acquire resources with context manager
        async with self.resource_manager.acquire_resources() as resources:
            try:
                # Initialize tracking with enhanced metadata
                mlflow.start_run(
                    run_name=f"pipeline_{pipeline_id}",
                    tags={
                        "trigger": trigger,
                        "priority": priority,
                        "force_retrain": str(force_retrain),
                        "config_version": "2.0.0"
                    }
                )

                wandb.init(
                    project="logo-detection",
                    name=f"pipeline_{pipeline_id}",
                    config=self.config.__dict__,
                    tags=[trigger, priority]
                )

                # Track pipeline start
                pipeline_runs.labels(trigger=trigger, status="started").inc()
                self.active_pipelines[pipeline_id] = {
                    "status": PipelineStatus.PENDING,
                    "start_time": start_time,
                    "trigger": trigger,
                    "priority": priority
                }

                # Log pipeline start with audit trail
                await self._log_pipeline_event(
                    pipeline_id,
                    PipelineStatus.PENDING,
                    {
                        "trigger": trigger,
                        "force_retrain": force_retrain,
                        "priority": priority,
                        "resources": resources
                    }
                )

                # Step 1: Validation phase
                await self._log_pipeline_event(pipeline_id, PipelineStatus.VALIDATING)

                validation_result = await self._validate_pipeline_prerequisites()
                if not validation_result["valid"]:
                    raise ValueError(f"Pipeline validation failed: {validation_result['errors']}")

                # Step 2: Check if training is needed
                if not force_retrain and not await self._should_train(trigger):
                    return {
                        "pipeline_id": pipeline_id,
                        "status": "skipped",
                        "reason": "Training conditions not met",
                        "next_check": (datetime.utcnow() + timedelta(hours=1)).isoformat()
                    }

                # Step 3: Data preparation with quality checks
                await self._log_pipeline_event(pipeline_id, PipelineStatus.PREPARING)

                data_result = await self._prepare_and_validate_data()
                if not data_result["success"]:
                    raise Exception(f"Data preparation failed: {data_result['error']}")

                # Log data quality metrics
                data_quality_score.set(data_result["quality_score"])

                # Step 4: Check for data drift
                drift_result = await self._check_and_handle_drift(data_result["dataset"])
                if drift_result["action"] == "abort":
                    raise Exception(f"Critical drift detected: {drift_result['reason']}")

                # Step 5: Training with HPO and monitoring
                await self._log_pipeline_event(pipeline_id, PipelineStatus.RUNNING)

                training_result = await self._train_with_monitoring(
                    data_result["dataset"],
                    pipeline_id
                )

                if not training_result["success"]:
                    raise Exception(f"Training failed: {training_result['error']}")

                # Step 6: Comprehensive evaluation
                await self._log_pipeline_event(pipeline_id, PipelineStatus.EVALUATING)

                eval_result = await self._comprehensive_evaluation(
                    training_result["model"],
                    data_result["test_dataset"],
                    training_result["model_id"]
                )

                # Log model performance metrics
                for metric_name, value in eval_result["metrics"].items():
                    model_performance.labels(metric_name=metric_name).observe(value)

                # Step 7: Deployment decision with safety checks
                deployment_decision = await self._make_deployment_decision(
                    eval_result,
                    training_result["model_id"]
                )

                if deployment_decision["should_deploy"]:
                    await self._log_pipeline_event(pipeline_id, PipelineStatus.DEPLOYING)

                    deployment_result = await self._safe_deployment(
                        training_result["model_id"],
                        eval_result["metrics"],
                        deployment_decision["strategy"]
                    )

                    # Step 8: Post-deployment monitoring
                    await self._log_pipeline_event(pipeline_id, PipelineStatus.MONITORING)

                    monitoring_result = await self._monitor_deployment(
                        deployment_result["deployment_id"],
                        duration=self.config.monitoring_interval * 10
                    )

                    if not monitoring_result["healthy"]:
                        await self._handle_unhealthy_deployment(
                            deployment_result["deployment_id"],
                            monitoring_result
                        )
                    else:
                        await self._finalize_deployment(deployment_result["deployment_id"])
                        models_deployed.labels(strategy=deployment_decision["strategy"]).inc()

                # Step 9: Cleanup and reporting
                await self._log_pipeline_event(pipeline_id, PipelineStatus.COMPLETED)

                # Calculate final metrics
                duration = (datetime.utcnow() - start_time).total_seconds()
                pipeline_duration.observe(duration)
                pipeline_runs.labels(trigger=trigger, status="completed").inc()

                # Update success rate
                self._update_success_rate()

                # Generate comprehensive report
                final_report = await self._generate_pipeline_report(
                    pipeline_id,
                    training_result,
                    eval_result,
                    deployment_decision,
                    duration
                )

                # Store in pipeline history
                self.pipeline_history.append(final_report)

                return final_report

            except Exception as e:
                logger.error(f"Pipeline {pipeline_id} failed: {str(e)}", exc_info=True)
                pipeline_failures.labels(reason=type(e).__name__).inc()

                await self._log_pipeline_event(
                    pipeline_id,
                    PipelineStatus.FAILED,
                    {"error": str(e), "traceback": True}
                )

                # Send alert for critical failures
                if self.config.alert_on_failure:
                    await self.alert_manager.send_alert(
                        alert_type="PIPELINE_FAILURE",
                        details={
                            "pipeline_id": pipeline_id,
                            "error": str(e),
                            "trigger": trigger,
                            "duration": (datetime.utcnow() - start_time).total_seconds()
                        }
                    )

                # Cleanup on failure
                await self._cleanup_failed_pipeline(pipeline_id)

                # Check if we should retry
                if self._should_retry(e):
                    await self._log_pipeline_event(pipeline_id, PipelineStatus.RETRYING)
                    raise  # Let tenacity handle the retry

                return {
                    "pipeline_id": pipeline_id,
                    "status": "failed",
                    "error": str(e),
                    "duration": (datetime.utcnow() - start_time).total_seconds(),
                    "cleanup_performed": True
                }

            finally:
                # Cleanup
                if pipeline_id in self.active_pipelines:
                    del self.active_pipelines[pipeline_id]

                # End tracking
                mlflow.end_run()
                wandb.finish()

                # Update resource usage metrics
                resource_usage.labels(resource_type="gpu").set(
                    await self.resource_manager.get_gpu_usage()
                )
                resource_usage.labels(resource_type="memory").set(
                    await self.resource_manager.get_memory_usage()
                )

    async def _validate_pipeline_prerequisites(self) -> Dict:
        """Validate all prerequisites before starting pipeline"""
        errors = []
        warnings = []

        # Check MLflow connectivity
        try:
            mlflow.get_tracking_uri()
        except Exception as e:
            errors.append(f"MLflow not accessible: {str(e)}")

        # Check Redis connectivity
        try:
            async with redis.Redis(connection_pool=self.redis_pool) as r:
                await r.ping()
        except Exception as e:
            errors.append(f"Redis not accessible: {str(e)}")

        # Check model registry
        try:
            self.model_registry.get_production_model()
        except Exception as e:
            warnings.append(f"No production model found: {str(e)}")

        # Check data availability
        data_available = await self._check_data_availability()
        if not data_available:
            errors.append("Insufficient training data available")

        # Check GPU availability
        gpu_available = await self.resource_manager.check_gpu_availability()
        if not gpu_available:
            errors.append("No GPU resources available")

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings
        }

    async def _prepare_and_validate_data(self) -> Dict:
        """Prepare and validate training data with quality checks"""
        # Prepare dataset
        dataset = await self.data_pipeline.prepare_dataset(
            min_samples=self.config.min_training_samples,
            validation_split=0.2,
            augmentation=True,
            balance_classes=True
        )

        # Validate dataset
        validation_result = await self.data_pipeline.validate_dataset(dataset)

        if not validation_result["valid"]:
            return {
                "success": False,
                "error": f"Data validation failed: {validation_result['errors']}"
            }

        # Calculate quality score
        quality_score = await self._calculate_data_quality_score(dataset)

        return {
            "success": True,
            "dataset": dataset["dataset"],
            "test_dataset": dataset["dataset"]["test"],
            "quality_score": quality_score,
            "statistics": dataset["statistics"]
        }

    async def _check_and_handle_drift(self, dataset: Dict) -> Dict:
        """Check for drift and determine action"""
        if not self.config.enable_drift_detection:
            return {"action": "continue", "drift_score": 0.0}

        # Get reference data
        reference_data = await self._get_reference_data()
        if reference_data is None:
            return {"action": "continue", "drift_score": 0.0}

        # Calculate drift
        drift_score = await self.drift_detector.calculate_drift(
            reference_data,
            dataset["features"],
            method=self.config.drift_detection_method
        )

        # Determine action based on drift score
        if drift_score > self.config.drift_threshold * 2:
            # Critical drift - abort and alert
            await self.alert_manager.send_alert(
                "CRITICAL_DRIFT",
                {"drift_score": drift_score, "threshold": self.config.drift_threshold}
            )
            return {
                "action": "abort",
                "drift_score": drift_score,
                "reason": "Critical data drift detected"
            }
        elif drift_score > self.config.drift_threshold:
            # Significant drift - continue but adjust training
            logger.warning(f"Significant drift detected: {drift_score}")
            return {
                "action": "adjust",
                "drift_score": drift_score,
                "adjustments": ["increase_epochs", "adjust_learning_rate"]
            }
        else:
            return {"action": "continue", "drift_score": drift_score}

    async def _train_with_monitoring(
        self,
        dataset: Dict,
        pipeline_id: str
    ) -> Dict:
        """Train model with real-time monitoring and early stopping"""

        # Optimize hyperparameters if enabled
        if self.config.enable_hyperparameter_tuning:
            best_params = await self._optimize_hyperparameters(
                dataset,
                n_trials=self.config.hpo_trials,
                timeout=self.config.hpo_timeout
            )
        else:
            best_params = None

        # Create training monitor
        monitor = TrainingMonitor(pipeline_id)

        # Start training with monitoring
        training_task = asyncio.create_task(
            self.training_pipeline.train(
                dataset,
                hyperparameters=best_params,
                max_time=self.config.max_training_time,
                monitor_callback=monitor.update
            )
        )

        # Monitor training progress
        monitoring_task = asyncio.create_task(
            self._monitor_training_progress(monitor, pipeline_id)
        )

        try:
            # Wait for training to complete
            training_result = await training_task

            # Cancel monitoring
            monitoring_task.cancel()

            # Create model version
            model_version = self.version_manager.create_version(
                training_result["model_id"],
                training_result["metrics"]
            )

            training_result["version"] = model_version

            return training_result

        except asyncio.TimeoutError:
            logger.error(f"Training timeout for pipeline {pipeline_id}")
            training_task.cancel()
            monitoring_task.cancel()
            return {"success": False, "error": "Training timeout"}

    async def _comprehensive_evaluation(
        self,
        model: Any,
        test_dataset: Any,
        model_id: str
    ) -> Dict:
        """Comprehensive model evaluation with multiple metrics"""

        # Standard metrics
        base_metrics = await self.evaluation_pipeline.evaluate(
            model,
            test_dataset,
            metrics=["accuracy", "precision", "recall", "f1", "auc_roc"]
        )

        # Performance metrics
        perf_metrics = await self._evaluate_performance(model, test_dataset)

        # Robustness metrics
        robustness_metrics = await self._evaluate_robustness(model, test_dataset)

        # Fairness metrics
        fairness_metrics = await self._evaluate_fairness(model, test_dataset)

        # Explainability analysis
        if self.config.enable_model_explanations:
            explanations = await self._generate_explanations(model, test_dataset)
        else:
            explanations = None

        return {
            "metrics": {
                **base_metrics["metrics"],
                **perf_metrics,
                "robustness": robustness_metrics,
                "fairness": fairness_metrics
            },
            "explanations": explanations,
            "model_id": model_id
        }

    async def _make_deployment_decision(
        self,
        eval_result: Dict,
        model_id: str
    ) -> Dict:
        """Make deployment decision with comprehensive safety checks"""

        reasons = []
        should_deploy = True

        # Check accuracy threshold
        if eval_result["metrics"]["accuracy"] < self.config.auto_deploy_threshold:
            should_deploy = False
            reasons.append(f"Accuracy {eval_result['metrics']['accuracy']} below threshold")

        # Compare with current production model
        current_model = self.model_registry.get_production_model()
        if current_model:
            current_metrics = current_model.get_metrics()
            improvement = eval_result["metrics"]["accuracy"] - current_metrics["accuracy"]

            if improvement < self.config.min_accuracy_improvement:
                should_deploy = False
                reasons.append(f"Insufficient improvement: {improvement:.2%}")

        # Check latency requirements
        if eval_result["metrics"]["latency_p95"] > self.config.latency_threshold_p95:
            should_deploy = False
            reasons.append(f"Latency {eval_result['metrics']['latency_p95']}ms exceeds limit")

        # Check robustness
        if eval_result["metrics"]["robustness"]["adversarial_accuracy"] < 0.7:
            should_deploy = False
            reasons.append("Model not robust to adversarial examples")

        # Determine deployment strategy
        if should_deploy:
            if current_model and improvement < 0.05:
                strategy = "canary"  # Small improvement - careful deployment
            elif not current_model:
                strategy = "blue_green"  # First deployment
            else:
                strategy = self.config.deployment_strategy
        else:
            strategy = None

        return {
            "should_deploy": should_deploy,
            "strategy": strategy,
            "reasons": reasons,
            "model_id": model_id,
            "metrics": eval_result["metrics"]
        }

    async def _safe_deployment(
        self,
        model_id: str,
        metrics: Dict,
        strategy: str
    ) -> Dict:
        """Deploy model with safety mechanisms"""

        # Create deployment plan
        deployment_plan = await self._create_deployment_plan(model_id, strategy, metrics)

        # Execute deployment with circuit breaker
        async with self.circuit_breaker:
            if strategy == "blue_green":
                result = await self.deployment_pipeline.deploy_blue_green(
                    model_id,
                    deployment_plan
                )
            elif strategy == "canary":
                result = await self.deployment_pipeline.deploy_canary(
                    model_id,
                    initial_percentage=self.config.canary_percentage,
                    increment=self.config.canary_increment,
                    wait_time=self.config.canary_wait_time
                )
            elif strategy == "rolling":
                result = await self.deployment_pipeline.deploy_rolling(
                    model_id,
                    deployment_plan
                )
            else:
                # A/B testing deployment
                result = await self._deploy_with_ab_test(model_id, metrics)

        return result

    async def _monitor_deployment(
        self,
        deployment_id: str,
        duration: int
    ) -> Dict:
        """Monitor deployment with comprehensive health checks"""

        from ..safety.health_checker import EnhancedHealthChecker

        checker = EnhancedHealthChecker()

        # Define health check criteria
        health_criteria = {
            "latency_p95": self.config.latency_threshold_p95,
            "error_rate": self.config.error_rate_threshold,
            "memory_usage": self.config.max_cpu_memory * 0.8,
            "gpu_usage": self.config.gpu_utilization_limit
        }

        # Monitor deployment
        monitoring_result = await checker.monitor_deployment(
            deployment_id,
            duration=duration,
            criteria=health_criteria,
            check_interval=30
        )

        # Send alerts if issues detected
        if not monitoring_result["healthy"] and self.config.alert_on_degradation:
            await self.alert_manager.send_alert(
                "DEPLOYMENT_DEGRADATION",
                {
                    "deployment_id": deployment_id,
                    "issues": monitoring_result["issues"],
                    "metrics": monitoring_result["metrics"]
                }
            )

        return monitoring_result

    async def _handle_unhealthy_deployment(
        self,
        deployment_id: str,
        monitoring_result: Dict
    ):
        """Handle unhealthy deployment with rollback"""

        logger.error(f"Unhealthy deployment detected: {deployment_id}")

        # Log issues
        await self._log_pipeline_event(
            deployment_id,
            PipelineStatus.ROLLED_BACK,
            {"reason": monitoring_result["issues"]}
        )

        # Perform rollback
        from ..safety.rollback_manager import EnhancedRollbackManager

        rollback_manager = EnhancedRollbackManager()
        rollback_result = await rollback_manager.rollback(
            deployment_id,
            reason=monitoring_result["issues"],
            automatic=True
        )

        # Send critical alert
        await self.alert_manager.send_alert(
            "CRITICAL_ROLLBACK",
            {
                "deployment_id": deployment_id,
                "rollback_result": rollback_result,
                "issues": monitoring_result["issues"]
            }
        )

    async def _finalize_deployment(self, deployment_id: str):
        """Finalize successful deployment"""

        # Complete deployment
        await self.deployment_pipeline.complete_deployment(deployment_id)

        # Update model registry
        self.model_registry.promote_to_production(deployment_id)

        # Log success
        logger.info(f"Deployment {deployment_id} successfully finalized")

    async def _cleanup_failed_pipeline(self, pipeline_id: str):
        """Comprehensive cleanup after pipeline failure"""

        try:
            # Remove temporary models
            await self.model_registry.cleanup_temporary_models(pipeline_id)

            # Cancel any running experiments
            await self.experiment_manager.cancel_experiments(pipeline_id)

            # Release resources
            await self.resource_manager.release_all()

            # Clear cache
            async with redis.Redis(connection_pool=self.redis_pool) as r:
                pattern = f"pipeline:{pipeline_id}:*"
                async for key in r.scan_iter(match=pattern):
                    await r.delete(key)

            logger.info(f"Cleanup completed for pipeline {pipeline_id}")

        except Exception as e:
            logger.error(f"Cleanup failed for pipeline {pipeline_id}: {str(e)}")

    def _should_retry(self, exception: Exception) -> bool:
        """Determine if pipeline should be retried"""

        # Don't retry on validation errors
        if isinstance(exception, ValueError):
            return False

        # Don't retry on resource exhaustion
        if "resource" in str(exception).lower():
            return False

        # Retry on transient errors
        transient_errors = [
            ConnectionError,
            TimeoutError,
            redis.RedisError
        ]

        return any(isinstance(exception, error) for error in transient_errors)

    def _update_success_rate(self):
        """Update pipeline success rate metric"""

        total = len(self.pipeline_history)
        if total > 0:
            successful = sum(1 for p in self.pipeline_history if p["status"] == "completed")
            success_rate = successful / total
            pipeline_success_rate.set(success_rate)

    async def _generate_pipeline_report(
        self,
        pipeline_id: str,
        training_result: Dict,
        eval_result: Dict,
        deployment_decision: Dict,
        duration: float
    ) -> Dict:
        """Generate comprehensive pipeline report"""

        report = {
            "pipeline_id": pipeline_id,
            "status": "completed",
            "duration": duration,
            "timestamp": datetime.utcnow().isoformat(),

            "model": {
                "id": training_result["model_id"],
                "version": training_result.get("version"),
                "training_duration": training_result.get("duration")
            },

            "metrics": eval_result["metrics"],

            "deployment": {
                "deployed": deployment_decision["should_deploy"],
                "strategy": deployment_decision.get("strategy"),
                "reasons": deployment_decision.get("reasons", [])
            },

            "resource_usage": {
                "gpu_hours": duration / 3600 * await self.resource_manager.get_gpu_usage(),
                "memory_peak": await self.resource_manager.get_peak_memory()
            },

            "cost_estimate": await self._estimate_pipeline_cost(duration)
        }

        # Add audit trail if enabled
        if self.config.enable_audit_logging:
            self.audit_logger.info(json.dumps(report))

        return report

    async def _estimate_pipeline_cost(self, duration: float) -> float:
        """Estimate pipeline execution cost"""

        # Cost model (example rates)
        gpu_cost_per_hour = 2.5  # $/hour
        cpu_cost_per_hour = 0.5  # $/hour
        storage_cost_per_gb = 0.1  # $/GB

        gpu_hours = duration / 3600
        cost = (gpu_hours * gpu_cost_per_hour) + (duration / 3600 * cpu_cost_per_hour)

        return round(cost, 2)

    async def _log_pipeline_event(
        self,
        pipeline_id: str,
        status: PipelineStatus,
        data: Optional[Dict] = None
    ):
        """Log pipeline event with structured logging"""

        event = {
            "pipeline_id": pipeline_id,
            "status": status.value,
            "timestamp": datetime.utcnow().isoformat(),
            "data": data or {}
        }

        # Log to multiple destinations
        logger.info(f"Pipeline Event: {json.dumps(event)}")

        # Log to MLflow
        if mlflow.active_run():
            mlflow.log_params({"status": status.value})
            if data:
                mlflow.log_metrics({f"event_{k}": v for k, v in data.items()
                                  if isinstance(v, (int, float))})

        # Log to W&B
        if wandb.run:
            wandb.log({"pipeline_status": status.value, **event})

        # Store in Redis for real-time monitoring
        async with redis.Redis(connection_pool=self.redis_pool) as r:
            await r.xadd(
                f"pipeline:events:{pipeline_id}",
                event,
                maxlen=1000
            )

    # Additional helper methods

    async def _should_train(self, trigger: str) -> bool:
        """Enhanced training decision logic"""

        # Check last training time
        last_training = self.model_registry.get_last_training_time()
        if last_training:
            time_since = (datetime.utcnow() - last_training).total_seconds()
            if time_since < self.config.retraining_interval and trigger != "manual":
                return False

        # Check data availability
        annotation_count = await self._count_new_annotations()
        if annotation_count < self.config.min_training_samples:
            logger.info(f"Insufficient annotations: {annotation_count}")
            return False

        # Check for drift trigger
        if trigger == "drift" and self.config.retrain_on_drift:
            return True

        # Check for scheduled training
        if trigger == "schedule" and self.config.enable_auto_retrain:
            return True

        return trigger == "manual"

    async def _check_data_availability(self) -> bool:
        """Check if sufficient data is available for training"""

        try:
            count = await self._count_new_annotations()
            return count >= self.config.min_training_samples
        except Exception as e:
            logger.error(f"Error checking data availability: {str(e)}")
            return False

    async def _count_new_annotations(self) -> int:
        """Count new annotations since last training"""

        # Connect to annotation database
        from ..integration.annotation_connector import AnnotationConnector

        connector = AnnotationConnector()
        last_training = self.model_registry.get_last_training_time()

        if last_training:
            count = await connector.count_annotations_since(last_training)
        else:
            count = await connector.count_all_annotations()

        return count

    async def _get_reference_data(self) -> Optional[Any]:
        """Get reference data for drift detection"""

        # Get the current production model's training data distribution
        current_model = self.model_registry.get_production_model()

        if current_model:
            return await self.model_registry.get_training_data_stats(current_model.id)

        return None

    async def _calculate_data_quality_score(self, dataset: Dict) -> float:
        """Calculate comprehensive data quality score"""

        scores = []

        # Check class balance
        class_distribution = dataset["statistics"]["class_distribution"]
        balance_score = 1.0 - np.std(list(class_distribution.values())) / np.mean(list(class_distribution.values()))
        scores.append(balance_score)

        # Check sample size
        total_samples = dataset["statistics"]["total_samples"]
        size_score = min(1.0, total_samples / (self.config.min_training_samples * 10))
        scores.append(size_score)

        # Check data diversity (simplified)
        diversity_score = 0.8  # Placeholder - implement actual diversity calculation
        scores.append(diversity_score)

        return np.mean(scores)

    async def _optimize_hyperparameters(
        self,
        dataset: Dict,
        n_trials: int,
        timeout: int
    ) -> Dict:
        """Optimize hyperparameters using Optuna with early stopping"""

        from ..automation.hyperparameter_optimizer import EnhancedHyperparameterOptimizer

        optimizer = EnhancedHyperparameterOptimizer()

        best_params = await optimizer.optimize(
            dataset,
            n_trials=n_trials,
            timeout=timeout,
            early_stopping_patience=10,
            pruning=True
        )

        # Log best parameters
        logger.info(f"Best hyperparameters: {best_params}")
        mlflow.log_params(best_params)

        return best_params

    async def _monitor_training_progress(self, monitor: Any, pipeline_id: str):
        """Monitor training progress and implement early stopping"""

        best_metric = 0
        patience_counter = 0
        patience_limit = 5

        while True:
            await asyncio.sleep(30)  # Check every 30 seconds

            current_metrics = monitor.get_latest_metrics()

            if current_metrics:
                # Check for improvement
                if current_metrics["validation_accuracy"] > best_metric:
                    best_metric = current_metrics["validation_accuracy"]
                    patience_counter = 0
                else:
                    patience_counter += 1

                # Early stopping
                if patience_counter >= patience_limit:
                    logger.info(f"Early stopping triggered for pipeline {pipeline_id}")
                    monitor.request_stop()
                    break

                # Log progress
                logger.info(f"Training progress: {current_metrics}")

    async def _evaluate_performance(self, model: Any, test_dataset: Any) -> Dict:
        """Evaluate model performance metrics"""

        latencies = []
        throughputs = []

        # Run performance tests
        for _ in range(100):
            start = datetime.utcnow()
            _ = await model.predict(test_dataset.sample())
            latency = (datetime.utcnow() - start).total_seconds() * 1000
            latencies.append(latency)

        return {
            "latency_p50": np.percentile(latencies, 50),
            "latency_p95": np.percentile(latencies, 95),
            "latency_p99": np.percentile(latencies, 99),
            "throughput": 1000 / np.mean(latencies)  # requests/sec
        }

    async def _evaluate_robustness(self, model: Any, test_dataset: Any) -> Dict:
        """Evaluate model robustness to adversarial examples"""

        from ..evaluation.robustness_evaluator import RobustnessEvaluator

        evaluator = RobustnessEvaluator()

        return await evaluator.evaluate(
            model,
            test_dataset,
            attacks=["fgsm", "pgd", "cw"],
            epsilon=0.1
        )

    async def _evaluate_fairness(self, model: Any, test_dataset: Any) -> Dict:
        """Evaluate model fairness across different groups"""

        from ..evaluation.fairness_evaluator import FairnessEvaluator

        evaluator = FairnessEvaluator()

        return await evaluator.evaluate(
            model,
            test_dataset,
            sensitive_attributes=["brand_size", "logo_type"],
            metrics=["demographic_parity", "equal_opportunity"]
        )

    async def _generate_explanations(self, model: Any, test_dataset: Any) -> Dict:
        """Generate model explanations using SHAP/LIME"""

        from ..explainability.model_explainer import ModelExplainer

        explainer = ModelExplainer()

        # Generate global explanations
        global_explanations = await explainer.explain_global(model, test_dataset)

        # Generate local explanations for a sample
        sample_explanations = await explainer.explain_local(
            model,
            test_dataset.sample(n=10)
        )

        return {
            "global": global_explanations,
            "samples": sample_explanations
        }

    async def _create_deployment_plan(
        self,
        model_id: str,
        strategy: str,
        metrics: Dict
    ) -> Dict:
        """Create detailed deployment plan"""

        return {
            "model_id": model_id,
            "strategy": strategy,
            "stages": [
                {"name": "pre_deployment_checks", "timeout": 300},
                {"name": "deploy_to_staging", "timeout": 600},
                {"name": "smoke_tests", "timeout": 300},
                {"name": "gradual_rollout", "timeout": 1800},
                {"name": "monitoring", "timeout": 3600}
            ],
            "rollback_triggers": {
                "error_rate": self.config.error_rate_threshold * 2,
                "latency_p95": self.config.latency_threshold_p95 * 1.5
            },
            "success_criteria": metrics
        }

    async def _deploy_with_ab_test(self, model_id: str, metrics: Dict) -> Dict:
        """Deploy model with A/B testing"""

        # Create A/B test experiment with enhanced configuration
        experiment = await self.experiment_manager.create_experiment(
            name=f"model_{model_id}_test",
            control_model=self.model_registry.get_production_model().id,
            treatment_model=model_id,
            traffic_split={"control": 50, "treatment": 50},
            duration=self.config.ab_test_duration,
            success_metrics=["accuracy", "latency", "error_rate"],
            minimum_sample_size=self.config.ab_test_min_samples,
            confidence_level=self.config.ab_test_confidence_level
        )

        # Start deployment
        deployment_result = await self.deployment_pipeline.deploy_ab_test(
            experiment_id=experiment["id"],
            model_id=model_id
        )

        # Start monitoring task
        asyncio.create_task(
            self._monitor_ab_test(
                experiment["id"],
                self.config.ab_test_duration
            )
        )

        return deployment_result

    async def _monitor_ab_test(self, experiment_id: str, duration: int):
        """Monitor A/B test and make decision"""

        # Wait for test duration
        await asyncio.sleep(duration)

        # Get results
        results = await self.experiment_manager.get_results(experiment_id)

        # Determine winner with statistical significance
        winner = await self.experiment_manager.determine_winner(
            experiment_id,
            min_sample_size=self.config.ab_test_min_samples,
            confidence_level=self.config.ab_test_confidence_level
        )

        # Take action based on winner
        if winner == "treatment":
            # New model wins - complete deployment
            await self._complete_ab_deployment(experiment_id, "treatment")
            logger.info(f"A/B test winner: treatment model for experiment {experiment_id}")
        elif winner == "control":
            # Current model wins - rollback
            await self._complete_ab_deployment(experiment_id, "control")
            logger.info(f"A/B test winner: control model for experiment {experiment_id}")
        else:
            # No clear winner - extend test or use fallback
            logger.warning(f"No clear winner for A/B test {experiment_id}")
            await self._handle_inconclusive_test(experiment_id, results)

    async def _complete_ab_deployment(self, experiment_id: str, winner: str):
        """Complete A/B test deployment"""

        if winner == "treatment":
            await self.deployment_pipeline.promote_treatment(experiment_id)
        else:
            await self.deployment_pipeline.rollback_treatment(experiment_id)

    async def _handle_inconclusive_test(self, experiment_id: str, results: Dict):
        """Handle inconclusive A/B test"""

        # Option 1: Extend the test
        # Option 2: Deploy with lower traffic percentage
        # Option 3: Rollback to control

        # For now, rollback to be safe
        await self.deployment_pipeline.rollback_treatment(experiment_id)

        # Alert stakeholders
        await self.alert_manager.send_alert(
            "AB_TEST_INCONCLUSIVE",
            {
                "experiment_id": experiment_id,
                "results": results
            }
        )


class TrainingMonitor:
    """Monitor for training progress"""

    def __init__(self, pipeline_id: str):
        self.pipeline_id = pipeline_id
        self.metrics_history = []
        self.stop_requested = False

    def update(self, metrics: Dict):
        """Update metrics from training loop"""
        self.metrics_history.append({
            "timestamp": datetime.utcnow().isoformat(),
            **metrics
        })

    def get_latest_metrics(self) -> Optional[Dict]:
        """Get latest training metrics"""
        if self.metrics_history:
            return self.metrics_history[-1]
        return None

    def request_stop(self):
        """Request training to stop"""
        self.stop_requested = True

    def should_stop(self) -> bool:
        """Check if training should stop"""
        return self.stop_requested