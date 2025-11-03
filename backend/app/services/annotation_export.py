"""
Annotation Export Service for multiple formats.
Supports COCO, YOLO, Pascal VOC, and custom formats.
"""

import json
import xml.etree.ElementTree as ET
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
import zipfile
import io
import csv
from pathlib import Path

from ..models.annotation import BoundingBoxPayload


class AnnotationExporter:
    """
    Export annotations to various standard formats.
    Optimized for <1 second export of 1000+ annotations.
    """

    @staticmethod
    def to_coco(
        annotations: List[BoundingBoxPayload],
        image_info: Dict[str, Any],
        categories: List[Dict[str, Any]]
    ) -> str:
        """
        Export annotations to COCO format.

        Args:
            annotations: List of annotations
            image_info: Image metadata (id, width, height, file_name)
            categories: List of category definitions

        Returns:
            COCO format JSON string
        """
        coco_data = {
            "info": {
                "description": "Logo Recognition Annotations",
                "version": "1.0",
                "year": datetime.now().year,
                "date_created": datetime.now().isoformat()
            },
            "licenses": [],
            "images": [image_info],
            "categories": categories,
            "annotations": []
        }

        # Convert annotations to COCO format
        for idx, ann in enumerate(annotations):
            coco_ann = {
                "id": idx + 1,
                "image_id": image_info["id"],
                "category_id": AnnotationExporter._get_category_id(
                    ann.category, categories
                ),
                "bbox": [ann.x, ann.y, ann.width, ann.height],
                "area": ann.width * ann.height,
                "iscrowd": 0,
                "attributes": {
                    "value": ann.value,
                    "confidence": ann.confidence or 1.0,
                    "tags": ann.tags
                }
            }

            # Add polygon if available
            if hasattr(ann, 'polygon_points'):
                coco_ann["segmentation"] = [ann.polygon_points]

            coco_data["annotations"].append(coco_ann)

        return json.dumps(coco_data, indent=2)

    @staticmethod
    def to_yolo(
        annotations: List[BoundingBoxPayload],
        image_width: int,
        image_height: int,
        class_names: List[str]
    ) -> str:
        """
        Export annotations to YOLO format.

        Args:
            annotations: List of annotations
            image_width: Image width in pixels
            image_height: Image height in pixels
            class_names: List of class names

        Returns:
            YOLO format text string
        """
        yolo_lines = []

        for ann in annotations:
            # Get class index
            class_idx = AnnotationExporter._get_class_index(
                ann.category, class_names
            )

            # Convert to YOLO format (normalized coordinates)
            cx = (ann.x + ann.width / 2) / image_width
            cy = (ann.y + ann.height / 2) / image_height
            w = ann.width / image_width
            h = ann.height / image_height

            # Format: class_idx center_x center_y width height
            yolo_lines.append(f"{class_idx} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}")

        return "\n".join(yolo_lines)

    @staticmethod
    def to_pascal_voc(
        annotations: List[BoundingBoxPayload],
        image_info: Dict[str, Any]
    ) -> str:
        """
        Export annotations to Pascal VOC XML format.

        Args:
            annotations: List of annotations
            image_info: Image metadata

        Returns:
            Pascal VOC XML string
        """
        root = ET.Element("annotation")

        # Add folder
        folder = ET.SubElement(root, "folder")
        folder.text = "images"

        # Add filename
        filename = ET.SubElement(root, "filename")
        filename.text = image_info.get("file_name", "image.jpg")

        # Add source
        source = ET.SubElement(root, "source")
        database = ET.SubElement(source, "database")
        database.text = "Logo Recognition Dataset"

        # Add size
        size = ET.SubElement(root, "size")
        width = ET.SubElement(size, "width")
        width.text = str(image_info.get("width", 0))
        height = ET.SubElement(size, "height")
        height.text = str(image_info.get("height", 0))
        depth = ET.SubElement(size, "depth")
        depth.text = "3"

        # Add segmented flag
        segmented = ET.SubElement(root, "segmented")
        segmented.text = "0"

        # Add objects (annotations)
        for ann in annotations:
            obj = ET.SubElement(root, "object")

            name = ET.SubElement(obj, "name")
            name.text = ann.category

            pose = ET.SubElement(obj, "pose")
            pose.text = "Unspecified"

            truncated = ET.SubElement(obj, "truncated")
            truncated.text = "0"

            difficult = ET.SubElement(obj, "difficult")
            difficult.text = "0"

            # Add bounding box
            bndbox = ET.SubElement(obj, "bndbox")
            xmin = ET.SubElement(bndbox, "xmin")
            xmin.text = str(int(ann.x))
            ymin = ET.SubElement(bndbox, "ymin")
            ymin.text = str(int(ann.y))
            xmax = ET.SubElement(bndbox, "xmax")
            xmax.text = str(int(ann.x + ann.width))
            ymax = ET.SubElement(bndbox, "ymax")
            ymax.text = str(int(ann.y + ann.height))

            # Add custom attributes
            attributes = ET.SubElement(obj, "attributes")
            value_elem = ET.SubElement(attributes, "value")
            value_elem.text = ann.value
            if ann.confidence:
                conf_elem = ET.SubElement(attributes, "confidence")
                conf_elem.text = str(ann.confidence)

        # Convert to string
        return ET.tostring(root, encoding='unicode', method='xml')

    @staticmethod
    def to_csv(
        annotations: List[BoundingBoxPayload],
        image_info: Dict[str, Any]
    ) -> str:
        """
        Export annotations to CSV format.

        Args:
            annotations: List of annotations
            image_info: Image metadata

        Returns:
            CSV format string
        """
        output = io.StringIO()
        writer = csv.writer(output)

        # Write header
        writer.writerow([
            'image_id', 'image_filename', 'annotation_id',
            'x', 'y', 'width', 'height',
            'category', 'value', 'confidence',
            'tags', 'created', 'updated'
        ])

        # Write annotations
        for ann in annotations:
            writer.writerow([
                image_info.get('id', ''),
                image_info.get('file_name', ''),
                ann.id,
                ann.x, ann.y, ann.width, ann.height,
                ann.category, ann.value, ann.confidence or 1.0,
                ','.join(ann.tags) if ann.tags else '',
                ann.created.isoformat() if ann.created else '',
                ann.updated.isoformat() if ann.updated else ''
            ])

        return output.getvalue()

    @staticmethod
    def to_custom_json(
        annotations: List[BoundingBoxPayload],
        image_info: Dict[str, Any],
        include_metadata: bool = True
    ) -> str:
        """
        Export to custom JSON format with full metadata.

        Args:
            annotations: List of annotations
            image_info: Image metadata
            include_metadata: Include annotation metadata

        Returns:
            Custom JSON string
        """
        export_data = {
            "version": "1.0",
            "timestamp": datetime.now().isoformat(),
            "image": image_info,
            "annotations": []
        }

        for ann in annotations:
            ann_dict = {
                "id": ann.id,
                "bbox": {
                    "x": ann.x,
                    "y": ann.y,
                    "width": ann.width,
                    "height": ann.height
                },
                "category": ann.category,
                "value": ann.value,
                "confidence": ann.confidence or 1.0,
                "tags": ann.tags
            }

            if include_metadata:
                ann_dict["metadata"] = ann.metadata
                ann_dict["created"] = ann.created.isoformat() if ann.created else None
                ann_dict["updated"] = ann.updated.isoformat() if ann.updated else None

            export_data["annotations"].append(ann_dict)

        return json.dumps(export_data, indent=2)

    @staticmethod
    def create_export_bundle(
        annotations: List[BoundingBoxPayload],
        image_info: Dict[str, Any],
        categories: List[Dict[str, Any]],
        class_names: List[str],
        formats: List[str] = ['coco', 'yolo', 'voc', 'csv']
    ) -> bytes:
        """
        Create a ZIP bundle with annotations in multiple formats.

        Args:
            annotations: List of annotations
            image_info: Image metadata
            categories: Category definitions
            class_names: Class names for YOLO
            formats: List of formats to include

        Returns:
            ZIP file bytes
        """
        zip_buffer = io.BytesIO()

        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Add COCO format
            if 'coco' in formats:
                coco_json = AnnotationExporter.to_coco(
                    annotations, image_info, categories
                )
                zip_file.writestr('annotations_coco.json', coco_json)

            # Add YOLO format
            if 'yolo' in formats:
                yolo_txt = AnnotationExporter.to_yolo(
                    annotations,
                    image_info['width'],
                    image_info['height'],
                    class_names
                )
                zip_file.writestr('annotations_yolo.txt', yolo_txt)

                # Also add class names file for YOLO
                zip_file.writestr('classes.txt', '\n'.join(class_names))

            # Add Pascal VOC format
            if 'voc' in formats:
                voc_xml = AnnotationExporter.to_pascal_voc(
                    annotations, image_info
                )
                zip_file.writestr('annotations_voc.xml', voc_xml)

            # Add CSV format
            if 'csv' in formats:
                csv_data = AnnotationExporter.to_csv(
                    annotations, image_info
                )
                zip_file.writestr('annotations.csv', csv_data)

            # Add custom JSON format
            if 'json' in formats:
                json_data = AnnotationExporter.to_custom_json(
                    annotations, image_info, include_metadata=True
                )
                zip_file.writestr('annotations_custom.json', json_data)

            # Add README
            readme = AnnotationExporter._generate_readme(formats)
            zip_file.writestr('README.txt', readme)

        zip_buffer.seek(0)
        return zip_buffer.getvalue()

    # Helper methods

    @staticmethod
    def _get_category_id(category: str, categories: List[Dict]) -> int:
        """Get category ID from category name."""
        for cat in categories:
            if cat.get('name') == category:
                return cat.get('id', 0)
        return 0

    @staticmethod
    def _get_class_index(category: str, class_names: List[str]) -> int:
        """Get class index for YOLO format."""
        try:
            return class_names.index(category)
        except ValueError:
            return 0

    @staticmethod
    def _generate_readme(formats: List[str]) -> str:
        """Generate README for export bundle."""
        readme = f"""Logo Recognition Annotation Export
Generated: {datetime.now().isoformat()}

This bundle contains annotations in the following formats:
"""

        format_descriptions = {
            'coco': "- annotations_coco.json: COCO format (MS COCO compatible)",
            'yolo': "- annotations_yolo.txt: YOLO format (normalized coordinates)\n  - classes.txt: Class names for YOLO",
            'voc': "- annotations_voc.xml: Pascal VOC XML format",
            'csv': "- annotations.csv: CSV format with all metadata",
            'json': "- annotations_custom.json: Custom JSON with full metadata"
        }

        for fmt in formats:
            if fmt in format_descriptions:
                readme += f"\n{format_descriptions[fmt]}"

        readme += """

Format Details:
- COCO: Standard MS COCO format with bbox and optional segmentation
- YOLO: One annotation per line (class_idx cx cy w h) with normalized coords
- Pascal VOC: XML format with absolute pixel coordinates
- CSV: Tabular format with all annotation properties
- Custom JSON: Comprehensive format with all metadata preserved

For more information, visit: https://docs.logorecognition.ai/annotations
"""

        return readme


class AnnotationImporter:
    """Import annotations from various formats."""

    @staticmethod
    def from_coco(coco_json: str) -> List[BoundingBoxPayload]:
        """Import annotations from COCO format."""
        data = json.loads(coco_json)
        annotations = []

        # Build category map
        category_map = {
            cat['id']: cat['name']
            for cat in data.get('categories', [])
        }

        # Convert COCO annotations
        for ann in data.get('annotations', []):
            bbox = ann['bbox']  # [x, y, width, height]

            annotation = BoundingBoxPayload(
                id=f"imported_{ann['id']}",
                image_id=str(ann['image_id']),
                x=bbox[0],
                y=bbox[1],
                width=bbox[2],
                height=bbox[3],
                category=category_map.get(ann['category_id'], 'unknown'),
                value=ann.get('attributes', {}).get('value', ''),
                confidence=ann.get('attributes', {}).get('confidence', 1.0),
                tags=ann.get('attributes', {}).get('tags', [])
            )

            annotations.append(annotation)

        return annotations

    @staticmethod
    def from_yolo(
        yolo_txt: str,
        class_names: List[str],
        image_width: int,
        image_height: int
    ) -> List[BoundingBoxPayload]:
        """Import annotations from YOLO format."""
        annotations = []
        lines = yolo_txt.strip().split('\n')

        for idx, line in enumerate(lines):
            if not line.strip():
                continue

            parts = line.strip().split()
            if len(parts) < 5:
                continue

            class_idx = int(parts[0])
            cx, cy, w, h = map(float, parts[1:5])

            # Convert from normalized to pixel coordinates
            x = (cx - w/2) * image_width
            y = (cy - h/2) * image_height
            width = w * image_width
            height = h * image_height

            annotation = BoundingBoxPayload(
                id=f"imported_yolo_{idx}",
                image_id="",
                x=x,
                y=y,
                width=width,
                height=height,
                category=class_names[class_idx] if class_idx < len(class_names) else 'unknown',
                value="",
                confidence=1.0
            )

            annotations.append(annotation)

        return annotations