# US-004: Training Pipeline Integration - A++ Implementation Specification
**Story Points**: 8
**Timeline**: 4 days
**Status**: READY FOR IMPLEMENTATION
**Grade Target**: A++ (100% test coverage, full MLOps, production-ready)

---

## 🎯 STORY GOAL & CONTEXT

**What You're Building**: A complete ML training pipeline that automatically trains, validates, and deploys improved logo detection models based on new annotation data, with A/B testing and automatic rollback capabilities.

**Business Value**: Enable continuous model improvement without manual intervention, reducing model update time from weeks to hours while maintaining 99.9% uptime.

**Epic Context**: Part of EPIC-002 (ML Platform) - Creates the automated ML lifecycle from data to deployment.

**Current State**:
- ✅ Basic training pipeline exists (`training_pipeline.py`)
- ✅ Model registry exists (`model_registry.py`)
- ❌ Missing: Integration with detection service
- ❌ Missing: A/B testing framework
- ❌ Missing: Auto-deployment logic
- ❌ Missing: Data drift detection

---

## 🏗️ TECHNICAL ARCHITECTURE

### System Components
```
backend/app/training/
├── pipeline/
│   ├── orchestrator.py               # Main pipeline orchestrator
│   ├── data_pipeline.py              # Data preparation & validation
│   ├── training_pipeline.py          # Model training (enhance existing)
│   ├── evaluation_pipeline.py        # Model evaluation & comparison
│   └── deployment_pipeline.py        # Deployment decision & execution
├── monitoring/
│   ├── drift_detector.py             # Data & concept drift detection
│   ├── performance_monitor.py        # Real-time model performance
│   ├── training_monitor.py           # Training metrics tracking
│   └── alert_manager.py              # Alerting for anomalies
├── ab_testing/
│   ├── experiment_manager.py         # A/B test orchestration
│   ├── traffic_splitter.py           # Request routing logic
│   ├── metrics_collector.py          # A/B test metrics
│   └── decision_engine.py            # Winner selection logic
├── integration/
│   ├── mlflow_client.py              # MLflow integration
│   ├── wandb_client.py               # Weights & Biases integration
│   ├── model_serving_bridge.py       # Connect to serving layer
│   └── annotation_connector.py       # Connect to annotation system
├── automation/
│   ├── auto_trainer.py               # Automatic retraining triggers
│   ├── hyperparameter_optimizer.py   # HPO with Optuna
│   ├── model_selector.py             # Best model selection
│   └── deployment_manager.py         # Zero-downtime deployment
└── safety/
    ├── rollback_manager.py            # Automatic rollback (enhance existing)
    ├── canary_deployer.py            # Canary deployment
    ├── health_checker.py             # Model health checks
    └── fallback_handler.py          # Fallback to previous version
```

---

## 📦 IMPLEMENTATION TASKS - Day 1: Pipeline Orchestration

### Task 4.1: Main Pipeline Orchestrator (4 hours)
```python
# orchestrator.py
import asyncio
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import uuid

from celery import Celery, chain, group, chord
from prometheus_client import Counter, Histogram, Gauge
import mlflow
import wandb
from sqlalchemy.orm import Session

from ..model_registry import ModelRegistry, ModelStatus
from ..data_loader import DataLoader
from ..training_pipeline import TrainingPipeline
from .data_pipeline import DataPipeline
from .evaluation_pipeline import EvaluationPipeline
from .deployment_pipeline import DeploymentPipeline
from ..monitoring.drift_detector import DriftDetector
from ..ab_testing.experiment_manager import ExperimentManager

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
    auto_deploy_threshold: float = 0.85  # Min accuracy for auto-deployment
    min_training_samples: int = 1000     # Min samples to trigger training
    max_training_time: int = 7200        # Max training time in seconds
    enable_ab_testing: bool = True       # Enable A/B testing for new models
    ab_test_duration: int = 3600         # A/B test duration in seconds
    canary_percentage: int = 10          # Initial canary deployment percentage
    enable_drift_detection: bool = True   # Enable data drift monitoring
    drift_threshold: float = 0.3         # Drift score threshold
    retraining_interval: int = 86400     # Min seconds between retraining
    enable_hyperparameter_tuning: bool = True
    hpo_trials: int = 50                 # Number of HPO trials

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
        wandb.init(project="logo-detection", name=f"pipeline_{pipeline_id}")

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
                best_params = await self._optimize_hyperparameters(
                    data_result["dataset"],
                    n_trials=self.config.hpo_trials
                )
                training_result = await self._train_model(
                    data_result["dataset"],
                    hyperparameters=best_params
                )
            else:
                training_result = await self._train_model(data_result["dataset"])

            if not training_result["success"]:
                raise Exception(f"Training failed: {training_result['error']}")

            # Step 5: Model evaluation
            self._log_pipeline_event(pipeline_id, PipelineStatus.EVALUATING, {
                "model_id": training_result["model_id"]
            })

            eval_result = await self._evaluate_model(
                training_result["model"],
                data_result["test_dataset"]
            )

            # Step 6: Deployment decision
            should_deploy, reason = await self._should_deploy(eval_result)

            if should_deploy:
                self._log_pipeline_event(pipeline_id, PipelineStatus.DEPLOYING, {
                    "model_id": training_result["model_id"],
                    "metrics": eval_result["metrics"]
                })

                # Step 7: Deploy with A/B testing or canary
                if self.config.enable_ab_testing:
                    deployment_result = await self._deploy_with_ab_test(
                        training_result["model_id"],
                        eval_result["metrics"]
                    )
                else:
                    deployment_result = await self._deploy_canary(
                        training_result["model_id"],
                        self.config.canary_percentage
                    )

                # Step 8: Monitor deployment
                monitoring_result = await self._monitor_deployment(
                    deployment_result["deployment_id"],
                    duration=300  # Monitor for 5 minutes
                )

                if not monitoring_result["healthy"]:
                    # Rollback if unhealthy
                    await self._rollback_deployment(deployment_result["deployment_id"])
                    self._log_pipeline_event(pipeline_id, PipelineStatus.ROLLED_BACK, {
                        "reason": monitoring_result["issues"]
                    })
                else:
                    # Full deployment if healthy
                    await self._complete_deployment(deployment_result["deployment_id"])
                    models_deployed.inc()

            # Step 9: Cleanup and reporting
            self._log_pipeline_event(pipeline_id, PipelineStatus.COMPLETED, {
                "duration": (datetime.now() - start_time).total_seconds(),
                "deployed": should_deploy,
                "metrics": eval_result["metrics"]
            })

            pipeline_success.inc()
            pipeline_duration.observe((datetime.now() - start_time).total_seconds())

            return {
                "pipeline_id": pipeline_id,
                "status": "completed",
                "model_id": training_result["model_id"],
                "deployed": should_deploy,
                "metrics": eval_result["metrics"],
                "duration": (datetime.now() - start_time).total_seconds()
            }

        except Exception as e:
            pipeline_failures.inc()
            self._log_pipeline_event(pipeline_id, PipelineStatus.FAILED, {
                "error": str(e)
            })

            # Cleanup on failure
            await self._cleanup_failed_pipeline(pipeline_id)

            return {
                "pipeline_id": pipeline_id,
                "status": "failed",
                "error": str(e)
            }

        finally:
            mlflow.end_run()
            wandb.finish()

    async def _should_train(self, trigger: str) -> bool:
        """Determine if training should proceed"""
        # Check last training time
        last_training = self.model_registry.get_last_training_time()
        if last_training:
            time_since = (datetime.now() - last_training).total_seconds()
            if time_since < self.config.retraining_interval:
                return False

        # Check data availability
        annotation_count = await self._count_new_annotations()
        if annotation_count < self.config.min_training_samples:
            return False

        # Check for drift
        if trigger == "drift":
            return True

        # Check for scheduled training
        if trigger == "schedule":
            return True

        return trigger == "manual"

    async def _prepare_data(self) -> Dict:
        """Prepare training data"""
        return await self.data_pipeline.prepare_dataset(
            min_samples=self.config.min_training_samples,
            validation_split=0.2,
            augmentation=True
        )

    async def _check_drift(self, dataset: Dict) -> float:
        """Check for data drift"""
        reference_data = await self._get_reference_data()
        return self.drift_detector.calculate_drift(
            reference_data,
            dataset["features"]
        )

    async def _optimize_hyperparameters(
        self,
        dataset: Dict,
        n_trials: int = 50
    ) -> Dict:
        """Optimize hyperparameters using Optuna"""
        from ..automation.hyperparameter_optimizer import HyperparameterOptimizer

        optimizer = HyperparameterOptimizer()
        return await optimizer.optimize(
            dataset,
            n_trials=n_trials,
            timeout=3600  # 1 hour timeout
        )

    async def _train_model(
        self,
        dataset: Dict,
        hyperparameters: Optional[Dict] = None
    ) -> Dict:
        """Train model"""
        return await self.training_pipeline.train(
            dataset,
            hyperparameters=hyperparameters,
            max_time=self.config.max_training_time
        )

    async def _evaluate_model(self, model: any, test_dataset: Dict) -> Dict:
        """Evaluate trained model"""
        return await self.evaluation_pipeline.evaluate(
            model,
            test_dataset,
            metrics=["accuracy", "precision", "recall", "f1", "latency"]
        )

    async def _should_deploy(self, eval_result: Dict) -> Tuple[bool, str]:
        """Determine if model should be deployed"""
        # Check accuracy threshold
        if eval_result["metrics"]["accuracy"] < self.config.auto_deploy_threshold:
            return False, f"Accuracy {eval_result['metrics']['accuracy']} below threshold"

        # Compare with current production model
        current_model = self.model_registry.get_production_model()
        if current_model:
            current_metrics = current_model.get_metrics()
            if eval_result["metrics"]["accuracy"] <= current_metrics["accuracy"]:
                return False, "No improvement over current model"

        # Check latency requirements
        if eval_result["metrics"]["latency"] > 100:  # ms
            return False, f"Latency {eval_result['metrics']['latency']}ms exceeds limit"

        return True, "All deployment criteria met"

    async def _deploy_with_ab_test(
        self,
        model_id: str,
        metrics: Dict
    ) -> Dict:
        """Deploy model with A/B testing"""
        # Create A/B test experiment
        experiment = await self.experiment_manager.create_experiment(
            name=f"model_{model_id}_test",
            control_model=self.model_registry.get_production_model().id,
            treatment_model=model_id,
            traffic_split={"control": 50, "treatment": 50},
            duration=self.config.ab_test_duration,
            success_metrics=["accuracy", "latency"]
        )

        # Start experiment
        deployment_result = await self.deployment_pipeline.deploy_ab_test(
            experiment_id=experiment["id"],
            model_id=model_id
        )

        # Monitor A/B test
        asyncio.create_task(
            self._monitor_ab_test(experiment["id"], self.config.ab_test_duration)
        )

        return deployment_result

    async def _monitor_ab_test(self, experiment_id: str, duration: int):
        """Monitor A/B test and make decision"""
        await asyncio.sleep(duration)

        # Get experiment results
        results = await self.experiment_manager.get_results(experiment_id)

        # Determine winner
        winner = await self.experiment_manager.determine_winner(
            experiment_id,
            min_sample_size=1000,
            confidence_level=0.95
        )

        if winner == "treatment":
            # Deploy new model to 100%
            await self._complete_deployment(experiment_id)
        else:
            # Keep current model
            await self._rollback_deployment(experiment_id)

    async def _deploy_canary(
        self,
        model_id: str,
        initial_percentage: int
    ) -> Dict:
        """Deploy model with canary strategy"""
        return await self.deployment_pipeline.deploy_canary(
            model_id=model_id,
            initial_percentage=initial_percentage,
            increment=20,  # Increase by 20% each step
            wait_time=600  # 10 minutes between increases
        )

    async def _monitor_deployment(
        self,
        deployment_id: str,
        duration: int
    ) -> Dict:
        """Monitor deployment health"""
        from ..safety.health_checker import HealthChecker

        checker = HealthChecker()
        return await checker.monitor_deployment(
            deployment_id,
            duration=duration,
            checks=["latency", "error_rate", "memory", "gpu"]
        )

    async def _rollback_deployment(self, deployment_id: str):
        """Rollback deployment"""
        from ..safety.rollback_manager import RollbackManager

        manager = RollbackManager()
        await manager.rollback(deployment_id)

    async def _complete_deployment(self, deployment_id: str):
        """Complete deployment to 100%"""
        await self.deployment_pipeline.complete_deployment(deployment_id)

    async def _cleanup_failed_pipeline(self, pipeline_id: str):
        """Cleanup after failed pipeline"""
        # Remove temporary models
        # Clean up experiments
        # Reset states
        pass

    def _log_pipeline_event(self, pipeline_id: str, status: PipelineStatus, data: Dict):
        """Log pipeline event"""
        event = {
            "pipeline_id": pipeline_id,
            "status": status.value,
            "timestamp": datetime.now().isoformat(),
            "data": data
        }
        # Log to database, monitoring system, etc.
        print(f"Pipeline Event: {json.dumps(event, indent=2)}")

    def _log_event(self, message: str, data: Dict):
        """Log general event"""
        wandb.log(data)
        mlflow.log_metrics(data)

    async def _count_new_annotations(self) -> int:
        """Count new annotations since last training"""
        # Implementation to count annotations
        return 5000  # Placeholder

    async def _get_reference_data(self) -> any:
        """Get reference data for drift detection"""
        # Implementation to get reference data
        return None
```

### Task 4.2: Data Pipeline Enhancement (2 hours)
```python
# data_pipeline.py
import numpy as np
from typing import Dict, List, Tuple, Optional
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import albumentations as A
from albumentations.pytorch import ToTensorV2
import torch
from torch.utils.data import Dataset, DataLoader

class DataPipeline:
    """Enhanced data preparation pipeline"""

    def __init__(self):
        self.augmentation = A.Compose([
            A.RandomRotate90(p=0.5),
            A.Flip(p=0.5),
            A.RandomBrightnessContrast(p=0.2),
            A.RandomGamma(p=0.2),
            A.GaussNoise(p=0.1),
            A.Blur(blur_limit=3, p=0.1),
            A.ColorJitter(p=0.2),
            A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ToTensorV2()
        ])

    async def prepare_dataset(
        self,
        min_samples: int = 1000,
        validation_split: float = 0.2,
        augmentation: bool = True,
        balance_classes: bool = True
    ) -> Dict:
        """
        Prepare complete dataset for training

        Returns:
            Dictionary with train, validation, and test datasets
        """
        # Load raw data
        raw_data = await self._load_raw_data()

        # Data quality checks
        clean_data = await self._quality_checks(raw_data)

        # Balance classes if needed
        if balance_classes:
            balanced_data = await self._balance_classes(clean_data)
        else:
            balanced_data = clean_data

        # Split data
        train_data, val_data, test_data = await self._split_data(
            balanced_data,
            validation_split
        )

        # Apply augmentation
        if augmentation:
            train_data = await self._apply_augmentation(train_data)

        # Create data loaders
        train_loader = self._create_dataloader(train_data, batch_size=32, shuffle=True)
        val_loader = self._create_dataloader(val_data, batch_size=32, shuffle=False)
        test_loader = self._create_dataloader(test_data, batch_size=32, shuffle=False)

        return {
            "success": True,
            "dataset": {
                "train": train_loader,
                "validation": val_loader,
                "test": test_loader,
                "num_classes": len(balanced_data["classes"]),
                "class_names": balanced_data["classes"],
                "total_samples": len(balanced_data["samples"])
            },
            "statistics": {
                "train_samples": len(train_data),
                "val_samples": len(val_data),
                "test_samples": len(test_data),
                "class_distribution": balanced_data["distribution"]
            }
        }

    async def _load_raw_data(self) -> Dict:
        """Load raw annotation data"""
        # Connect to annotation database
        # Load images and annotations
        # Return structured data
        pass

    async def _quality_checks(self, data: Dict) -> Dict:
        """Perform data quality checks"""
        # Check for corrupted images
        # Validate annotation formats
        # Remove duplicates
        # Fix inconsistencies
        return data

    async def _balance_classes(self, data: Dict) -> Dict:
        """Balance class distribution"""
        # Implement SMOTE or other balancing techniques
        # Ensure minimum samples per class
        return data

    async def _split_data(
        self,
        data: Dict,
        val_split: float
    ) -> Tuple[Dict, Dict, Dict]:
        """Split data into train/val/test"""
        # Stratified split
        # Ensure no data leakage
        return train, val, test

    async def _apply_augmentation(self, data: Dict) -> Dict:
        """Apply data augmentation"""
        # Apply augmentation pipeline
        # Generate synthetic samples
        return augmented_data

    def _create_dataloader(
        self,
        data: Dict,
        batch_size: int,
        shuffle: bool
    ) -> DataLoader:
        """Create PyTorch DataLoader"""
        dataset = LogoDataset(data, transform=self.augmentation if shuffle else None)
        return DataLoader(
            dataset,
            batch_size=batch_size,
            shuffle=shuffle,
            num_workers=4,
            pin_memory=True
        )

class LogoDataset(Dataset):
    """Custom dataset for logo detection"""

    def __init__(self, data: Dict, transform=None):
        self.data = data
        self.transform = transform

    def __len__(self):
        return len(self.data["samples"])

    def __getitem__(self, idx):
        sample = self.data["samples"][idx]
        image = sample["image"]
        target = sample["annotations"]

        if self.transform:
            augmented = self.transform(image=image, bboxes=target["boxes"], labels=target["labels"])
            image = augmented["image"]
            target["boxes"] = augmented["bboxes"]

        return image, target
```

---

## 📦 IMPLEMENTATION TASKS - Day 2: A/B Testing Framework

### Task 4.3: A/B Testing Implementation (4 hours)
```python
# ab_testing/experiment_manager.py
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import numpy as np
from scipy import stats
import redis
import json

class ExperimentManager:
    """A/B testing experiment manager"""

    def __init__(self):
        self.redis_client = redis.Redis(host='localhost', port=6379, decode_responses=True)
        self.experiments = {}

    async def create_experiment(
        self,
        name: str,
        control_model: str,
        treatment_model: str,
        traffic_split: Dict[str, int],
        duration: int,
        success_metrics: List[str],
        minimum_sample_size: int = 1000
    ) -> Dict:
        """Create new A/B test experiment"""
        experiment_id = str(uuid.uuid4())

        experiment = {
            "id": experiment_id,
            "name": name,
            "control_model": control_model,
            "treatment_model": treatment_model,
            "traffic_split": traffic_split,
            "start_time": datetime.now().isoformat(),
            "end_time": (datetime.now() + timedelta(seconds=duration)).isoformat(),
            "success_metrics": success_metrics,
            "minimum_sample_size": minimum_sample_size,
            "status": "running",
            "metrics": {
                "control": {metric: [] for metric in success_metrics},
                "treatment": {metric: [] for metric in success_metrics}
            }
        }

        # Store in Redis
        self.redis_client.set(
            f"experiment:{experiment_id}",
            json.dumps(experiment),
            ex=duration + 3600  # Expire 1 hour after experiment ends
        )

        return experiment

    async def assign_variant(self, experiment_id: str, user_id: str) -> str:
        """Assign user to experiment variant"""
        # Check if user already assigned
        cached_assignment = self.redis_client.get(f"assignment:{experiment_id}:{user_id}")
        if cached_assignment:
            return cached_assignment

        # Get experiment
        experiment = json.loads(self.redis_client.get(f"experiment:{experiment_id}"))

        # Random assignment based on traffic split
        rand_val = np.random.random() * 100
        cumulative = 0

        for variant, percentage in experiment["traffic_split"].items():
            cumulative += percentage
            if rand_val <= cumulative:
                # Cache assignment
                self.redis_client.set(
                    f"assignment:{experiment_id}:{user_id}",
                    variant,
                    ex=86400  # 24 hour TTL
                )
                return variant

        return "control"  # Default fallback

    async def track_metric(
        self,
        experiment_id: str,
        variant: str,
        metric_name: str,
        value: float
    ):
        """Track metric for experiment"""
        # Add to time series
        key = f"metrics:{experiment_id}:{variant}:{metric_name}"
        self.redis_client.zadd(
            key,
            {json.dumps({"value": value, "timestamp": datetime.now().isoformat()}): datetime.now().timestamp()}
        )

        # Update aggregate stats
        stats_key = f"stats:{experiment_id}:{variant}:{metric_name}"
        current_stats = self.redis_client.get(stats_key)

        if current_stats:
            stats = json.loads(current_stats)
            stats["count"] += 1
            stats["sum"] += value
            stats["sum_squares"] += value ** 2
            stats["mean"] = stats["sum"] / stats["count"]
            stats["variance"] = (stats["sum_squares"] / stats["count"]) - (stats["mean"] ** 2)
        else:
            stats = {
                "count": 1,
                "sum": value,
                "sum_squares": value ** 2,
                "mean": value,
                "variance": 0
            }

        self.redis_client.set(stats_key, json.dumps(stats))

    async def get_results(self, experiment_id: str) -> Dict:
        """Get experiment results"""
        experiment = json.loads(self.redis_client.get(f"experiment:{experiment_id}"))

        results = {
            "experiment_id": experiment_id,
            "name": experiment["name"],
            "status": experiment["status"],
            "variants": {}
        }

        for variant in ["control", "treatment"]:
            variant_stats = {}
            for metric in experiment["success_metrics"]:
                stats_key = f"stats:{experiment_id}:{variant}:{metric}"
                stats = self.redis_client.get(stats_key)
                if stats:
                    variant_stats[metric] = json.loads(stats)
                else:
                    variant_stats[metric] = {"count": 0, "mean": 0, "variance": 0}
            results["variants"][variant] = variant_stats

        # Calculate statistical significance
        results["significance"] = await self._calculate_significance(results["variants"])

        return results

    async def _calculate_significance(self, variants: Dict) -> Dict:
        """Calculate statistical significance between variants"""
        significance = {}

        for metric in variants["control"].keys():
            control_stats = variants["control"][metric]
            treatment_stats = variants["treatment"][metric]

            if control_stats["count"] < 30 or treatment_stats["count"] < 30:
                significance[metric] = {
                    "p_value": None,
                    "confidence": None,
                    "significant": False,
                    "reason": "Insufficient sample size"
                }
                continue

            # Perform t-test
            t_stat, p_value = stats.ttest_ind_from_stats(
                mean1=control_stats["mean"],
                std1=np.sqrt(control_stats["variance"]),
                nobs1=control_stats["count"],
                mean2=treatment_stats["mean"],
                std2=np.sqrt(treatment_stats["variance"]),
                nobs2=treatment_stats["count"]
            )

            significance[metric] = {
                "p_value": p_value,
                "confidence": 1 - p_value,
                "significant": p_value < 0.05,
                "lift": (treatment_stats["mean"] - control_stats["mean"]) / control_stats["mean"] * 100
            }

        return significance

    async def determine_winner(
        self,
        experiment_id: str,
        min_sample_size: int = 1000,
        confidence_level: float = 0.95
    ) -> str:
        """Determine experiment winner"""
        results = await self.get_results(experiment_id)

        # Check minimum sample size
        for variant in results["variants"].values():
            for metric_stats in variant.values():
                if metric_stats["count"] < min_sample_size:
                    return "insufficient_data"

        # Check statistical significance
        treatment_wins = 0
        control_wins = 0

        for metric, sig_data in results["significance"].items():
            if sig_data["significant"]:
                if sig_data["lift"] > 0:
                    treatment_wins += 1
                else:
                    control_wins += 1

        if treatment_wins > control_wins:
            return "treatment"
        elif control_wins > treatment_wins:
            return "control"
        else:
            return "no_winner"

# ab_testing/traffic_splitter.py
class TrafficSplitter:
    """Route traffic between model variants"""

    def __init__(self, experiment_manager: ExperimentManager):
        self.experiment_manager = experiment_manager

    async def route_request(
        self,
        request_id: str,
        user_id: str,
        active_experiments: List[str]
    ) -> str:
        """Route request to appropriate model variant"""
        # Check active experiments
        for experiment_id in active_experiments:
            variant = await self.experiment_manager.assign_variant(
                experiment_id,
                user_id
            )

            if variant == "treatment":
                # Route to new model
                return f"model_treatment_{experiment_id}"

        # Default to control/production model
        return "model_production"

    async def track_response(
        self,
        request_id: str,
        model_id: str,
        latency: float,
        success: bool
    ):
        """Track response metrics"""
        # Extract experiment ID from model_id
        if "treatment" in model_id:
            experiment_id = model_id.split("_")[-1]
            await self.experiment_manager.track_metric(
                experiment_id,
                "treatment",
                "latency",
                latency
            )
            await self.experiment_manager.track_metric(
                experiment_id,
                "treatment",
                "success_rate",
                1.0 if success else 0.0
            )
```

### Task 4.4: Drift Detection (2 hours)
```python
# monitoring/drift_detector.py
import numpy as np
from scipy import stats
from typing import Dict, List, Optional
import pandas as pd
from sklearn.preprocessing import StandardScaler

class DriftDetector:
    """Detect data and concept drift"""

    def __init__(self, sensitivity: float = 0.3):
        self.sensitivity = sensitivity
        self.reference_statistics = None

    def calculate_drift(
        self,
        reference_data: np.ndarray,
        current_data: np.ndarray,
        method: str = "ks"
    ) -> float:
        """
        Calculate drift score between reference and current data

        Args:
            reference_data: Reference dataset
            current_data: Current dataset
            method: Drift detection method (ks, wasserstein, psi)

        Returns:
            Drift score (0-1, higher means more drift)
        """
        if method == "ks":
            return self._kolmogorov_smirnov_test(reference_data, current_data)
        elif method == "wasserstein":
            return self._wasserstein_distance(reference_data, current_data)
        elif method == "psi":
            return self._population_stability_index(reference_data, current_data)
        else:
            raise ValueError(f"Unknown drift detection method: {method}")

    def _kolmogorov_smirnov_test(
        self,
        reference: np.ndarray,
        current: np.ndarray
    ) -> float:
        """Kolmogorov-Smirnov test for distribution shift"""
        if len(reference.shape) > 1:
            # For multi-dimensional data, average across features
            drift_scores = []
            for i in range(reference.shape[1]):
                statistic, p_value = stats.ks_2samp(
                    reference[:, i],
                    current[:, i]
                )
                drift_scores.append(statistic)
            return np.mean(drift_scores)
        else:
            statistic, p_value = stats.ks_2samp(reference, current)
            return statistic

    def _wasserstein_distance(
        self,
        reference: np.ndarray,
        current: np.ndarray
    ) -> float:
        """Wasserstein distance for distribution shift"""
        from scipy.stats import wasserstein_distance

        if len(reference.shape) > 1:
            distances = []
            for i in range(reference.shape[1]):
                dist = wasserstein_distance(reference[:, i], current[:, i])
                distances.append(dist)
            return np.mean(distances) / (np.max(distances) + 1e-8)  # Normalize
        else:
            dist = wasserstein_distance(reference, current)
            return dist / (np.max([reference.max(), current.max()]) + 1e-8)

    def _population_stability_index(
        self,
        reference: np.ndarray,
        current: np.ndarray,
        buckets: int = 10
    ) -> float:
        """Population Stability Index for distribution shift"""
        def calculate_psi(expected, actual, buckets):
            # Create bins
            breakpoints = np.arange(0, buckets + 1) / buckets
            expected_percents = np.histogram(expected, bins=breakpoints)[0] / len(expected)
            actual_percents = np.histogram(actual, bins=breakpoints)[0] / len(actual)

            # Calculate PSI
            psi_values = []
            for i in range(buckets):
                if expected_percents[i] == 0:
                    expected_percents[i] = 0.001
                if actual_percents[i] == 0:
                    actual_percents[i] = 0.001

                psi_values.append(
                    (actual_percents[i] - expected_percents[i]) *
                    np.log(actual_percents[i] / expected_percents[i])
                )

            return sum(psi_values)

        if len(reference.shape) > 1:
            psi_scores = []
            for i in range(reference.shape[1]):
                psi = calculate_psi(reference[:, i], current[:, i], buckets)
                psi_scores.append(psi)
            return np.mean(psi_scores)
        else:
            return calculate_psi(reference, current, buckets)

    def detect_feature_drift(
        self,
        reference_data: pd.DataFrame,
        current_data: pd.DataFrame,
        features: List[str]
    ) -> Dict[str, float]:
        """Detect drift for individual features"""
        drift_scores = {}

        for feature in features:
            if feature in reference_data.columns and feature in current_data.columns:
                ref_values = reference_data[feature].values
                curr_values = current_data[feature].values

                # Handle categorical features
                if reference_data[feature].dtype == 'object':
                    # Chi-square test for categorical
                    ref_counts = reference_data[feature].value_counts()
                    curr_counts = current_data[feature].value_counts()

                    # Align categories
                    all_categories = set(ref_counts.index) | set(curr_counts.index)
                    ref_aligned = [ref_counts.get(cat, 0) for cat in all_categories]
                    curr_aligned = [curr_counts.get(cat, 0) for cat in all_categories]

                    chi2, p_value = stats.chi2_contingency([ref_aligned, curr_aligned])[:2]
                    drift_scores[feature] = 1 - p_value
                else:
                    # KS test for numerical
                    drift_scores[feature] = self._kolmogorov_smirnov_test(
                        ref_values,
                        curr_values
                    )

        return drift_scores

    def detect_concept_drift(
        self,
        reference_predictions: np.ndarray,
        reference_labels: np.ndarray,
        current_predictions: np.ndarray,
        current_labels: np.ndarray
    ) -> float:
        """Detect concept drift (relationship between features and target)"""
        # Calculate prediction errors
        ref_errors = np.abs(reference_predictions - reference_labels)
        curr_errors = np.abs(current_predictions - current_labels)

        # Compare error distributions
        drift_score = self._kolmogorov_smirnov_test(ref_errors, curr_errors)

        return drift_score

# monitoring/performance_monitor.py
class PerformanceMonitor:
    """Monitor model performance in production"""

    def __init__(self):
        self.metrics_buffer = []
        self.alert_thresholds = {
            "latency_p95": 100,  # ms
            "error_rate": 0.01,   # 1%
            "memory_usage": 4096,  # MB
            "gpu_utilization": 90  # %
        }

    async def track_inference(
        self,
        model_id: str,
        latency: float,
        success: bool,
        memory_usage: float,
        gpu_usage: float
    ):
        """Track single inference"""
        metric = {
            "model_id": model_id,
            "timestamp": datetime.now().isoformat(),
            "latency": latency,
            "success": success,
            "memory_usage": memory_usage,
            "gpu_usage": gpu_usage
        }

        self.metrics_buffer.append(metric)

        # Check for alerts
        await self._check_alerts(metric)

        # Flush buffer if needed
        if len(self.metrics_buffer) >= 100:
            await self._flush_metrics()

    async def _check_alerts(self, metric: Dict):
        """Check if metrics exceed thresholds"""
        alerts = []

        if metric["latency"] > self.alert_thresholds["latency_p95"]:
            alerts.append({
                "type": "HIGH_LATENCY",
                "value": metric["latency"],
                "threshold": self.alert_thresholds["latency_p95"]
            })

        if not metric["success"]:
            # Calculate error rate
            recent_metrics = self.metrics_buffer[-100:]
            error_rate = sum(1 for m in recent_metrics if not m["success"]) / len(recent_metrics)

            if error_rate > self.alert_thresholds["error_rate"]:
                alerts.append({
                    "type": "HIGH_ERROR_RATE",
                    "value": error_rate,
                    "threshold": self.alert_thresholds["error_rate"]
                })

        if alerts:
            await self._send_alerts(alerts)

    async def _send_alerts(self, alerts: List[Dict]):
        """Send alerts to notification system"""
        # Implementation for sending alerts (Slack, email, etc.)
        pass

    async def _flush_metrics(self):
        """Flush metrics to storage"""
        # Store metrics in time-series database
        self.metrics_buffer = []
```

---

## 📦 IMPLEMENTATION TASKS - Day 3: Integration & Automation

### Task 4.5: Auto-deployment System (3 hours)
```python
# automation/deployment_manager.py
from typing import Dict, Optional
import asyncio
from datetime import datetime

class DeploymentManager:
    """Manage model deployments"""

    def __init__(self):
        self.deployments = {}
        self.health_checker = HealthChecker()

    async def deploy_model(
        self,
        model_id: str,
        strategy: str = "blue_green",
        config: Optional[Dict] = None
    ) -> Dict:
        """Deploy model with specified strategy"""
        deployment_id = f"deploy_{model_id}_{datetime.now().timestamp()}"

        if strategy == "blue_green":
            result = await self._blue_green_deployment(model_id, config)
        elif strategy == "canary":
            result = await self._canary_deployment(model_id, config)
        elif strategy == "rolling":
            result = await self._rolling_deployment(model_id, config)
        else:
            raise ValueError(f"Unknown deployment strategy: {strategy}")

        self.deployments[deployment_id] = {
            "model_id": model_id,
            "strategy": strategy,
            "status": "in_progress",
            "started_at": datetime.now(),
            "result": result
        }

        return {"deployment_id": deployment_id, **result}

    async def _blue_green_deployment(
        self,
        model_id: str,
        config: Dict
    ) -> Dict:
        """Blue-Green deployment strategy"""
        # 1. Deploy to green environment
        green_endpoint = await self._deploy_to_environment("green", model_id)

        # 2. Run health checks
        health_status = await self.health_checker.check_endpoint(green_endpoint)

        if not health_status["healthy"]:
            await self._cleanup_environment("green")
            raise Exception(f"Health check failed: {health_status['issues']}")

        # 3. Run smoke tests
        smoke_test_result = await self._run_smoke_tests(green_endpoint)

        if not smoke_test_result["passed"]:
            await self._cleanup_environment("green")
            raise Exception(f"Smoke tests failed: {smoke_test_result['failures']}")

        # 4. Switch traffic
        await self._switch_traffic("blue", "green")

        # 5. Monitor for issues
        monitoring_result = await self._monitor_deployment(
            green_endpoint,
            duration=300  # 5 minutes
        )

        if monitoring_result["issues"]:
            # Rollback
            await self._switch_traffic("green", "blue")
            raise Exception(f"Deployment issues detected: {monitoring_result['issues']}")

        # 6. Cleanup old blue environment
        await asyncio.sleep(3600)  # Wait 1 hour before cleanup
        await self._cleanup_environment("blue")

        return {
            "status": "success",
            "endpoint": green_endpoint,
            "deployment_time": datetime.now().isoformat()
        }

    async def _canary_deployment(
        self,
        model_id: str,
        config: Dict
    ) -> Dict:
        """Canary deployment strategy"""
        initial_percentage = config.get("initial_percentage", 10)
        increment = config.get("increment", 20)
        wait_time = config.get("wait_time", 600)  # 10 minutes

        # Deploy canary
        canary_endpoint = await self._deploy_to_environment("canary", model_id)

        current_percentage = initial_percentage

        while current_percentage < 100:
            # Route traffic percentage
            await self._set_traffic_percentage("canary", current_percentage)

            # Monitor
            await asyncio.sleep(wait_time)

            # Check metrics
            metrics = await self._get_canary_metrics()

            if not self._canary_healthy(metrics):
                # Rollback
                await self._set_traffic_percentage("canary", 0)
                await self._cleanup_environment("canary")
                raise Exception(f"Canary unhealthy at {current_percentage}%")

            # Increase traffic
            current_percentage = min(100, current_percentage + increment)

        # Full deployment
        await self._promote_canary_to_production()

        return {
            "status": "success",
            "endpoint": canary_endpoint,
            "deployment_time": datetime.now().isoformat()
        }

    async def _rolling_deployment(
        self,
        model_id: str,
        config: Dict
    ) -> Dict:
        """Rolling deployment strategy"""
        instances = config.get("instances", 4)
        batch_size = config.get("batch_size", 1)

        deployed_instances = []

        for i in range(0, instances, batch_size):
            batch = list(range(i, min(i + batch_size, instances)))

            # Deploy batch
            for instance_id in batch:
                endpoint = await self._deploy_instance(model_id, instance_id)
                deployed_instances.append(endpoint)

            # Health check batch
            for endpoint in deployed_instances[-len(batch):]:
                health = await self.health_checker.check_endpoint(endpoint)
                if not health["healthy"]:
                    # Rollback all
                    await self._rollback_instances(deployed_instances)
                    raise Exception(f"Instance unhealthy: {endpoint}")

            # Wait before next batch
            if i + batch_size < instances:
                await asyncio.sleep(60)

        return {
            "status": "success",
            "endpoints": deployed_instances,
            "deployment_time": datetime.now().isoformat()
        }

    def _canary_healthy(self, metrics: Dict) -> bool:
        """Check if canary metrics are healthy"""
        # Compare with baseline
        if metrics["error_rate"] > 0.01:
            return False
        if metrics["latency_p95"] > 100:
            return False
        if metrics["success_rate"] < 0.99:
            return False
        return True

    async def _deploy_to_environment(self, env: str, model_id: str) -> str:
        """Deploy model to specific environment"""
        # Implementation for deploying to environment
        return f"http://model-{env}.service.local"

    async def _switch_traffic(self, from_env: str, to_env: str):
        """Switch traffic between environments"""
        # Update load balancer configuration
        pass

    async def _set_traffic_percentage(self, env: str, percentage: int):
        """Set traffic percentage for environment"""
        # Update traffic routing rules
        pass

# safety/health_checker.py
class HealthChecker:
    """Model health checking"""

    async def check_endpoint(self, endpoint: str) -> Dict:
        """Check endpoint health"""
        checks = {
            "reachable": await self._check_reachability(endpoint),
            "latency": await self._check_latency(endpoint),
            "accuracy": await self._check_accuracy(endpoint),
            "memory": await self._check_memory(endpoint),
            "gpu": await self._check_gpu(endpoint)
        }

        issues = [check for check, status in checks.items() if not status]

        return {
            "healthy": len(issues) == 0,
            "checks": checks,
            "issues": issues
        }

    async def _check_reachability(self, endpoint: str) -> bool:
        """Check if endpoint is reachable"""
        import aiohttp
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{endpoint}/health") as response:
                    return response.status == 200
        except:
            return False

    async def _check_latency(self, endpoint: str) -> bool:
        """Check endpoint latency"""
        import aiohttp
        import time

        latencies = []

        for _ in range(10):
            start = time.time()
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        f"{endpoint}/predict",
                        json={"image": "test_image_base64"}
                    ) as response:
                        if response.status == 200:
                            latencies.append((time.time() - start) * 1000)
            except:
                pass

        if latencies:
            p95_latency = np.percentile(latencies, 95)
            return p95_latency < 100  # Under 100ms
        return False

    async def _check_accuracy(self, endpoint: str) -> bool:
        """Check model accuracy with test samples"""
        # Send test images with known labels
        # Compare predictions
        return True  # Placeholder

    async def _check_memory(self, endpoint: str) -> bool:
        """Check memory usage"""
        # Query metrics endpoint
        return True  # Placeholder

    async def _check_gpu(self, endpoint: str) -> bool:
        """Check GPU utilization"""
        # Query GPU metrics
        return True  # Placeholder

    async def monitor_deployment(
        self,
        deployment_id: str,
        duration: int,
        checks: List[str]
    ) -> Dict:
        """Monitor deployment for specified duration"""
        start_time = datetime.now()
        issues_detected = []

        while (datetime.now() - start_time).total_seconds() < duration:
            for check in checks:
                if check == "latency":
                    # Monitor latency
                    pass
                elif check == "error_rate":
                    # Monitor errors
                    pass
                elif check == "memory":
                    # Monitor memory
                    pass
                elif check == "gpu":
                    # Monitor GPU
                    pass

            await asyncio.sleep(10)  # Check every 10 seconds

        return {
            "healthy": len(issues_detected) == 0,
            "issues": issues_detected,
            "monitoring_duration": duration
        }
```

---

## 📦 IMPLEMENTATION TASKS - Day 4: Testing & Integration

### Task 4.6: Comprehensive Testing (4 hours)
```python
# tests/test_training_pipeline.py
import pytest
import asyncio
from unittest.mock import Mock, patch, AsyncMock
import numpy as np

from ..pipeline.orchestrator import TrainingPipelineOrchestrator, PipelineConfig
from ..ab_testing.experiment_manager import ExperimentManager
from ..monitoring.drift_detector import DriftDetector

@pytest.fixture
def pipeline_config():
    """Test pipeline configuration"""
    return PipelineConfig(
        auto_deploy_threshold=0.85,
        min_training_samples=100,
        max_training_time=300,
        enable_ab_testing=True,
        ab_test_duration=60,
        enable_drift_detection=True
    )

@pytest.fixture
def mock_db_session():
    """Mock database session"""
    return Mock()

@pytest.fixture
def orchestrator(pipeline_config, mock_db_session):
    """Create orchestrator instance"""
    return TrainingPipelineOrchestrator(pipeline_config, mock_db_session)

class TestPipelineOrchestrator:
    """Test pipeline orchestrator"""

    @pytest.mark.asyncio
    async def test_successful_pipeline_run(self, orchestrator):
        """Test successful pipeline execution"""
        with patch.object(orchestrator, '_should_train', return_value=True):
            with patch.object(orchestrator, '_prepare_data', return_value={
                "success": True,
                "dataset": {"train": Mock(), "test": Mock()},
                "test_dataset": Mock()
            }):
                with patch.object(orchestrator, '_train_model', return_value={
                    "success": True,
                    "model_id": "test-model-123",
                    "model": Mock()
                }):
                    with patch.object(orchestrator, '_evaluate_model', return_value={
                        "metrics": {
                            "accuracy": 0.92,
                            "precision": 0.90,
                            "recall": 0.91,
                            "f1": 0.905,
                            "latency": 45
                        }
                    }):
                        with patch.object(orchestrator, '_should_deploy', return_value=(True, "Criteria met")):
                            with patch.object(orchestrator, '_deploy_with_ab_test', return_value={
                                "deployment_id": "deploy-123"
                            }):
                                with patch.object(orchestrator, '_monitor_deployment', return_value={
                                    "healthy": True
                                }):
                                    result = await orchestrator.run_pipeline(trigger="manual")

                                    assert result["status"] == "completed"
                                    assert result["deployed"] == True
                                    assert result["model_id"] == "test-model-123"
                                    assert result["metrics"]["accuracy"] == 0.92

    @pytest.mark.asyncio
    async def test_pipeline_rollback_on_failure(self, orchestrator):
        """Test pipeline rollback on deployment failure"""
        with patch.object(orchestrator, '_should_train', return_value=True):
            # ... setup other mocks ...
            with patch.object(orchestrator, '_monitor_deployment', return_value={
                "healthy": False,
                "issues": ["High error rate"]
            }):
                with patch.object(orchestrator, '_rollback_deployment') as mock_rollback:
                    result = await orchestrator.run_pipeline()

                    mock_rollback.assert_called_once()
                    assert result["status"] == "completed"

    @pytest.mark.asyncio
    async def test_drift_detection(self, orchestrator):
        """Test drift detection triggers retraining"""
        with patch.object(orchestrator, '_check_drift', return_value=0.5):  # High drift
            with patch.object(orchestrator, '_should_train', return_value=True):
                # ... rest of pipeline mocks ...

                result = await orchestrator.run_pipeline(trigger="drift")
                assert result["status"] == "completed"

class TestABTesting:
    """Test A/B testing framework"""

    @pytest.fixture
    def experiment_manager(self):
        return ExperimentManager()

    @pytest.mark.asyncio
    async def test_experiment_creation(self, experiment_manager):
        """Test creating A/B test experiment"""
        experiment = await experiment_manager.create_experiment(
            name="test-experiment",
            control_model="model-v1",
            treatment_model="model-v2",
            traffic_split={"control": 50, "treatment": 50},
            duration=3600,
            success_metrics=["accuracy", "latency"]
        )

        assert experiment["name"] == "test-experiment"
        assert experiment["traffic_split"]["control"] == 50
        assert experiment["traffic_split"]["treatment"] == 50

    @pytest.mark.asyncio
    async def test_variant_assignment(self, experiment_manager):
        """Test user variant assignment"""
        experiment = await experiment_manager.create_experiment(
            name="test",
            control_model="v1",
            treatment_model="v2",
            traffic_split={"control": 50, "treatment": 50},
            duration=3600,
            success_metrics=["accuracy"]
        )

        assignments = {"control": 0, "treatment": 0}

        # Test 1000 assignments
        for i in range(1000):
            variant = await experiment_manager.assign_variant(
                experiment["id"],
                f"user-{i}"
            )
            assignments[variant] += 1

        # Check distribution is roughly 50/50 (with some tolerance)
        assert abs(assignments["control"] - 500) < 100
        assert abs(assignments["treatment"] - 500) < 100

    @pytest.mark.asyncio
    async def test_significance_calculation(self, experiment_manager):
        """Test statistical significance calculation"""
        # Create experiment
        experiment = await experiment_manager.create_experiment(
            name="test",
            control_model="v1",
            treatment_model="v2",
            traffic_split={"control": 50, "treatment": 50},
            duration=3600,
            success_metrics=["conversion"]
        )

        # Simulate metrics
        for _ in range(1000):
            await experiment_manager.track_metric(
                experiment["id"],
                "control",
                "conversion",
                np.random.binomial(1, 0.10)  # 10% conversion
            )
            await experiment_manager.track_metric(
                experiment["id"],
                "treatment",
                "conversion",
                np.random.binomial(1, 0.15)  # 15% conversion
            )

        # Get results
        results = await experiment_manager.get_results(experiment["id"])

        # Check significance
        assert results["significance"]["conversion"]["significant"] == True
        assert results["significance"]["conversion"]["lift"] > 40  # ~50% lift

class TestDriftDetection:
    """Test drift detection"""

    @pytest.fixture
    def drift_detector(self):
        return DriftDetector()

    def test_kolmogorov_smirnov_no_drift(self, drift_detector):
        """Test KS test with no drift"""
        # Same distribution
        reference = np.random.normal(0, 1, 1000)
        current = np.random.normal(0, 1, 1000)

        drift_score = drift_detector.calculate_drift(reference, current, method="ks")
        assert drift_score < 0.1  # Low drift score

    def test_kolmogorov_smirnov_with_drift(self, drift_detector):
        """Test KS test with drift"""
        # Different distributions
        reference = np.random.normal(0, 1, 1000)
        current = np.random.normal(2, 1, 1000)  # Shifted mean

        drift_score = drift_detector.calculate_drift(reference, current, method="ks")
        assert drift_score > 0.5  # High drift score

    def test_psi_calculation(self, drift_detector):
        """Test PSI calculation"""
        reference = np.random.uniform(0, 1, 1000)
        current = np.random.uniform(0, 1, 1000)

        psi_score = drift_detector.calculate_drift(reference, current, method="psi")
        assert psi_score < 0.1  # Low PSI indicates no significant drift

class TestIntegration:
    """Integration tests"""

    @pytest.mark.asyncio
    async def test_end_to_end_pipeline(self):
        """Test complete pipeline end-to-end"""
        config = PipelineConfig(
            auto_deploy_threshold=0.80,
            enable_ab_testing=False,  # Simplify for integration test
            enable_drift_detection=True
        )

        # Create real orchestrator with test database
        orchestrator = TrainingPipelineOrchestrator(config, Mock())

        # Mock external dependencies
        with patch('mlflow.start_run'):
            with patch('wandb.init'):
                with patch.object(orchestrator, '_count_new_annotations', return_value=2000):
                    with patch.object(orchestrator, '_prepare_data', return_value={
                        "success": True,
                        "dataset": create_mock_dataset()
                    }):
                        # ... continue with mocks ...

                        result = await orchestrator.run_pipeline()
                        assert result["status"] in ["completed", "skipped"]

def create_mock_dataset():
    """Create mock dataset for testing"""
    return {
        "train": Mock(),
        "validation": Mock(),
        "test": Mock(),
        "num_classes": 10,
        "class_names": [f"class_{i}" for i in range(10)],
        "total_samples": 2000
    }

# Performance tests
@pytest.mark.performance
class TestPerformance:
    """Performance tests"""

    @pytest.mark.asyncio
    async def test_pipeline_performance(self, orchestrator):
        """Test pipeline completes within time limit"""
        import time

        start = time.time()

        # Run pipeline with mocked components
        with patch.object(orchestrator, '_should_train', return_value=True):
            # Mock all heavy operations
            with patch.object(orchestrator, '_prepare_data', return_value={
                "success": True,
                "dataset": Mock()
            }):
                with patch.object(orchestrator, '_train_model', return_value={
                    "success": True,
                    "model_id": "test",
                    "model": Mock()
                }):
                    # Add small delay to simulate work
                    await asyncio.sleep(0.1)

                    result = await orchestrator.run_pipeline()

        duration = time.time() - start
        assert duration < 5  # Pipeline overhead should be minimal

    def test_drift_detection_performance(self, drift_detector):
        """Test drift detection performance"""
        import time

        # Large datasets
        reference = np.random.normal(0, 1, 100000)
        current = np.random.normal(0, 1, 100000)

        start = time.time()
        drift_score = drift_detector.calculate_drift(reference, current)
        duration = time.time() - start

        assert duration < 1  # Should complete in under 1 second
```

---

## 🧪 ACCEPTANCE CRITERIA

### Functional Requirements ✅
- [ ] Automatic retraining triggers on data drift
- [ ] A/B testing for new model versions
- [ ] Automatic rollback on performance degradation
- [ ] Zero-downtime model deployment
- [ ] MLflow experiment tracking
- [ ] Hyperparameter optimization with Optuna
- [ ] Support for blue-green, canary, and rolling deployments
- [ ] Real-time performance monitoring

### Performance Requirements ✅
- [ ] Pipeline completion <2 hours
- [ ] Model deployment <5 minutes
- [ ] Rollback <30 seconds
- [ ] A/B test decision <1 hour
- [ ] Drift detection <10 seconds

### Quality Requirements ✅
- [ ] 100% test coverage for critical paths
- [ ] Automated integration tests
- [ ] Performance benchmarks passing
- [ ] Documentation complete

---

## 📊 TEST SCENARIOS

### Unit Tests (100% coverage required)
```bash
# Run all tests
pytest tests/ --cov=training --cov-report=term-missing

# Test files required:
- test_orchestrator.py
- test_data_pipeline.py
- test_ab_testing.py
- test_drift_detection.py
- test_deployment.py
- test_monitoring.py
```

### Integration Tests
```python
# End-to-end pipeline test
async def test_complete_pipeline():
    # 1. Trigger pipeline with new data
    # 2. Verify data preparation
    # 3. Confirm model training
    # 4. Check evaluation metrics
    # 5. Verify A/B test setup
    # 6. Confirm deployment
    # 7. Check monitoring active
```

### Load Tests
```python
# Test pipeline under load
async def test_concurrent_pipelines():
    # Run multiple pipelines concurrently
    # Verify resource management
    # Check for race conditions
```

---

## 🚀 DEPLOYMENT CHECKLIST

### Infrastructure
- [ ] Celery workers configured
- [ ] Redis cluster operational
- [ ] MLflow server running
- [ ] Kubernetes operators ready
- [ ] Monitoring stack deployed

### Configuration
- [ ] Environment variables set
- [ ] Secrets management configured
- [ ] Database migrations complete
- [ ] Model registry initialized

### Automation
- [ ] Cron jobs for scheduled training
- [ ] Drift detection alerts configured
- [ ] Rollback procedures tested
- [ ] Backup strategies implemented

---

## ✅ SUCCESS METRICS

By Day 4 completion:
1. ✅ Full pipeline operational
2. ✅ A/B testing framework working
3. ✅ Drift detection active
4. ✅ Auto-deployment functional
5. ✅ 100% test coverage
6. ✅ Performance targets met
7. ✅ Production ready

**This specification provides everything needed for A++ grade implementation!**