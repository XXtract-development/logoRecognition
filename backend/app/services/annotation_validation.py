"""
Annotation Validation Service.
Provides validation for all annotation types and conflict detection.
"""

from typing import Dict, Any, List, Optional, Tuple
import math


class AnnotationValidator:
    """
    Validate annotations and detect conflicts.
    """

    @staticmethod
    def validate_bounding_box(
        annotation: Any,
        image_width: int,
        image_height: int
    ) -> bool:
        """
        Validate bounding box annotation.

        Args:
            annotation: BoundingBox annotation
            image_width: Image width in pixels
            image_height: Image height in pixels

        Returns:
            True if valid, False otherwise
        """
        # Check required fields
        if not all(hasattr(annotation, field) for field in ['x', 'y', 'width', 'height']):
            return False

        # Check dimensions are positive
        if annotation.width <= 0 or annotation.height <= 0:
            return False

        # Check bounds
        if annotation.x < 0 or annotation.y < 0:
            return False

        if annotation.x + annotation.width > image_width:
            return False

        if annotation.y + annotation.height > image_height:
            return False

        # Check category is provided
        if not annotation.category:
            return False

        return True

    @staticmethod
    def validate_polygon(
        annotation: Any,
        image_width: int,
        image_height: int
    ) -> bool:
        """
        Validate polygon annotation.

        Args:
            annotation: Polygon annotation
            image_width: Image width in pixels
            image_height: Image height in pixels

        Returns:
            True if valid, False otherwise
        """
        # Check points exist
        if not hasattr(annotation, 'points') or not annotation.points:
            return False

        # Need at least 3 points for a polygon
        if len(annotation.points) < 3:
            return False

        # Check all points are within bounds
        for point in annotation.points:
            if not isinstance(point, dict):
                return False

            if 'x' not in point or 'y' not in point:
                return False

            if point['x'] < 0 or point['x'] > image_width:
                return False

            if point['y'] < 0 or point['y'] > image_height:
                return False

        # Check category is provided
        if not annotation.category:
            return False

        return True

    @staticmethod
    def validate_point(
        annotation: Any,
        image_width: int,
        image_height: int
    ) -> bool:
        """
        Validate point annotation.

        Args:
            annotation: Point annotation
            image_width: Image width in pixels
            image_height: Image height in pixels

        Returns:
            True if valid, False otherwise
        """
        # Check required fields
        if not all(hasattr(annotation, field) for field in ['x', 'y']):
            return False

        # Check bounds
        if annotation.x < 0 or annotation.x > image_width:
            return False

        if annotation.y < 0 or annotation.y > image_height:
            return False

        # Check category is provided
        if not annotation.category:
            return False

        return True

    @staticmethod
    def calculate_iou(
        bbox1: Dict[str, float],
        bbox2: Dict[str, float]
    ) -> float:
        """
        Calculate Intersection over Union (IoU) for two bounding boxes.

        Args:
            bbox1: First bounding box {x, y, width, height}
            bbox2: Second bounding box {x, y, width, height}

        Returns:
            IoU score between 0 and 1
        """
        # Calculate coordinates
        x1_min, y1_min = bbox1['x'], bbox1['y']
        x1_max = x1_min + bbox1['width']
        y1_max = y1_min + bbox1['height']

        x2_min, y2_min = bbox2['x'], bbox2['y']
        x2_max = x2_min + bbox2['width']
        y2_max = y2_min + bbox2['height']

        # Calculate intersection
        x_inter_min = max(x1_min, x2_min)
        y_inter_min = max(y1_min, y2_min)
        x_inter_max = min(x1_max, x2_max)
        y_inter_max = min(y1_max, y2_max)

        # Check if there's an intersection
        if x_inter_max < x_inter_min or y_inter_max < y_inter_min:
            return 0.0

        # Calculate areas
        inter_area = (x_inter_max - x_inter_min) * (y_inter_max - y_inter_min)
        bbox1_area = bbox1['width'] * bbox1['height']
        bbox2_area = bbox2['width'] * bbox2['height']

        # Calculate union area
        union_area = bbox1_area + bbox2_area - inter_area

        # Calculate IoU
        if union_area == 0:
            return 0.0

        return inter_area / union_area

    @staticmethod
    def detect_conflicts(
        annotations: List[Any],
        new_annotation: Any,
        iou_threshold: float = 0.5
    ) -> List[Dict[str, Any]]:
        """
        Detect conflicts between new annotation and existing ones.

        Args:
            annotations: List of existing annotations
            new_annotation: New annotation to check
            iou_threshold: IoU threshold for conflict detection

        Returns:
            List of conflicts with IoU scores
        """
        conflicts = []

        # Only check bounding box conflicts for now
        if not hasattr(new_annotation, 'width') or not hasattr(new_annotation, 'height'):
            return conflicts

        new_bbox = {
            'x': new_annotation.x,
            'y': new_annotation.y,
            'width': new_annotation.width,
            'height': new_annotation.height
        }

        for ann in annotations:
            # Skip non-bounding box annotations
            if not hasattr(ann, 'width') or not hasattr(ann, 'height'):
                continue

            # Skip same annotation
            if hasattr(ann, 'id') and hasattr(new_annotation, 'id'):
                if ann.id == new_annotation.id:
                    continue

            existing_bbox = {
                'x': ann.x,
                'y': ann.y,
                'width': ann.width,
                'height': ann.height
            }

            iou = AnnotationValidator.calculate_iou(new_bbox, existing_bbox)

            if iou >= iou_threshold:
                conflicts.append({
                    'annotation_id': getattr(ann, 'id', None),
                    'iou': iou,
                    'category': getattr(ann, 'category', None),
                    'value': getattr(ann, 'value', None)
                })

        return conflicts

    @staticmethod
    def validate_annotation_data(
        annotation: Any,
        annotation_type: str
    ) -> Tuple[bool, Optional[str]]:
        """
        Validate annotation data completeness.

        Args:
            annotation: Annotation object
            annotation_type: Type of annotation

        Returns:
            Tuple of (is_valid, error_message)
        """
        # Check ID
        if not hasattr(annotation, 'id') or not annotation.id:
            return False, "Annotation ID is required"

        # Check image ID
        if not hasattr(annotation, 'image_id') or not annotation.image_id:
            return False, "Image ID is required"

        # Check category
        if not hasattr(annotation, 'category') or not annotation.category:
            return False, "Category is required"

        # Type-specific validation
        if annotation_type == 'boundingBox':
            required = ['x', 'y', 'width', 'height']
            for field in required:
                if not hasattr(annotation, field):
                    return False, f"Field {field} is required for bounding box"

        elif annotation_type == 'polygon':
            if not hasattr(annotation, 'points') or not annotation.points:
                return False, "Points are required for polygon"
            if len(annotation.points) < 3:
                return False, "Polygon must have at least 3 points"

        elif annotation_type == 'point':
            required = ['x', 'y']
            for field in required:
                if not hasattr(annotation, field):
                    return False, f"Field {field} is required for point"

        else:
            return False, f"Unknown annotation type: {annotation_type}"

        # Validate confidence if provided
        if hasattr(annotation, 'confidence') and annotation.confidence is not None:
            if annotation.confidence < 0 or annotation.confidence > 1:
                return False, "Confidence must be between 0 and 1"

        return True, None

    @staticmethod
    def calculate_polygon_area(points: List[Dict[str, float]]) -> float:
        """
        Calculate area of a polygon using the shoelace formula.

        Args:
            points: List of polygon points

        Returns:
            Area of the polygon
        """
        n = len(points)
        if n < 3:
            return 0.0

        area = 0.0
        for i in range(n):
            j = (i + 1) % n
            area += points[i]['x'] * points[j]['y']
            area -= points[j]['x'] * points[i]['y']

        return abs(area) / 2.0

    @staticmethod
    def point_in_polygon(
        point: Dict[str, float],
        polygon_points: List[Dict[str, float]]
    ) -> bool:
        """
        Check if a point is inside a polygon using ray casting algorithm.

        Args:
            point: Point to check {x, y}
            polygon_points: List of polygon vertices

        Returns:
            True if point is inside polygon
        """
        n = len(polygon_points)
        inside = False

        p1x = polygon_points[0]['x']
        p1y = polygon_points[0]['y']

        for i in range(1, n + 1):
            p2x = polygon_points[i % n]['x']
            p2y = polygon_points[i % n]['y']

            if point['y'] > min(p1y, p2y):
                if point['y'] <= max(p1y, p2y):
                    if point['x'] <= max(p1x, p2x):
                        if p1y != p2y:
                            xinters = (point['y'] - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                        if p1x == p2x or point['x'] <= xinters:
                            inside = not inside

            p1x, p1y = p2x, p2y

        return inside

    @staticmethod
    def merge_annotations(
        ann1: Any,
        ann2: Any
    ) -> Any:
        """
        Merge two overlapping annotations.

        Args:
            ann1: First annotation
            ann2: Second annotation

        Returns:
            Merged annotation
        """
        # For bounding boxes, create encompassing box
        if hasattr(ann1, 'width') and hasattr(ann2, 'width'):
            x_min = min(ann1.x, ann2.x)
            y_min = min(ann1.y, ann2.y)
            x_max = max(ann1.x + ann1.width, ann2.x + ann2.width)
            y_max = max(ann1.y + ann1.height, ann2.y + ann2.height)

            merged = type(ann1)(
                id=f"merged_{ann1.id}_{ann2.id}",
                image_id=ann1.image_id,
                x=x_min,
                y=y_min,
                width=x_max - x_min,
                height=y_max - y_min,
                category=ann1.category,
                value=f"{ann1.value}_{ann2.value}" if ann1.value and ann2.value else ann1.value or ann2.value,
                confidence=max(getattr(ann1, 'confidence', 0), getattr(ann2, 'confidence', 0))
            )

            return merged

        # For other types, return the one with higher confidence
        conf1 = getattr(ann1, 'confidence', 0)
        conf2 = getattr(ann2, 'confidence', 0)

        return ann1 if conf1 >= conf2 else ann2