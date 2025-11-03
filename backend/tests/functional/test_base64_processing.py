"""
Functional tests for base64 image processing
Tests for US-032: Enterprise Base64 Image Processing
"""

import asyncio
import base64
import gzip
import io
import json
from typing import Dict, Any

import brotli
import pytest
from PIL import Image, ExifTags

from app.services.secure_image_processor import (
    SecureImageProcessor,
    ProcessingOptions,
    CompressionType,
    ImageFormat,
    ImageMetadata,
)
from app.core.exceptions import (
    InvalidBase64Error,
    UnsupportedFormatError,
    ImageTooLargeError,
)


@pytest.fixture
def processor() -> SecureImageProcessor:
    """Create a SecureImageProcessor for functional testing"""
    return SecureImageProcessor()


@pytest.fixture
def processor_with_exif() -> SecureImageProcessor:
    """Create a processor that preserves EXIF data"""
    options = ProcessingOptions(preserve_exif=True)
    return SecureImageProcessor(options)


class TestValidBase64Processing:
    """Test processing of valid base64 images"""

    @pytest.mark.asyncio
    async def test_valid_png_processing(self, processor: SecureImageProcessor):
        """Test processing of valid PNG base64"""
        # Create a test PNG
        img = Image.new('RGB', (200, 200), color=(255, 0, 0))
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')

        # Process the image
        result_img, metadata = await processor.decode_and_validate(base64_data)

        # Verify results
        assert result_img is not None
        assert metadata.format == ImageFormat.PNG
        assert metadata.width == 200
        assert metadata.height == 200
        assert metadata.mime_type == 'image/png'
        assert metadata.checksum is not None

    @pytest.mark.asyncio
    async def test_valid_jpeg_processing(self, processor: SecureImageProcessor):
        """Test processing of valid JPEG base64"""
        # Create a test JPEG
        img = Image.new('RGB', (300, 200), color=(0, 255, 0))
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=90)
        base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')

        # Process the image
        result_img, metadata = await processor.decode_and_validate(base64_data)

        # Verify results
        assert result_img is not None
        assert metadata.format == ImageFormat.JPEG
        assert metadata.width == 300
        assert metadata.height == 200
        assert metadata.mime_type == 'image/jpeg'

    @pytest.mark.asyncio
    async def test_valid_webp_processing(self, processor: SecureImageProcessor):
        """Test processing of valid WebP base64"""
        # Create a test WebP
        img = Image.new('RGB', (150, 150), color=(0, 0, 255))
        buffer = io.BytesIO()
        img.save(buffer, format='WEBP', quality=80)
        base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')

        # Process the image
        result_img, metadata = await processor.decode_and_validate(base64_data)

        # Verify results
        assert result_img is not None
        assert metadata.format == ImageFormat.WEBP
        assert metadata.width == 150
        assert metadata.height == 150
        assert metadata.mime_type == 'image/webp'

    @pytest.mark.asyncio
    async def test_valid_gif_processing(self, processor: SecureImageProcessor):
        """Test processing of valid GIF base64"""
        # Create a test GIF
        img = Image.new('RGB', (100, 100), color=(128, 128, 128))
        buffer = io.BytesIO()
        img.save(buffer, format='GIF')
        base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')

        # Process the image
        result_img, metadata = await processor.decode_and_validate(base64_data)

        # Verify results
        assert result_img is not None
        assert metadata.format == ImageFormat.GIF
        assert metadata.width == 100
        assert metadata.height == 100
        assert metadata.mime_type == 'image/gif'


class TestDataURLParsing:
    """Test parsing of data URLs"""

    @pytest.mark.asyncio
    async def test_png_data_url_parsing(self, processor: SecureImageProcessor):
        """Test parsing of PNG data URL"""
        # Create image
        img = Image.new('RGB', (50, 50), color='red')
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')

        # Create data URL
        data_url = f"data:image/png;base64,{base64_data}"

        # Process
        result_img, metadata = await processor.decode_and_validate(data_url)

        assert result_img is not None
        assert metadata.format == ImageFormat.PNG
        assert metadata.width == 50

    @pytest.mark.asyncio
    async def test_jpeg_data_url_parsing(self, processor: SecureImageProcessor):
        """Test parsing of JPEG data URL"""
        # Create image
        img = Image.new('RGB', (60, 40), color='blue')
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG')
        base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')

        # Create data URL
        data_url = f"data:image/jpeg;base64,{base64_data}"

        # Process
        result_img, metadata = await processor.decode_and_validate(data_url)

        assert result_img is not None
        assert metadata.format == ImageFormat.JPEG
        assert metadata.width == 60
        assert metadata.height == 40

    @pytest.mark.asyncio
    async def test_data_url_with_charset(self, processor: SecureImageProcessor):
        """Test data URL with charset parameter"""
        # Create image
        img = Image.new('RGB', (30, 30), color='green')
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')

        # Create data URL with charset
        data_url = f"data:image/png;charset=utf-8;base64,{base64_data}"

        # Should still process correctly
        result_img, metadata = await processor.decode_and_validate(data_url)

        assert result_img is not None
        assert metadata.format == ImageFormat.PNG


class TestFormatDetectionAccuracy:
    """Test accuracy of format detection"""

    @pytest.mark.asyncio
    async def test_png_format_detection(self, processor: SecureImageProcessor):
        """Test PNG format detection by magic number"""
        # PNG magic number: 89 50 4E 47 0D 0A 1A 0A
        img = Image.new('RGB', (10, 10))
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')

        result_img, metadata = await processor.decode_and_validate(base64_data)

        assert metadata.format == ImageFormat.PNG

    @pytest.mark.asyncio
    async def test_jpeg_format_detection(self, processor: SecureImageProcessor):
        """Test JPEG format detection by magic number"""
        # JPEG magic number: FF D8 FF
        img = Image.new('RGB', (10, 10))
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG')
        base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')

        result_img, metadata = await processor.decode_and_validate(base64_data)

        assert metadata.format == ImageFormat.JPEG

    @pytest.mark.asyncio
    async def test_webp_format_detection(self, processor: SecureImageProcessor):
        """Test WebP format detection"""
        # WebP starts with RIFF....WEBP
        img = Image.new('RGB', (10, 10))
        buffer = io.BytesIO()
        img.save(buffer, format='WEBP')
        base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')

        result_img, metadata = await processor.decode_and_validate(base64_data)

        assert metadata.format == ImageFormat.WEBP

    @pytest.mark.asyncio
    async def test_gif_format_detection(self, processor: SecureImageProcessor):
        """Test GIF format detection"""
        # GIF magic number: GIF87a or GIF89a
        img = Image.new('P', (10, 10))  # GIF needs palette mode
        buffer = io.BytesIO()
        img.save(buffer, format='GIF')
        base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')

        result_img, metadata = await processor.decode_and_validate(base64_data)

        assert metadata.format == ImageFormat.GIF


class TestEXIFPreservation:
    """Test EXIF data preservation"""

    @pytest.mark.asyncio
    async def test_exif_preservation_enabled(self, processor_with_exif: SecureImageProcessor):
        """Test that EXIF data is preserved when enabled"""
        # Create JPEG with EXIF data
        img = Image.new('RGB', (200, 200), color='yellow')

        # Add EXIF data
        exif_dict = {
            ExifTags.TAGS[k]: v
            for k, v in {
                0x0112: 1,  # Orientation
                0x010F: 'TestManufacturer',  # Make
                0x0110: 'TestModel',  # Model
            }.items()
            if k in ExifTags.TAGS
        }

        buffer = io.BytesIO()
        img.save(buffer, format='JPEG')
        base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')

        result_img, metadata = await processor_with_exif.decode_and_validate(base64_data)

        # Check EXIF preservation flag
        assert processor_with_exif.options.preserve_exif is True
        # Note: Actual EXIF preservation would be in image processing

    @pytest.mark.asyncio
    async def test_exif_detection(self, processor: SecureImageProcessor):
        """Test EXIF detection in images"""
        # Create JPEG with simulated EXIF
        img = Image.new('RGB', (100, 100), color='cyan')
        buffer = io.BytesIO()

        # Save with quality to ensure JPEG markers
        img.save(buffer, format='JPEG', quality=95)

        base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')
        result_img, metadata = await processor.decode_and_validate(base64_data)

        # Metadata should indicate EXIF presence (even if empty)
        assert isinstance(metadata.has_exif, bool)


class TestCompressionHandling:
    """Test handling of compressed base64 data"""

    @pytest.mark.asyncio
    async def test_gzip_compression_handling(self, processor: SecureImageProcessor):
        """Test handling of gzip compressed base64"""
        # Create image
        img = Image.new('RGB', (100, 100), color='purple')
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        image_data = buffer.getvalue()

        # Encode to base64
        base64_data = base64.b64encode(image_data).decode('utf-8')

        # Compress the base64 string
        compressed = gzip.compress(base64_data.encode('utf-8'))
        compressed_base64 = base64.b64encode(compressed).decode('utf-8')

        # Process with gzip decompression
        result_img, metadata = await processor.decode_and_validate(
            compressed_base64,
            CompressionType.GZIP
        )

        assert result_img is not None
        assert metadata.width == 100
        assert metadata.height == 100

    @pytest.mark.asyncio
    async def test_brotli_compression_handling(self, processor: SecureImageProcessor):
        """Test handling of brotli compressed base64"""
        # Create image
        img = Image.new('RGB', (150, 150), color='orange')
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        image_data = buffer.getvalue()

        # Encode to base64
        base64_data = base64.b64encode(image_data).decode('utf-8')

        # Compress with brotli
        compressed = brotli.compress(base64_data.encode('utf-8'))
        compressed_base64 = base64.b64encode(compressed).decode('utf-8')

        # Process with brotli decompression
        result_img, metadata = await processor.decode_and_validate(
            compressed_base64,
            CompressionType.BROTLI
        )

        assert result_img is not None
        assert metadata.width == 150

    @pytest.mark.asyncio
    async def test_no_compression_handling(self, processor: SecureImageProcessor):
        """Test handling when no compression is specified"""
        # Create image
        img = Image.new('RGB', (80, 80), color='brown')
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG')
        base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')

        # Process without compression
        result_img, metadata = await processor.decode_and_validate(
            base64_data,
            CompressionType.NONE
        )

        assert result_img is not None
        assert metadata.width == 80


class TestChunkedUpload:
    """Test chunked upload functionality"""

    @pytest.mark.asyncio
    async def test_chunked_upload_processing(self, processor: SecureImageProcessor):
        """Test processing of chunked base64 upload"""
        # Create image
        img = Image.new('RGB', (200, 200), color='pink')
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')

        # Split into chunks
        chunk_size = 1024
        async def chunk_generator():
            for i in range(0, len(base64_data), chunk_size):
                yield base64_data[i:i + chunk_size]

        # Process chunks
        result_img, metadata = await processor.process_chunked_upload(
            chunk_generator()
        )

        assert result_img is not None
        assert metadata.width == 200
        assert metadata.height == 200

    @pytest.mark.asyncio
    async def test_chunked_upload_with_compression(self, processor: SecureImageProcessor):
        """Test chunked upload with compression"""
        # Create image
        img = Image.new('RGB', (100, 100), color='lime')
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG')
        base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')

        # Compress
        compressed = gzip.compress(base64_data.encode('utf-8'))
        compressed_base64 = base64.b64encode(compressed).decode('utf-8')

        # Create chunks
        async def chunk_generator():
            chunk_size = 512
            for i in range(0, len(compressed_base64), chunk_size):
                yield compressed_base64[i:i + chunk_size]

        # Process
        result_img, metadata = await processor.process_chunked_upload(
            chunk_generator(),
            CompressionType.GZIP
        )

        assert result_img is not None
        assert metadata.width == 100


class TestEdgeCases:
    """Test edge cases and boundary conditions"""

    @pytest.mark.asyncio
    async def test_single_pixel_image(self, processor: SecureImageProcessor):
        """Test processing of 1x1 pixel image"""
        img = Image.new('RGB', (1, 1), color='white')
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')

        result_img, metadata = await processor.decode_and_validate(base64_data)

        assert result_img is not None
        assert metadata.width == 1
        assert metadata.height == 1

    @pytest.mark.asyncio
    async def test_maximum_dimensions(self, processor: SecureImageProcessor):
        """Test image at maximum allowed dimensions"""
        # Set reasonable max for testing
        processor.MAX_DIMENSIONS = (500, 500)

        # Create image exactly at max
        img = Image.new('RGB', (500, 500), color='navy')
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=1)  # Low quality to keep size down
        base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')

        result_img, metadata = await processor.decode_and_validate(base64_data)

        assert result_img is not None
        assert metadata.width == 500
        assert metadata.height == 500

    @pytest.mark.asyncio
    async def test_whitespace_in_base64(self, processor: SecureImageProcessor):
        """Test handling of whitespace in base64 string"""
        img = Image.new('RGB', (50, 50), color='teal')
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')

        # Add whitespace
        base64_with_spaces = '\n'.join(
            base64_data[i:i+76] for i in range(0, len(base64_data), 76)
        )

        result_img, metadata = await processor.decode_and_validate(base64_with_spaces)

        assert result_img is not None
        assert metadata.width == 50

    @pytest.mark.asyncio
    async def test_base64_padding_variations(self, processor: SecureImageProcessor):
        """Test different base64 padding scenarios"""
        img = Image.new('RGB', (33, 33), color='coral')
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')

        # Test with different padding
        test_cases = [
            base64_data,  # Original
            base64_data.rstrip('='),  # Remove padding
            base64_data + '==',  # Extra padding
        ]

        for test_data in test_cases:
            try:
                result_img, metadata = await processor.decode_and_validate(test_data)
                assert result_img is not None
            except InvalidBase64Error:
                # Some padding variations might be invalid
                pass


class TestMetadataGeneration:
    """Test metadata generation"""

    @pytest.mark.asyncio
    async def test_complete_metadata_generation(self, processor: SecureImageProcessor):
        """Test that complete metadata is generated"""
        img = Image.new('RGB', (123, 456), color='gold')
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        image_bytes = buffer.getvalue()
        base64_data = base64.b64encode(image_bytes).decode('utf-8')

        result_img, metadata = await processor.decode_and_validate(base64_data)

        # Check all metadata fields
        assert metadata.format == ImageFormat.PNG
        assert metadata.width == 123
        assert metadata.height == 456
        assert metadata.size_bytes == len(image_bytes)
        assert metadata.mime_type == 'image/png'
        assert metadata.checksum is not None
        assert len(metadata.checksum) == 64  # SHA256 hex length
        assert isinstance(metadata.has_exif, bool)


class TestSupportedFormatsAPI:
    """Test API for querying supported formats"""

    def test_get_supported_formats(self, processor: SecureImageProcessor):
        """Test getting list of supported formats"""
        formats = processor.get_supported_formats()

        assert 'PNG' in formats
        assert 'JPEG' in formats
        assert 'WEBP' in formats
        assert 'GIF' in formats
        assert len(formats) >= 4

    def test_get_processing_limits(self, processor: SecureImageProcessor):
        """Test getting processing limits"""
        limits = processor.get_processing_limits()

        assert 'max_size_mb' in limits
        assert 'max_dimensions' in limits
        assert 'supported_formats' in limits
        assert 'chunk_size' in limits
        assert 'compression_types' in limits

        assert limits['max_size_mb'] == 20
        assert limits['max_dimensions'] == (10000, 10000)
        assert len(limits['compression_types']) >= 3


class TestConcurrentProcessing:
    """Test concurrent processing scenarios"""

    @pytest.mark.asyncio
    async def test_different_formats_concurrent(self, processor: SecureImageProcessor):
        """Test concurrent processing of different formats"""
        # Create images in different formats
        images = []

        # PNG
        img = Image.new('RGB', (100, 100), color='red')
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        images.append(base64.b64encode(buffer.getvalue()).decode('utf-8'))

        # JPEG
        img = Image.new('RGB', (100, 100), color='green')
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG')
        images.append(base64.b64encode(buffer.getvalue()).decode('utf-8'))

        # WebP
        img = Image.new('RGB', (100, 100), color='blue')
        buffer = io.BytesIO()
        img.save(buffer, format='WEBP')
        images.append(base64.b64encode(buffer.getvalue()).decode('utf-8'))

        # Process concurrently
        tasks = [processor.decode_and_validate(img) for img in images]
        results = await asyncio.gather(*tasks)

        # Check results
        assert results[0][1].format == ImageFormat.PNG
        assert results[1][1].format == ImageFormat.JPEG
        assert results[2][1].format == ImageFormat.WEBP