"""Enhanced Model Versioning with MLflow Integration."""
import json
import os
import time
import random
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import asyncio

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

try:
    import mlflow
    from mlflow.tracking import MlflowClient
    MLFLOW_AVAILABLE = True
except ImportError:
    MLFLOW_AVAILABLE = False
    print("MLflow not installed. Install with: pip install mlflow")

from app.models.training import ModelRegistry
from app.storage.minio_client import MinIOClient
from .versioning import ModelVersionManager


class EnhancedModelVersionManager(ModelVersionManager):
    """Enhanced model versioning with MLflow and A/B testing."""

    def __init__(self, base_path: str = "/models", mlflow_uri: str = None):
        """Initialize enhanced version manager."""
        super().__init__(base_path)

        if MLFLOW_AVAILABLE and mlflow_uri:
            mlflow.set_tracking_uri(mlflow_uri or "http://localhost:5000")
            self.mlflow_client = MlflowClient()
        else:
            self.mlflow_client = None

        self.ab_tests: Dict[str, Dict] = {}
        self.model_cache: Dict[str, Any] = {}

    async def register_model_with_mlflow(
        self,
        job_id: str,
        model_path: str,
        onnx_path: Optional[str],
        metrics: Dict[str, Any],
        metadata: Dict[str, Any],
        db: AsyncSession
    ) -> ModelRegistry:
        """Register model with MLflow tracking."""

        # Generate version
        version = await self._generate_version(db)

        # Register with parent class
        model_entry = await super().register_model(
            job_id, model_path, onnx_path, metrics, metadata, db
        )

        # Register with MLflow if available
        if MLFLOW_AVAILABLE and self.mlflow_client:
            try:
                with mlflow.start_run(run_name=f"training_{job_id}"):
                    # Log metrics
                    for key, value in metrics.items():
                        if isinstance(value, (int, float)):
                            mlflow.log_metric(key, value)

                    # Log parameters
                    mlflow.log_params({
                        "job_id": job_id,
                        "version": version,
                        "timestamp": datetime.utcnow().isoformat(),
                        **{k: str(v) for k, v in metadata.items() if isinstance(v, (str, int, float))}
                    })

                    # Log model
                    if os.path.exists(model_path):
                        mlflow.log_artifact(model_path, "model")

                    if onnx_path and os.path.exists(onnx_path):
                        mlflow.log_artifact(onnx_path, "onnx")

                    # Register model version
                    model_uri = f"runs:/{mlflow.active_run().info.run_id}/model"
                    mlflow.register_model(model_uri, f"logo_detector")

                    print(f"✅ Model {version} registered with MLflow")
            except Exception as e:
                print(f"Warning: MLflow registration failed: {e}")

        return model_entry

    async def setup_ab_testing(
        self,
        experiment_name: str,
        version_a: str,
        version_b: str,
        db: AsyncSession,
        traffic_split: float = 0.5
    ) -> Dict[str, Any]:
        """Setup A/B testing between two model versions."""

        # Verify both versions exist
        model_a = await self.get_model_by_version(version_a, db)
        model_b = await self.get_model_by_version(version_b, db)

        if not model_a or not model_b:
            raise ValueError(f"One or both model versions not found")

        experiment_id = f"ab_{experiment_name}_{int(time.time())}"

        self.ab_tests[experiment_id] = {
            "experiment_id": experiment_id,
            "name": experiment_name,
            "version_a": version_a,
            "version_b": version_b,
            "traffic_split": traffic_split,
            "created_at": datetime.utcnow().isoformat(),
            "metrics_a": {"requests": 0, "successes": 0, "failures": 0, "latency": []},
            "metrics_b": {"requests": 0, "successes": 0, "failures": 0, "latency": []},
            "active": True
        }

        return self.ab_tests[experiment_id]

    def route_request(self, experiment_id: str) -> Tuple[str, str]:
        """Route request to appropriate model version in A/B test."""

        if experiment_id not in self.ab_tests:
            raise ValueError(f"Experiment {experiment_id} not found")

        experiment = self.ab_tests[experiment_id]

        if not experiment["active"]:
            raise ValueError(f"Experiment {experiment_id} is not active")

        # Route based on traffic split
        if random.random() < experiment["traffic_split"]:
            version = experiment["version_a"]
            group = "a"
        else:
            version = experiment["version_b"]
            group = "b"

        # Track request
        experiment[f"metrics_{group}"]["requests"] += 1

        return version, group

    def record_result(
        self,
        experiment_id: str,
        group: str,
        success: bool,
        latency_ms: float
    ):
        """Record result from A/B test."""

        if experiment_id not in self.ab_tests:
            return

        experiment = self.ab_tests[experiment_id]
        metrics = experiment[f"metrics_{group}"]

        if success:
            metrics["successes"] += 1
        else:
            metrics["failures"] += 1

        metrics["latency"].append(latency_ms)

    def get_ab_test_results(self, experiment_id: str) -> Dict[str, Any]:
        """Get current A/B test results."""

        if experiment_id not in self.ab_tests:
            raise ValueError(f"Experiment {experiment_id} not found")

        experiment = self.ab_tests[experiment_id]

        def calculate_stats(metrics):
            latencies = metrics["latency"]
            return {
                "requests": metrics["requests"],
                "success_rate": metrics["successes"] / metrics["requests"] if metrics["requests"] > 0 else 0,
                "avg_latency": sum(latencies) / len(latencies) if latencies else 0,
                "p95_latency": sorted(latencies)[int(len(latencies) * 0.95)] if latencies else 0
            }

        return {
            "experiment_id": experiment_id,
            "name": experiment["name"],
            "created_at": experiment["created_at"],
            "active": experiment["active"],
            "version_a": {
                "version": experiment["version_a"],
                "stats": calculate_stats(experiment["metrics_a"])
            },
            "version_b": {
                "version": experiment["version_b"],
                "stats": calculate_stats(experiment["metrics_b"])
            },
            "recommendation": self._get_recommendation(experiment)
        }

    def _get_recommendation(self, experiment: Dict) -> str:
        """Get recommendation based on A/B test results."""

        metrics_a = experiment["metrics_a"]
        metrics_b = experiment["metrics_b"]

        # Need minimum sample size
        if metrics_a["requests"] < 100 or metrics_b["requests"] < 100:
            return "Insufficient data for recommendation"

        success_rate_a = metrics_a["successes"] / metrics_a["requests"]
        success_rate_b = metrics_b["successes"] / metrics_b["requests"]

        if success_rate_b > success_rate_a * 1.1:  # B is 10% better
            return f"Recommend version {experiment['version_b']} (B)"
        elif success_rate_a > success_rate_b * 1.1:  # A is 10% better
            return f"Recommend version {experiment['version_a']} (A)"
        else:
            return "No significant difference detected"

    async def cleanup_old_models(
        self,
        db: AsyncSession,
        keep_last: int = 5,
        older_than_days: int = 30
    ) -> List[str]:
        """Clean up old model versions."""

        # Get all models
        models = await self.list_models(db, limit=100)

        # Sort by creation date
        models.sort(key=lambda m: m.created_at, reverse=True)

        # Keep the latest N models
        models_to_keep = models[:keep_last]
        models_to_check = models[keep_last:]

        deleted = []
        cutoff_date = datetime.utcnow() - timedelta(days=older_than_days)

        for model in models_to_check:
            if model.created_at < cutoff_date:
                # Don't delete if model is in active A/B test
                in_ab_test = any(
                    test["version_a"] == model.version or test["version_b"] == model.version
                    for test in self.ab_tests.values()
                    if test["active"]
                )

                if not in_ab_test:
                    success = await self.delete_model_version(model.version, db, force=True)
                    if success:
                        deleted.append(model.version)

        return deleted

    async def get_model_lineage(
        self,
        version: str,
        db: AsyncSession
    ) -> Dict[str, Any]:
        """Get complete lineage of a model version."""

        model = await self.get_model_by_version(version, db)

        if not model:
            raise ValueError(f"Model version {version} not found")

        lineage = {
            "version": version,
            "created_at": model.created_at.isoformat(),
            "parent": None,
            "children": [],
            "siblings": []
        }

        # Extract parent information from metadata
        if model.metadata:
            lineage["parent"] = model.metadata.get("parent_model")
            lineage["training_dataset"] = model.metadata.get("training_dataset")
            lineage["base_model"] = model.metadata.get("fine_tuned_from")

        # Find children (models that reference this as parent)
        all_models = await self.list_models(db, limit=100)

        for other_model in all_models:
            if other_model.metadata:
                if other_model.metadata.get("parent_model") == version:
                    lineage["children"].append(other_model.version)
                elif other_model.metadata.get("parent_model") == lineage["parent"] and other_model.version != version:
                    lineage["siblings"].append(other_model.version)

        return lineage


class ModelPerformanceBenchmark:
    """Benchmark model performance."""

    @staticmethod
    async def benchmark_inference(
        model_path: str,
        test_data: Any,
        num_iterations: int = 100
    ) -> Dict[str, float]:
        """Benchmark model inference performance."""

        import time
        import numpy as np

        latencies = []

        for _ in range(num_iterations):
            start = time.time()
            # Simulate inference (replace with actual model inference)
            await asyncio.sleep(0.01)  # Simulate 10ms inference
            latency = (time.time() - start) * 1000  # Convert to ms
            latencies.append(latency)

        return {
            "avg_latency_ms": np.mean(latencies),
            "p50_latency_ms": np.percentile(latencies, 50),
            "p95_latency_ms": np.percentile(latencies, 95),
            "p99_latency_ms": np.percentile(latencies, 99),
            "min_latency_ms": np.min(latencies),
            "max_latency_ms": np.max(latencies)
        }


from datetime import timedelta
