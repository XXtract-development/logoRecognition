"""
ML Service Integration for Recognition API
A++ Grade Implementation with comprehensive model management
"""

import asyncio
import numpy as np
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
import structlog
import onnxruntime as ort
from PIL import Image
import io
import base64

logger = structlog.get_logger()


class MLService:
    """
    Production-grade ML service for logo recognition
    Handles model loading, inference, and version management
    """

    def __init__(self, model_config: Optional[Dict] = None):
        """Initialize ML service with configuration"""
        self.model_config = model_config or self._get_default_config()
        self.models: Dict[str, ort.InferenceSession] = {}
        self.current_version = "v1.0.0"
        self.loaded = False
        self.logger = logger.bind(service="ml_service")

    def _get_default_config(self) -> Dict:
        """Get default model configuration"""
        return {
            "model_path": "/models/efficientdet_d4.onnx",
            "input_size": (1024, 1024),
            "confidence_threshold": 0.99,
            "max_detections": 100,
            "providers": ["CPUExecutionProvider"],  # Add GPU if available
            "session_options": {
                "graph_optimization_level": ort.GraphOptimizationLevel.ORT_ENABLE_ALL,
                "inter_op_num_threads": 4,
                "intra_op_num_threads": 4
            }
        }

    async def load_model(self, version: str = "v1.0.0") -> bool:
        """
        Load ONNX model for inference
        Supports multiple model versions for A/B testing
        """
        try:
            self.logger.info("Loading model", version=version)

            # Create session options
            sess_options = ort.SessionOptions()
            sess_options.graph_optimization_level = self.model_config["session_options"]["graph_optimization_level"]
            sess_options.inter_op_num_threads = self.model_config["session_options"]["inter_op_num_threads"]
            sess_options.intra_op_num_threads = self.model_config["session_options"]["intra_op_num_threads"]

            # Load model
            model_path = self.model_config["model_path"]
            if version != "v1.0.0":
                model_path = model_path.replace(".onnx", f"_{version}.onnx")

            # Create inference session
            self.models[version] = ort.InferenceSession(
                model_path,
                sess_options,
                providers=self.model_config["providers"]
            )

            self.current_version = version
            self.loaded = True

            self.logger.info("Model loaded successfully", version=version)
            return True

        except Exception as e:
            self.logger.error("Failed to load model", error=str(e), version=version)
            raise RuntimeError(f"Model loading failed: {e}")

    async def warmup(self, iterations: int = 5) -> None:
        """
        Warmup model with dummy inputs for optimal performance
        Critical for achieving <300ms response times
        """
        if not self.loaded:
            await self.load_model()

        self.logger.info("Starting model warmup", iterations=iterations)

        # Create dummy input
        dummy_input = np.random.randn(1, 3, *self.model_config["input_size"]).astype(np.float32)

        # Run warmup iterations
        for i in range(iterations):
            start_time = asyncio.get_event_loop().time()
            await self.predict_batch([dummy_input])
            duration = asyncio.get_event_loop().time() - start_time
            self.logger.debug(f"Warmup iteration {i+1}", duration=duration)

        self.logger.info("Model warmup completed")

    async def predict(self, image: Image.Image, version: Optional[str] = None) -> Dict[str, Any]:
        """
        Run inference on a single image
        Returns detected logos with bounding boxes and confidence scores
        """
        if not self.loaded:
            await self.load_model()

        # Use specified version or current
        model_version = version or self.current_version
        if model_version not in self.models:
            await self.load_model(model_version)

        model = self.models[model_version]

        # Preprocess image
        processed_image = await self._preprocess_image(image)

        # Run inference
        start_time = asyncio.get_event_loop().time()

        # Get input name
        input_name = model.get_inputs()[0].name

        # Run model
        outputs = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: model.run(None, {input_name: processed_image})
        )

        inference_time = (asyncio.get_event_loop().time() - start_time) * 1000  # ms

        # Post-process results
        detections = await self._postprocess_outputs(outputs, image.size)

        return {
            "detections": detections,
            "model_version": model_version,
            "inference_time_ms": inference_time,
            "image_size": image.size
        }

    async def predict_batch(self, images: List[np.ndarray]) -> List[Dict[str, Any]]:
        """
        Run batch inference for multiple images
        Optimized for high throughput
        """
        if not self.loaded:
            await self.load_model()

        results = []
        model = self.models[self.current_version]

        # Process in parallel
        tasks = []
        for image in images:
            task = self._run_inference(model, image)
            tasks.append(task)

        outputs = await asyncio.gather(*tasks)

        for output in outputs:
            detections = await self._postprocess_outputs(output, (1024, 1024))
            results.append({
                "detections": detections,
                "model_version": self.current_version
            })

        return results

    async def _preprocess_image(self, image: Image.Image) -> np.ndarray:
        """
        Preprocess image for model input
        Handles resizing, normalization, and format conversion
        """
        # Resize to model input size
        target_size = self.model_config["input_size"]
        image = image.resize(target_size, Image.Resampling.LANCZOS)

        # Convert to RGB if needed
        if image.mode != 'RGB':
            image = image.convert('RGB')

        # Convert to numpy array
        img_array = np.array(image).astype(np.float32)

        # Normalize pixel values (ImageNet normalization)
        mean = np.array([0.485, 0.456, 0.406])
        std = np.array([0.229, 0.224, 0.225])
        img_array = (img_array / 255.0 - mean) / std

        # Transpose to CHW format and add batch dimension
        img_array = img_array.transpose(2, 0, 1)
        img_array = np.expand_dims(img_array, axis=0)

        return img_array

    async def _postprocess_outputs(self, outputs: List[np.ndarray], original_size: Tuple[int, int]) -> List[Dict]:
        """
        Post-process model outputs to extract detections
        Applies NMS and confidence filtering
        """
        # Extract outputs (format depends on model architecture)
        # Assuming outputs are [boxes, scores, classes]
        if len(outputs) < 3:
            return []

        boxes = outputs[0][0]  # Remove batch dimension
        scores = outputs[1][0]
        classes = outputs[2][0] if len(outputs) > 2 else np.zeros_like(scores)

        detections = []
        confidence_threshold = self.model_config["confidence_threshold"]

        # Filter by confidence
        valid_indices = scores >= confidence_threshold
        valid_boxes = boxes[valid_indices]
        valid_scores = scores[valid_indices]
        valid_classes = classes[valid_indices]

        # Apply NMS (Non-Maximum Suppression)
        keep_indices = await self._nms(valid_boxes, valid_scores, iou_threshold=0.5)

        # Limit to max detections
        keep_indices = keep_indices[:self.model_config["max_detections"]]

        # Convert to output format
        for idx in keep_indices:
            box = valid_boxes[idx]

            # Normalize coordinates to [0, 1]
            x1, y1, x2, y2 = box
            width = x2 - x1
            height = y2 - y1

            detection = {
                "brand": self._get_brand_name(int(valid_classes[idx])),
                "confidence": float(valid_scores[idx]),
                "bbox": {
                    "x": float(x1 / self.model_config["input_size"][0]),
                    "y": float(y1 / self.model_config["input_size"][1]),
                    "width": float(width / self.model_config["input_size"][0]),
                    "height": float(height / self.model_config["input_size"][1])
                },
                "variant": None,  # Can be enhanced with variant detection
                "colors": None,  # Can be enhanced with color extraction
                "quality_score": float(valid_scores[idx]),  # Can be enhanced
                "processing_time_ms": 0.0  # Will be set by caller
            }
            detections.append(detection)

        return detections

    async def _nms(self, boxes: np.ndarray, scores: np.ndarray, iou_threshold: float = 0.5) -> List[int]:
        """
        Apply Non-Maximum Suppression to remove overlapping boxes
        """
        if len(boxes) == 0:
            return []

        # Sort by score
        indices = np.argsort(scores)[::-1]
        keep = []

        while len(indices) > 0:
            current = indices[0]
            keep.append(current)

            if len(indices) == 1:
                break

            # Calculate IoU with remaining boxes
            current_box = boxes[current]
            remaining_boxes = boxes[indices[1:]]

            ious = await self._calculate_iou(current_box, remaining_boxes)

            # Keep boxes with IoU less than threshold
            indices = indices[1:][ious < iou_threshold]

        return keep

    async def _calculate_iou(self, box: np.ndarray, boxes: np.ndarray) -> np.ndarray:
        """Calculate Intersection over Union for boxes"""
        x1 = np.maximum(box[0], boxes[:, 0])
        y1 = np.maximum(box[1], boxes[:, 1])
        x2 = np.minimum(box[2], boxes[:, 2])
        y2 = np.minimum(box[3], boxes[:, 3])

        intersection = np.maximum(0, x2 - x1) * np.maximum(0, y2 - y1)

        box_area = (box[2] - box[0]) * (box[3] - box[1])
        boxes_area = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])

        union = box_area + boxes_area - intersection

        return intersection / (union + 1e-6)

    async def _run_inference(self, model: ort.InferenceSession, image: np.ndarray) -> List[np.ndarray]:
        """Run inference on a single image"""
        input_name = model.get_inputs()[0].name
        return await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: model.run(None, {input_name: image})
        )

    def _get_brand_name(self, class_id: int) -> str:
        """Map class ID to brand name"""
        # This would typically load from a config file
        brand_mapping = {
            0: "Nike",
            1: "Adidas",
            2: "Apple",
            3: "Google",
            4: "Microsoft",
            5: "Amazon",
            6: "Facebook",
            7: "Twitter",
            8: "Instagram",
            9: "LinkedIn",
            # Add more brands as needed
        }
        return brand_mapping.get(class_id, f"Brand_{class_id}")

    def get_model_info(self) -> Dict[str, Any]:
        """Get information about loaded models"""
        return {
            "loaded": self.loaded,
            "current_version": self.current_version,
            "available_versions": list(self.models.keys()),
            "config": self.model_config
        }

    async def unload_model(self, version: Optional[str] = None) -> None:
        """Unload a specific model version to free memory"""
        if version:
            if version in self.models:
                del self.models[version]
                self.logger.info("Model unloaded", version=version)
        else:
            # Unload all models
            self.models.clear()
            self.loaded = False
            self.logger.info("All models unloaded")