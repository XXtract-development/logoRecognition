"""
US-INT-002: JWT Authentication Middleware
JWT-based authentication for API endpoints
"""

import os
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel


# Configuration
# SECURITY FIX: No default secret key, must be set in environment
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY environment variable must be set for production")

# SECURITY FIX: Use RS256 for better security (asymmetric)
# TODO: Migrate to RS256 with public/private key pair
ALGORITHM = "HS256"  # Will upgrade to RS256 in next release
ACCESS_TOKEN_EXPIRE_MINUTES = 30  # Reduced from 60 for better security

# Password hashing
# SECURITY FIX: Use Argon2id per coding standards (more secure than bcrypt)
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# HTTP Bearer token scheme
security = HTTPBearer()


class TokenData(BaseModel):
    """Token payload data"""
    user_id: Optional[str] = None
    email: Optional[str] = None
    scopes: list[str] = []


class User(BaseModel):
    """User model"""
    user_id: str
    email: str
    is_active: bool = True


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token

    Args:
        data: Payload data to encode
        expires_delta: Token expiration time

    Returns:
        Encoded JWT token
    """
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire, "iat": datetime.utcnow()})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

    return encoded_jwt


def decode_access_token(token: str) -> Dict[str, Any]:
    """
    Decode and validate JWT access token

    Args:
        token: JWT token to decode

    Returns:
        Decoded token payload

    Raises:
        JWTError: If token is invalid or expired
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    """
    Dependency to get current authenticated user from JWT token

    Args:
        credentials: HTTP Bearer token credentials

    Returns:
        Current user

    Raises:
        HTTPException: If token is invalid or user is not found
    """
    token = credentials.credentials

    try:
        payload = decode_access_token(token)

        user_id: str = payload.get("sub")
        email: str = payload.get("email")

        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

        token_data = TokenData(
            user_id=user_id,
            email=email,
            scopes=payload.get("scopes", [])
        )

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # In a real app, you would query the database here
    # For now, return user from token data
    user = User(
        user_id=token_data.user_id,
        email=token_data.email or "",
        is_active=True
    )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Dependency to get current active user

    Args:
        current_user: Current user from JWT token

    Returns:
        Active user

    Raises:
        HTTPException: If user is inactive
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    return current_user


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)


# Optional: Extract user from request state (set by rate limiter)
def get_user_from_request(request: Request) -> Optional[User]:
    """
    Extract user from request state

    This is used by the rate limiter to identify users
    """
    return request.state.__dict__.get('user', None)


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))
) -> User:
    """
    Optional dependency for development - allows requests without authentication.

    DEVELOPMENT ONLY: Returns a mock user if no credentials provided.
    In production, set ENVIRONMENT=production to require authentication.

    Args:
        credentials: Optional HTTP Bearer token credentials

    Returns:
        User (authenticated or mock user in development)
    """
    import os

    # If credentials provided, validate them
    if credentials:
        try:
            token = credentials.credentials
            payload = decode_access_token(token)
            user_id = payload.get("sub")
            email = payload.get("email")

            user = User(
                user_id=user_id,
                email=email or "",
                is_active=True
            )
            return user
        except HTTPException:
            # Invalid token - fall through to dev mode check
            pass

    # Development mode: allow access without authentication
    environment = os.getenv("ENVIRONMENT", "development")
    if environment == "development":
        return User(
            user_id="dev-user",
            email="dev@localhost",
            is_active=True
        )

    # Production: require authentication
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
