import cv2
import numpy as np
from PIL import Image
import torch
from torchvision import transforms
from typing import Tuple, List, Optional, Union
import albumentations as A
from albumentations.pytorch import ToTensorV2


class ImagePreprocessor:
    def __init__(
        self,
        input_size: Tuple[int, int] = (224, 224),
        normalize: bool = True,
        augment: bool = False
    ):
        self.input_size = input_size
        self.normalize = normalize
        self.augment = augment

        # Standard ImageNet normalization
        self.mean = [0.485, 0.456, 0.406]
        self.std = [0.229, 0.224, 0.225]

        # Basic preprocessing transform
        self.basic_transform = transforms.Compose([
            transforms.Resize(input_size),
            transforms.ToTensor(),
            transforms.Normalize(mean=self.mean, std=self.std) if normalize else transforms.Lambda(lambda x: x)
        ])

        # Augmentation pipeline for training
        self.augmentation_pipeline = A.Compose([
            A.Resize(*input_size),
            A.RandomRotate90(p=0.5),
            A.Flip(p=0.5),
            A.OneOf([
                A.GaussNoise(var_limit=(10.0, 50.0)),
                A.GaussianBlur(blur_limit=(3, 7)),
                A.MotionBlur(blur_limit=7)
            ], p=0.3),
            A.OneOf([
                A.OpticalDistortion(distort_limit=0.5),
                A.GridDistortion(distort_limit=0.5),
                A.ElasticTransform(alpha=1, sigma=50, alpha_affine=50)
            ], p=0.3),
            A.OneOf([
                A.CLAHE(clip_limit=2),
                A.Equalize()
            ], p=0.3),
            A.OneOf([
                A.RandomBrightnessContrast(brightness_limit=0.2, contrast_limit=0.2),
                A.HueSaturationValue(hue_shift_limit=20, sat_shift_limit=30, val_shift_limit=20)
            ], p=0.5),
            A.CoarseDropout(max_holes=8, max_height=16, max_width=16, p=0.3),
            A.Normalize(mean=self.mean, std=self.std) if normalize else A.NoOp(),
            ToTensorV2()
        ])

        # Validation/test transform
        self.val_transform = A.Compose([
            A.Resize(*input_size),
            A.Normalize(mean=self.mean, std=self.std) if normalize else A.NoOp(),
            ToTensorV2()
        ])

    def preprocess(
        self,
        image: Union[np.ndarray, Image.Image, str],
        mode: str = 'inference'
    ) -> torch.Tensor:
        # Load image if path is provided
        if isinstance(image, str):
            image = cv2.imread(image)
            image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        elif isinstance(image, Image.Image):
            image = np.array(image)

        # Ensure image is RGB
        if len(image.shape) == 2:
            image = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
        elif image.shape[2] == 4:
            image = cv2.cvtColor(image, cv2.COLOR_RGBA2RGB)

        # Apply appropriate transform based on mode
        if mode == 'train' and self.augment:
            transformed = self.augmentation_pipeline(image=image)
        elif mode in ['val', 'test', 'inference']:
            transformed = self.val_transform(image=image)
        else:
            # Use basic transform
            image_pil = Image.fromarray(image)
            return self.basic_transform(image_pil)

        return transformed['image']

    def batch_preprocess(
        self,
        images: List[Union[np.ndarray, Image.Image, str]],
        mode: str = 'inference'
    ) -> torch.Tensor:
        processed_images = []
        for image in images:
            processed = self.preprocess(image, mode=mode)
            processed_images.append(processed)

        return torch.stack(processed_images)

    def extract_logo_region(
        self,
        image: np.ndarray,
        bbox: Optional[Tuple[int, int, int, int]] = None,
        padding: float = 0.1
    ) -> np.ndarray:
        if bbox is None:
            # Use edge detection to find potential logo region
            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            edges = cv2.Canny(gray, 50, 150)
            contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            if contours:
                largest_contour = max(contours, key=cv2.contourArea)
                x, y, w, h = cv2.boundingRect(largest_contour)
            else:
                return image
        else:
            x, y, w, h = bbox

        # Add padding
        pad_x = int(w * padding)
        pad_y = int(h * padding)

        x_min = max(0, x - pad_x)
        y_min = max(0, y - pad_y)
        x_max = min(image.shape[1], x + w + pad_x)
        y_max = min(image.shape[0], y + h + pad_y)

        return image[y_min:y_max, x_min:x_max]

    @staticmethod
    def denormalize(tensor: torch.Tensor) -> torch.Tensor:
        mean = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1)
        std = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1)

        if tensor.device != mean.device:
            mean = mean.to(tensor.device)
            std = std.to(tensor.device)

        return tensor * std + mean


class LogoAugmenter:
    def __init__(self, severity: int = 1):
        self.severity = max(1, min(5, severity))

        self.augmentations = self._get_augmentations()

    def _get_augmentations(self) -> A.Compose:
        severity_factor = self.severity / 5.0

        return A.Compose([
            # Geometric transformations
            A.ShiftScaleRotate(
                shift_limit=0.1 * severity_factor,
                scale_limit=0.2 * severity_factor,
                rotate_limit=30 * severity_factor,
                p=0.7
            ),
            A.Perspective(scale=(0.05, 0.1 * severity_factor), p=0.5),

            # Color/Brightness adjustments
            A.ColorJitter(
                brightness=0.2 * severity_factor,
                contrast=0.2 * severity_factor,
                saturation=0.2 * severity_factor,
                hue=0.1 * severity_factor,
                p=0.7
            ),

            # Noise and blur
            A.OneOf([
                A.GaussNoise(var_limit=(10.0, 50.0 * severity_factor)),
                A.ISONoise(intensity=(0.1, 0.5 * severity_factor)),
                A.MultiplicativeNoise(multiplier=(0.9, 1.1))
            ], p=0.5),

            # Compression artifacts
            A.ImageCompression(
                quality_lower=max(50, 100 - int(30 * severity_factor)),
                quality_upper=100,
                p=0.4
            )
        ])

    def augment(self, image: np.ndarray) -> np.ndarray:
        augmented = self.augmentations(image=image)
        return augmented['image']