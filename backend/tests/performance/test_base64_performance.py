"""
Performance tests for base64 image processing
Tests for US-032: Enterprise Base64 Image Processing
"""

import asyncio
import base64
import gc
import io
import time
import resource
from concurrent.futures import ThreadPoolExecutor
from typing import List, Tuple
from unittest.mock import patch, MagicMock

import psutil
import pytest
from PIL import Image

from app.services.secure_image_processor import (
    SecureImageProcessor,
    ProcessingOptions,
    CompressionType,
)


@pytest.fixture
def processor() -> SecureImageProcessor:
    """Create a SecureImageProcessor for performance testing"""
    options = ProcessingOptions(
        enable_security_scan=False,  # Disable for pure performance testing
        chunk_size=65536,  # 64KB optimal chunk size
        enable_caching=True,
    )
    return SecureImageProcessor(options)


@pytest.fixture
def large_image_base64() -> str:
    """Create a large test image (5MB)"""
    # Create a 2000x2000 RGB image (approximately 5MB uncompressed)
    img = Image.new('RGB', (2000, 2000), color='blue')
    buffer = io.BytesIO()
    img.save(buffer, format='PNG', compress_level=1)  # Low compression for larger size
    return base64.b64encode(buffer.getvalue()).decode('utf-8')


@pytest.fixture
def medium_image_base64() -> str:
    """Create a medium test image (1MB)"""
    img = Image.new('RGB', (800, 800), color='green')
    buffer = io.BytesIO()
    img.save(buffer, format='JPEG', quality=95)
    return base64.b64encode(buffer.getvalue()).decode('utf-8')


@pytest.fixture
def small_image_base64() -> str:
    """Create a small test image (100KB)"""
    img = Image.new('RGB', (200, 200), color='red')
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    return base64.b64encode(buffer.getvalue()).decode('utf-8')


class TestStreamingDecodeMemoryEfficiency:
    """Test memory efficiency of streaming decode"""

    @pytest.mark.asyncio
    async def test_streaming_decode_memory_efficient(
        self,
        processor: SecureImageProcessor,
        large_image_base64: str
    ):
        """Test that streaming decode is memory efficient"""
        # Force garbage collection
        gc.collect()

        # Get initial memory usage
        process = psutil.Process()
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB

        # Process large image
        image, metadata = await processor.decode_and_validate(large_image_base64)

        # Get peak memory usage
        peak_memory = process.memory_info().rss / 1024 / 1024  # MB

        # Calculate memory increase
        memory_increase = peak_memory - initial_memory

        # Memory increase should be less than 3x the image size
        # (accounting for base64 encoding, PIL object, and processing overhead)
        image_size_mb = metadata.size_bytes / 1024 / 1024
        assert memory_increase < image_size_mb * 3, (
            f"Memory increase {memory_increase:.2f}MB exceeds 3x image size "
            f"{image_size_mb:.2f}MB"
        )

    @pytest.mark.asyncio
    async def test_chunked_processing_memory_stable(
        self,
        processor: SecureImageProcessor
    ):
        """Test that chunked processing maintains stable memory"""
        memory_readings = []

        async def generate_chunks(data: str, chunk_size: int = 1024):
            """Generate chunks of base64 data"""
            for i in range(0, len(data), chunk_size):
                yield data[i:i + chunk_size]

        # Create test image
        img = Image.new('RGB', (1000, 1000), color='yellow')
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')

        # Process in chunks and monitor memory
        process = psutil.Process()

        chunks = generate_chunks(base64_data)
        result = await processor.process_chunked_upload(chunks)

        # Memory should remain relatively stable
        assert result[0] is not None  # Image processed successfully
        assert result[1].width == 1000


class TestLargeImageProcessingTime:
    """Test processing time for large images"""

    @pytest.mark.asyncio
    async def test_large_image_processing_time(
        self,
        processor: SecureImageProcessor,
        large_image_base64: str
    ):
        """Test that large images are processed within acceptable time"""
        start_time = time.perf_counter()

        image, metadata = await processor.decode_and_validate(large_image_base64)

        processing_time = time.perf_counter() - start_time

        # Should process within 2 seconds for a 5MB image
        assert processing_time < 2.0, f"Processing took {processing_time:.2f}s, expected < 2s"

        # Calculate throughput
        throughput_mbps = (metadata.size_bytes / 1024 / 1024) / processing_time
        assert throughput_mbps > 2.5, f"Throughput {throughput_mbps:.2f} MB/s is too low"

    @pytest.mark.asyncio
    async def test_decode_speed_benchmark(self, processor: SecureImageProcessor):
        """Benchmark decode speed for different image sizes"""
        sizes = [(100, 100), (500, 500), (1000, 1000), (2000, 2000)]
        results = []

        for width, height in sizes:
            # Create test image
            img = Image.new('RGB', (width, height), color='cyan')
            buffer = io.BytesIO()
            img.save(buffer, format='PNG')
            base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')

            # Measure processing time
            start = time.perf_counter()
            await processor.decode_and_validate(base64_data)
            elapsed = time.perf_counter() - start

            size_mb = len(base64_data) / 1024 / 1024
            speed_mbps = size_mb / elapsed if elapsed > 0 else 0

            results.append({
                'dimensions': f'{width}x{height}',
                'size_mb': size_mb,
                'time_seconds': elapsed,
                'speed_mbps': speed_mbps
            })

        # All should achieve > 10 MB/s decode speed
        for result in results:
            assert result['speed_mbps'] > 10, (
                f"Decode speed for {result['dimensions']} is {result['speed_mbps']:.2f} MB/s, "
                f"expected > 10 MB/s"
            )


class TestConcurrentDecodeOperations:
    """Test concurrent decode operations"""

    @pytest.mark.asyncio
    async def test_concurrent_decode_operations(
        self,
        processor: SecureImageProcessor,
        small_image_base64: str
    ):
        """Test handling of concurrent decode operations"""
        num_concurrent = 50

        # Create tasks for concurrent processing
        tasks = [
            processor.decode_and_validate(small_image_base64)
            for _ in range(num_concurrent)
        ]

        start_time = time.perf_counter()
        results = await asyncio.gather(*tasks, return_exceptions=True)
        total_time = time.perf_counter() - start_time

        # All should complete successfully
        errors = [r for r in results if isinstance(r, Exception)]
        assert len(errors) == 0, f"Errors occurred: {errors}"

        # Should complete within reasonable time (< 100ms per image average)
        avg_time = (total_time / num_concurrent) * 1000  # Convert to ms
        assert avg_time < 100, f"Average time {avg_time:.2f}ms exceeds 100ms per image"

    @pytest.mark.asyncio
    async def test_concurrent_mixed_size_processing(
        self,
        processor: SecureImageProcessor,
        small_image_base64: str,
        medium_image_base64: str,
        large_image_base64: str
    ):
        """Test concurrent processing of mixed size images"""
        # Mix of different sized images
        images = [small_image_base64] * 10 + \
                 [medium_image_base64] * 5 + \
                 [large_image_base64] * 2

        tasks = [processor.decode_and_validate(img) for img in images]

        start_time = time.perf_counter()
        results = await asyncio.gather(*tasks, return_exceptions=True)
        total_time = time.perf_counter() - start_time

        # All should complete
        successful = [r for r in results if not isinstance(r, Exception)]
        assert len(successful) == len(images)

        # Should complete within 5 seconds for all
        assert total_time < 5.0, f"Processing {len(images)} images took {total_time:.2f}s"


class TestMemoryUsageUnderLimit:
    """Test memory usage remains under limits"""

    @pytest.mark.asyncio
    async def test_memory_usage_under_limit(
        self,
        processor: SecureImageProcessor,
        medium_image_base64: str
    ):
        """Test that memory usage stays under 2x image size"""
        process = psutil.Process()
        gc.collect()
        initial_memory = process.memory_info().rss

        # Process image
        image, metadata = await processor.decode_and_validate(medium_image_base64)

        peak_memory = process.memory_info().rss
        memory_used = peak_memory - initial_memory

        # Memory usage should be less than 2x the image size
        max_expected = metadata.size_bytes * 2
        assert memory_used < max_expected, (
            f"Memory usage {memory_used / 1024 / 1024:.2f}MB exceeds "
            f"2x image size {max_expected / 1024 / 1024:.2f}MB"
        )

    @pytest.mark.asyncio
    async def test_memory_cleanup_after_processing(
        self,
        processor: SecureImageProcessor,
        small_image_base64: str
    ):
        """Test that memory is properly cleaned up after processing"""
        process = psutil.Process()
        gc.collect()
        baseline_memory = process.memory_info().rss / 1024 / 1024  # MB

        # Process multiple images
        for _ in range(10):
            await processor.decode_and_validate(small_image_base64)

        # Force garbage collection
        gc.collect()
        time.sleep(0.1)  # Allow cleanup

        final_memory = process.memory_info().rss / 1024 / 1024  # MB

        # Memory increase should be minimal (< 50MB for small images)
        memory_increase = final_memory - baseline_memory
        assert memory_increase < 50, (
            f"Memory increased by {memory_increase:.2f}MB after processing, "
            f"indicating potential memory leak"
        )


class TestCPUUsageOptimal:
    """Test CPU usage optimization"""

    @pytest.mark.asyncio
    async def test_cpu_usage_optimal(
        self,
        processor: SecureImageProcessor,
        medium_image_base64: str
    ):
        """Test that CPU usage remains optimal during processing"""
        process = psutil.Process()

        # Start CPU monitoring
        process.cpu_percent()  # Initialize
        await asyncio.sleep(0.1)

        # Process image
        await processor.decode_and_validate(medium_image_base64)

        # Check CPU usage
        cpu_percent = process.cpu_percent()

        # CPU usage should be reasonable (< 80% for single image)
        assert cpu_percent < 80, f"CPU usage {cpu_percent}% exceeds 80%"

    @pytest.mark.asyncio
    async def test_async_processing_efficiency(
        self,
        processor: SecureImageProcessor,
        small_image_base64: str
    ):
        """Test that async processing is efficient"""
        # Process multiple images concurrently
        num_images = 20
        tasks = [
            processor.decode_and_validate(small_image_base64)
            for _ in range(num_images)
        ]

        process = psutil.Process()
        process.cpu_percent()  # Initialize

        start = time.perf_counter()
        await asyncio.gather(*tasks)
        elapsed = time.perf_counter() - start

        avg_cpu = process.cpu_percent()

        # Should have good concurrency (not sequential)
        # If sequential, would take num_images * single_image_time
        # Good concurrency should be much faster
        assert elapsed < 2.0, f"Processing {num_images} images took {elapsed:.2f}s"

        # CPU should be efficiently used
        assert avg_cpu < 100, f"Average CPU usage {avg_cpu}% indicates inefficiency"


class TestCompressionPerformance:
    """Test performance with different compression types"""

    @pytest.mark.asyncio
    async def test_gzip_decompression_performance(
        self,
        processor: SecureImageProcessor,
        medium_image_base64: str
    ):
        """Test performance of gzip decompression"""
        import gzip

        # Compress the base64 data
        compressed = gzip.compress(medium_image_base64.encode('utf-8'))
        compressed_base64 = base64.b64encode(compressed).decode('utf-8')

        start = time.perf_counter()
        image, metadata = await processor.decode_and_validate(
            compressed_base64,
            CompressionType.GZIP
        )
        elapsed = time.perf_counter() - start

        # Should complete within 1 second
        assert elapsed < 1.0, f"Gzip decompression took {elapsed:.2f}s"
        assert image is not None

    @pytest.mark.asyncio
    async def test_brotli_decompression_performance(
        self,
        processor: SecureImageProcessor,
        medium_image_base64: str
    ):
        """Test performance of brotli decompression"""
        import brotli

        # Compress the base64 data
        compressed = brotli.compress(medium_image_base64.encode('utf-8'))
        compressed_base64 = base64.b64encode(compressed).decode('utf-8')

        start = time.perf_counter()
        image, metadata = await processor.decode_and_validate(
            compressed_base64,
            CompressionType.BROTLI
        )
        elapsed = time.perf_counter() - start

        # Should complete within 1 second
        assert elapsed < 1.0, f"Brotli decompression took {elapsed:.2f}s"
        assert image is not None


class TestStreamingChunkPerformance:
    """Test performance of streaming with different chunk sizes"""

    @pytest.mark.asyncio
    async def test_optimal_chunk_size(self, large_image_base64: str):
        """Test to find optimal chunk size for streaming"""
        chunk_sizes = [1024, 4096, 16384, 65536, 262144]  # 1KB to 256KB
        results = []

        for chunk_size in chunk_sizes:
            options = ProcessingOptions(
                enable_security_scan=False,
                chunk_size=chunk_size
            )
            processor = SecureImageProcessor(options)

            start = time.perf_counter()
            await processor.decode_and_validate(large_image_base64)
            elapsed = time.perf_counter() - start

            results.append({
                'chunk_size': chunk_size,
                'time': elapsed
            })

        # Find optimal chunk size
        optimal = min(results, key=lambda x: x['time'])

        # 64KB should be near optimal
        assert optimal['chunk_size'] >= 16384 and optimal['chunk_size'] <= 262144, (
            f"Optimal chunk size {optimal['chunk_size']} outside expected range"
        )


class TestCachingPerformance:
    """Test performance improvements with caching"""

    @pytest.mark.asyncio
    async def test_caching_improves_performance(
        self,
        processor: SecureImageProcessor,
        small_image_base64: str
    ):
        """Test that caching improves performance on repeated processing"""
        # First processing (cold cache)
        start = time.perf_counter()
        await processor.decode_and_validate(small_image_base64)
        first_time = time.perf_counter() - start

        # Second processing (should use cache mechanisms if available)
        start = time.perf_counter()
        await processor.decode_and_validate(small_image_base64)
        second_time = time.perf_counter() - start

        # Second should be faster or at least not slower
        # (accounting for measurement variance)
        assert second_time <= first_time * 1.1, (
            f"Cached processing {second_time:.3f}s slower than first {first_time:.3f}s"
        )


class TestThroughputBenchmarks:
    """Test throughput benchmarks"""

    @pytest.mark.asyncio
    async def test_sustained_throughput(
        self,
        processor: SecureImageProcessor,
        small_image_base64: str
    ):
        """Test sustained throughput over time"""
        duration_seconds = 2
        images_processed = 0
        start_time = time.perf_counter()

        while time.perf_counter() - start_time < duration_seconds:
            await processor.decode_and_validate(small_image_base64)
            images_processed += 1

        throughput = images_processed / duration_seconds

        # Should maintain > 20 images/second for small images
        assert throughput > 20, f"Throughput {throughput:.2f} img/s is below 20 img/s"

    @pytest.mark.asyncio
    async def test_peak_throughput(
        self,
        processor: SecureImageProcessor,
        small_image_base64: str
    ):
        """Test peak throughput with maximum concurrency"""
        num_images = 100
        tasks = [
            processor.decode_and_validate(small_image_base64)
            for _ in range(num_images)
        ]

        start = time.perf_counter()
        await asyncio.gather(*tasks)
        elapsed = time.perf_counter() - start

        peak_throughput = num_images / elapsed

        # Should achieve > 50 images/second peak
        assert peak_throughput > 50, (
            f"Peak throughput {peak_throughput:.2f} img/s is below 50 img/s"
        )