"""Data preparation and validation pipeline for model training."""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import json
from datetime import datetime
import asyncio

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
try:
    import albumentations as A
    from albumentations.pytorch import ToTensorV2
except ImportError:
    A = None  # Optional dependency for testing
    ToTensorV2 = None

@dataclass
class DatasetSplit:
    """Dataset split container"""
    X_train: np.ndarray
    y_train: np.ndarray
    X_val: np.ndarray
    y_val: np.ndarray
    X_test: np.ndarray
    y_test: np.ndarray
    metadata: Dict

    def test_split(self):
        """Get test split"""
        return self.X_test, self.y_test

class DataPipeline:
    """Data preparation pipeline"""

    def __init__(self):
        self.scaler = StandardScaler()
        self.augmentation_pipeline = self._create_augmentation_pipeline()

    def _create_augmentation_pipeline(self):
        """Create image augmentation pipeline"""
        return A.Compose([
            A.RandomRotate90(p=0.5),
            A.HorizontalFlip(p=0.5),
            A.VerticalFlip(p=0.3),
            A.RandomBrightnessContrast(p=0.3),
            A.RandomGamma(p=0.3),
            A.GaussNoise(p=0.2),
            A.Blur(blur_limit=3, p=0.2),
            A.CLAHE(p=0.3),
            A.ColorJitter(p=0.3),
            A.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
            ToTensorV2()
        ])

    async def prepare_dataset(
        self,
        data_source: Optional[str] = None,
        test_size: float = 0.2,
        val_size: float = 0.2,
        apply_augmentation: bool = True,
        balance_classes: bool = True
    ) -> DatasetSplit:
        """
        Prepare and validate dataset for training

        Args:
            data_source: Source of data (database, file, API)
            test_size: Proportion for test set
            val_size: Proportion for validation set
            apply_augmentation: Whether to apply data augmentation
            balance_classes: Whether to balance class distribution

        Returns:
            DatasetSplit object with prepared data
        """
        # Load data
        data = await self._load_data(data_source)

        # Validate data
        validation_result = await self._validate_data(data)
        if not validation_result["valid"]:
            raise ValueError(f"Data validation failed: {validation_result['errors']}")

        # Clean data
        data = await self._clean_data(data)

        # Balance classes if needed
        if balance_classes:
            data = await self._balance_classes(data)

        # Split data
        X, y = data["features"], data["labels"]

        # First split: train+val vs test
        X_temp, X_test, y_temp, y_test = train_test_split(
            X, y,
            test_size=test_size,
            stratify=y,
            random_state=42
        )

        # Second split: train vs val
        val_size_adjusted = val_size / (1 - test_size)
        X_train, X_val, y_train, y_val = train_test_split(
            X_temp, y_temp,
            test_size=val_size_adjusted,
            stratify=y_temp,
            random_state=42
        )

        # Apply augmentation to training data only
        if apply_augmentation:
            X_train = await self._augment_data(X_train)

        # Normalize data
        X_train = self.scaler.fit_transform(X_train.reshape(X_train.shape[0], -1)).reshape(X_train.shape)
        X_val = self.scaler.transform(X_val.reshape(X_val.shape[0], -1)).reshape(X_val.shape)
        X_test = self.scaler.transform(X_test.reshape(X_test.shape[0], -1)).reshape(X_test.shape)

        return DatasetSplit(
            X_train=X_train,
            y_train=y_train,
            X_val=X_val,
            y_val=y_val,
            X_test=X_test,
            y_test=y_test,
            metadata={
                "total_samples": len(X),
                "train_samples": len(X_train),
                "val_samples": len(X_val),
                "test_samples": len(X_test),
                "class_distribution": self._get_class_distribution(y),
                "preparation_date": datetime.now().isoformat()
            }
        )

    async def _load_data(self, data_source: Optional[str]) -> Dict:
        """Load data from source"""
        # Implementation depends on data source
        # For now, returning mock data
        from ..annotation_connector import AnnotationConnector

        connector = AnnotationConnector()
        annotations = await connector.get_training_data()

        # Convert annotations to features and labels
        features = []
        labels = []

        for annotation in annotations:
            # Process annotation to feature vector
            feature = await self._process_annotation(annotation)
            features.append(feature)
            labels.append(annotation["label"])

        return {
            "features": np.array(features),
            "labels": np.array(labels)
        }

    async def _validate_data(self, data: Dict) -> Dict:
        """Validate data quality"""
        errors = []

        # Check for null values
        if np.any(np.isnan(data["features"])):
            errors.append("Contains null values")

        # Check for sufficient samples
        if len(data["features"]) < 100:
            errors.append("Insufficient samples")

        # Check for class imbalance
        class_counts = np.bincount(data["labels"])
        if np.min(class_counts) / np.max(class_counts) < 0.1:
            errors.append("Severe class imbalance")

        # Check for data leakage
        if await self._check_data_leakage(data):
            errors.append("Potential data leakage detected")

        return {
            "valid": len(errors) == 0,
            "errors": errors
        }

    async def _clean_data(self, data: Dict) -> Dict:
        """Clean and preprocess data"""
        # Remove duplicates
        unique_indices = self._get_unique_indices(data["features"])
        data["features"] = data["features"][unique_indices]
        data["labels"] = data["labels"][unique_indices]

        # Handle outliers
        data = await self._handle_outliers(data)

        # Fix inconsistencies
        data = await self._fix_inconsistencies(data)

        return data

    async def _balance_classes(self, data: Dict) -> Dict:
        """Balance class distribution"""
        from imblearn.over_sampling import SMOTE
        from imblearn.under_sampling import RandomUnderSampler
        from imblearn.combine import SMOTEENN

        # Use SMOTEENN for combined over and under sampling
        smote_enn = SMOTEENN(random_state=42)

        # Reshape for SMOTE
        X_reshaped = data["features"].reshape(data["features"].shape[0], -1)

        # Apply SMOTEENN
        X_resampled, y_resampled = smote_enn.fit_resample(X_reshaped, data["labels"])

        # Reshape back
        original_shape = data["features"].shape
        X_resampled = X_resampled.reshape(-1, *original_shape[1:])

        return {
            "features": X_resampled,
            "labels": y_resampled
        }

    async def _augment_data(self, X: np.ndarray) -> np.ndarray:
        """Apply data augmentation"""
        augmented = []

        for image in X:
            # Apply augmentation
            if len(image.shape) == 3:  # Image data
                augmented_image = self.augmentation_pipeline(image=image)["image"]
                augmented.append(augmented_image)
            else:
                augmented.append(image)

        return np.array(augmented)

    async def _process_annotation(self, annotation: Dict) -> np.ndarray:
        """Process annotation to feature vector"""
        # Extract features from annotation
        # This would include image features, bounding boxes, etc.
        # For now, returning mock feature vector
        return np.random.randn(224, 224, 3)

    async def _check_data_leakage(self, data: Dict) -> bool:
        """Check for potential data leakage"""
        # Implementation to check for data leakage
        # Check if test samples appear in training data
        return False

    async def _handle_outliers(self, data: Dict) -> Dict:
        """Handle outliers in data"""
        from scipy import stats

        # Use Z-score to detect outliers
        z_scores = np.abs(stats.zscore(data["features"].reshape(data["features"].shape[0], -1)))
        outlier_indices = np.where(z_scores > 3)[0]

        # Remove extreme outliers
        keep_indices = np.ones(len(data["features"]), dtype=bool)
        keep_indices[outlier_indices] = False

        return {
            "features": data["features"][keep_indices],
            "labels": data["labels"][keep_indices]
        }

    async def _fix_inconsistencies(self, data: Dict) -> Dict:
        """Fix data inconsistencies"""
        # Fix label inconsistencies
        # Ensure labels are in correct format
        data["labels"] = data["labels"].astype(int)

        # Fix feature inconsistencies
        # Ensure features are in correct range
        data["features"] = np.clip(data["features"], -10, 10)

        return data

    def _get_unique_indices(self, features: np.ndarray) -> np.ndarray:
        """Get indices of unique samples"""
        # Reshape for comparison
        reshaped = features.reshape(features.shape[0], -1)

        # Find unique rows
        _, unique_indices = np.unique(reshaped, axis=0, return_index=True)

        return unique_indices

    def _get_class_distribution(self, labels: np.ndarray) -> Dict:
        """Get class distribution statistics"""
        unique, counts = np.unique(labels, return_counts=True)
        return {
            str(label): int(count)
            for label, count in zip(unique, counts)
        }