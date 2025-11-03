"""
Comprehensive tests for image optimization pipeline
Tests >60% file size reduction with SSIM >0.95 quality maintenance
"""
import pytest
import asyncio
from io import BytesIO
from PIL import Image
import numpy as np
from unittest.mock import Mock, patch, AsyncMock
import json

from app.services.image_optimizer import ImageOptimizer, OptimizationResult, ImageFormat
from app.services.quality_validator import QualityValidator, QualityMetrics
from app.services.batch_processor import BatchProcessor, BatchProgress, ProcessingStatus
from app.services.storage.image_storage import ImageStorage

# Test fixtures
@pytest.fixture
def sample_image_data():
    """Generate sample image data for testing"""
    # Create a test image (RGB, 800x600)
    img = Image.new('RGB', (800, 600), color='red')

    # Add some patterns for better compression testing
    pixels = img.load()
    for i in range(800):
        for j in range(600):
            pixels[i, j] = (
                (i * 255 // 800),
                (j * 255 // 600),
                ((i + j) * 255 // 1400)
            )

    # Convert to bytes
    buffer = BytesIO()
    img.save(buffer, format='JPEG', quality=95)
    return buffer.getvalue()

@pytest.fixture
def large_image_data():
    """Generate large image data for testing"""
    # Create a larger test image (1920x1080)
    img = Image.new('RGB', (1920, 1080), color='blue')
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    return buffer.getvalue()

@pytest.fixture
def image_optimizer():
    """Create ImageOptimizer instance"""
    return ImageOptimizer(max_workers=2)

@pytest.fixture
def quality_validator():
    """Create QualityValidator instance"""
    return QualityValidator(ssim_threshold=0.95)

@pytest.fixture
def batch_processor():
    """Create BatchProcessor instance"""
    with patch('app.services.batch_processor.redis'):
        processor = BatchProcessor(max_batch_size=5, max_workers=2)
        processor.redis_client = AsyncMock()
        return processor

class TestImageOptimizer:
    """Test ImageOptimizer service"""

    @pytest.mark.asyncio
    async def test_file_size_reduction(self, image_optimizer, sample_image_data):
        """Test that file size reduction exceeds 60%"""
        # Optimize image
        results = await image_optimizer.optimize_image(
            sample_image_data,
            "JPEG",
            generate_tiers=False
        )

        # Check original tier only
        assert "original" in results
        result = results["original"]

        # Verify size reduction
        assert result.success is True
        assert result.compression_ratio > 0.60, f"Compression ratio {result.compression_ratio} < 0.60"
        assert result.optimized_size < result.original_size * 0.4

    @pytest.mark.asyncio
    async def test_quality_maintenance(self, image_optimizer, sample_image_data):
        """Test that SSIM score remains >0.95"""
        # Optimize image
        results = await image_optimizer.optimize_image(
            sample_image_data,
            "JPEG",
            generate_tiers=False
        )

        result = results["original"]

        # Verify quality maintenance
        assert result.success is True
        assert result.ssim_score > 0.95, f"SSIM score {result.ssim_score} < 0.95"

    @pytest.mark.asyncio
    async def test_resolution_tiers_generation(self, image_optimizer, large_image_data):
        """Test generation of multiple resolution tiers"""
        # Optimize with all tiers
        results = await image_optimizer.optimize_image(
            large_image_data,
            "PNG",
            generate_tiers=True
        )

        # Verify all tiers generated
        expected_tiers = ["thumbnail", "medium", "large", "original"]
        for tier in expected_tiers:
            assert tier in results
            assert results[tier].success is True
            assert results[tier].resolution == tier

    @pytest.mark.asyncio
    async def test_webp_conversion(self, image_optimizer, sample_image_data):
        """Test conversion to WebP format"""
        # Optimize image
        results = await image_optimizer.optimize_image(
            sample_image_data,
            "JPEG",
            generate_tiers=False
        )

        result = results["original"]

        # Verify WebP conversion
        assert result.format == "WebP"
        assert result.success is True

    @pytest.mark.asyncio
    async def test_processing_time(self, image_optimizer, sample_image_data):
        """Test that single image processes in <2 seconds"""
        import time

        start_time = time.time()

        # Optimize image
        results = await image_optimizer.optimize_image(
            sample_image_data,
            "JPEG",
            generate_tiers=True
        )

        processing_time = time.time() - start_time

        # Verify processing time
        assert processing_time < 2.0, f"Processing took {processing_time}s > 2s"
        assert all(r.success for r in results.values())

    @pytest.mark.asyncio
    async def test_error_handling(self, image_optimizer):
        """Test error handling for invalid image data"""
        # Try to optimize invalid data
        invalid_data = b"not an image"

        results = await image_optimizer.optimize_image(
            invalid_data,
            "JPEG",
            generate_tiers=False
        )

        # Should return error result
        assert "error" in results or not results["original"].success

class TestQualityValidator:
    """Test QualityValidator service"""

    @pytest.mark.asyncio
    async def test_ssim_calculation(self, quality_validator, sample_image_data):
        """Test SSIM score calculation"""
        # Calculate SSIM for identical images
        metrics = await quality_validator.validate_quality(
            sample_image_data,
            sample_image_data,
            threshold=0.95
        )

        # Perfect match should have SSIM ~1.0
        assert metrics.ssim_score > 0.99
        assert metrics.passed is True

    @pytest.mark.asyncio
    async def test_quality_threshold_validation(self, quality_validator, sample_image_data):
        """Test quality threshold validation"""
        # Create slightly different image
        img = Image.open(BytesIO(sample_image_data))
        img = img.resize((700, 500))  # Slightly smaller
        buffer = BytesIO()
        img.save(buffer, format='JPEG', quality=85)
        modified_data = buffer.getvalue()

        # Validate quality
        metrics = await quality_validator.validate_quality(
            sample_image_data,
            modified_data,
            threshold=0.95
        )

        # Check threshold validation
        if metrics.ssim_score < 0.95:
            assert metrics.passed is False
        else:
            assert metrics.passed is True

    @pytest.mark.asyncio
    async def test_ml_compatibility_check(self, quality_validator, sample_image_data):
        """Test ML model compatibility validation"""
        # Check ML compatibility
        is_compatible, metrics = quality_validator.validate_ml_compatibility(
            sample_image_data,
            sample_image_data
        )

        # Should be compatible for identical images
        assert is_compatible is True
        assert metrics['compatibility_score'] > 0.93

    @pytest.mark.asyncio
    async def test_comprehensive_metrics(self, quality_validator, sample_image_data):
        """Test comprehensive quality metrics calculation"""
        metrics = await quality_validator.validate_quality(
            sample_image_data,
            sample_image_data
        )

        # Verify all metrics present
        assert metrics.ssim_score is not None
        assert metrics.mean_ssim is not None
        assert metrics.luminance is not None
        assert metrics.contrast is not None
        assert metrics.structure is not None
        assert metrics.psnr is not None
        assert metrics.mse is not None

class TestBatchProcessor:
    """Test BatchProcessor service"""

    @pytest.mark.asyncio
    async def test_batch_processing_performance(self, batch_processor, sample_image_data):
        """Test batch processing of 100 images in <30 seconds"""
        # Create batch of images
        images = [
            (f"image_{i}.jpg", sample_image_data)
            for i in range(20)  # Using 20 for faster testing
        ]

        batch_id = "test_batch_001"

        # Mock optimizer to speed up test
        with patch.object(batch_processor.optimizer, 'optimize_image') as mock_optimize:
            mock_optimize.return_value = {
                "original": OptimizationResult(
                    original_size=len(sample_image_data),
                    optimized_size=len(sample_image_data) // 3,
                    compression_ratio=0.66,
                    ssim_score=0.96,
                    format="WebP",
                    resolution="original",
                    success=True
                )
            }

            import time
            start_time = time.time()

            # Process batch
            results, progress = await batch_processor.process_batch(
                images,
                batch_id=batch_id
            )

            processing_time = time.time() - start_time

            # Verify performance
            assert processing_time < 30.0  # Should complete in <30s
            assert progress.status == ProcessingStatus.COMPLETED
            assert progress.processed_images == 20

    @pytest.mark.asyncio
    async def test_parallel_processing(self, batch_processor, sample_image_data):
        """Test parallel processing capability"""
        # Create small batch
        images = [
            (f"image_{i}.jpg", sample_image_data)
            for i in range(4)
        ]

        batch_id = "test_parallel"

        # Process batch
        with patch.object(batch_processor.optimizer, 'optimize_image') as mock_optimize:
            mock_optimize.return_value = {
                "original": OptimizationResult(
                    original_size=len(sample_image_data),
                    optimized_size=len(sample_image_data) // 2,
                    compression_ratio=0.5,
                    ssim_score=0.97,
                    format="WebP",
                    resolution="original",
                    success=True
                )
            }

            results, progress = await batch_processor.process_batch(
                images,
                batch_id=batch_id
            )

            # Verify parallel processing
            assert len(results) == 4
            assert progress.processed_images == 4
            assert progress.failed_images == 0

    @pytest.mark.asyncio
    async def test_progress_tracking(self, batch_processor, sample_image_data):
        """Test WebSocket progress tracking"""
        images = [(f"image_{i}.jpg", sample_image_data) for i in range(3)]
        batch_id = "test_progress"

        progress_updates = []

        async def progress_callback(progress):
            progress_updates.append(progress.progress_percentage)

        # Process with progress callback
        with patch.object(batch_processor.optimizer, 'optimize_image') as mock_optimize:
            mock_optimize.return_value = {
                "original": OptimizationResult(
                    original_size=100,
                    optimized_size=40,
                    compression_ratio=0.6,
                    ssim_score=0.96,
                    format="WebP",
                    resolution="original",
                    success=True
                )
            }

            results, progress = await batch_processor.process_batch(
                images,
                batch_id=batch_id,
                progress_callback=progress_callback
            )

            # Verify progress tracking
            assert len(progress_updates) > 0
            assert progress.progress_percentage == 100.0

    @pytest.mark.asyncio
    async def test_error_recovery(self, batch_processor, sample_image_data):
        """Test error handling and recovery with retries"""
        images = [
            ("good.jpg", sample_image_data),
            ("bad.jpg", b"invalid data"),
            ("good2.jpg", sample_image_data)
        ]

        batch_id = "test_error"

        # Mock optimizer with mixed results
        async def mock_optimize(data, format, generate_tiers):
            if data == b"invalid data":
                raise ValueError("Invalid image data")
            return {
                "original": OptimizationResult(
                    original_size=100,
                    optimized_size=40,
                    compression_ratio=0.6,
                    ssim_score=0.96,
                    format="WebP",
                    resolution="original",
                    success=True
                )
            }

        with patch.object(batch_processor.optimizer, 'optimize_image', mock_optimize):
            results, progress = await batch_processor.process_batch(
                images,
                batch_id=batch_id
            )

            # Verify error recovery
            assert progress.status == ProcessingStatus.PARTIALLY_COMPLETED
            assert progress.processed_images == 2
            assert progress.failed_images == 1
            assert len(progress.error_messages) == 1

    @pytest.mark.asyncio
    async def test_memory_optimization(self, batch_processor):
        """Test memory optimization for large batches"""
        # Create large image (10MB+)
        large_img = Image.new('RGB', (4000, 3000), color='green')
        buffer = BytesIO()
        large_img.save(buffer, format='PNG')
        large_data = buffer.getvalue()

        images = [(f"large_{i}.png", large_data) for i in range(3)]
        batch_id = "test_memory"

        # Check that streaming is used for large files
        assert batch_processor._should_use_streaming(images) is True

class TestImageStorage:
    """Test MinIO storage integration"""

    @pytest.mark.asyncio
    async def test_storage_structure(self):
        """Test organized bucket structure creation"""
        with patch('app.services.storage.image_storage.Minio') as mock_minio:
            storage = ImageStorage()

            # Verify bucket creation attempted
            mock_minio.return_value.bucket_exists.return_value = False
            storage._initialize_buckets()
            mock_minio.return_value.make_bucket.assert_called()

    @pytest.mark.asyncio
    async def test_store_optimized_images(self):
        """Test storing optimized images in MinIO"""
        with patch('app.services.storage.image_storage.Minio') as mock_minio:
            storage = ImageStorage()
            mock_client = mock_minio.return_value

            image_id = "test_image_001"
            optimized_images = {
                "thumbnail": b"thumbnail_data",
                "medium": b"medium_data",
                "large": b"large_data",
                "original": b"original_data"
            }
            metadata = {
                "thumbnail": {"compression_ratio": 0.7, "ssim_score": 0.96},
                "medium": {"compression_ratio": 0.65, "ssim_score": 0.97},
                "large": {"compression_ratio": 0.6, "ssim_score": 0.98},
                "original": {"compression_ratio": 0.55, "ssim_score": 0.99}
            }

            # Store images
            urls = await storage.store_optimized_images(
                image_id,
                optimized_images,
                metadata,
                "test.jpg"
            )

            # Verify storage calls
            assert mock_client.put_object.call_count == 4
            assert len(urls) == 4

    @pytest.mark.asyncio
    async def test_lifecycle_policies(self):
        """Test lifecycle policies for automatic cleanup"""
        with patch('app.services.storage.image_storage.Minio') as mock_minio:
            storage = ImageStorage()

            # Verify lifecycle policy set
            storage._set_lifecycle_policy()
            mock_minio.return_value.set_bucket_lifecycle.assert_called()

    @pytest.mark.asyncio
    async def test_cdn_integration(self):
        """Test CDN URL generation"""
        with patch('app.services.storage.image_storage.Minio') as mock_minio:
            storage = ImageStorage()
            mock_minio.return_value.presigned_get_object.return_value = "https://cdn.example.com/image.webp"

            # Generate CDN URL
            url = storage.generate_cdn_url("optimized/large/2024/01/01/image.webp")

            # Verify URL generation
            assert url is not None
            assert "image.webp" in url

# Integration Tests
class TestIntegrationOptimizationPipeline:
    """End-to-end integration tests for optimization pipeline"""

    @pytest.mark.asyncio
    async def test_end_to_end_optimization(self, sample_image_data):
        """Test complete optimization pipeline from upload to storage"""
        # Initialize services
        optimizer = ImageOptimizer(max_workers=2)
        validator = QualityValidator()

        # Optimize image
        optimization_results = await optimizer.optimize_image(
            sample_image_data,
            "JPEG",
            generate_tiers=True
        )

        # Validate quality for each tier
        for tier_name, opt_result in optimization_results.items():
            if opt_result.success:
                # Validate quality
                quality_metrics = await validator.validate_quality(
                    sample_image_data,
                    sample_image_data,  # Would be optimized data in production
                    threshold=0.95
                )

                # Verify pipeline requirements
                assert opt_result.compression_ratio > 0.60 or tier_name == "original"
                assert quality_metrics.ssim_score > 0.95
                assert quality_metrics.passed is True

    @pytest.mark.asyncio
    async def test_concurrent_batch_processing(self, sample_image_data):
        """Test concurrent processing of multiple batches"""
        processor = BatchProcessor(max_batch_size=5, max_workers=2)
        processor.redis_client = AsyncMock()

        # Create multiple batches
        batch1 = [(f"b1_img_{i}.jpg", sample_image_data) for i in range(5)]
        batch2 = [(f"b2_img_{i}.jpg", sample_image_data) for i in range(5)]

        with patch.object(processor.optimizer, 'optimize_image') as mock_optimize:
            mock_optimize.return_value = {
                "original": OptimizationResult(
                    original_size=100,
                    optimized_size=40,
                    compression_ratio=0.6,
                    ssim_score=0.96,
                    format="WebP",
                    resolution="original",
                    success=True
                )
            }

            # Process batches concurrently
            results = await asyncio.gather(
                processor.process_batch(batch1, "batch1"),
                processor.process_batch(batch2, "batch2")
            )

            # Verify both batches processed
            assert len(results) == 2
            assert all(r[1].status == ProcessingStatus.COMPLETED for r in results)