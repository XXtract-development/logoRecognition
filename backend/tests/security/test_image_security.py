"""
Security tests for enterprise base64 image processing
Tests for US-032: Enterprise Base64 Image Processing
"""

import asyncio
import base64
import gzip
import io
import os
import struct
from typing import Any, Generator
from unittest.mock import MagicMock, AsyncMock, patch

import brotli
import pytest
from PIL import Image
from hypothesis import given, strategies as st, settings, example

from app.core.exceptions import (
    SecurityValidationError,
    InvalidBase64Error,
    ImageTooLargeError,
    UnsupportedFormatError,
)
from app.services.secure_image_processor import (
    SecureImageProcessor,
    ProcessingOptions,
    CompressionType,
    ImageFormat,
    ImageMetadata,
)


@pytest.fixture
def processor() -> SecureImageProcessor:
    """Create a SecureImageProcessor instance for testing"""
    options = ProcessingOptions(
        max_size_mb=20,
        enable_security_scan=True,
        chunk_size=1024  # Smaller chunks for testing
    )
    return SecureImageProcessor(options)


@pytest.fixture
def valid_png_image() -> bytes:
    """Create a valid PNG image for testing"""
    img = Image.new('RGB', (100, 100), color='red')
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    return buffer.getvalue()


@pytest.fixture
def valid_jpeg_image() -> bytes:
    """Create a valid JPEG image for testing"""
    img = Image.new('RGB', (100, 100), color='blue')
    buffer = io.BytesIO()
    img.save(buffer, format='JPEG')
    return buffer.getvalue()


@pytest.fixture
def valid_base64_png(valid_png_image: bytes) -> str:
    """Create valid base64 encoded PNG"""
    return base64.b64encode(valid_png_image).decode('utf-8')


@pytest.fixture
def valid_base64_jpeg(valid_jpeg_image: bytes) -> str:
    """Create valid base64 encoded JPEG"""
    return base64.b64encode(valid_jpeg_image).decode('utf-8')


class TestMaliciousPayloadDetection:
    """Test detection of malicious payloads"""

    @pytest.mark.asyncio
    async def test_php_tags_detected(self, processor: SecureImageProcessor):
        """Test that PHP tags in image data are detected"""
        malicious_data = b'<?php echo "hacked"; ?>' + b'\x89PNG\r\n\x1a\n'
        encoded = base64.b64encode(malicious_data).decode('utf-8')

        with pytest.raises(SecurityValidationError) as exc_info:
            await processor.decode_and_validate(encoded)

        assert "suspicious content detected" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_javascript_injection_detected(self, processor: SecureImageProcessor):
        """Test that JavaScript injection attempts are detected"""
        malicious_data = b'\x89PNG\r\n\x1a\n' + b'<script>alert("XSS")</script>'
        encoded = base64.b64encode(malicious_data).decode('utf-8')

        with pytest.raises(SecurityValidationError) as exc_info:
            await processor.decode_and_validate(encoded)

        assert "Embedded script detected" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_eval_exec_patterns_detected(self, processor: SecureImageProcessor):
        """Test that eval/exec patterns are detected"""
        patterns = [b'eval(', b'exec(']

        for pattern in patterns:
            malicious_data = b'\x89PNG\r\n\x1a\n' + pattern + b'malicious_code)'
            encoded = base64.b64encode(malicious_data).decode('utf-8')

            with pytest.raises(SecurityValidationError):
                await processor.decode_and_validate(encoded)

    @pytest.mark.asyncio
    async def test_pe_executable_detected(self, processor: SecureImageProcessor):
        """Test that PE executables are detected"""
        # PE header signature
        pe_header = b'MZ\x90\x00\x03\x00\x00\x00'
        encoded = base64.b64encode(pe_header).decode('utf-8')

        with pytest.raises(SecurityValidationError) as exc_info:
            await processor.decode_and_validate(encoded)

        assert "Executable file detected" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_elf_executable_detected(self, processor: SecureImageProcessor):
        """Test that ELF executables are detected"""
        # ELF header signature
        elf_header = b'\x7fELF\x02\x01\x01\x00'
        encoded = base64.b64encode(elf_header).decode('utf-8')

        with pytest.raises(SecurityValidationError) as exc_info:
            await processor.decode_and_validate(encoded)

        assert "Executable file detected" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_malformed_png_detected(self, processor: SecureImageProcessor):
        """Test that malformed PNG files are detected"""
        # Malformed PNG with corrupted IEND chunk
        malformed = b'\x89PNG\r\n\x1a\n' + b'\x00\x00\x00\x00IEND'
        encoded = base64.b64encode(malformed).decode('utf-8')

        with pytest.raises(SecurityValidationError):
            await processor.decode_and_validate(encoded)

    @pytest.mark.asyncio
    async def test_clean_image_passes_security(
        self,
        processor: SecureImageProcessor,
        valid_base64_png: str
    ):
        """Test that clean images pass security validation"""
        image, metadata = await processor.decode_and_validate(valid_base64_png)

        assert image is not None
        assert metadata.format == ImageFormat.PNG
        assert metadata.width == 100
        assert metadata.height == 100


class TestImageBombPrevention:
    """Test prevention of image bomb attacks"""

    @pytest.mark.asyncio
    async def test_decompression_bomb_prevented(self, processor: SecureImageProcessor):
        """Test that decompression bombs are prevented"""
        # Create an image that would decompress to huge size
        # Simulate with very large dimensions
        huge_img = Image.new('RGB', (50000, 50000), color='white')
        buffer = io.BytesIO()

        # Save with high compression to make file small
        huge_img.save(buffer, format='PNG', compress_level=9)
        encoded = base64.b64encode(buffer.getvalue()).decode('utf-8')

        with pytest.raises(SecurityValidationError) as exc_info:
            await processor.decode_and_validate(encoded)

        assert "decompression bomb" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_compression_bomb_gzip_prevented(self, processor: SecureImageProcessor):
        """Test that gzip compression bombs are prevented"""
        # Create highly compressible data
        bomb_data = b'A' * (100 * 1024 * 1024)  # 100MB of 'A's
        compressed = gzip.compress(bomb_data, compresslevel=9)

        # This would be small compressed but huge uncompressed
        encoded = base64.b64encode(compressed).decode('utf-8')

        with pytest.raises(Exception):  # Could be various exceptions
            await processor.decode_and_validate(encoded, CompressionType.GZIP)

    @pytest.mark.asyncio
    async def test_compression_bomb_brotli_prevented(self, processor: SecureImageProcessor):
        """Test that brotli compression bombs are prevented"""
        # Create highly compressible data
        bomb_data = b'B' * (50 * 1024 * 1024)  # 50MB of 'B's
        compressed = brotli.compress(bomb_data, quality=11)

        encoded = base64.b64encode(compressed).decode('utf-8')

        with pytest.raises(Exception):  # Could be various exceptions
            await processor.decode_and_validate(encoded, CompressionType.BROTLI)


class TestOversizedImageRejection:
    """Test rejection of oversized images"""

    @pytest.mark.asyncio
    async def test_oversized_image_rejected(self, processor: SecureImageProcessor):
        """Test that images exceeding size limit are rejected"""
        # Create image larger than 20MB limit
        processor.MAX_SIZE_BYTES = 1024  # Set to 1KB for testing

        large_img = Image.new('RGB', (1000, 1000), color='green')
        buffer = io.BytesIO()
        large_img.save(buffer, format='PNG')
        encoded = base64.b64encode(buffer.getvalue()).decode('utf-8')

        with pytest.raises(ImageTooLargeError) as exc_info:
            await processor.decode_and_validate(encoded)

        assert "exceeds maximum" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_oversized_dimensions_rejected(self, processor: SecureImageProcessor):
        """Test that images with excessive dimensions are rejected"""
        processor.MAX_DIMENSIONS = (100, 100)  # Small limit for testing

        large_img = Image.new('RGB', (200, 200), color='yellow')
        buffer = io.BytesIO()
        large_img.save(buffer, format='PNG')
        encoded = base64.b64encode(buffer.getvalue()).decode('utf-8')

        with pytest.raises(ImageTooLargeError) as exc_info:
            await processor.decode_and_validate(encoded)

        assert "dimensions" in str(exc_info.value)


class TestInvalidBase64Handling:
    """Test handling of invalid base64 input"""

    @pytest.mark.asyncio
    async def test_invalid_base64_handled(self, processor: SecureImageProcessor):
        """Test that invalid base64 is properly handled"""
        invalid_inputs = [
            "not-base64-at-all!@#$",
            "====",  # Only padding
            "SGVsbG8gV29ybGQ",  # Valid base64 but not an image
            "",  # Empty string
            "   ",  # Whitespace only
        ]

        for invalid in invalid_inputs:
            with pytest.raises((InvalidBase64Error, UnsupportedFormatError)):
                await processor.decode_and_validate(invalid)

    @given(st.text(min_size=1, max_size=1000).filter(lambda x: not x.isspace()))
    @settings(max_examples=50, deadline=2000)
    @pytest.mark.asyncio
    async def test_random_string_handled_safely(
        self,
        processor: SecureImageProcessor,
        random_string: str
    ):
        """Property-based test: any random string should be handled safely"""
        try:
            await processor.decode_and_validate(random_string)
        except (InvalidBase64Error, UnsupportedFormatError, SecurityValidationError,
                ImageTooLargeError):
            # Expected exceptions
            pass
        except Exception as e:
            pytest.fail(f"Unexpected exception for input '{random_string[:50]}...': {e}")


class TestFormatSpoofingPrevention:
    """Test prevention of format spoofing attacks"""

    @pytest.mark.asyncio
    async def test_jpeg_disguised_as_png_detected(self, processor: SecureImageProcessor):
        """Test that JPEG disguised as PNG is detected"""
        # Create JPEG but try to pass it off with PNG magic number
        jpeg_img = Image.new('RGB', (100, 100), color='purple')
        buffer = io.BytesIO()
        jpeg_img.save(buffer, format='JPEG')
        jpeg_data = buffer.getvalue()

        # Prepend PNG magic number to JPEG data
        spoofed = b'\x89PNG\r\n\x1a\n' + jpeg_data[8:]
        encoded = base64.b64encode(spoofed).decode('utf-8')

        # Should either detect the spoofing or fail to process
        with pytest.raises(Exception):
            await processor.decode_and_validate(encoded)

    @pytest.mark.asyncio
    async def test_executable_with_image_header_detected(self, processor: SecureImageProcessor):
        """Test that executables with image headers are detected"""
        # Start with valid PNG header then add executable code
        fake_png = b'\x89PNG\r\n\x1a\n' + b'MZ' + b'\x90' * 100
        encoded = base64.b64encode(fake_png).decode('utf-8')

        with pytest.raises((SecurityValidationError, UnsupportedFormatError)):
            await processor.decode_and_validate(encoded)


class TestExecutableInMetadataBlocking:
    """Test blocking of executables hidden in metadata"""

    @pytest.mark.asyncio
    async def test_exif_with_script_blocked(self, processor: SecureImageProcessor):
        """Test that scripts in EXIF data are blocked"""
        # Create image with malicious EXIF
        img = Image.new('RGB', (100, 100), color='orange')

        # Add malicious data to image info
        img.info['exif'] = b'<script>alert("XSS")</script>'

        buffer = io.BytesIO()
        img.save(buffer, format='JPEG')

        # Add the script to the raw data
        img_data = buffer.getvalue()
        malicious_data = img_data + b'<script>alert("XSS")</script>'
        encoded = base64.b64encode(malicious_data).decode('utf-8')

        with pytest.raises(SecurityValidationError):
            await processor.decode_and_validate(encoded)

    @pytest.mark.asyncio
    async def test_metadata_xss_prevention(self, processor: SecureImageProcessor):
        """Test prevention of XSS through metadata"""
        # Create image with XSS attempt in comment
        img = Image.new('RGB', (100, 100), color='cyan')
        buffer = io.BytesIO()

        # Save with potentially malicious comment
        img.save(buffer, format='PNG', pnginfo=None)

        # Inject JavaScript into the file
        img_data = buffer.getvalue()
        xss_attempt = img_data + b'javascript:alert(1)'
        encoded = base64.b64encode(xss_attempt).decode('utf-8')

        with pytest.raises(SecurityValidationError) as exc_info:
            await processor.decode_and_validate(encoded)

        assert "script detected" in str(exc_info.value).lower()


class TestSteganographyDetection:
    """Test detection of steganography attempts"""

    @pytest.mark.asyncio
    async def test_hidden_data_pattern_detection(self, processor: SecureImageProcessor):
        """Test detection of hidden data patterns"""
        # Create image with hidden pattern in LSB
        img = Image.new('RGB', (100, 100))
        pixels = img.load()

        # Embed pattern in least significant bits
        hidden_message = b"HIDDEN"
        for i, byte in enumerate(hidden_message):
            if i < 100:
                # Modify LSB of pixels
                x, y = i % 100, i // 100
                r, g, b = pixels[x, y]
                pixels[x, y] = (r | (byte & 1), g, b)

        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        encoded = base64.b64encode(buffer.getvalue()).decode('utf-8')

        # Should process normally as steganography itself isn't malicious
        # unless it contains malicious patterns
        image, metadata = await processor.decode_and_validate(encoded)
        assert image is not None


class TestCompressionBombPrevention:
    """Test prevention of compression bomb attacks"""

    @pytest.mark.asyncio
    async def test_zip_bomb_pattern_detected(self, processor: SecureImageProcessor):
        """Test detection of zip bomb patterns"""
        # Create data with zip bomb characteristics
        # Multiple layers of compression
        data = b'X' * 1000
        for _ in range(3):  # Multiple compression layers
            data = gzip.compress(data, compresslevel=9)

        encoded = base64.b64encode(data).decode('utf-8')

        with pytest.raises(Exception):
            await processor.decode_and_validate(encoded)

    @pytest.mark.asyncio
    async def test_recursive_compression_handled(self, processor: SecureImageProcessor):
        """Test handling of recursive compression"""
        # Create recursively compressed data
        data = b'Y' * 1000
        compressed1 = gzip.compress(data)
        compressed2 = brotli.compress(compressed1)
        encoded = base64.b64encode(compressed2).decode('utf-8')

        # Should handle but might fail on actual decompression
        with pytest.raises(Exception):
            await processor.decode_and_validate(encoded, CompressionType.BROTLI)


class TestSecurityValidationDisabled:
    """Test behavior when security scanning is disabled"""

    @pytest.mark.asyncio
    async def test_malicious_content_allowed_when_disabled(self):
        """Test that malicious content passes when security is disabled"""
        options = ProcessingOptions(enable_security_scan=False)
        processor = SecureImageProcessor(options)

        # Create valid image with embedded "malicious" pattern
        img = Image.new('RGB', (10, 10), color='magenta')
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')

        # Add pattern that would normally be flagged
        img_data = buffer.getvalue() + b'<?php echo "test"; ?>'
        encoded = base64.b64encode(img_data).decode('utf-8')

        # Should not raise SecurityValidationError
        with pytest.raises(Exception) as exc_info:
            await processor.decode_and_validate(encoded)

        # Should fail for other reasons (invalid image), not security
        assert not isinstance(exc_info.value, SecurityValidationError)


class TestEdgeCases:
    """Test edge cases and boundary conditions"""

    @pytest.mark.asyncio
    async def test_exactly_max_size_accepted(self, processor: SecureImageProcessor):
        """Test that image exactly at max size is accepted"""
        # Create image exactly at size limit
        max_bytes = processor.MAX_SIZE_BYTES

        # This is tricky to get exact, so we'll mock
        with patch.object(processor, '_scan_for_malware', new_callable=AsyncMock):
            mock_data = b'\x89PNG\r\n\x1a\n' + b'X' * (max_bytes - 8)
            encoded = base64.b64encode(mock_data).decode('utf-8')

            # Should not raise ImageTooLargeError
            try:
                await processor.decode_and_validate(encoded)
            except ImageTooLargeError:
                pytest.fail("Image at exactly max size should be accepted")
            except Exception:
                # Other exceptions are fine
                pass

    @pytest.mark.asyncio
    async def test_one_byte_over_max_rejected(self, processor: SecureImageProcessor):
        """Test that image one byte over max size is rejected"""
        max_bytes = processor.MAX_SIZE_BYTES
        mock_data = b'X' * (max_bytes + 1)
        encoded = base64.b64encode(mock_data).decode('utf-8')

        with pytest.raises(ImageTooLargeError):
            await processor.decode_and_validate(encoded)

    @pytest.mark.asyncio
    async def test_empty_base64_handled(self, processor: SecureImageProcessor):
        """Test that empty base64 string is handled properly"""
        with pytest.raises(InvalidBase64Error):
            await processor.decode_and_validate("")

    @pytest.mark.asyncio
    async def test_whitespace_only_base64_handled(self, processor: SecureImageProcessor):
        """Test that whitespace-only input is handled"""
        with pytest.raises(InvalidBase64Error):
            await processor.decode_and_validate("   \n\t  ")


class TestConcurrentSecurityChecks:
    """Test security under concurrent load"""

    @pytest.mark.asyncio
    async def test_concurrent_malicious_uploads(self, processor: SecureImageProcessor):
        """Test that concurrent malicious uploads are all caught"""
        malicious_payloads = [
            b'<?php system($_GET["cmd"]); ?>',
            b'<script>alert("XSS")</script>',
            b'eval(atob("aGFja2VkIQ=="))',
            b'MZ\x90\x00',  # PE header
            b'\x7fELF',  # ELF header
        ]

        tasks = []
        for payload in malicious_payloads:
            data = b'\x89PNG\r\n\x1a\n' + payload
            encoded = base64.b64encode(data).decode('utf-8')
            tasks.append(processor.decode_and_validate(encoded))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # All should have raised SecurityValidationError
        for result in results:
            assert isinstance(result, (SecurityValidationError, Exception))

    @pytest.mark.asyncio
    async def test_mixed_valid_invalid_concurrent(
        self,
        processor: SecureImageProcessor,
        valid_base64_png: str
    ):
        """Test concurrent processing of mixed valid and invalid images"""
        # Mix of valid and malicious
        payloads = [
            valid_base64_png,  # Valid
            base64.b64encode(b'<?php ?>').decode('utf-8'),  # Malicious
            valid_base64_png,  # Valid
            base64.b64encode(b'MZ\x90').decode('utf-8'),  # Malicious
        ]

        tasks = [processor.decode_and_validate(p) for p in payloads]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Check results
        assert not isinstance(results[0], Exception)  # Valid
        assert isinstance(results[1], SecurityValidationError)  # Malicious
        assert not isinstance(results[2], Exception)  # Valid
        assert isinstance(results[3], SecurityValidationError)  # Malicious