"""Model versioning and registry management."""

import json
import logging
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.training import ModelRegistry
from app.storage.minio_client import MinIOClient

logger = logging.getLogger(__name__)


class ModelVersionManager:
    """Manage model versions and registry."""

    def __init__(
        self,
        base_path: str = "/models",
        minio_client: Optional[MinIOClient] = None,
    ):
        """Initialize model version manager."""
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)
        self.minio_client = minio_client or MinIOClient()

        # Version schema: v{major}.{minor}.{patch}-{timestamp}
        self.version_pattern = r"v(\d+)\.(\d+)\.(\d+)-(\d+)"

    async def register_model(
        self,
        job_id: str,
        model_path: str,
        onnx_path: Optional[str],
        metrics: Dict[str, Any],
        metadata: Dict[str, Any],
        db: AsyncSession,
    ) -> ModelRegistry:
        """Register a new model version in the registry."""
        try:
            # Generate version number
            version = await self._generate_version(db)

            # Copy model files to versioned location
            versioned_model_path = await self._store_model_files(
                job_id,
                model_path,
                onnx_path,
                version,
            )

            # Create registry entry
            model_entry = ModelRegistry(
                version=version,
                training_job_id=job_id,
                model_path=str(versioned_model_path),
                onnx_path=str(versioned_model_path).replace(".pt", ".onnx") if onnx_path else None,
                metrics=metrics,
                metadata={
                    **metadata,
                    "registered_at": datetime.utcnow().isoformat(),
                    "file_size_mb": self._get_file_size_mb(model_path),
                },
            )

            db.add(model_entry)
            await db.commit()
            await db.refresh(model_entry)

            logger.info(f"Registered model version {version} for job {job_id}")
            return model_entry

        except Exception as e:
            logger.error(f"Failed to register model: {str(e)}")
            await db.rollback()
            raise

    async def _generate_version(self, db: AsyncSession) -> str:
        """Generate next version number."""
        # Get latest version from database
        result = await db.execute(
            select(ModelRegistry)
            .order_by(ModelRegistry.created_at.desc())
            .limit(1)
        )
        latest = result.scalar_one_or_none()

        if latest and latest.version:
            # Parse version and increment
            import re
            match = re.match(self.version_pattern, latest.version)
            if match:
                major, minor, patch, _ = match.groups()
                patch = int(patch) + 1
            else:
                major, minor, patch = 1, 0, 0
        else:
            major, minor, patch = 1, 0, 0

        # Add timestamp
        timestamp = int(datetime.utcnow().timestamp())
        version = f"v{major}.{minor}.{patch}-{timestamp}"

        return version

    async def _store_model_files(
        self,
        job_id: str,
        model_path: str,
        onnx_path: Optional[str],
        version: str,
    ) -> Path:
        """Store model files in versioned location."""
        # Create version directory
        version_dir = self.base_path / version
        version_dir.mkdir(parents=True, exist_ok=True)

        # Copy model file
        model_dest = version_dir / "model.pt"
        shutil.copy2(model_path, model_dest)

        # Copy ONNX file if available
        if onnx_path and os.path.exists(onnx_path):
            onnx_dest = version_dir / "model.onnx"
            shutil.copy2(onnx_path, onnx_dest)

        # Upload to MinIO
        if self.minio_client:
            await self.minio_client.upload_model_version(
                job_id,
                version,
                str(model_dest),
                str(onnx_dest) if onnx_path else None,
            )

        return model_dest

    def _get_file_size_mb(self, file_path: str) -> float:
        """Get file size in MB."""
        if os.path.exists(file_path):
            return os.path.getsize(file_path) / (1024 * 1024)
        return 0.0

    async def get_model_by_version(
        self,
        version: str,
        db: AsyncSession,
    ) -> Optional[ModelRegistry]:
        """Get model by version."""
        result = await db.execute(
            select(ModelRegistry).where(ModelRegistry.version == version)
        )
        return result.scalar_one_or_none()

    async def get_latest_model(
        self,
        db: AsyncSession,
    ) -> Optional[ModelRegistry]:
        """Get latest model version."""
        result = await db.execute(
            select(ModelRegistry)
            .order_by(ModelRegistry.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def list_models(
        self,
        db: AsyncSession,
        limit: int = 10,
        offset: int = 0,
    ) -> List[ModelRegistry]:
        """List all model versions."""
        result = await db.execute(
            select(ModelRegistry)
            .order_by(ModelRegistry.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return result.scalars().all()

    async def compare_models(
        self,
        version1: str,
        version2: str,
        db: AsyncSession,
    ) -> Dict[str, Any]:
        """Compare two model versions."""
        model1 = await self.get_model_by_version(version1, db)
        model2 = await self.get_model_by_version(version2, db)

        if not model1 or not model2:
            raise ValueError("One or both model versions not found")

        comparison = {
            "version1": {
                "version": model1.version,
                "metrics": model1.metrics,
                "created_at": model1.created_at.isoformat(),
            },
            "version2": {
                "version": model2.version,
                "metrics": model2.metrics,
                "created_at": model2.created_at.isoformat(),
            },
            "metrics_diff": {},
        }

        # Calculate metrics differences
        if model1.metrics and model2.metrics:
            for key in model1.metrics:
                if key in model2.metrics:
                    if isinstance(model1.metrics[key], (int, float)):
                        diff = model2.metrics[key] - model1.metrics[key]
                        comparison["metrics_diff"][key] = {
                            "absolute": diff,
                            "percentage": (diff / model1.metrics[key] * 100) if model1.metrics[key] != 0 else 0,
                        }

        return comparison

    async def rollback_to_version(
        self,
        version: str,
        db: AsyncSession,
    ) -> ModelRegistry:
        """Rollback to a specific model version."""
        model = await self.get_model_by_version(version, db)

        if not model:
            raise ValueError(f"Model version {version} not found")

        # Create a new version entry as a rollback
        rollback_version = f"{version}-rollback-{int(datetime.utcnow().timestamp())}"

        rollback_entry = ModelRegistry(
            version=rollback_version,
            training_job_id=model.training_job_id,
            model_path=model.model_path,
            onnx_path=model.onnx_path,
            metrics=model.metrics,
            metadata={
                **model.metadata,
                "rollback_from": await self._get_current_version(db),
                "rollback_to": version,
                "rollback_at": datetime.utcnow().isoformat(),
            },
        )

        db.add(rollback_entry)
        await db.commit()
        await db.refresh(rollback_entry)

        logger.info(f"Rolled back to model version {version}")
        return rollback_entry

    async def _get_current_version(self, db: AsyncSession) -> str:
        """Get current active model version."""
        latest = await self.get_latest_model(db)
        return latest.version if latest else "unknown"

    async def delete_model_version(
        self,
        version: str,
        db: AsyncSession,
        force: bool = False,
    ) -> bool:
        """Delete a model version from registry."""
        model = await self.get_model_by_version(version, db)

        if not model:
            return False

        # Check if this is the latest version
        latest = await self.get_latest_model(db)
        if latest and latest.version == version and not force:
            raise ValueError("Cannot delete the latest model version without force flag")

        # Delete files
        if model.model_path and os.path.exists(model.model_path):
            os.remove(model.model_path)

        if model.onnx_path and os.path.exists(model.onnx_path):
            os.remove(model.onnx_path)

        # Delete from MinIO
        if self.minio_client:
            await self.minio_client.delete_model_version(version)

        # Delete from database
        await db.delete(model)
        await db.commit()

        logger.info(f"Deleted model version {version}")
        return True

    async def export_metadata(
        self,
        version: str,
        db: AsyncSession,
    ) -> Dict[str, Any]:
        """Export model metadata for documentation."""
        model = await self.get_model_by_version(version, db)

        if not model:
            raise ValueError(f"Model version {version} not found")

        return {
            "version": model.version,
            "training_job_id": model.training_job_id,
            "created_at": model.created_at.isoformat(),
            "metrics": model.metrics,
            "metadata": model.metadata,
            "model_path": model.model_path,
            "onnx_path": model.onnx_path,
        }


class ModelComparisonTool:
    """Tool for comparing different model versions."""

    def __init__(self):
        """Initialize comparison tool."""
        pass

    async def compare_performance(
        self,
        models: List[ModelRegistry],
        test_dataset: Any,
    ) -> Dict[str, Any]:
        """Compare performance of multiple models on test dataset."""
        results = {}

        for model in models:
            # Load model
            # Run inference on test dataset
            # Calculate metrics
            results[model.version] = {
                "accuracy": 0.0,  # Calculate actual accuracy
                "inference_time": 0.0,  # Measure inference time
                "memory_usage": 0.0,  # Measure memory usage
            }

        return results

    async def generate_report(
        self,
        comparison_results: Dict[str, Any],
        output_format: str = "json",
    ) -> str:
        """Generate comparison report in specified format."""
        if output_format == "json":
            return json.dumps(comparison_results, indent=2)
        elif output_format == "html":
            # Generate HTML report
            pass
        elif output_format == "markdown":
            # Generate Markdown report
            pass

        return json.dumps(comparison_results)