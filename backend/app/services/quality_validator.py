"""
Image Quality Validation Service
Validates optimized images maintain ML model compatibility
"""
import io
from typing import Dict, Optional, Tuple
from dataclasses import dataclass
import numpy as np
from PIL import Image
import cv2
from skimage.metrics import structural_similarity as ssim
import logging

logger = logging.getLogger(__name__)

@dataclass
class QualityMetrics:
    """Detailed quality metrics for image comparison"""
    ssim_score: float
    mean_ssim: float
    luminance: float
    contrast: float
    structure: float
    psnr: float  # Peak Signal-to-Noise Ratio
    mse: float   # Mean Squared Error
    passed: bool
    threshold: float

class QualityValidator:
    """
    Validates image quality using SSIM and other metrics
    Ensures optimized images maintain ML detection compatibility
    """

    def __init__(self, ssim_threshold: float = 0.95):
        """
        Initialize quality validator

        Args:
            ssim_threshold: Minimum SSIM score for quality validation
        """
        self.ssim_threshold = ssim_threshold
        self.ml_compatibility_threshold = 0.93  # Slightly lower for ML models

    async def validate_quality(
        self,
        original_data: bytes,
        optimized_data: bytes,
        threshold: Optional[float] = None
    ) -> QualityMetrics:
        """
        Validate quality of optimized image against original

        Args:
            original_data: Original image bytes
            optimized_data: Optimized image bytes
            threshold: Optional custom threshold (defaults to self.ssim_threshold)

        Returns:
            QualityMetrics with detailed comparison results
        """
        threshold = threshold or self.ssim_threshold

        try:
            # Convert bytes to numpy arrays
            original_array = np.frombuffer(original_data, np.uint8)
            optimized_array = np.frombuffer(optimized_data, np.uint8)

            # Decode images
            original_img = cv2.imdecode(original_array, cv2.IMREAD_COLOR)
            optimized_img = cv2.imdecode(optimized_array, cv2.IMREAD_COLOR)

            # Ensure same dimensions for comparison
            if original_img.shape != optimized_img.shape:
                # Resize optimized to match original
                optimized_img = cv2.resize(
                    optimized_img,
                    (original_img.shape[1], original_img.shape[0]),
                    interpolation=cv2.INTER_LANCZOS4
                )

            # Calculate comprehensive metrics
            metrics = self._calculate_comprehensive_metrics(original_img, optimized_img)

            # Determine if quality passes threshold
            passed = metrics['ssim'] >= threshold

            return QualityMetrics(
                ssim_score=metrics['ssim'],
                mean_ssim=metrics['mean_ssim'],
                luminance=metrics['luminance'],
                contrast=metrics['contrast'],
                structure=metrics['structure'],
                psnr=metrics['psnr'],
                mse=metrics['mse'],
                passed=passed,
                threshold=threshold
            )

        except Exception as e:
            logger.error(f"Quality validation failed: {e}")
            # Return failed metrics on error
            return QualityMetrics(
                ssim_score=0,
                mean_ssim=0,
                luminance=0,
                contrast=0,
                structure=0,
                psnr=0,
                mse=float('inf'),
                passed=False,
                threshold=threshold
            )

    def _calculate_comprehensive_metrics(
        self,
        original: np.ndarray,
        optimized: np.ndarray
    ) -> Dict[str, float]:
        """
        Calculate comprehensive quality metrics

        Args:
            original: Original image array
            optimized: Optimized image array

        Returns:
            Dictionary of quality metrics
        """
        metrics = {}

        # Convert to grayscale for SSIM calculation
        original_gray = cv2.cvtColor(original, cv2.COLOR_BGR2GRAY)
        optimized_gray = cv2.cvtColor(optimized, cv2.COLOR_BGR2GRAY)

        # Calculate SSIM with full components
        ssim_score, ssim_map = ssim(
            original_gray,
            optimized_gray,
            data_range=255,
            full=True,
            gaussian_weights=True,
            win_size=11
        )

        metrics['ssim'] = float(ssim_score)
        metrics['mean_ssim'] = float(np.mean(ssim_map))

        # Calculate SSIM components (approximation)
        metrics['luminance'] = self._calculate_luminance_similarity(original_gray, optimized_gray)
        metrics['contrast'] = self._calculate_contrast_similarity(original_gray, optimized_gray)
        metrics['structure'] = float(ssim_score) / max(metrics['luminance'] * metrics['contrast'], 0.001)

        # Calculate PSNR (Peak Signal-to-Noise Ratio)
        mse = np.mean((original.astype(float) - optimized.astype(float)) ** 2)
        metrics['mse'] = float(mse)

        if mse == 0:
            metrics['psnr'] = float('inf')
        else:
            max_pixel_value = 255.0
            metrics['psnr'] = 20 * np.log10(max_pixel_value / np.sqrt(mse))

        return metrics

    def _calculate_luminance_similarity(self, img1: np.ndarray, img2: np.ndarray) -> float:
        """Calculate luminance similarity between images"""
        mu1 = np.mean(img1)
        mu2 = np.mean(img2)
        L = 255  # Dynamic range
        k1 = 0.01
        c1 = (k1 * L) ** 2

        luminance = (2 * mu1 * mu2 + c1) / (mu1 ** 2 + mu2 ** 2 + c1)
        return float(luminance)

    def _calculate_contrast_similarity(self, img1: np.ndarray, img2: np.ndarray) -> float:
        """Calculate contrast similarity between images"""
        sigma1 = np.std(img1)
        sigma2 = np.std(img2)
        L = 255  # Dynamic range
        k2 = 0.03
        c2 = (k2 * L) ** 2

        contrast = (2 * sigma1 * sigma2 + c2) / (sigma1 ** 2 + sigma2 ** 2 + c2)
        return float(contrast)

    def validate_ml_compatibility(
        self,
        original_data: bytes,
        optimized_data: bytes
    ) -> Tuple[bool, Dict[str, float]]:
        """
        Validate if optimized image maintains ML model compatibility

        Args:
            original_data: Original image bytes
            optimized_data: Optimized image bytes

        Returns:
            Tuple of (is_compatible, metrics_dict)
        """
        try:
            # Convert to images for ML-specific validation
            original_img = Image.open(io.BytesIO(original_data))
            optimized_img = Image.open(io.BytesIO(optimized_data))

            # Check critical properties for ML models
            checks = {
                'resolution_maintained': self._check_resolution_compatibility(original_img, optimized_img),
                'color_space_compatible': self._check_color_space(optimized_img),
                'edge_preservation': self._check_edge_preservation(original_data, optimized_data),
                'contrast_preservation': self._check_contrast_preservation(original_data, optimized_data)
            }

            # Calculate overall compatibility score
            compatibility_score = sum(checks.values()) / len(checks)

            # Image is ML-compatible if score meets threshold
            is_compatible = compatibility_score >= self.ml_compatibility_threshold

            return is_compatible, {
                'compatibility_score': compatibility_score,
                **checks
            }

        except Exception as e:
            logger.error(f"ML compatibility check failed: {e}")
            return False, {'error': str(e), 'compatibility_score': 0}

    def _check_resolution_compatibility(self, original: Image.Image, optimized: Image.Image) -> float:
        """Check if resolution is suitable for ML models"""
        # ML models typically need minimum resolution
        min_dimension = 224  # Common for many CV models

        opt_width, opt_height = optimized.size

        if opt_width >= min_dimension and opt_height >= min_dimension:
            return 1.0
        else:
            # Calculate how close we are to minimum
            ratio = min(opt_width, opt_height) / min_dimension
            return max(0, ratio)

    def _check_color_space(self, image: Image.Image) -> float:
        """Check if color space is compatible with ML models"""
        # Most ML models expect RGB
        if image.mode in ['RGB', 'L']:  # RGB or grayscale
            return 1.0
        elif image.mode == 'RGBA':
            return 0.9  # Can be converted but not ideal
        else:
            return 0.5  # May cause issues

    def _check_edge_preservation(self, original_data: bytes, optimized_data: bytes) -> float:
        """Check if edges are preserved (important for detection)"""
        try:
            # Convert to numpy arrays
            original_array = np.frombuffer(original_data, np.uint8)
            optimized_array = np.frombuffer(optimized_data, np.uint8)

            # Decode images
            original_img = cv2.imdecode(original_array, cv2.IMREAD_GRAYSCALE)
            optimized_img = cv2.imdecode(optimized_array, cv2.IMREAD_GRAYSCALE)

            # Resize if needed
            if original_img.shape != optimized_img.shape:
                optimized_img = cv2.resize(optimized_img, (original_img.shape[1], original_img.shape[0]))

            # Apply edge detection
            original_edges = cv2.Canny(original_img, 100, 200)
            optimized_edges = cv2.Canny(optimized_img, 100, 200)

            # Calculate edge similarity
            intersection = np.logical_and(original_edges, optimized_edges).sum()
            union = np.logical_or(original_edges, optimized_edges).sum()

            if union == 0:
                return 1.0

            return intersection / union

        except Exception:
            return 0.5  # Default middle score on error

    def _check_contrast_preservation(self, original_data: bytes, optimized_data: bytes) -> float:
        """Check if contrast is preserved (important for feature extraction)"""
        try:
            # Convert to numpy arrays
            original_array = np.frombuffer(original_data, np.uint8)
            optimized_array = np.frombuffer(optimized_data, np.uint8)

            # Decode images
            original_img = cv2.imdecode(original_array, cv2.IMREAD_GRAYSCALE)
            optimized_img = cv2.imdecode(optimized_array, cv2.IMREAD_GRAYSCALE)

            # Calculate contrast (standard deviation of pixel intensities)
            original_contrast = np.std(original_img)
            optimized_contrast = np.std(optimized_img)

            if original_contrast == 0:
                return 1.0

            # Calculate contrast preservation ratio
            ratio = optimized_contrast / original_contrast

            # Ideal is close to 1.0 (same contrast)
            if ratio > 1:
                return 1.0 / ratio  # Penalize increased contrast
            else:
                return ratio  # Penalize decreased contrast

        except Exception:
            return 0.5  # Default middle score on error