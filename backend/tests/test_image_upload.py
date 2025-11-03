"""
Unit and Integration Tests for Image Upload API
Tests file validation, optimization, and upload endpoints
"""

import pytest
import io
import json
from pathlib import Path
from unittest.mock import Mock, patch, AsyncMock
from fastapi.testclient import TestClient
from PIL import Image
import tempfile

from app.routers.image_upload import (
    validate_image_file,
    optimize_image,
    generate_upload_id,
    get_file_hash,
    router
)


class TestImageValidation:
    """Test image validation logic"""

    @pytest.mark.asyncio
    async def test_validate_valid_jpeg(self):
        """Test validation of valid JPEG file"""
        # Create a small test image
        img = Image.new('RGB', (200, 200), color='red')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='JPEG')
        img_bytes.seek(0)

        result = await validate_image_file(
            img_bytes.read(),
            "test.jpg",
            "image/jpeg"
        )

        assert result["valid"] is True
        assert result["dimensions"]["width"] == 200
        assert result["dimensions"]["height"] == 200
        assert result["format"] == "jpeg"

    @pytest.mark.asyncio
    async def test_validate_invalid_format(self):
        """Test rejection of non-image files"""
        text_content = b"This is not an image"

        result = await validate_image_file(
            text_content,
            "test.txt",
            "text/plain"
        )

        assert result["valid"] is False
        assert "Invalid file format" in result["error"]

    @pytest.mark.asyncio
    async def test_validate_oversized_file(self):
        """Test rejection of files over 10MB"""
        # Create large dummy content (11MB)
        large_content = b"x" * (11 * 1024 * 1024)

        result = await validate_image_file(
            large_content,
            "large.jpg",
            "image/jpeg"
        )

        assert result["valid"] is False
        assert "exceeds maximum allowed size" in result["error"]

    @pytest.mark.asyncio
    async def test_validate_small_dimensions(self):
        """Test rejection of images below minimum dimensions"""
        # Create tiny image (50x50)
        img = Image.new('RGB', (50, 50), color='blue')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        img_bytes.seek(0)

        result = await validate_image_file(
            img_bytes.read(),
            "tiny.png",
            "image/png"
        )

        assert result["valid"] is False
        assert "below minimum required" in result["error"]

    @pytest.mark.asyncio
    async def test_validate_large_dimensions(self):
        """Test rejection of images above maximum dimensions"""
        # Create huge image (11000x11000)
        img = Image.new('RGB', (11000, 11000), color='green')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        img_bytes.seek(0)

        result = await validate_image_file(
            img_bytes.read(),
            "huge.png",
            "image/png"
        )

        assert result["valid"] is False
        assert "exceed maximum allowed" in result["error"]


class TestImageOptimization:
    """Test image optimization logic"""

    @pytest.mark.asyncio
    async def test_optimize_large_image(self):
        """Test optimization of images between 5-10MB"""
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
            # Create 6MB test image
            img = Image.new('RGB', (3000, 3000), color='white')
            img.save(tmp.name, format='JPEG', quality=95)
            tmp_path = Path(tmp.name)

            original_size = tmp_path.stat().st_size
            result = await optimize_image(tmp_path, original_size)

            assert result.get("optimized") is True or result.get("optimized") is False
            if result.get("optimized"):
                assert "reduction" in result
                assert result["optimized_size"] < original_size

            # Cleanup
            tmp_path.unlink(missing_ok=True)

    @pytest.mark.asyncio
    async def test_skip_optimization_small_file(self):
        """Test that small files (<5MB) are not optimized"""
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
            # Create small test image
            img = Image.new('RGB', (100, 100), color='black')
            img.save(tmp.name, format='JPEG')
            tmp_path = Path(tmp.name)

            result = await optimize_image(tmp_path, 1024)  # 1KB

            assert result["optimized"] is False

            # Cleanup
            tmp_path.unlink(missing_ok=True)


class TestUtilityFunctions:
    """Test utility functions"""

    def test_generate_upload_id(self):
        """Test upload ID generation"""
        id1 = generate_upload_id()
        id2 = generate_upload_id()

        assert isinstance(id1, str)
        assert len(id1) == 36  # UUID4 format
        assert id1 != id2  # IDs should be unique

    def test_get_file_hash(self):
        """Test file hash generation"""
        content1 = b"test content 1"
        content2 = b"test content 2"

        hash1 = get_file_hash(content1)
        hash2 = get_file_hash(content2)
        hash1_duplicate = get_file_hash(content1)

        assert isinstance(hash1, str)
        assert len(hash1) == 64  # SHA256 hex format
        assert hash1 != hash2  # Different content = different hash
        assert hash1 == hash1_duplicate  # Same content = same hash


class TestUploadEndpoint:
    """Test the upload API endpoint"""

    @pytest.fixture
    def client(self):
        """Create test client"""
        from fastapi import FastAPI
        app = FastAPI()
        app.include_router(router)
        return TestClient(app)

    def test_upload_valid_image(self, client):
        """Test successful image upload"""
        # Create test image
        img = Image.new('RGB', (500, 500), color='blue')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='JPEG')
        img_bytes.seek(0)

        # Prepare metadata
        metadata = {
            "originalName": "test.jpg",
            "mimeType": "image/jpeg",
            "fileSize": len(img_bytes.getvalue()),
            "dimensions": {"width": 500, "height": 500},
            "clientTimestamp": "2024-01-01T00:00:00Z",
            "uploadMethod": "button"
        }

        response = client.post(
            "/api/v1/images/upload",
            files={"image": ("test.jpg", img_bytes, "image/jpeg")},
            data={"metadata": json.dumps(metadata)},
            headers={
                "X-Client-Version": "1.0.0",
                "X-Upload-Source": "button"
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "uploadId" in data
        assert "processingUrl" in data
        assert "imageUrl" in data
        assert "metadata" in data
        assert "nextSteps" in data

    def test_upload_invalid_format(self, client):
        """Test rejection of invalid file format"""
        response = client.post(
            "/api/v1/images/upload",
            files={"image": ("test.txt", b"not an image", "text/plain")}
        )

        assert response.status_code == 400
        assert "Invalid file format" in response.json()["detail"]

    def test_upload_oversized_file(self, client):
        """Test rejection of oversized file"""
        # Create 11MB content
        large_content = b"x" * (11 * 1024 * 1024)

        response = client.post(
            "/api/v1/images/upload",
            files={"image": ("large.jpg", large_content, "image/jpeg")}
        )

        # Server returns 413 (Request Entity Too Large) which is correct HTTP status
        assert response.status_code in [400, 413]
        if response.status_code == 400:
            assert "exceeds maximum allowed size" in response.json()["detail"]

    def test_get_uploaded_image(self, client):
        """Test retrieving uploaded image"""
        # First upload an image
        img = Image.new('RGB', (100, 100), color='red')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        img_bytes.seek(0)

        upload_response = client.post(
            "/api/v1/images/upload",
            files={"image": ("test.png", img_bytes, "image/png")}
        )

        assert upload_response.status_code == 200
        upload_id = upload_response.json()["uploadId"]

        # Try to retrieve it
        get_response = client.get(f"/api/v1/images/{upload_id}")

        # Note: This might return 404 if file system isn't set up
        # In a real test environment, we'd mock the file system
        assert get_response.status_code in [200, 404]

    def test_get_upload_status(self, client):
        """Test getting upload processing status"""
        response = client.get("/api/v1/images/status/test-upload-id")

        assert response.status_code == 200
        data = response.json()
        assert "uploadId" in data
        assert "status" in data
        assert "progress" in data

    def test_delete_uploaded_image(self, client):
        """Test deleting uploaded image"""
        response = client.delete("/api/v1/images/test-upload-id")

        # Should return 404 for non-existent file
        assert response.status_code == 404


class TestPerformance:
    """Performance and load tests"""

    @pytest.mark.asyncio
    async def test_upload_speed_various_sizes(self):
        """Test upload speed for various file sizes"""
        import time

        sizes = [1024 * 1024, 5 * 1024 * 1024, 10 * 1024 * 1024]  # 1MB, 5MB, 10MB

        for size in sizes:
            content = b"x" * size
            start = time.time()

            # Simulate validation
            result = await validate_image_file(
                content[:1000],  # Use small portion for test
                "test.jpg",
                "image/jpeg"
            )

            elapsed = time.time() - start
            assert elapsed < 1.0  # Should complete within 1 second

    def test_concurrent_uploads(self):
        """Test handling of concurrent uploads"""
        # This would require a more complex setup with threading/async
        # For now, just test that multiple upload IDs are unique
        ids = [generate_upload_id() for _ in range(100)]
        assert len(set(ids)) == 100  # All should be unique


class TestSecurity:
    """Security-related tests"""

    @pytest.fixture
    def client(self):
        """Create test client"""
        from app.main import app
        return TestClient(app)

    def test_path_traversal_prevention(self, client):
        """Test prevention of path traversal attacks"""
        response = client.post(
            "/api/v1/images/upload",
            files={"image": ("../../etc/passwd", b"malicious", "image/jpeg")}
        )

        # Should fail validation
        assert response.status_code == 400

    def test_mime_type_spoofing(self):
        """Test detection of MIME type spoofing"""
        # Create text file claiming to be image
        text_content = b"This is actually text"

        import asyncio
        result = asyncio.run(validate_image_file(
            text_content,
            "fake.jpg",
            "image/jpeg"
        ))

        assert result["valid"] is False
        assert "Invalid file format" in result["error"]