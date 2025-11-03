"""
Main detection service orchestrating logo detection pipeline.
"""

import asyncio
import uuid
from typing import List, Dict, Any, Optional
import numpy as np
import cv2
import logging
import time
import json
from datetime import datetime
import redis.asyncio as redis

from .base_detector import Detection
from .models.yolo_detector import YOLODetector
from .models.detectron_detector import DetectronDetector
from .models.ensemble import EnsembleDetector
from .preprocessing.image_processor import ImageProcessor
from ..storage import storage_service
from ...utils.redis_pool import redis_pool
from ...utils.circuit_breaker import circuit_breaker

logger = logging.getLogger(__name__)


class DetectionService:
    """
    Main service for orchestrating logo detection workflow.

    This service handles the complete detection pipeline including
    model selection, preprocessing, caching, and WebSocket updates.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize detection service with configuration.

        Args:
            config: Service configuration dictionary.
        """
        self.config = config or self._get_default_config()

        # Initialize model based on configuration
        self.model_type = self.config.get("model_type", "yolo")
        self.detector = None

        # Redis for caching
        self.redis_client = None
        self.cache_ttl = self.config.get("cache_ttl", 3600)  # 1 hour default

        # WebSocket manager (will be set by FastAPI app)
        self.websocket_manager = None

        # Performance monitoring
        self.metrics = {
            "total_detections": 0,
            "total_time": 0,
            "cache_hits": 0,
            "cache_misses": 0
        }

    def _get_default_config(self) -> Dict[str, Any]:
        """
        Get default configuration for detection service.

        Returns:
            Default configuration dictionary.
        """
        return {
            "model_type": "yolo",
            "yolo_config": {
                "weights": "yolov8x_logo_trained.pt",
                "confidence_threshold": 0.7,
                "nms_threshold": 0.45,
                "max_detections": 50
            },
            "detectron_config": {
                "weights": "logo_detection_R50_FPN.pth",
                "confidence_threshold": 0.65
            },
            "ensemble_config": {
                "voting": "weighted_average",
                "weights": {"yolo": 0.7, "detectron": 0.3}
            },
            "preprocessing": {
                "enhance_contrast": True,
                "denoise_strength": 0,
                "target_size": (640, 640)
            },
            "cache_ttl": 3600,
            "enable_websocket": True
        }

    async def initialize(self) -> None:
        """
        Initialize the detection service and load models.

        This should be called on application startup.
        """
        logger.info("Initializing detection service...")

        # Initialize Redis connection from pool
        try:
            await redis_pool.initialize()
            self.redis_client = await redis_pool.get_client()
            logger.info("Redis connection established via pool")
        except Exception as e:
            logger.warning(f"Redis not available, caching disabled: {e}")
            self.redis_client = None

        # Initialize detector based on model type
        await self._initialize_detector()

        logger.info("Detection service initialized successfully")

    async def _initialize_detector(self) -> None:
        """
        Initialize the appropriate detector based on configuration.
        """
        if self.model_type == "yolo":
            self.detector = YOLODetector(self.config.get("yolo_config", {}))
        elif self.model_type == "detectron":
            self.detector = DetectronDetector(self.config.get("detectron_config", {}))
        elif self.model_type == "ensemble":
            self.detector = EnsembleDetector(self.config.get("ensemble_config", {}))
        else:
            raise ValueError(f"Unknown model type: {self.model_type}")

        await self.detector.load_model()
        logger.info(f"Loaded {self.model_type} detector")

    async def process_detection(self, upload_id: str,
                               options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Process logo detection for an uploaded image.

        Args:
            upload_id: UUID of the uploaded image.
            options: Detection options (confidence threshold, etc.).

        Returns:
            Detection results dictionary.

        Raises:
            ValueError: If upload_id is invalid.
            RuntimeError: If detection fails.
        """
        detection_id = str(uuid.uuid4())
        start_time = time.time()

        try:
            # Send initial WebSocket update
            await self._send_websocket_update(upload_id, "preprocessing", 10)

            # Check cache first
            cached_result = await self._get_cached_result(upload_id, options)
            if cached_result:
                self.metrics["cache_hits"] += 1
                logger.info(f"Cache hit for upload {upload_id}")
                return cached_result

            self.metrics["cache_misses"] += 1

            # Load image from storage
            image = await self._load_image(upload_id)

            # Send preprocessing update
            await self._send_websocket_update(upload_id, "preprocessing", 30)

            # Preprocess image
            preprocessed = self._preprocess_image(image, options)

            # Send detection update
            await self._send_websocket_update(upload_id, "detection", 50)

            # Run detection
            detections = await self.detector.detect(preprocessed)

            # Send postprocessing update
            await self._send_websocket_update(upload_id, "postprocessing", 80)

            # Format results
            result = self._format_results(
                detection_id=detection_id,
                upload_id=upload_id,
                detections=detections,
                processing_time=int((time.time() - start_time) * 1000)
            )

            # Cache results
            await self._cache_result(upload_id, options, result)

            # Update metrics
            self.metrics["total_detections"] += 1
            self.metrics["total_time"] += (time.time() - start_time)

            # Send completion update
            await self._send_websocket_update(upload_id, "completed", 100)

            logger.info(f"Detection completed for {upload_id}: "
                       f"{len(detections)} logos found in "
                       f"{result['processingTime']}ms")

            return result

        except Exception as e:
            logger.error(f"Detection failed for {upload_id}: {e}")
            await self._send_websocket_error(upload_id, str(e))
            raise RuntimeError(f"Detection failed: {e}")

    async def _load_image(self, upload_id: str) -> np.ndarray:
        """
        Load image from storage service.

        Args:
            upload_id: UUID of the uploaded image.

        Returns:
            Image as numpy array in BGR format.

        Raises:
            ValueError: If image not found.
        """
        try:
            logger.info(f"Loading image for upload {upload_id}")

            # Get image path from storage service
            image_path = await storage_service.get_image_path(upload_id)

            # Load image with OpenCV (in BGR format)
            image = cv2.imread(image_path)

            if image is None:
                # If OpenCV fails, try loading as bytes and decoding
                image_bytes = await storage_service.get_image(upload_id)
                nparr = np.frombuffer(image_bytes, np.uint8)
                image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if image is None:
                raise ValueError(f"Failed to load image {upload_id}")

            logger.info(f"Loaded image {upload_id}: shape={image.shape}")
            return image

        except FileNotFoundError:
            logger.error(f"Image not found: {upload_id}")
            raise ValueError(f"Image {upload_id} not found in storage")
        except Exception as e:
            logger.error(f"Failed to load image {upload_id}: {e}")
            raise ValueError(f"Failed to load image: {e}")

    def _preprocess_image(self, image: np.ndarray,
                         options: Optional[Dict[str, Any]]) -> np.ndarray:
        """
        Preprocess image based on configuration.

        Args:
            image: Input image.
            options: Preprocessing options.

        Returns:
            Preprocessed image.
        """
        preprocess_config = self.config.get("preprocessing", {})

        if options:
            # Override with user options
            preprocess_config.update(options.get("preprocessing", {}))

        return ImageProcessor.preprocess_for_detection(
            image,
            target_size=tuple(preprocess_config.get("target_size", (640, 640))),
            enhance=preprocess_config.get("enhance_contrast", True),
            denoise_strength=preprocess_config.get("denoise_strength", 0)
        )

    def _format_results(self, detection_id: str, upload_id: str,
                       detections: List[Detection],
                       processing_time: int) -> Dict[str, Any]:
        """
        Format detection results for API response.

        Args:
            detection_id: Unique detection ID.
            upload_id: Upload ID.
            detections: List of detections.
            processing_time: Processing time in milliseconds.

        Returns:
            Formatted results dictionary.
        """
        return {
            "detectionId": detection_id,
            "uploadId": upload_id,
            "status": "completed",
            "processingTime": processing_time,
            "detections": [det.to_dict() for det in detections],
            "metadata": {
                "totalLogosDetected": len(detections),
                "modelVersion": "2.1.0",
                "modelType": self.model_type,
                "timestamp": datetime.utcnow().isoformat()
            }
        }

    async def _get_cached_result(self, upload_id: str,
                                 options: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """
        Get cached detection result if available.

        Args:
            upload_id: Upload ID.
            options: Detection options.

        Returns:
            Cached result or None.
        """
        if not self.redis_client:
            return None

        try:
            cache_key = self._get_cache_key(upload_id, options)
            cached = await self.redis_client.get(cache_key)

            if cached:
                return json.loads(cached)
        except Exception as e:
            logger.warning(f"Cache retrieval failed: {e}")

        return None

    async def _cache_result(self, upload_id: str,
                           options: Optional[Dict[str, Any]],
                           result: Dict[str, Any]) -> None:
        """
        Cache detection result.

        Args:
            upload_id: Upload ID.
            options: Detection options.
            result: Detection result to cache.
        """
        if not self.redis_client:
            return

        try:
            cache_key = self._get_cache_key(upload_id, options)
            await self.redis_client.setex(
                cache_key,
                self.cache_ttl,
                json.dumps(result)
            )
        except Exception as e:
            logger.warning(f"Cache storage failed: {e}")

    def _get_cache_key(self, upload_id: str,
                       options: Optional[Dict[str, Any]]) -> str:
        """
        Generate cache key for detection result.

        Args:
            upload_id: Upload ID.
            options: Detection options.

        Returns:
            Cache key string.
        """
        options_str = json.dumps(options or {}, sort_keys=True)
        return f"detection:{upload_id}:{hash(options_str)}"

    async def _send_websocket_update(self, upload_id: str,
                                     stage: str, progress: int) -> None:
        """
        Send progress update via WebSocket.

        Args:
            upload_id: Upload ID.
            stage: Current processing stage.
            progress: Progress percentage.
        """
        if not self.websocket_manager or not self.config.get("enable_websocket", True):
            return

        try:
            message = {
                "type": "progress",
                "uploadId": upload_id,
                "stage": stage,
                "progress": progress,
                "timestamp": datetime.utcnow().isoformat()
            }

            # WebSocket manager would be injected from FastAPI app
            # await self.websocket_manager.send_to_upload(upload_id, message)
            logger.debug(f"WebSocket update: {message}")

        except Exception as e:
            logger.warning(f"WebSocket update failed: {e}")

    async def _send_websocket_error(self, upload_id: str, error: str) -> None:
        """
        Send error message via WebSocket.

        Args:
            upload_id: Upload ID.
            error: Error message.
        """
        if not self.websocket_manager:
            return

        try:
            message = {
                "type": "error",
                "uploadId": upload_id,
                "error": error,
                "timestamp": datetime.utcnow().isoformat()
            }

            # await self.websocket_manager.send_to_upload(upload_id, message)
            logger.debug(f"WebSocket error: {message}")

        except Exception as e:
            logger.warning(f"WebSocket error notification failed: {e}")

    async def get_metrics(self) -> Dict[str, Any]:
        """
        Get service performance metrics.

        Returns:
            Dictionary of metrics.
        """
        avg_time = (self.metrics["total_time"] / self.metrics["total_detections"]
                   if self.metrics["total_detections"] > 0 else 0)

        cache_hit_rate = (self.metrics["cache_hits"] /
                         (self.metrics["cache_hits"] + self.metrics["cache_misses"])
                         if (self.metrics["cache_hits"] + self.metrics["cache_misses"]) > 0
                         else 0)

        return {
            "totalDetections": self.metrics["total_detections"],
            "averageProcessingTime": round(avg_time * 1000, 2),  # ms
            "cacheHitRate": round(cache_hit_rate, 3),
            "modelType": self.model_type,
            "uptime": time.time()  # Would track actual uptime in production
        }

    async def cleanup(self) -> None:
        """
        Cleanup resources on service shutdown.
        """
        if self.redis_client:
            await self.redis_client.close()

        logger.info("Detection service cleaned up")