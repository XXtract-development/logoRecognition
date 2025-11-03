"""Unit tests for training pipeline."""

import asyncio
import json
import os
from datetime import datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
import torch
import torch.nn as nn
import numpy as np

from app.ml.training.pipeline import TrainingPipeline, LogoDataset
from app.ml.training.few_shot import FewShotLearner, PrototypicalNetwork
from app.ml.training.augmentation import DataAugmentationPipeline
from app.ml.training.onnx_export import ONNXExporter


@pytest.fixture
def mock_minio_client():
    """Mock MinIO client for testing."""
    client = AsyncMock()
    client.save_checkpoint = AsyncMock()
    client.upload_model = AsyncMock()
    client.upload_onnx = AsyncMock()
    return client


@pytest.fixture
def training_pipeline(mock_minio_client):
    """Create training pipeline instance for testing."""
    return TrainingPipeline(
        job_id="test-job-123",
        minio_client=mock_minio_client,
        device="cpu",
    )


@pytest.fixture
def sample_dataset():
    """Create sample dataset for testing."""
    # Create dummy images
    image_paths = [f"test_image_{i}.jpg" for i in range(10)]
    labels = [i % 5 for i in range(10)]  # 5 classes
    return image_paths, labels


@pytest.fixture
def sample_dataloader(sample_dataset):
    """Create sample dataloader for testing."""
    from torch.utils.data import DataLoader, TensorDataset

    # Create dummy tensors
    images = torch.randn(10, 3, 224, 224)
    labels = torch.tensor([i % 5 for i in range(10)])

    dataset = TensorDataset(images, labels)
    return DataLoader(dataset, batch_size=2, shuffle=True)


class TestTrainingPipeline:
    """Test training pipeline functionality."""

    @pytest.mark.asyncio
    async def test_initialize(self, training_pipeline):
        """Test pipeline initialization."""
        await training_pipeline.initialize(n_classes=5, n_support=5)

        assert training_pipeline.model is not None
        assert training_pipeline.optimizer is not None
        assert training_pipeline.scheduler is not None
        assert training_pipeline.progress["status"] == "initialized"

    @pytest.mark.asyncio
    async def test_train_epoch(self, training_pipeline, sample_dataloader):
        """Test single epoch training."""
        await training_pipeline.initialize(n_classes=5, n_support=5)

        loss, accuracy = await training_pipeline._train_epoch(sample_dataloader)

        assert isinstance(loss, float)
        assert isinstance(accuracy, float)
        assert 0 <= accuracy <= 1

    @pytest.mark.asyncio
    async def test_validate(self, training_pipeline, sample_dataloader):
        """Test validation."""
        await training_pipeline.initialize(n_classes=5, n_support=5)

        loss, accuracy = await training_pipeline._validate(sample_dataloader)

        assert isinstance(loss, float)
        assert isinstance(accuracy, float)
        assert 0 <= accuracy <= 1

    @pytest.mark.asyncio
    async def test_full_training_loop(self, training_pipeline, sample_dataloader):
        """Test complete training loop."""
        await training_pipeline.initialize(n_classes=5, n_support=5)

        # Limit epochs for testing
        training_pipeline.config["epochs"] = 2

        result = await training_pipeline.train(sample_dataloader, sample_dataloader)

        assert "best_accuracy" in result
        assert "total_epochs" in result
        assert "history" in result
        assert len(result["history"]) > 0

    @pytest.mark.asyncio
    async def test_export_to_onnx(self, training_pipeline, tmp_path):
        """Test ONNX export."""
        await training_pipeline.initialize(n_classes=5, n_support=5)

        output_path = str(tmp_path / "model.onnx")

        with patch("app.ml.training.onnx_export.ONNXExporter.export") as mock_export:
            mock_export.return_value = output_path
            result = await training_pipeline.export_to_onnx(output_path)

        assert result == output_path

    @pytest.mark.asyncio
    async def test_save_checkpoint(self, training_pipeline, mock_minio_client):
        """Test checkpoint saving."""
        await training_pipeline.initialize(n_classes=5, n_support=5)

        await training_pipeline._save_checkpoint(epoch=1, accuracy=0.95)

        mock_minio_client.save_checkpoint.assert_called_once()

    @pytest.mark.asyncio
    async def test_early_stopping(self, training_pipeline, sample_dataloader):
        """Test early stopping mechanism."""
        await training_pipeline.initialize(n_classes=5, n_support=5)

        # Set early stopping patience to 1
        training_pipeline.config["early_stopping_patience"] = 1

        # Mock validation to return decreasing accuracy
        with patch.object(
            training_pipeline,
            "_validate",
            side_effect=[(0.5, 0.9), (0.6, 0.8), (0.7, 0.7)]
        ):
            result = await training_pipeline.train(sample_dataloader, sample_dataloader)

        # Should stop early
        assert len(result["history"]) <= 3


class TestFewShotLearning:
    """Test few-shot learning components."""

    def test_prototypical_network_forward(self):
        """Test Prototypical Network forward pass."""
        model = PrototypicalNetwork(n_classes=5, n_support=5, n_query=5)

        # Create dummy data
        support_images = torch.randn(25, 3, 224, 224)  # 5 classes x 5 support
        support_labels = torch.tensor([i // 5 for i in range(25)])
        query_images = torch.randn(25, 3, 224, 224)  # 5 classes x 5 query
        query_labels = torch.tensor([i // 5 for i in range(25)])

        # Forward pass
        logits, loss = model(support_images, support_labels, query_images, query_labels)

        assert logits.shape == (25, 5)
        assert isinstance(loss.item(), float)

    def test_compute_prototypes(self):
        """Test prototype computation."""
        model = PrototypicalNetwork(n_classes=5, n_support=5)

        # Create dummy embeddings
        embeddings = torch.randn(25, 512)
        labels = torch.tensor([i // 5 for i in range(25)])

        prototypes = model.compute_prototypes(embeddings, labels)

        assert prototypes.shape == (5, 512)

    def test_euclidean_distance(self):
        """Test euclidean distance calculation."""
        model = PrototypicalNetwork(n_classes=5, n_support=5)

        query_embeddings = torch.randn(10, 512)
        prototypes = torch.randn(5, 512)

        distances = model.euclidean_distance(query_embeddings, prototypes)

        assert distances.shape == (10, 5)
        assert (distances >= 0).all()

    def test_few_shot_learner_episode(self):
        """Test few-shot learner episode training."""
        learner = FewShotLearner(n_way=5, k_shot=5, device="cpu")

        episode = {
            "support_images": torch.randn(25, 3, 224, 224),
            "support_labels": torch.tensor([i // 5 for i in range(25)]),
            "query_images": torch.randn(25, 3, 224, 224),
            "query_labels": torch.tensor([i // 5 for i in range(25)]),
        }

        optimizer = torch.optim.Adam(learner.model.parameters())
        result = learner.train_episode(episode, optimizer)

        assert "loss" in result
        assert "accuracy" in result
        assert 0 <= result["accuracy"] <= 1


class TestDataAugmentation:
    """Test data augmentation pipeline."""

    def test_augmentation_pipeline_initialization(self):
        """Test augmentation pipeline initialization."""
        augmenter = DataAugmentationPipeline(factor=50, deterministic=True)

        assert augmenter.factor == 50
        assert len(augmenter.augmentation_configs) == 50

    @patch("cv2.imread")
    def test_augment_image(self, mock_imread):
        """Test image augmentation."""
        # Mock image reading
        mock_imread.return_value = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)

        augmenter = DataAugmentationPipeline(factor=10)
        augmented = augmenter.augment("test.jpg")

        assert len(augmented) == 10
        assert all(isinstance(img, np.ndarray) for img in augmented)

    def test_geometric_transform(self):
        """Test geometric transformations."""
        augmenter = DataAugmentationPipeline()

        image = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)
        transformed = augmenter._apply_geometric_transform(
            image,
            rotation=15,
            scale=1.1,
            translation=(0.05, 0.05)
        )

        assert transformed.shape == image.shape

    def test_color_transform(self):
        """Test color transformations."""
        augmenter = DataAugmentationPipeline()

        image = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)
        transformed = augmenter._apply_color_transform(
            image,
            brightness=1.2,
            contrast=1.1,
            saturation=0.9
        )

        assert transformed.shape == image.shape
        assert transformed.dtype == np.uint8

    def test_noise_addition(self):
        """Test noise addition."""
        augmenter = DataAugmentationPipeline()

        image = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)
        noisy = augmenter._add_gaussian_noise(image, noise_level=0.01)

        assert noisy.shape == image.shape
        assert noisy.dtype == np.uint8


class TestONNXExport:
    """Test ONNX export functionality."""

    @pytest.fixture
    def simple_model(self):
        """Create simple model for testing."""
        return nn.Sequential(
            nn.Conv2d(3, 16, 3, padding=1),
            nn.ReLU(),
            nn.AdaptiveAvgPool2d(1),
            nn.Flatten(),
            nn.Linear(16, 10),
        )

    @pytest.mark.asyncio
    async def test_export_basic(self, simple_model, tmp_path):
        """Test basic ONNX export."""
        exporter = ONNXExporter(simple_model, device="cpu")

        output_path = str(tmp_path / "model.onnx")

        # Mock torch.onnx.export
        with patch("torch.onnx.export") as mock_export:
            result = await exporter.export(
                output_path,
                input_shape=(1, 3, 224, 224),
                optimize=False,
                validate=False,
            )

        mock_export.assert_called_once()
        assert result == output_path

    @pytest.mark.asyncio
    async def test_export_with_optimization(self, simple_model, tmp_path):
        """Test ONNX export with optimization."""
        exporter = ONNXExporter(simple_model, device="cpu")

        output_path = str(tmp_path / "model.onnx")

        with patch("torch.onnx.export"):
            with patch("onnx.load") as mock_load:
                with patch("onnx.save"):
                    mock_load.return_value = MagicMock()

                    result = await exporter.export(
                        output_path,
                        optimize=True,
                        validate=False,
                    )

        assert "optimized" in result

    def test_optimization_passes(self, simple_model):
        """Test optimization passes application."""
        exporter = ONNXExporter(simple_model)

        # Mock ONNX model
        mock_model = MagicMock()

        with patch("onnx.optimizer.optimize") as mock_optimize:
            mock_optimize.return_value = mock_model
            with patch("onnx.shape_inference.infer_shapes") as mock_infer:
                mock_infer.return_value = mock_model

                result = exporter._apply_optimization_passes(mock_model)

        mock_optimize.assert_called_once()
        mock_infer.assert_called_once()


@pytest.mark.integration
class TestTrainingIntegration:
    """Integration tests for training pipeline."""

    @pytest.mark.asyncio
    async def test_end_to_end_training(self, tmp_path):
        """Test end-to-end training workflow."""
        # Create pipeline
        pipeline = TrainingPipeline(
            job_id="integration-test",
            device="cpu",
        )

        # Initialize
        await pipeline.initialize(n_classes=3, n_support=3)

        # Create dummy dataloader
        from torch.utils.data import DataLoader, TensorDataset

        images = torch.randn(30, 3, 224, 224)
        labels = torch.tensor([i % 3 for i in range(30)])
        dataset = TensorDataset(images, labels)
        dataloader = DataLoader(dataset, batch_size=10)

        # Train for 1 epoch
        pipeline.config["epochs"] = 1
        result = await pipeline.train(dataloader)

        assert result["best_accuracy"] >= 0
        assert result["total_epochs"] == 1

        # Export to ONNX
        onnx_path = str(tmp_path / "model.onnx")

        with patch("torch.onnx.export"):
            await pipeline.export_to_onnx(onnx_path)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--cov=app.ml.training"])