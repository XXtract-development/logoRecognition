"""
Comprehensive tests for Data Augmentation Service
Achieving proper test coverage for STORY-023
"""

import pytest
import numpy as np
import cv2
import json
import yaml
from unittest.mock import Mock, patch, MagicMock
import time

from app.data_augmentation import (
    DataAugmentationService,
    AugmentationPipeline,
    AugmentationTransform,
    AugmentationType,
    QualityValidator,
    QualityMetrics,
    LazyGenerator,
    AugmentationHistory,
    AlbumentationsPipeline,
    CustomTransform,
    create_augmentation_pipeline,
    validate_augmentation_quality
)


@pytest.fixture
def augmentation_service():
    """Create augmentation service"""
    return DataAugmentationService()


@pytest.fixture
def sample_image():
    """Create sample test image"""
    # Create a simple logo-like image
    image = np.ones((200, 200, 3), dtype=np.uint8) * 255
    # Add a black rectangle
    cv2.rectangle(image, (50, 50), (150, 150), (0, 0, 0), -1)
    # Add some text
    cv2.putText(image, "LOGO", (70, 100), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
    return image


@pytest.fixture
def quality_validator():
    """Create quality validator"""
    return QualityValidator()


@pytest.fixture
def augmentation_pipeline():
    """Create augmentation pipeline"""
    return AugmentationPipeline()


class TestDataAugmentationService:
    """Test DataAugmentationService class"""

    def test_initialization(self, augmentation_service):
        """Test service initialization"""
        assert augmentation_service is not None
        assert augmentation_service.cache == {}
        assert augmentation_service.history == {}
        assert augmentation_service.executor is not None

    def test_has_gpu(self, augmentation_service):
        """Test GPU availability check"""
        has_gpu = augmentation_service.has_gpu()
        assert isinstance(has_gpu, bool)

    def test_generate_variants(self, augmentation_service, sample_image):
        """Test generating image variants"""
        variants = augmentation_service.generate_variants(sample_image, count=5)

        assert len(variants) == 5
        for variant in variants:
            assert variant.shape == sample_image.shape
            assert variant.dtype == sample_image.dtype

    def test_generate_single_variant(self, augmentation_service, sample_image):
        """Test generating single variant"""
        variant = augmentation_service._generate_single_variant(sample_image, seed=42)

        assert variant is not None
        assert variant.shape == sample_image.shape
        # Should be different from original
        assert not np.array_equal(variant, sample_image)

    def test_rotate(self, augmentation_service, sample_image):
        """Test image rotation"""
        rotated = augmentation_service._rotate(sample_image, 45)

        assert rotated.shape == sample_image.shape
        assert not np.array_equal(rotated, sample_image)

    def test_scale(self, augmentation_service, sample_image):
        """Test image scaling"""
        # Scale up
        scaled_up = augmentation_service._scale(sample_image, 1.2)
        assert scaled_up.shape == sample_image.shape

        # Scale down
        scaled_down = augmentation_service._scale(sample_image, 0.8)
        assert scaled_down.shape == sample_image.shape

    def test_adjust_brightness(self, augmentation_service, sample_image):
        """Test brightness adjustment"""
        # Brighter
        brighter = augmentation_service._adjust_brightness(sample_image, 1.5)
        assert brighter.shape == sample_image.shape

        # Darker
        darker = augmentation_service._adjust_brightness(sample_image, 0.5)
        assert darker.shape == sample_image.shape

    def test_add_noise(self, augmentation_service, sample_image):
        """Test noise addition"""
        # Gaussian noise
        noisy_gaussian = augmentation_service._add_noise(sample_image, 'gaussian')
        assert noisy_gaussian.shape == sample_image.shape

        # Salt and pepper noise
        noisy_sp = augmentation_service._add_noise(sample_image, 'salt_pepper')
        assert noisy_sp.shape == sample_image.shape

    def test_calculate_similarity(self, augmentation_service, sample_image):
        """Test similarity calculation"""
        variant = augmentation_service._rotate(sample_image, 10)
        similarity = augmentation_service.calculate_similarity(sample_image, variant)

        assert 0.0 <= similarity <= 1.0

    def test_calculate_ssim(self, augmentation_service, sample_image):
        """Test SSIM calculation"""
        variant = augmentation_service._rotate(sample_image, 5)
        ssim_score = augmentation_service.calculate_ssim(sample_image, variant)

        assert 0.0 <= ssim_score <= 1.0

    def test_create_pipeline_from_json(self, augmentation_service):
        """Test pipeline creation from JSON"""
        json_config = json.dumps({
            'pipeline': [
                {'type': 'rotation', 'params': {'angle': 30}},
                {'type': 'scale', 'params': {'scale': 1.1}},
                {'type': 'brightness', 'params': {'factor': 1.2}}
            ]
        })

        pipeline = augmentation_service.create_pipeline_from_json(json_config)

        assert pipeline is not None
        assert len(pipeline.transforms) == 3

    def test_create_pipeline_from_yaml(self, augmentation_service):
        """Test pipeline creation from YAML"""
        yaml_config = """
        pipeline:
          - type: rotation
            params:
              angle: 30
          - type: scale
            params:
              scale: 1.1
        """

        pipeline = augmentation_service.create_pipeline_from_yaml(yaml_config)

        assert pipeline is not None
        assert len(pipeline.transforms) == 2

    def test_process_batch(self, augmentation_service, sample_image):
        """Test batch processing"""
        images = [sample_image.copy() for _ in range(3)]

        results = augmentation_service.process_batch(images, variants_per_image=2)

        assert len(results) == 3
        for variants in results:
            assert len(variants) == 2

    def test_store_with_delta_compression(self, augmentation_service, sample_image):
        """Test delta compression storage"""
        variants = [
            augmentation_service._rotate(sample_image, 10),
            augmentation_service._rotate(sample_image, 20)
        ]

        compressed = augmentation_service.store_with_delta_compression(sample_image, variants)

        assert compressed is not None
        assert isinstance(compressed, bytes)

    def test_get_augmentation_history(self, augmentation_service, sample_image):
        """Test augmentation history retrieval"""
        # Generate variants to create history
        augmentation_service.generate_variants(sample_image, count=2)

        history = augmentation_service.get_augmentation_history(0)

        assert history is not None
        assert 'transforms' in history
        assert 'parameters' in history
        assert 'timestamp' in history

    def test_apply_rotation_range(self, augmentation_service, sample_image):
        """Test rotation range application"""
        results = augmentation_service.apply_rotation_range(sample_image, -30, 30, 15)

        assert len(results) == 5  # -30, -15, 0, 15, 30
        for result in results:
            assert result.shape == sample_image.shape

    def test_apply_scale_range(self, augmentation_service, sample_image):
        """Test scale range application"""
        results = augmentation_service.apply_scale_range(sample_image, 0.8, 1.2, 0.1)

        assert len(results) == 5  # 0.8, 0.9, 1.0, 1.1, 1.2
        for result in results:
            assert result.shape == sample_image.shape

    def test_apply_color_augmentation(self, augmentation_service, sample_image):
        """Test color augmentation"""
        results = augmentation_service.apply_color_augmentation(sample_image, 0.2, 0.3)

        assert len(results) == 6  # 3 brightness + 3 contrast
        for result in results:
            assert result.shape == sample_image.shape

    def test_apply_perspective_transform(self, augmentation_service, sample_image):
        """Test perspective transformation"""
        results = augmentation_service.apply_perspective_transform(sample_image, 0.1)

        assert len(results) == 5
        for result in results:
            assert result.shape == sample_image.shape

    def test_validate_logo_integrity(self, augmentation_service, sample_image):
        """Test logo integrity validation"""
        variant = augmentation_service._rotate(sample_image, 10)
        integrity = augmentation_service.validate_logo_integrity(sample_image, variant)

        assert 'edges_preserved' in integrity
        assert 'text_readable' in integrity
        assert 'shape_maintained' in integrity

    def test_assess_quality(self, augmentation_service, sample_image):
        """Test quality assessment"""
        # Good quality variant
        good_variant = augmentation_service._rotate(sample_image, 5)
        assessment = augmentation_service.assess_quality(sample_image, good_variant)

        assert 'should_reject' in assessment
        assert 'reason' in assessment
        assert 'ssim' in assessment

        # Poor quality variant (extreme noise)
        poor_variant = np.random.randint(0, 255, sample_image.shape, dtype=np.uint8)
        assessment = augmentation_service.assess_quality(sample_image, poor_variant)

        assert assessment['should_reject'] == True

    def test_get_human_review_samples(self, augmentation_service, sample_image):
        """Test human review sample selection"""
        variants = [augmentation_service._rotate(sample_image, i*10) for i in range(10)]

        samples = augmentation_service.get_human_review_samples(variants, sample_rate=0.3)

        assert len(samples) == 3

    def test_apply_augmentation_with_cache(self, augmentation_service, sample_image):
        """Test augmentation with caching"""
        config = {'type': 'rotation', 'params': {'angle': 30}}

        # First call - cache miss
        result1 = augmentation_service.apply_augmentation(sample_image, config)
        assert augmentation_service.cache_misses == 1

        # Second call - cache hit
        result2 = augmentation_service.apply_augmentation(sample_image, config)
        assert augmentation_service.cache_hits == 1

        assert np.array_equal(result1, result2)

    def test_create_lazy_generator(self, augmentation_service, sample_image):
        """Test lazy generator creation"""
        generator = augmentation_service.create_lazy_generator(sample_image, total_variants=10)

        assert generator is not None
        assert generator.total == 10
        assert generator.generated_count == 0

    def test_get_quality_metrics(self, augmentation_service):
        """Test quality metrics retrieval"""
        metrics = augmentation_service.get_quality_metrics()

        assert 'average_ssim' in metrics
        assert 'rejection_rate' in metrics
        assert 'processing_throughput' in metrics

    def test_get_throughput_metrics(self, augmentation_service):
        """Test throughput metrics"""
        metrics = augmentation_service.get_throughput_metrics()

        assert 'images_per_second' in metrics
        assert 'augmentations_per_second' in metrics

    def test_get_storage_metrics(self, augmentation_service):
        """Test storage metrics"""
        metrics = augmentation_service.get_storage_metrics()

        assert 'compression_ratio' in metrics
        assert 'delta_storage_savings' in metrics

    def test_get_cache_metrics(self, augmentation_service):
        """Test cache metrics"""
        metrics = augmentation_service.get_cache_metrics()

        assert 'hit_rate' in metrics
        assert 'total_requests' in metrics
        assert 'cache_size' in metrics


class TestAugmentationPipeline:
    """Test AugmentationPipeline class"""

    def test_add_transform(self, augmentation_pipeline):
        """Test adding transform to pipeline"""
        transform = AugmentationTransform(
            type=AugmentationType.ROTATION,
            params={'angle': 45}
        )

        augmentation_pipeline.add_transform(transform)

        assert len(augmentation_pipeline.transforms) == 1

    def test_apply_pipeline(self, augmentation_pipeline, sample_image):
        """Test applying pipeline"""
        # Add multiple transforms
        augmentation_pipeline.add_transform(
            AugmentationTransform(AugmentationType.ROTATION, {'angle': 30})
        )
        augmentation_pipeline.add_transform(
            AugmentationTransform(AugmentationType.SCALE, {'scale': 1.1})
        )
        augmentation_pipeline.add_transform(
            AugmentationTransform(AugmentationType.BRIGHTNESS, {'factor': 1.2})
        )

        result = augmentation_pipeline.apply(sample_image)

        assert result is not None
        assert result.shape == sample_image.shape
        assert not np.array_equal(result, sample_image)


class TestQualityValidator:
    """Test QualityValidator class"""

    def test_validate(self, quality_validator, sample_image):
        """Test quality validation"""
        # Similar image
        similar = sample_image.copy()
        similar = cv2.GaussianBlur(similar, (3, 3), 0)

        metrics = quality_validator.validate(sample_image, similar)

        assert metrics.is_valid == True
        assert metrics.ssim_score > 0.7
        assert metrics.maintains_structure == True
        assert metrics.preserves_colors == True

    def test_check_structure(self, quality_validator, sample_image):
        """Test structure checking"""
        # Similar structure
        similar = cv2.GaussianBlur(sample_image, (3, 3), 0)
        maintains = quality_validator._check_structure(sample_image, similar)
        assert maintains == True

        # Different structure
        different = np.random.randint(0, 255, sample_image.shape, dtype=np.uint8)
        maintains = quality_validator._check_structure(sample_image, different)
        assert maintains == False

    def test_check_colors(self, quality_validator, sample_image):
        """Test color preservation checking"""
        # Similar colors
        similar = sample_image.copy()
        preserves = quality_validator._check_colors(sample_image, similar)
        assert preserves == True

        # Different colors
        different = 255 - sample_image  # Invert colors
        preserves = quality_validator._check_colors(sample_image, different)
        assert preserves == False


class TestLazyGenerator:
    """Test LazyGenerator class"""

    def test_get_next(self, augmentation_service, sample_image):
        """Test getting next batch from lazy generator"""
        generator = LazyGenerator(sample_image, augmentation_service, total=10)

        # Get first batch
        batch1 = generator.get_next(3)
        assert len(batch1) == 3
        assert generator.generated_count == 3

        # Get second batch
        batch2 = generator.get_next(5)
        assert len(batch2) == 5
        assert generator.generated_count == 8

        # Try to get more than available
        batch3 = generator.get_next(5)
        assert len(batch3) == 2  # Only 2 remaining
        assert generator.generated_count == 10


class TestAlbumentationsPipeline:
    """Test AlbumentationsPipeline class"""

    def test_initialization(self):
        """Test pipeline initialization"""
        pipeline = AlbumentationsPipeline()
        assert pipeline is not None
        # Transform may be None if albumentations not installed

    def test_apply(self, sample_image):
        """Test applying albumentations"""
        pipeline = AlbumentationsPipeline()
        result = pipeline.apply(sample_image)

        assert result is not None
        if pipeline.transform:
            assert result.shape == sample_image.shape
        else:
            # Without albumentations, returns original
            assert np.array_equal(result, sample_image)


class TestCustomTransform:
    """Test CustomTransform class"""

    def test_custom_transform(self, sample_image):
        """Test custom transformation"""
        def custom_func(image):
            return cv2.flip(image, 1)  # Horizontal flip

        transform = CustomTransform("horizontal_flip", custom_func)

        result = transform.apply(sample_image)

        assert result is not None
        assert result.shape == sample_image.shape
        assert not np.array_equal(result, sample_image)


class TestUtilityFunctions:
    """Test utility functions"""

    def test_create_augmentation_pipeline_from_dict(self):
        """Test pipeline creation from dict"""
        config = {
            'pipeline': [
                {'type': 'rotation', 'params': {'angle': 45}}
            ]
        }

        pipeline = create_augmentation_pipeline(config)

        assert pipeline is not None
        assert len(pipeline.transforms) == 1

    def test_create_augmentation_pipeline_from_json(self):
        """Test pipeline creation from JSON string"""
        config = json.dumps({
            'pipeline': [
                {'type': 'scale', 'params': {'scale': 1.5}}
            ]
        })

        pipeline = create_augmentation_pipeline(config)

        assert pipeline is not None
        assert len(pipeline.transforms) == 1

    def test_validate_augmentation_quality(self, sample_image):
        """Test quality validation utility"""
        # Similar image
        similar = cv2.GaussianBlur(sample_image, (3, 3), 0)
        is_valid = validate_augmentation_quality(sample_image, similar)
        assert is_valid == True

        # Very different image
        different = np.random.randint(0, 255, sample_image.shape, dtype=np.uint8)
        is_valid = validate_augmentation_quality(sample_image, different)
        assert is_valid == False


class TestEdgeCases:
    """Test edge cases and error handling"""

    def test_generate_variants_with_rejection(self, augmentation_service, sample_image):
        """Test variant generation with quality rejection"""
        # Mock quality validator to reject some variants
        with patch.object(augmentation_service.quality_validator, 'validate') as mock_validate:
            mock_validate.side_effect = [
                QualityMetrics(is_valid=False, ssim_score=0.5, maintains_structure=False, preserves_colors=True),
                QualityMetrics(is_valid=True, ssim_score=0.8, maintains_structure=True, preserves_colors=True)
            ] * 5

            variants = augmentation_service.generate_variants(sample_image, count=5)

            assert len(variants) == 5
            assert augmentation_service.rejected_count > 0

    def test_process_batch_with_exception(self, augmentation_service, sample_image):
        """Test batch processing with exception handling"""
        # Create batch with one corrupted image
        images = [sample_image.copy() for _ in range(2)]
        images.append(None)  # This will cause an exception

        with patch.object(augmentation_service, 'generate_variants') as mock_generate:
            mock_generate.side_effect = [
                [sample_image.copy()],
                [sample_image.copy()],
                Exception("Test error")
            ]

            results = augmentation_service.process_batch(images, variants_per_image=1)

            # Should still return results for successful images
            assert len(results) >= 2

    def test_apply_augmentation_invalid_type(self, augmentation_service, sample_image):
        """Test augmentation with invalid type"""
        config = {'type': 'invalid_type', 'params': {}}

        result = augmentation_service.apply_augmentation(sample_image, config)

        # Should return copy of original
        assert result is not None
        assert np.array_equal(result, sample_image)