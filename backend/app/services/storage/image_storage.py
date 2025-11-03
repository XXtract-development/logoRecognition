"""
MinIO Image Storage Service
Handles optimized image storage with organized bucket structure
"""
import io
import json
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, timedelta
import logging
from dataclasses import dataclass
from pathlib import Path

from minio import Minio
from minio.error import S3Error
from minio.commonconfig import CopySource
from minio.lifecycleconfig import LifecycleConfig, Rule, Expiration

from app.core.config import settings

logger = logging.getLogger(__name__)

@dataclass
class StorageMetadata:
    """Image storage metadata"""
    filename: str
    original_size: int
    optimized_size: int
    compression_ratio: float
    ssim_score: float
    resolution: str
    format: str
    upload_time: datetime
    optimization_time_ms: int

class ImageStorage:
    """
    MinIO storage service for optimized images
    Implements organized bucket structure with lifecycle policies
    """

    def __init__(
        self,
        endpoint: str = None,
        access_key: str = None,
        secret_key: str = None,
        secure: bool = False,
        bucket_name: str = "optimized-images"
    ):
        """
        Initialize MinIO storage client

        Args:
            endpoint: MinIO endpoint
            access_key: MinIO access key
            secret_key: MinIO secret key
            secure: Use HTTPS
            bucket_name: Base bucket name
        """
        self.endpoint = endpoint or settings.MINIO_ENDPOINT
        self.access_key = access_key or settings.MINIO_ACCESS_KEY
        self.secret_key = secret_key or settings.MINIO_SECRET_KEY
        self.secure = secure
        self.bucket_name = bucket_name

        # Initialize MinIO client
        self.client = Minio(
            self.endpoint,
            access_key=self.access_key,
            secret_key=self.secret_key,
            secure=self.secure
        )

        # Resolution tiers for organized storage
        self.resolution_tiers = [
            "thumbnail",
            "medium",
            "large",
            "original"
        ]

        # Initialize bucket structure
        self._initialize_buckets()

    def _initialize_buckets(self):
        """Create bucket structure if not exists"""
        try:
            # Create main bucket
            if not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(self.bucket_name)
                logger.info(f"Created bucket: {self.bucket_name}")

            # Set lifecycle policy for automatic cleanup
            self._set_lifecycle_policy()

        except S3Error as e:
            logger.error(f"Failed to initialize buckets: {e}")

    def _set_lifecycle_policy(self):
        """Set lifecycle policies for automatic cleanup"""
        try:
            # Create lifecycle rules
            rules = [
                # Remove thumbnails after 30 days
                Rule(
                    rule_id="cleanup-thumbnails",
                    status="Enabled",
                    expiration=Expiration(days=30),
                    filter_prefix="optimized/thumbnail/"
                ),
                # Remove temporary files after 1 day
                Rule(
                    rule_id="cleanup-temp",
                    status="Enabled",
                    expiration=Expiration(days=1),
                    filter_prefix="temp/"
                )
            ]

            config = LifecycleConfig(rules)
            self.client.set_bucket_lifecycle(self.bucket_name, config)
            logger.info("Lifecycle policies configured")

        except Exception as e:
            logger.warning(f"Failed to set lifecycle policy: {e}")

    async def store_optimized_images(
        self,
        image_id: str,
        optimized_images: Dict[str, bytes],
        metadata: Dict[str, Any],
        original_filename: str = None
    ) -> Dict[str, str]:
        """
        Store optimized images in organized structure

        Args:
            image_id: Unique image identifier
            optimized_images: Dictionary of resolution -> image bytes
            metadata: Image metadata
            original_filename: Original filename for reference

        Returns:
            Dictionary of resolution -> storage URLs
        """
        urls = {}
        stored_metadata = {}

        try:
            for resolution, image_data in optimized_images.items():
                # Generate storage path
                path = self._generate_storage_path(image_id, resolution, original_filename)

                # Prepare metadata
                object_metadata = {
                    "image-id": image_id,
                    "resolution": resolution,
                    "original-filename": original_filename or "unknown",
                    "optimization-time": str(datetime.utcnow()),
                    "size": str(len(image_data)),
                }

                # Add optimization metadata if available
                if resolution in metadata:
                    res_metadata = metadata[resolution]
                    object_metadata.update({
                        "compression-ratio": str(res_metadata.get("compression_ratio", 0)),
                        "ssim-score": str(res_metadata.get("ssim_score", 0)),
                        "format": res_metadata.get("format", "unknown")
                    })

                # Store image
                self.client.put_object(
                    self.bucket_name,
                    path,
                    io.BytesIO(image_data),
                    length=len(image_data),
                    metadata=object_metadata
                )

                # Generate URL (can be signed for private access)
                url = self._generate_url(path)
                urls[resolution] = url

                # Store metadata for tracking
                stored_metadata[resolution] = object_metadata

                logger.debug(f"Stored {resolution} image at {path}")

            # Store consolidated metadata
            await self._store_metadata(image_id, stored_metadata, original_filename)

            return urls

        except S3Error as e:
            logger.error(f"Failed to store optimized images: {e}")
            raise

    def _generate_storage_path(
        self,
        image_id: str,
        resolution: str,
        original_filename: str = None
    ) -> str:
        """
        Generate organized storage path

        Structure:
        optimized/
        ├── thumbnail/
        │   └── 2024/01/01/image_id.webp
        ├── medium/
        │   └── 2024/01/01/image_id.webp
        ├── large/
        │   └── 2024/01/01/image_id.webp
        └── original/
            └── 2024/01/01/image_id.webp
        """
        now = datetime.utcnow()
        date_path = now.strftime("%Y/%m/%d")

        # Get file extension
        if original_filename:
            ext = Path(original_filename).suffix.lower()
            if not ext:
                ext = ".webp"
        else:
            ext = ".webp"

        # Construct path
        path = f"optimized/{resolution}/{date_path}/{image_id}{ext}"
        return path

    def _generate_url(self, path: str, expiry: int = 3600) -> str:
        """
        Generate access URL for stored image

        Args:
            path: Storage path
            expiry: URL expiry time in seconds (default 1 hour)

        Returns:
            Access URL
        """
        try:
            # For public buckets, return direct URL
            if self._is_public_bucket():
                return f"http{'s' if self.secure else ''}://{self.endpoint}/{self.bucket_name}/{path}"

            # For private buckets, generate presigned URL
            url = self.client.presigned_get_object(
                self.bucket_name,
                path,
                expires=timedelta(seconds=expiry)
            )
            return url

        except S3Error as e:
            logger.error(f"Failed to generate URL: {e}")
            return ""

    def _is_public_bucket(self) -> bool:
        """Check if bucket has public access"""
        # This would check bucket policy in production
        # For now, assume private
        return False

    async def _store_metadata(
        self,
        image_id: str,
        metadata: Dict[str, Dict],
        original_filename: str
    ):
        """Store image metadata for tracking and reporting"""
        try:
            metadata_path = f"metadata/{image_id}.json"

            metadata_doc = {
                "image_id": image_id,
                "original_filename": original_filename,
                "stored_at": datetime.utcnow().isoformat(),
                "resolutions": metadata
            }

            metadata_bytes = json.dumps(metadata_doc, indent=2).encode()

            self.client.put_object(
                self.bucket_name,
                metadata_path,
                io.BytesIO(metadata_bytes),
                length=len(metadata_bytes),
                content_type="application/json"
            )

        except Exception as e:
            logger.warning(f"Failed to store metadata: {e}")

    async def get_image(
        self,
        image_id: str,
        resolution: str = "original"
    ) -> Optional[bytes]:
        """
        Retrieve an image from storage

        Args:
            image_id: Image identifier
            resolution: Resolution tier to retrieve

        Returns:
            Image bytes or None if not found
        """
        try:
            # Find image path (search today's date first, then previous days)
            path = await self._find_image_path(image_id, resolution)

            if not path:
                return None

            # Get object
            response = self.client.get_object(self.bucket_name, path)
            image_data = response.read()
            response.close()
            response.release_conn()

            return image_data

        except S3Error as e:
            logger.error(f"Failed to retrieve image: {e}")
            return None

    async def _find_image_path(
        self,
        image_id: str,
        resolution: str
    ) -> Optional[str]:
        """Find image path in storage"""
        # Try recent dates first
        for days_ago in range(7):  # Search last 7 days
            date = datetime.utcnow() - timedelta(days=days_ago)
            date_path = date.strftime("%Y/%m/%d")

            # Try common extensions
            for ext in ['.webp', '.jpg', '.png']:
                path = f"optimized/{resolution}/{date_path}/{image_id}{ext}"

                try:
                    # Check if object exists
                    self.client.stat_object(self.bucket_name, path)
                    return path
                except S3Error:
                    continue

        return None

    async def delete_image(self, image_id: str) -> bool:
        """
        Delete all versions of an image

        Args:
            image_id: Image identifier

        Returns:
            Success status
        """
        try:
            deleted = False

            # Delete from each resolution tier
            for resolution in self.resolution_tiers:
                path = await self._find_image_path(image_id, resolution)
                if path:
                    self.client.remove_object(self.bucket_name, path)
                    deleted = True
                    logger.debug(f"Deleted {path}")

            # Delete metadata
            metadata_path = f"metadata/{image_id}.json"
            try:
                self.client.remove_object(self.bucket_name, metadata_path)
            except S3Error:
                pass  # Metadata might not exist

            return deleted

        except S3Error as e:
            logger.error(f"Failed to delete image: {e}")
            return False

    async def list_images(
        self,
        prefix: str = "optimized/",
        resolution: str = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        List stored images

        Args:
            prefix: Path prefix to search
            resolution: Specific resolution tier
            limit: Maximum results

        Returns:
            List of image information
        """
        if resolution:
            prefix = f"optimized/{resolution}/"

        images = []

        try:
            objects = self.client.list_objects(
                self.bucket_name,
                prefix=prefix,
                recursive=True
            )

            for obj in objects:
                if len(images) >= limit:
                    break

                # Parse object info
                image_info = {
                    "path": obj.object_name,
                    "size": obj.size,
                    "last_modified": obj.last_modified,
                    "etag": obj.etag
                }

                # Try to get metadata
                try:
                    stat = self.client.stat_object(self.bucket_name, obj.object_name)
                    if stat.metadata:
                        image_info["metadata"] = stat.metadata
                except:
                    pass

                images.append(image_info)

            return images

        except S3Error as e:
            logger.error(f"Failed to list images: {e}")
            return []

    async def get_storage_stats(self) -> Dict[str, Any]:
        """Get storage statistics"""
        stats = {
            "total_size": 0,
            "image_count": 0,
            "by_resolution": {},
            "by_format": {}
        }

        try:
            for resolution in self.resolution_tiers:
                prefix = f"optimized/{resolution}/"
                resolution_size = 0
                resolution_count = 0

                objects = self.client.list_objects(
                    self.bucket_name,
                    prefix=prefix,
                    recursive=True
                )

                for obj in objects:
                    resolution_size += obj.size
                    resolution_count += 1
                    stats["total_size"] += obj.size
                    stats["image_count"] += 1

                    # Track by format
                    ext = Path(obj.object_name).suffix.lower()
                    if ext not in stats["by_format"]:
                        stats["by_format"][ext] = {"size": 0, "count": 0}
                    stats["by_format"][ext]["size"] += obj.size
                    stats["by_format"][ext]["count"] += 1

                stats["by_resolution"][resolution] = {
                    "size": resolution_size,
                    "count": resolution_count
                }

            return stats

        except S3Error as e:
            logger.error(f"Failed to get storage stats: {e}")
            return stats

    def generate_cdn_url(self, path: str) -> str:
        """Generate CDN URL for cached access"""
        # This would integrate with CloudFront/CloudFlare in production
        # For now, return direct MinIO URL
        return self._generate_url(path, expiry=86400)  # 24 hour expiry