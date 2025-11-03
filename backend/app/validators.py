"""
Input validation utilities for API endpoints.
"""

import re
import uuid
from typing import Any, Optional, List
from pydantic import BaseModel, Field, validator
from pathlib import Path


def is_valid_uuid(value: str) -> bool:
    """
    Validate if a string is a valid UUID.

    Args:
        value: String to validate

    Returns:
        True if valid UUID, False otherwise
    """
    try:
        uuid.UUID(value)
        return True
    except (ValueError, AttributeError):
        return False


def is_safe_filename(filename: str) -> bool:
    """
    Check if filename is safe (no path traversal).

    Args:
        filename: Filename to validate

    Returns:
        True if safe, False otherwise
    """
    if not filename:
        return False

    # Check for path traversal attempts
    if any(char in filename for char in ['..', '/', '\\', '\x00']):
        return False

    # Check for valid characters
    if not re.match(r'^[\w\-. ]+$', filename):
        return False

    # Check extension
    allowed_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'}
    ext = Path(filename).suffix.lower()
    if ext not in allowed_extensions:
        return False

    return True


def validate_image_size(size: int, max_size: int = 10 * 1024 * 1024) -> bool:
    """
    Validate image file size.

    Args:
        size: File size in bytes
        max_size: Maximum allowed size in bytes

    Returns:
        True if within limits, False otherwise
    """
    return 0 < size <= max_size


class ValidatedDetectionOptions(BaseModel):
    """
    Validated detection options with strict constraints.
    """
    confidenceThreshold: float = Field(0.7, ge=0.0, le=1.0)
    maxDetections: int = Field(50, ge=1, le=100)
    enableEnsemble: bool = False
    outputFormat: str = Field("standard", regex="^(standard|detailed)$")
    stream: bool = True

    @validator('confidenceThreshold')
    def validate_confidence(cls, v):
        """Ensure confidence threshold is reasonable."""
        if v < 0.3:
            raise ValueError("Confidence threshold too low, minimum is 0.3")
        return v

    @validator('maxDetections')
    def validate_max_detections(cls, v):
        """Ensure max detections is within reasonable bounds."""
        if v > 100:
            raise ValueError("Maximum 100 detections allowed")
        return v


class ValidatedDetectionRequest(BaseModel):
    """
    Validated detection request with comprehensive checks.
    """
    uploadId: str = Field(..., description="UUID of uploaded image")
    options: Optional[ValidatedDetectionOptions] = None

    @validator('uploadId')
    def validate_upload_id(cls, v):
        """Validate upload ID is a proper UUID."""
        if not is_valid_uuid(v):
            raise ValueError("Invalid upload ID format")
        return v


class ValidatedBatchRequest(BaseModel):
    """
    Validated batch detection request.
    """
    uploadIds: List[str] = Field(..., min_items=1, max_items=100)
    options: Optional[ValidatedDetectionOptions] = None

    @validator('uploadIds')
    def validate_upload_ids(cls, v):
        """Validate all upload IDs are proper UUIDs."""
        for upload_id in v:
            if not is_valid_uuid(upload_id):
                raise ValueError(f"Invalid upload ID format: {upload_id}")

        # Check for duplicates
        if len(v) != len(set(v)):
            raise ValueError("Duplicate upload IDs not allowed")

        return v


class ImageUploadValidator:
    """
    Validator for image upload operations.
    """

    @staticmethod
    def validate_image_upload(
        filename: str,
        content_type: str,
        file_size: int,
        max_size: int = 10 * 1024 * 1024
    ) -> tuple[bool, Optional[str]]:
        """
        Validate image upload parameters.

        Args:
            filename: Original filename
            content_type: MIME type
            file_size: File size in bytes
            max_size: Maximum allowed size

        Returns:
            Tuple of (is_valid, error_message)
        """
        # Check filename
        if not is_safe_filename(filename):
            return False, "Invalid or unsafe filename"

        # Check content type
        allowed_types = {
            'image/jpeg', 'image/jpg', 'image/png',
            'image/gif', 'image/bmp', 'image/webp'
        }
        if content_type not in allowed_types:
            return False, f"Invalid content type: {content_type}"

        # Check file size
        if not validate_image_size(file_size, max_size):
            return False, f"File size exceeds limit of {max_size} bytes"

        return True, None


class RateLimitValidator:
    """
    Rate limiting validator for API endpoints.
    """

    def __init__(self, max_requests: int = 100, window: int = 60):
        """
        Initialize rate limit validator.

        Args:
            max_requests: Maximum requests allowed
            window: Time window in seconds
        """
        self.max_requests = max_requests
        self.window = window
        self.requests = {}

    def check_rate_limit(self, user_id: str) -> tuple[bool, Optional[str]]:
        """
        Check if user has exceeded rate limit.

        Args:
            user_id: User identifier

        Returns:
            Tuple of (is_allowed, error_message)
        """
        from time import time

        current_time = time()
        user_requests = self.requests.get(user_id, [])

        # Remove old requests outside window
        user_requests = [t for t in user_requests if current_time - t < self.window]

        if len(user_requests) >= self.max_requests:
            return False, f"Rate limit exceeded: {self.max_requests} requests per {self.window} seconds"

        # Add current request
        user_requests.append(current_time)
        self.requests[user_id] = user_requests

        return True, None


class SanitizationUtils:
    """
    Utilities for sanitizing user input.
    """

    @staticmethod
    def sanitize_string(value: str, max_length: int = 1000) -> str:
        """
        Sanitize string input.

        Args:
            value: Input string
            max_length: Maximum allowed length

        Returns:
            Sanitized string
        """
        if not value:
            return ""

        # Remove null bytes
        value = value.replace('\x00', '')

        # Truncate to max length
        value = value[:max_length]

        # Remove control characters except newlines and tabs
        value = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', value)

        return value.strip()

    @staticmethod
    def sanitize_path(path: str) -> Optional[str]:
        """
        Sanitize file path to prevent traversal.

        Args:
            path: Input path

        Returns:
            Sanitized path or None if invalid
        """
        if not path:
            return None

        # Remove path traversal attempts
        path = path.replace('..', '')
        path = path.replace('//', '/')

        # Ensure path doesn't start with system directories
        forbidden_prefixes = ['/etc', '/sys', '/proc', '/dev', '/root']
        for prefix in forbidden_prefixes:
            if path.startswith(prefix):
                return None

        return path


# Global instances
rate_limiter = RateLimitValidator()
image_validator = ImageUploadValidator()
sanitizer = SanitizationUtils()