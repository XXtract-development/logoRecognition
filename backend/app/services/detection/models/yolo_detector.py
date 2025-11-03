"""
YOLOv8 implementation for logo detection.
"""

import asyncio
from typing import List, Dict, Any, Optional
import numpy as np
import cv2
import torch
import logging
from pathlib import Path
import time
import os
import psutil
import GPUtil

from ..base_detector import BaseDetector, Detection, BoundingBox

logger = logging.getLogger(__name__)

# Logo class mapping (sample - would be loaded from config in production)
LOGO_CLASSES = {
    0: {"name": "Nike", "category": "Sportswear"},
    1: {"name": "Adidas", "category": "Sportswear"},
    2: {"name": "Apple", "category": "Technology"},
    3: {"name": "Google", "category": "Technology"},
    4: {"name": "Coca-Cola", "category": "Beverage"},
    5: {"name": "Pepsi", "category": "Beverage"},
    6: {"name": "McDonald's", "category": "Food"},
    7: {"name": "Starbucks", "category": "Food"},
    8: {"name": "Amazon", "category": "E-commerce"},
    9: {"name": "Microsoft", "category": "Technology"},
    # ... more classes would be loaded from config
}


class YOLODetector(BaseDetector):
    """
    YOLOv8 detector for logo recognition.

    This detector uses YOLOv8 architecture optimized for logo detection
    with support for 500+ logo classes.
    """

    def __init__(self, config: Dict[str, Any]):
        """
        Initialize YOLOv8 detector.

        Args:
            config: Configuration dictionary with YOLOv8 parameters.
        """
        super().__init__(config)
        self.model_path = config.get("weights", "yolov8x_logo_trained.pt")
        self.input_size = config.get("input_size", (640, 640))
        self.device = self._select_device(config.get("device", "auto"))
        self.half_precision = config.get("half_precision", False) and self.device == "cuda"
        self.gpu_memory_threshold = config.get("gpu_memory_threshold", 0.9)  # 90% threshold

    async def load_model(self) -> None:
        """
        Load YOLOv8 model weights.

        Raises:
            ModelLoadError: If model file not found or loading fails.
        """
        try:
            logger.info(f"Loading YOLOv8 model from {self.model_path}")

            # Check if ultralytics is available
            try:
                from ultralytics import YOLO

                # Check if model file exists, if not use pretrained
                if os.path.exists(self.model_path):
                    self.model = YOLO(self.model_path)
                else:
                    # Use pretrained YOLOv8 model for object detection
                    logger.warning(f"Custom model not found at {self.model_path}, using pretrained YOLOv8")
                    self.model = YOLO('yolov8x.pt')  # Will auto-download if needed

                # Move model to device
                self.model.to(self.device)

                # Enable half precision if configured
                if self.half_precision and self.device == "cuda":
                    self.model.model.half()

            except ImportError:
                logger.warning("Ultralytics not installed. Using mock model for development.")
                # Fallback for development without ultralytics
                self.model = {"loaded": True, "device": self.device, "mock": True}

            logger.info(f"YOLOv8 model loaded successfully on {self.device}")

        except Exception as e:
            logger.error(f"Failed to load YOLOv8 model: {e}")
            raise RuntimeError(f"Model load error: {e}")

    def preprocess_image(self, image: np.ndarray) -> np.ndarray:
        """
        Preprocess image for YOLOv8 input.

        Args:
            image: Input image in BGR format.

        Returns:
            Preprocessed image tensor.
        """
        # Resize to model input size
        resized = cv2.resize(image, self.input_size)

        # Convert BGR to RGB
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)

        # Normalize to [0, 1]
        normalized = rgb.astype(np.float32) / 255.0

        # Add batch dimension and transpose to CHW format
        tensor = np.transpose(normalized, (2, 0, 1))
        tensor = np.expand_dims(tensor, axis=0)

        return tensor

    async def detect(self, image: np.ndarray) -> List[Detection]:
        """
        Perform logo detection using YOLOv8.

        Args:
            image: Input image as numpy array.

        Returns:
            List of detected logos with confidence scores.

        Raises:
            DetectionError: If detection fails.
        """
        if self.model is None:
            await self.load_model()

        try:
            start_time = time.time()
            h_orig, w_orig = image.shape[:2]

            # Check if we're using real YOLO or mock
            if isinstance(self.model, dict) and self.model.get("mock"):
                # Use simulated detection for development
                preprocessed = self.preprocess_image(image)
                detections = await self._simulate_detection(preprocessed, w_orig, h_orig)
            else:
                # Real YOLO inference
                # Convert BGR to RGB for YOLO
                rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

                # Run inference
                results = self.model(rgb_image, conf=self.confidence_threshold)

                # Parse results
                detections = self._parse_yolo_output(results, w_orig, h_orig)

            # Apply NMS and filtering
            filtered = self._apply_nms_and_filter(detections)

            inference_time = (time.time() - start_time) * 1000
            logger.info(f"YOLOv8 detection completed in {inference_time:.2f}ms, "
                       f"found {len(filtered)} logos")

            return filtered

        except Exception as e:
            logger.error(f"Detection failed: {e}")
            raise RuntimeError(f"Detection error: {e}")

    async def _simulate_detection(self, image_tensor: np.ndarray,
                                 width: int, height: int) -> List[Detection]:
        """
        Simulate detection results for testing.

        Args:
            image_tensor: Preprocessed image tensor.
            width: Original image width.
            height: Original image height.

        Returns:
            Simulated detection results.
        """
        # Simulate processing delay
        await asyncio.sleep(0.5)

        # Generate sample detections
        detections = []

        # Simulate finding 2-3 logos
        num_detections = np.random.randint(2, 4)

        for i in range(num_detections):
            class_id = np.random.randint(0, len(LOGO_CLASSES))
            logo_info = LOGO_CLASSES.get(class_id, {"name": "Unknown", "category": "Unknown"})

            # Random position and size
            x = np.random.randint(50, width - 200)
            y = np.random.randint(50, height - 200)
            w = np.random.randint(80, 200)
            h = np.random.randint(80, 200)

            # Ensure box stays within image
            w = min(w, width - x)
            h = min(h, height - y)

            detection = Detection(
                logo_id=f"logo_{class_id:03d}",
                brand_name=logo_info["name"],
                category=logo_info["category"],
                confidence=np.random.uniform(0.75, 0.95),
                bounding_box=BoundingBox(x=x, y=y, width=w, height=h),
                attributes={
                    "orientation": np.random.randint(-15, 15),
                    "scale": np.random.choice(["small", "medium", "large"]),
                    "visibility": "full"
                }
            )
            detections.append(detection)

        return detections

    def _apply_nms_and_filter(self, detections: List[Detection]) -> List[Detection]:
        """
        Apply Non-Maximum Suppression and confidence filtering.

        Args:
            detections: Raw detection results.

        Returns:
            Filtered detection results.
        """
        if not detections:
            return []

        # Extract boxes and scores
        boxes = [d.bounding_box for d in detections]
        scores = [d.confidence for d in detections]

        # Apply NMS
        keep_indices = self.non_max_suppression(boxes, scores)

        # Keep only selected detections
        filtered = [detections[i] for i in keep_indices]

        # Apply additional filtering
        filtered = self.filter_detections(filtered)

        return filtered

    def _parse_yolo_output(self, results: Any, width: int, height: int) -> List[Detection]:
        """
        Parse YOLOv8 model output to Detection objects.

        Args:
            results: Raw YOLOv8 output.
            width: Original image width.
            height: Original image height.

        Returns:
            List of Detection objects.
        """
        detections = []

        # Parse YOLO results
        for r in results:
            if r.boxes is not None:
                boxes = r.boxes
                for i, box in enumerate(boxes):
                    # Extract box coordinates
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    conf = float(box.conf[0])
                    cls = int(box.cls[0])

                    # Convert to our format
                    x = int(x1)
                    y = int(y1)
                    w = int(x2 - x1)
                    h = int(y2 - y1)

                    # Get class info (map to logo if trained, else use COCO classes)
                    logo_info = LOGO_CLASSES.get(cls, {
                        "name": f"Object_{cls}",
                        "category": "Detected"
                    })

                    detection = Detection(
                        logo_id=f"logo_{cls:03d}",
                        brand_name=logo_info["name"],
                        category=logo_info["category"],
                        confidence=conf,
                        bounding_box=BoundingBox(x=x, y=y, width=w, height=h),
                        attributes={
                            "class_id": cls,
                            "scale": self._estimate_scale(w, h, width, height),
                            "visibility": "full"
                        }
                    )
                    detections.append(detection)

        return detections

    def _estimate_scale(self, box_w: int, box_h: int, img_w: int, img_h: int) -> str:
        """
        Estimate object scale based on box size relative to image.

        Args:
            box_w: Box width
            box_h: Box height
            img_w: Image width
            img_h: Image height

        Returns:
            Scale category (small, medium, large)
        """
        box_area = box_w * box_h
        img_area = img_w * img_h
        ratio = box_area / img_area

        if ratio < 0.05:
            return "small"
        elif ratio < 0.2:
            return "medium"
        else:
            return "large"

    def _select_device(self, device_preference: str) -> str:
        """
        Select the best available device with fallback logic.

        Args:
            device_preference: Preferred device ("auto", "cuda", "cpu")

        Returns:
            Selected device string
        """
        if device_preference == "cpu":
            return "cpu"

        # Check CUDA availability
        if not torch.cuda.is_available():
            logger.warning("CUDA not available, falling back to CPU")
            return "cpu"

        if device_preference == "auto":
            # Auto-select based on available resources
            try:
                gpus = GPUtil.getGPUs()
                if gpus:
                    # Find GPU with most free memory
                    best_gpu = max(gpus, key=lambda x: x.memoryFree)

                    # Check if GPU has enough free memory
                    if best_gpu.memoryUtil < self.gpu_memory_threshold:
                        logger.info(f"Selected GPU {best_gpu.id} with {best_gpu.memoryFree}MB free")
                        return f"cuda:{best_gpu.id}"
                    else:
                        logger.warning(f"GPU memory utilization too high ({best_gpu.memoryUtil:.1%}), using CPU")
                        return "cpu"
            except Exception as e:
                logger.warning(f"Failed to query GPU status: {e}, using default CUDA")
                return "cuda"

        # Use specified CUDA device
        return device_preference

    def _check_gpu_memory(self) -> bool:
        """
        Check if GPU has sufficient memory available.

        Returns:
            True if memory available, False otherwise
        """
        if "cuda" not in self.device:
            return True

        try:
            # Get GPU memory stats
            gpu_id = int(self.device.split(":")[1]) if ":" in self.device else 0
            gpus = GPUtil.getGPUs()

            if gpu_id < len(gpus):
                gpu = gpus[gpu_id]
                if gpu.memoryUtil > self.gpu_memory_threshold:
                    logger.warning(f"GPU {gpu_id} memory usage high: {gpu.memoryUtil:.1%}")
                    return False

            return True

        except Exception as e:
            logger.error(f"Failed to check GPU memory: {e}")
            return False

    async def detect_with_fallback(self, image: np.ndarray) -> List[Detection]:
        """
        Detect with automatic CPU fallback on GPU failure.

        Args:
            image: Input image

        Returns:
            Detection results
        """
        try:
            # Check GPU memory before processing
            if "cuda" in self.device and not self._check_gpu_memory():
                logger.warning("Insufficient GPU memory, falling back to CPU")
                self.device = "cpu"
                if self.model and not isinstance(self.model, dict):
                    self.model.to(self.device)

            return await self.detect(image)

        except torch.cuda.OutOfMemoryError as e:
            logger.error(f"GPU OOM error: {e}, falling back to CPU")

            # Clear GPU cache
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

            # Switch to CPU and retry
            self.device = "cpu"
            if self.model and not isinstance(self.model, dict):
                self.model.to(self.device)

            return await self.detect(image)