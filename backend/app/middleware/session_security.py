"""
Enhanced session security middleware with JWT tokens, refresh tokens, and session management.
Implements secure session handling with Redis backend.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import redis
from cryptography.fernet import Fernet
from fastapi import Cookie, HTTPException, Request, Response, status
from fastapi.security import HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel


class SessionConfig:
    """Session configuration settings."""

    # JWT Configuration
    SECRET_KEY = secrets.token_urlsafe(64)
    ALGORITHM = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES = 15
    REFRESH_TOKEN_EXPIRE_DAYS = 7

    # Session Configuration
    SESSION_COOKIE_NAME = "session_id"
    SESSION_COOKIE_SECURE = True  # HTTPS only
    SESSION_COOKIE_HTTPONLY = True  # No JS access
    SESSION_COOKIE_SAMESITE = "strict"  # CSRF protection
    SESSION_MAX_AGE = 3600  # 1 hour
    SESSION_IDLE_TIMEOUT = 1800  # 30 minutes

    # Security Configuration
    MAX_SESSIONS_PER_USER = 5
    SESSION_FINGERPRINT = True
    REQUIRE_CSRF_TOKEN = True
    IP_VALIDATION = True
    USER_AGENT_VALIDATION = True

    # Encryption
    FERNET_KEY = Fernet.generate_key()


class SessionData(BaseModel):
    """Session data model."""

    session_id: str
    user_id: str
    username: str
    role: str
    ip_address: str
    user_agent: str
    fingerprint: str
    created_at: float
    last_activity: float
    expires_at: float
    csrf_token: str
    metadata: Dict[str, Any] = {}


class TokenData(BaseModel):
    """JWT token data model."""

    username: str
    user_id: str
    role: str
    session_id: str
    exp: float
    jti: str  # JWT ID for revocation


class SessionManager:
    """Secure session management with Redis backend."""

    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis = redis.from_url(redis_url, decode_responses=True)
        self.pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        self.fernet = Fernet(SessionConfig.FERNET_KEY)
        self.bearer = HTTPBearer()

    def _generate_session_id(self) -> str:
        """Generate cryptographically secure session ID."""
        return secrets.token_urlsafe(32)

    def _generate_csrf_token(self) -> str:
        """Generate CSRF token."""
        return secrets.token_urlsafe(32)

    def _generate_fingerprint(self, request: Request) -> str:
        """Generate browser fingerprint."""
        components = [
            request.headers.get("user-agent", ""),
            request.headers.get("accept-language", ""),
            request.headers.get("accept-encoding", ""),
            request.headers.get("accept", ""),
        ]

        fingerprint_data = "|".join(components)
        return hashlib.sha256(fingerprint_data.encode()).hexdigest()

    def _get_client_ip(self, request: Request) -> str:
        """Get client IP address."""
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()

        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip

        return request.client.host

    def _encrypt_session_data(self, data: dict) -> str:
        """Encrypt session data."""
        json_data = json.dumps(data)
        encrypted = self.fernet.encrypt(json_data.encode())
        return encrypted.decode()

    def _decrypt_session_data(self, encrypted_data: str) -> dict:
        """Decrypt session data."""
        try:
            decrypted = self.fernet.decrypt(encrypted_data.encode())
            return json.loads(decrypted.decode())
        except Exception:
            return {}

    def create_session(
        self,
        request: Request,
        user_id: str,
        username: str,
        role: str,
        metadata: dict = None
    ) -> SessionData:
        """Create new secure session."""
        # Check maximum sessions per user
        self._check_max_sessions(user_id)

        session_id = self._generate_session_id()
        csrf_token = self._generate_csrf_token()
        fingerprint = self._generate_fingerprint(request)
        ip_address = self._get_client_ip(request)
        user_agent = request.headers.get("user-agent", "")

        now = time.time()
        session_data = SessionData(
            session_id=session_id,
            user_id=user_id,
            username=username,
            role=role,
            ip_address=ip_address,
            user_agent=user_agent,
            fingerprint=fingerprint,
            created_at=now,
            last_activity=now,
            expires_at=now + SessionConfig.SESSION_MAX_AGE,
            csrf_token=csrf_token,
            metadata=metadata or {}
        )

        # Store encrypted session in Redis
        session_key = f"session:{session_id}"
        encrypted_data = self._encrypt_session_data(session_data.dict())

        self.redis.setex(
            session_key,
            SessionConfig.SESSION_MAX_AGE,
            encrypted_data
        )

        # Track user sessions
        user_sessions_key = f"user_sessions:{user_id}"
        self.redis.sadd(user_sessions_key, session_id)
        self.redis.expire(user_sessions_key, SessionConfig.SESSION_MAX_AGE)

        return session_data

    def _check_max_sessions(self, user_id: str):
        """Check and enforce maximum sessions per user."""
        user_sessions_key = f"user_sessions:{user_id}"
        session_ids = self.redis.smembers(user_sessions_key)

        if len(session_ids) >= SessionConfig.MAX_SESSIONS_PER_USER:
            # Remove oldest session
            sessions_with_time = []
            for sid in session_ids:
                session_key = f"session:{sid}"
                encrypted_data = self.redis.get(session_key)
                if encrypted_data:
                    session_data = self._decrypt_session_data(encrypted_data)
                    sessions_with_time.append((sid, session_data.get("created_at", 0)))

            # Sort by creation time and remove oldest
            sessions_with_time.sort(key=lambda x: x[1])
            if sessions_with_time:
                oldest_session_id = sessions_with_time[0][0]
                self.invalidate_session(oldest_session_id)

    def get_session(self, session_id: str) -> Optional[SessionData]:
        """Retrieve and validate session."""
        session_key = f"session:{session_id}"
        encrypted_data = self.redis.get(session_key)

        if not encrypted_data:
            return None

        session_dict = self._decrypt_session_data(encrypted_data)
        if not session_dict:
            return None

        session_data = SessionData(**session_dict)

        # Check expiration
        now = time.time()
        if now > session_data.expires_at:
            self.invalidate_session(session_id)
            return None

        # Check idle timeout
        if now - session_data.last_activity > SessionConfig.SESSION_IDLE_TIMEOUT:
            self.invalidate_session(session_id)
            return None

        return session_data

    def validate_session(
        self,
        request: Request,
        session_id: str,
        csrf_token: Optional[str] = None
    ) -> Optional[SessionData]:
        """Validate session with security checks."""
        session_data = self.get_session(session_id)
        if not session_data:
            return None

        # Validate CSRF token for state-changing requests
        if SessionConfig.REQUIRE_CSRF_TOKEN and request.method not in ["GET", "HEAD", "OPTIONS"]:
            if not csrf_token or not hmac.compare_digest(csrf_token, session_data.csrf_token):
                return None

        # Validate IP address
        if SessionConfig.IP_VALIDATION:
            current_ip = self._get_client_ip(request)
            if current_ip != session_data.ip_address:
                # Log potential session hijacking attempt
                self._log_security_event("ip_mismatch", session_id, current_ip)
                return None

        # Validate user agent
        if SessionConfig.USER_AGENT_VALIDATION:
            current_ua = request.headers.get("user-agent", "")
            if current_ua != session_data.user_agent:
                self._log_security_event("user_agent_mismatch", session_id, current_ua)
                return None

        # Validate fingerprint
        if SessionConfig.SESSION_FINGERPRINT:
            current_fingerprint = self._generate_fingerprint(request)
            if current_fingerprint != session_data.fingerprint:
                self._log_security_event("fingerprint_mismatch", session_id, current_fingerprint)
                return None

        # Update last activity
        self.update_session_activity(session_id)

        return session_data

    def update_session_activity(self, session_id: str):
        """Update session last activity time."""
        session_data = self.get_session(session_id)
        if session_data:
            session_data.last_activity = time.time()
            session_key = f"session:{session_id}"
            encrypted_data = self._encrypt_session_data(session_data.dict())

            # Extend TTL
            self.redis.setex(
                session_key,
                SessionConfig.SESSION_MAX_AGE,
                encrypted_data
            )

    def invalidate_session(self, session_id: str):
        """Invalidate session."""
        session_data = self.get_session(session_id)
        if session_data:
            # Remove from user sessions
            user_sessions_key = f"user_sessions:{session_data.user_id}"
            self.redis.srem(user_sessions_key, session_id)

        # Delete session
        session_key = f"session:{session_id}"
        self.redis.delete(session_key)

        # Add to blacklist (for JWT invalidation)
        blacklist_key = f"session_blacklist:{session_id}"
        self.redis.setex(blacklist_key, SessionConfig.SESSION_MAX_AGE, "1")

    def invalidate_user_sessions(self, user_id: str):
        """Invalidate all sessions for a user."""
        user_sessions_key = f"user_sessions:{user_id}"
        session_ids = self.redis.smembers(user_sessions_key)

        for session_id in session_ids:
            self.invalidate_session(session_id)

    def _log_security_event(self, event_type: str, session_id: str, details: str):
        """Log security events."""
        event = {
            "type": event_type,
            "session_id": session_id,
            "details": details,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

        # Store in Redis for monitoring
        event_key = f"security_events:{event_type}"
        self.redis.lpush(event_key, json.dumps(event))
        self.redis.ltrim(event_key, 0, 999)  # Keep last 1000 events
        self.redis.expire(event_key, 86400)  # 24 hours

    # JWT Token Management
    def create_access_token(self, session_data: SessionData) -> str:
        """Create JWT access token."""
        jti = str(uuid.uuid4())
        expires_delta = timedelta(minutes=SessionConfig.ACCESS_TOKEN_EXPIRE_MINUTES)
        expire = datetime.now(timezone.utc) + expires_delta

        token_data = TokenData(
            username=session_data.username,
            user_id=session_data.user_id,
            role=session_data.role,
            session_id=session_data.session_id,
            exp=expire.timestamp(),
            jti=jti
        )

        encoded_jwt = jwt.encode(
            token_data.dict(),
            SessionConfig.SECRET_KEY,
            algorithm=SessionConfig.ALGORITHM
        )

        # Store JTI for revocation
        jti_key = f"jwt_jti:{jti}"
        self.redis.setex(
            jti_key,
            int(expires_delta.total_seconds()),
            session_data.session_id
        )

        return encoded_jwt

    def create_refresh_token(self, session_data: SessionData) -> str:
        """Create refresh token."""
        refresh_token = secrets.token_urlsafe(32)
        refresh_key = f"refresh_token:{refresh_token}"

        expires_delta = timedelta(days=SessionConfig.REFRESH_TOKEN_EXPIRE_DAYS)
        expire_time = int(expires_delta.total_seconds())

        refresh_data = {
            "session_id": session_data.session_id,
            "user_id": session_data.user_id,
            "created_at": time.time()
        }

        self.redis.setex(
            refresh_key,
            expire_time,
            json.dumps(refresh_data)
        )

        return refresh_token

    def validate_access_token(self, token: str) -> Optional[TokenData]:
        """Validate JWT access token."""
        try:
            payload = jwt.decode(
                token,
                SessionConfig.SECRET_KEY,
                algorithms=[SessionConfig.ALGORITHM]
            )

            token_data = TokenData(**payload)

            # Check if JTI is blacklisted
            jti_key = f"jwt_jti:{token_data.jti}"
            if not self.redis.exists(jti_key):
                return None

            # Check if session is blacklisted
            blacklist_key = f"session_blacklist:{token_data.session_id}"
            if self.redis.exists(blacklist_key):
                return None

            # Validate session exists
            session = self.get_session(token_data.session_id)
            if not session:
                return None

            return token_data

        except JWTError:
            return None

    def refresh_access_token(self, refresh_token: str) -> Optional[tuple[str, str]]:
        """Refresh access token using refresh token."""
        refresh_key = f"refresh_token:{refresh_token}"
        refresh_data_str = self.redis.get(refresh_key)

        if not refresh_data_str:
            return None

        refresh_data = json.loads(refresh_data_str)
        session = self.get_session(refresh_data["session_id"])

        if not session:
            return None

        # Create new access token
        new_access_token = self.create_access_token(session)

        # Rotate refresh token
        self.redis.delete(refresh_key)
        new_refresh_token = self.create_refresh_token(session)

        return new_access_token, new_refresh_token

    def revoke_token(self, jti: str):
        """Revoke JWT token."""
        jti_key = f"jwt_jti:{jti}"
        self.redis.delete(jti_key)