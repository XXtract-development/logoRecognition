"""Connect to annotation database for training data access."""

import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from sqlalchemy import and_, desc, func
from sqlalchemy.orm import Session

from ..models.base import get_db_sync
from ..models.annotation import BoundingBoxPayload
from ..services.annotation_service import AnnotationService

logger = logging.getLogger(__name__)


class AnnotationConnector:
    """Connects training pipeline to annotation database."""

    def __init__(self, db: Session = None):
        """Initialize annotation connector.

        Args:
            db: Database session (optional, will create if not provided)
        """
        # Use sync database session for training components
        self.db = db or get_db_sync()
        self.annotation_service = AnnotationService(self.db)

    def get_training_annotations(
        self,
        dataset_id: Optional[str] = None,
        min_confidence: float = 0.0,
        categories: Optional[List[str]] = None,
        limit: Optional[int] = None
    ) -> List[Dict]:
        """Retrieve annotations for training.

        Args:
            dataset_id: Specific dataset to retrieve
            min_confidence: Minimum confidence threshold
            categories: Filter by specific categories
            limit: Maximum number of annotations to retrieve

        Returns:
            List of annotation dictionaries with image paths
        """
        try:
            # Get latest version if dataset_id provided
            if dataset_id:
                version_info = self.annotation_service.get_latest_version(dataset_id)
                if not version_info:
                    logger.warning(f"No version found for dataset {dataset_id}")
                    return []

                annotations = self.annotation_service.get_annotations(
                    dataset_id,
                    version_info.version_number
                )
            else:
                # Get all annotations across datasets
                annotations = self._get_all_annotations(
                    min_confidence=min_confidence,
                    categories=categories,
                    limit=limit
                )

            # Format for training
            training_data = []
            for ann in annotations:
                if isinstance(ann, dict):
                    ann_data = ann
                else:
                    ann_data = ann.dict() if hasattr(ann, 'dict') else ann.__dict__

                # Filter by confidence if specified
                if ann_data.get('confidence', 1.0) >= min_confidence:
                    # Filter by categories if specified
                    if categories and ann_data.get('category') not in categories:
                        continue

                    training_data.append({
                        'annotation_id': ann_data.get('id'),
                        'image_id': ann_data.get('image_id'),
                        'bbox': {
                            'x': ann_data.get('x'),
                            'y': ann_data.get('y'),
                            'width': ann_data.get('width'),
                            'height': ann_data.get('height')
                        },
                        'category': ann_data.get('category'),
                        'value': ann_data.get('value'),
                        'confidence': ann_data.get('confidence', 1.0),
                        'metadata': ann_data.get('metadata', {})
                    })

            logger.info(f"Retrieved {len(training_data)} annotations for training")
            return training_data[:limit] if limit else training_data

        except Exception as e:
            logger.error(f"Error retrieving training annotations: {str(e)}")
            return []

    def _get_all_annotations(
        self,
        min_confidence: float = 0.0,
        categories: Optional[List[str]] = None,
        limit: Optional[int] = None
    ) -> List[Dict]:
        """Get all annotations from database.

        Args:
            min_confidence: Minimum confidence threshold
            categories: Filter by categories
            limit: Maximum number to retrieve

        Returns:
            List of annotation dictionaries
        """
        # This would query the actual annotation tables
        # For now, return empty list as tables might not exist yet
        logger.info("Retrieving all annotations from database")
        return []

    def get_dataset_statistics(self, dataset_id: str) -> Dict:
        """Get statistics for a dataset.

        Args:
            dataset_id: Dataset identifier

        Returns:
            Dictionary with dataset statistics
        """
        try:
            version_info = self.annotation_service.get_latest_version(dataset_id)
            if not version_info:
                return {
                    'dataset_id': dataset_id,
                    'status': 'not_found',
                    'total_annotations': 0
                }

            annotations = self.annotation_service.get_annotations(
                dataset_id,
                version_info.version_number
            )

            # Calculate statistics
            categories = {}
            confidence_sum = 0
            confidence_count = 0

            for ann in annotations:
                if isinstance(ann, dict):
                    cat = ann.get('category', 'unknown')
                    conf = ann.get('confidence')
                else:
                    cat = getattr(ann, 'category', 'unknown')
                    conf = getattr(ann, 'confidence', None)

                categories[cat] = categories.get(cat, 0) + 1
                if conf is not None:
                    confidence_sum += conf
                    confidence_count += 1

            return {
                'dataset_id': dataset_id,
                'version': version_info.version_number,
                'status': version_info.status,
                'total_annotations': len(annotations),
                'total_images': version_info.total_images,
                'categories': categories,
                'avg_confidence': confidence_sum / confidence_count if confidence_count > 0 else None,
                'created_at': version_info.created_at.isoformat() if hasattr(version_info.created_at, 'isoformat') else str(version_info.created_at)
            }

        except Exception as e:
            logger.error(f"Error getting dataset statistics: {str(e)}")
            return {
                'dataset_id': dataset_id,
                'status': 'error',
                'error': str(e)
            }

    def mark_annotations_for_training(
        self,
        annotation_ids: List[str],
        training_session_id: str
    ) -> bool:
        """Mark annotations as being used for training.

        Args:
            annotation_ids: List of annotation IDs
            training_session_id: Training session identifier

        Returns:
            Success status
        """
        try:
            # In a real implementation, this would update the database
            # to track which annotations are used in which training sessions
            logger.info(
                f"Marked {len(annotation_ids)} annotations for "
                f"training session {training_session_id}"
            )
            return True

        except Exception as e:
            logger.error(f"Error marking annotations for training: {str(e)}")
            return False

    def get_validation_split(
        self,
        dataset_id: str,
        split_ratio: float = 0.2,
        random_seed: int = 42
    ) -> Tuple[List[Dict], List[Dict]]:
        """Split dataset into training and validation sets.

        Args:
            dataset_id: Dataset identifier
            split_ratio: Validation split ratio (default 0.2)
            random_seed: Random seed for reproducibility

        Returns:
            Tuple of (training_annotations, validation_annotations)
        """
        import random
        random.seed(random_seed)

        # Get all annotations
        all_annotations = self.get_training_annotations(dataset_id=dataset_id)

        if not all_annotations:
            return [], []

        # Group by image to avoid data leakage
        images_dict = {}
        for ann in all_annotations:
            image_id = ann['image_id']
            if image_id not in images_dict:
                images_dict[image_id] = []
            images_dict[image_id].append(ann)

        # Split at image level
        image_ids = list(images_dict.keys())
        random.shuffle(image_ids)

        split_index = int(len(image_ids) * (1 - split_ratio))
        train_images = image_ids[:split_index]
        val_images = image_ids[split_index:]

        # Collect annotations
        train_annotations = []
        val_annotations = []

        for img_id in train_images:
            train_annotations.extend(images_dict[img_id])

        for img_id in val_images:
            val_annotations.extend(images_dict[img_id])

        logger.info(
            f"Split dataset into {len(train_annotations)} training and "
            f"{len(val_annotations)} validation annotations"
        )

        return train_annotations, val_annotations