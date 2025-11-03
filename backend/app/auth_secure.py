"""
Secure JWT Authentication Implementation
Fixes security vulnerabilities identified in QA review
"""

import os
import secrets
import hashlib
import re
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
import logging

import jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text
import bleach

from app.database import get_db

# Configure logging
logger = logging.getLogger(__name__)

# Security configuration
SECRET_KEY = os.getenv("SECRET_KEY", secrets.token_urlsafe(32))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 15

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Security scheme
security = HTTPBearer()

# Input validation patterns
EMAIL_PATTERN = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
USERNAME_PATTERN = re.compile(r'^[a-zA-Z0-9_-]{3,20}$')
PASSWORD_PATTERN = re.compile(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$')


@dataclass
class TokenPayload:
    """JWT token payload structure"""
    sub: str  # Subject (user_id)
    exp: datetime  # Expiration
    iat: datetime  # Issued at
    jti: str  # JWT ID (for revocation)
    type: str  # Token type (access/refresh)
    roles: List[str] = None
    permissions: List[str] = None


@dataclass
class UserSession:
    """User session information"""
    user_id: str
    username: str
    email: str
    roles: List[str]
    permissions: List[str]
    session_id: str
    created_at: datetime
    last_activity: datetime


class SecureAuthService:
    """Secure authentication service with proper validation"""

    def __init__(self):
        self.revoked_tokens = set()  # In production, use Redis
        self.active_sessions = {}  # In production, use Redis
        self.login_attempts = {}  # Track failed login attempts

    def sanitize_input(self, input_str: str, max_length: int = 255) -> str:
        """Sanitize user input to prevent injection attacks"""
        if not input_str:
            return ""

        # Remove HTML tags and dangerous characters
        cleaned = bleach.clean(input_str, tags=[], strip=True)

        # Limit length
        cleaned = cleaned[:max_length]

        # Remove SQL injection patterns
        sql_patterns = [
            r'\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|FROM|WHERE)\b',
            r'(--|#|/\*|\*/|;|\||&&|\|\|)'
        ]

        for pattern in sql_patterns:
            cleaned = re.sub(pattern, '', cleaned, flags=re.IGNORECASE)

        return cleaned.strip()

    def validate_email(self, email: str) -> bool:
        """Validate email format"""
        if not email or len(email) > 254:
            return False
        return bool(EMAIL_PATTERN.match(email))

    def validate_username(self, username: str) -> bool:
        """Validate username format"""
        if not username:
            return False
        return bool(USERNAME_PATTERN.match(username))

    def validate_password(self, password: str) -> bool:
        """
        Validate password strength
        Requirements:
        - At least 8 characters
        - At least one uppercase letter
        - At least one lowercase letter
        - At least one digit
        - At least one special character
        """
        if not password:
            return False
        return bool(PASSWORD_PATTERN.match(password))

    def hash_password(self, password: str) -> str:
        """Hash password using bcrypt"""
        return pwd_context.hash(password)

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify password against hash"""
        try:
            return pwd_context.verify(plain_password, hashed_password)
        except Exception as e:
            logger.error(f"Password verification failed: {e}")
            return False

    def check_login_attempts(self, identifier: str) -> bool:
        """Check if user is locked out due to failed attempts"""
        if identifier not in self.login_attempts:
            return True

        attempts_data = self.login_attempts[identifier]
        if attempts_data['count'] >= MAX_LOGIN_ATTEMPTS:
            lockout_until = attempts_data['last_attempt'] + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
            if datetime.utcnow() < lockout_until:
                return False
            else:
                # Reset after lockout period
                del self.login_attempts[identifier]

        return True

    def record_failed_login(self, identifier: str):
        """Record failed login attempt"""
        if identifier not in self.login_attempts:
            self.login_attempts[identifier] = {
                'count': 0,
                'last_attempt': datetime.utcnow()
            }

        self.login_attempts[identifier]['count'] += 1
        self.login_attempts[identifier]['last_attempt'] = datetime.utcnow()

    def reset_login_attempts(self, identifier: str):
        """Reset login attempts after successful login"""
        if identifier in self.login_attempts:
            del self.login_attempts[identifier]

    def create_access_token(self, user_id: str, username: str, roles: List[str] = None,
                          permissions: List[str] = None) -> str:
        """Create secure JWT access token"""
        now = datetime.now(timezone.utc)
        expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        jti = secrets.token_urlsafe(16)

        payload = {
            "sub": str(user_id),
            "username": username,
            "exp": expire,
            "iat": now,
            "jti": jti,
            "type": "access",
            "roles": roles or [],
            "permissions": permissions or []
        }

        token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
        return token

    def create_refresh_token(self, user_id: str) -> str:
        """Create secure JWT refresh token"""
        now = datetime.now(timezone.utc)
        expire = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        jti = secrets.token_urlsafe(16)

        payload = {
            "sub": str(user_id),
            "exp": expire,
            "iat": now,
            "jti": jti,
            "type": "refresh"
        }

        token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
        return token

    def verify_token(self, token: str, token_type: str = "access") -> Optional[TokenPayload]:
        """Verify and decode JWT token with proper validation"""
        try:
            # Decode token
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

            # Check token type
            if payload.get("type") != token_type:
                logger.warning(f"Invalid token type: expected {token_type}, got {payload.get('type')}")
                return None

            # Check if token is revoked
            jti = payload.get("jti")
            if jti and jti in self.revoked_tokens:
                logger.warning(f"Attempted use of revoked token: {jti}")
                return None

            # Check expiration (jwt.decode already checks this, but we double-check)
            exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
            if exp < datetime.now(timezone.utc):
                logger.warning(f"Token expired: {exp}")
                return None

            # Create TokenPayload object
            return TokenPayload(
                sub=payload["sub"],
                exp=exp,
                iat=datetime.fromtimestamp(payload["iat"], tz=timezone.utc),
                jti=jti,
                type=payload["type"],
                roles=payload.get("roles", []),
                permissions=payload.get("permissions", [])
            )

        except jwt.ExpiredSignatureError:
            logger.warning("Token has expired")
            return None
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid token: {e}")
            return None
        except Exception as e:
            logger.error(f"Token verification failed: {e}")
            return None

    def revoke_token(self, jti: str):
        """Revoke a token by its JTI"""
        self.revoked_tokens.add(jti)
        logger.info(f"Token revoked: {jti}")

    def create_session(self, user_id: str, username: str, email: str,
                      roles: List[str] = None, permissions: List[str] = None) -> str:
        """Create a new user session"""
        session_id = secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc)

        session = UserSession(
            user_id=user_id,
            username=username,
            email=email,
            roles=roles or [],
            permissions=permissions or [],
            session_id=session_id,
            created_at=now,
            last_activity=now
        )

        self.active_sessions[session_id] = session
        return session_id

    def get_session(self, session_id: str) -> Optional[UserSession]:
        """Get active session"""
        session = self.active_sessions.get(session_id)
        if session:
            # Update last activity
            session.last_activity = datetime.now(timezone.utc)
        return session

    def invalidate_session(self, session_id: str):
        """Invalidate a user session"""
        if session_id in self.active_sessions:
            del self.active_sessions[session_id]
            logger.info(f"Session invalidated: {session_id}")

    def get_user_by_id(self, db: Session, user_id: str) -> Optional[Dict]:
        """Get user by ID with parameterized query"""
        try:
            # Use parameterized query to prevent SQL injection
            query = text("""
                SELECT id, username, email, hashed_password, is_active, roles, created_at
                FROM users
                WHERE id = :user_id AND is_active = true
            """)

            result = db.execute(query, {"user_id": user_id}).fetchone()

            if result:
                return {
                    "id": result.id,
                    "username": result.username,
                    "email": result.email,
                    "hashed_password": result.hashed_password,
                    "is_active": result.is_active,
                    "roles": result.roles,
                    "created_at": result.created_at
                }
            return None

        except Exception as e:
            logger.error(f"Database error: {e}")
            return None

    def authenticate_user(self, db: Session, username: str, password: str) -> Optional[Dict]:
        """Authenticate user with secure validation"""
        # Sanitize inputs
        username = self.sanitize_input(username, 50)

        # Check login attempts
        if not self.check_login_attempts(username):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed login attempts. Please try again later."
            )

        try:
            # Get user with parameterized query
            query = text("""
                SELECT id, username, email, hashed_password, is_active, roles
                FROM users
                WHERE (username = :username OR email = :username) AND is_active = true
            """)

            result = db.execute(query, {"username": username}).fetchone()

            if not result:
                self.record_failed_login(username)
                return None

            # Verify password
            if not self.verify_password(password, result.hashed_password):
                self.record_failed_login(username)
                return None

            # Reset login attempts on success
            self.reset_login_attempts(username)

            return {
                "id": result.id,
                "username": result.username,
                "email": result.email,
                "roles": result.roles
            }

        except Exception as e:
            logger.error(f"Authentication error: {e}")
            self.record_failed_login(username)
            return None


# Global auth service instance
auth_service = SecureAuthService()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security),
                          db: Session = Depends(get_db)) -> Dict:
    """Get current authenticated user with proper validation"""
    token = credentials.credentials

    # Verify token
    token_payload = auth_service.verify_token(token, "access")

    if not token_payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Get user from database
    user = auth_service.get_user_by_id(db, token_payload.sub)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def get_current_active_user(current_user: Dict = Depends(get_current_user)) -> Dict:
    """Get current active user"""
    if not current_user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    return current_user


def require_roles(required_roles: List[str]):
    """Decorator to require specific roles"""
    async def role_checker(current_user: Dict = Depends(get_current_active_user)) -> Dict:
        user_roles = current_user.get("roles", [])

        if not any(role in user_roles for role in required_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions"
            )

        return current_user

    return role_checker


def require_permissions(required_permissions: List[str]):
    """Decorator to require specific permissions"""
    async def permission_checker(current_user: Dict = Depends(get_current_active_user)) -> Dict:
        user_permissions = current_user.get("permissions", [])

        if not all(perm in user_permissions for perm in required_permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions"
            )

        return current_user

    return permission_checker


# Rate limiting decorator
def rate_limit(max_requests: int = 100, window_seconds: int = 60):
    """Rate limiting decorator"""
    request_counts = {}  # In production, use Redis

    async def rate_limiter(current_user: Dict = Depends(get_current_active_user)):
        user_id = current_user["id"]
        now = datetime.now(timezone.utc)

        if user_id not in request_counts:
            request_counts[user_id] = []

        # Remove old requests outside the window
        request_counts[user_id] = [
            timestamp for timestamp in request_counts[user_id]
            if (now - timestamp).total_seconds() < window_seconds
        ]

        # Check if limit exceeded
        if len(request_counts[user_id]) >= max_requests:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded"
            )

        # Add current request
        request_counts[user_id].append(now)

        return current_user

    return rate_limiter