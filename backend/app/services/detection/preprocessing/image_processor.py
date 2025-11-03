"""
Image preprocessing utilities for logo detection.
"""

import cv2
import numpy as np
from typing import Tuple, Optional
import logging

logger = logging.getLogger(__name__)


class ImageProcessor:
    """
    Handles image preprocessing for logo detection models.

    This class provides various preprocessing techniques to improve
    detection accuracy and handle different image conditions.
    """

    @staticmethod
    def load_image(image_path: str) -> np.ndarray:
        """
        Load image from file path.

        Args:
            image_path: Path to the image file.

        Returns:
            Image as numpy array in BGR format.

        Raises:
            FileNotFoundError: If image file doesn't exist.
            ValueError: If image cannot be loaded.
        """
        try:
            image = cv2.imread(image_path)
            if image is None:
                raise ValueError(f"Failed to load image from {image_path}")
            return image
        except Exception as e:
            logger.error(f"Error loading image: {e}")
            raise

    @staticmethod
    def resize_with_aspect_ratio(image: np.ndarray,
                                 target_size: Tuple[int, int],
                                 interpolation: int = cv2.INTER_LINEAR) -> np.ndarray:
        """
        Resize image while maintaining aspect ratio.

        Args:
            image: Input image.
            target_size: Target (width, height).
            interpolation: OpenCV interpolation method.

        Returns:
            Resized image with padding if needed.
        """
        h, w = image.shape[:2]
        target_w, target_h = target_size

        # Calculate scaling factor
        scale = min(target_w / w, target_h / h)

        # Calculate new dimensions
        new_w = int(w * scale)
        new_h = int(h * scale)

        # Resize image
        resized = cv2.resize(image, (new_w, new_h), interpolation=interpolation)

        # Create padded image
        padded = np.zeros((target_h, target_w, 3), dtype=np.uint8)

        # Calculate padding offsets
        y_offset = (target_h - new_h) // 2
        x_offset = (target_w - new_w) // 2

        # Place resized image in center
        padded[y_offset:y_offset + new_h, x_offset:x_offset + new_w] = resized

        return padded

    @staticmethod
    def enhance_contrast(image: np.ndarray, clip_limit: float = 2.0) -> np.ndarray:
        """
        Enhance image contrast using CLAHE (Contrast Limited Adaptive Histogram Equalization).

        Args:
            image: Input image.
            clip_limit: Threshold for contrast limiting.

        Returns:
            Contrast-enhanced image.
        """
        # Convert to LAB color space
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)

        # Split channels
        l, a, b = cv2.split(lab)

        # Apply CLAHE to L channel
        clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
        l_enhanced = clahe.apply(l)

        # Merge channels
        enhanced_lab = cv2.merge([l_enhanced, a, b])

        # Convert back to BGR
        enhanced = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)

        return enhanced

    @staticmethod
    def denoise(image: np.ndarray, strength: int = 10) -> np.ndarray:
        """
        Apply denoising to reduce image noise.

        Args:
            image: Input image.
            strength: Denoising strength (higher = more smoothing).

        Returns:
            Denoised image.
        """
        return cv2.fastNlMeansDenoisingColored(image, None, strength, strength, 7, 21)

    @staticmethod
    def auto_rotate(image: np.ndarray) -> Tuple[np.ndarray, float]:
        """
        Automatically detect and correct image rotation.

        Args:
            image: Input image.

        Returns:
            Tuple of (rotated image, rotation angle in degrees).
        """
        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # Detect edges
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)

        # Detect lines using Hough transform
        lines = cv2.HoughLines(edges, 1, np.pi / 180, 200)

        if lines is not None:
            # Calculate dominant angle
            angles = []
            for rho, theta in lines[:, 0]:
                angle = np.degrees(theta) - 90
                angles.append(angle)

            # Get median angle
            median_angle = np.median(angles)

            # Only rotate if angle is significant
            if abs(median_angle) > 1.0:
                rotated = ImageProcessor.rotate_image(image, median_angle)
                return rotated, median_angle

        return image, 0.0

    @staticmethod
    def rotate_image(image: np.ndarray, angle: float) -> np.ndarray:
        """
        Rotate image by specified angle.

        Args:
            image: Input image.
            angle: Rotation angle in degrees.

        Returns:
            Rotated image.
        """
        h, w = image.shape[:2]
        center = (w // 2, h // 2)

        # Get rotation matrix
        M = cv2.getRotationMatrix2D(center, angle, 1.0)

        # Calculate new image bounds
        cos = np.abs(M[0, 0])
        sin = np.abs(M[0, 1])
        new_w = int((h * sin) + (w * cos))
        new_h = int((h * cos) + (w * sin))

        # Adjust rotation matrix
        M[0, 2] += (new_w / 2) - center[0]
        M[1, 2] += (new_h / 2) - center[1]

        # Rotate image
        rotated = cv2.warpAffine(image, M, (new_w, new_h),
                                 borderMode=cv2.BORDER_CONSTANT,
                                 borderValue=(0, 0, 0))

        return rotated

    @staticmethod
    def normalize(image: np.ndarray) -> np.ndarray:
        """
        Normalize image pixel values to [0, 1] range.

        Args:
            image: Input image.

        Returns:
            Normalized image as float32.
        """
        return image.astype(np.float32) / 255.0

    @staticmethod
    def standardize(image: np.ndarray, mean: Optional[Tuple[float, float, float]] = None,
                    std: Optional[Tuple[float, float, float]] = None) -> np.ndarray:
        """
        Standardize image using mean and standard deviation.

        Args:
            image: Input image (should be normalized to [0, 1]).
            mean: Mean values for each channel (default: ImageNet).
            std: Standard deviation for each channel (default: ImageNet).

        Returns:
            Standardized image.
        """
        if mean is None:
            mean = (0.485, 0.456, 0.406)  # ImageNet mean
        if std is None:
            std = (0.229, 0.224, 0.225)  # ImageNet std

        # Ensure image is float
        if image.dtype != np.float32:
            image = image.astype(np.float32)

        # Apply standardization
        image = (image - mean) / std

        return image

    @staticmethod
    def preprocess_for_detection(image: np.ndarray,
                                 target_size: Tuple[int, int] = (640, 640),
                                 enhance: bool = True,
                                 denoise_strength: int = 0) -> np.ndarray:
        """
        Complete preprocessing pipeline for logo detection.

        Args:
            image: Input image.
            target_size: Target size for model input.
            enhance: Whether to apply contrast enhancement.
            denoise_strength: Denoising strength (0 = no denoising).

        Returns:
            Preprocessed image ready for detection.
        """
        # Apply denoising if requested
        if denoise_strength > 0:
            image = ImageProcessor.denoise(image, denoise_strength)

        # Enhance contrast if requested
        if enhance:
            image = ImageProcessor.enhance_contrast(image)

        # Resize with aspect ratio preservation
        image = ImageProcessor.resize_with_aspect_ratio(image, target_size)

        logger.debug(f"Preprocessed image to size {image.shape}")
        return image