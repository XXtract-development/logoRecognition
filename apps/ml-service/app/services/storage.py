"""
Storage service for ML Service.
Handles MinIO/S3 operations for model files and training images.
"""

import os
import io
from typing import Optional, List, BinaryIO
from datetime import timedelta
from minio import Minio
from minio.error import S3Error

from app.core.config import settings
from app.core.logging import logger


class StorageService:
    """MinIO/S3 storage service for ML models and images."""

    MODELS_BUCKET = "models"
    TRAINING_BUCKET = "training-images"

    def __init__(self):
        self.client: Optional[Minio] = None
        self._connected = False

    def connect(self) -> None:
        """Create MinIO client connection."""
        try:
            self.client = Minio(
                settings.MINIO_ENDPOINT,
                access_key=settings.MINIO_ACCESS_KEY,
                secret_key=settings.MINIO_SECRET_KEY,
                secure=settings.MINIO_USE_SSL,
            )
            self._ensure_buckets()
            self._connected = True
            logger.info("MinIO storage connected")
        except Exception as e:
            logger.error(f"Failed to connect to MinIO: {e}")
            self._connected = False

    def _ensure_buckets(self) -> None:
        """Ensure required buckets exist."""
        for bucket in [self.MODELS_BUCKET, self.TRAINING_BUCKET]:
            try:
                if not self.client.bucket_exists(bucket):
                    self.client.make_bucket(bucket)
                    logger.info(f"Created bucket: {bucket}")
            except S3Error as e:
                logger.warning(f"Bucket check failed for {bucket}: {e}")

    @property
    def is_connected(self) -> bool:
        return self._connected and self.client is not None

    # ============================================
    # Model Operations
    # ============================================

    def save_model(
        self,
        model_id: str,
        model_data: bytes,
        model_type: str = "onnx",
    ) -> str:
        """Save a model file to storage."""
        if not self.client:
            self.connect()

        filename = f"{model_id}.{model_type}"
        data_stream = io.BytesIO(model_data)

        try:
            self.client.put_object(
                self.MODELS_BUCKET,
                filename,
                data_stream,
                length=len(model_data),
                content_type="application/octet-stream",
            )
            logger.info(f"Model saved: {filename}")
            return f"{self.MODELS_BUCKET}/{filename}"
        except S3Error as e:
            logger.error(f"Failed to save model: {e}")
            raise

    def load_model(self, model_id: str, model_type: str = "onnx") -> bytes:
        """Load a model file from storage."""
        if not self.client:
            self.connect()

        filename = f"{model_id}.{model_type}"

        try:
            response = self.client.get_object(self.MODELS_BUCKET, filename)
            data = response.read()
            response.close()
            response.release_conn()
            return data
        except S3Error as e:
            logger.error(f"Failed to load model: {e}")
            raise

    def delete_model(self, model_id: str, model_type: str = "onnx") -> None:
        """Delete a model file from storage."""
        if not self.client:
            self.connect()

        filename = f"{model_id}.{model_type}"

        try:
            self.client.remove_object(self.MODELS_BUCKET, filename)
            logger.info(f"Model deleted: {filename}")
        except S3Error as e:
            logger.error(f"Failed to delete model: {e}")
            raise

    def list_models(self) -> List[str]:
        """List all model files in storage."""
        if not self.client:
            self.connect()

        try:
            objects = self.client.list_objects(self.MODELS_BUCKET)
            return [obj.object_name for obj in objects]
        except S3Error as e:
            logger.error(f"Failed to list models: {e}")
            return []

    def model_exists(self, model_id: str, model_type: str = "onnx") -> bool:
        """Check if a model exists in storage."""
        if not self.client:
            self.connect()

        filename = f"{model_id}.{model_type}"

        try:
            self.client.stat_object(self.MODELS_BUCKET, filename)
            return True
        except S3Error:
            return False

    def get_model_url(
        self,
        model_id: str,
        model_type: str = "onnx",
        expires: int = 3600,
    ) -> str:
        """Get a presigned URL for model download."""
        if not self.client:
            self.connect()

        filename = f"{model_id}.{model_type}"

        try:
            return self.client.presigned_get_object(
                self.MODELS_BUCKET,
                filename,
                expires=timedelta(seconds=expires),
            )
        except S3Error as e:
            logger.error(f"Failed to generate model URL: {e}")
            raise

    # ============================================
    # Training Image Operations
    # ============================================

    def get_training_image(self, image_path: str) -> bytes:
        """Get a training image from storage."""
        if not self.client:
            self.connect()

        try:
            response = self.client.get_object(self.TRAINING_BUCKET, image_path)
            data = response.read()
            response.close()
            response.release_conn()
            return data
        except S3Error as e:
            logger.error(f"Failed to get training image: {e}")
            raise

    def put_training_image(
        self,
        object_name: str,
        data: bytes,
        content_type: str = "image/png",
    ) -> str:
        """
        Store a training image (or rasterized artwork page) in the training bucket.

        Returns the object key. Used by the artwork rasterization endpoint
        (Story 8.2) to write per-page PNGs back next to the source PDF.
        """
        if not self.client:
            self.connect()

        data_stream = io.BytesIO(data)
        try:
            self.client.put_object(
                self.TRAINING_BUCKET,
                object_name,
                data_stream,
                length=len(data),
                content_type=content_type,
            )
            return object_name
        except S3Error as e:
            logger.error(f"Failed to store training image: {e}")
            raise

    def list_training_images(self, prefix: str = "") -> List[str]:
        """List training images in storage."""
        if not self.client:
            self.connect()

        try:
            objects = self.client.list_objects(
                self.TRAINING_BUCKET,
                prefix=prefix,
                recursive=True,
            )
            return [obj.object_name for obj in objects]
        except S3Error as e:
            logger.error(f"Failed to list training images: {e}")
            return []

    # ============================================
    # Health Check
    # ============================================

    def health_check(self) -> dict:
        """Check storage health."""
        try:
            if not self.client:
                self.connect()

            # Try to list buckets
            buckets = self.client.list_buckets()
            return {
                "status": "healthy",
                "connected": True,
                "buckets": len(buckets),
            }
        except Exception as e:
            return {
                "status": "unhealthy",
                "connected": False,
                "error": str(e),
            }


# Global storage service instance
storage_service = StorageService()
