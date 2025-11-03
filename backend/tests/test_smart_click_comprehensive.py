"""
Comprehensive tests for Smart Click Detection
Achieving proper test coverage for STORY-021
"""

import pytest
import numpy as np
import cv2
import json
import redis
from unittest.mock import Mock, patch, MagicMock
import time
from io import BytesIO

from app.smart_click_detection import (
    SmartClickDetector,
    DetectionResult,
    DetectionAlgorithm,
    ConfidenceScore,
    detect_logo_from_click,
    ensemble_voting,
    cache_detection_result
)


@pytest.fixture
def mock_redis():
    """Mock Redis client"""
    with patch('app.smart_click_detection.redis.Redis') as mock:
        client = MagicMock()
        client.ping.return_value = True
        client.get.return_value = None
        client.set.return_value = True
        mock.return_value = client
        yield client


@pytest.fixture
def mock_onnx():
    """Mock ONNX runtime"""
    with patch('app.smart_click_detection.ort.InferenceSession') as mock:
        session = MagicMock()
        session.get_providers.return_value = ['CPUExecutionProvider']
        mock.return_value = session
        yield session


@pytest.fixture
def detector(mock_redis, mock_onnx):
    """Create detector with mocked dependencies"""
    return SmartClickDetector()


@pytest.fixture
def sample_image():
    """Create sample test image"""
    image = np.ones((500, 500, 3), dtype=np.uint8) * 255
    # Add a black rectangle (simulating a logo)
    cv2.rectangle(image, (150, 150), (350, 350), (0, 0, 0), -1)
    return image


@pytest.fixture
def click_point():
    """Sample click point"""
    return (250, 250)


class TestSmartClickDetector:
    """Test SmartClickDetector class"""

    def test_initialization(self, detector):
        """Test detector initialization"""
        assert detector is not None
        assert detector.primary_algorithm == DetectionAlgorithm.CANNY
        assert len(detector.algorithms) == 3
        assert detector.uses_redis_cache == True
        assert detector.auth_enabled == True
        assert detector.metrics_enabled == True

    def test_gpu_support_check(self, detector):
        """Test GPU support detection"""
        assert detector.has_gpu_support() == False  # Mocked to CPU

    def test_compute_image_hash(self, detector, sample_image, click_point):
        """Test image hash computation"""
        hash1 = detector.compute_image_hash(sample_image, click_point)
        hash2 = detector.compute_image_hash(sample_image, click_point)
        assert hash1 == hash2
        assert len(hash1) == 32  # MD5 hash length

    def test_detect_with_canny(self, detector, sample_image, click_point):
        """Test Canny edge detection"""
        result = detector.detect_with_canny(sample_image, click_point)

        assert result is not None
        assert result.algorithm == DetectionAlgorithm.CANNY
        assert result.bounding_box is not None
        assert len(result.bounding_box) == 4
        assert result.confidence >= 0.0
        assert result.confidence <= 1.0
        assert result.edges is not None
        assert result.contours is not None

    def test_detect_with_grabcut(self, detector, sample_image, click_point):
        """Test GrabCut detection"""
        result = detector.detect_with_grabcut(sample_image, click_point)

        assert result is not None
        assert result.algorithm == DetectionAlgorithm.GRABCUT
        assert result.bounding_box is not None
        assert result.mask is not None
        assert result.foreground is not None

    def test_detect_with_sam(self, detector, sample_image, click_point):
        """Test SAM detection (fallback mode)"""
        result = detector.detect_with_sam(sample_image, click_point)

        assert result is not None
        assert result.algorithm == DetectionAlgorithm.SAM
        assert result.bounding_box is not None

    def test_detect_with_ensemble(self, detector, sample_image, click_point):
        """Test ensemble detection"""
        results = detector.detect_with_ensemble(sample_image, click_point)

        assert isinstance(results, list)
        assert len(results) > 0
        for result in results:
            assert result.bounding_box is not None

    def test_detect_with_cache_miss(self, detector, sample_image, click_point, mock_redis):
        """Test detection with cache miss"""
        mock_redis.get.return_value = None

        result = detector.detect(sample_image, click_point)

        assert result is not None
        assert mock_redis.get.called
        assert mock_redis.set.called

    def test_detect_with_cache_hit(self, detector, sample_image, click_point, mock_redis):
        """Test detection with cache hit"""
        cached_result = DetectionResult(
            id="cached_id",
            algorithm=DetectionAlgorithm.CANNY,
            bounding_box=(100, 100, 200, 200),
            confidence=0.95,
            processing_time=50.0
        )
        mock_redis.get.return_value = cached_result.to_json()

        result = detector.detect(sample_image, click_point)

        assert result is not None
        assert result.id == "cached_id"
        assert result.confidence == 0.95

    def test_detect_with_preview(self, detector, sample_image, click_point):
        """Test detection with preview generation"""
        result = detector.detect_with_preview(sample_image, click_point)

        assert result is not None
        assert result.preview_image is not None
        assert result.preview_image.shape == sample_image.shape

    def test_detect_batch(self, detector, sample_image, click_point):
        """Test batch detection"""
        batch_data = [
            (sample_image, click_point),
            (sample_image, (100, 100)),
            (sample_image, (400, 400))
        ]

        results = detector.detect_batch(batch_data)

        assert len(results) == 3
        for result in results:
            assert result.bounding_box is not None

    def test_fallback_result(self, detector, sample_image, click_point):
        """Test fallback result generation"""
        result = detector._fallback_result(sample_image, click_point)

        assert result is not None
        assert result.fallback_to_manual == True
        assert result.guidance_message is not None
        assert result.confidence == 0.0

    def test_set_primary_algorithm(self, detector):
        """Test setting primary algorithm"""
        detector.set_primary_algorithm(DetectionAlgorithm.GRABCUT)
        assert detector.primary_algorithm == DetectionAlgorithm.GRABCUT

        detector.set_primary_algorithm(DetectionAlgorithm.SAM)
        assert detector.primary_algorithm == DetectionAlgorithm.SAM

    def test_record_user_feedback(self, detector, mock_redis):
        """Test recording user feedback"""
        detector.record_user_feedback("test_id", True)
        assert mock_redis.set.called

        detector.record_user_feedback("test_id", False)
        assert mock_redis.set.call_count == 2

    def test_get_satisfaction_metrics(self, detector):
        """Test satisfaction metrics retrieval"""
        metrics = detector.get_satisfaction_metrics()

        assert 'acceptance_rate' in metrics
        assert 'total_detections' in metrics
        assert 'accepted' in metrics
        assert 'rejected' in metrics

    def test_get_dashboard_metrics(self, detector):
        """Test dashboard metrics"""
        metrics = detector.get_dashboard_metrics()

        assert 'detection_accuracy' in metrics
        assert 'latency_p50' in metrics
        assert 'latency_p95' in metrics
        assert 'latency_p99' in metrics
        assert 'algorithm_usage' in metrics
        assert 'cache_hit_rate' in metrics
        assert 'user_satisfaction' in metrics

    def test_get_algorithm_latencies(self, detector):
        """Test algorithm latency metrics"""
        latencies = detector.get_algorithm_latencies()

        assert 'canny' in latencies
        assert 'grabcut' in latencies
        assert 'sam' in latencies

        for algo, metrics in latencies.items():
            assert 'p50' in metrics
            assert 'p95' in metrics
            assert 'p99' in metrics

    def test_get_cache_metrics(self, detector):
        """Test cache metrics"""
        metrics = detector.get_cache_metrics()

        assert 'hit_rate' in metrics
        assert 'total_requests' in metrics
        assert 'cache_hits' in metrics
        assert 'cache_misses' in metrics

    def test_load_test_dataset(self, detector):
        """Test loading test dataset"""
        test_data = detector.load_test_dataset()

        assert len(test_data) == 10
        for image, click, ground_truth in test_data:
            assert image.shape == (500, 500, 3)
            assert len(click) == 2
            assert len(ground_truth) == 4

    def test_calculate_accuracy(self, detector):
        """Test accuracy calculation"""
        result1 = DetectionResult(
            id="1",
            algorithm=DetectionAlgorithm.CANNY,
            bounding_box=(150, 150, 200, 200),
            confidence=0.9,
            processing_time=50
        )
        ground_truth1 = (150, 150, 200, 200)

        result2 = DetectionResult(
            id="2",
            algorithm=DetectionAlgorithm.CANNY,
            bounding_box=(0, 0, 50, 50),
            confidence=0.5,
            processing_time=40
        )
        ground_truth2 = (150, 150, 200, 200)

        results = [(result1, ground_truth1), (result2, ground_truth2)]
        accuracy = detector.calculate_accuracy(results)

        assert accuracy >= 0.0
        assert accuracy <= 1.0


class TestDetectionResult:
    """Test DetectionResult dataclass"""

    def test_to_json(self):
        """Test JSON serialization"""
        result = DetectionResult(
            id="test_id",
            algorithm=DetectionAlgorithm.CANNY,
            bounding_box=(100, 100, 200, 200),
            confidence=0.85,
            processing_time=45.5
        )

        json_str = result.to_json()
        data = json.loads(json_str)

        assert data['id'] == "test_id"
        assert data['confidence'] == 0.85
        assert data['processing_time'] == 45.5

    def test_from_json(self):
        """Test JSON deserialization"""
        json_str = json.dumps({
            'id': 'test_id',
            'algorithm': 'canny',
            'bounding_box': [100, 100, 200, 200],
            'confidence': 0.85,
            'processing_time': 45.5,
            'preview_image': None,
            'confidence_score': 0.85,
            'fallback_to_manual': False,
            'guidance_message': None,
            'edges': None,
            'contours': None,
            'mask': None,
            'foreground': None,
            'segmentation_mask': None
        })

        result = DetectionResult.from_json(json_str)

        assert result.id == 'test_id'
        assert result.algorithm == DetectionAlgorithm.CANNY
        assert result.bounding_box == (100, 100, 200, 200)
        assert result.confidence == 0.85


class TestUtilityFunctions:
    """Test utility functions"""

    def test_detect_logo_from_click(self, sample_image, click_point, mock_redis, mock_onnx):
        """Test convenience function"""
        result = detect_logo_from_click(sample_image, click_point)

        assert result is not None
        assert isinstance(result, DetectionResult)

    def test_ensemble_voting(self):
        """Test ensemble voting"""
        results = [
            DetectionResult(
                id="1",
                algorithm=DetectionAlgorithm.CANNY,
                bounding_box=(100, 100, 200, 200),
                confidence=0.8,
                processing_time=40
            ),
            DetectionResult(
                id="2",
                algorithm=DetectionAlgorithm.GRABCUT,
                bounding_box=(105, 105, 195, 195),
                confidence=0.9,
                processing_time=60
            ),
            DetectionResult(
                id="3",
                algorithm=DetectionAlgorithm.SAM,
                bounding_box=(102, 102, 198, 198),
                confidence=0.85,
                processing_time=50
            )
        ]

        ensemble_result = ensemble_voting(results)

        assert ensemble_result is not None
        assert ensemble_result.algorithm == DetectionAlgorithm.ENSEMBLE
        assert ensemble_result.confidence == pytest.approx(0.85, 0.01)

    def test_ensemble_voting_empty(self):
        """Test ensemble voting with empty list"""
        result = ensemble_voting([])
        assert result is None

    @patch('app.smart_click_detection.redis.Redis')
    def test_cache_detection_result(self, mock_redis_class):
        """Test caching detection result"""
        mock_client = MagicMock()
        mock_client.set.return_value = True
        mock_redis_class.return_value = mock_client

        result = DetectionResult(
            id="cache_test",
            algorithm=DetectionAlgorithm.CANNY,
            bounding_box=(100, 100, 200, 200),
            confidence=0.75,
            processing_time=35
        )

        success = cache_detection_result(result, ttl=3600)

        assert success == True
        assert mock_client.set.called

    @patch('app.smart_click_detection.redis.Redis')
    def test_cache_detection_result_failure(self, mock_redis_class):
        """Test caching failure handling"""
        mock_redis_class.side_effect = Exception("Connection failed")

        result = DetectionResult(
            id="cache_test",
            algorithm=DetectionAlgorithm.CANNY,
            bounding_box=(100, 100, 200, 200),
            confidence=0.75,
            processing_time=35
        )

        success = cache_detection_result(result, ttl=3600)

        assert success == False


class TestEdgeCases:
    """Test edge cases and error handling"""

    def test_detect_with_invalid_click_point(self, detector, sample_image):
        """Test detection with invalid click point"""
        invalid_point = (-10, -10)
        result = detector.detect(sample_image, invalid_point)

        assert result is not None
        # Should return fallback result
        assert result.fallback_to_manual == True

    def test_detect_with_empty_image(self, detector, click_point):
        """Test detection with empty image"""
        empty_image = np.zeros((100, 100, 3), dtype=np.uint8)
        result = detector.detect(empty_image, click_point)

        assert result is not None

    def test_detect_with_grayscale_image(self, detector, click_point):
        """Test detection with grayscale image"""
        gray_image = np.ones((500, 500), dtype=np.uint8) * 128
        gray_bgr = cv2.cvtColor(gray_image, cv2.COLOR_GRAY2BGR)

        result = detector.detect(gray_bgr, click_point)

        assert result is not None

    def test_detect_batch_with_timeout(self, detector, sample_image):
        """Test batch detection with timeout handling"""
        # Create large batch to potentially trigger timeout
        batch_data = [(sample_image, (i*10, i*10)) for i in range(20)]

        results = detector.detect_batch(batch_data)

        assert len(results) > 0
        assert len(results) <= len(batch_data)

    def test_algorithm_exception_handling(self, detector, sample_image, click_point):
        """Test exception handling in algorithms"""
        # Mock an exception in Canny detection
        with patch.object(detector, 'detect_with_canny', side_effect=Exception("Test error")):
            detector.primary_algorithm = DetectionAlgorithm.CANNY
            result = detector._perform_detection(sample_image, click_point)

            # Should still return a result (fallback)
            assert result is not None