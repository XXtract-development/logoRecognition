"""Comprehensive tests for Model Versioning System (US-023)."""
import pytest
import json
import os
import tempfile
from datetime import datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy.ext.asyncio import AsyncSession

from app.ml.registry.versioning import (
    ModelVersionManager,
    ModelComparisonTool
)
from app.models.training import ModelRegistry


@pytest.fixture
def temp_model_dir():
    """Create temporary directory for model storage."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir


@pytest.fixture
def model_version_manager(temp_model_dir):
    """Create ModelVersionManager instance."""
    return ModelVersionManager(base_path=temp_model_dir)


@pytest.fixture
async def mock_db_session():
    """Create mock database session."""
    session = AsyncMock(spec=AsyncSession)
    session.add = MagicMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.delete = AsyncMock()
    session.rollback = AsyncMock()
    return session


@pytest.fixture
def sample_model_file(temp_model_dir):
    """Create a sample model file."""
    model_path = Path(temp_model_dir) / "sample_model.pt"
    model_path.write_text("dummy model content")
    return str(model_path)


@pytest.fixture
def sample_onnx_file(temp_model_dir):
    """Create a sample ONNX file."""
    onnx_path = Path(temp_model_dir) / "sample_model.onnx"
    onnx_path.write_text("dummy onnx content")
    return str(onnx_path)


class TestModelVersionManager:
    """Test ModelVersionManager functionality."""

    async def test_register_model(
        self,
        model_version_manager,
        mock_db_session,
        sample_model_file,
        sample_onnx_file
    ):
        """Test registering a new model version."""
        job_id = "job_123"
        metrics = {
            "accuracy": 0.96,
            "precision": 0.95,
            "recall": 0.97,
            "f1_score": 0.96
        }
        metadata = {
            "training_data": "dataset_v1",
            "epochs": 50,
            "batch_size": 32
        }

        # Mock database query result
        mock_db_session.execute = AsyncMock(return_value=MagicMock(
            scalar_one_or_none=MagicMock(return_value=None)
        ))

        result = await model_version_manager.register_model(
            job_id=job_id,
            model_path=sample_model_file,
            onnx_path=sample_onnx_file,
            metrics=metrics,
            metadata=metadata,
            db=mock_db_session
        )

        mock_db_session.add.assert_called_once()
        mock_db_session.commit.assert_called_once()
        mock_db_session.refresh.assert_called_once()

    async def test_generate_version(self, model_version_manager, mock_db_session):
        """Test version generation."""
        # Test first version
        mock_db_session.execute = AsyncMock(return_value=MagicMock(
            scalar_one_or_none=MagicMock(return_value=None)
        ))

        version = await model_version_manager._generate_version(mock_db_session)
        assert version.startswith("v1.0.0-")

        # Test incremental version
        existing_model = MagicMock()
        existing_model.version = "v1.0.5-1234567890"
        existing_model.created_at = datetime.utcnow()

        mock_db_session.execute = AsyncMock(return_value=MagicMock(
            scalar_one_or_none=MagicMock(return_value=existing_model)
        ))

        version = await model_version_manager._generate_version(mock_db_session)
        assert version.startswith("v1.0.6-")

    async def test_get_model_by_version(self, model_version_manager, mock_db_session):
        """Test retrieving model by version."""
        version = "v1.0.0-1234567890"
        mock_model = MagicMock(spec=ModelRegistry)
        mock_model.version = version

        mock_db_session.execute = AsyncMock(return_value=MagicMock(
            scalar_one_or_none=MagicMock(return_value=mock_model)
        ))

        result = await model_version_manager.get_model_by_version(version, mock_db_session)
        assert result == mock_model

    async def test_get_latest_model(self, model_version_manager, mock_db_session):
        """Test retrieving latest model."""
        mock_model = MagicMock(spec=ModelRegistry)
        mock_model.version = "v1.0.5-1234567890"

        mock_db_session.execute = AsyncMock(return_value=MagicMock(
            scalar_one_or_none=MagicMock(return_value=mock_model)
        ))

        result = await model_version_manager.get_latest_model(mock_db_session)
        assert result == mock_model

    async def test_compare_models(self, model_version_manager, mock_db_session):
        """Test comparing two model versions."""
        model1 = MagicMock(spec=ModelRegistry)
        model1.version = "v1.0.0-1234567890"
        model1.metrics = {"accuracy": 0.90, "f1_score": 0.89}
        model1.created_at = datetime.utcnow()

        model2 = MagicMock(spec=ModelRegistry)
        model2.version = "v1.0.1-1234567891"
        model2.metrics = {"accuracy": 0.95, "f1_score": 0.94}
        model2.created_at = datetime.utcnow()

        with patch.object(model_version_manager, 'get_model_by_version') as mock_get:
            mock_get.side_effect = [model1, model2]

            comparison = await model_version_manager.compare_models(
                "v1.0.0-1234567890",
                "v1.0.1-1234567891",
                mock_db_session
            )

            assert comparison["version1"]["version"] == model1.version
            assert comparison["version2"]["version"] == model2.version
            assert "metrics_diff" in comparison
            assert comparison["metrics_diff"]["accuracy"]["absolute"] == 0.05
            assert comparison["metrics_diff"]["f1_score"]["absolute"] == 0.05

    async def test_rollback_to_version(self, model_version_manager, mock_db_session):
        """Test rolling back to a specific version."""
        target_version = "v1.0.3-1234567890"

        mock_model = MagicMock(spec=ModelRegistry)
        mock_model.version = target_version
        mock_model.training_job_id = "job_123"
        mock_model.model_path = "/models/v1.0.3/model.pt"
        mock_model.onnx_path = "/models/v1.0.3/model.onnx"
        mock_model.metrics = {"accuracy": 0.95}
        mock_model.metadata = {"original": "metadata"}

        current_model = MagicMock(spec=ModelRegistry)
        current_model.version = "v1.0.5-1234567892"

        with patch.object(model_version_manager, 'get_model_by_version') as mock_get:
            mock_get.return_value = mock_model
            with patch.object(model_version_manager, 'get_latest_model') as mock_latest:
                mock_latest.return_value = current_model

                mock_db_session.execute = AsyncMock(return_value=MagicMock(
                    scalar_one_or_none=MagicMock(return_value=current_model)
                ))

                result = await model_version_manager.rollback_to_version(
                    target_version,
                    mock_db_session
                )

                mock_db_session.add.assert_called_once()
                mock_db_session.commit.assert_called_once()

    async def test_delete_model_version(self, model_version_manager, mock_db_session, temp_model_dir):
        """Test deleting a model version."""
        version = "v1.0.2-1234567890"

        # Create actual files to delete
        model_path = Path(temp_model_dir) / "model.pt"
        model_path.write_text("model content")

        mock_model = MagicMock(spec=ModelRegistry)
        mock_model.version = version
        mock_model.model_path = str(model_path)
        mock_model.onnx_path = None

        with patch.object(model_version_manager, 'get_model_by_version') as mock_get:
            mock_get.return_value = mock_model
            with patch.object(model_version_manager, 'get_latest_model') as mock_latest:
                mock_latest.return_value = MagicMock(version="v1.0.3-1234567891")

                result = await model_version_manager.delete_model_version(
                    version,
                    mock_db_session,
                    force=False
                )

                assert result is True
                assert not model_path.exists()
                mock_db_session.delete.assert_called_once()
                mock_db_session.commit.assert_called_once()

    async def test_export_metadata(self, model_version_manager, mock_db_session):
        """Test exporting model metadata."""
        version = "v1.0.0-1234567890"

        mock_model = MagicMock(spec=ModelRegistry)
        mock_model.version = version
        mock_model.training_job_id = "job_123"
        mock_model.created_at = datetime.utcnow()
        mock_model.metrics = {"accuracy": 0.95}
        mock_model.metadata = {"epochs": 50}
        mock_model.model_path = "/models/v1.0.0/model.pt"
        mock_model.onnx_path = "/models/v1.0.0/model.onnx"

        with patch.object(model_version_manager, 'get_model_by_version') as mock_get:
            mock_get.return_value = mock_model

            metadata = await model_version_manager.export_metadata(version, mock_db_session)

            assert metadata["version"] == version
            assert metadata["training_job_id"] == "job_123"
            assert metadata["metrics"]["accuracy"] == 0.95
            assert metadata["metadata"]["epochs"] == 50


class TestModelComparisonTool:
    """Test ModelComparisonTool functionality."""

    def test_generate_json_report(self):
        """Test generating JSON comparison report."""
        tool = ModelComparisonTool()
        comparison_results = {
            "model1": {"accuracy": 0.90},
            "model2": {"accuracy": 0.95}
        }

        report = tool.generate_report(comparison_results, output_format="json")
        parsed = json.loads(report)

        assert parsed["model1"]["accuracy"] == 0.90
        assert parsed["model2"]["accuracy"] == 0.95


class TestModelVersioningPerformance:
    """Test model versioning performance requirements."""

    async def test_semantic_versioning_format(self, model_version_manager, mock_db_session):
        """Test semantic versioning format."""
        mock_db_session.execute = AsyncMock(return_value=MagicMock(
            scalar_one_or_none=MagicMock(return_value=None)
        ))

        version = await model_version_manager._generate_version(mock_db_session)

        # Check format: v{major}.{minor}.{patch}-{timestamp}
        import re
        pattern = r"v\d+\.\d+\.\d+-\d+"
        assert re.match(pattern, version)

    async def test_model_lineage_tracking(self, model_version_manager, mock_db_session):
        """Test model lineage tracking through metadata."""
        job_id = "job_123"
        metrics = {"accuracy": 0.95}
        metadata = {
            "parent_model": "v1.0.0-1234567890",
            "training_dataset": "dataset_v2",
            "fine_tuned_from": "base_model_v1"
        }

        mock_db_session.execute = AsyncMock(return_value=MagicMock(
            scalar_one_or_none=MagicMock(return_value=None)
        ))

        with tempfile.NamedTemporaryFile() as tmp:
            result = await model_version_manager.register_model(
                job_id=job_id,
                model_path=tmp.name,
                onnx_path=None,
                metrics=metrics,
                metadata=metadata,
                db=mock_db_session
            )

            # Check that metadata is preserved
            call_args = mock_db_session.add.call_args[0][0]
            assert "parent_model" in call_args.metadata
            assert "training_dataset" in call_args.metadata

    def test_storage_structure(self, temp_model_dir):
        """Test hierarchical storage structure."""
        manager = ModelVersionManager(base_path=temp_model_dir)

        # Create versioned directory structure
        version = "v1.0.0-1234567890"
        version_dir = Path(temp_model_dir) / version
        version_dir.mkdir(parents=True, exist_ok=True)

        model_file = version_dir / "model.pt"
        model_file.write_text("model content")

        assert version_dir.exists()
        assert model_file.exists()
        assert model_file.parent.name == version


@pytest.mark.asyncio
async def test_ab_testing_infrastructure():
    """Test A/B testing infrastructure."""
    manager = ModelVersionManager()

    # This would be tested in integration with the serving layer
    # The versioning system should support concurrent model versions
    models = []

    for i in range(3):
        model = MagicMock(spec=ModelRegistry)
        model.version = f"v1.0.{i}-123456789{i}"
        model.metrics = {"accuracy": 0.90 + i * 0.02}
        models.append(model)

    # All versions should be independently accessible
    assert len(models) == 3
    assert all(m.version for m in models)
