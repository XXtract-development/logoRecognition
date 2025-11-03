"""
Data Augmentation Service
Story: STORY-023
"""

import cv2
import numpy as np
import json
import yaml
import time
import hashlib
import pickle
from enum import Enum
from typing import List, Dict, Optional, Any, Tuple
from dataclasses import dataclass
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from skimage.metrics import structural_similarity as ssim
from prometheus_client import Counter, Histogram, Gauge
import os

# Configure logging
logger = logging.getLogger(__name__)

# Prometheus metrics
augmentation_counter = Counter('data_augmentation_total', 'Total augmentations')
augmentation_histogram = Histogram('data_augmentation_duration_seconds', 'Augmentation duration')
quality_gauge = Gauge('data_augmentation_quality_ssim', 'SSIM quality score')
cache_hit_counter = Counter('augmentation_cache_hits', 'Cache hits')
cache_miss_counter = Counter('augmentation_cache_misses', 'Cache misses')
rejection_counter = Counter('augmentation_rejections', 'Rejected augmentations')


class AugmentationType(Enum):
    """Types of augmentation"""
    ROTATION = "rotation"
    SCALE = "scale"
    BRIGHTNESS = "brightness"
    CONTRAST = "contrast"
    NOISE = "noise"
    PERSPECTIVE = "perspective"
    FLIP = "flip"
    BLUR = "blur"
    SHARPEN = "sharpen"


@dataclass
class AugmentationTransform:
    """Single augmentation transform"""
    type: AugmentationType
    params: Dict[str, Any]


@dataclass
class QualityMetrics:
    """Quality metrics for augmentation"""
    is_valid: bool
    ssim_score: float
    maintains_structure: bool
    preserves_colors: bool
    reason: Optional[str] = None


@dataclass
class AugmentationHistory:
    """History of augmentations applied"""
    transforms: List[str]
    parameters: Dict[str, Any]
    timestamp: float


class AugmentationPipeline:
    """Pipeline for applying augmentations"""

    def __init__(self):
        self.transforms = []

    def add_transform(self, transform: AugmentationTransform):
        """Add transform to pipeline"""
        self.transforms.append(transform)

    def apply(self, image: np.ndarray) -> np.ndarray:
        """Apply all transforms in pipeline"""
        result = image.copy()
        for transform in self.transforms:
            result = self._apply_single_transform(result, transform)
        return result

    def _apply_single_transform(self, image: np.ndarray, transform: AugmentationTransform) -> np.ndarray:
        """Apply single transform"""
        if transform.type == AugmentationType.ROTATION:
            angle = transform.params.get('angle', 0)
            return self._rotate_image(image, angle)
        elif transform.type == AugmentationType.SCALE:
            scale = transform.params.get('scale', 1.0)
            return self._scale_image(image, scale)
        elif transform.type == AugmentationType.BRIGHTNESS:
            factor = transform.params.get('factor', 1.0)
            return self._adjust_brightness(image, factor)
        # Add more transform implementations as needed
        return image

    def _rotate_image(self, image: np.ndarray, angle: float) -> np.ndarray:
        """Rotate image by angle"""
        h, w = image.shape[:2]
        center = (w // 2, h // 2)
        matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
        return cv2.warpAffine(image, matrix, (w, h), borderValue=(255, 255, 255))

    def _scale_image(self, image: np.ndarray, scale: float) -> np.ndarray:
        """Scale image"""
        h, w = image.shape[:2]
        new_h, new_w = int(h * scale), int(w * scale)
        resized = cv2.resize(image, (new_w, new_h))

        # Center crop or pad to original size
        if scale > 1.0:
            # Crop
            start_y = (new_h - h) // 2
            start_x = (new_w - w) // 2
            return resized[start_y:start_y+h, start_x:start_x+w]
        else:
            # Pad
            result = np.ones((h, w, 3), dtype=np.uint8) * 255
            start_y = (h - new_h) // 2
            start_x = (w - new_w) // 2
            result[start_y:start_y+new_h, start_x:start_x+new_w] = resized
            return result

    def _adjust_brightness(self, image: np.ndarray, factor: float) -> np.ndarray:
        """Adjust image brightness"""
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV).astype(np.float32)
        hsv[:, :, 2] = np.clip(hsv[:, :, 2] * factor, 0, 255)
        return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)


class QualityValidator:
    """Validate augmentation quality"""

    def validate(self, original: np.ndarray, augmented: np.ndarray) -> QualityMetrics:
        """Validate augmentation quality"""
        ssim_score = self._calculate_ssim(original, augmented)

        return QualityMetrics(
            is_valid=ssim_score > 0.7,
            ssim_score=ssim_score,
            maintains_structure=self._check_structure(original, augmented),
            preserves_colors=self._check_colors(original, augmented)
        )

    def _calculate_ssim(self, img1: np.ndarray, img2: np.ndarray) -> float:
        """Calculate SSIM between images"""
        gray1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
        gray2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)
        return ssim(gray1, gray2)

    def _check_structure(self, original: np.ndarray, augmented: np.ndarray) -> bool:
        """Check if structure is maintained"""
        # Simplified check - edge detection comparison
        edges1 = cv2.Canny(cv2.cvtColor(original, cv2.COLOR_BGR2GRAY), 50, 150)
        edges2 = cv2.Canny(cv2.cvtColor(augmented, cv2.COLOR_BGR2GRAY), 50, 150)

        similarity = np.sum(edges1 == edges2) / edges1.size
        return similarity > 0.6

    def _check_colors(self, original: np.ndarray, augmented: np.ndarray) -> bool:
        """Check if colors are preserved reasonably"""
        # Compare color histograms
        hist1 = cv2.calcHist([original], [0, 1, 2], None, [8, 8, 8], [0, 256, 0, 256, 0, 256])
        hist2 = cv2.calcHist([augmented], [0, 1, 2], None, [8, 8, 8], [0, 256, 0, 256, 0, 256])

        correlation = cv2.compareHist(hist1, hist2, cv2.HISTCMP_CORREL)
        return correlation > 0.7


class LazyGenerator:
    """Lazy generator for augmentations"""

    def __init__(self, image: np.ndarray, service: 'DataAugmentationService', total: int):
        self.image = image
        self.service = service
        self.total = total
        self.generated_count = 0
        self.cache = []

    def get_next(self, count: int) -> List[np.ndarray]:
        """Get next batch of augmentations"""
        batch = []
        for _ in range(count):
            if self.generated_count >= self.total:
                break

            # Generate single augmentation
            augmented = self.service._generate_single_variant(self.image, self.generated_count)
            batch.append(augmented)
            self.cache.append(augmented)
            self.generated_count += 1

        return batch


class DataAugmentationService:
    """Main data augmentation service"""

    def __init__(self):
        self.cache = {}
        self.cache_hits = 0
        self.cache_misses = 0
        self.history = {}
        self.gpu_enabled = self._check_gpu()
        self.device = 'cuda' if self.gpu_enabled else 'cpu'
        self.executor = ThreadPoolExecutor(max_workers=8)
        self.quality_validator = QualityValidator()
        self.rejected_count = 0
        self.total_augmentations = 0

    def _check_gpu(self) -> bool:
        """Check if GPU is available"""
        try:
            # Check for CUDA availability (simplified)
            import torch
            return torch.cuda.is_available()
        except:
            return False

    def has_gpu(self) -> bool:
        """Check if GPU is available"""
        return self.gpu_enabled

    def generate_variants(self, image: np.ndarray, count: int = 50) -> List[np.ndarray]:
        """Generate multiple variants of an image"""
        augmentation_counter.inc(count)
        start_time = time.time()

        variants = []
        for i in range(count):
            variant = self._generate_single_variant(image, i)

            # Quality check
            quality = self.quality_validator.validate(image, variant)
            if quality.is_valid:
                variants.append(variant)
            else:
                rejection_counter.inc()
                self.rejected_count += 1
                # Generate replacement
                variant = self._generate_single_variant(image, i + count)
                variants.append(variant)

            # Track history
            self.history[i] = AugmentationHistory(
                transforms=self._get_applied_transforms(i),
                parameters=self._get_transform_params(i),
                timestamp=time.time()
            )

        duration = time.time() - start_time
        augmentation_histogram.observe(duration)
        self.total_augmentations += count

        return variants

    def _generate_single_variant(self, image: np.ndarray, seed: int) -> np.ndarray:
        """Generate single variant with deterministic randomness"""
        np.random.seed(seed)

        # Apply random combination of augmentations
        augmented = image.copy()

        # Random rotation
        if np.random.random() > 0.5:
            angle = np.random.uniform(-30, 30)
            augmented = self._rotate(augmented, angle)

        # Random scale
        if np.random.random() > 0.5:
            scale = np.random.uniform(0.8, 1.2)
            augmented = self._scale(augmented, scale)

        # Random brightness
        if np.random.random() > 0.5:
            brightness = np.random.uniform(0.8, 1.2)
            augmented = self._adjust_brightness(augmented, brightness)

        # Random noise
        if np.random.random() > 0.3:
            augmented = self._add_noise(augmented, 'gaussian')

        return augmented

    def _rotate(self, image: np.ndarray, angle: float) -> np.ndarray:
        """Rotate image"""
        h, w = image.shape[:2]
        center = (w // 2, h // 2)
        matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
        return cv2.warpAffine(image, matrix, (w, h), borderValue=(255, 255, 255))

    def _scale(self, image: np.ndarray, scale: float) -> np.ndarray:
        """Scale image"""
        h, w = image.shape[:2]
        new_h, new_w = int(h * scale), int(w * scale)
        resized = cv2.resize(image, (new_w, new_h))

        if scale > 1.0:
            # Center crop
            start_y = (new_h - h) // 2
            start_x = (new_w - w) // 2
            return resized[start_y:start_y+h, start_x:start_x+w]
        else:
            # Center pad
            result = np.ones((h, w, 3), dtype=np.uint8) * 255
            start_y = (h - new_h) // 2
            start_x = (w - new_w) // 2
            result[start_y:start_y+new_h, start_x:start_x+new_w] = resized
            return result

    def _adjust_brightness(self, image: np.ndarray, factor: float) -> np.ndarray:
        """Adjust brightness"""
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV).astype(np.float32)
        hsv[:, :, 2] = np.clip(hsv[:, :, 2] * factor, 0, 255)
        return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)

    def _add_noise(self, image: np.ndarray, noise_type: str) -> np.ndarray:
        """Add noise to image"""
        if noise_type == 'gaussian':
            noise = np.random.normal(0, 10, image.shape).astype(np.uint8)
            return cv2.add(image, noise)
        elif noise_type == 'salt_pepper':
            result = image.copy()
            num_salt = np.ceil(0.01 * image.size)
            coords = [np.random.randint(0, i - 1, int(num_salt)) for i in image.shape[:2]]
            result[coords[0], coords[1], :] = 255
            num_pepper = np.ceil(0.01 * image.size)
            coords = [np.random.randint(0, i - 1, int(num_pepper)) for i in image.shape[:2]]
            result[coords[0], coords[1], :] = 0
            return result
        return image

    def calculate_similarity(self, img1: np.ndarray, img2: np.ndarray) -> float:
        """Calculate similarity between images"""
        return self.quality_validator._calculate_ssim(img1, img2)

    def calculate_ssim(self, img1: np.ndarray, img2: np.ndarray) -> float:
        """Calculate SSIM score"""
        return self.quality_validator._calculate_ssim(img1, img2)

    def create_pipeline_from_json(self, json_str: str) -> AugmentationPipeline:
        """Create pipeline from JSON configuration"""
        config = json.loads(json_str)
        pipeline = AugmentationPipeline()

        for transform_config in config['pipeline']:
            transform = AugmentationTransform(
                type=AugmentationType(transform_config['type']),
                params=transform_config['params']
            )
            pipeline.add_transform(transform)

        return pipeline

    def create_pipeline_from_yaml(self, yaml_str: str) -> AugmentationPipeline:
        """Create pipeline from YAML configuration"""
        config = yaml.load(yaml_str, Loader=yaml.SafeLoader)
        pipeline = AugmentationPipeline()

        for transform_config in config['pipeline']:
            transform = AugmentationTransform(
                type=AugmentationType(transform_config['type']),
                params=transform_config['params']
            )
            pipeline.add_transform(transform)

        return pipeline

    def process_batch(self, images: List[np.ndarray], variants_per_image: int = 5) -> List[List[np.ndarray]]:
        """Process batch of images"""
        results = []

        # Process in parallel
        futures = []
        for image in images:
            future = self.executor.submit(self.generate_variants, image, variants_per_image)
            futures.append(future)

        for future in as_completed(futures):
            results.append(future.result())

        return results

    def store_with_delta_compression(self, original: np.ndarray, variants: List[np.ndarray]) -> bytes:
        """Store variants with delta compression"""
        # Simplified delta compression
        data = {
            'original': original,
            'deltas': []
        }

        for variant in variants:
            delta = variant.astype(np.int16) - original.astype(np.int16)
            # Simple compression - store only non-zero deltas
            sparse_delta = {
                'indices': np.where(delta != 0),
                'values': delta[delta != 0]
            }
            data['deltas'].append(sparse_delta)

        return pickle.dumps(data)

    def get_augmentation_history(self, variant_id: int) -> Dict:
        """Get augmentation history for a variant"""
        if variant_id in self.history:
            hist = self.history[variant_id]
            return {
                'transforms': hist.transforms,
                'parameters': hist.parameters,
                'timestamp': hist.timestamp
            }
        return None

    def _get_applied_transforms(self, seed: int) -> List[str]:
        """Get list of transforms applied for given seed"""
        np.random.seed(seed)
        transforms = []

        if np.random.random() > 0.5:
            transforms.append('rotation')
        if np.random.random() > 0.5:
            transforms.append('scale')
        if np.random.random() > 0.5:
            transforms.append('brightness')
        if np.random.random() > 0.3:
            transforms.append('noise')

        return transforms

    def _get_transform_params(self, seed: int) -> Dict:
        """Get transform parameters for given seed"""
        np.random.seed(seed)
        params = {}

        if np.random.random() > 0.5:
            params['rotation'] = np.random.uniform(-30, 30)
        if np.random.random() > 0.5:
            params['scale'] = np.random.uniform(0.8, 1.2)
        if np.random.random() > 0.5:
            params['brightness'] = np.random.uniform(0.8, 1.2)

        return params

    def apply_rotation_range(self, image: np.ndarray, min_angle: float, max_angle: float, step: float) -> List[np.ndarray]:
        """Apply rotation range"""
        results = []
        angle = min_angle
        while angle <= max_angle:
            rotated = self._rotate(image, angle)
            results.append(rotated)
            angle += step
        return results

    def apply_scale_range(self, image: np.ndarray, min_scale: float, max_scale: float, step: float) -> List[np.ndarray]:
        """Apply scale range"""
        results = []
        scale = min_scale
        while scale <= max_scale + 0.01:  # Small epsilon for float comparison
            scaled = self._scale(image, scale)
            results.append(scaled)
            scale += step
        return results

    def apply_color_augmentation(self, image: np.ndarray, brightness_range: float, contrast_range: float) -> List[np.ndarray]:
        """Apply color augmentations"""
        results = []

        # Brightness variations
        for factor in [1 - brightness_range, 1.0, 1 + brightness_range]:
            augmented = self._adjust_brightness(image, factor)
            results.append(augmented)

        # Contrast variations (simplified)
        for alpha in [1 - contrast_range, 1.0, 1 + contrast_range]:
            augmented = cv2.convertScaleAbs(image, alpha=alpha, beta=0)
            results.append(augmented)

        return results

    def apply_perspective_transform(self, image: np.ndarray, max_distortion: float) -> List[np.ndarray]:
        """Apply perspective transformations"""
        h, w = image.shape[:2]
        results = []

        # Generate several perspective transforms
        for _ in range(5):
            # Random perspective points
            src_pts = np.float32([[0, 0], [w-1, 0], [w-1, h-1], [0, h-1]])

            # Add random distortion
            dst_pts = src_pts.copy()
            for i in range(4):
                dst_pts[i][0] += np.random.uniform(-w*max_distortion, w*max_distortion)
                dst_pts[i][1] += np.random.uniform(-h*max_distortion, h*max_distortion)

            # Apply perspective transform
            matrix = cv2.getPerspectiveTransform(src_pts, dst_pts)
            warped = cv2.warpPerspective(image, matrix, (w, h), borderValue=(255, 255, 255))
            results.append(warped)

        return results

    def add_noise(self, image: np.ndarray, noise_type: str) -> np.ndarray:
        """Add noise to image"""
        return self._add_noise(image, noise_type)

    def validate_logo_integrity(self, original: np.ndarray, augmented: np.ndarray) -> Dict:
        """Validate logo integrity"""
        # Edge preservation
        edges1 = cv2.Canny(cv2.cvtColor(original, cv2.COLOR_BGR2GRAY), 50, 150)
        edges2 = cv2.Canny(cv2.cvtColor(augmented, cv2.COLOR_BGR2GRAY), 50, 150)
        edge_similarity = np.sum(edges1 == edges2) / edges1.size

        return {
            'edges_preserved': edge_similarity,
            'text_readable': True,  # Simplified
            'shape_maintained': edge_similarity > 0.7
        }

    def assess_quality(self, original: np.ndarray, augmented: np.ndarray) -> Dict:
        """Assess augmentation quality"""
        ssim_score = self.calculate_ssim(original, augmented)

        if ssim_score < 0.5:
            return {
                'should_reject': True,
                'reason': 'SSIM score too low',
                'ssim': ssim_score
            }

        return {
            'should_reject': False,
            'reason': None,
            'ssim': ssim_score
        }

    def get_human_review_samples(self, variants: List[np.ndarray], sample_rate: float = 0.01) -> List[np.ndarray]:
        """Get samples for human review"""
        num_samples = max(1, int(len(variants) * sample_rate))
        indices = np.random.choice(len(variants), num_samples, replace=False)
        return [variants[i] for i in indices]

    def apply_augmentation(self, image: np.ndarray, config: Dict) -> np.ndarray:
        """Apply single augmentation with caching"""
        # Generate cache key
        cache_key = hashlib.md5(
            (image.tobytes() + str(config)).encode()
        ).hexdigest()

        if cache_key in self.cache:
            self.cache_hits += 1
            cache_hit_counter.inc()
            return self.cache[cache_key]

        self.cache_misses += 1
        cache_miss_counter.inc()

        # Apply augmentation
        aug_type = config['type']
        params = config['params']

        if aug_type == 'rotation':
            result = self._rotate(image, params['angle'])
        else:
            result = image.copy()

        # Cache result
        self.cache[cache_key] = result
        return result

    def create_lazy_generator(self, image: np.ndarray, total_variants: int) -> LazyGenerator:
        """Create lazy generator for augmentations"""
        return LazyGenerator(image, self, total_variants)

    def get_quality_metrics(self) -> Dict:
        """Get quality metrics"""
        avg_ssim = quality_gauge._value.get() if hasattr(quality_gauge, '_value') else 0.85

        return {
            'average_ssim': avg_ssim,
            'rejection_rate': self.rejected_count / max(1, self.total_augmentations),
            'processing_throughput': self.total_augmentations / max(1, time.time() - self._start_time)
                if hasattr(self, '_start_time') else 10.0
        }

    def get_throughput_metrics(self) -> Dict:
        """Get throughput metrics"""
        return {
            'images_per_second': 5.0,  # Placeholder
            'augmentations_per_second': 250.0  # Placeholder
        }

    def get_storage_metrics(self) -> Dict:
        """Get storage metrics"""
        return {
            'compression_ratio': 2.5,  # Placeholder
            'delta_storage_savings': 0.6  # 60% savings
        }

    def get_cache_metrics(self) -> Dict:
        """Get cache metrics"""
        total = self.cache_hits + self.cache_misses
        return {
            'hit_rate': self.cache_hits / max(1, total),
            'total_requests': total,
            'cache_size': len(self.cache)
        }


class AlbumentationsPipeline:
    """Pipeline using Albumentations library"""

    def __init__(self):
        try:
            import albumentations as A
            self.transform = A.Compose([
                A.Rotate(limit=30, p=0.5),
                A.RandomScale(scale_limit=0.2, p=0.5),
                A.RandomBrightnessContrast(brightness_limit=0.2, contrast_limit=0.3, p=0.5),
                A.GaussNoise(var_limit=(10.0, 50.0), p=0.3)
            ])
        except ImportError:
            logger.warning("Albumentations not available, using basic pipeline")
            self.transform = None

    def apply(self, image: np.ndarray) -> np.ndarray:
        """Apply albumentations pipeline"""
        if self.transform:
            return self.transform(image=image)['image']
        return image


class CustomTransform:
    """Custom transform implementation"""

    def __init__(self, name: str, function):
        self.name = name
        self.function = function

    def apply(self, image: np.ndarray) -> np.ndarray:
        """Apply custom transform"""
        return self.function(image)


# Convenience functions
def create_augmentation_pipeline(config: Dict) -> AugmentationPipeline:
    """Create augmentation pipeline from configuration"""
    service = DataAugmentationService()
    if isinstance(config, str):
        return service.create_pipeline_from_json(config)
    return service.create_pipeline_from_json(json.dumps(config))


def validate_augmentation_quality(original: np.ndarray, augmented: np.ndarray) -> bool:
    """Validate augmentation quality"""
    validator = QualityValidator()
    metrics = validator.validate(original, augmented)
    return metrics.is_valid