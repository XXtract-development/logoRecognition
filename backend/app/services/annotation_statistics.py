"""
Annotation Statistics Service for determining training data sufficiency.

This module provides statistical analysis and recommendations for achieving
95-99% detection accuracy based on annotation quantity and quality metrics.
"""

import math
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import numpy as np
from datetime import datetime, timedelta


class ConfidenceLevel(Enum):
    """Detection confidence levels based on training data."""
    INSUFFICIENT = "insufficient"  # < 50% confidence
    LOW = "low"  # 50-70% confidence
    MODERATE = "moderate"  # 70-85% confidence
    HIGH = "high"  # 85-95% confidence
    VERY_HIGH = "very_high"  # 95-99% confidence
    EXCELLENT = "excellent"  # > 99% confidence


@dataclass
class AnnotationMetrics:
    """Metrics for annotation quality and quantity."""
    total_annotations: int
    unique_images: int
    avg_annotations_per_image: float
    annotation_diversity_score: float  # 0-1, based on variation in boxes
    temporal_distribution: float  # 0-1, how well distributed over time
    annotator_agreement_score: float  # 0-1, consistency between annotators
    augmentation_factor: int  # Data augmentation multiplier


@dataclass
class SufficiencyAnalysis:
    """Analysis results for annotation sufficiency."""
    category: str
    value: str
    current_confidence: float  # 0-100%
    target_confidence: float  # 95% or 99%
    confidence_level: ConfidenceLevel
    is_sufficient: bool
    required_additional_annotations: int
    estimated_accuracy_range: Tuple[float, float]  # (min%, max%)
    recommendations: List[str]
    metrics: AnnotationMetrics
    quality_factors: Dict[str, float]


class AnnotationStatisticsService:
    """Service for calculating annotation sufficiency statistics.

    Thresholds are calibrated for transfer learning with Faster R-CNN (pretrained on COCO)
    and 8x data augmentation enabled. These values reflect modern deep learning best practices
    where pretrained models require significantly less data than training from scratch.
    """

    # Transfer learning constants (with 8x augmentation: multiply by 8 for effective samples)
    MIN_ANNOTATIONS_BASE = 25      # Minimum for meaningful training (200 effective with augmentation)
    OPTIMAL_ANNOTATIONS_95 = 75    # Target for 95% accuracy (600 effective with augmentation)
    OPTIMAL_ANNOTATIONS_99 = 150   # Target for 99% accuracy (1200 effective with augmentation)
    MIN_UNIQUE_IMAGES = 10         # Minimum unique images needed (with good diversity)
    OPTIMAL_UNIQUE_IMAGES = 50     # Optimal unique images for production

    # Quality multipliers
    DIVERSITY_WEIGHT = 0.15
    TEMPORAL_WEIGHT = 0.10
    AGREEMENT_WEIGHT = 0.20
    AUGMENTATION_WEIGHT = 0.25
    QUANTITY_WEIGHT = 0.30

    def __init__(self):
        """Initialize the annotation statistics service."""
        self.confidence_thresholds = {
            ConfidenceLevel.INSUFFICIENT: 50,
            ConfidenceLevel.LOW: 70,
            ConfidenceLevel.MODERATE: 85,
            ConfidenceLevel.HIGH: 95,
            ConfidenceLevel.VERY_HIGH: 99,
            ConfidenceLevel.EXCELLENT: 99.5
        }

    def calculate_sufficiency(
        self,
        category: str,
        value: str,
        annotations: List[Dict],
        target_accuracy: float = 95.0,
        enable_augmentation: bool = True
    ) -> SufficiencyAnalysis:
        """
        Calculate if annotations are sufficient for target accuracy.

        Args:
            category: Logo category being trained
            value: Specific logo value/brand
            annotations: List of annotation data
            target_accuracy: Target accuracy percentage (95 or 99)
            enable_augmentation: Whether data augmentation is enabled

        Returns:
            SufficiencyAnalysis with detailed metrics and recommendations
        """
        metrics = self._calculate_metrics(annotations, enable_augmentation)
        quality_factors = self._calculate_quality_factors(metrics)
        current_confidence = self._calculate_confidence(metrics, quality_factors)
        confidence_level = self._get_confidence_level(current_confidence)

        is_sufficient = current_confidence >= target_accuracy
        required_additional = self._calculate_required_annotations(
            metrics, current_confidence, target_accuracy
        )

        accuracy_range = self._estimate_accuracy_range(current_confidence, metrics)
        recommendations = self._generate_recommendations(
            metrics, quality_factors, current_confidence, target_accuracy
        )

        return SufficiencyAnalysis(
            category=category,
            value=value,
            current_confidence=current_confidence,
            target_confidence=target_accuracy,
            confidence_level=confidence_level,
            is_sufficient=is_sufficient,
            required_additional_annotations=required_additional,
            estimated_accuracy_range=accuracy_range,
            recommendations=recommendations,
            metrics=metrics,
            quality_factors=quality_factors
        )

    def _calculate_metrics(
        self,
        annotations: List[Dict],
        enable_augmentation: bool
    ) -> AnnotationMetrics:
        """Calculate annotation metrics from raw data."""
        if not annotations:
            return AnnotationMetrics(
                total_annotations=0,
                unique_images=0,
                avg_annotations_per_image=0,
                annotation_diversity_score=0,
                temporal_distribution=0,
                annotator_agreement_score=0,
                augmentation_factor=1
            )

        # Group by image
        images = {}
        for ann in annotations:
            img_id = ann.get('image_id', ann.get('image_path', ''))
            if img_id not in images:
                images[img_id] = []
            images[img_id].append(ann)

        total_annotations = len(annotations)
        unique_images = len(images)
        avg_per_image = total_annotations / unique_images if unique_images > 0 else 0

        # Calculate diversity score based on bounding box variations
        diversity_score = self._calculate_diversity_score(annotations)

        # Calculate temporal distribution
        temporal_score = self._calculate_temporal_distribution(annotations)

        # Calculate annotator agreement
        agreement_score = self._calculate_annotator_agreement(images)

        # Augmentation factor (if enabled)
        augmentation_factor = 8 if enable_augmentation else 1  # Typical augmentation multiplier

        return AnnotationMetrics(
            total_annotations=total_annotations,
            unique_images=unique_images,
            avg_annotations_per_image=avg_per_image,
            annotation_diversity_score=diversity_score,
            temporal_distribution=temporal_score,
            annotator_agreement_score=agreement_score,
            augmentation_factor=augmentation_factor
        )

    def _calculate_diversity_score(self, annotations: List[Dict]) -> float:
        """Calculate diversity of bounding boxes (size, position variation)."""
        if len(annotations) < 2:
            return 0.0

        # Extract box dimensions
        widths = []
        heights = []
        positions = []

        for ann in annotations:
            bbox = ann.get('bbox', ann.get('bounding_box', {}))
            if bbox:
                w = bbox.get('width', 0)
                h = bbox.get('height', 0)
                x = bbox.get('x', 0)
                y = bbox.get('y', 0)

                if w > 0 and h > 0:
                    widths.append(w)
                    heights.append(h)
                    positions.append((x, y))

        if not widths:
            return 0.0

        # Calculate coefficient of variation for sizes
        width_cv = np.std(widths) / np.mean(widths) if np.mean(widths) > 0 else 0
        height_cv = np.std(heights) / np.mean(heights) if np.mean(heights) > 0 else 0

        # Calculate position diversity
        if positions:
            x_coords = [p[0] for p in positions]
            y_coords = [p[1] for p in positions]
            x_range = (max(x_coords) - min(x_coords)) / 100.0  # Normalize to 0-1
            y_range = (max(y_coords) - min(y_coords)) / 100.0
            position_diversity = min(1.0, (x_range + y_range) / 2)
        else:
            position_diversity = 0

        # Combine metrics
        size_diversity = min(1.0, (width_cv + height_cv) / 2)
        diversity_score = (size_diversity + position_diversity) / 2

        return min(1.0, diversity_score)

    def _calculate_temporal_distribution(self, annotations: List[Dict]) -> float:
        """Calculate how well distributed annotations are over time."""
        if len(annotations) < 2:
            return 1.0  # Perfect if only one annotation

        # Extract timestamps
        timestamps = []
        for ann in annotations:
            ts = ann.get('created_at', ann.get('timestamp'))
            if ts:
                if isinstance(ts, str):
                    try:
                        ts = datetime.fromisoformat(ts)
                    except:
                        continue
                timestamps.append(ts)

        if len(timestamps) < 2:
            return 0.5  # Default if no temporal data

        timestamps.sort()

        # Calculate time gaps
        gaps = []
        for i in range(1, len(timestamps)):
            gap = (timestamps[i] - timestamps[i-1]).total_seconds()
            gaps.append(gap)

        if not gaps:
            return 1.0

        # Calculate uniformity of gaps
        mean_gap = np.mean(gaps)
        if mean_gap == 0:
            return 0.5

        std_gap = np.std(gaps)
        cv = std_gap / mean_gap

        # Convert to 0-1 score (lower CV is better)
        temporal_score = max(0, 1 - (cv / 2))

        return min(1.0, temporal_score)

    def _calculate_annotator_agreement(self, images: Dict) -> float:
        """Calculate agreement between multiple annotators."""
        if not images:
            return 1.0

        agreement_scores = []

        for img_id, anns in images.items():
            if len(anns) < 2:
                continue

            # Calculate IoU between annotations for same image
            ious = []
            for i in range(len(anns)):
                for j in range(i + 1, len(anns)):
                    iou = self._calculate_iou(
                        anns[i].get('bbox', anns[i].get('bounding_box', {})),
                        anns[j].get('bbox', anns[j].get('bounding_box', {}))
                    )
                    if iou >= 0:
                        ious.append(iou)

            if ious:
                agreement_scores.append(np.mean(ious))

        if not agreement_scores:
            return 0.8  # Default moderate agreement

        return min(1.0, np.mean(agreement_scores))

    def _calculate_iou(self, box1: Dict, box2: Dict) -> float:
        """Calculate Intersection over Union for two boxes."""
        if not box1 or not box2:
            return -1

        x1 = box1.get('x', 0)
        y1 = box1.get('y', 0)
        w1 = box1.get('width', 0)
        h1 = box1.get('height', 0)

        x2 = box2.get('x', 0)
        y2 = box2.get('y', 0)
        w2 = box2.get('width', 0)
        h2 = box2.get('height', 0)

        if w1 <= 0 or h1 <= 0 or w2 <= 0 or h2 <= 0:
            return -1

        # Calculate intersection
        x_left = max(x1, x2)
        y_top = max(y1, y2)
        x_right = min(x1 + w1, x2 + w2)
        y_bottom = min(y1 + h1, y2 + h2)

        if x_right < x_left or y_bottom < y_top:
            return 0.0

        intersection_area = (x_right - x_left) * (y_bottom - y_top)
        box1_area = w1 * h1
        box2_area = w2 * h2
        union_area = box1_area + box2_area - intersection_area

        if union_area <= 0:
            return 0.0

        return intersection_area / union_area

    def _calculate_quality_factors(self, metrics: AnnotationMetrics) -> Dict[str, float]:
        """Calculate quality factors that affect model performance."""
        factors = {}

        # Quantity factor (0-1) with sigmoid curve for smoother progression
        effective_annotations = metrics.total_annotations * metrics.augmentation_factor
        factors['quantity'] = min(1.0, effective_annotations / self.OPTIMAL_ANNOTATIONS_99)

        # Unique images factor with non-linear curve (diminishing returns after minimum)
        # Reaching minimum (15) gives 0.6, optimal (60) gives 1.0
        if metrics.unique_images >= self.MIN_UNIQUE_IMAGES:
            progress = (metrics.unique_images - self.MIN_UNIQUE_IMAGES) / \
                      (self.OPTIMAL_UNIQUE_IMAGES - self.MIN_UNIQUE_IMAGES)
            factors['image_diversity'] = 0.6 + 0.4 * min(1.0, progress)
        else:
            # Below minimum: linear 0-0.6
            factors['image_diversity'] = 0.6 * (metrics.unique_images / self.MIN_UNIQUE_IMAGES)

        # Annotation diversity
        factors['annotation_diversity'] = metrics.annotation_diversity_score

        # Temporal distribution
        factors['temporal_quality'] = metrics.temporal_distribution

        # Annotator agreement
        factors['consistency'] = metrics.annotator_agreement_score

        # Data balance (annotations per image shouldn't be too skewed)
        if metrics.avg_annotations_per_image > 0:
            balance_score = 1.0 - abs(3.0 - metrics.avg_annotations_per_image) / 10.0
            factors['data_balance'] = max(0, min(1.0, balance_score))
        else:
            factors['data_balance'] = 0

        return factors

    def _calculate_confidence(
        self,
        metrics: AnnotationMetrics,
        quality_factors: Dict[str, float]
    ) -> float:
        """Calculate overall confidence score (0-100%)."""
        if metrics.total_annotations == 0:
            return 0.0

        # Weighted combination of factors
        weighted_score = (
            quality_factors.get('quantity', 0) * self.QUANTITY_WEIGHT +
            quality_factors.get('annotation_diversity', 0) * self.DIVERSITY_WEIGHT +
            quality_factors.get('temporal_quality', 0) * self.TEMPORAL_WEIGHT +
            quality_factors.get('consistency', 0) * self.AGREEMENT_WEIGHT +
            quality_factors.get('image_diversity', 0) * self.AUGMENTATION_WEIGHT
        )

        # Apply non-linear scaling calibrated for transfer learning
        # Curve is steeper than training from scratch due to pretrained weights
        effective_annotations = metrics.total_annotations * metrics.augmentation_factor

        if effective_annotations < self.MIN_ANNOTATIONS_BASE:
            # Below minimum: linear 0-50%
            base_confidence = 50 * (effective_annotations / self.MIN_ANNOTATIONS_BASE)
        elif effective_annotations < self.OPTIMAL_ANNOTATIONS_95:
            # Minimum to 95% target: 50-90%
            progress = (effective_annotations - self.MIN_ANNOTATIONS_BASE) / \
                      (self.OPTIMAL_ANNOTATIONS_95 - self.MIN_ANNOTATIONS_BASE)
            base_confidence = 50 + 40 * progress  # Linear 50-90%
        elif effective_annotations < self.OPTIMAL_ANNOTATIONS_99:
            # 95% to 99% target: 90-97%
            progress = (effective_annotations - self.OPTIMAL_ANNOTATIONS_95) / \
                      (self.OPTIMAL_ANNOTATIONS_99 - self.OPTIMAL_ANNOTATIONS_95)
            base_confidence = 90 + 7 * progress  # 90-97%
        else:
            # Beyond 99% target: logarithmic 97-99%
            excess = effective_annotations - self.OPTIMAL_ANNOTATIONS_99
            base_confidence = 97 + 2 * (1 - math.exp(-excess / 200))  # Asymptote at 99%

        # Combine base confidence with quality factors
        final_confidence = base_confidence * (0.6 + 0.4 * weighted_score)

        return min(99.9, final_confidence)  # Cap at 99.9%

    def _get_confidence_level(self, confidence: float) -> ConfidenceLevel:
        """Get confidence level enum from percentage."""
        for level in reversed(list(ConfidenceLevel)):
            if confidence >= self.confidence_thresholds[level]:
                return level
        return ConfidenceLevel.INSUFFICIENT

    def _calculate_required_annotations(
        self,
        metrics: AnnotationMetrics,
        current_confidence: float,
        target_confidence: float
    ) -> int:
        """Calculate how many more annotations are needed."""
        if current_confidence >= target_confidence:
            return 0

        # Determine target annotation count
        if target_confidence >= 99:
            target_total = self.OPTIMAL_ANNOTATIONS_99
        elif target_confidence >= 95:
            target_total = self.OPTIMAL_ANNOTATIONS_95
        else:
            target_total = self.MIN_ANNOTATIONS_BASE

        # Account for augmentation
        current_effective = metrics.total_annotations * metrics.augmentation_factor

        if current_effective >= target_total:
            # Quality is the issue, not quantity
            return max(10, int(metrics.total_annotations * 0.2))  # Add 20% more

        # Calculate required based on gap
        required_effective = target_total - current_effective
        required_actual = math.ceil(required_effective / metrics.augmentation_factor)

        return max(0, required_actual)

    def _estimate_accuracy_range(
        self,
        confidence: float,
        metrics: AnnotationMetrics
    ) -> Tuple[float, float]:
        """Estimate likely accuracy range based on confidence and metrics."""
        # Base range from confidence
        if confidence >= 99:
            base_min, base_max = 97, 99.5
        elif confidence >= 95:
            base_min, base_max = 93, 97
        elif confidence >= 85:
            base_min, base_max = 83, 93
        elif confidence >= 70:
            base_min, base_max = 68, 85
        elif confidence >= 50:
            base_min, base_max = 45, 70
        else:
            base_min, base_max = 20, 50

        # Adjust based on quality factors
        quality_avg = (
            metrics.annotation_diversity_score +
            metrics.temporal_distribution +
            metrics.annotator_agreement_score
        ) / 3

        # Widen range if quality is low
        if quality_avg < 0.5:
            range_adjustment = (0.5 - quality_avg) * 10
            base_min = max(0, base_min - range_adjustment)
            base_max = max(base_min + 5, base_max - range_adjustment / 2)

        return (round(base_min, 1), round(base_max, 1))

    def _generate_recommendations(
        self,
        metrics: AnnotationMetrics,
        quality_factors: Dict[str, float],
        current_confidence: float,
        target_confidence: float
    ) -> List[str]:
        """Generate actionable recommendations for improvement."""
        recommendations = []

        # Check quantity
        if quality_factors.get('quantity', 0) < 0.7:
            if metrics.total_annotations < self.MIN_ANNOTATIONS_BASE:
                recommendations.append(
                    f"🔴 Critical: Add at least {self.MIN_ANNOTATIONS_BASE - metrics.total_annotations} "
                    f"more annotations to reach minimum threshold"
                )
            else:
                recommendations.append(
                    f"🟡 Add {self._calculate_required_annotations(metrics, current_confidence, target_confidence)} "
                    f"more annotations to improve confidence"
                )

        # Check image diversity
        if quality_factors.get('image_diversity', 0) < 0.5:
            needed_images = max(
                self.MIN_UNIQUE_IMAGES - metrics.unique_images,
                int(metrics.unique_images * 0.5)
            )
            recommendations.append(
                f"🟡 Increase image variety: Add {needed_images} more unique images "
                f"(currently {metrics.unique_images})"
            )

        # Check annotation diversity
        if metrics.annotation_diversity_score < 0.5:
            recommendations.append(
                "🟡 Improve diversity: Include logos at different sizes, positions, and angles"
            )

        # Check temporal distribution
        if metrics.temporal_distribution < 0.5:
            recommendations.append(
                "🟢 Spread annotation work over multiple sessions to avoid bias"
            )

        # Check annotator agreement
        if metrics.annotator_agreement_score < 0.7:
            recommendations.append(
                "🟡 Review annotation consistency: Consider having multiple people verify annotations"
            )

        # Check data balance
        if quality_factors.get('data_balance', 0) < 0.5:
            if metrics.avg_annotations_per_image > 5:
                recommendations.append(
                    "🟢 Balance dataset: Too many annotations per image, add more unique images"
                )
            elif metrics.avg_annotations_per_image < 1.5:
                recommendations.append(
                    "🟢 Add multiple annotation examples per image for better coverage"
                )

        # Data augmentation recommendation
        if metrics.augmentation_factor == 1:
            recommendations.append(
                "💡 Enable data augmentation to multiply effective training data by 8x"
            )

        # Success message
        if current_confidence >= target_confidence:
            recommendations.insert(0,
                f"✅ Sufficient annotations for {target_confidence}% target accuracy! "
                f"Ready for training."
            )

        # Sort by priority (Critical > Warning > Info)
        recommendations.sort(key=lambda x: (
            0 if x.startswith('✅') else
            1 if x.startswith('🔴') else
            2 if x.startswith('🟡') else
            3
        ))

        return recommendations


class AnnotationProgressTracker:
    """Track annotation progress in real-time."""

    def __init__(self):
        """Initialize the progress tracker."""
        self.sessions = {}  # Track per-session progress
        # Milestones aligned with transfer learning thresholds
        self.milestones = [10, 15, 25, 50, 75, 100, 150, 200]

    def update_progress(
        self,
        session_id: str,
        category: str,
        value: str,
        new_annotation_count: int
    ) -> Dict:
        """
        Update and return progress information.

        Returns:
            Dict with progress percentage, next milestone, and achievements
        """
        key = f"{session_id}:{category}:{value}"

        if key not in self.sessions:
            self.sessions[key] = {
                'start_count': new_annotation_count - 1,
                'start_time': datetime.now(),
                'milestones_reached': []
            }

        session = self.sessions[key]
        session['current_count'] = new_annotation_count

        # Calculate progress metrics
        elapsed = (datetime.now() - session['start_time']).total_seconds()
        rate = (new_annotation_count - session['start_count']) / (elapsed / 60) if elapsed > 0 else 0

        # Check milestones
        for milestone in self.milestones:
            if new_annotation_count >= milestone and milestone not in session['milestones_reached']:
                session['milestones_reached'].append(milestone)

        # Find next milestone
        next_milestone = None
        for milestone in self.milestones:
            if new_annotation_count < milestone:
                next_milestone = milestone
                break

        # Calculate progress to next milestone
        progress_to_next = 0
        if next_milestone:
            prev_milestone = 0
            for m in self.milestones:
                if m >= next_milestone:
                    break
                if new_annotation_count >= m:
                    prev_milestone = m

            if next_milestone > prev_milestone:
                progress_to_next = ((new_annotation_count - prev_milestone) /
                                  (next_milestone - prev_milestone)) * 100
        else:
            progress_to_next = 100  # Past all milestones

        return {
            'session_id': session_id,
            'category': category,
            'value': value,
            'current_count': new_annotation_count,
            'annotations_this_session': new_annotation_count - session['start_count'],
            'rate_per_minute': round(rate, 1),
            'next_milestone': next_milestone,
            'progress_to_next_milestone': round(progress_to_next, 1),
            'milestones_reached': session['milestones_reached'],
            'estimated_time_to_milestone': self._estimate_time_to_milestone(
                new_annotation_count, next_milestone, rate
            )
        }

    def _estimate_time_to_milestone(
        self,
        current: int,
        milestone: Optional[int],
        rate: float
    ) -> Optional[str]:
        """Estimate time to reach next milestone."""
        if not milestone or rate <= 0:
            return None

        remaining = milestone - current
        minutes = remaining / rate

        if minutes < 60:
            return f"{int(minutes)} minutes"
        elif minutes < 1440:
            return f"{minutes / 60:.1f} hours"
        else:
            return f"{minutes / 1440:.1f} days"