"""Training data loader for model training pipeline."""

import io
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import torch
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms

from ..storage.minio_client import OptimizedMinIOClient as MinIOClient
from .annotation_connector import AnnotationConnector

logger = logging.getLogger(__name__)


class LogoDetectionDataset(Dataset):
    """PyTorch dataset for logo detection training."""

    def __init__(
        self,
        annotations: List[Dict],
        transform: Optional[transforms.Compose] = None,
        minio_client: Optional[MinIOClient] = None,
        image_dir: Optional[str] = None
    ):
        """Initialize dataset.

        Args:
            annotations: List of annotation dictionaries
            transform: Image transformations
            minio_client: MinIO client for image loading
            image_dir: Local image directory (alternative to MinIO)
        """
        self.annotations = annotations
        self.transform = transform or self._default_transform()
        self.minio_client = minio_client
        self.image_dir = Path(image_dir) if image_dir else None

        # Group annotations by image
        self.image_annotations = {}
        for ann in annotations:
            img_id = ann['image_id']
            if img_id not in self.image_annotations:
                self.image_annotations[img_id] = []
            self.image_annotations[img_id].append(ann)

        self.image_ids = list(self.image_annotations.keys())
        logger.info(f"Dataset initialized with {len(self.image_ids)} images")

    def _default_transform(self):
        """Default image transformations."""
        return transforms.Compose([
            transforms.Resize((640, 640)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]
            )
        ])

    def __len__(self) -> int:
        """Get dataset size."""
        return len(self.image_ids)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, Dict]:
        """Get item by index.

        Args:
            idx: Item index

        Returns:
            Tuple of (image_tensor, target_dict)
        """
        image_id = self.image_ids[idx]
        annotations = self.image_annotations[image_id]

        # Load image
        image = self._load_image(image_id)
        if image is None:
            # Return placeholder if image not found
            image = Image.new('RGB', (640, 640), color='white')

        # Prepare target
        boxes = []
        labels = []
        areas = []

        for ann in annotations:
            bbox = ann['bbox']
            x, y, w, h = bbox['x'], bbox['y'], bbox['width'], bbox['height']

            # Convert to format [x_min, y_min, x_max, y_max]
            boxes.append([x, y, x + w, y + h])

            # Map category to label (simplified - should use label encoder)
            labels.append(self._category_to_label(ann['category']))

            # Calculate area
            areas.append(w * h)

        target = {
            'boxes': torch.as_tensor(boxes, dtype=torch.float32),
            'labels': torch.as_tensor(labels, dtype=torch.int64),
            'areas': torch.as_tensor(areas, dtype=torch.float32),
            'image_id': torch.tensor([idx])
        }

        # Apply transformations
        if self.transform:
            image = self.transform(image)

        return image, target

    def _load_image(self, image_id: str) -> Optional[Image.Image]:
        """Load image from storage.

        Args:
            image_id: Image identifier

        Returns:
            PIL Image or None if not found
        """
        try:
            # Try MinIO first
            if self.minio_client:
                # Assume images are stored with pattern: images/{image_id}
                object_name = f"images/{image_id}"
                image_data = self.minio_client.get_object(
                    self.minio_client.bucket_name,
                    object_name
                )
                if image_data:
                    return Image.open(io.BytesIO(image_data)).convert('RGB')

            # Try local directory
            if self.image_dir:
                # Try different extensions
                for ext in ['.jpg', '.jpeg', '.png', '.webp']:
                    image_path = self.image_dir / f"{image_id}{ext}"
                    if image_path.exists():
                        return Image.open(image_path).convert('RGB')

            logger.warning(f"Image not found: {image_id}")
            return None

        except Exception as e:
            logger.error(f"Error loading image {image_id}: {str(e)}")
            return None

    def _category_to_label(self, category: str) -> int:
        """Convert category string to label index.

        Args:
            category: Category string

        Returns:
            Label index
        """
        # Simplified mapping - should use proper label encoder
        category_map = {
            'logo': 0,
            'brand': 1,
            'text': 2,
            'symbol': 3,
            'unknown': 4
        }
        return category_map.get(category.lower(), 4)


class TrainingDataLoader:
    """Manages data loading for training pipeline."""

    def __init__(
        self,
        annotation_connector: Optional[AnnotationConnector] = None,
        minio_client: Optional[MinIOClient] = None,
        batch_size: int = 16,
        num_workers: int = 4
    ):
        """Initialize data loader.

        Args:
            annotation_connector: Annotation database connector
            minio_client: MinIO client for images
            batch_size: Batch size for training
            num_workers: Number of data loading workers
        """
        self.annotation_connector = annotation_connector or AnnotationConnector()
        self.minio_client = minio_client or self._init_minio_client()
        self.batch_size = batch_size
        self.num_workers = num_workers

    def _init_minio_client(self) -> Optional[MinIOClient]:
        """Initialize MinIO client from environment."""
        try:
            if os.getenv('MINIO_ENDPOINT'):
                return MinIOClient(
                    endpoint=os.getenv('MINIO_ENDPOINT'),
                    access_key=os.getenv('MINIO_ACCESS_KEY'),
                    secret_key=os.getenv('MINIO_SECRET_KEY'),
                    secure=os.getenv('MINIO_SECURE', 'false').lower() == 'true'
                )
        except Exception as e:
            logger.warning(f"Could not initialize MinIO client: {str(e)}")
        return None

    def create_data_loaders(
        self,
        dataset_id: Optional[str] = None,
        validation_split: float = 0.2,
        augment: bool = True,
        image_dir: Optional[str] = None
    ) -> Tuple[DataLoader, DataLoader, Dict]:
        """Create training and validation data loaders.

        Args:
            dataset_id: Dataset identifier
            validation_split: Validation split ratio
            augment: Whether to apply data augmentation
            image_dir: Local image directory

        Returns:
            Tuple of (train_loader, val_loader, metadata)
        """
        # Get annotations with validation split
        train_annotations, val_annotations = self.annotation_connector.get_validation_split(
            dataset_id=dataset_id,
            split_ratio=validation_split
        )

        if not train_annotations:
            logger.warning("No training annotations found")
            # Return empty loaders
            empty_dataset = LogoDetectionDataset([], minio_client=self.minio_client)
            empty_loader = DataLoader(
                empty_dataset,
                batch_size=1,
                shuffle=False
            )
            return empty_loader, empty_loader, {'status': 'no_data'}

        # Create transforms
        train_transform = self._get_train_transform(augment)
        val_transform = self._get_val_transform()

        # Create datasets
        train_dataset = LogoDetectionDataset(
            annotations=train_annotations,
            transform=train_transform,
            minio_client=self.minio_client,
            image_dir=image_dir
        )

        val_dataset = LogoDetectionDataset(
            annotations=val_annotations,
            transform=val_transform,
            minio_client=self.minio_client,
            image_dir=image_dir
        )

        # Create data loaders
        train_loader = DataLoader(
            train_dataset,
            batch_size=self.batch_size,
            shuffle=True,
            num_workers=self.num_workers,
            pin_memory=torch.cuda.is_available(),
            collate_fn=self._collate_fn
        )

        val_loader = DataLoader(
            val_dataset,
            batch_size=self.batch_size,
            shuffle=False,
            num_workers=self.num_workers,
            pin_memory=torch.cuda.is_available(),
            collate_fn=self._collate_fn
        )

        metadata = {
            'train_size': len(train_dataset),
            'val_size': len(val_dataset),
            'total_train_annotations': len(train_annotations),
            'total_val_annotations': len(val_annotations),
            'batch_size': self.batch_size,
            'num_workers': self.num_workers,
            'augmentation': augment
        }

        logger.info(
            f"Created data loaders - Train: {metadata['train_size']} images, "
            f"Val: {metadata['val_size']} images"
        )

        return train_loader, val_loader, metadata

    def _get_train_transform(self, augment: bool) -> transforms.Compose:
        """Get training transformations.

        Args:
            augment: Whether to include augmentation

        Returns:
            Composed transformations
        """
        transform_list = [
            transforms.Resize((640, 640)),
        ]

        if augment:
            transform_list.extend([
                transforms.RandomHorizontalFlip(p=0.5),
                transforms.ColorJitter(
                    brightness=0.2,
                    contrast=0.2,
                    saturation=0.2,
                    hue=0.1
                ),
                transforms.RandomRotation(degrees=10),
            ])

        transform_list.extend([
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]
            )
        ])

        return transforms.Compose(transform_list)

    def _get_val_transform(self) -> transforms.Compose:
        """Get validation transformations.

        Returns:
            Composed transformations
        """
        return transforms.Compose([
            transforms.Resize((640, 640)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]
            )
        ])

    def _collate_fn(self, batch: List) -> Tuple[torch.Tensor, List[Dict]]:
        """Custom collate function for batching.

        Args:
            batch: List of samples

        Returns:
            Batched tensors and targets
        """
        images = []
        targets = []

        for image, target in batch:
            images.append(image)
            targets.append(target)

        # Stack images into batch tensor
        images = torch.stack(images)

        return images, targets

    def get_class_weights(self, annotations: List[Dict]) -> torch.Tensor:
        """Calculate class weights for imbalanced datasets.

        Args:
            annotations: List of annotations

        Returns:
            Class weight tensor
        """
        # Count occurrences of each category
        category_counts = {}
        for ann in annotations:
            cat = ann['category']
            category_counts[cat] = category_counts.get(cat, 0) + 1

        # Calculate weights (inverse frequency)
        total = sum(category_counts.values())
        weights = []

        # Ensure consistent ordering
        categories = sorted(category_counts.keys())
        for cat in categories:
            count = category_counts[cat]
            weight = total / (len(categories) * count)
            weights.append(weight)

        weights_tensor = torch.tensor(weights, dtype=torch.float32)
        logger.info(f"Class weights calculated: {dict(zip(categories, weights))}")

        return weights_tensor