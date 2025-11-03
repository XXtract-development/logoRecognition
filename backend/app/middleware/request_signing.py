"""
Request signing middleware for API security.
Implements HMAC-SHA256 signing for request integrity and authentication.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from datetime import datetime, timezone
from typing import Optional, Tuple

from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class RequestSigningConfig:
    """Configuration for request signing."""

    # Signing algorithm
    ALGORITHM = "HMAC-SHA256"

    # Time window for request validity (seconds)
    REQUEST_VALIDITY_WINDOW = 300  # 5 minutes

    # Required headers
    SIGNATURE_HEADER = "X-Signature"
    TIMESTAMP_HEADER = "X-Timestamp"
    NONCE_HEADER = "X-Nonce"
    API_KEY_HEADER = "X-API-Key"

    # Endpoints requiring signing
    PROTECTED_ENDPOINTS = [
        "/api/v1/training/jobs",
        "/api/v1/models/*/activate",
        "/api/v1/training/annotations",
        "/api/v1/recognize",
    ]

    # Skip signing for these methods
    SKIP_METHODS = ["GET", "HEAD", "OPTIONS"]


class RequestSigner:
    """Handles request signing and verification."""

    def __init__(self, secret_key: str):
        self.secret_key = secret_key.encode()
        self.used_nonces = {}  # In production, use Redis

    def _clean_old_nonces(self):
        """Remove expired nonces."""
        current_time = time.time()
        expired = [
            nonce for nonce, timestamp in self.used_nonces.items()
            if current_time - timestamp > RequestSigningConfig.REQUEST_VALIDITY_WINDOW
        ]

        for nonce in expired:
            del self.used_nonces[nonce]

    def generate_signature(
        self,
        method: str,
        path: str,
        timestamp: str,
        nonce: str,
        body: bytes,
        api_key: str
    ) -> str:
        """Generate HMAC-SHA256 signature for request."""
        # Create canonical string
        body_hash = hashlib.sha256(body).hexdigest() if body else ""

        canonical_parts = [
            method.upper(),
            path,
            timestamp,
            nonce,
            api_key,
            body_hash,
        ]

        canonical_string = "\n".join(canonical_parts)

        # Generate signature
        signature = hmac.new(
            self.secret_key,
            canonical_string.encode(),
            hashlib.sha256
        ).hexdigest()

        return signature

    def verify_signature(
        self,
        method: str,
        path: str,
        timestamp: str,
        nonce: str,
        body: bytes,
        api_key: str,
        provided_signature: str
    ) -> bool:
        """Verify request signature."""
        expected_signature = self.generate_signature(
            method,
            path,
            timestamp,
            nonce,
            body,
            api_key
        )

        return hmac.compare_digest(expected_signature, provided_signature)

    def validate_timestamp(self, timestamp: str) -> bool:
        """Validate request timestamp is within acceptable window."""
        try:
            request_time = float(timestamp)
            current_time = time.time()

            # Check if timestamp is within validity window
            time_diff = abs(current_time - request_time)
            return time_diff <= RequestSigningConfig.REQUEST_VALIDITY_WINDOW

        except (ValueError, TypeError):
            return False

    def validate_nonce(self, nonce: str, timestamp: str) -> bool:
        """Validate nonce hasn't been used before."""
        self._clean_old_nonces()

        if nonce in self.used_nonces:
            return False

        # Store nonce with timestamp
        self.used_nonces[nonce] = float(timestamp)
        return True

    def extract_headers(self, request: Request) -> Tuple[str, str, str, str]:
        """Extract signing headers from request."""
        signature = request.headers.get(RequestSigningConfig.SIGNATURE_HEADER, "")
        timestamp = request.headers.get(RequestSigningConfig.TIMESTAMP_HEADER, "")
        nonce = request.headers.get(RequestSigningConfig.NONCE_HEADER, "")
        api_key = request.headers.get(RequestSigningConfig.API_KEY_HEADER, "")

        return signature, timestamp, nonce, api_key


class RequestSigningMiddleware(BaseHTTPMiddleware):
    """Middleware for request signing verification."""

    def __init__(self, app, secret_key: str = None):
        super().__init__(app)
        secret_key = secret_key or "your-secret-key-here"  # Should come from env
        self.signer = RequestSigner(secret_key)

    def _should_verify_signature(self, request: Request) -> bool:
        """Check if request should have signature verified."""
        # Skip verification for non-protected endpoints
        path = request.url.path

        # Check if path matches protected patterns
        for pattern in RequestSigningConfig.PROTECTED_ENDPOINTS:
            if "*" in pattern:
                # Handle wildcard patterns
                pattern_parts = pattern.split("*")
                if all(part in path for part in pattern_parts if part):
                    break
            elif path.startswith(pattern):
                break
        else:
            return False

        # Skip for certain methods
        if request.method in RequestSigningConfig.SKIP_METHODS:
            return False

        return True

    async def dispatch(self, request: Request, call_next):
        """Process request with signature verification."""
        # Check if signature verification is needed
        if not self._should_verify_signature(request):
            return await call_next(request)

        # Extract headers
        signature, timestamp, nonce, api_key = self.signer.extract_headers(request)

        # Validate required headers
        if not all([signature, timestamp, nonce, api_key]):
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "error": "Missing required signing headers",
                    "required_headers": [
                        RequestSigningConfig.SIGNATURE_HEADER,
                        RequestSigningConfig.TIMESTAMP_HEADER,
                        RequestSigningConfig.NONCE_HEADER,
                        RequestSigningConfig.API_KEY_HEADER,
                    ],
                },
            )

        # Validate timestamp
        if not self.signer.validate_timestamp(timestamp):
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "error": "Request expired or invalid timestamp",
                    "message": "Request timestamp is outside the acceptable window",
                },
            )

        # Validate nonce
        if not self.signer.validate_nonce(nonce, timestamp):
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "error": "Invalid or reused nonce",
                    "message": "Each request must have a unique nonce",
                },
            )

        # Get request body for signature verification
        body = await request.body()

        # Verify signature
        if not self.signer.verify_signature(
            request.method,
            request.url.path,
            timestamp,
            nonce,
            body,
            api_key,
            signature
        ):
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "error": "Invalid signature",
                    "message": "Request signature verification failed",
                },
            )

        # Store body for later use (since we've already read it)
        request._body = body

        # Process request
        response = await call_next(request)

        # Add signature to response if configured
        response.headers["X-Request-Id"] = nonce
        response.headers["X-Timestamp"] = str(time.time())

        return response


# API Key Management
class APIKeyManager:
    """Manages API keys and their permissions."""

    def __init__(self, redis_url: str = "redis://localhost:6379"):
        import redis
        self.redis = redis.from_url(redis_url, decode_responses=True)

    def create_api_key(
        self,
        user_id: str,
        name: str,
        permissions: list[str],
        rate_limit_tier: str = "basic"
    ) -> dict:
        """Create new API key."""
        import secrets
        import uuid

        api_key_id = str(uuid.uuid4())
        api_key_secret = secrets.token_urlsafe(32)
        api_key_full = f"{api_key_id}:{api_key_secret}"

        # Hash the secret for storage
        secret_hash = hashlib.sha256(api_key_secret.encode()).hexdigest()

        key_data = {
            "id": api_key_id,
            "user_id": user_id,
            "name": name,
            "secret_hash": secret_hash,
            "permissions": json.dumps(permissions),
            "rate_limit_tier": rate_limit_tier,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_used": None,
            "active": True,
        }

        # Store in Redis
        key_redis = f"api_key:{api_key_id}"
        self.redis.hset(key_redis, mapping=key_data)

        # Track user's API keys
        user_keys = f"user_api_keys:{user_id}"
        self.redis.sadd(user_keys, api_key_id)

        return {
            "api_key": api_key_full,
            "api_key_id": api_key_id,
            "name": name,
            "permissions": permissions,
            "created_at": key_data["created_at"],
            "note": "Store this API key securely. It won't be shown again.",
        }

    def validate_api_key(self, api_key: str) -> Optional[dict]:
        """Validate API key and return associated data."""
        try:
            api_key_id, api_key_secret = api_key.split(":")
        except ValueError:
            return None

        # Get key data from Redis
        key_redis = f"api_key:{api_key_id}"
        key_data = self.redis.hgetall(key_redis)

        if not key_data:
            return None

        # Check if key is active
        if key_data.get("active") != "True":
            return None

        # Verify secret
        secret_hash = hashlib.sha256(api_key_secret.encode()).hexdigest()
        if not hmac.compare_digest(secret_hash, key_data.get("secret_hash", "")):
            return None

        # Update last used
        self.redis.hset(
            key_redis,
            "last_used",
            datetime.now(timezone.utc).isoformat()
        )

        return {
            "id": api_key_id,
            "user_id": key_data.get("user_id"),
            "name": key_data.get("name"),
            "permissions": json.loads(key_data.get("permissions", "[]")),
            "rate_limit_tier": key_data.get("rate_limit_tier", "basic"),
        }

    def revoke_api_key(self, api_key_id: str, user_id: str) -> bool:
        """Revoke API key."""
        key_redis = f"api_key:{api_key_id}"
        key_data = self.redis.hgetall(key_redis)

        if not key_data or key_data.get("user_id") != user_id:
            return False

        # Mark as inactive
        self.redis.hset(key_redis, "active", False)
        self.redis.hset(
            key_redis,
            "revoked_at",
            datetime.now(timezone.utc).isoformat()
        )

        # Remove from user's keys
        user_keys = f"user_api_keys:{user_id}"
        self.redis.srem(user_keys, api_key_id)

        return True

    def list_user_api_keys(self, user_id: str) -> list[dict]:
        """List all API keys for a user."""
        user_keys = f"user_api_keys:{user_id}"
        key_ids = self.redis.smembers(user_keys)

        keys = []
        for key_id in key_ids:
            key_redis = f"api_key:{key_id}"
            key_data = self.redis.hgetall(key_redis)

            if key_data and key_data.get("active") == "True":
                keys.append({
                    "id": key_id,
                    "name": key_data.get("name"),
                    "created_at": key_data.get("created_at"),
                    "last_used": key_data.get("last_used"),
                    "permissions": json.loads(key_data.get("permissions", "[]")),
                })

        return sorted(keys, key=lambda x: x["created_at"], reverse=True)