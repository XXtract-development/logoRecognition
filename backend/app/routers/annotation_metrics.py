"""
API endpoints for annotation sufficiency metrics and statistics.
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Dict, List, Optional
from datetime import datetime
import json

from ..services.annotation_statistics import (
    AnnotationStatisticsService,
    AnnotationProgressTracker,
    SufficiencyAnalysis,
    ConfidenceLevel
)
from ..database import get_db
from sqlalchemy.orm import Session


router = APIRouter(tags=["annotation-metrics"])

# Initialize services
stats_service = AnnotationStatisticsService()
progress_tracker = AnnotationProgressTracker()


@router.get("/sufficiency/{category}/{value}")
async def check_annotation_sufficiency(
    category: str,
    value: str,
    target_accuracy: float = Query(95.0, ge=50.0, le=99.9, description="Target accuracy percentage"),
    enable_augmentation: bool = Query(True, description="Whether data augmentation is enabled"),
    db: Session = Depends(get_db)
) -> Dict:
    """
    Check if annotations are sufficient for achieving target detection accuracy.

    Args:
        category: Logo category being trained
        value: Specific logo value/brand
        target_accuracy: Target accuracy percentage (50-99.9)
        enable_augmentation: Whether data augmentation will be used

    Returns:
        Detailed sufficiency analysis including confidence, recommendations, and metrics
    """
    try:
        # Fetch annotations from database
        # This is a placeholder - adapt to your actual database schema
        annotations = fetch_annotations_from_db(db, category, value)

        # Calculate sufficiency
        analysis = stats_service.calculate_sufficiency(
            category=category,
            value=value,
            annotations=annotations,
            target_accuracy=target_accuracy,
            enable_augmentation=enable_augmentation
        )

        return {
            "status": "success",
            "analysis": {
                "category": analysis.category,
                "value": analysis.value,
                "summary": {
                    "is_sufficient": analysis.is_sufficient,
                    "current_confidence": round(analysis.current_confidence, 1),
                    "target_confidence": analysis.target_confidence,
                    "confidence_level": analysis.confidence_level.value,
                    "estimated_accuracy_range": {
                        "min": analysis.estimated_accuracy_range[0],
                        "max": analysis.estimated_accuracy_range[1]
                    }
                },
                "metrics": {
                    "total_annotations": analysis.metrics.total_annotations,
                    "unique_images": analysis.metrics.unique_images,
                    "avg_annotations_per_image": round(analysis.metrics.avg_annotations_per_image, 2),
                    "annotation_diversity_score": round(analysis.metrics.annotation_diversity_score, 2),
                    "temporal_distribution": round(analysis.metrics.temporal_distribution, 2),
                    "annotator_agreement_score": round(analysis.metrics.annotator_agreement_score, 2),
                    "augmentation_factor": analysis.metrics.augmentation_factor
                },
                "quality_factors": {
                    k: round(v, 2) for k, v in analysis.quality_factors.items()
                },
                "requirements": {
                    "required_additional_annotations": analysis.required_additional_annotations,
                    "recommendations": analysis.recommendations
                },
                "visual_indicator": get_visual_indicator(analysis)
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/progress/{category}/{value}")
async def get_annotation_progress(
    category: str,
    value: str,
    session_id: str = Query(..., description="Session identifier"),
    db: Session = Depends(get_db)
) -> Dict:
    """
    Get real-time annotation progress for current session.

    Returns progress metrics, milestones, and rate information.
    """
    try:
        # Get current annotation count
        annotations = fetch_annotations_from_db(db, category, value)
        current_count = len(annotations)

        # Update and get progress
        progress = progress_tracker.update_progress(
            session_id=session_id,
            category=category,
            value=value,
            new_annotation_count=current_count
        )

        # Get sufficiency for context
        analysis = stats_service.calculate_sufficiency(
            category=category,
            value=value,
            annotations=annotations,
            target_accuracy=95.0
        )

        return {
            "status": "success",
            "progress": progress,
            "sufficiency": {
                "current_confidence": round(analysis.current_confidence, 1),
                "is_ready_95": analysis.current_confidence >= 95,
                "is_ready_99": analysis.current_confidence >= 99
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/batch-sufficiency")
async def check_batch_sufficiency(
    db: Session = Depends(get_db)
) -> Dict:
    """
    Check sufficiency for all logo categories and values in the database.

    Returns a comprehensive overview of training readiness across all logos.
    """
    try:
        # Get all unique category/value pairs
        categories_values = fetch_all_categories_values(db)

        results = []
        summary_stats = {
            "total_logos": len(categories_values),
            "ready_for_95": 0,
            "ready_for_99": 0,
            "insufficient": 0,
            "total_annotations": 0
        }

        for category, value in categories_values:
            annotations = fetch_annotations_from_db(db, category, value)

            if not annotations:
                continue

            analysis = stats_service.calculate_sufficiency(
                category=category,
                value=value,
                annotations=annotations,
                target_accuracy=95.0
            )

            results.append({
                "category": category,
                "value": value,
                "annotations": len(annotations),
                "confidence": round(analysis.current_confidence, 1),
                "confidence_level": analysis.confidence_level.value,
                "is_ready_95": analysis.current_confidence >= 95,
                "is_ready_99": analysis.current_confidence >= 99,
                "needed_annotations": analysis.required_additional_annotations
            })

            # Update summary
            summary_stats["total_annotations"] += len(annotations)
            if analysis.current_confidence >= 99:
                summary_stats["ready_for_99"] += 1
            elif analysis.current_confidence >= 95:
                summary_stats["ready_for_95"] += 1
            elif analysis.current_confidence < 50:
                summary_stats["insufficient"] += 1

        # Sort by confidence (lowest first, to highlight what needs work)
        results.sort(key=lambda x: x["confidence"])

        return {
            "status": "success",
            "summary": summary_stats,
            "details": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/recommendations/{category}/{value}")
async def get_improvement_recommendations(
    category: str,
    value: str,
    db: Session = Depends(get_db)
) -> Dict:
    """
    Get detailed recommendations for improving annotation quality and quantity.

    Provides actionable steps to achieve desired detection accuracy.
    """
    try:
        annotations = fetch_annotations_from_db(db, category, value)

        # Get recommendations for both 95% and 99% targets
        analysis_95 = stats_service.calculate_sufficiency(
            category=category,
            value=value,
            annotations=annotations,
            target_accuracy=95.0
        )

        analysis_99 = stats_service.calculate_sufficiency(
            category=category,
            value=value,
            annotations=annotations,
            target_accuracy=99.0
        )

        return {
            "status": "success",
            "current_state": {
                "total_annotations": analysis_95.metrics.total_annotations,
                "unique_images": analysis_95.metrics.unique_images,
                "current_confidence": round(analysis_95.current_confidence, 1),
                "quality_score": round(sum(analysis_95.quality_factors.values()) / len(analysis_95.quality_factors), 2)
            },
            "targets": {
                "95_percent": {
                    "is_achieved": analysis_95.is_sufficient,
                    "required_annotations": analysis_95.required_additional_annotations,
                    "recommendations": analysis_95.recommendations
                },
                "99_percent": {
                    "is_achieved": analysis_99.is_sufficient,
                    "required_annotations": analysis_99.required_additional_annotations,
                    "recommendations": analysis_99.recommendations
                }
            },
            "action_plan": generate_action_plan(analysis_95, analysis_99)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/simulate-additions/{category}/{value}")
async def simulate_annotation_additions(
    category: str,
    value: str,
    additional_annotations: int = Query(..., ge=1, le=1000),
    additional_images: int = Query(0, ge=0, le=500),
    db: Session = Depends(get_db)
) -> Dict:
    """
    Simulate the effect of adding more annotations.

    Shows predicted confidence and accuracy after adding specified annotations.
    """
    try:
        # Get current annotations
        current_annotations = fetch_annotations_from_db(db, category, value)

        # Simulate additional annotations
        simulated_annotations = current_annotations.copy()

        # Add simulated data
        for i in range(additional_annotations):
            simulated_annotations.append({
                "image_id": f"simulated_{i % max(1, additional_images)}",
                "bbox": {
                    "x": 10 + (i % 80),
                    "y": 10 + (i % 80),
                    "width": 20 + (i % 30),
                    "height": 20 + (i % 30)
                },
                "created_at": datetime.now().isoformat()
            })

        # Calculate with simulated data
        current_analysis = stats_service.calculate_sufficiency(
            category=category,
            value=value,
            annotations=current_annotations,
            target_accuracy=95.0
        )

        simulated_analysis = stats_service.calculate_sufficiency(
            category=category,
            value=value,
            annotations=simulated_annotations,
            target_accuracy=95.0
        )

        improvement = simulated_analysis.current_confidence - current_analysis.current_confidence

        return {
            "status": "success",
            "current": {
                "annotations": len(current_annotations),
                "confidence": round(current_analysis.current_confidence, 1),
                "level": current_analysis.confidence_level.value
            },
            "simulated": {
                "annotations": len(simulated_annotations),
                "confidence": round(simulated_analysis.current_confidence, 1),
                "level": simulated_analysis.confidence_level.value,
                "improvement": round(improvement, 1),
                "would_reach_95": simulated_analysis.current_confidence >= 95,
                "would_reach_99": simulated_analysis.current_confidence >= 99
            },
            "recommendation": (
                "This addition would be sufficient for 99% accuracy!" if simulated_analysis.current_confidence >= 99
                else "This addition would be sufficient for 95% accuracy!" if simulated_analysis.current_confidence >= 95
                else f"You would still need approximately {simulated_analysis.required_additional_annotations} more annotations for 95% accuracy"
            )
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Helper functions

def fetch_annotations_from_db(db: Session, category: str, value: str) -> List[Dict]:
    """
    Fetch annotations from database.

    This is a placeholder - implement according to your actual database schema.
    """
    # Example implementation - adapt to your schema
    query = """
    SELECT a.* FROM annotations a
    WHERE a.category = :category AND a.value = :value
    """

    # For now, return mock data for testing
    # Replace with actual database query
    return [
        {
            "id": i,
            "image_id": f"img_{i // 3}",
            "category": category,
            "value": value,
            "bbox": {
                "x": 10 + (i * 5 % 80),
                "y": 10 + (i * 3 % 80),
                "width": 20 + (i % 30),
                "height": 20 + (i % 30)
            },
            "created_at": datetime.now().isoformat()
        }
        for i in range(50)  # Mock 50 annotations
    ]


def fetch_all_categories_values(db: Session) -> List[tuple]:
    """
    Fetch all unique category/value pairs from database.
    """
    # Example implementation - adapt to your schema
    query = """
    SELECT DISTINCT category, value FROM annotations
    ORDER BY category, value
    """

    # Mock data for testing
    return [
        ("brand", "nike"),
        ("brand", "adidas"),
        ("brand", "apple"),
        ("type", "logo"),
        ("type", "text")
    ]


def get_visual_indicator(analysis: SufficiencyAnalysis) -> Dict:
    """
    Generate visual indicator data for UI display.
    """
    confidence = analysis.current_confidence

    # Color coding
    if confidence >= 95:
        color = "#10B981"  # Green
        status = "excellent"
        icon = "✅"
    elif confidence >= 85:
        color = "#3B82F6"  # Blue
        status = "good"
        icon = "👍"
    elif confidence >= 70:
        color = "#F59E0B"  # Yellow
        status = "moderate"
        icon = "⚠️"
    elif confidence >= 50:
        color = "#EF4444"  # Orange
        status = "low"
        icon = "⚠️"
    else:
        color = "#991B1B"  # Red
        status = "insufficient"
        icon = "❌"

    return {
        "percentage": round(confidence, 1),
        "color": color,
        "status": status,
        "icon": icon,
        "progress_bar": {
            "value": confidence,
            "max": 100,
            "segments": [
                {"threshold": 50, "label": "Min"},
                {"threshold": 70, "label": "Low"},
                {"threshold": 85, "label": "Good"},
                {"threshold": 95, "label": "Ready"},
                {"threshold": 99, "label": "Optimal"}
            ]
        }
    }


def generate_action_plan(analysis_95: SufficiencyAnalysis, analysis_99: SufficiencyAnalysis) -> List[Dict]:
    """
    Generate a prioritized action plan for achieving target accuracy.
    """
    plan = []

    # Immediate actions
    if analysis_95.metrics.total_annotations < 100:
        plan.append({
            "priority": "critical",
            "action": "Add minimum annotations",
            "details": f"Add at least {100 - analysis_95.metrics.total_annotations} annotations to reach minimum threshold",
            "impact": "high"
        })

    # Quality improvements
    if analysis_95.metrics.annotation_diversity_score < 0.5:
        plan.append({
            "priority": "high",
            "action": "Improve annotation diversity",
            "details": "Include logos at various sizes, positions, lighting conditions, and angles",
            "impact": "medium"
        })

    if analysis_95.metrics.unique_images < 50:
        plan.append({
            "priority": "high",
            "action": "Increase image variety",
            "details": f"Add {50 - analysis_95.metrics.unique_images} more unique images with the logo",
            "impact": "high"
        })

    # Optimization suggestions
    if analysis_95.metrics.augmentation_factor == 1:
        plan.append({
            "priority": "medium",
            "action": "Enable data augmentation",
            "details": "Turn on augmentation to multiply training data by 8x without additional annotations",
            "impact": "high"
        })

    if analysis_95.metrics.annotator_agreement_score < 0.7:
        plan.append({
            "priority": "medium",
            "action": "Review annotation quality",
            "details": "Have multiple people verify annotations for consistency",
            "impact": "medium"
        })

    # Long-term goals
    if not analysis_99.is_sufficient and analysis_95.is_sufficient:
        plan.append({
            "priority": "low",
            "action": "Reach 99% confidence",
            "details": f"Add {analysis_99.required_additional_annotations} more annotations for optimal performance",
            "impact": "low"
        })

    return plan