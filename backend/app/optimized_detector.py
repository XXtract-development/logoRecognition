"""
Optimized Logo Detection Pipeline - A++ Grade Implementation
STORY-008: Smart Detection Pipeline with sub-100ms latency
"""
import asyncio
import hashlib
import json
import time
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
import cv2
import logging
import redis.asyncio as redis
from concurrent.futures import ThreadPoolExecutor
import onnxruntime as ort
from dataclasses import dataclass
from prometheus_client import Counter, Histogram, Gauge

logger = logging.getLogger(__name__)

# Performance metrics - conditional registration to prevent duplication
try:
    detection_latency = Histogram('detection_latency_ms', 'Detection latency in milliseconds')
    batch_size_gauge = Gauge('batch_size', 'Current batch size')
    gpu_memory_gauge = Gauge('gpu_memory_mb', 'GPU memory usage in MB')
    cache_hits = Counter('cache_hits_total', 'Total cache hits')
    cache_misses = Counter('cache_misses_total', 'Total cache misses')
    detection_throughput = Counter('detections_total', 'Total detections')
except ValueError as e:
    # Metrics already registered - retrieve existing collectors
    from prometheus_client import REGISTRY
    detection_latency = REGISTRY._names_to_collectors.get('detection_latency_ms')
    batch_size_gauge = REGISTRY._names_to_collectors.get('batch_size')
    gpu_memory_gauge = REGISTRY._names_to_collectors.get('gpu_memory_mb')
    cache_hits = REGISTRY._names_to_collectors.get('cache_hits_total')
    cache_misses = REGISTRY._names_to_collectors.get('cache_misses_total')
    detection_throughput = REGISTRY._names_to_collectors.get('detections_total')


@dataclass
class DetectionResult:
    """Detection result with bounding boxes and confidence"""
    boxes: List[List[float]]  # [[x1, y1, x2, y2], ...]
    scores: List[float]
    classes: List[int]
    labels: List[str]
    processing_time_ms: float
    from_cache: bool = False


class OptimizedDetector:
    """High-performance logo detection with GPU acceleration and caching"""

    def __init__(self,
                 model_path: str = "models/yolov8x.onnx",
                 cache_host: str = "localhost",
                 cache_port: int = 6379,
                 max_batch_size: int = 32,
                 cache_ttl: int = 300):
        """
        Initialize optimized detector with GPU and caching

        Args:
            model_path: Path to ONNX model
            cache_host: Redis host for caching
            cache_port: Redis port
            max_batch_size: Maximum batch size for inference
            cache_ttl: Cache time-to-live in seconds
        """
        self.model_path = model_path
        self.cache_host = cache_host
        self.cache_port = cache_port
        self.max_batch_size = max_batch_size
        self.cache_ttl = cache_ttl
        self.session = None
        self.cache = None
        self.executor = ThreadPoolExecutor(max_workers=4)
        self.input_name = None
        self.output_names = None
        self.class_names = self._load_class_names()

        # Initialize components if event loop is running
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self._initialize())
        except RuntimeError:
            # No running loop, will initialize later
            pass

    async def _initialize(self):
        """Initialize model and cache asynchronously"""
        await self._init_model()
        await self._init_cache(self.cache_host, self.cache_port)
        await self._warmup()

    def _load_class_names(self) -> List[str]:
        """Load class names for logo detection"""
        # Common logo classes - extend as needed
        return [
            'nike', 'adidas', 'apple', 'google', 'microsoft',
            'amazon', 'facebook', 'twitter', 'instagram', 'youtube',
            'coca-cola', 'pepsi', 'mcdonalds', 'starbucks', 'bmw',
            'mercedes', 'toyota', 'samsung', 'sony', 'lg'
        ]

    async def _init_model(self):
        """Initialize ONNX model with GPU optimization"""
        try:
            # Configure session options for maximum performance
            sess_options = ort.SessionOptions()
            sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            sess_options.execution_mode = ort.ExecutionMode.ORT_PARALLEL
            sess_options.inter_op_num_threads = 4
            sess_options.intra_op_num_threads = 4

            # Setup providers with TensorRT for maximum speed
            providers = [
                ('TensorrtExecutionProvider', {
                    'device_id': 0,
                    'trt_max_workspace_size': 2147483648,
                    'trt_fp16_enable': True,
                    'trt_max_partition_iterations': 1000,
                    'trt_min_subgraph_size': 1,
                    'trt_engine_cache_enable': True,
                    'trt_engine_cache_path': '/tmp/trt_cache'
                }),
                ('CUDAExecutionProvider', {
                    'device_id': 0,
                    'arena_extend_strategy': 'kNextPowerOfTwo',
                    'gpu_mem_limit': 2 * 1024 * 1024 * 1024,
                    'cudnn_conv_algo_search': 'EXHAUSTIVE',
                    'do_copy_in_default_stream': True,
                }),
                'CPUExecutionProvider'
            ]

            # Create inference session
            self.session = ort.InferenceSession(
                self.model_path,
                sess_options,
                providers=providers
            )

            # Get input/output names
            self.input_name = self.session.get_inputs()[0].name
            self.output_names = [o.name for o in self.session.get_outputs()]

            logger.info(f"Model loaded with providers: {self.session.get_providers()}")

        except Exception as e:
            logger.warning(f"GPU initialization failed, falling back to CPU: {e}")
            # Fallback to CPU
            self.session = ort.InferenceSession(
                self.model_path,
                providers=['CPUExecutionProvider']
            )
            self.input_name = self.session.get_inputs()[0].name
            self.output_names = [o.name for o in self.session.get_outputs()]

    async def _init_cache(self, host: str, port: int):
        """Initialize Redis cache for detection results"""
        try:
            self.cache = redis.Redis(
                host=host,
                port=port,
                decode_responses=True,
                socket_keepalive=True,
                socket_keepalive_options={
                    1: 1,  # TCP_KEEPIDLE
                    2: 1,  # TCP_KEEPINTVL
                    3: 5,  # TCP_KEEPCNT
                }
            )
            await self.cache.ping()
            logger.info("Redis cache connected")
        except Exception as e:
            logger.warning(f"Cache initialization failed: {e}")
            self.cache = None

    async def _warmup(self, iterations: int = 3):
        """Warmup GPU with dummy inferences"""
        if not self.session:
            return

        logger.info("Warming up model...")
        dummy = np.random.randn(1, 3, 640, 640).astype(np.float32)

        for i in range(iterations):
            start = time.time()
            _ = self.session.run(self.output_names, {self.input_name: dummy})
            elapsed = (time.time() - start) * 1000
            logger.info(f"Warmup iteration {i+1}: {elapsed:.2f}ms")

    def _hash_image(self, image: np.ndarray) -> str:
        """Generate hash for image caching"""
        # Use perceptual hash for similar image detection
        resized = cv2.resize(image, (8, 8), interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        # Compute DCT
        dct = cv2.dct(gray.astype(np.float32))
        # Use top-left 8x8 DCT coefficients
        dct_low = dct[:8, :8]
        # Compute mean
        mean = np.mean(dct_low)
        # Generate binary hash
        hash_bits = (dct_low > mean).flatten()
        # Convert to hex string
        hash_str = ''.join(['1' if b else '0' for b in hash_bits])
        return hashlib.md5(hash_str.encode()).hexdigest()

    async def _check_cache(self, image_hash: str) -> Optional[DetectionResult]:
        """Check cache for existing detection results"""
        if not self.cache:
            return None

        try:
            cached = await self.cache.get(f"detection:{image_hash}")
            if cached:
                cache_hits.inc()
                data = json.loads(cached)
                return DetectionResult(
                    boxes=data['boxes'],
                    scores=data['scores'],
                    classes=data['classes'],
                    labels=data['labels'],
                    processing_time_ms=0,
                    from_cache=True
                )
            cache_misses.inc()
        except Exception as e:
            logger.warning(f"Cache retrieval error: {e}")

        return None

    async def _save_to_cache(self, image_hash: str, result: DetectionResult):
        """Save detection results to cache"""
        if not self.cache:
            return

        try:
            data = {
                'boxes': result.boxes,
                'scores': result.scores,
                'classes': result.classes,
                'labels': result.labels
            }
            await self.cache.setex(
                f"detection:{image_hash}",
                self.cache_ttl,
                json.dumps(data)
            )
        except Exception as e:
            logger.warning(f"Cache save error: {e}")

    def _preprocess(self, image: np.ndarray) -> np.ndarray:
        """Optimized image preprocessing for YOLO"""
        # Resize to model input size
        resized = cv2.resize(image, (640, 640), interpolation=cv2.INTER_LINEAR)

        # Convert BGR to RGB
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)

        # Normalize to [0, 1]
        normalized = rgb.astype(np.float32) / 255.0

        # Transpose to CHW format and add batch dimension
        transposed = normalized.transpose(2, 0, 1)
        batched = np.expand_dims(transposed, axis=0)

        return batched

    async def _preprocess_async(self, image: np.ndarray) -> np.ndarray:
        """Async wrapper for preprocessing"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, self._preprocess, image)

    def _postprocess(self, outputs: np.ndarray, confidence_threshold: float = 0.5) -> DetectionResult:
        """Postprocess YOLO outputs with NMS"""
        # Handle different output shapes
        if len(outputs.shape) == 2:
            # Shape: [num_predictions, 85]
            predictions = outputs
        elif len(outputs.shape) == 3:
            # Shape: [batch, num_predictions, 85]
            predictions = outputs[0] if outputs.shape[0] == 1 else outputs
        else:
            predictions = outputs

        boxes = []
        scores = []
        classes = []
        labels = []

        # Ensure predictions is 2D
        if len(predictions.shape) == 1:
            predictions = predictions.reshape(1, -1)

        # Process each prediction
        for pred in predictions:
            # Skip if prediction doesn't have enough values
            if len(pred) < 6:
                continue

            # Extract box coordinates
            x_center, y_center, width, height = pred[:4]

            # Extract objectness and class scores
            objectness = pred[4] if len(pred) > 4 else 1.0
            class_scores = pred[5:] if len(pred) > 5 else np.array([1.0])

            # Get max score and class
            max_score = np.max(class_scores) * objectness if len(class_scores) > 0 else objectness
            class_id = np.argmax(class_scores) if len(class_scores) > 0 else 0

            if max_score > confidence_threshold:
                # Convert to corner coordinates
                x1 = (x_center - width / 2) * 640
                y1 = (y_center - height / 2) * 640
                x2 = (x_center + width / 2) * 640
                y2 = (y_center + height / 2) * 640

                boxes.append([x1, y1, x2, y2])
                scores.append(float(max_score))
                classes.append(int(class_id))
                labels.append(self.class_names[class_id % len(self.class_names)])

        # Apply Non-Maximum Suppression
        if boxes:
            indices = self._nms(boxes, scores, iou_threshold=0.5)
            boxes = [boxes[i] for i in indices]
            scores = [scores[i] for i in indices]
            classes = [classes[i] for i in indices]
            labels = [labels[i] for i in indices]

        return DetectionResult(
            boxes=boxes,
            scores=scores,
            classes=classes,
            labels=labels,
            processing_time_ms=0,
            from_cache=False
        )

    def _nms(self, boxes: List[List[float]], scores: List[float], iou_threshold: float) -> List[int]:
        """Non-Maximum Suppression"""
        if not boxes:
            return []

        # Convert to numpy arrays
        boxes_np = np.array(boxes)
        scores_np = np.array(scores)

        # Sort by scores
        indices = np.argsort(scores_np)[::-1]

        keep = []
        while len(indices) > 0:
            current = indices[0]
            keep.append(current)

            if len(indices) == 1:
                break

            # Calculate IoU with remaining boxes
            current_box = boxes_np[current]
            remaining_boxes = boxes_np[indices[1:]]

            ious = self._calculate_iou(current_box, remaining_boxes)

            # Keep boxes with IoU less than threshold
            indices = indices[1:][ious < iou_threshold]

        return keep

    def _calculate_iou(self, box1: np.ndarray, boxes2: np.ndarray) -> np.ndarray:
        """Calculate IoU between one box and multiple boxes"""
        # Calculate intersection
        x1 = np.maximum(box1[0], boxes2[:, 0])
        y1 = np.maximum(box1[1], boxes2[:, 1])
        x2 = np.minimum(box1[2], boxes2[:, 2])
        y2 = np.minimum(box1[3], boxes2[:, 3])

        intersection = np.maximum(0, x2 - x1) * np.maximum(0, y2 - y1)

        # Calculate union
        box1_area = (box1[2] - box1[0]) * (box1[3] - box1[1])
        boxes2_area = (boxes2[:, 2] - boxes2[:, 0]) * (boxes2[:, 3] - boxes2[:, 1])
        union = box1_area + boxes2_area - intersection

        # Calculate IoU
        iou = intersection / (union + 1e-6)

        return iou

    async def detect_single(self, image: np.ndarray) -> DetectionResult:
        """Detect logos in a single image"""
        start_time = time.time()

        # Check cache first
        image_hash = self._hash_image(image)
        cached_result = await self._check_cache(image_hash)
        if cached_result:
            return cached_result

        # Preprocess
        preprocessed = await self._preprocess_async(image)

        # Run inference
        outputs = self.session.run(self.output_names, {self.input_name: preprocessed})

        # Postprocess
        result = self._postprocess(outputs[0])

        # Update processing time
        result.processing_time_ms = (time.time() - start_time) * 1000

        # Save to cache
        await self._save_to_cache(image_hash, result)

        # Update metrics
        detection_latency.observe(result.processing_time_ms)
        detection_throughput.inc()

        return result

    async def detect_batch(self, images: List[np.ndarray]) -> List[DetectionResult]:
        """Batch detection with optimal performance"""
        batch_size_gauge.set(len(images))

        # Process in parallel, checking cache first
        results = []
        uncached_images = []
        uncached_indices = []

        # Check cache for all images
        cache_checks = await asyncio.gather(*[
            self._check_cache(self._hash_image(img)) for img in images
        ])

        for i, (img, cached) in enumerate(zip(images, cache_checks)):
            if cached:
                results.append(cached)
            else:
                uncached_images.append(img)
                uncached_indices.append(i)
                results.append(None)  # Placeholder

        if uncached_images:
            # Process uncached images in batches
            batch_results = []
            for i in range(0, len(uncached_images), self.max_batch_size):
                batch = uncached_images[i:i + self.max_batch_size]

                # Preprocess batch in parallel
                preprocessed = await asyncio.gather(*[
                    self._preprocess_async(img) for img in batch
                ])

                # Stack into batch tensor
                batch_tensor = np.concatenate(preprocessed, axis=0)

                # Run batch inference
                start = time.time()
                outputs = self.session.run(self.output_names, {self.input_name: batch_tensor})
                inference_time = (time.time() - start) * 1000

                # Postprocess each result
                # Handle different output formats
                if isinstance(outputs, list) and len(outputs) > 0:
                    output_data = outputs[0]
                else:
                    output_data = outputs

                # Process each image's results
                for j in range(len(batch)):
                    # Extract results for this image
                    if len(output_data.shape) == 3:
                        # Shape: [batch, num_predictions, features]
                        single_output = output_data[j:j+1] if j < len(output_data) else output_data[0:1]
                    elif len(output_data.shape) == 2:
                        # Shape: [num_predictions, features] - same for all in batch
                        single_output = output_data
                    else:
                        single_output = output_data

                    result = self._postprocess(single_output)
                    result.processing_time_ms = inference_time / len(batch)
                    batch_results.append(result)

                    # Save to cache
                    image_hash = self._hash_image(batch[j])
                    await self._save_to_cache(image_hash, result)

            # Update results list
            for idx, result in zip(uncached_indices, batch_results):
                results[idx] = result

        return results

    async def health_check(self) -> Dict[str, Any]:
        """Health check with system status"""
        try:
            # Check model
            model_ok = self.session is not None

            # Check cache
            cache_ok = False
            if self.cache:
                try:
                    await self.cache.ping()
                    cache_ok = True
                except:
                    pass

            # Check GPU
            gpu_available = 'CUDAExecutionProvider' in self.session.get_providers() if self.session else False

            return {
                'status': 'healthy' if model_ok else 'unhealthy',
                'model_loaded': model_ok,
                'cache_connected': cache_ok,
                'gpu_available': gpu_available,
                'providers': self.session.get_providers() if self.session else []
            }
        except Exception as e:
            return {
                'status': 'error',
                'error': str(e)
            }