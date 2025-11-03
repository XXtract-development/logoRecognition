#!/usr/bin/env python3
"""
Simple Flask server for annotation sufficiency metrics without database dependencies.
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import random
from datetime import datetime

app = Flask(__name__)
CORS(app, origins=["http://localhost:4001", "http://localhost:3000"])

@app.route('/api/annotation-metrics/sufficiency/<category>/<value>')
def get_sufficiency(category, value):
    """
    Mock endpoint for annotation sufficiency analysis.
    Returns realistic mock data based on category and value.
    """
    target_accuracy = float(request.args.get('target_accuracy', 95))
    enable_augmentation = request.args.get('enable_augmentation', 'true').lower() == 'true'

    # Generate consistent mock data based on category and value
    seed = hash(f"{category}_{value}") % 1000
    random.seed(seed)

    # Simulate different sufficiency levels based on seed
    base_annotations = 100 + (seed % 400)
    if enable_augmentation:
        effective_annotations = base_annotations * 6  # Augmentation factor
    else:
        effective_annotations = base_annotations

    # Calculate confidence based on target and annotations
    if target_accuracy >= 99:
        required = 1000
    else:
        required = 500

    confidence = min(100, (effective_annotations / required) * 100)
    is_sufficient = confidence >= 85

    # Determine confidence level
    if confidence >= 95:
        confidence_level = "excellent"
        status = "excellent"
        color = "#52c41a"
        icon = "check-circle"
    elif confidence >= 85:
        confidence_level = "very_high"
        status = "very_high"
        color = "#52c41a"
        icon = "check-circle"
    elif confidence >= 70:
        confidence_level = "high"
        status = "high"
        color = "#1890ff"
        icon = "check-circle"
    elif confidence >= 55:
        confidence_level = "moderate"
        status = "moderate"
        color = "#faad14"
        icon = "warning"
    else:
        confidence_level = "low"
        status = "low"
        color = "#ff4d4f"
        icon = "close-circle"

    # Calculate additional annotations needed
    additional_needed = max(0, required - effective_annotations)
    if enable_augmentation and additional_needed > 0:
        additional_needed = additional_needed // 6  # Account for augmentation

    # Generate recommendations
    recommendations = []
    if not is_sufficient:
        if additional_needed > 0:
            recommendations.append(f"🔴 Add {int(additional_needed)} more annotations to reach {int(target_accuracy)}% accuracy target")
        if base_annotations < 50:
            recommendations.append("🟡 Current dataset is very small - aim for at least 100 base annotations")
        if not enable_augmentation:
            recommendations.append("💡 Enable data augmentation to multiply your effective dataset size by 6x")
    else:
        recommendations.append(f"✅ Dataset is sufficient for {int(target_accuracy)}% target accuracy")
        recommendations.append("🟢 Ready to start training")

    response = {
        "analysis": {
            "category": category,
            "value": value,
            "summary": {
                "is_sufficient": is_sufficient,
                "current_confidence": confidence,
                "target_confidence": 85.0,
                "confidence_level": confidence_level,
                "estimated_accuracy_range": {
                    "min": max(50, confidence - 10),
                    "max": min(99, confidence + 5)
                }
            },
            "metrics": {
                "total_annotations": base_annotations,
                "unique_images": base_annotations // 2,
                "avg_annotations_per_image": 2.0,
                "annotation_diversity_score": 0.75 + (random.random() * 0.2),
                "temporal_distribution": 0.8 + (random.random() * 0.15),
                "annotator_agreement_score": 0.85 + (random.random() * 0.1),
                "augmentation_factor": 6 if enable_augmentation else 1
            },
            "quality_factors": {
                "quantity_score": min(1.0, base_annotations / 500),
                "diversity_score": 0.75 + (random.random() * 0.2),
                "consistency_score": 0.8 + (random.random() * 0.15),
                "coverage_score": 0.7 + (random.random() * 0.25),
                "balance_score": 0.85 + (random.random() * 0.1)
            },
            "requirements": {
                "required_additional_annotations": int(additional_needed),
                "recommendations": recommendations
            },
            "visual_indicator": {
                "percentage": int(confidence),
                "color": color,
                "status": status,
                "icon": icon,
                "progress_bar": {
                    "value": int(confidence),
                    "max": 100,
                    "segments": [
                        {"threshold": 55, "label": "Low"},
                        {"threshold": 70, "label": "Moderate"},
                        {"threshold": 85, "label": "High"},
                        {"threshold": 95, "label": "Excellent"}
                    ]
                }
            }
        },
        "timestamp": datetime.now().isoformat(),
        "request_id": f"req_{random.randint(1000, 9999)}"
    }

    return jsonify(response)

@app.route('/health')
def health():
    return jsonify({"status": "healthy"})

if __name__ == '__main__':
    print("Starting simple annotation metrics server on port 8000...")
    app.run(host='0.0.0.0', port=8000, debug=True)