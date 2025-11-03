#!/usr/bin/env python3
"""
Flask server for annotation sufficiency metrics using real data stored in JSON files.
"""

from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
import json
import os
from pathlib import Path
from datetime import datetime
from collections import defaultdict
import hashlib
import base64
from io import BytesIO

app = Flask(__name__)
CORS(app, origins=["http://localhost:4001", "http://localhost:3000"])

# Data storage directory
DATA_DIR = Path("/Users/frisovanweelden/Documents/projects/logoRecognition/backend/data")
ANNOTATIONS_FILE = DATA_DIR / "annotations.json"
UPLOADS_FILE = DATA_DIR / "uploads.json"
IMAGES_DIR = DATA_DIR / "images"

# Create data directories if they don't exist
DATA_DIR.mkdir(exist_ok=True)
IMAGES_DIR.mkdir(exist_ok=True)

def load_annotations():
    """Load annotations from JSON file"""
    if ANNOTATIONS_FILE.exists():
        with open(ANNOTATIONS_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_annotations(annotations):
    """Save annotations to JSON file"""
    with open(ANNOTATIONS_FILE, 'w') as f:
        json.dump(annotations, f, indent=2)

def load_uploads():
    """Load upload data from JSON file"""
    if UPLOADS_FILE.exists():
        with open(UPLOADS_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_uploads(uploads):
    """Save upload data to JSON file"""
    with open(UPLOADS_FILE, 'w') as f:
        json.dump(uploads, f, indent=2)

@app.route('/api/v1/logos/<file_id>/annotations', methods=['GET', 'POST'])
def handle_annotations(file_id):
    """Handle annotation storage and retrieval"""
    annotations = load_annotations()

    if request.method == 'GET':
        # Return annotations for this file
        if file_id in annotations:
            return jsonify({"annotations": annotations[file_id]})
        else:
            return jsonify({"annotations": []})

    elif request.method == 'POST':
        # Store annotations for this file
        data = request.get_json()
        if 'annotations' in data:
            annotations[file_id] = data['annotations']
            save_annotations(annotations)
            return jsonify({"status": "saved", "count": len(data['annotations'])})
        else:
            return jsonify({"error": "No annotations provided"}), 400

@app.route('/api/v1/logos/upload', methods=['POST'])
def upload_file():
    """Handle file uploads"""
    # Support both 'file' and 'files' parameter names
    files = request.files.getlist('files')
    if not files or (len(files) == 1 and not files[0].filename):
        # Try single file upload
        single_file = request.files.get('file')
        if single_file:
            files = [single_file]

    uploads = load_uploads()

    uploaded_files = []
    for file in files:
        if not file.filename:
            continue
        # Generate file ID
        file_id = hashlib.md5(f"{file.filename}_{datetime.now().isoformat()}".encode()).hexdigest()[:12]

        # Save the actual file
        file_path = IMAGES_DIR / f"{file_id}.png"
        file.save(str(file_path))

        # Store file metadata
        file_info = {
            "file_id": file_id,
            "filename": file.filename,
            "uploaded_at": datetime.now().isoformat(),
            "file_path": str(file_path)
        }
        uploads[file_id] = file_info
        uploaded_files.append(file_info)

    save_uploads(uploads)
    return jsonify({"status": "success", "results": uploaded_files})

@app.route('/api/annotation-metrics/sufficiency/<category>/<value>')
def get_sufficiency_real_data(category, value):
    """
    Calculate sufficiency based on REAL annotation data.
    """
    target_accuracy = float(request.args.get('target_accuracy', 95))
    enable_augmentation = request.args.get('enable_augmentation', 'true').lower() == 'true'

    # Load real annotations
    annotations = load_annotations()

    # Count annotations for this category/value combination
    total_annotations = 0
    unique_images = set()
    annotations_by_category = defaultdict(lambda: defaultdict(int))

    for file_id, file_annotations in annotations.items():
        for annotation in file_annotations:
            if isinstance(annotation, dict):
                ann_category = annotation.get('category', '').lower()
                ann_value = annotation.get('value', '').lower()

                # Count annotations matching the requested category/value
                if ann_category == category.lower() and ann_value == value.lower():
                    total_annotations += 1
                    unique_images.add(file_id)
                    annotations_by_category[ann_category][ann_value] += 1

    # Calculate metrics based on real data
    num_unique_images = len(unique_images)
    base_annotations = total_annotations

    if enable_augmentation:
        # Data augmentation typically multiplies dataset by 6x (rotation, flip, brightness, etc.)
        effective_annotations = base_annotations * 6
    else:
        effective_annotations = base_annotations

    # Calculate confidence based on target and annotations
    # More realistic values for logo detection with data augmentation
    if target_accuracy >= 99:
        required = 100   # Need ~100 annotations for 99% accuracy with augmentation
    elif target_accuracy >= 95:
        required = 50    # Need ~50 annotations for 95% accuracy with augmentation
    else:
        required = 30    # Need ~30 annotations for 90% accuracy with augmentation

    # Calculate confidence with non-linear scaling
    if effective_annotations == 0:
        confidence = 0
    elif effective_annotations >= required:
        confidence = min(100, 85 + (effective_annotations - required) / required * 15)
    else:
        confidence = (effective_annotations / required) * 85

    is_sufficient = confidence >= 85

    # Determine confidence level
    if confidence >= 95:
        confidence_level = "excellent"
        status = "excellent"
        color = "#52c41a"
    elif confidence >= 85:
        confidence_level = "very_high"
        status = "very_high"
        color = "#52c41a"
    elif confidence >= 70:
        confidence_level = "high"
        status = "high"
        color = "#1890ff"
    elif confidence >= 55:
        confidence_level = "moderate"
        status = "moderate"
        color = "#faad14"
    else:
        confidence_level = "low"
        status = "low"
        color = "#ff4d4f"

    # Calculate additional annotations needed
    additional_needed = max(0, required - effective_annotations)
    if enable_augmentation and additional_needed > 0:
        additional_needed = additional_needed // 6  # Account for augmentation

    # Generate recommendations based on real data
    recommendations = []
    if not is_sufficient:
        if base_annotations == 0:
            recommendations.append(f"🔴 No annotations found for '{value}'. Start by adding at least {int(required/6 if enable_augmentation else required)} annotations")
        elif additional_needed > 0:
            recommendations.append(f"🔴 Add {int(additional_needed)} more annotations to reach {int(target_accuracy)}% accuracy target")
        if base_annotations < 10:
            recommendations.append("🟡 Current dataset is very small - aim for at least 20-30 base annotations")
        if num_unique_images < 10:
            recommendations.append(f"🟡 Only {num_unique_images} unique images annotated - diversify your dataset with at least 10-15 different images")
        if not enable_augmentation and base_annotations < required:
            recommendations.append("💡 Enable data augmentation to multiply your effective dataset size by 6x")
    else:
        recommendations.append(f"✅ Dataset is sufficient for {int(target_accuracy)}% target accuracy")
        recommendations.append(f"🟢 {base_annotations} annotations across {num_unique_images} images")
        if enable_augmentation:
            recommendations.append(f"🟢 With augmentation: {effective_annotations} effective training samples")

    # Calculate quality metrics based on real data
    avg_annotations_per_image = base_annotations / max(1, num_unique_images)
    diversity_score = min(1.0, num_unique_images / 50)  # 50 images = perfect diversity
    quantity_score = min(1.0, base_annotations / required)

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
                "unique_images": num_unique_images,
                "avg_annotations_per_image": round(avg_annotations_per_image, 2),
                "annotation_diversity_score": round(diversity_score, 2),
                "temporal_distribution": 0.8,  # Would need timestamp data
                "annotator_agreement_score": 0.9,  # Would need multiple annotators
                "augmentation_factor": 6 if enable_augmentation else 1
            },
            "quality_factors": {
                "quantity_score": round(quantity_score, 2),
                "diversity_score": round(diversity_score, 2),
                "consistency_score": 0.85,  # Would need quality analysis
                "coverage_score": round(min(1.0, num_unique_images / 30), 2),
                "balance_score": 0.9  # Would need class distribution analysis
            },
            "requirements": {
                "required_additional_annotations": int(additional_needed),
                "recommendations": recommendations
            },
            "visual_indicator": {
                "percentage": int(confidence),
                "color": color,
                "status": status,
                "icon": "check-circle" if is_sufficient else "warning",
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
            },
            "data_source": "real"  # Indicate this is real data
        },
        "timestamp": datetime.now().isoformat(),
        "request_id": f"req_{os.urandom(4).hex()}"
    }

    return jsonify(response)

@app.route('/api/annotation-metrics/summary')
def get_annotation_summary():
    """Get summary of all annotations in the system"""
    annotations = load_annotations()

    # Aggregate statistics
    total_files = len(annotations)
    total_annotations = sum(len(anns) for anns in annotations.values())

    # Count by category and value
    category_counts = defaultdict(lambda: defaultdict(int))
    for file_annotations in annotations.values():
        for annotation in file_annotations:
            if isinstance(annotation, dict):
                cat = annotation.get('category', 'unknown')
                val = annotation.get('value', 'unknown')
                category_counts[cat][val] += 1

    return jsonify({
        "total_files": total_files,
        "total_annotations": total_annotations,
        "categories": dict(category_counts),
        "timestamp": datetime.now().isoformat()
    })

@app.route('/api/v1/logos/<file_id>/image')
def get_image(file_id):
    """Serve uploaded image"""
    uploads = load_uploads()

    if file_id not in uploads:
        # Try with a simple test pattern for development
        test_image_path = IMAGES_DIR / f"{file_id}.png"
        if test_image_path.exists():
            return send_file(str(test_image_path), mimetype='image/png')

        # Return a placeholder image if file doesn't exist
        placeholder = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
        )
        return send_file(BytesIO(placeholder), mimetype='image/png')

    file_info = uploads[file_id]
    file_path = file_info.get('file_path', IMAGES_DIR / f"{file_id}.png")

    if Path(file_path).exists():
        return send_file(str(file_path), mimetype='image/png')
    else:
        # Return placeholder if file not found
        placeholder = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
        )
        return send_file(BytesIO(placeholder), mimetype='image/png')

@app.route('/api/v1/logos/<file_id>/vendors-node_modules_ant-design_icons_es_icons_<path:rest>')
def handle_vendor_modules(file_id, rest):
    """Handle vendor module requests - return empty for now"""
    return "", 404

@app.route('/src_components_<path:rest>')
def handle_src_components(rest):
    """Handle source component requests - return empty for now"""
    return "", 404

@app.route('/dataset')
def get_dataset():
    """Get dataset summary"""
    annotations = load_annotations()
    total_annotations = sum(len(anns) for anns in annotations.values())
    return jsonify({
        "total_images": len(annotations),
        "total_annotations": total_annotations
    })

@app.route('/jobs')
def get_jobs():
    """Get training jobs"""
    return jsonify([])

@app.route('/annotations')
def get_all_annotations():
    """Get all annotations"""
    annotations = load_annotations()
    return jsonify(annotations)

@app.route('/upload', methods=['POST'])
def upload_direct():
    """Alternative upload endpoint"""
    return upload_file()

@app.route('/health')
def health():
    return jsonify({"status": "healthy", "data_dir": str(DATA_DIR)})

if __name__ == '__main__':
    print(f"Starting real data annotation server on port 8000...")
    print(f"Data directory: {DATA_DIR}")
    print(f"Annotations file: {ANNOTATIONS_FILE}")
    app.run(host='0.0.0.0', port=8000, debug=True)