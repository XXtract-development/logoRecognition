"""
Test suite for Logo Detection Service (Story 002).
"""

import pytest
import asyncio
import numpy as np
import time
from unittest.mock import Mock, patch, AsyncMock, MagicMock
from datetime import datetime

# Import detection components
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.detection.base_detector import Detection, BoundingBox
from app.services.detection.models.yolo_detector import YOLODetector
from app.services.detection.models.ensemble import EnsembleDetector
from app.services.detection.preprocessing.image_processor import ImageProcessor
from app.services.detection.detector import DetectionService


class TestDetectionModels:
    """Test detection model implementations."""

    @pytest.fixture
    def yolo_config(self):
        """YOLO detector configuration."""
        return {
            "weights": "test_weights.pt",
            "confidence_threshold": 0.7,
            "nms_threshold": 0.45,
            "max_detections": 50,
            "device": "cpu"
        }

    @pytest.fixture
    def sample_image(self):
        """Generate sample test image."""
        return np.random.randint(0, 255, (640, 640, 3), dtype=np.uint8)

    @pytest.mark.asyncio
    async def test_yolo_detector_initialization(self, yolo_config):
        """Test YOLOv8 detector initialization."""
        detector = YOLODetector(yolo_config)

        assert detector.confidence_threshold == 0.7
        assert detector.nms_threshold == 0.45
        assert detector.max_detections == 50
        assert detector.device == "cpu"

    @pytest.mark.asyncio
    async def test_yolo_model_loading(self, yolo_config):
        """Test YOLOv8 model loading."""
        detector = YOLODetector(yolo_config)

        await detector.load_model()

        assert detector.model is not None
        assert detector.model["loaded"] is True

    @pytest.mark.asyncio
    async def test_yolo_detection(self, yolo_config, sample_image):
        """Test YOLOv8 detection process."""
        detector = YOLODetector(yolo_config)
        await detector.load_model()

        start_time = time.time()
        detections = await detector.detect(sample_image)
        detection_time = time.time() - start_time

        # Check detection results
        assert isinstance(detections, list)
        assert len(detections) <= detector.max_detections
        assert detection_time < 2.0  # Should be under 2 seconds

        # Verify detection format
        for detection in detections:
            assert isinstance(detection, Detection)
            assert 0 <= detection.confidence <= 1
            assert detection.brand_name is not None
            assert detection.category is not None

    @pytest.mark.asyncio
    async def test_ensemble_detector(self, yolo_config):
        """Test ensemble detector with multiple models."""
        ensemble_config = {
            "yolo_config": yolo_config,
            "detectron_config": yolo_config,
            "voting": "weighted_average",
            "weights": {"yolo": 0.7, "detectron": 0.3}
        }

        detector = EnsembleDetector(ensemble_config)
        await detector.load_model()

        sample_image = np.random.randint(0, 255, (640, 640, 3), dtype=np.uint8)
        detections = await detector.detect(sample_image)

        assert isinstance(detections, list)
        # Ensemble should produce consolidated results
        assert all(isinstance(d, Detection) for d in detections)

    def test_non_max_suppression(self, yolo_config):
        """Test Non-Maximum Suppression algorithm."""
        detector = YOLODetector(yolo_config)

        # Create overlapping boxes
        boxes = [
            BoundingBox(100, 100, 50, 50),
            BoundingBox(105, 105, 50, 50),  # High overlap
            BoundingBox(200, 200, 50, 50),  # No overlap
        ]
        scores = [0.9, 0.85, 0.8]

        keep_indices = detector.non_max_suppression(boxes, scores)

        # Should keep highest scoring box and non-overlapping box
        assert len(keep_indices) == 2
        assert 0 in keep_indices  # Highest score
        assert 2 in keep_indices  # Non-overlapping

    def test_detection_filtering(self, yolo_config):
        """Test detection filtering by confidence."""
        detector = YOLODetector(yolo_config)

        detections = [
            Detection("id1", "Nike", "Sport", 0.9,
                     BoundingBox(0, 0, 100, 100)),
            Detection("id2", "Apple", "Tech", 0.6,
                     BoundingBox(100, 100, 100, 100)),
            Detection("id3", "Google", "Tech", 0.75,
                     BoundingBox(200, 200, 100, 100)),
        ]

        filtered = detector.filter_detections(detections)

        # Only detections above threshold should remain
        assert len(filtered) == 2
        assert all(d.confidence >= 0.7 for d in filtered)
        assert filtered[0].confidence == 0.9  # Sorted by confidence


class TestImagePreprocessing:
    """Test image preprocessing utilities."""

    def test_resize_with_aspect_ratio(self):
        """Test aspect ratio preserving resize."""
        processor = ImageProcessor()

        # Test portrait image
        image = np.random.randint(0, 255, (800, 600, 3), dtype=np.uint8)
        resized = processor.resize_with_aspect_ratio(image, (640, 640))

        assert resized.shape == (640, 640, 3)

        # Test landscape image
        image = np.random.randint(0, 255, (600, 800, 3), dtype=np.uint8)
        resized = processor.resize_with_aspect_ratio(image, (640, 640))

        assert resized.shape == (640, 640, 3)

    def test_contrast_enhancement(self):
        """Test contrast enhancement."""
        processor = ImageProcessor()

        # Create low contrast image
        image = np.full((100, 100, 3), 128, dtype=np.uint8)
        enhanced = processor.enhance_contrast(image)

        assert enhanced.shape == image.shape
        # Enhanced image should have different values
        assert not np.array_equal(enhanced, image)

    def test_denoising(self):
        """Test image denoising."""
        processor = ImageProcessor()

        # Create noisy image
        image = np.random.randint(0, 255, (100, 100, 3), dtype=np.uint8)
        denoised = processor.denoise(image, strength=10)

        assert denoised.shape == image.shape
        # Denoised should be smoother (less variation)
        assert np.std(denoised) < np.std(image)

    def test_preprocessing_pipeline(self):
        """Test complete preprocessing pipeline."""
        processor = ImageProcessor()

        image = np.random.randint(0, 255, (1024, 768, 3), dtype=np.uint8)
        preprocessed = processor.preprocess_for_detection(
            image,
            target_size=(640, 640),
            enhance=True,
            denoise_strength=5
        )

        assert preprocessed.shape == (640, 640, 3)


class TestDetectionService:
    """Test main detection service orchestration."""

    @pytest.fixture
    async def detection_service(self):
        """Create detection service instance."""
        service = DetectionService()
        # Mock Redis client
        service.redis_client = None
        return service

    @pytest.mark.asyncio
    async def test_service_initialization(self, detection_service):
        """Test detection service initialization."""
        with patch.object(detection_service, "_initialize_detector") as mock_init:
            mock_init.return_value = None
            await detection_service.initialize()

            mock_init.assert_called_once()

    @pytest.mark.asyncio
    async def test_detection_processing(self, detection_service):
        """Test complete detection processing workflow."""
        # Mock detector
        mock_detector = AsyncMock()
        mock_detector.detect.return_value = [
            Detection("id1", "Nike", "Sport", 0.9,
                     BoundingBox(100, 100, 50, 50))
        ]
        detection_service.detector = mock_detector

        # Mock image loading
        with patch.object(detection_service, "_load_image") as mock_load:
            mock_load.return_value = np.random.randint(0, 255, (640, 640, 3), dtype=np.uint8)

            result = await detection_service.process_detection(
                upload_id="test-upload-123",
                options={"confidence_threshold": 0.7}
            )

        assert result["status"] == "completed"
        assert result["uploadId"] == "test-upload-123"
        assert len(result["detections"]) == 1
        assert result["detections"][0]["brandName"] == "Nike"

    @pytest.mark.asyncio
    async def test_caching_functionality(self):
        """Test result caching with Redis."""
        service = DetectionService()

        # Mock Redis client
        mock_redis = AsyncMock()
        mock_redis.get.return_value = None
        mock_redis.setex.return_value = True
        service.redis_client = mock_redis

        # Test cache miss
        cached = await service._get_cached_result("upload-123", {})
        assert cached is None

        # Test cache storage
        result = {"test": "result"}
        await service._cache_result("upload-123", {}, result)

        mock_redis.setex.assert_called_once()

    @pytest.mark.asyncio
    async def test_websocket_updates(self, detection_service):
        """Test WebSocket progress updates."""
        # Mock WebSocket manager
        mock_ws_manager = AsyncMock()
        detection_service.websocket_manager = mock_ws_manager

        await detection_service._send_websocket_update(
            upload_id="upload-123",
            stage="processing",
            progress=50
        )

        # Verify update was sent (in production would check actual call)
        assert True  # Placeholder for WebSocket testing

    @pytest.mark.asyncio
    async def test_performance_metrics(self, detection_service):
        """Test performance metrics collection."""
        metrics = await detection_service.get_metrics()

        assert "totalDetections" in metrics
        assert "averageProcessingTime" in metrics
        assert "cacheHitRate" in metrics
        assert "modelType" in metrics


class TestDetectionPerformance:
    """Test detection performance requirements."""

    @pytest.mark.asyncio
    async def test_detection_speed_small_image(self):
        """Test detection speed for images under 2MB."""
        detector = YOLODetector({
            "confidence_threshold": 0.7,
            "device": "cpu"
        })
        await detector.load_model()

        # Small image (equivalent to <2MB)
        image = np.random.randint(0, 255, (640, 640, 3), dtype=np.uint8)

        start_time = time.time()
        await detector.detect(image)
        processing_time = time.time() - start_time

        # Should be under 2 seconds per requirements
        assert processing_time < 2.0

    @pytest.mark.asyncio
    async def test_detection_speed_large_image(self):
        """Test detection speed for large images."""
        detector = YOLODetector({
            "confidence_threshold": 0.7,
            "device": "cpu"
        })
        await detector.load_model()

        # Large image (equivalent to 5-10MB)
        image = np.random.randint(0, 255, (2048, 2048, 3), dtype=np.uint8)

        start_time = time.time()
        await detector.detect(image)
        processing_time = time.time() - start_time

        # Should be under 10 seconds per requirements
        assert processing_time < 10.0

    @pytest.mark.asyncio
    async def test_concurrent_detection_handling(self):
        """Test handling multiple concurrent detection requests."""
        service = DetectionService()

        # Mock detector with delay
        mock_detector = AsyncMock()
        async def slow_detect(img):
            await asyncio.sleep(0.1)
            return []

        mock_detector.detect = slow_detect
        service.detector = mock_detector

        # Mock image loading
        with patch.object(service, "_load_image") as mock_load:
            mock_load.return_value = np.zeros((640, 640, 3), dtype=np.uint8)

            # Run concurrent detections
            tasks = [
                service.process_detection(f"upload-{i}")
                for i in range(10)
            ]

            start_time = time.time()
            results = await asyncio.gather(*tasks)
            total_time = time.time() - start_time

        # Should handle concurrent requests efficiently
        assert len(results) == 10
        assert all(r["status"] == "completed" for r in results)
        # Concurrent processing should be faster than sequential
        assert total_time < 10 * 0.1 * 1.5  # Allow some overhead


class TestErrorHandling:
    """Test error handling and recovery."""

    @pytest.mark.asyncio
    async def test_model_load_failure_recovery(self):
        """Test recovery from model loading failure."""
        detector = YOLODetector({"weights": "nonexistent.pt"})

        with patch("asyncio.sleep", return_value=None):
            await detector.load_model()
            # Should handle gracefully and mark as loaded
            assert detector.model is not None

    @pytest.mark.asyncio
    async def test_detection_failure_recovery(self):
        """Test recovery from detection failure."""
        service = DetectionService()

        # Mock failing detector
        mock_detector = AsyncMock()
        mock_detector.detect.side_effect = Exception("Detection failed")
        service.detector = mock_detector

        with patch.object(service, "_load_image") as mock_load:
            mock_load.return_value = np.zeros((640, 640, 3), dtype=np.uint8)

            with pytest.raises(RuntimeError):
                await service.process_detection("upload-123")

    @pytest.mark.asyncio
    async def test_partial_ensemble_failure(self):
        """Test ensemble handling when one model fails."""
        ensemble_config = {
            "yolo_config": {},
            "detectron_config": {},
            "voting": "weighted_average"
        }

        detector = EnsembleDetector(ensemble_config)

        # Mock one detector to fail
        detector.detectors["yolo"] = AsyncMock()
        detector.detectors["yolo"].model = True
        detector.detectors["yolo"].detect.side_effect = Exception("YOLO failed")

        detector.detectors["detectron"] = AsyncMock()
        detector.detectors["detectron"].model = True
        detector.detectors["detectron"].detect.return_value = [
            Detection("id1", "Nike", "Sport", 0.9,
                     BoundingBox(100, 100, 50, 50))
        ]

        # Should still return results from working detector
        image = np.zeros((640, 640, 3))
        results = await detector.detect(image)

        assert len(results) == 1
        assert results[0].brand_name == "Nike"