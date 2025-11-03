"""
Enterprise Base64 Image Processing Service with Security and Performance Optimizations
Implements US-032: Enterprise Base64 Image Processing
"""

import asyncio
import base64
import gzip
import hashlib
import io
import logging
import re
import struct
import zlib
from typing import Dict, Optional, Tuple, Union, AsyncIterator
from dataclasses import dataclass
from enum import Enum

import aiofiles
import brotli
import magic
from PIL import Image, ImageFile
from pydantic import BaseModel

from app.core.config import settings
from app.core.exceptions import (
    ImageProcessingError,
    InvalidBase64Error,
    UnsupportedFormatError,
    ImageTooLargeError,
    SecurityValidationError,
)

# Enable loading of truncated images for resilience
ImageFile.LOAD_TRUNCATED_IMAGES = True

logger = logging.getLogger(__name__)


class ImageFormat(str, Enum):
    """Supported image formats"""
    JPEG = "JPEG"
    PNG = "PNG"
    WEBP = "WEBP"
    GIF = "GIF"  # Added for broader support


class CompressionType(str, Enum):
    """Supported compression types"""
    NONE = "none"
    GZIP = "gzip"
    BROTLI = "brotli"
    DEFLATE = "deflate"


@dataclass
class ImageMetadata:
    """Image metadata container"""
    format: ImageFormat
    width: int
    height: int
    size_bytes: int
    mime_type: str
    has_exif: bool
    compression_ratio: Optional[float] = None
    checksum: Optional[str] = None


class ProcessingOptions(BaseModel):
    """Configuration options for image processing"""
    preserve_exif: bool = False
    enable_security_scan: bool = True
    max_size_mb: int = 20
    max_dimensions: Tuple[int, int] = (10000, 10000)
    chunk_size: int = 65536  # 64KB chunks for streaming
    enable_caching: bool = True
    compression_quality: int = 85


class SecureImageProcessor:
    """
    Enterprise-grade base64 image processor with security and performance optimizations
    """

    # Class constants
    ALLOWED_FORMATS = {ImageFormat.JPEG, ImageFormat.PNG, ImageFormat.WEBP, ImageFormat.GIF}
    MAX_SIZE_BYTES = 20 * 1024 * 1024  # 20MB default
    MAX_DIMENSIONS = (10000, 10000)
    CHUNK_SIZE = 65536  # 64KB for optimal streaming

    # Magic numbers for format detection
    FORMAT_SIGNATURES = {
        b'\xFF\xD8\xFF': ImageFormat.JPEG,
        b'\x89PNG\r\n\x1a\n': ImageFormat.PNG,
        b'RIFF': ImageFormat.WEBP,  # Needs additional check for WEBP
        b'GIF87a': ImageFormat.GIF,
        b'GIF89a': ImageFormat.GIF,
    }

    # Known malicious patterns (simplified for example)
    MALICIOUS_PATTERNS = [
        b'<%',  # PHP tags
        b'<?php',
        b'<script',
        # Removed malformed PNG pattern as it causes false positives
        b'eval(',
        b'exec(',
    ]

    def __init__(self, options: Optional[ProcessingOptions] = None):
        """
        Initialize the secure image processor

        Args:
            options: Processing configuration options
        """
        self.options = options or ProcessingOptions()
        self._mime_detector = magic.Magic(mime=True)
        self._memory_pool = {}  # Simple memory pool for reuse

    async def decode_and_validate(
        self,
        base64_input: str,
        compression: CompressionType = CompressionType.NONE
    ) -> Tuple[Image.Image, ImageMetadata]:
        """
        Decode and validate base64 image with streaming support

        Args:
            base64_input: Base64 encoded image string or data URL
            compression: Type of compression applied to base64 data

        Returns:
            Tuple of PIL Image object and metadata

        Raises:
            InvalidBase64Error: If base64 decoding fails
            SecurityValidationError: If security checks fail
            ImageTooLargeError: If image exceeds size limits
            UnsupportedFormatError: If image format is not supported
        """
        try:
            # Extract base64 data from data URL if present
            base64_data = await self._extract_base64_data(base64_input)

            # Decompress if needed
            if compression != CompressionType.NONE:
                base64_data = await self._decompress_data(base64_data, compression)

            # Stream decode base64 to bytes
            image_bytes = await self._streaming_decode(base64_data)

            # Security validation
            if self.options.enable_security_scan:
                await self._scan_for_malware(image_bytes)

            # Validate image size
            if len(image_bytes) > self.MAX_SIZE_BYTES:
                raise ImageTooLargeError(
                    f"Image size {len(image_bytes)} bytes exceeds maximum "
                    f"{self.MAX_SIZE_BYTES} bytes"
                )

            # Detect and validate format
            image_format = await self._detect_format(image_bytes)
            if image_format not in self.ALLOWED_FORMATS:
                raise UnsupportedFormatError(
                    f"Format {image_format} not in allowed formats: {self.ALLOWED_FORMATS}"
                )

            # Open and validate image
            image = Image.open(io.BytesIO(image_bytes))

            # Validate dimensions
            if (image.width > self.MAX_DIMENSIONS[0] or
                image.height > self.MAX_DIMENSIONS[1]):
                raise ImageTooLargeError(
                    f"Image dimensions {image.width}x{image.height} exceed "
                    f"maximum {self.MAX_DIMENSIONS[0]}x{self.MAX_DIMENSIONS[1]}"
                )

            # Check for decompression bombs
            await self._check_decompression_bomb(image)

            # Generate metadata
            metadata = await self._generate_metadata(image, image_bytes, image_format)

            logger.info(f"Successfully processed image: {metadata.format}, "
                       f"{metadata.width}x{metadata.height}, "
                       f"{metadata.size_bytes} bytes")

            return image, metadata

        except (InvalidBase64Error, SecurityValidationError,
                ImageTooLargeError, UnsupportedFormatError):
            raise
        except Exception as e:
            logger.error(f"Error processing image: {str(e)}")
            raise ImageProcessingError(f"Failed to process image: {str(e)}")

    async def _extract_base64_data(self, input_string: str) -> str:
        """
        Extract base64 data from input string (supports data URLs)

        Args:
            input_string: Raw input string

        Returns:
            Clean base64 string
        """
        # Check for data URL format with optional charset and other parameters
        # Pattern handles: data:image/png;base64, data:image/png;charset=utf-8;base64, etc.
        data_url_pattern = r'data:image/[^;]+(?:;[^;]+)*;base64,(.+)'
        match = re.match(data_url_pattern, input_string)

        if match:
            return match.group(1)

        # Clean up whitespace and newlines
        return input_string.strip().replace('\n', '').replace(' ', '')

    async def _streaming_decode(self, base64_data: str) -> bytes:
        """
        Stream decode base64 data in chunks for memory efficiency

        Args:
            base64_data: Base64 encoded string

        Returns:
            Decoded bytes

        Raises:
            InvalidBase64Error: If decoding fails
        """
        try:
            output = io.BytesIO()

            # Process in chunks to avoid memory spikes
            for i in range(0, len(base64_data), self.CHUNK_SIZE * 4):  # Base64 is 4/3 size
                chunk = base64_data[i:i + self.CHUNK_SIZE * 4]

                # Pad chunk if necessary
                padding_needed = 4 - (len(chunk) % 4)
                if padding_needed and padding_needed != 4:
                    chunk += '=' * padding_needed

                decoded_chunk = base64.b64decode(chunk, validate=True)
                output.write(decoded_chunk)

                # Yield control to prevent blocking
                await asyncio.sleep(0)

            return output.getvalue()

        except Exception as e:
            raise InvalidBase64Error(f"Failed to decode base64 data: {str(e)}")

    async def _decompress_data(
        self,
        compressed_data: str,
        compression: CompressionType
    ) -> str:
        """
        Decompress data based on compression type

        Args:
            compressed_data: Compressed base64 string (base64 encoded compressed data)
            compression: Type of compression

        Returns:
            Decompressed base64 string (the original base64 image data)
        """
        # First decode the outer base64 layer to get compressed bytes
        compressed_bytes = base64.b64decode(compressed_data)

        if compression == CompressionType.GZIP:
            # Decompress to get the original base64 string as bytes
            decompressed = gzip.decompress(compressed_bytes)
        elif compression == CompressionType.BROTLI:
            decompressed = brotli.decompress(compressed_bytes)
        elif compression == CompressionType.DEFLATE:
            decompressed = zlib.decompress(compressed_bytes)
        else:
            return compressed_data

        # The decompressed data is the original base64 string as bytes, convert to string
        return decompressed.decode('utf-8')

    async def _scan_for_malware(self, image_data: bytes) -> None:
        """
        Scan image data for malicious patterns

        Args:
            image_data: Raw image bytes

        Raises:
            SecurityValidationError: If malicious content detected
        """
        # Check for executable headers at the beginning of the file
        if image_data.startswith(b'MZ'):  # PE executable
            raise SecurityValidationError("Executable file detected")

        if image_data.startswith(b'\x7fELF'):  # ELF executable
            raise SecurityValidationError("Executable file detected")

        # For other patterns, skip checking within valid image data regions
        # Only check after the first 1000 bytes to avoid false positives in image headers
        check_region = image_data[1000:] if len(image_data) > 1000 else image_data

        # Check for known malicious patterns in non-header regions
        for pattern in self.MALICIOUS_PATTERNS:
            if pattern in check_region:
                # Additional validation to reduce false positives
                # Check if pattern appears in a suspicious context
                pattern_index = check_region.find(pattern)
                context_start = max(0, pattern_index - 20)
                context_end = min(len(check_region), pattern_index + len(pattern) + 20)
                context = check_region[context_start:context_end]

                # Only flag if it looks like actual code, not random binary data
                if self._looks_like_code(context):
                    logger.warning(f"Malicious pattern detected: {pattern[:20]}")
                    raise SecurityValidationError(
                        "Image failed security validation: suspicious content detected"
                    )

        # Check for embedded scripts in metadata (case-insensitive)
        lower_data = image_data.lower()
        if b'<script' in lower_data or b'javascript:' in lower_data:
            # Verify it's not a false positive from image data
            script_index = lower_data.find(b'<script')
            if script_index == -1:
                script_index = lower_data.find(b'javascript:')

            # Check context around the pattern
            if script_index > 0:
                context = image_data[max(0, script_index-10):script_index+50]
                if self._looks_like_code(context):
                    raise SecurityValidationError("Embedded script detected")

        logger.debug("Security scan passed")

    def _looks_like_code(self, data: bytes) -> bool:
        """
        Check if data looks like code rather than binary image data

        Args:
            data: Bytes to check

        Returns:
            True if data appears to be code
        """
        # Check for high ASCII/text ratio
        printable_count = sum(1 for byte in data if 32 <= byte <= 126)
        if len(data) > 0:
            text_ratio = printable_count / len(data)
            # If more than 70% printable ASCII, likely code
            return text_ratio > 0.7
        return False

    async def _detect_format(self, image_data: bytes) -> ImageFormat:
        """
        Detect image format from magic numbers

        Args:
            image_data: Raw image bytes

        Returns:
            Detected image format

        Raises:
            UnsupportedFormatError: If format cannot be detected
        """
        # Check magic numbers
        for signature, format_type in self.FORMAT_SIGNATURES.items():
            if image_data.startswith(signature):
                # Special handling for WebP
                if signature == b'RIFF' and b'WEBP' in image_data[:20]:
                    return ImageFormat.WEBP
                return format_type

        # Fallback to MIME type detection
        mime_type = self._mime_detector.from_buffer(image_data)

        mime_to_format = {
            'image/jpeg': ImageFormat.JPEG,
            'image/png': ImageFormat.PNG,
            'image/webp': ImageFormat.WEBP,
            'image/gif': ImageFormat.GIF,
        }

        if mime_type in mime_to_format:
            return mime_to_format[mime_type]

        raise UnsupportedFormatError(f"Unable to detect image format from data")

    async def _check_decompression_bomb(self, image: Image.Image) -> None:
        """
        Check for potential decompression bombs

        Args:
            image: PIL Image object

        Raises:
            SecurityValidationError: If decompression bomb detected
        """
        # Calculate decompressed size
        pixel_count = image.width * image.height

        # Assume worst case: RGBA (4 bytes per pixel)
        estimated_size = pixel_count * 4

        # Check against reasonable limits (1GB uncompressed)
        if estimated_size > 1024 * 1024 * 1024:
            raise SecurityValidationError(
                f"Potential decompression bomb detected: "
                f"estimated size {estimated_size} bytes"
            )

        # Check compression ratio if available
        if hasattr(image, 'info') and 'compression' in image.info:
            # This is a simplified check
            if image.info.get('compression_ratio', 0) > 100:
                raise SecurityValidationError(
                    "Suspicious compression ratio detected"
                )

    async def _generate_metadata(
        self,
        image: Image.Image,
        image_bytes: bytes,
        format_type: ImageFormat
    ) -> ImageMetadata:
        """
        Generate comprehensive image metadata

        Args:
            image: PIL Image object
            image_bytes: Raw image bytes
            format_type: Detected image format

        Returns:
            ImageMetadata object
        """
        # Calculate checksum
        checksum = hashlib.sha256(image_bytes).hexdigest()

        # Check for EXIF data
        has_exif = bool(image.getexif()) if hasattr(image, 'getexif') else False

        # Determine MIME type
        mime_type = {
            ImageFormat.JPEG: 'image/jpeg',
            ImageFormat.PNG: 'image/png',
            ImageFormat.WEBP: 'image/webp',
            ImageFormat.GIF: 'image/gif',
        }.get(format_type, 'application/octet-stream')

        return ImageMetadata(
            format=format_type,
            width=image.width,
            height=image.height,
            size_bytes=len(image_bytes),
            mime_type=mime_type,
            has_exif=has_exif,
            checksum=checksum
        )

    async def process_chunked_upload(
        self,
        chunks: AsyncIterator[str],
        compression: CompressionType = CompressionType.NONE
    ) -> Tuple[Image.Image, ImageMetadata]:
        """
        Process base64 image uploaded in chunks

        Args:
            chunks: Async iterator of base64 chunks
            compression: Compression type

        Returns:
            Processed image and metadata
        """
        # Combine chunks
        full_data = ""
        async for chunk in chunks:
            full_data += chunk

            # Check size limit during streaming
            estimated_size = len(full_data) * 3 / 4  # Approximate decoded size
            if estimated_size > self.MAX_SIZE_BYTES:
                raise ImageTooLargeError(
                    f"Chunked upload exceeds size limit of {self.MAX_SIZE_BYTES} bytes"
                )

        # Process combined data
        return await self.decode_and_validate(full_data, compression)

    def get_supported_formats(self) -> list[str]:
        """Get list of supported image formats"""
        return [fmt.value for fmt in self.ALLOWED_FORMATS]

    def get_processing_limits(self) -> Dict:
        """Get current processing limits"""
        return {
            'max_size_mb': self.options.max_size_mb,
            'max_dimensions': self.options.max_dimensions,
            'supported_formats': self.get_supported_formats(),
            'chunk_size': self.options.chunk_size,
            'compression_types': [ct.value for ct in CompressionType]
        }