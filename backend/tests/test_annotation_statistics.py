"""
Comprehensive tests for annotation statistics and sufficiency analysis.
"""

import pytest
from datetime import datetime, timedelta
import numpy as np
from unittest.mock import Mock, patch

from app.services.annotation_statistics import (
    AnnotationStatisticsService,
    AnnotationProgressTracker,
    ConfidenceLevel,
    AnnotationMetrics,
    SufficiencyAnalysis
)


class TestAnnotationStatisticsService:
    """Test suite for AnnotationStatisticsService."""

    @pytest.fixture
    def service(self):
        """Create a service instance."""
        return AnnotationStatisticsService()

    @pytest.fixture
    def sample_annotations(self):
        """Create sample annotation data."""
        annotations = []
        for i in range(100):
            annotations.append({
                'id': i,
                'image_id': f'img_{i // 3}',  # ~33 unique images
                'category': 'brand',
                'value': 'test_logo',
                'bbox': {
                    'x': 10 + (i * 5 % 80),
                    'y': 10 + (i * 3 % 80),
                    'width': 20 + (i % 30),
                    'height': 20 + (i % 25)
                },
                'created_at': (datetime.now() - timedelta(hours=i)).isoformat()
            })
        return annotations

    def test_calculate_sufficiency_with_no_annotations(self, service):
        """Test sufficiency calculation with no annotations."""
        result = service.calculate_sufficiency(
            category='test',
            value='logo',
            annotations=[],
            target_accuracy=95.0
        )

        assert result.current_confidence == 0.0
        assert result.confidence_level == ConfidenceLevel.INSUFFICIENT
        assert not result.is_sufficient
        assert result.required_additional_annotations > 0
        assert len(result.recommendations) > 0

    def test_calculate_sufficiency_with_minimal_annotations(self, service):
        """Test with minimal annotations (below threshold)."""
        annotations = [
            {
                'image_id': 'img_1',
                'bbox': {'x': 10, 'y': 10, 'width': 20, 'height': 20}
            }
        ]

        result = service.calculate_sufficiency(
            category='test',
            value='logo',
            annotations=annotations,
            target_accuracy=95.0
        )

        assert result.current_confidence < 50
        assert result.confidence_level == ConfidenceLevel.INSUFFICIENT
        assert not result.is_sufficient
        assert result.required_additional_annotations > 0  # Need more annotations

    def test_calculate_sufficiency_with_adequate_annotations(self, service, sample_annotations):
        """Test with adequate number of annotations."""
        result = service.calculate_sufficiency(
            category='test',
            value='logo',
            annotations=sample_annotations,
            target_accuracy=95.0,
            enable_augmentation=True
        )

        assert result.current_confidence > 30  # Should have some confidence
        assert result.metrics.total_annotations == 100
        assert result.metrics.unique_images == 34  # ~33-34 unique images
        assert result.metrics.augmentation_factor == 8

    def test_calculate_sufficiency_95_vs_99_percent(self, service, sample_annotations):
        """Test different target accuracy levels."""
        # Extend annotations for higher confidence
        annotations = sample_annotations * 5  # 500 annotations

        result_95 = service.calculate_sufficiency(
            category='test',
            value='logo',
            annotations=annotations,
            target_accuracy=95.0
        )

        result_99 = service.calculate_sufficiency(
            category='test',
            value='logo',
            annotations=annotations,
            target_accuracy=99.0
        )

        # 99% target should require more annotations
        assert result_99.required_additional_annotations >= result_95.required_additional_annotations

        # Both should have same current confidence
        assert result_95.current_confidence == result_99.current_confidence

    def test_augmentation_factor_impact(self, service, sample_annotations):
        """Test impact of data augmentation on confidence."""
        result_no_aug = service.calculate_sufficiency(
            category='test',
            value='logo',
            annotations=sample_annotations,
            target_accuracy=95.0,
            enable_augmentation=False
        )

        result_with_aug = service.calculate_sufficiency(
            category='test',
            value='logo',
            annotations=sample_annotations,
            target_accuracy=95.0,
            enable_augmentation=True
        )

        # Augmentation should increase confidence
        assert result_with_aug.current_confidence > result_no_aug.current_confidence
        assert result_with_aug.metrics.augmentation_factor == 8
        assert result_no_aug.metrics.augmentation_factor == 1

    def test_diversity_score_calculation(self, service):
        """Test diversity score calculation."""
        # Low diversity - all same size and position
        uniform_annotations = [
            {'bbox': {'x': 10, 'y': 10, 'width': 20, 'height': 20}}
            for _ in range(10)
        ]

        # High diversity - varied sizes and positions
        diverse_annotations = [
            {'bbox': {'x': i*10, 'y': i*5, 'width': 10+i*5, 'height': 10+i*3}}
            for i in range(10)
        ]

        uniform_diversity = service._calculate_diversity_score(uniform_annotations)
        diverse_diversity = service._calculate_diversity_score(diverse_annotations)

        assert uniform_diversity < 0.1  # Very low diversity
        assert diverse_diversity > 0.3  # Higher diversity

    def test_temporal_distribution_score(self, service):
        """Test temporal distribution scoring."""
        now = datetime.now()

        # Well distributed annotations
        distributed_annotations = [
            {'created_at': (now - timedelta(hours=i*2)).isoformat()}
            for i in range(10)
        ]

        # All at once
        burst_annotations = [
            {'created_at': now.isoformat()}
            for _ in range(10)
        ]

        distributed_score = service._calculate_temporal_distribution(distributed_annotations)
        burst_score = service._calculate_temporal_distribution(burst_annotations)

        assert distributed_score > burst_score

    def test_annotator_agreement_score(self, service):
        """Test annotator agreement calculation."""
        # High agreement - overlapping boxes
        high_agreement = {
            'img_1': [
                {'bbox': {'x': 10, 'y': 10, 'width': 20, 'height': 20}},
                {'bbox': {'x': 11, 'y': 11, 'width': 19, 'height': 19}}
            ]
        }

        # Low agreement - non-overlapping boxes
        low_agreement = {
            'img_1': [
                {'bbox': {'x': 10, 'y': 10, 'width': 20, 'height': 20}},
                {'bbox': {'x': 50, 'y': 50, 'width': 20, 'height': 20}}
            ]
        }

        high_score = service._calculate_annotator_agreement(high_agreement)
        low_score = service._calculate_annotator_agreement(low_agreement)

        assert high_score > low_score
        assert high_score > 0.5
        assert low_score < 0.5

    def test_iou_calculation(self, service):
        """Test Intersection over Union calculation."""
        box1 = {'x': 10, 'y': 10, 'width': 20, 'height': 20}
        box2_identical = {'x': 10, 'y': 10, 'width': 20, 'height': 20}
        box2_partial = {'x': 15, 'y': 15, 'width': 20, 'height': 20}
        box2_no_overlap = {'x': 50, 'y': 50, 'width': 20, 'height': 20}

        iou_identical = service._calculate_iou(box1, box2_identical)
        iou_partial = service._calculate_iou(box1, box2_partial)
        iou_none = service._calculate_iou(box1, box2_no_overlap)

        assert iou_identical == 1.0  # Perfect overlap
        assert 0 < iou_partial < 1.0  # Partial overlap
        assert iou_none == 0.0  # No overlap

    def test_confidence_level_mapping(self, service):
        """Test confidence level categorization."""
        test_cases = [
            (25, ConfidenceLevel.INSUFFICIENT),
            (71, ConfidenceLevel.LOW),  # 70+ is LOW
            (86, ConfidenceLevel.MODERATE),  # 85+ is MODERATE
            (96, ConfidenceLevel.HIGH),  # 95+ is HIGH
            (99.1, ConfidenceLevel.VERY_HIGH),  # 99+ is VERY_HIGH
            (99.6, ConfidenceLevel.EXCELLENT)  # 99.5+ is EXCELLENT
        ]

        for confidence, expected_level in test_cases:
            level = service._get_confidence_level(confidence)
            assert level == expected_level, f"Expected {expected_level} for confidence {confidence}, got {level}"

    def test_accuracy_range_estimation(self, service):
        """Test accuracy range estimation."""
        metrics = AnnotationMetrics(
            total_annotations=100,
            unique_images=30,
            avg_annotations_per_image=3.3,
            annotation_diversity_score=0.6,
            temporal_distribution=0.7,
            annotator_agreement_score=0.8,
            augmentation_factor=8
        )

        # Test different confidence levels
        range_low = service._estimate_accuracy_range(40, metrics)
        range_high = service._estimate_accuracy_range(95, metrics)

        assert range_low[0] < range_low[1]  # Min < Max
        assert range_high[0] > range_low[0]  # Higher confidence = higher min accuracy
        assert range_high[1] > range_low[1]  # Higher confidence = higher max accuracy

    def test_recommendations_generation(self, service):
        """Test recommendation generation logic."""
        # Create scenario with multiple issues
        poor_annotations = [
            {'image_id': 'img_1', 'bbox': {'x': 10, 'y': 10, 'width': 20, 'height': 20}}
            for _ in range(20)  # Only 20 annotations, 1 image
        ]

        result = service.calculate_sufficiency(
            category='test',
            value='logo',
            annotations=poor_annotations,
            target_accuracy=95.0,
            enable_augmentation=False
        )

        recommendations = result.recommendations

        # Should recommend adding more annotations
        assert any('add' in rec.lower() for rec in recommendations)

        # Should recommend more image variety
        assert any('image' in rec.lower() for rec in recommendations)

        # Should recommend enabling augmentation
        assert any('augmentation' in rec.lower() for rec in recommendations)

    def test_required_annotations_calculation(self, service):
        """Test calculation of required additional annotations."""
        metrics = AnnotationMetrics(
            total_annotations=50,
            unique_images=20,
            avg_annotations_per_image=2.5,
            annotation_diversity_score=0.5,
            temporal_distribution=0.5,
            annotator_agreement_score=0.7,
            augmentation_factor=1
        )

        # Need more for 95%
        required_95 = service._calculate_required_annotations(metrics, 40, 95)

        # Need even more for 99%
        required_99 = service._calculate_required_annotations(metrics, 40, 99)

        assert required_99 > required_95
        assert required_95 > 0

        # Already sufficient
        required_sufficient = service._calculate_required_annotations(metrics, 96, 95)
        assert required_sufficient == 0


class TestAnnotationProgressTracker:
    """Test suite for AnnotationProgressTracker."""

    @pytest.fixture
    def tracker(self):
        """Create a tracker instance."""
        return AnnotationProgressTracker()

    def test_update_progress_first_time(self, tracker):
        """Test updating progress for the first time."""
        result = tracker.update_progress(
            session_id='test_session',
            category='brand',
            value='logo',
            new_annotation_count=15
        )

        assert result['current_count'] == 15
        assert result['annotations_this_session'] == 1
        assert result['next_milestone'] == 25
        assert result['milestones_reached'] == [10]

    def test_update_progress_milestone_reached(self, tracker):
        """Test milestone achievement tracking."""
        # Start at 45
        tracker.update_progress('session1', 'cat', 'val', 45)

        # Reach 50 milestone
        result = tracker.update_progress('session1', 'cat', 'val', 52)

        assert 50 in result['milestones_reached']
        assert result['next_milestone'] == 100
        assert result['progress_to_next_milestone'] > 0

    def test_annotation_rate_calculation(self, tracker):
        """Test annotation rate per minute calculation."""
        session_id = 'rate_test'

        # Initial annotation
        tracker.update_progress(session_id, 'cat', 'val', 10)

        # Simulate time passing and more annotations
        session_key = f"{session_id}:cat:val"
        tracker.sessions[session_key]['start_time'] = datetime.now() - timedelta(minutes=5)

        result = tracker.update_progress(session_id, 'cat', 'val', 20)

        # Should be ~2 per minute (10 annotations in 5 minutes)
        assert 1.5 < result['rate_per_minute'] < 2.5

    def test_time_to_milestone_estimation(self, tracker):
        """Test time estimation to next milestone."""
        # Test with good rate
        time_str = tracker._estimate_time_to_milestone(
            current=80,
            milestone=100,
            rate=2.0  # 2 per minute
        )
        assert '10 minutes' in time_str

        # Test with slow rate
        time_str = tracker._estimate_time_to_milestone(
            current=100,
            milestone=500,
            rate=0.5  # 0.5 per minute
        )
        assert 'hour' in time_str.lower()

        # Test with very slow rate
        time_str = tracker._estimate_time_to_milestone(
            current=100,
            milestone=1000,
            rate=0.1  # 0.1 per minute
        )
        assert 'day' in time_str.lower()

    def test_multiple_sessions(self, tracker):
        """Test tracking multiple independent sessions."""
        # Session 1
        result1 = tracker.update_progress('session1', 'brand', 'nike', 50)

        # Session 2
        result2 = tracker.update_progress('session2', 'brand', 'adidas', 30)

        # Update session 1 again
        result1_updated = tracker.update_progress('session1', 'brand', 'nike', 55)

        assert result1['current_count'] == 50
        assert result2['current_count'] == 30
        assert result1_updated['current_count'] == 55
        assert result1_updated['annotations_this_session'] == 6  # 55 - 49

    def test_all_milestones_reached(self, tracker):
        """Test behavior when all milestones are reached."""
        result = tracker.update_progress('session', 'cat', 'val', 1500)

        assert result['next_milestone'] is None
        assert result['progress_to_next_milestone'] == 100
        assert len(result['milestones_reached']) == len(tracker.milestones)
        assert result['estimated_time_to_milestone'] is None


class TestIntegration:
    """Integration tests for the complete annotation statistics system."""

    @pytest.fixture
    def system(self):
        """Create complete system setup."""
        return {
            'service': AnnotationStatisticsService(),
            'tracker': AnnotationProgressTracker()
        }

    def test_realistic_annotation_workflow(self, system):
        """Test a realistic annotation workflow."""
        service = system['service']
        tracker = system['tracker']

        annotations = []
        session_id = 'workflow_test'
        category = 'brand'
        value = 'test_logo'

        # Simulate gradual annotation process
        for batch in range(5):
            # Add 25 annotations per batch
            for i in range(25):
                annotations.append({
                    'image_id': f'img_{len(annotations) // 3}',
                    'bbox': {
                        'x': 10 + (i * 5 % 80),
                        'y': 10 + (i * 3 % 80),
                        'width': 20 + (i % 30),
                        'height': 20 + (i % 25)
                    },
                    'created_at': datetime.now().isoformat()
                })

            # Check sufficiency after each batch
            analysis = service.calculate_sufficiency(
                category=category,
                value=value,
                annotations=annotations,
                target_accuracy=95.0
            )

            # Update progress
            progress = tracker.update_progress(
                session_id=session_id,
                category=category,
                value=value,
                new_annotation_count=len(annotations)
            )

            # Verify consistency
            assert progress['current_count'] == len(annotations)

            # Check if we've reached sufficiency
            if analysis.is_sufficient:
                assert len(annotations) >= 100  # Should need at least 100
                break

    def test_multi_category_dashboard_simulation(self, system):
        """Test dashboard functionality with multiple categories."""
        service = system['service']

        categories = [
            ('brand', 'nike', 150),
            ('brand', 'adidas', 500),
            ('brand', 'apple', 50),
            ('type', 'logo', 1000),
            ('type', 'text', 25)
        ]

        results = []

        for category, value, count in categories:
            # Generate annotations
            annotations = [
                {
                    'image_id': f'img_{i // 5}',
                    'bbox': {'x': i*2, 'y': i*3, 'width': 20, 'height': 20}
                }
                for i in range(count)
            ]

            analysis = service.calculate_sufficiency(
                category=category,
                value=value,
                annotations=annotations,
                target_accuracy=95.0
            )

            results.append({
                'category': category,
                'value': value,
                'count': count,
                'confidence': analysis.current_confidence,
                'is_ready': analysis.is_sufficient
            })

        # Verify different confidence levels
        confidences = [r['confidence'] for r in results]
        assert len(set(confidences)) > 1  # Should have variety

        # The one with 1000 annotations should be most confident
        max_confidence_result = max(results, key=lambda x: x['confidence'])
        assert max_confidence_result['count'] == 1000

        # The one with 25 annotations should be least confident
        min_confidence_result = min(results, key=lambda x: x['confidence'])
        assert min_confidence_result['count'] == 25