import torch
from torch.utils.data import Dataset, DataLoader
import pandas as pd
import numpy as np
from PIL import Image
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Callable
import json
import random


class LogoDataset(Dataset):
    def __init__(
        self,
        data_dir: str,
        annotation_file: Optional[str] = None,
        transform: Optional[Callable] = None,
        mode: str = 'train',
        use_bbox: bool = True
    ):
        self.data_dir = Path(data_dir)
        self.transform = transform
        self.mode = mode
        self.use_bbox = use_bbox

        # Load annotations
        if annotation_file:
            self.annotations = self._load_annotations(annotation_file)
        else:
            self.annotations = self._scan_directory()

        # Create label mapping
        self.classes = sorted(list(set([ann['class'] for ann in self.annotations])))
        self.class_to_idx = {cls: idx for idx, cls in enumerate(self.classes)}
        self.idx_to_class = {idx: cls for cls, idx in self.class_to_idx.items()}

    def _load_annotations(self, annotation_file: str) -> List[Dict]:
        file_path = Path(annotation_file)

        if file_path.suffix == '.json':
            with open(file_path, 'r') as f:
                data = json.load(f)
        elif file_path.suffix == '.csv':
            df = pd.read_csv(file_path)
            data = df.to_dict('records')
        else:
            raise ValueError(f"Unsupported annotation format: {file_path.suffix}")

        return data

    def _scan_directory(self) -> List[Dict]:
        annotations = []

        # Assume directory structure: data_dir/class_name/image_files
        for class_dir in self.data_dir.iterdir():
            if class_dir.is_dir():
                class_name = class_dir.name

                for image_file in class_dir.glob('*'):
                    if image_file.suffix.lower() in ['.jpg', '.jpeg', '.png', '.gif', '.bmp']:
                        annotations.append({
                            'image_path': str(image_file.relative_to(self.data_dir)),
                            'class': class_name,
                            'bbox': None
                        })

        return annotations

    def __len__(self) -> int:
        return len(self.annotations)

    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        annotation = self.annotations[idx]

        # Load image
        image_path = self.data_dir / annotation['image_path']
        image = Image.open(image_path).convert('RGB')

        # Get label
        label = self.class_to_idx[annotation['class']]

        # Get bounding box if available
        bbox = annotation.get('bbox', None)
        if bbox and self.use_bbox:
            # Normalize bbox to [0, 1]
            width, height = image.size
            bbox = [
                bbox[0] / width,
                bbox[1] / height,
                bbox[2] / width,
                bbox[3] / height
            ]
            bbox = torch.tensor(bbox, dtype=torch.float32)

        # Apply transform
        if self.transform:
            if hasattr(self.transform, '__call__'):
                # Handle both torchvision and albumentations transforms
                if bbox is not None and hasattr(self.transform, 'transforms'):
                    # For albumentations
                    transformed = self.transform(
                        image=np.array(image),
                        bboxes=[bbox.tolist()] if bbox is not None else [],
                        class_labels=[label]
                    )
                    image = transformed['image']
                    if transformed.get('bboxes'):
                        bbox = torch.tensor(transformed['bboxes'][0], dtype=torch.float32)
                else:
                    # For torchvision or custom transforms
                    image = self.transform(image)

        sample = {
            'image': image,
            'label': torch.tensor(label, dtype=torch.long),
            'class_name': annotation['class'],
            'image_path': str(image_path)
        }

        if bbox is not None and self.use_bbox:
            sample['bbox'] = bbox

        return sample

    def get_class_weights(self) -> torch.Tensor:
        class_counts = torch.zeros(len(self.classes))

        for annotation in self.annotations:
            class_idx = self.class_to_idx[annotation['class']]
            class_counts[class_idx] += 1

        # Calculate inverse frequency weights
        total_samples = len(self.annotations)
        weights = total_samples / (len(self.classes) * class_counts)

        return weights


class LogoPairDataset(Dataset):
    """Dataset for similarity learning with logo pairs"""

    def __init__(
        self,
        data_dir: str,
        transform: Optional[Callable] = None,
        mode: str = 'train',
        pairs_per_epoch: int = 10000
    ):
        self.data_dir = Path(data_dir)
        self.transform = transform
        self.mode = mode
        self.pairs_per_epoch = pairs_per_epoch

        # Organize images by class
        self.class_to_images = {}
        for class_dir in self.data_dir.iterdir():
            if class_dir.is_dir():
                class_name = class_dir.name
                images = list(class_dir.glob('*.jpg')) + list(class_dir.glob('*.png'))
                if images:
                    self.class_to_images[class_name] = images

        self.classes = list(self.class_to_images.keys())

    def __len__(self) -> int:
        return self.pairs_per_epoch

    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        # Randomly decide if this is a positive or negative pair
        is_positive = random.random() > 0.5

        if is_positive:
            # Select same class
            class_name = random.choice(self.classes)
            images = self.class_to_images[class_name]

            if len(images) >= 2:
                img1_path, img2_path = random.sample(images, 2)
            else:
                img1_path = img2_path = images[0]

            label = 1.0
        else:
            # Select different classes
            class1, class2 = random.sample(self.classes, 2)
            img1_path = random.choice(self.class_to_images[class1])
            img2_path = random.choice(self.class_to_images[class2])
            label = 0.0

        # Load images
        img1 = Image.open(img1_path).convert('RGB')
        img2 = Image.open(img2_path).convert('RGB')

        # Apply transforms
        if self.transform:
            img1 = self.transform(img1)
            img2 = self.transform(img2)

        return {
            'image1': img1,
            'image2': img2,
            'label': torch.tensor(label, dtype=torch.float32)
        }


def create_data_loaders(
    data_dir: str,
    annotation_file: Optional[str] = None,
    batch_size: int = 32,
    num_workers: int = 4,
    val_split: float = 0.2,
    transform_train: Optional[Callable] = None,
    transform_val: Optional[Callable] = None
) -> Tuple[DataLoader, DataLoader]:
    """Create training and validation data loaders"""

    # Create full dataset
    full_dataset = LogoDataset(
        data_dir=data_dir,
        annotation_file=annotation_file,
        transform=None,
        mode='train'
    )

    # Split into train and validation
    total_size = len(full_dataset)
    val_size = int(total_size * val_split)
    train_size = total_size - val_size

    train_indices, val_indices = torch.utils.data.random_split(
        range(total_size),
        [train_size, val_size],
        generator=torch.Generator().manual_seed(42)
    )

    # Create train dataset
    train_dataset = LogoDataset(
        data_dir=data_dir,
        annotation_file=annotation_file,
        transform=transform_train,
        mode='train'
    )
    train_dataset.annotations = [full_dataset.annotations[i] for i in train_indices.indices]

    # Create validation dataset
    val_dataset = LogoDataset(
        data_dir=data_dir,
        annotation_file=annotation_file,
        transform=transform_val,
        mode='val'
    )
    val_dataset.annotations = [full_dataset.annotations[i] for i in val_indices.indices]

    # Create data loaders
    train_loader = DataLoader(
        train_dataset,
        batch_size=batch_size,
        shuffle=True,
        num_workers=num_workers,
        pin_memory=True
    )

    val_loader = DataLoader(
        val_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=True
    )

    return train_loader, val_loader