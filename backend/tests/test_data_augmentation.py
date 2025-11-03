"""
Test suite for Data Augmentation Service
Story: STORY-023
"""

import pytest
import numpy as np
import cv2
import json
import time
from unittest.mock import Mock, patch, MagicMock
from typing import List, Dict
import io
import os

# Import modules to test
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.data_augmentation import (
    DataAugmentationService,
    AugmentationPipeline,
    AugmentationType,
    QualityValidator,
    create_augmentation_pipeline,
    validate_augmentation_quality
)


class TestDataAugmentation:
    """Test suite for data augmentation functionality"""

    @pytest.fixture
    def augmentation_service(self):
        """Initialize data augmentation service"""
        return DataAugmentationService()

    @pytest.fixture
    def sample_image(self):
        """Create a sample logo image"""
        # Create a 300x300 RGB image with a logo
        image = np.ones((300, 300, 3), dtype=np.uint8) * 255
        # Add a colored rectangle as logo
        cv2.rectangle(image, (50, 50), (250, 250), (255, 0, 0), -1)
        # Add some text
        cv2.putText(image, "LOGO", (100, 150),
                   cv2.FONT_HERSHEY_SIMPLEX, 2, (255, 255, 255), 3)
        return image

    def test_generate_50x_variants(self, augmentation_service, sample_image):
        """Test generation of 50x variants per original image"""
        variants = augmentation_service.generate_variants(sample_image, count=50)

        assert len(variants) == 50
        # All variants should be different
        hashes = [hash(v.tobytes()) for v in variants]
        assert len(set(hashes)) == 50

    def test_augmentations_preserve_recognizability(self, augmentation_service, sample_image):
        """Test that augmentations preserve logo recognizability"""
        variants = augmentation_service.generate_variants(sample_image, count=10)

        for variant in variants:
            # Check that variant maintains similar structure
            similarity = augmentation_service.calculate_similarity(sample_image, variant)
            assert similarity > 0.7  # At least 70% similar

    def test_configurable_pipeline_json(self, augmentation_service):
        """Test configurable pipeline via JSON"""
        config = {
            "pipeline": [
                {"type": "rotation", "params": {"limit": 30}},
                {"type": "scale", "params": {"min": 0.8, "max": 1.2}},
                {"type": "brightness", "params": {"limit": 20}},
                {"type": "noise", "params": {"var": 0.01}}
            ]
        }

        pipeline = augmentation_service.create_pipeline_from_json(json.dumps(config))

        assert pipeline is not None
        assert len(pipeline.transforms) == 4
        assert pipeline.transforms[0].type == AugmentationType.ROTATION

    def test_configurable_pipeline_yaml(self, augmentation_service):
        """Test configurable pipeline via YAML"""
        yaml_config = """
        pipeline:
          - type: rotation
            params:
              limit: 30
          - type: scale
            params:
              min: 0.8
              max: 1.2
        """

        pipeline = augmentation_service.create_pipeline_from_yaml(yaml_config)

        assert pipeline is not None
        assert len(pipeline.transforms) == 2

    def test_batch_processing_efficiency(self, augmentation_service):
        """Test batch processing for efficiency"""
        # Create batch of images
        batch = [np.ones((300, 300, 3), dtype=np.uint8) * 255 for _ in range(10)]

        start_time = time.time()
        results = augmentation_service.process_batch(batch, variants_per_image=5)
        processing_time = time.time() - start_time

        assert len(results) == 10
        assert all(len(r) == 5 for r in results)
        # Should be fast with batch processing
        assert processing_time < 5.0  # Less than 5 seconds for 50 images total

    def test_quality_validation_per_augmentation(self, augmentation_service, sample_image):
        """Test quality validation for each augmentation"""
        variants = augmentation_service.generate_variants(sample_image, count=10)

        validator = QualityValidator()
        for variant in variants:
            quality = validator.validate(sample_image, variant)

            assert quality.is_valid
            assert quality.ssim_score > 0.7
            assert quality.maintains_structure
            assert quality.preserves_colors

    def test_processing_time_under_2s(self, augmentation_service, sample_image):
        """Test processing time <2s per image"""
        start_time = time.time()
        variants = augmentation_service.generate_variants(sample_image, count=50)
        processing_time = time.time() - start_time

        assert processing_time < 2.0
        assert len(variants) == 50

    def test_storage_optimization_delta(self, augmentation_service, sample_image):
        """Test storage optimization (only deltas stored)"""
        variants = augmentation_service.generate_variants(sample_image, count=10)

        # Store with delta compression
        stored_data = augmentation_service.store_with_delta_compression(
            sample_image, variants
        )

        # Check that storage is optimized
        original_size = sample_image.nbytes * (1 + len(variants))
        compressed_size = len(stored_data)

        assert compressed_size < original_size * 0.5  # At least 50% compression

    def test_augmentation_history_tracking(self, augmentation_service, sample_image):
        """Test augmentation history tracking"""
        variants = augmentation_service.generate_variants(sample_image, count=5)

        # Get history for each variant
        for i, variant in enumerate(variants):
            history = augmentation_service.get_augmentation_history(i)

            assert history is not None
            assert 'transforms' in history
            assert 'parameters' in history
            assert 'timestamp' in history
            assert len(history['transforms']) > 0

    def test_rotation_augmentation(self, augmentation_service, sample_image):
        """Test rotation augmentation: ±30° with 5° steps"""
        rotations = augmentation_service.apply_rotation_range(
            sample_image,
            min_angle=-30,
            max_angle=30,
            step=5
        )

        expected_count = (30 - (-30)) // 5 + 1  # 13 rotations
        assert len(rotations) == expected_count

        # Check that rotations are different
        for i, rotated in enumerate(rotations):
            assert rotated.shape == sample_image.shape

    def test_scale_augmentation(self, augmentation_service, sample_image):
        """Test scale augmentation: 0.8x-1.2x with 0.1 steps"""
        scaled = augmentation_service.apply_scale_range(
            sample_image,
            min_scale=0.8,
            max_scale=1.2,
            step=0.1
        )

        expected_count = int((1.2 - 0.8) / 0.1) + 1  # 5 scales
        assert len(scaled) == expected_count

    def test_color_augmentation(self, augmentation_service, sample_image):
        """Test color augmentation: brightness ±20%, contrast ±30%"""
        color_variants = augmentation_service.apply_color_augmentation(
            sample_image,
            brightness_range=0.2,
            contrast_range=0.3
        )

        assert len(color_variants) > 0

        for variant in color_variants:
            # Check that colors are modified but not completely different
            diff = np.mean(np.abs(variant.astype(float) - sample_image.astype(float)))
            assert diff > 0  # Changed
            assert diff < 100  # Not too much

    def test_perspective_augmentation(self, augmentation_service, sample_image):
        """Test perspective augmentation: keystone corrections"""
        perspective_variants = augmentation_service.apply_perspective_transform(
            sample_image,
            max_distortion=0.2
        )

        assert len(perspective_variants) > 0

        for variant in perspective_variants:
            assert variant.shape[0] > 0
            assert variant.shape[1] > 0

    def test_noise_augmentation(self, augmentation_service, sample_image):
        """Test noise augmentation: Gaussian, salt & pepper"""
        noise_types = ['gaussian', 'salt_pepper', 'poisson']

        for noise_type in noise_types:
            noisy = augmentation_service.add_noise(sample_image, noise_type)

            assert noisy.shape == sample_image.shape
            # Check that noise was added
            diff = np.mean(np.abs(noisy.astype(float) - sample_image.astype(float)))
            assert diff > 0

    def test_ssim_quality_control(self, augmentation_service, sample_image):
        """Test SSIM score >0.7 for all augmentations"""
        variants = augmentation_service.generate_variants(sample_image, count=10)

        for variant in variants:
            ssim = augmentation_service.calculate_ssim(sample_image, variant)
            assert ssim > 0.7

    def test_logo_integrity_validation(self, augmentation_service, sample_image):
        """Test logo integrity validation"""
        variants = augmentation_service.generate_variants(sample_image, count=10)

        for variant in variants:
            integrity = augmentation_service.validate_logo_integrity(
                sample_image, variant
            )

            assert integrity['edges_preserved'] > 0.8
            assert integrity['text_readable'] is True
            assert integrity['shape_maintained'] is True

    def test_automated_rejection_poor_quality(self, augmentation_service, sample_image):
        """Test automated rejection of poor quality augmentations"""
        # Create intentionally bad augmentation
        bad_variant = np.random.randint(0, 255, sample_image.shape, dtype=np.uint8)

        quality = augmentation_service.assess_quality(sample_image, bad_variant)

        assert quality['should_reject'] is True
        assert quality['reason'] is not None

    def test_human_review_sampling(self, augmentation_service):
        """Test human review sampling (1%)"""
        # Generate 100 augmentations
        images = [np.ones((100, 100, 3), dtype=np.uint8) * 255 for _ in range(20)]
        all_variants = []

        for img in images:
            variants = augmentation_service.generate_variants(img, count=5)
            all_variants.extend(variants)

        # Get samples for human review
        review_samples = augmentation_service.get_human_review_samples(
            all_variants, sample_rate=0.01
        )

        expected_samples = max(1, int(len(all_variants) * 0.01))
        assert len(review_samples) == expected_samples

    def test_gpu_acceleration_transforms(self, augmentation_service):
        """Test GPU acceleration for transforms"""
        if augmentation_service.has_gpu():
            assert augmentation_service.gpu_enabled is True
            assert augmentation_service.device == 'cuda'
        else:
            assert augmentation_service.gpu_enabled is False
            assert augmentation_service.device == 'cpu'

    def test_batch_processing_32_images(self, augmentation_service):
        """Test batch processing with 32 images"""
        batch = [np.ones((200, 200, 3), dtype=np.uint8) * 255 for _ in range(32)]

        results = augmentation_service.process_batch(batch, variants_per_image=2)

        assert len(results) == 32
        assert all(len(r) == 2 for r in results)

    def test_caching_common_augmentations(self, augmentation_service, sample_image):
        """Test caching of common augmentations"""
        # Apply same augmentation twice
        config = {"type": "rotation", "params": {"angle": 15}}

        result1 = augmentation_service.apply_augmentation(sample_image, config)
        result2 = augmentation_service.apply_augmentation(sample_image, config)

        # Second call should be from cache (faster)
        assert augmentation_service.cache_hits > 0
        assert np.array_equal(result1, result2)

    def test_lazy_generation_on_demand(self, augmentation_service, sample_image):
        """Test lazy generation on demand"""
        # Create lazy generator
        generator = augmentation_service.create_lazy_generator(
            sample_image, total_variants=100
        )

        # Should not generate all at once
        assert generator.generated_count == 0

        # Generate first 10
        first_batch = generator.get_next(10)
        assert len(first_batch) == 10
        assert generator.generated_count == 10

        # Generate next 20
        second_batch = generator.get_next(20)
        assert len(second_batch) == 20
        assert generator.generated_count == 30

    @patch('app.data_augmentation.prometheus_client')
    def test_metrics_monitoring(self, mock_prometheus, augmentation_service, sample_image):
        """Test augmentation metrics monitoring"""
        augmentation_service.generate_variants(sample_image, count=10)

        # Verify metrics were recorded
        assert mock_prometheus.Counter.called
        assert mock_prometheus.Histogram.called
        assert mock_prometheus.Gauge.called

    def test_augmentation_quality_metrics(self, augmentation_service):
        """Test augmentation quality metrics"""
        metrics = augmentation_service.get_quality_metrics()

        assert 'average_ssim' in metrics
        assert 'rejection_rate' in metrics
        assert 'processing_throughput' in metrics
        assert metrics['average_ssim'] > 0.7

    def test_processing_throughput(self, augmentation_service):
        """Test processing throughput metrics"""
        metrics = augmentation_service.get_throughput_metrics()

        assert 'images_per_second' in metrics
        assert 'augmentations_per_second' in metrics
        assert metrics['images_per_second'] > 0

    def test_storage_efficiency_ratio(self, augmentation_service):
        """Test storage efficiency ratio"""
        metrics = augmentation_service.get_storage_metrics()

        assert 'compression_ratio' in metrics
        assert 'delta_storage_savings' in metrics
        assert metrics['compression_ratio'] > 1.5

    def test_cache_hit_rates(self, augmentation_service):
        """Test cache hit rates"""
        metrics = augmentation_service.get_cache_metrics()

        assert 'hit_rate' in metrics
        assert 'total_requests' in metrics
        assert 0 <= metrics['hit_rate'] <= 1


class TestAugmentationPipeline:
    """Test augmentation pipeline functionality"""

    def test_albumentations_integration(self):
        """Test Albumentations library integration"""
        from app.data_augmentation import AlbumentationsPipeline

        pipeline = AlbumentationsPipeline()
        image = np.ones((300, 300, 3), dtype=np.uint8) * 255

        augmented = pipeline.apply(image)

        assert augmented is not None
        assert augmented.shape == image.shape

    def test_custom_transforms(self):
        """Test custom transform implementation"""
        from app.data_augmentation import CustomTransform

        transform = CustomTransform(
            name="logo_specific",
            function=lambda x: cv2.flip(x, 1)  # Horizontal flip
        )

        image = np.ones((300, 300, 3), dtype=np.uint8) * 255
        result = transform.apply(image)

        assert result is not None
        assert not np.array_equal(result, image)