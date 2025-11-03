"""
Test suite for Smart Click Detection with ML Pipeline
Story: STORY-021
"""

import pytest
import numpy as np
import cv2
import time
from unittest.mock import Mock, patch, MagicMock
from typing import Dict, Tuple, List

# Import the modules to be tested
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.smart_click_detection import (
    SmartClickDetector,
    DetectionAlgorithm,
    DetectionResult,
    ConfidenceScore,
    detect_logo_from_click,
    ensemble_voting,
    cache_detection_result
)


class TestSmartClickDetection:
    """Test suite for smart click detection functionality"""

    @pytest.fixture
    def sample_image(self):
        """Create a sample image for testing"""
        # Create a 500x500 RGB image with a logo-like rectangle
        image = np.ones((500, 500, 3), dtype=np.uint8) * 255
        # Add a black rectangle (simulating a logo)
        cv2.rectangle(image, (150, 150), (350, 350), (0, 0, 0), -1)
        return image

    @pytest.fixture
    def detector(self):
        """Initialize the smart click detector"""
        return SmartClickDetector()

    def test_detector_initialization(self, detector):
        """Test that detector initializes with correct algorithms"""
        assert detector is not None
        assert len(detector.algorithms) >= 3
        assert DetectionAlgorithm.CANNY in detector.algorithms
        assert DetectionAlgorithm.GRABCUT in detector.algorithms
        assert DetectionAlgorithm.SAM in detector.algorithms

    def test_click_detection_accuracy(self, detector, sample_image):
        """Test detection accuracy is >90% on test set"""
        # Click point in the middle of the logo
        click_point = (250, 250)

        result = detector.detect(sample_image, click_point)

        assert result is not None
        assert result.confidence >= 0.9
        assert result.bounding_box is not None
        assert len(result.bounding_box) == 4  # x, y, width, height

    def test_edge_detection_opencv(self, detector, sample_image):
        """Test OpenCV Canny edge detection with adaptive thresholds"""
        click_point = (250, 250)

        result = detector.detect_with_canny(sample_image, click_point)

        assert result is not None
        assert result.algorithm == DetectionAlgorithm.CANNY
        assert 0 <= result.confidence <= 1
        assert result.processing_time < 100  # <100ms requirement

    def test_handles_varied_backgrounds(self, detector):
        """Test detection on white, gradient, and complex backgrounds"""
        backgrounds = {
            'white': np.ones((500, 500, 3), dtype=np.uint8) * 255,
            'gradient': np.tile(np.linspace(0, 255, 500), (500, 1, 3)).astype(np.uint8),
            'complex': np.random.randint(0, 255, (500, 500, 3), dtype=np.uint8)
        }

        for bg_type, background in backgrounds.items():
            # Add a logo to each background
            cv2.rectangle(background, (150, 150), (350, 350), (128, 0, 128), -1)

            result = detector.detect(background, (250, 250))

            assert result is not None, f"Failed on {bg_type} background"
            assert result.confidence > 0.7, f"Low confidence on {bg_type}: {result.confidence}"

    def test_real_time_preview(self, detector, sample_image):
        """Test real-time preview with confidence score"""
        click_point = (250, 250)

        result = detector.detect_with_preview(sample_image, click_point)

        assert result is not None
        assert result.preview_image is not None
        assert result.confidence_score is not None
        assert 0 <= result.confidence_score <= 1
        assert result.preview_image.shape == sample_image.shape

    def test_performance_under_100ms(self, detector, sample_image):
        """Test that detection completes in <100ms"""
        click_point = (250, 250)

        start_time = time.time()
        result = detector.detect(sample_image, click_point)
        processing_time = (time.time() - start_time) * 1000

        assert processing_time < 100, f"Processing took {processing_time}ms"
        assert result.processing_time < 100

    def test_fallback_to_manual(self, detector):
        """Test fallback to manual selection with guided assistance"""
        # Create an image where detection should fail
        blank_image = np.ones((500, 500, 3), dtype=np.uint8) * 255
        click_point = (250, 250)

        result = detector.detect(blank_image, click_point)

        assert result is not None
        assert result.fallback_to_manual is True
        assert result.guidance_message is not None
        assert "manual selection" in result.guidance_message.lower()

    @patch('app.smart_click_detection.prometheus_client')
    def test_metrics_export_prometheus(self, mock_prometheus, detector, sample_image):
        """Test metrics are exported to Prometheus"""
        click_point = (250, 250)

        detector.detect(sample_image, click_point)

        # Verify Prometheus metrics were recorded
        assert mock_prometheus.Counter.called
        assert mock_prometheus.Histogram.called
        assert mock_prometheus.Gauge.called

    def test_ensemble_voting(self, detector, sample_image):
        """Test ensemble voting with confidence scoring"""
        click_point = (250, 250)

        # Get results from multiple algorithms
        results = detector.detect_with_ensemble(sample_image, click_point)

        assert len(results) >= 3
        assert all(r.algorithm in DetectionAlgorithm for r in results)

        # Test ensemble voting
        final_result = ensemble_voting(results)
        assert final_result is not None
        assert final_result.confidence >= max(r.confidence for r in results) * 0.8

    def test_ab_testing_different_algorithms(self, detector, sample_image):
        """Test A/B testing framework for different algorithms"""
        click_point = (250, 250)

        # Test with different algorithm configurations
        configs = [
            {'primary': DetectionAlgorithm.CANNY},
            {'primary': DetectionAlgorithm.GRABCUT},
            {'primary': DetectionAlgorithm.SAM}
        ]

        results = []
        for config in configs:
            detector.set_primary_algorithm(config['primary'])
            result = detector.detect(sample_image, click_point)
            results.append(result)

        # All algorithms should produce results
        assert all(r is not None for r in results)
        assert len(set(r.algorithm for r in results)) == 3

    @patch('app.smart_click_detection.redis_client')
    def test_redis_caching(self, mock_redis, detector, sample_image):
        """Test Redis caching for repeated detections"""
        click_point = (250, 250)
        image_hash = detector.compute_image_hash(sample_image, click_point)

        # First detection (cache miss)
        result1 = detector.detect(sample_image, click_point)

        # Second detection (should hit cache)
        mock_redis.get.return_value = result1.to_json()
        result2 = detector.detect(sample_image, click_point)

        assert mock_redis.get.called
        assert mock_redis.set.called
        assert result1.bounding_box == result2.bounding_box

    def test_gpu_acceleration_onnx(self, detector):
        """Test GPU acceleration via ONNX Runtime"""
        if detector.has_gpu_support():
            assert detector.runtime == 'onnxruntime-gpu'
            assert detector.execution_provider == 'CUDAExecutionProvider'
        else:
            assert detector.runtime == 'onnxruntime'
            assert detector.execution_provider == 'CPUExecutionProvider'

    def test_batch_processing(self, detector):
        """Test batch processing for multiple clicks"""
        # Create multiple images and click points
        batch_data = []
        for i in range(10):
            image = np.ones((500, 500, 3), dtype=np.uint8) * 255
            cv2.rectangle(image, (150+i*10, 150), (350+i*10, 350), (0, 0, 0), -1)
            batch_data.append((image, (250+i*10, 250)))

        results = detector.detect_batch(batch_data)

        assert len(results) == 10
        assert all(r is not None for r in results)
        assert all(r.processing_time < 100 for r in results)

    def test_user_satisfaction_tracking(self, detector, sample_image):
        """Test user satisfaction tracking (accept/reject rate)"""
        click_point = (250, 250)

        result = detector.detect(sample_image, click_point)

        # Simulate user feedback
        detector.record_user_feedback(result.id, accepted=True)

        metrics = detector.get_satisfaction_metrics()
        assert 'acceptance_rate' in metrics
        assert 'total_detections' in metrics
        assert metrics['acceptance_rate'] >= 0
        assert metrics['acceptance_rate'] <= 1

    def test_grafana_dashboard_integration(self, detector):
        """Test Grafana dashboard metrics are available"""
        dashboard_metrics = detector.get_dashboard_metrics()

        required_metrics = [
            'detection_accuracy',
            'latency_p50',
            'latency_p95',
            'latency_p99',
            'algorithm_usage',
            'cache_hit_rate',
            'user_satisfaction'
        ]

        for metric in required_metrics:
            assert metric in dashboard_metrics

    def test_integration_with_ml_infrastructure(self, detector):
        """Test integration with Sprint 1 ML infrastructure"""
        # Verify detector uses existing ML model infrastructure
        assert detector.model_server_url is not None
        assert detector.uses_redis_cache is True
        assert detector.auth_enabled is True
        assert detector.metrics_enabled is True


class TestDetectionAlgorithms:
    """Test individual detection algorithms"""

    def test_canny_edge_detection(self):
        """Test Canny edge detection algorithm"""
        image = np.ones((500, 500, 3), dtype=np.uint8) * 255
        cv2.rectangle(image, (150, 150), (350, 350), (0, 0, 0), -1)

        from app.algorithms.canny_detector import CannyDetector
        detector = CannyDetector()

        result = detector.detect(image, (250, 250))

        assert result is not None
        assert result.edges is not None
        assert result.contours is not None
        assert len(result.contours) > 0

    def test_grabcut_segmentation(self):
        """Test GrabCut segmentation for complex backgrounds"""
        image = np.random.randint(0, 255, (500, 500, 3), dtype=np.uint8)
        cv2.rectangle(image, (150, 150), (350, 350), (128, 0, 128), -1)

        from app.algorithms.grabcut_detector import GrabCutDetector
        detector = GrabCutDetector()

        result = detector.detect(image, (250, 250))

        assert result is not None
        assert result.mask is not None
        assert result.foreground is not None

    @pytest.mark.skipif(not os.path.exists('models/sam_model.onnx'),
                        reason="SAM model not available")
    def test_sam_deep_learning(self):
        """Test Segment Anything Model (SAM) for deep learning segmentation"""
        image = np.ones((500, 500, 3), dtype=np.uint8) * 255
        cv2.rectangle(image, (150, 150), (350, 350), (0, 0, 0), -1)

        from app.algorithms.sam_detector import SAMDetector
        detector = SAMDetector()

        result = detector.detect(image, (250, 250))

        assert result is not None
        assert result.segmentation_mask is not None
        assert result.confidence >= 0.8


class TestPerformanceMetrics:
    """Test performance and metrics tracking"""

    def test_detection_accuracy_metrics(self, detector):
        """Test accuracy metrics tracking"""
        test_dataset = detector.load_test_dataset()

        results = []
        for image, click_point, ground_truth in test_dataset:
            result = detector.detect(image, click_point)
            results.append((result, ground_truth))

        accuracy = detector.calculate_accuracy(results)
        assert accuracy >= 0.9  # >90% accuracy requirement

    def test_latency_tracking(self, detector):
        """Test latency tracking per algorithm"""
        latencies = detector.get_algorithm_latencies()

        for algorithm, latency_data in latencies.items():
            assert 'p50' in latency_data
            assert 'p95' in latency_data
            assert 'p99' in latency_data
            assert latency_data['p95'] < 100  # <100ms at P95

    def test_cache_hit_rate(self, detector):
        """Test cache hit rate monitoring"""
        metrics = detector.get_cache_metrics()

        assert 'hit_rate' in metrics
        assert 'total_requests' in metrics
        assert 'cache_hits' in metrics
        assert 'cache_misses' in metrics
        assert metrics['hit_rate'] >= 0
        assert metrics['hit_rate'] <= 1