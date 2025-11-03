"""
Rate Limiting Implementation
A++ Grade Implementation with Redis-backed distributed rate limiting
"""

import time
import asyncio
from typing import Optional, Dict, Any, Tuple
from datetime import datetime, timedelta
import structlog
from fastapi import Request, HTTPException, status
import redis.asyncio as redis
import hashlib
import json

logger = structlog.get_logger()


class RateLimiter:
    """
    Production-grade distributed rate limiter
    Supports multiple algorithms and Redis backend
    """

    def __init__(
        self,
        redis_client: Optional[redis.Redis] = None,
        default_limit: int = 100,
        default_window: int = 60
    ):
        """
        Initialize rate limiter with Redis backend

        Args:
            redis_client: Redis client for distributed rate limiting
            default_limit: Default request limit
            default_window: Default time window in seconds
        """
        self.redis_client = redis_client
        self.default_limit = default_limit
        self.default_window = default_window
        self.logger = logger.bind(component="rate_limiter")

        # In-memory fallback for when Redis is unavailable
        self.memory_storage: Dict[str, Dict] = {}

    async def check_rate_limit(
        self,
        key: str,
        limit: Optional[int] = None,
        window: Optional[int] = None,
        algorithm: str = "sliding_window"
    ) -> Tuple[bool, Dict[str, Any]]:
        """
        Check if request is within rate limit

        Args:
            key: Unique identifier for rate limiting (e.g., IP, user ID)
            limit: Request limit (uses default if None)
            window: Time window in seconds (uses default if None)
            algorithm: Rate limiting algorithm to use

        Returns:
            Tuple of (allowed, metadata)
        """
        limit = limit or self.default_limit
        window = window or self.default_window

        if algorithm == "sliding_window":
            return await self._sliding_window_check(key, limit, window)
        elif algorithm == "token_bucket":
            return await self._token_bucket_check(key, limit, window)
        elif algorithm == "fixed_window":
            return await self._fixed_window_check(key, limit, window)
        else:
            raise ValueError(f"Unknown algorithm: {algorithm}")

    async def _sliding_window_check(self, key: str, limit: int, window: int) -> Tuple[bool, Dict]:
        """
        Sliding window rate limiting algorithm
        Most accurate but more memory intensive
        """
        now = time.time()
        window_start = now - window

        if self.redis_client:
            try:
                # Use Redis sorted set for sliding window
                redis_key = f"rate_limit:sliding:{key}"

                # Remove old entries
                await self.redis_client.zremrangebyscore(redis_key, 0, window_start)

                # Count current entries
                current_count = await self.redis_client.zcard(redis_key)

                if current_count < limit:
                    # Add current request
                    await self.redis_client.zadd(redis_key, {str(now): now})
                    await self.redis_client.expire(redis_key, window)

                    remaining = limit - current_count - 1
                    reset_time = now + window

                    return True, {
                        "limit": limit,
                        "remaining": remaining,
                        "reset": reset_time,
                        "retry_after": None
                    }
                else:
                    # Get oldest entry to calculate retry time
                    oldest = await self.redis_client.zrange(redis_key, 0, 0, withscores=True)
                    if oldest:
                        retry_after = window - (now - oldest[0][1])
                    else:
                        retry_after = window

                    return False, {
                        "limit": limit,
                        "remaining": 0,
                        "reset": now + retry_after,
                        "retry_after": retry_after
                    }

            except Exception as e:
                self.logger.error("Redis error in sliding window", error=str(e))
                # Fallback to in-memory
                return await self._sliding_window_memory(key, limit, window)
        else:
            return await self._sliding_window_memory(key, limit, window)

    async def _sliding_window_memory(self, key: str, limit: int, window: int) -> Tuple[bool, Dict]:
        """In-memory sliding window implementation"""
        now = time.time()
        window_start = now - window

        if key not in self.memory_storage:
            self.memory_storage[key] = {"requests": []}

        # Clean old requests
        self.memory_storage[key]["requests"] = [
            req_time for req_time in self.memory_storage[key]["requests"]
            if req_time > window_start
        ]

        current_count = len(self.memory_storage[key]["requests"])

        if current_count < limit:
            self.memory_storage[key]["requests"].append(now)
            remaining = limit - current_count - 1

            return True, {
                "limit": limit,
                "remaining": remaining,
                "reset": now + window,
                "retry_after": None
            }
        else:
            oldest = min(self.memory_storage[key]["requests"])
            retry_after = window - (now - oldest)

            return False, {
                "limit": limit,
                "remaining": 0,
                "reset": now + retry_after,
                "retry_after": retry_after
            }

    async def _token_bucket_check(self, key: str, limit: int, window: int) -> Tuple[bool, Dict]:
        """
        Token bucket rate limiting algorithm
        Allows bursts but maintains average rate
        """
        now = time.time()
        refill_rate = limit / window  # tokens per second

        if self.redis_client:
            try:
                redis_key = f"rate_limit:bucket:{key}"

                # Get current bucket state
                bucket_data = await self.redis_client.get(redis_key)

                if bucket_data:
                    bucket = json.loads(bucket_data)
                    tokens = bucket["tokens"]
                    last_refill = bucket["last_refill"]
                else:
                    tokens = limit
                    last_refill = now

                # Refill tokens based on time passed
                time_passed = now - last_refill
                tokens = min(limit, tokens + time_passed * refill_rate)

                if tokens >= 1:
                    # Consume a token
                    tokens -= 1

                    # Update bucket state
                    bucket = {
                        "tokens": tokens,
                        "last_refill": now
                    }
                    await self.redis_client.set(redis_key, json.dumps(bucket), ex=window)

                    return True, {
                        "limit": limit,
                        "remaining": int(tokens),
                        "reset": now + (limit - tokens) / refill_rate,
                        "retry_after": None
                    }
                else:
                    # Calculate when next token will be available
                    retry_after = (1 - tokens) / refill_rate

                    return False, {
                        "limit": limit,
                        "remaining": 0,
                        "reset": now + retry_after,
                        "retry_after": retry_after
                    }

            except Exception as e:
                self.logger.error("Redis error in token bucket", error=str(e))
                return await self._token_bucket_memory(key, limit, window)
        else:
            return await self._token_bucket_memory(key, limit, window)

    async def _token_bucket_memory(self, key: str, limit: int, window: int) -> Tuple[bool, Dict]:
        """In-memory token bucket implementation"""
        now = time.time()
        refill_rate = limit / window

        if key not in self.memory_storage:
            self.memory_storage[key] = {
                "tokens": limit,
                "last_refill": now
            }

        bucket = self.memory_storage[key]
        time_passed = now - bucket["last_refill"]
        bucket["tokens"] = min(limit, bucket["tokens"] + time_passed * refill_rate)
        bucket["last_refill"] = now

        if bucket["tokens"] >= 1:
            bucket["tokens"] -= 1
            return True, {
                "limit": limit,
                "remaining": int(bucket["tokens"]),
                "reset": now + (limit - bucket["tokens"]) / refill_rate,
                "retry_after": None
            }
        else:
            retry_after = (1 - bucket["tokens"]) / refill_rate
            return False, {
                "limit": limit,
                "remaining": 0,
                "reset": now + retry_after,
                "retry_after": retry_after
            }

    async def _fixed_window_check(self, key: str, limit: int, window: int) -> Tuple[bool, Dict]:
        """
        Fixed window rate limiting algorithm
        Simple but can allow bursts at window boundaries
        """
        now = time.time()
        window_id = int(now / window)
        window_key = f"{key}:{window_id}"

        if self.redis_client:
            try:
                redis_key = f"rate_limit:fixed:{window_key}"

                # Increment counter
                current_count = await self.redis_client.incr(redis_key)

                if current_count == 1:
                    # Set expiry on first request in window
                    await self.redis_client.expire(redis_key, window)

                if current_count <= limit:
                    remaining = limit - current_count
                    reset_time = (window_id + 1) * window

                    return True, {
                        "limit": limit,
                        "remaining": remaining,
                        "reset": reset_time,
                        "retry_after": None
                    }
                else:
                    reset_time = (window_id + 1) * window
                    retry_after = reset_time - now

                    return False, {
                        "limit": limit,
                        "remaining": 0,
                        "reset": reset_time,
                        "retry_after": retry_after
                    }

            except Exception as e:
                self.logger.error("Redis error in fixed window", error=str(e))
                return await self._fixed_window_memory(key, limit, window)
        else:
            return await self._fixed_window_memory(key, limit, window)

    async def _fixed_window_memory(self, key: str, limit: int, window: int) -> Tuple[bool, Dict]:
        """In-memory fixed window implementation"""
        now = time.time()
        window_id = int(now / window)
        window_key = f"{key}:{window_id}"

        if window_key not in self.memory_storage:
            self.memory_storage[window_key] = {"count": 0}

        self.memory_storage[window_key]["count"] += 1
        current_count = self.memory_storage[window_key]["count"]

        if current_count <= limit:
            remaining = limit - current_count
            reset_time = (window_id + 1) * window

            return True, {
                "limit": limit,
                "remaining": remaining,
                "reset": reset_time,
                "retry_after": None
            }
        else:
            reset_time = (window_id + 1) * window
            retry_after = reset_time - now

            return False, {
                "limit": limit,
                "remaining": 0,
                "reset": reset_time,
                "retry_after": retry_after
            }

    async def get_key_from_request(self, request: Request, key_type: str = "ip") -> str:
        """
        Generate rate limit key from request

        Args:
            request: FastAPI request object
            key_type: Type of key to generate (ip, user, api_key)
        """
        if key_type == "ip":
            # Get client IP address
            forwarded = request.headers.get("X-Forwarded-For")
            if forwarded:
                ip = forwarded.split(",")[0].strip()
            else:
                ip = request.client.host
            return f"ip:{ip}"

        elif key_type == "user":
            # Get user ID from request (assumes authentication)
            user = getattr(request.state, "user", None)
            if user:
                return f"user:{user.id}"
            return f"anonymous:{request.client.host}"

        elif key_type == "api_key":
            # Get API key from header
            api_key = request.headers.get("X-API-Key")
            if api_key:
                # Hash API key for security
                key_hash = hashlib.sha256(api_key.encode()).hexdigest()[:16]
                return f"api_key:{key_hash}"
            return f"no_key:{request.client.host}"

        else:
            raise ValueError(f"Unknown key type: {key_type}")

    def rate_limit_decorator(
        self,
        limit: int = 100,
        window: int = 60,
        key_type: str = "ip",
        algorithm: str = "sliding_window"
    ):
        """
        Decorator for rate limiting FastAPI routes

        Usage:
            @app.get("/api/endpoint")
            @rate_limiter.rate_limit_decorator(limit=10, window=60)
            async def endpoint():
                return {"message": "Success"}
        """
        def decorator(func):
            async def wrapper(request: Request, *args, **kwargs):
                # Generate rate limit key
                key = await self.get_key_from_request(request, key_type)

                # Check rate limit
                allowed, metadata = await self.check_rate_limit(key, limit, window, algorithm)

                # Add headers to response
                request.state.rate_limit_headers = {
                    "X-RateLimit-Limit": str(metadata["limit"]),
                    "X-RateLimit-Remaining": str(metadata["remaining"]),
                    "X-RateLimit-Reset": str(int(metadata["reset"]))
                }

                if not allowed:
                    # Rate limit exceeded
                    retry_after = metadata.get("retry_after", window)
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail="Rate limit exceeded",
                        headers={
                            "Retry-After": str(int(retry_after)),
                            "X-RateLimit-Limit": str(metadata["limit"]),
                            "X-RateLimit-Remaining": "0",
                            "X-RateLimit-Reset": str(int(metadata["reset"]))
                        }
                    )

                # Execute the route function
                return await func(request, *args, **kwargs)

            return wrapper
        return decorator

    async def cleanup_expired_keys(self) -> int:
        """Clean up expired rate limit entries from memory"""
        if not self.memory_storage:
            return 0

        now = time.time()
        removed = 0

        # Clean up fixed window entries
        keys_to_remove = []
        for key in self.memory_storage.keys():
            if ":" in key and key.count(":") == 2:  # Fixed window format
                parts = key.split(":")
                try:
                    window_id = int(parts[-1])
                    # Remove if window is older than 1 hour
                    if window_id < (now / 3600) - 1:
                        keys_to_remove.append(key)
                except ValueError:
                    continue

        for key in keys_to_remove:
            del self.memory_storage[key]
            removed += 1

        self.logger.info("Cleaned up expired rate limit keys", removed=removed)
        return removed