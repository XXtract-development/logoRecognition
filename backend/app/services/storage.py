"""
Storage service for image management.
"""

import os
import asyncio
from typing import Optional, Dict, Any, List
from pathlib import Path
import shutil
import aiofiles
import hashlib
import json
import logging
from datetime import datetime
import uuid

logger = logging.getLogger(__name__)


class StorageService:
    """
    Service for managing image storage and retrieval.

    Handles local file storage with future support for cloud storage (S3, GCS).
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize storage service.

        Args:
            config: Storage configuration
        """
        self.config = config or {}
        self.storage_type = self.config.get("type", "local")
        self.base_path = Path(self.config.get("base_path", "./uploads"))
        self.max_file_size = self.config.get("max_file_size", 10 * 1024 * 1024)  # 10MB
        self.allowed_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'}

        # Create base directory if local storage
        if self.storage_type == "local":
            self.base_path.mkdir(parents=True, exist_ok=True)
            (self.base_path / "images").mkdir(exist_ok=True)
            (self.base_path / "metadata").mkdir(exist_ok=True)

    async def store_image(self, file_content: bytes, filename: str,
                         user_id: str) -> str:
        """
        Store uploaded image and metadata.

        Args:
            file_content: Image file content
            filename: Original filename
            user_id: User who uploaded the image

        Returns:
            Upload ID for the stored image

        Raises:
            ValueError: If file is invalid
            IOError: If storage fails
        """
        # Validate file
        if len(file_content) > self.max_file_size:
            raise ValueError(f"File exceeds maximum size of {self.max_file_size} bytes")

        # Extract extension
        ext = Path(filename).suffix.lower()
        if ext not in self.allowed_extensions:
            raise ValueError(f"File type {ext} not allowed")

        # Generate upload ID and paths
        upload_id = str(uuid.uuid4())
        file_hash = hashlib.sha256(file_content).hexdigest()

        # Create directory structure: uploads/images/YYYY/MM/DD/
        now = datetime.utcnow()
        date_path = self.base_path / "images" / str(now.year) / f"{now.month:02d}" / f"{now.day:02d}"
        date_path.mkdir(parents=True, exist_ok=True)

        # Save image
        image_filename = f"{upload_id}{ext}"
        image_path = date_path / image_filename

        try:
            async with aiofiles.open(image_path, 'wb') as f:
                await f.write(file_content)

            # Save metadata
            metadata = {
                "upload_id": upload_id,
                "filename": filename,
                "path": str(image_path.relative_to(self.base_path)),
                "size": len(file_content),
                "hash": file_hash,
                "user_id": user_id,
                "uploaded_at": now.isoformat(),
                "extension": ext,
                "status": "uploaded"
            }

            metadata_path = self.base_path / "metadata" / f"{upload_id}.json"
            async with aiofiles.open(metadata_path, 'w') as f:
                await f.write(json.dumps(metadata, indent=2))

            logger.info(f"Image stored successfully: {upload_id}")
            return upload_id

        except Exception as e:
            logger.error(f"Failed to store image: {e}")
            # Cleanup on failure
            if image_path.exists():
                image_path.unlink()
            raise IOError(f"Storage failed: {e}")

    async def get_image_path(self, upload_id: str) -> str:
        """
        Get the file path for an uploaded image.

        Args:
            upload_id: Upload identifier

        Returns:
            Absolute path to the image file

        Raises:
            FileNotFoundError: If image not found
        """
        # Load metadata
        metadata = await self.get_metadata(upload_id)
        if not metadata:
            raise FileNotFoundError(f"Image {upload_id} not found")

        # Construct full path
        image_path = self.base_path / metadata["path"]

        if not image_path.exists():
            raise FileNotFoundError(f"Image file missing: {upload_id}")

        return str(image_path.absolute())

    async def get_image(self, upload_id: str) -> bytes:
        """
        Retrieve image content.

        Args:
            upload_id: Upload identifier

        Returns:
            Image file content

        Raises:
            FileNotFoundError: If image not found
        """
        image_path = await self.get_image_path(upload_id)

        async with aiofiles.open(image_path, 'rb') as f:
            content = await f.read()

        return content

    async def get_metadata(self, upload_id: str) -> Optional[Dict[str, Any]]:
        """
        Get metadata for an uploaded image.

        Args:
            upload_id: Upload identifier

        Returns:
            Metadata dictionary or None if not found
        """
        metadata_path = self.base_path / "metadata" / f"{upload_id}.json"

        if not metadata_path.exists():
            return None

        try:
            async with aiofiles.open(metadata_path, 'r') as f:
                content = await f.read()
                return json.loads(content)
        except Exception as e:
            logger.error(f"Failed to load metadata for {upload_id}: {e}")
            return None

    async def update_metadata(self, upload_id: str, updates: Dict[str, Any]) -> bool:
        """
        Update metadata for an uploaded image.

        Args:
            upload_id: Upload identifier
            updates: Dictionary of fields to update

        Returns:
            True if successful, False otherwise
        """
        metadata = await self.get_metadata(upload_id)
        if not metadata:
            return False

        # Update fields
        metadata.update(updates)
        metadata["updated_at"] = datetime.utcnow().isoformat()

        # Save updated metadata
        metadata_path = self.base_path / "metadata" / f"{upload_id}.json"
        try:
            async with aiofiles.open(metadata_path, 'w') as f:
                await f.write(json.dumps(metadata, indent=2))
            return True
        except Exception as e:
            logger.error(f"Failed to update metadata for {upload_id}: {e}")
            return False

    async def delete_image(self, upload_id: str) -> bool:
        """
        Delete an uploaded image and its metadata.

        Args:
            upload_id: Upload identifier

        Returns:
            True if successful, False otherwise
        """
        try:
            # Get image path
            metadata = await self.get_metadata(upload_id)
            if metadata:
                image_path = self.base_path / metadata["path"]
                if image_path.exists():
                    image_path.unlink()

            # Delete metadata
            metadata_path = self.base_path / "metadata" / f"{upload_id}.json"
            if metadata_path.exists():
                metadata_path.unlink()

            logger.info(f"Image deleted: {upload_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to delete image {upload_id}: {e}")
            return False

    async def list_user_images(self, user_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        """
        List images uploaded by a user.

        Args:
            user_id: User identifier
            limit: Maximum number of results

        Returns:
            List of image metadata
        """
        images = []
        metadata_dir = self.base_path / "metadata"

        for metadata_file in metadata_dir.glob("*.json"):
            if len(images) >= limit:
                break

            try:
                async with aiofiles.open(metadata_file, 'r') as f:
                    content = await f.read()
                    metadata = json.loads(content)

                if metadata.get("user_id") == user_id:
                    images.append(metadata)

            except Exception as e:
                logger.error(f"Error reading metadata file {metadata_file}: {e}")
                continue

        # Sort by upload time (newest first)
        images.sort(key=lambda x: x.get("uploaded_at", ""), reverse=True)

        return images[:limit]

    async def cleanup_old_images(self, days: int = 30) -> int:
        """
        Clean up images older than specified days.

        Args:
            days: Age threshold in days

        Returns:
            Number of images deleted
        """
        from datetime import timedelta

        threshold = datetime.utcnow() - timedelta(days=days)
        deleted_count = 0

        metadata_dir = self.base_path / "metadata"

        for metadata_file in metadata_dir.glob("*.json"):
            try:
                async with aiofiles.open(metadata_file, 'r') as f:
                    content = await f.read()
                    metadata = json.loads(content)

                uploaded_at = datetime.fromisoformat(metadata["uploaded_at"])
                if uploaded_at < threshold:
                    upload_id = metadata["upload_id"]
                    if await self.delete_image(upload_id):
                        deleted_count += 1

            except Exception as e:
                logger.error(f"Error during cleanup: {e}")
                continue

        logger.info(f"Cleanup completed: {deleted_count} images deleted")
        return deleted_count

    async def get_storage_stats(self) -> Dict[str, Any]:
        """
        Get storage statistics.

        Returns:
            Storage statistics dictionary
        """
        total_size = 0
        total_images = 0

        metadata_dir = self.base_path / "metadata"

        for metadata_file in metadata_dir.glob("*.json"):
            try:
                async with aiofiles.open(metadata_file, 'r') as f:
                    content = await f.read()
                    metadata = json.loads(content)
                    total_size += metadata.get("size", 0)
                    total_images += 1
            except Exception:
                continue

        return {
            "total_images": total_images,
            "total_size_bytes": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "storage_type": self.storage_type,
            "base_path": str(self.base_path)
        }


# Global storage service instance
storage_service = StorageService()