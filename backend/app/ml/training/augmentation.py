"""Data augmentation pipeline for training."""

import logging
import random
from typing import List, Optional, Tuple

import cv2
import numpy as np
from PIL import Image
import torch
from torchvision import transforms

logger = logging.getLogger(__name__)


class DataAugmentationPipeline:
    """50x data augmentation pipeline for few-shot learning."""

    def __init__(
        self,
        factor: int = 50,
        seed: Optional[int] = None,
        deterministic: bool = False,
    ):
        """Initialize augmentation pipeline."""
        self.factor = factor
        self.deterministic = deterministic

        if seed is not None or deterministic:
            random.seed(seed or 42)
            np.random.seed(seed or 42)
            torch.manual_seed(seed or 42)

        # Define augmentation parameters
        self.rotation_range = (-30, 30, 5)  # min, max, step
        self.scale_range = (0.8, 1.2, 0.1)  # min, max, step
        self.translation_range = (-0.1, 0.1)  # percentage of image size
        self.brightness_range = (0.7, 1.3)
        self.contrast_range = (0.7, 1.3)
        self.saturation_range = (0.7, 1.3)
        self.blur_kernel_sizes = [3, 5, 7]
        self.noise_levels = [0.01, 0.02, 0.03]

        # Create augmentation combinations
        self._create_augmentation_configs()

    def _create_augmentation_configs(self) -> None:
        """Create deterministic augmentation configurations."""
        self.augmentation_configs = []

        # Rotation variations
        for angle in range(self.rotation_range[0], self.rotation_range[1] + 1, self.rotation_range[2]):
            self.augmentation_configs.append({
                "rotation": angle,
                "scale": 1.0,
                "translation": (0, 0),
                "brightness": 1.0,
                "contrast": 1.0,
                "saturation": 1.0,
                "blur": 0,
                "noise": 0,
            })

        # Scale variations
        scale_values = np.arange(self.scale_range[0], self.scale_range[1] + 0.01, self.scale_range[2])
        for scale in scale_values:
            self.augmentation_configs.append({
                "rotation": 0,
                "scale": scale,
                "translation": (0, 0),
                "brightness": 1.0,
                "contrast": 1.0,
                "saturation": 1.0,
                "blur": 0,
                "noise": 0,
            })

        # Translation variations
        for tx in [-0.1, -0.05, 0.05, 0.1]:
            for ty in [-0.1, -0.05, 0.05, 0.1]:
                self.augmentation_configs.append({
                    "rotation": 0,
                    "scale": 1.0,
                    "translation": (tx, ty),
                    "brightness": 1.0,
                    "contrast": 1.0,
                    "saturation": 1.0,
                    "blur": 0,
                    "noise": 0,
                })

        # Color variations
        for brightness in [0.7, 0.85, 1.15, 1.3]:
            self.augmentation_configs.append({
                "rotation": 0,
                "scale": 1.0,
                "translation": (0, 0),
                "brightness": brightness,
                "contrast": 1.0,
                "saturation": 1.0,
                "blur": 0,
                "noise": 0,
            })

        # Combined augmentations to reach 50x
        while len(self.augmentation_configs) < self.factor:
            config = {
                "rotation": random.choice(range(self.rotation_range[0], self.rotation_range[1] + 1, self.rotation_range[2])),
                "scale": random.choice(scale_values),
                "translation": (
                    random.uniform(self.translation_range[0], self.translation_range[1]),
                    random.uniform(self.translation_range[0], self.translation_range[1]),
                ),
                "brightness": random.uniform(self.brightness_range[0], self.brightness_range[1]),
                "contrast": random.uniform(self.contrast_range[0], self.contrast_range[1]),
                "saturation": random.uniform(self.saturation_range[0], self.saturation_range[1]),
                "blur": random.choice([0] + self.blur_kernel_sizes),
                "noise": random.choice([0] + self.noise_levels),
            }
            self.augmentation_configs.append(config)

        # Trim to exact factor
        self.augmentation_configs = self.augmentation_configs[:self.factor]

    def augment(self, image_path: str) -> List[np.ndarray]:
        """Apply augmentation to create multiple versions of an image."""
        try:
            # Load image
            image = cv2.imread(image_path)
            if image is None:
                image = np.array(Image.open(image_path))
                image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)

            augmented_images = []

            # Apply each augmentation configuration
            for config in self.augmentation_configs:
                aug_image = self._apply_augmentation(image, config)
                augmented_images.append(aug_image)

            return augmented_images

        except Exception as e:
            logger.error(f"Error augmenting image {image_path}: {str(e)}")
            return [image] * self.factor  # Return original image repeated

    def _apply_augmentation(
        self,
        image: np.ndarray,
        config: dict,
    ) -> np.ndarray:
        """Apply single augmentation configuration to image."""
        aug_image = image.copy()
        height, width = aug_image.shape[:2]

        # Geometric transformations
        if config["rotation"] != 0 or config["scale"] != 1.0 or config["translation"] != (0, 0):
            aug_image = self._apply_geometric_transform(
                aug_image,
                config["rotation"],
                config["scale"],
                config["translation"],
            )

        # Color transformations
        if config["brightness"] != 1.0 or config["contrast"] != 1.0 or config["saturation"] != 1.0:
            aug_image = self._apply_color_transform(
                aug_image,
                config["brightness"],
                config["contrast"],
                config["saturation"],
            )

        # Blur
        if config["blur"] > 0:
            aug_image = cv2.GaussianBlur(aug_image, (config["blur"], config["blur"]), 0)

        # Noise
        if config["noise"] > 0:
            aug_image = self._add_gaussian_noise(aug_image, config["noise"])

        return aug_image

    def _apply_geometric_transform(
        self,
        image: np.ndarray,
        rotation: float,
        scale: float,
        translation: Tuple[float, float],
    ) -> np.ndarray:
        """Apply rotation, scaling, and translation."""
        height, width = image.shape[:2]
        center = (width // 2, height // 2)

        # Translation in pixels
        tx = int(translation[0] * width)
        ty = int(translation[1] * height)

        # Create transformation matrix
        M = cv2.getRotationMatrix2D(center, rotation, scale)
        M[0, 2] += tx
        M[1, 2] += ty

        # Apply transformation
        transformed = cv2.warpAffine(
            image,
            M,
            (width, height),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_REFLECT_101,
        )

        return transformed

    def _apply_color_transform(
        self,
        image: np.ndarray,
        brightness: float,
        contrast: float,
        saturation: float,
    ) -> np.ndarray:
        """Apply color adjustments."""
        # Convert to float
        img_float = image.astype(np.float32) / 255.0

        # Brightness adjustment
        img_float = img_float * brightness

        # Contrast adjustment
        mean = np.mean(img_float)
        img_float = (img_float - mean) * contrast + mean

        # Saturation adjustment (in HSV space)
        img_hsv = cv2.cvtColor((img_float * 255).astype(np.uint8), cv2.COLOR_BGR2HSV).astype(np.float32)
        img_hsv[:, :, 1] = img_hsv[:, :, 1] * saturation
        img_hsv[:, :, 1][img_hsv[:, :, 1] > 255] = 255
        img_float = cv2.cvtColor(img_hsv.astype(np.uint8), cv2.COLOR_HSV2BGR).astype(np.float32) / 255.0

        # Clip values
        img_float = np.clip(img_float, 0, 1)

        return (img_float * 255).astype(np.uint8)

    def _add_gaussian_noise(
        self,
        image: np.ndarray,
        noise_level: float,
    ) -> np.ndarray:
        """Add Gaussian noise to image."""
        noise = np.random.normal(0, noise_level * 255, image.shape)
        noisy_image = image.astype(np.float32) + noise
        return np.clip(noisy_image, 0, 255).astype(np.uint8)

    def _apply_perspective_transform(
        self,
        image: np.ndarray,
        intensity: float = 0.1,
    ) -> np.ndarray:
        """Apply perspective transformation."""
        height, width = image.shape[:2]

        # Define source points (corners of the image)
        src_points = np.float32([
            [0, 0],
            [width - 1, 0],
            [width - 1, height - 1],
            [0, height - 1],
        ])

        # Create random destination points with perspective distortion
        dst_points = src_points.copy()
        for i in range(4):
            dst_points[i][0] += random.uniform(-intensity * width, intensity * width)
            dst_points[i][1] += random.uniform(-intensity * height, intensity * height)

        # Calculate perspective transform matrix
        M = cv2.getPerspectiveTransform(src_points, dst_points)

        # Apply perspective transformation
        transformed = cv2.warpPerspective(
            image,
            M,
            (width, height),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_REFLECT_101,
        )

        return transformed

    def get_pytorch_transforms(self) -> transforms.Compose:
        """Get PyTorch transforms for additional augmentation."""
        return transforms.Compose([
            transforms.ToPILImage(),
            transforms.RandomResizedCrop(224, scale=(0.8, 1.2)),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.ColorJitter(
                brightness=0.3,
                contrast=0.3,
                saturation=0.3,
                hue=0.1,
            ),
            transforms.RandomAffine(
                degrees=30,
                translate=(0.1, 0.1),
                scale=(0.8, 1.2),
                shear=10,
            ),
            transforms.RandomPerspective(distortion_scale=0.2, p=0.5),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225],
            ),
        ])


class AugmentationConfig:
    """Configuration for augmentation parameters."""

    def __init__(self):
        """Initialize default augmentation configuration."""
        self.rotation = {
            "enabled": True,
            "range": (-30, 30),
            "step": 5,
        }
        self.scale = {
            "enabled": True,
            "range": (0.8, 1.2),
            "step": 0.1,
        }
        self.translation = {
            "enabled": True,
            "range": (-0.1, 0.1),
        }
        self.color = {
            "brightness": (0.7, 1.3),
            "contrast": (0.7, 1.3),
            "saturation": (0.7, 1.3),
            "hue": (-0.1, 0.1),
        }
        self.blur = {
            "enabled": True,
            "kernel_sizes": [3, 5, 7],
        }
        self.noise = {
            "enabled": True,
            "levels": [0.01, 0.02, 0.03],
        }
        self.perspective = {
            "enabled": True,
            "intensity": 0.2,
        }

    def to_dict(self) -> dict:
        """Convert configuration to dictionary."""
        return {
            "rotation": self.rotation,
            "scale": self.scale,
            "translation": self.translation,
            "color": self.color,
            "blur": self.blur,
            "noise": self.noise,
            "perspective": self.perspective,
        }