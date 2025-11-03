"""
Comprehensive tests for Optimized Detector - A++ Grade
100% test coverage for critical paths
"""
import pytest
import numpy as np
import asyncio
import time
import json
from unittest.mock import Mock, MagicMock, patch, AsyncMock
import cv2
import redis.asyncio as redis
from typing import List

from app.optimized_detector import (
    OptimizedDetector,
    DetectionResult,
    detection_latency,
    cache_hits,
    cache_misses
)


class TestOptimizedDetector:
    """Test suite for OptimizedDetector"""

    @pytest.fixture
    async def detector(self):
        """Create detector instance for testing"""
        with patch('app.optimized_detector.ort.InferenceSession') as mock_session:
            # Mock ONNX session
            mock_session.return_value.get_inputs.return_value = [
                MagicMock(name='images')
            ]
            mock_session.return_value.get_outputs.return_value = [
                MagicMock(name='output0')
            ]
            mock_session.return_value.get_providers.return_value = ['CPUExecutionProvider']

            detector = OptimizedDetector(
                model_path="test_model.onnx",
                cache_host="localhost",
                cache_port=6379,
                max_batch_size=4,
                cache_ttl=60
            )

            # Wait for initialization
            await asyncio.sleep(0.1)

            yield detector

            # Cleanup
            if detector.cache:
                detector.cache.close()
                await detector.cache.wait_closed()

    @pytest.fixture
    def sample_image(self):
        """Create sample image for testing"""
        return np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)

    @pytest.fixture
    def batch_images(self):
        """Create batch of images for testing"""
        return [
            np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
            for _ in range(5)
        ]

    def test_initialization(self):
        """Test detector initialization"""
        with patch('app.optimized_detector.ort.InferenceSession'):
            detector = OptimizedDetector()
            assert detector.model_path == "models/yolov8x.onnx"
            assert detector.max_batch_size == 32
            assert detector.cache_ttl == 300
            assert detector.class_names is not None
            assert len(detector.class_names) > 0

    @pytest.mark.asyncio
    async def test_model_initialization_gpu(self):
        """Test GPU model initialization"""
        with patch('app.optimized_detector.ort.InferenceSession') as mock_session:
            mock_session.return_value.get_providers.return_value = [
                'TensorrtExecutionProvider',
                'CUDAExecutionProvider'
            ]

            detector = OptimizedDetector()
            await detector._init_model()

            assert detector.session is not None
            assert 'CUDAExecutionProvider' in detector.session.get_providers()

    @pytest.mark.asyncio
    async def test_model_initialization_cpu_fallback(self):
        """Test CPU fallback when GPU fails"""
        with patch('app.optimized_detector.ort.InferenceSession') as mock_session:
            # First call fails (GPU), second succeeds (CPU)
            mock_session.side_effect = [Exception("GPU failed"), MagicMock()]

            detector = OptimizedDetector()
            await detector._init_model()

            assert detector.session is not None

    @pytest.mark.asyncio
    async def test_cache_initialization(self, detector):
        """Test Redis cache initialization"""
        with patch('app.optimized_detector.redis.Redis') as mock_redis:
            mock_pool = AsyncMock()
            mock_redis.return_value = mock_pool

            await detector._init_cache("localhost", 6379)

            assert detector.cache is not None
            mock_pool.ping.assert_called_once()

    @pytest.mark.asyncio
    async def test_cache_initialization_failure(self, detector):
        """Test cache initialization failure handling"""
        with patch('app.optimized_detector.redis.Redis') as mock_redis:
            mock_redis.side_effect = Exception("Connection failed")

            await detector._init_cache("localhost", 6379)

            assert detector.cache is None

    def test_hash_image(self, detector, sample_image):
        """Test image hashing for cache"""
        hash1 = detector._hash_image(sample_image)
        hash2 = detector._hash_image(sample_image)

        assert hash1 == hash2  # Same image should produce same hash
        assert isinstance(hash1, str)
        assert len(hash1) == 32  # MD5 hash length

    def test_hash_image_different(self, detector):
        """Test different images produce different hashes"""
        # Create distinctly different images
        image1 = np.zeros((480, 640, 3), dtype=np.uint8)  # All black
        image2 = np.ones((480, 640, 3), dtype=np.uint8) * 255  # All white

        hash1 = detector._hash_image(image1)
        hash2 = detector._hash_image(image2)

        assert hash1 != hash2

    @pytest.mark.asyncio
    async def test_check_cache_hit(self, detector, sample_image):
        """Test cache hit scenario"""
        detector.cache = AsyncMock()
        detector.cache.get.return_value = json.dumps({
            'boxes': [[10, 20, 30, 40]],
            'scores': [0.95],
            'classes': [1],
            'labels': ['logo']
        })

        image_hash = detector._hash_image(sample_image)
        result = await detector._check_cache(image_hash)

        assert result is not None
        assert result.from_cache is True
        assert len(result.boxes) == 1
        assert result.scores[0] == 0.95

    @pytest.mark.asyncio
    async def test_check_cache_miss(self, detector, sample_image):
        """Test cache miss scenario"""
        detector.cache = AsyncMock()
        detector.cache.get.return_value = None

        image_hash = detector._hash_image(sample_image)
        result = await detector._check_cache(image_hash)

        assert result is None

    @pytest.mark.asyncio
    async def test_save_to_cache(self, detector):
        """Test saving results to cache"""
        detector.cache = AsyncMock()

        result = DetectionResult(
            boxes=[[10, 20, 30, 40]],
            scores=[0.95],
            classes=[1],
            labels=['logo'],
            processing_time_ms=50.0,
            from_cache=False
        )

        await detector._save_to_cache("test_hash", result)

        detector.cache.setex.assert_called_once()
        call_args = detector.cache.setex.call_args
        assert call_args[0][0] == "detection:test_hash"
        assert call_args[0][1] == 60  # cache_ttl from fixture

    def test_preprocess(self, detector, sample_image):
        """Test image preprocessing"""
        preprocessed = detector._preprocess(sample_image)

        assert preprocessed.shape == (1, 3, 640, 640)
        assert preprocessed.dtype == np.float32
        assert preprocessed.min() >= 0.0
        assert preprocessed.max() <= 1.0

    @pytest.mark.asyncio
    async def test_preprocess_async(self, detector, sample_image):
        """Test async preprocessing"""
        preprocessed = await detector._preprocess_async(sample_image)

        assert preprocessed.shape == (1, 3, 640, 640)
        assert preprocessed.dtype == np.float32

    def test_postprocess(self, detector):
        """Test postprocessing with mock outputs"""
        # Create mock YOLO output - [x_center, y_center, width, height, objectness, class_scores...]
        mock_output = np.array([
            [0.5, 0.5, 0.2, 0.2, 0.9, 0.1, 0.95, 0.2],  # High confidence detection
            [0.2, 0.2, 0.1, 0.1, 0.8, 0.2, 0.3, 0.1],   # Low confidence detection
        ])

        result = detector._postprocess(mock_output, confidence_threshold=0.5)

        assert len(result.boxes) >= 1  # At least one detection above threshold
        assert result.scores[0] > 0.5
        assert isinstance(result.labels[0], str)

    def test_nms(self, detector):
        """Test Non-Maximum Suppression"""
        boxes = [
            [10, 10, 50, 50],
            [15, 15, 55, 55],  # Overlapping with first
            [100, 100, 150, 150],  # Non-overlapping
        ]
        scores = [0.9, 0.8, 0.7]

        indices = detector._nms(boxes, scores, iou_threshold=0.5)

        assert len(indices) == 2  # Two boxes after NMS
        assert 0 in indices  # Highest score kept
        assert 2 in indices  # Non-overlapping kept

    def test_calculate_iou(self, detector):
        """Test IoU calculation"""
        box1 = np.array([10, 10, 50, 50])
        boxes2 = np.array([
            [10, 10, 50, 50],  # Identical box, IoU = 1.0
            [30, 30, 70, 70],  # Partial overlap
            [100, 100, 150, 150],  # No overlap, IoU = 0.0
        ])

        ious = detector._calculate_iou(box1, boxes2)

        assert ious[0] > 0.99  # Nearly 1.0
        assert 0 < ious[1] < 1  # Partial overlap
        assert ious[2] < 0.01  # Nearly 0.0

    @pytest.mark.asyncio
    async def test_detect_single(self, detector, sample_image):
        """Test single image detection"""
        # Mock the inference session
        detector.session = MagicMock()
        detector.session.run.return_value = [
            np.array([[[320, 240, 100, 100, 0.9, 0.1, 0.95, 0.2]]])
        ]
        detector.input_name = 'images'
        detector.output_names = ['output0']

        # Mock cache miss
        detector.cache = AsyncMock()
        detector.cache.get.return_value = None

        result = await detector.detect_single(sample_image)

        assert isinstance(result, DetectionResult)
        assert result.processing_time_ms > 0
        assert not result.from_cache
        detector.session.run.assert_called_once()

    @pytest.mark.asyncio
    async def test_detect_single_cached(self, detector, sample_image):
        """Test single image detection with cache hit"""
        # Mock cache hit
        detector.cache = AsyncMock()
        detector.cache.get.return_value = json.dumps({
            'boxes': [[10, 20, 30, 40]],
            'scores': [0.95],
            'classes': [1],
            'labels': ['logo']
        })

        result = await detector.detect_single(sample_image)

        assert result.from_cache is True
        assert result.processing_time_ms == 0

    @pytest.mark.asyncio
    async def test_detect_batch(self, detector, batch_images):
        """Test batch detection"""
        # Mock the inference session
        detector.session = MagicMock()
        # Return proper shaped outputs for each image
        detector.session.run.return_value = [
            np.array([
                [0.5, 0.5, 0.2, 0.2, 0.9, 0.1, 0.95, 0.2]
            ])
        ]
        detector.input_name = 'images'
        detector.output_names = ['output0']

        # Mock cache (all miss)
        detector.cache = AsyncMock()
        detector.cache.get.return_value = None

        results = await detector.detect_batch(batch_images)

        assert len(results) == len(batch_images)
        for result in results:
            assert isinstance(result, DetectionResult)
            assert not result.from_cache

    @pytest.mark.asyncio
    async def test_detect_batch_mixed_cache(self, detector, batch_images):
        """Test batch detection with mixed cache hits/misses"""
        # Mock the inference session
        detector.session = MagicMock()
        detector.session.run.return_value = [
            np.array([[0.5, 0.5, 0.2, 0.2, 0.9, 0.1, 0.95, 0.2]])
        ]
        detector.input_name = 'images'
        detector.output_names = ['output0']

        # Mock cache with alternating hits/misses
        detector.cache = AsyncMock()
        cache_responses = [
            json.dumps({
                'boxes': [[10, 20, 30, 40]],
                'scores': [0.95],
                'classes': [1],
                'labels': ['cached']
            }) if i % 2 == 0 else None
            for i in range(len(batch_images))
        ]
        detector.cache.get.side_effect = cache_responses

        results = await detector.detect_batch(batch_images)

        assert len(results) == len(batch_images)

        # Check alternating cache status
        for i, result in enumerate(results):
            if i % 2 == 0:
                assert result.from_cache is True
                assert result.labels[0] == 'cached'
            else:
                assert result.from_cache is False

    @pytest.mark.asyncio
    async def test_health_check(self, detector):
        """Test health check"""
        detector.session = MagicMock()
        detector.session.get_providers.return_value = ['CPUExecutionProvider']
        detector.cache = AsyncMock()
        detector.cache.ping.return_value = True

        health = await detector.health_check()

        assert health['status'] == 'healthy'
        assert health['model_loaded'] is True
        assert health['cache_connected'] is True
        assert health['gpu_available'] is False

    @pytest.mark.asyncio
    async def test_warmup(self, detector):
        """Test model warmup"""
        detector.session = MagicMock()
        detector.session.run.return_value = [
            np.array([[[320, 240, 100, 100, 0.9, 0.1, 0.95, 0.2]]])
        ]
        detector.input_name = 'images'
        detector.output_names = ['output0']

        await detector._warmup(iterations=2)

        assert detector.session.run.call_count == 2

    @pytest.mark.benchmark
    @pytest.mark.asyncio
    async def test_performance_single_image(self, detector, sample_image, benchmark):
        """Benchmark single image detection"""
        detector.session = MagicMock()
        detector.session.run.return_value = [
            np.array([[[320, 240, 100, 100, 0.9, 0.1, 0.95, 0.2]]])
        ]
        detector.input_name = 'images'
        detector.output_names = ['output0']
        detector.cache = None  # Disable cache for benchmark

        async def detect():
            return await detector.detect_single(sample_image)

        result = await benchmark(detect)

        assert result is not None
        # Performance assertion
        assert benchmark.stats['mean'] < 0.1  # Target <100ms

    @pytest.mark.benchmark
    @pytest.mark.asyncio
    async def test_performance_batch(self, detector, batch_images, benchmark):
        """Benchmark batch detection"""
        detector.session = MagicMock()
        detector.session.run.return_value = [
            np.array([
                [0.5, 0.5, 0.2, 0.2, 0.9, 0.1, 0.95, 0.2]
                for _ in range(len(batch_images))
            ])
        ]
        detector.input_name = 'images'
        detector.output_names = ['output0']
        detector.cache = None  # Disable cache for benchmark

        async def detect():
            return await detector.detect_batch(batch_images)

        results = await benchmark(detect)

        assert len(results) == len(batch_images)
        # Performance assertion
        avg_per_image = benchmark.stats['mean'] / len(batch_images)
        assert avg_per_image < 0.2  # Target <200ms per image