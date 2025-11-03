"""
Rate limiting middleware for API endpoints.
Implements token bucket algorithm with Redis backend for distributed rate limiting.
"""

from __future__ import annotations

import hashlib
import time
from typing import Optional, Tuple
from enum import Enum

import redis
from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class RateLimitTier(Enum):
    """Rate limit tiers for different user types."""

    ANONYMOUS = "anonymous"
    BASIC = "basic"
    PREMIUM = "premium"
    ENTERPRISE = "enterprise"
    ADMIN = "admin"


class RateLimitConfig:
    """Configuration for rate limiting."""

    TIERS = {
        RateLimitTier.ANONYMOUS: {
            "requests_per_minute": 20,
            "requests_per_hour": 100,
            "burst_size": 5,
        },
        RateLimitTier.BASIC: {
            "requests_per_minute": 60,
            "requests_per_hour": 1000,
            "burst_size": 10,
        },
        RateLimitTier.PREMIUM: {
            "requests_per_minute": 200,
            "requests_per_hour": 5000,
            "burst_size": 20,
        },
        RateLimitTier.ENTERPRISE: {
            "requests_per_minute": 1000,
            "requests_per_hour": 50000,
            "burst_size": 50,
        },
        RateLimitTier.ADMIN: {
            "requests_per_minute": float('inf'),
            "requests_per_hour": float('inf'),
            "burst_size": float('inf'),
        },
    }

    # Endpoint-specific limits
    ENDPOINT_LIMITS = {
        "/api/v1/training/jobs": {
            "requests_per_minute": 5,
            "requests_per_hour": 20,
        },
        "/api/v1/models/*/activate": {
            "requests_per_minute": 2,
            "requests_per_hour": 10,
        },
        "/api/v1/recognize": {
            "requests_per_minute": 100,
            "requests_per_hour": 2000,
        },
    }

    # Global limits
    GLOBAL_LIMIT = {
        "requests_per_second": 100,
        "concurrent_connections": 1000,
    }


class TokenBucket:
    """Token bucket implementation for rate limiting."""

    def __init__(
        self,
        redis_client: redis.Redis,
        key: str,
        capacity: int,
        refill_rate: float,
        ttl: int = 3600
    ):
        self.redis = redis_client
        self.key = key
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.ttl = ttl

    def consume(self, tokens: int = 1) -> Tuple[bool, int]:
        """
        Attempt to consume tokens from the bucket.

        Returns:
            Tuple of (success, remaining_tokens)
        """
        pipe = self.redis.pipeline()
        now = time.time()

        # Get current bucket state
        pipe.hgetall(self.key)
        result = pipe.execute()[0]

        if not result:
            # Initialize bucket
            bucket_state = {
                b'tokens': str(self.capacity).encode(),
                b'last_refill': str(now).encode(),
            }
        else:
            # Calculate tokens to add based on time passed
            last_refill = float(result.get(b'last_refill', now))
            current_tokens = float(result.get(b'tokens', self.capacity))

            time_passed = now - last_refill
            tokens_to_add = time_passed * self.refill_rate

            # Update token count (cap at capacity)
            new_tokens = min(current_tokens + tokens_to_add, self.capacity)

            bucket_state = {
                b'tokens': str(new_tokens).encode(),
                b'last_refill': str(now).encode(),
            }

        current_tokens = float(bucket_state[b'tokens'])

        if current_tokens >= tokens:
            # Consume tokens
            new_tokens = current_tokens - tokens
            bucket_state[b'tokens'] = str(new_tokens).encode()

            # Update bucket in Redis
            pipe = self.redis.pipeline()
            pipe.hset(self.key, mapping=bucket_state)
            pipe.expire(self.key, self.ttl)
            pipe.execute()

            return True, int(new_tokens)

        return False, int(current_tokens)


class RateLimiter:
    """Rate limiter with multiple strategies."""

    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis = redis.from_url(redis_url, decode_responses=False)
        self.config = RateLimitConfig()

    def _get_client_id(self, request: Request) -> str:
        """Generate unique client identifier."""
        # Try to get user ID from auth token
        user_id = getattr(request.state, "user_id", None)
        if user_id:
            return f"user:{user_id}"

        # Fall back to IP address
        client_ip = request.client.host
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            client_ip = forwarded_for.split(",")[0].strip()

        # Hash IP for privacy
        ip_hash = hashlib.sha256(client_ip.encode()).hexdigest()[:16]
        return f"ip:{ip_hash}"

    def _get_user_tier(self, request: Request) -> RateLimitTier:
        """Determine user's rate limit tier."""
        user = getattr(request.state, "user", None)
        if not user:
            return RateLimitTier.ANONYMOUS

        role = getattr(user, "role", "basic")
        tier_map = {
            "admin": RateLimitTier.ADMIN,
            "enterprise": RateLimitTier.ENTERPRISE,
            "premium": RateLimitTier.PREMIUM,
            "basic": RateLimitTier.BASIC,
        }

        return tier_map.get(role, RateLimitTier.BASIC)

    def _check_endpoint_limit(
        self,
        request: Request,
        client_id: str,
        endpoint: str
    ) -> Tuple[bool, Optional[int]]:
        """Check endpoint-specific rate limits."""
        # Check if endpoint has specific limits
        for pattern, limits in self.config.ENDPOINT_LIMITS.items():
            if pattern.replace("*", "") in endpoint:
                # Check per-minute limit
                bucket_key = f"ratelimit:endpoint:{client_id}:{endpoint}:minute"
                bucket = TokenBucket(
                    self.redis,
                    bucket_key,
                    limits["requests_per_minute"],
                    limits["requests_per_minute"] / 60.0,
                    ttl=60
                )

                allowed, remaining = bucket.consume()
                if not allowed:
                    return False, remaining

                # Check per-hour limit
                bucket_key = f"ratelimit:endpoint:{client_id}:{endpoint}:hour"
                bucket = TokenBucket(
                    self.redis,
                    bucket_key,
                    limits["requests_per_hour"],
                    limits["requests_per_hour"] / 3600.0,
                    ttl=3600
                )

                allowed, remaining = bucket.consume()
                if not allowed:
                    return False, remaining

        return True, None

    def check_rate_limit(self, request: Request) -> Tuple[bool, dict]:
        """
        Check if request is within rate limits.

        Returns:
            Tuple of (allowed, metadata)
        """
        client_id = self._get_client_id(request)
        tier = self._get_user_tier(request)
        tier_limits = self.config.TIERS[tier]

        # Skip rate limiting for admin tier with infinite limits
        if tier == RateLimitTier.ADMIN:
            return True, {"tier": tier.value, "unlimited": True}

        endpoint = request.url.path
        metadata = {
            "tier": tier.value,
            "client_id": client_id,
            "endpoint": endpoint,
        }

        # Check endpoint-specific limits first
        allowed, remaining = self._check_endpoint_limit(request, client_id, endpoint)
        if not allowed:
            metadata["remaining"] = remaining
            metadata["limit_type"] = "endpoint"
            return False, metadata

        # Check per-minute limit
        bucket_key = f"ratelimit:{client_id}:minute"
        bucket = TokenBucket(
            self.redis,
            bucket_key,
            tier_limits["requests_per_minute"],
            tier_limits["requests_per_minute"] / 60.0,
            ttl=60
        )

        allowed, remaining = bucket.consume()
        if not allowed:
            metadata["remaining"] = remaining
            metadata["limit_type"] = "per_minute"
            metadata["retry_after"] = 60 - (time.time() % 60)
            return False, metadata

        # Check per-hour limit
        bucket_key = f"ratelimit:{client_id}:hour"
        bucket = TokenBucket(
            self.redis,
            bucket_key,
            tier_limits["requests_per_hour"],
            tier_limits["requests_per_hour"] / 3600.0,
            ttl=3600
        )

        allowed, remaining = bucket.consume()
        if not allowed:
            metadata["remaining"] = remaining
            metadata["limit_type"] = "per_hour"
            metadata["retry_after"] = 3600 - (time.time() % 3600)
            return False, metadata

        # Check burst limit (sliding window)
        burst_key = f"ratelimit:{client_id}:burst"
        current_burst = self.redis.incr(burst_key)
        if current_burst == 1:
            self.redis.expire(burst_key, 1)

        if current_burst > tier_limits["burst_size"]:
            metadata["remaining"] = 0
            metadata["limit_type"] = "burst"
            metadata["retry_after"] = 1
            return False, metadata

        # Check global limits
        global_key = "ratelimit:global:second"
        global_count = self.redis.incr(global_key)
        if global_count == 1:
            self.redis.expire(global_key, 1)

        if global_count > self.config.GLOBAL_LIMIT["requests_per_second"]:
            metadata["remaining"] = 0
            metadata["limit_type"] = "global"
            metadata["retry_after"] = 1
            return False, metadata

        metadata["remaining"] = remaining
        metadata["requests_per_minute_remaining"] = remaining
        return True, metadata


class RateLimitMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware for rate limiting."""

    def __init__(self, app, redis_url: str = None):
        super().__init__(app)
        redis_url = redis_url or "redis://localhost:6379"
        self.rate_limiter = RateLimiter(redis_url)

    async def dispatch(self, request: Request, call_next):
        """Process request with rate limiting."""
        # Skip rate limiting for health checks
        if request.url.path in ["/health", "/metrics", "/docs", "/openapi.json"]:
            return await call_next(request)

        # Check rate limits
        allowed, metadata = self.rate_limiter.check_rate_limit(request)

        if not allowed:
            # Rate limit exceeded
            retry_after = metadata.get("retry_after", 60)

            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": "Rate limit exceeded",
                    "message": f"Too many requests. Please retry after {retry_after} seconds.",
                    "retry_after": retry_after,
                    "limit_type": metadata.get("limit_type"),
                    "tier": metadata.get("tier"),
                },
                headers={
                    "X-RateLimit-Limit": str(metadata.get("limit", "N/A")),
                    "X-RateLimit-Remaining": str(metadata.get("remaining", 0)),
                    "X-RateLimit-Reset": str(int(time.time() + retry_after)),
                    "Retry-After": str(int(retry_after)),
                },
            )

        # Process request
        response = await call_next(request)

        # Add rate limit headers to response
        response.headers["X-RateLimit-Remaining"] = str(metadata.get("remaining", "N/A"))
        response.headers["X-RateLimit-Tier"] = metadata.get("tier", "unknown")

        return response


# Circuit breaker implementation
class CircuitBreakerState(Enum):
    """Circuit breaker states."""

    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    """Circuit breaker for external service calls."""

    def __init__(
        self,
        redis_client: redis.Redis,
        service_name: str,
        failure_threshold: int = 5,
        recovery_timeout: int = 60,
        expected_exception: type = Exception,
    ):
        self.redis = redis_client
        self.service_name = service_name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exception = expected_exception

        self.state_key = f"circuit_breaker:{service_name}:state"
        self.failure_count_key = f"circuit_breaker:{service_name}:failures"
        self.last_failure_key = f"circuit_breaker:{service_name}:last_failure"

    def get_state(self) -> CircuitBreakerState:
        """Get current circuit breaker state."""
        state = self.redis.get(self.state_key)
        if not state:
            return CircuitBreakerState.CLOSED

        state_str = state.decode() if isinstance(state, bytes) else state

        # Check if we should transition from OPEN to HALF_OPEN
        if state_str == CircuitBreakerState.OPEN.value:
            last_failure = self.redis.get(self.last_failure_key)
            if last_failure:
                last_failure_time = float(last_failure)
                if time.time() - last_failure_time > self.recovery_timeout:
                    self.set_state(CircuitBreakerState.HALF_OPEN)
                    return CircuitBreakerState.HALF_OPEN

        return CircuitBreakerState(state_str)

    def set_state(self, state: CircuitBreakerState):
        """Set circuit breaker state."""
        self.redis.set(self.state_key, state.value, ex=self.recovery_timeout * 2)

        if state == CircuitBreakerState.CLOSED:
            # Reset failure count
            self.redis.delete(self.failure_count_key)

    def record_success(self):
        """Record successful call."""
        state = self.get_state()

        if state == CircuitBreakerState.HALF_OPEN:
            # Successful call in half-open state, close the circuit
            self.set_state(CircuitBreakerState.CLOSED)

    def record_failure(self):
        """Record failed call."""
        state = self.get_state()

        if state == CircuitBreakerState.HALF_OPEN:
            # Failed call in half-open state, open the circuit
            self.set_state(CircuitBreakerState.OPEN)
            self.redis.set(self.last_failure_key, time.time())
        elif state == CircuitBreakerState.CLOSED:
            # Increment failure count
            failures = self.redis.incr(self.failure_count_key)
            self.redis.expire(self.failure_count_key, self.recovery_timeout)

            if failures >= self.failure_threshold:
                # Open the circuit
                self.set_state(CircuitBreakerState.OPEN)
                self.redis.set(self.last_failure_key, time.time())

    def call(self, func, *args, **kwargs):
        """Execute function with circuit breaker protection."""
        state = self.get_state()

        if state == CircuitBreakerState.OPEN:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Service {self.service_name} is currently unavailable. Please try again later.",
            )

        try:
            result = func(*args, **kwargs)
            self.record_success()
            return result
        except self.expected_exception as e:
            self.record_failure()
            raise e