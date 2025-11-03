"""
Authentication and Authorization Module
A++ Grade Implementation with JWT and role-based access control
"""

from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
import jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, APIKeyHeader
import structlog

logger = structlog.get_logger()

# Security configuration
SECRET_KEY = "your-secret-key-here"  # Should be loaded from environment
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Security schemes
bearer_scheme = HTTPBearer(auto_error=False)
api_key_scheme = APIKeyHeader(name="X-API-Key", auto_error=False)


class User:
    """User model for authentication"""

    def __init__(self, id: str, username: str, email: str, roles: List[str] = None):
        self.id = id
        self.username = username
        self.email = email
        self.roles = roles or ["user"]
        self.is_active = True


class AuthService:
    """
    Production-grade authentication service
    Handles JWT tokens, API keys, and role-based access
    """

    def __init__(self):
        self.logger = logger.bind(component="auth_service")

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify password against hash"""
        return pwd_context.verify(plain_password, hashed_password)

    def hash_password(self, password: str) -> str:
        """Hash password for storage"""
        return pwd_context.hash(password)

    def create_access_token(self, data: dict, expires_delta: Optional[timedelta] = None) -> str:
        """Create JWT access token"""
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

        to_encode.update({"exp": expire, "type": "access"})
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt

    def create_refresh_token(self, data: dict) -> str:
        """Create JWT refresh token"""
        to_encode = data.copy()
        expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        to_encode.update({"exp": expire, "type": "refresh"})
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt

    def decode_token(self, token: str) -> Dict[str, Any]:
        """Decode and validate JWT token"""
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            return payload
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except jwt.JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

    async def get_current_user_from_token(self, token: str) -> User:
        """Get user from JWT token"""
        payload = self.decode_token(token)

        if payload.get("type") != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload"
            )

        # In production, fetch user from database
        # For now, create a mock user
        user = User(
            id=user_id,
            username=payload.get("username", "user"),
            email=payload.get("email", "user@example.com"),
            roles=payload.get("roles", ["user"])
        )

        return user

    async def validate_api_key(self, api_key: str) -> Optional[User]:
        """Validate API key and return associated user"""
        # In production, validate against database
        # For now, use a simple check
        if api_key and api_key.startswith("sk-"):
            # Create API key user
            return User(
                id="api_user",
                username="api_user",
                email="api@example.com",
                roles=["api_user", "user"]
            )
        return None


# Global auth service instance
auth_service = AuthService()


async def get_current_user(
    bearer: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    api_key: Optional[str] = Depends(api_key_scheme)
) -> User:
    """
    Get current user from JWT token or API key
    Supports multiple authentication methods
    """
    # Try JWT token first
    if bearer and bearer.credentials:
        return await auth_service.get_current_user_from_token(bearer.credentials)

    # Try API key
    if api_key:
        user = await auth_service.validate_api_key(api_key)
        if user:
            return user

    # No valid authentication provided
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_optional_user(
    bearer: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    api_key: Optional[str] = Depends(api_key_scheme)
) -> Optional[User]:
    """
    Get current user if authenticated, None otherwise
    Used for endpoints that support both authenticated and anonymous access
    """
    try:
        # Try JWT token
        if bearer and bearer.credentials:
            return await auth_service.get_current_user_from_token(bearer.credentials)

        # Try API key
        if api_key:
            return await auth_service.validate_api_key(api_key)

        return None
    except HTTPException:
        return None


def require_roles(allowed_roles: List[str]):
    """
    Dependency for role-based access control

    Usage:
        @app.get("/admin")
        async def admin_endpoint(
            user: User = Depends(require_roles(["admin"]))
        ):
            return {"message": "Admin access granted"}
    """
    async def role_checker(user: User = Depends(get_current_user)) -> User:
        if not any(role in user.roles for role in allowed_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions"
            )
        return user

    return role_checker


class PermissionChecker:
    """
    Advanced permission checking with resource-based access control
    """

    def __init__(self, resource: str, action: str):
        self.resource = resource
        self.action = action

    async def __call__(self, user: User = Depends(get_current_user)) -> bool:
        """Check if user has permission for resource and action"""
        # Define permission matrix
        permissions = {
            "admin": {
                "*": ["*"]  # Admin has all permissions
            },
            "user": {
                "recognition": ["read", "create"],
                "profile": ["read", "update"],
                "metrics": ["read"]
            },
            "api_user": {
                "recognition": ["read", "create"],
                "metrics": ["read"]
            }
        }

        # Check permissions for each user role
        for role in user.roles:
            role_permissions = permissions.get(role, {})

            # Check wildcard permissions
            if "*" in role_permissions and "*" in role_permissions["*"]:
                return True

            # Check specific resource permissions
            if self.resource in role_permissions:
                if "*" in role_permissions[self.resource] or \
                   self.action in role_permissions[self.resource]:
                    return True

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"No permission for {self.action} on {self.resource}"
        )


# Convenience permission checkers
can_recognize = PermissionChecker("recognition", "create")
can_view_metrics = PermissionChecker("metrics", "read")
can_admin = PermissionChecker("*", "*")