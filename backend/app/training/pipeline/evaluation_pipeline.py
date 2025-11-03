"""Model evaluation pipeline for performance assessment and comparison."""

import numpy as np
from typing import Dict, List, Optional, Tuple
from datetime import datetime
import json

from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    classification_report,
    roc_auc_score,
    average_precision_score,
    matthews_corrcoef
)
import mlflow

class EvaluationPipeline:
    """Model evaluation pipeline"""

    def __init__(self):
        self.metrics_history = []

    async def evaluate(
        self,
        model_id: str,
        test_data: Tuple[np.ndarray, np.ndarray],
        compare_with_baseline: bool = True,
        confidence_threshold: float = 0.5
    ) -> Dict:
        """
        Evaluate model performance

        Args:
            model_id: ID of model to evaluate
            test_data: Tuple of (X_test, y_test)
            compare_with_baseline: Whether to compare with current production model
            confidence_threshold: Confidence threshold for predictions

        Returns:
            Dictionary with evaluation metrics
        """
        X_test, y_test = test_data

        # Load model
        model = await self._load_model(model_id)

        # Get predictions
        y_pred = model.predict(X_test)
        y_pred_proba = model.predict_proba(X_test) if hasattr(model, 'predict_proba') else None

        # Apply confidence threshold
        if y_pred_proba is not None:
            y_pred = (y_pred_proba[:, 1] >= confidence_threshold).astype(int)

        # Calculate metrics
        metrics = await self._calculate_metrics(y_test, y_pred, y_pred_proba)

        # Add inference time metrics
        inference_metrics = await self._measure_inference_time(model, X_test)
        metrics.update(inference_metrics)

        # Compare with baseline if requested
        if compare_with_baseline:
            comparison = await self._compare_with_baseline(metrics)
            metrics["baseline_comparison"] = comparison

        # Evaluate fairness
        fairness_metrics = await self._evaluate_fairness(model, X_test, y_test)
        metrics["fairness"] = fairness_metrics

        # Evaluate robustness
        robustness_metrics = await self._evaluate_robustness(model, X_test, y_test)
        metrics["robustness"] = robustness_metrics

        # Store metrics
        await self._store_metrics(model_id, metrics)

        # Log to MLflow
        self._log_metrics_to_mlflow(metrics)

        return metrics

    async def _calculate_metrics(
        self,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        y_pred_proba: Optional[np.ndarray] = None
    ) -> Dict:
        """Calculate comprehensive evaluation metrics"""
        metrics = {
            "accuracy": accuracy_score(y_true, y_pred),
            "precision": precision_score(y_true, y_pred, average='weighted', zero_division=0),
            "recall": recall_score(y_true, y_pred, average='weighted', zero_division=0),
            "f1_score": f1_score(y_true, y_pred, average='weighted', zero_division=0),
            "matthews_corrcoef": matthews_corrcoef(y_true, y_pred)
        }

        # Per-class metrics
        class_report = classification_report(
            y_true, y_pred,
            output_dict=True,
            zero_division=0
        )
        metrics["per_class_metrics"] = class_report

        # Confusion matrix
        cm = confusion_matrix(y_true, y_pred)
        metrics["confusion_matrix"] = cm.tolist()

        # Probabilistic metrics if available
        if y_pred_proba is not None:
            try:
                # Handle multi-class case
                if len(np.unique(y_true)) > 2:
                    metrics["roc_auc"] = roc_auc_score(
                        y_true, y_pred_proba,
                        multi_class='ovr',
                        average='weighted'
                    )
                else:
                    metrics["roc_auc"] = roc_auc_score(y_true, y_pred_proba[:, 1])
                    metrics["average_precision"] = average_precision_score(
                        y_true, y_pred_proba[:, 1]
                    )
            except:
                pass  # Skip if metrics cannot be calculated

        # Error analysis
        errors = y_true != y_pred
        metrics["error_rate"] = np.mean(errors)
        metrics["false_positive_rate"] = np.sum((y_pred == 1) & (y_true == 0)) / np.sum(y_true == 0)
        metrics["false_negative_rate"] = np.sum((y_pred == 0) & (y_true == 1)) / np.sum(y_true == 1)

        return metrics

    async def _measure_inference_time(
        self,
        model,
        X_test: np.ndarray,
        n_iterations: int = 100
    ) -> Dict:
        """Measure model inference time"""
        import time

        # Single sample inference
        single_sample = X_test[0:1]
        single_times = []

        for _ in range(n_iterations):
            start = time.perf_counter()
            _ = model.predict(single_sample)
            single_times.append(time.perf_counter() - start)

        # Batch inference
        batch_size = min(32, len(X_test))
        batch_sample = X_test[:batch_size]
        batch_times = []

        for _ in range(n_iterations // 10):
            start = time.perf_counter()
            _ = model.predict(batch_sample)
            batch_times.append(time.perf_counter() - start)

        return {
            "single_inference_time_ms": np.mean(single_times) * 1000,
            "single_inference_p50_ms": np.percentile(single_times, 50) * 1000,
            "single_inference_p95_ms": np.percentile(single_times, 95) * 1000,
            "single_inference_p99_ms": np.percentile(single_times, 99) * 1000,
            "batch_inference_time_ms": np.mean(batch_times) * 1000,
            "batch_throughput_samples_per_sec": batch_size / np.mean(batch_times)
        }

    async def _compare_with_baseline(self, metrics: Dict) -> Dict:
        """Compare with baseline model performance"""
        # Get baseline metrics
        baseline_metrics = await self._get_baseline_metrics()

        if not baseline_metrics:
            return {"no_baseline": True}

        comparison = {}

        # Compare key metrics
        for metric in ["accuracy", "precision", "recall", "f1_score"]:
            if metric in metrics and metric in baseline_metrics:
                improvement = (metrics[metric] - baseline_metrics[metric]) / baseline_metrics[metric]
                comparison[f"{metric}_improvement"] = improvement * 100  # Percentage

        # Compare inference time
        if "single_inference_p95_ms" in metrics and "single_inference_p95_ms" in baseline_metrics:
            time_improvement = (
                baseline_metrics["single_inference_p95_ms"] - metrics["single_inference_p95_ms"]
            ) / baseline_metrics["single_inference_p95_ms"]
            comparison["inference_time_improvement"] = time_improvement * 100

        # Overall recommendation
        accuracy_improved = comparison.get("accuracy_improvement", 0) > 0
        speed_improved = comparison.get("inference_time_improvement", 0) > 0

        if accuracy_improved and speed_improved:
            comparison["recommendation"] = "deploy"
        elif accuracy_improved and not speed_improved:
            comparison["recommendation"] = "deploy_with_monitoring"
        elif not accuracy_improved and speed_improved:
            comparison["recommendation"] = "consider_tradeoffs"
        else:
            comparison["recommendation"] = "do_not_deploy"

        return comparison

    async def _evaluate_fairness(
        self,
        model,
        X_test: np.ndarray,
        y_test: np.ndarray,
        sensitive_features: Optional[np.ndarray] = None
    ) -> Dict:
        """Evaluate model fairness across different groups"""
        fairness_metrics = {}

        if sensitive_features is None:
            # Generate synthetic sensitive features for demonstration
            # In production, these would be real demographic features
            sensitive_features = np.random.choice([0, 1], size=len(y_test))

        # Get predictions
        y_pred = model.predict(X_test)

        # Calculate fairness metrics for each group
        for group in np.unique(sensitive_features):
            group_mask = sensitive_features == group
            group_accuracy = accuracy_score(y_test[group_mask], y_pred[group_mask])
            fairness_metrics[f"group_{group}_accuracy"] = group_accuracy

        # Calculate disparate impact
        group_0_positive_rate = np.mean(y_pred[sensitive_features == 0])
        group_1_positive_rate = np.mean(y_pred[sensitive_features == 1])

        if group_1_positive_rate > 0:
            disparate_impact = group_0_positive_rate / group_1_positive_rate
        else:
            disparate_impact = float('inf')

        fairness_metrics["disparate_impact"] = disparate_impact
        fairness_metrics["is_fair"] = 0.8 <= disparate_impact <= 1.25  # 80% rule

        return fairness_metrics

    async def _evaluate_robustness(
        self,
        model,
        X_test: np.ndarray,
        y_test: np.ndarray
    ) -> Dict:
        """Evaluate model robustness to perturbations"""
        robustness_metrics = {}

        # Add small noise to test data
        noise_levels = [0.01, 0.05, 0.1]

        for noise_level in noise_levels:
            X_noisy = X_test + np.random.normal(0, noise_level, X_test.shape)
            y_pred_noisy = model.predict(X_noisy)

            accuracy_noisy = accuracy_score(y_test, y_pred_noisy)
            robustness_metrics[f"accuracy_noise_{noise_level}"] = accuracy_noisy

        # Calculate average robustness
        avg_robustness = np.mean(list(robustness_metrics.values()))
        robustness_metrics["average_robustness"] = avg_robustness

        return robustness_metrics

    async def _load_model(self, model_id: str):
        """Load model from registry"""
        from ..model_registry import ModelRegistry
        from ..database import get_session

        session = get_session()
        registry = ModelRegistry(session)
        model = await registry.load_model(model_id)

        return model

    async def _get_baseline_metrics(self) -> Optional[Dict]:
        """Get baseline model metrics"""
        from ..model_registry import ModelRegistry
        from ..database import get_session

        session = get_session()
        registry = ModelRegistry(session)

        # Get current production model
        production_model = await registry.get_production_model()

        if not production_model:
            return None

        # Return stored metrics
        return production_model.metrics

    async def _store_metrics(self, model_id: str, metrics: Dict):
        """Store evaluation metrics"""
        from ..model_registry import ModelRegistry
        from ..database import get_session

        session = get_session()
        registry = ModelRegistry(session)

        # Store metrics in model registry
        await registry.update_model_metrics(model_id, metrics)

        # Add to history
        self.metrics_history.append({
            "model_id": model_id,
            "metrics": metrics,
            "timestamp": datetime.now().isoformat()
        })

    def _log_metrics_to_mlflow(self, metrics: Dict):
        """Log metrics to MLflow"""
        # Log scalar metrics
        for key, value in metrics.items():
            if isinstance(value, (int, float)):
                mlflow.log_metric(key, value)

        # Log complex metrics as artifacts
        mlflow.log_dict(metrics, "evaluation_metrics.json")