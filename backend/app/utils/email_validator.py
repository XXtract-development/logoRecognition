"""Email validation utility for US-INT-006 AC4.

Validates email addresses according to RFC 5322 standard.
"""

import re
from typing import Optional


# RFC 5322 compliant email regex (simplified for practical use)
EMAIL_REGEX = re.compile(
    r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
)


def is_valid_email(email: str) -> bool:
    """
    Validate email address format (US-INT-006 AC4).

    Args:
        email: Email address to validate

    Returns:
        True if email is valid, False otherwise

    Examples:
        >>> is_valid_email("user@example.com")
        True
        >>> is_valid_email("invalid.email")
        False
        >>> is_valid_email("user@")
        False
    """
    if not email or not isinstance(email, str):
        return False

    # Basic length checks
    if len(email) > 254 or len(email) < 3:
        return False

    # Check for @ symbol
    if email.count('@') != 1:
        return False

    # Regex validation
    return bool(EMAIL_REGEX.match(email.strip()))


def validate_email_or_raise(email: str) -> str:
    """
    Validate email and raise ValueError if invalid (US-INT-006 AC4).

    Args:
        email: Email address to validate

    Returns:
        Sanitized email address

    Raises:
        ValueError: If email is invalid
    """
    email = email.strip() if email else ""

    if not is_valid_email(email):
        raise ValueError(
            f"Invalid email address: '{email}'. "
            "Email must be in format: user@domain.com"
        )

    return email
