"""Model artifact storage for training pipeline."""

import hashlib
import json
import logging
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import torch

from ..storage.minio_client import OptimizedMinIOClient as MinIOClient

logger = logging.getLogger(__name__)


class ModelArtifactStorage:
    """Manages model artifact storage and versioning."""

    def __init__(
        self,
        local_dir: str = "./models",
        minio_client: Optional[MinIOClient] = None,
        bucket_name: str = "model-artifacts"
    ):
        """Initialize artifact storage.

        Args:
            local_dir: Local directory for artifacts
            minio_client: Optional MinIO client for remote storage
            bucket_name: MinIO bucket name
        """
        self.local_dir = Path(local_dir)
        self.local_dir.mkdir(parents=True, exist_ok=True)

        self.minio_client = minio_client or self._init_minio_client()
        self.bucket_name = bucket_name

        # Ensure bucket exists
        if self.minio_client:
            self._ensure_bucket()

        self.metadata_file = self.local_dir / "artifacts_metadata.json"
        self.metadata = self._load_metadata()

    def _init_minio_client(self) -> Optional[MinIOClient]:
        """Initialize MinIO client from environment."""
        try:
            if os.getenv('MINIO_ENDPOINT'):
                client = MinIOClient(
                    endpoint=os.getenv('MINIO_ENDPOINT'),
                    access_key=os.getenv('MINIO_ACCESS_KEY'),
                    secret_key=os.getenv('MINIO_SECRET_KEY'),
                    secure=os.getenv('MINIO_SECURE', 'false').lower() == 'true'
                )
                return client
        except Exception as e:
            logger.warning(f"Could not initialize MinIO client: {str(e)}")
        return None

    def _ensure_bucket(self):
        """Ensure MinIO bucket exists."""
        try:
            if self.minio_client:
                self.minio_client.ensure_bucket(self.bucket_name)
        except Exception as e:
            logger.error(f"Error ensuring bucket: {str(e)}")

    def _load_metadata(self) -> Dict:
        """Load artifacts metadata."""
        if self.metadata_file.exists():
            with open(self.metadata_file, 'r') as f:
                return json.load(f)
        return {'artifacts': {}, 'versions': {}}

    def _save_metadata(self):
        """Save artifacts metadata."""
        with open(self.metadata_file, 'w') as f:
            json.dump(self.metadata, f, indent=2, default=str)

    def save_model_artifact(
        self,
        model_state: Dict[str, Any],
        artifact_name: str,
        version: Optional[str] = None,
        metadata: Optional[Dict] = None,
        upload_to_minio: bool = True
    ) -> Dict[str, str]:
        """Save model artifact.

        Args:
            model_state: Model state dictionary
            artifact_name: Name of the artifact
            version: Optional version (auto-generated if not provided)
            metadata: Optional metadata
            upload_to_minio: Whether to upload to MinIO

        Returns:
            Dictionary with artifact information
        """
        # Generate version if not provided
        if version is None:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            version = f"v_{timestamp}"

        # Create artifact directory
        artifact_dir = self.local_dir / artifact_name / version
        artifact_dir.mkdir(parents=True, exist_ok=True)

        # Save model file
        model_path = artifact_dir / "model.pth"
        torch.save(model_state, model_path)

        # Calculate checksum
        checksum = self._calculate_checksum(model_path)

        # Prepare artifact info
        artifact_info = {
            'artifact_name': artifact_name,
            'version': version,
            'checksum': checksum,
            'local_path': str(model_path),
            'created_at': datetime.now().isoformat(),
            'size_bytes': model_path.stat().st_size,
            'metadata': metadata or {}
        }

        # Save metadata file
        metadata_path = artifact_dir / "metadata.json"
        with open(metadata_path, 'w') as f:
            json.dump(artifact_info, f, indent=2)

        # Upload to MinIO if available
        if upload_to_minio and self.minio_client:
            try:
                # Upload model file
                model_key = f"{artifact_name}/{version}/model.pth"
                with open(model_path, 'rb') as f:
                    self.minio_client.put_object(
                        self.bucket_name,
                        model_key,
                        f.read(),
                        content_type='application/octet-stream'
                    )

                # Upload metadata
                metadata_key = f"{artifact_name}/{version}/metadata.json"
                self.minio_client.put_object(
                    self.bucket_name,
                    metadata_key,
                    json.dumps(artifact_info).encode(),
                    content_type='application/json'
                )

                artifact_info['minio_path'] = model_key
                logger.info(f"Artifact uploaded to MinIO: {model_key}")

            except Exception as e:
                logger.error(f"Error uploading to MinIO: {str(e)}")

        # Update global metadata
        if artifact_name not in self.metadata['artifacts']:
            self.metadata['artifacts'][artifact_name] = []

        self.metadata['artifacts'][artifact_name].append(artifact_info)
        self._save_metadata()

        logger.info(
            f"Model artifact saved: {artifact_name}/{version} "
            f"(size: {artifact_info['size_bytes'] / 1024 / 1024:.2f} MB)"
        )

        return artifact_info

    def load_model_artifact(
        self,
        artifact_name: str,
        version: Optional[str] = None,
        download_from_minio: bool = True
    ) -> Dict[str, Any]:
        """Load model artifact.

        Args:
            artifact_name: Name of the artifact
            version: Version to load (latest if not specified)
            download_from_minio: Whether to download from MinIO

        Returns:
            Model state dictionary
        """
        # Get artifact info
        artifact_info = self.get_artifact_info(artifact_name, version)
        if not artifact_info:
            raise ValueError(f"Artifact not found: {artifact_name}/{version}")

        local_path = Path(artifact_info['local_path'])

        # Download from MinIO if needed
        if not local_path.exists() and download_from_minio and self.minio_client:
            if 'minio_path' in artifact_info:
                try:
                    # Download model file
                    model_data = self.minio_client.get_object(
                        self.bucket_name,
                        artifact_info['minio_path']
                    )

                    # Save locally
                    local_path.parent.mkdir(parents=True, exist_ok=True)
                    with open(local_path, 'wb') as f:
                        f.write(model_data)

                    logger.info(f"Downloaded artifact from MinIO: {artifact_info['minio_path']}")

                except Exception as e:
                    logger.error(f"Error downloading from MinIO: {str(e)}")
                    raise

        # Load model state
        if not local_path.exists():
            raise FileNotFoundError(f"Model file not found: {local_path}")

        model_state = torch.load(local_path, map_location='cpu')

        # Verify checksum
        calculated_checksum = self._calculate_checksum(local_path)
        if calculated_checksum != artifact_info['checksum']:
            logger.warning(
                f"Checksum mismatch for {artifact_name}/{version}. "
                f"Expected: {artifact_info['checksum']}, "
                f"Got: {calculated_checksum}"
            )

        return model_state

    def get_artifact_info(
        self,
        artifact_name: str,
        version: Optional[str] = None
    ) -> Optional[Dict]:
        """Get artifact information.

        Args:
            artifact_name: Name of the artifact
            version: Version (latest if not specified)

        Returns:
            Artifact information or None
        """
        if artifact_name not in self.metadata['artifacts']:
            return None

        artifacts = self.metadata['artifacts'][artifact_name]
        if not artifacts:
            return None

        if version:
            # Find specific version
            for artifact in artifacts:
                if artifact['version'] == version:
                    return artifact
        else:
            # Return latest version
            return max(artifacts, key=lambda x: x['created_at'])

        return None

    def list_artifacts(self, artifact_name: Optional[str] = None) -> List[Dict]:
        """List available artifacts.

        Args:
            artifact_name: Optional filter by artifact name

        Returns:
            List of artifact information
        """
        if artifact_name:
            return self.metadata['artifacts'].get(artifact_name, [])

        # Return all artifacts
        all_artifacts = []
        for name, artifacts in self.metadata['artifacts'].items():
            all_artifacts.extend(artifacts)

        return sorted(all_artifacts, key=lambda x: x['created_at'], reverse=True)

    def delete_artifact(
        self,
        artifact_name: str,
        version: str,
        delete_from_minio: bool = True
    ) -> bool:
        """Delete an artifact.

        Args:
            artifact_name: Name of the artifact
            version: Version to delete
            delete_from_minio: Whether to delete from MinIO

        Returns:
            Success status
        """
        try:
            # Get artifact info
            artifact_info = self.get_artifact_info(artifact_name, version)
            if not artifact_info:
                logger.warning(f"Artifact not found: {artifact_name}/{version}")
                return False

            # Delete local files
            local_path = Path(artifact_info['local_path'])
            if local_path.exists():
                # Delete entire version directory
                version_dir = local_path.parent
                if version_dir.exists():
                    shutil.rmtree(version_dir)
                    logger.info(f"Deleted local artifact: {version_dir}")

            # Delete from MinIO
            if delete_from_minio and self.minio_client and 'minio_path' in artifact_info:
                try:
                    # Delete model and metadata
                    self.minio_client.remove_object(
                        self.bucket_name,
                        artifact_info['minio_path']
                    )

                    metadata_key = artifact_info['minio_path'].replace(
                        'model.pth', 'metadata.json'
                    )
                    self.minio_client.remove_object(
                        self.bucket_name,
                        metadata_key
                    )

                    logger.info(f"Deleted from MinIO: {artifact_info['minio_path']}")

                except Exception as e:
                    logger.error(f"Error deleting from MinIO: {str(e)}")

            # Update metadata
            if artifact_name in self.metadata['artifacts']:
                self.metadata['artifacts'][artifact_name] = [
                    a for a in self.metadata['artifacts'][artifact_name]
                    if a['version'] != version
                ]

                # Remove artifact name if no versions left
                if not self.metadata['artifacts'][artifact_name]:
                    del self.metadata['artifacts'][artifact_name]

                self._save_metadata()

            return True

        except Exception as e:
            logger.error(f"Error deleting artifact: {str(e)}")
            return False

    def _calculate_checksum(self, file_path: Path) -> str:
        """Calculate file checksum.

        Args:
            file_path: Path to file

        Returns:
            SHA256 checksum
        """
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b''):
                sha256.update(chunk)
        return sha256.hexdigest()

    def cleanup_old_versions(
        self,
        artifact_name: str,
        keep_versions: int = 3
    ):
        """Clean up old artifact versions.

        Args:
            artifact_name: Name of the artifact
            keep_versions: Number of versions to keep
        """
        if artifact_name not in self.metadata['artifacts']:
            return

        artifacts = self.metadata['artifacts'][artifact_name]
        if len(artifacts) <= keep_versions:
            return

        # Sort by creation time
        sorted_artifacts = sorted(
            artifacts,
            key=lambda x: x['created_at'],
            reverse=True
        )

        # Delete old versions
        for artifact in sorted_artifacts[keep_versions:]:
            self.delete_artifact(artifact_name, artifact['version'])
            logger.info(
                f"Cleaned up old version: {artifact_name}/{artifact['version']}"
            )

    def export_artifact(
        self,
        artifact_name: str,
        version: str,
        export_path: str
    ):
        """Export artifact to a specific location.

        Args:
            artifact_name: Name of the artifact
            version: Version to export
            export_path: Path to export to
        """
        # Load model
        model_state = self.load_model_artifact(artifact_name, version)

        # Save to export path
        export_dir = Path(export_path)
        export_dir.mkdir(parents=True, exist_ok=True)

        model_path = export_dir / f"{artifact_name}_{version}.pth"
        torch.save(model_state, model_path)

        # Copy metadata
        artifact_info = self.get_artifact_info(artifact_name, version)
        metadata_path = export_dir / f"{artifact_name}_{version}_metadata.json"
        with open(metadata_path, 'w') as f:
            json.dump(artifact_info, f, indent=2)

        logger.info(f"Artifact exported to: {export_dir}")