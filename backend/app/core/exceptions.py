"""
Core exception classes for the application
"""

from typing import Any, Optional, Dict
from fastapi import HTTPException


class ApplicationError(Exception):
    """Base exception class for application-specific errors"""

    def __init__(
        self,
        message: str,
        error_code: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message)
        self.message = message
        self.error_code = error_code or self.__class__.__name__
        self.details = details or {}


class ImageProcessingError(ApplicationError):
    """Base exception for image processing errors"""
    pass


class InvalidBase64Error(ImageProcessingError):
    """Raised when base64 decoding fails"""

    def __init__(self, message: str = "Invalid base64 encoding"):
        super().__init__(
            message=message,
            error_code="INVALID_BASE64"
        )


class UnsupportedFormatError(ImageProcessingError):
    """Raised when image format is not supported"""

    def __init__(self, message: str = "Unsupported image format"):
        super().__init__(
            message=message,
            error_code="UNSUPPORTED_FORMAT"
        )


class ImageTooLargeError(ImageProcessingError):
    """Raised when image exceeds size limits"""

    def __init__(self, message: str = "Image exceeds size limits"):
        super().__init__(
            message=message,
            error_code="IMAGE_TOO_LARGE"
        )


class SecurityValidationError(ImageProcessingError):
    """Raised when image fails security validation"""

    def __init__(self, message: str = "Image failed security validation"):
        super().__init__(
            message=message,
            error_code="SECURITY_VALIDATION_FAILED"
        )


class RateLimitExceededError(ApplicationError):
    """Raised when rate limit is exceeded"""

    def __init__(self, message: str = "Rate limit exceeded", retry_after: Optional[int] = None):
        super().__init__(
            message=message,
            error_code="RATE_LIMIT_EXCEEDED",
            details={"retry_after": retry_after} if retry_after else {}
        )


class AuthenticationError(ApplicationError):
    """Raised when authentication fails"""

    def __init__(self, message: str = "Authentication failed"):
        super().__init__(
            message=message,
            error_code="AUTHENTICATION_FAILED"
        )


class AuthorizationError(ApplicationError):
    """Raised when authorization fails"""

    def __init__(self, message: str = "Insufficient permissions"):
        super().__init__(
            message=message,
            error_code="AUTHORIZATION_FAILED"
        )


class ValidationError(ApplicationError):
    """Raised when validation fails"""

    def __init__(self, message: str = "Validation failed", errors: Optional[list] = None):
        super().__init__(
            message=message,
            error_code="VALIDATION_FAILED",
            details={"errors": errors} if errors else {}
        )


class ResourceNotFoundError(ApplicationError):
    """Raised when a resource is not found"""

    def __init__(self, resource_type: str, resource_id: Any):
        super().__init__(
            message=f"{resource_type} with id {resource_id} not found",
            error_code="RESOURCE_NOT_FOUND",
            details={"resource_type": resource_type, "resource_id": resource_id}
        )


class ConfigurationError(ApplicationError):
    """Raised when configuration is invalid"""

    def __init__(self, message: str = "Invalid configuration"):
        super().__init__(
            message=message,
            error_code="CONFIGURATION_ERROR"
        )


class DatabaseError(ApplicationError):
    """Raised when database operations fail"""

    def __init__(self, message: str = "Database operation failed"):
        super().__init__(
            message=message,
            error_code="DATABASE_ERROR"
        )


class CacheError(ApplicationError):
    """Raised when cache operations fail"""

    def __init__(self, message: str = "Cache operation failed"):
        super().__init__(
            message=message,
            error_code="CACHE_ERROR"
        )


def create_http_exception(error: ApplicationError, status_code: int = 400) -> HTTPException:
    """
    Convert an ApplicationError to an HTTPException

    Args:
        error: The application error
        status_code: The HTTP status code to use

    Returns:
        HTTPException with structured error details
    """
    return HTTPException(
        status_code=status_code,
        detail={
            "error": error.error_code,
            "message": error.message,
            "details": error.details
        }
    )