"""Tests for the training pipeline integration (US-004)."""

import pytest
import asyncio
import numpy as np
from datetime import datetime
from unittest.mock import Mock, patch, AsyncMock, MagicMock

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

# Mock missing optional dependencies before importing app modules
sys.modules['mlflow'] = MagicMock()
sys.modules['wandb'] = MagicMock()
sys.modules['albumentations'] = MagicMock()
sys.modules['albumentations.pytorch'] = MagicMock()

from app.training.pipeline import (
    TrainingPipelineOrchestrator,
    PipelineConfig,
    PipelineStatus,
    DataPipeline,
    DatasetSplit,
    EvaluationPipeline,
    DeploymentPipeline,
    DeploymentStrategy
)
from app.training.monitoring.drift_detector import DriftDetector
from app.training.automation.hyperparameter_optimizer import HyperparameterOptimizer


class TestTrainingPipelineOrchestrator:
    """Test the main training pipeline orchestrator."""

    @pytest.fixture
    def mock_db_session(self):
        """Create mock database session."""
        return Mock()

    @pytest.fixture
    def pipeline_config(self):
        """Create pipeline configuration."""
        return PipelineConfig(
            auto_deploy_threshold=0.85,
            min_training_samples=100,
            enable_ab_testing=True,
            enable_drift_detection=True,
            enable_hyperparameter_tuning=True,
            hpo_trials=5  # Reduced for testing
        )

    @pytest.fixture
    def orchestrator(self, pipeline_config, mock_db_session):
        """Create pipeline orchestrator instance."""
        return TrainingPipelineOrchestrator(pipeline_config, mock_db_session)

    @pytest.mark.asyncio
    async def test_pipeline_initialization(self, orchestrator):
        """Test pipeline orchestrator initialization."""
        assert orchestrator.config is not None
        assert orchestrator.model_registry is not None
        assert orchestrator.data_pipeline is not None
        assert orchestrator.training_pipeline is not None
        assert orchestrator.evaluation_pipeline is not None
        assert orchestrator.deployment_pipeline is not None
        assert orchestrator.drift_detector is not None

    @pytest.mark.asyncio
    async def test_run_pipeline_success(self, orchestrator):
        """Test successful pipeline execution."""
        # Mock internal methods
        orchestrator._should_train = AsyncMock(return_value=True)
        orchestrator._prepare_data = AsyncMock(return_value={
            "success": True,
            "dataset": Mock(test_split=Mock(return_value=(np.array([]), np.array([])))),
            "test_dataset": (np.array([]), np.array([]))
        })
        orchestrator._check_drift = AsyncMock(return_value=0.1)
        orchestrator._train_model = AsyncMock(return_value={
            "success": True,
            "model_id": "test_model_123"
        })
        orchestrator._evaluate_model = AsyncMock(return_value={
            "accuracy": 0.9,
            "precision": 0.88,
            "recall": 0.92
        })
        orchestrator._should_deploy = AsyncMock(return_value=True)
        orchestrator._deploy_model = AsyncMock(return_value={
            "success": True,
            "deployment_id": "deploy_123"
        })

        with patch('mlflow.start_run'), patch('mlflow.end_run'):
            result = await orchestrator.run_pipeline(trigger="manual")

        assert result["status"] == "completed"
        assert result["model_id"] == "test_model_123"
        assert result["deployed"] is True

    @pytest.mark.asyncio
    async def test_run_pipeline_skip_conditions_not_met(self, orchestrator):
        """Test pipeline skip when conditions are not met."""
        orchestrator._should_train = AsyncMock(return_value=False)

        with patch('mlflow.start_run'), patch('mlflow.end_run'):
            result = await orchestrator.run_pipeline(trigger="manual", force_retrain=False)

        assert result["status"] == "skipped"
        assert result["reason"] == "Training conditions not met"

    @pytest.mark.asyncio
    async def test_run_pipeline_failure_handling(self, orchestrator):
        """Test pipeline failure handling."""
        orchestrator._should_train = AsyncMock(return_value=True)
        orchestrator._prepare_data = AsyncMock(side_effect=Exception("Data preparation failed"))
        orchestrator._handle_failure = AsyncMock()

        with patch('mlflow.start_run'), patch('mlflow.end_run'):
            result = await orchestrator.run_pipeline(trigger="manual")

        assert result["status"] == "failed"
        assert "Data preparation failed" in result["error"]
        orchestrator._handle_failure.assert_called_once()


class TestDataPipeline:
    """Test the data preparation pipeline."""

    @pytest.fixture
    def data_pipeline(self):
        """Create data pipeline instance."""
        return DataPipeline()

    @pytest.mark.asyncio
    async def test_prepare_dataset(self, data_pipeline):
        """Test dataset preparation."""
        # Mock data loading
        data_pipeline._load_data = AsyncMock(return_value={
            "features": np.random.randn(1000, 224, 224, 3),
            "labels": np.random.randint(0, 10, 1000)
        })

        dataset = await data_pipeline.prepare_dataset(
            test_size=0.2,
            val_size=0.2,
            apply_augmentation=False,
            balance_classes=False
        )

        assert isinstance(dataset, DatasetSplit)
        assert dataset.X_train.shape[0] == 640  # 64% of 1000
        assert dataset.X_val.shape[0] == 160   # 16% of 1000
        assert dataset.X_test.shape[0] == 200  # 20% of 1000
        assert "total_samples" in dataset.metadata
        assert dataset.metadata["total_samples"] == 1000

    @pytest.mark.asyncio
    async def test_data_validation(self, data_pipeline):
        """Test data validation."""
        # Test with valid data
        valid_data = {
            "features": np.random.randn(500, 224, 224, 3),
            "labels": np.random.randint(0, 2, 500)
        }
        result = await data_pipeline._validate_data(valid_data)
        assert result["valid"] is True
        assert len(result["errors"]) == 0

        # Test with invalid data (too few samples)
        invalid_data = {
            "features": np.random.randn(50, 224, 224, 3),
            "labels": np.random.randint(0, 2, 50)
        }
        result = await data_pipeline._validate_data(invalid_data)
        assert result["valid"] is False
        assert "Insufficient samples" in result["errors"]

    @pytest.mark.asyncio
    async def test_class_balancing(self, data_pipeline):
        """Test class balancing functionality."""
        # Create imbalanced dataset
        imbalanced_data = {
            "features": np.random.randn(1000, 10),
            "labels": np.array([0] * 900 + [1] * 100)  # 90% class 0, 10% class 1
        }

        with patch('imblearn.combine.SMOTEENN.fit_resample') as mock_smoteenn:
            # Mock SMOTEENN to return balanced data
            balanced_features = np.random.randn(800, 10)
            balanced_labels = np.array([0] * 400 + [1] * 400)
            mock_smoteenn.return_value = (balanced_features, balanced_labels)

            result = await data_pipeline._balance_classes(imbalanced_data)

            assert len(result["features"]) == 800
            assert np.sum(result["labels"] == 0) == 400
            assert np.sum(result["labels"] == 1) == 400


class TestEvaluationPipeline:
    """Test the model evaluation pipeline."""

    @pytest.fixture
    def evaluation_pipeline(self):
        """Create evaluation pipeline instance."""
        return EvaluationPipeline()

    @pytest.fixture
    def mock_model(self):
        """Create mock model."""
        model = Mock()
        model.predict = Mock(return_value=np.array([0, 1, 1, 0, 1]))
        model.predict_proba = Mock(return_value=np.array([
            [0.9, 0.1],
            [0.2, 0.8],
            [0.1, 0.9],
            [0.8, 0.2],
            [0.3, 0.7]
        ]))
        return model

    @pytest.mark.asyncio
    async def test_evaluate_model(self, evaluation_pipeline, mock_model):
        """Test model evaluation."""
        evaluation_pipeline._load_model = AsyncMock(return_value=mock_model)
        evaluation_pipeline._store_metrics = AsyncMock()
        evaluation_pipeline._get_baseline_metrics = AsyncMock(return_value={
            "accuracy": 0.75,
            "precision": 0.73,
            "recall": 0.77,
            "f1_score": 0.75
        })

        X_test = np.random.randn(5, 10)
        y_test = np.array([0, 1, 1, 0, 1])

        with patch('mlflow.log_metric'), patch('mlflow.log_dict'):
            metrics = await evaluation_pipeline.evaluate(
                "test_model_123",
                (X_test, y_test),
                compare_with_baseline=True
            )

        assert "accuracy" in metrics
        assert "precision" in metrics
        assert "recall" in metrics
        assert "f1_score" in metrics
        assert "confusion_matrix" in metrics
        assert "baseline_comparison" in metrics

    @pytest.mark.asyncio
    async def test_inference_time_measurement(self, evaluation_pipeline, mock_model):
        """Test inference time measurement."""
        X_test = np.random.randn(100, 10)

        metrics = await evaluation_pipeline._measure_inference_time(
            mock_model,
            X_test,
            n_iterations=10
        )

        assert "single_inference_time_ms" in metrics
        assert "single_inference_p95_ms" in metrics
        assert "batch_inference_time_ms" in metrics
        assert "batch_throughput_samples_per_sec" in metrics
        assert metrics["batch_throughput_samples_per_sec"] > 0


class TestDeploymentPipeline:
    """Test the model deployment pipeline."""

    @pytest.fixture
    def deployment_pipeline(self):
        """Create deployment pipeline instance."""
        return DeploymentPipeline()

    @pytest.mark.asyncio
    async def test_blue_green_deployment(self, deployment_pipeline):
        """Test blue-green deployment strategy."""
        deployment_pipeline._pre_deployment_checks = AsyncMock(return_value={
            "passed": True,
            "errors": []
        })
        deployment_pipeline._post_deployment_validation = AsyncMock(return_value={
            "valid": True,
            "errors": []
        })

        result = await deployment_pipeline.deploy(
            "test_model_123",
            strategy="blue_green"
        )

        assert result["success"] is True
        assert result["model_id"] == "test_model_123"
        assert result["strategy"] == "blue_green"
        assert "endpoint" in result

    @pytest.mark.asyncio
    async def test_canary_deployment(self, deployment_pipeline):
        """Test canary deployment strategy."""
        deployment_pipeline._pre_deployment_checks = AsyncMock(return_value={
            "passed": True,
            "errors": []
        })
        deployment_pipeline._post_deployment_validation = AsyncMock(return_value={
            "valid": True,
            "errors": []
        })
        deployment_pipeline._get_canary_metrics = AsyncMock(return_value={
            "success_rate": 0.995,
            "error_rate": 0.005,
            "latency_p95": 75
        })

        result = await deployment_pipeline.deploy(
            "test_model_123",
            strategy="canary",
            config={
                "initial_percentage": 10,
                "increment": 90,  # Quick for testing
                "wait_time": 0.1   # Short wait for testing
            }
        )

        assert result["success"] is True
        assert result["strategy"] == "canary"
        assert "rollout_history" in result

    @pytest.mark.asyncio
    async def test_deployment_failure_rollback(self, deployment_pipeline):
        """Test deployment failure and rollback."""
        deployment_pipeline._pre_deployment_checks = AsyncMock(return_value={
            "passed": False,
            "errors": ["Model validation not passed"]
        })

        result = await deployment_pipeline.deploy(
            "test_model_123",
            strategy="blue_green"
        )

        assert result["success"] is False
        assert "Model validation not passed" in result["error"]


class TestDriftDetector:
    """Test the drift detection system."""

    @pytest.fixture
    def drift_detector(self):
        """Create drift detector instance."""
        return DriftDetector()

    @pytest.mark.asyncio
    async def test_calculate_drift_score(self, drift_detector):
        """Test drift score calculation."""
        # Create baseline and current data
        baseline_data = np.random.randn(1000, 10)
        current_data = np.random.randn(1000, 10)

        # Store baseline
        await drift_detector._store_baseline(baseline_data)

        # Calculate drift
        drift_score = await drift_detector.calculate_drift_score(
            current_data,
            method="combined"
        )

        assert 0 <= drift_score <= 1
        assert len(drift_detector.drift_history) == 1

    @pytest.mark.asyncio
    async def test_concept_drift_detection(self, drift_detector):
        """Test concept drift detection."""
        # Create predictions with drift
        predictions = np.array([1, 1, 1, 0, 0] * 400)  # 2000 predictions
        labels = np.array([1, 1, 0, 0, 0] * 400)  # More errors in recent data

        result = await drift_detector.detect_concept_drift(
            predictions,
            labels,
            window_size=500
        )

        assert "drift_detected" in result
        assert "recent_error_rate" in result
        assert "historical_error_rate" in result
        assert "drift_score" in result

    @pytest.mark.asyncio
    async def test_feature_drift_monitoring(self, drift_detector):
        """Test per-feature drift monitoring."""
        # Create baseline features
        baseline_features = {
            "feature1": np.random.randn(1000),
            "feature2": np.random.randn(1000),
            "feature3": np.random.randn(1000)
        }

        # Create current features with drift in feature2
        current_features = {
            "feature1": np.random.randn(1000),
            "feature2": np.random.randn(1000) + 2,  # Shifted distribution
            "feature3": np.random.randn(1000)
        }

        # Store baseline
        await drift_detector._store_baseline_features(baseline_features)

        # Monitor drift
        result = await drift_detector.monitor_feature_drift(current_features)

        assert "feature_drift_scores" in result
        assert "drifted_features" in result
        assert "feature2" in result["drifted_features"]


class TestHyperparameterOptimizer:
    """Test hyperparameter optimization."""

    @pytest.fixture
    def optimizer(self):
        """Create hyperparameter optimizer instance."""
        return HyperparameterOptimizer()

    @pytest.fixture
    def mock_dataset(self):
        """Create mock dataset."""
        return DatasetSplit(
            X_train=np.random.randn(100, 224, 224, 3),
            y_train=np.random.randint(0, 10, 100),
            X_val=np.random.randn(20, 224, 224, 3),
            y_val=np.random.randint(0, 10, 20),
            X_test=np.random.randn(20, 224, 224, 3),
            y_test=np.random.randint(0, 10, 20),
            metadata={}
        )

    @pytest.mark.asyncio
    async def test_hyperparameter_optimization(self, optimizer, mock_dataset):
        """Test hyperparameter optimization process."""
        with patch('mlflow.log_params'), patch('mlflow.log_metric'), patch('mlflow.log_dict'):
            # Run optimization with fewer trials for testing
            result = await optimizer.optimize(
                mock_dataset,
                n_trials=2,
                objective_metric="accuracy",
                parallel=False
            )

        assert "learning_rate" in result
        assert "batch_size" in result
        assert "best_value" in result
        assert result["n_trials"] == 2

    def test_hyperparameter_suggestions(self, optimizer):
        """Test hyperparameter suggestion generation."""
        import optuna

        study = optuna.create_study()
        trial = study.ask()

        params = optimizer._suggest_hyperparameters(trial)

        assert "learning_rate" in params
        assert "batch_size" in params
        assert "num_epochs" in params
        assert "optimizer" in params
        assert params["batch_size"] in [16, 32, 64, 128]
        assert params["optimizer"] in ["adam", "sgd", "rmsprop"]


# Integration Tests
class TestEndToEndPipeline:
    """End-to-end integration tests for the training pipeline."""

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_complete_pipeline_flow(self):
        """Test complete pipeline flow from data to deployment."""
        # Create pipeline components
        config = PipelineConfig(
            auto_deploy_threshold=0.8,
            min_training_samples=100,
            enable_ab_testing=False,  # Simplified for testing
            enable_drift_detection=True,
            enable_hyperparameter_tuning=False,  # Simplified for testing
            hpo_trials=5
        )

        mock_session = Mock()
        orchestrator = TrainingPipelineOrchestrator(config, mock_session)

        # Mock all external dependencies
        with patch('app.training.model_registry.ModelRegistry'), \
             patch('app.training.annotation_connector.AnnotationConnector'), \
             patch('mlflow.start_run'), \
             patch('mlflow.end_run'), \
             patch('mlflow.log_dict'):

            # Mock data preparation
            orchestrator._prepare_data = AsyncMock(return_value={
                "success": True,
                "dataset": DatasetSplit(
                    X_train=np.random.randn(100, 10),
                    y_train=np.random.randint(0, 2, 100),
                    X_val=np.random.randn(20, 10),
                    y_val=np.random.randint(0, 2, 20),
                    X_test=np.random.randn(20, 10),
                    y_test=np.random.randint(0, 2, 20),
                    metadata={}
                ),
                "test_dataset": (np.random.randn(20, 10), np.random.randint(0, 2, 20))
            })

            # Mock training
            orchestrator._train_model = AsyncMock(return_value={
                "success": True,
                "model_id": "integration_test_model"
            })

            # Mock evaluation
            orchestrator._evaluate_model = AsyncMock(return_value={
                "accuracy": 0.85,
                "precision": 0.83,
                "recall": 0.87,
                "f1_score": 0.85
            })

            # Mock deployment
            orchestrator._deploy_model = AsyncMock(return_value={
                "success": True,
                "deployment_id": "integration_deploy_123"
            })

            # Run pipeline
            result = await orchestrator.run_pipeline(
                trigger="manual",
                force_retrain=True
            )

            # Verify complete flow
            assert result["status"] == "completed"
            assert result["model_id"] == "integration_test_model"
            assert result["deployed"] is True
            assert result["metrics"]["accuracy"] == 0.85


if __name__ == "__main__":
    pytest.main([__file__, "-v"])