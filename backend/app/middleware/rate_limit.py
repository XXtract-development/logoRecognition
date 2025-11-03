"""
US-INT-002: Rate Limiting Middleware
Rate limit: 100 requests/minute per user
"""

import time
from typing import Dict, Callable
from collections import defaultdict, deque
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from datetime import datetime, timedelta


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Rate limiting middleware using sliding window algorithm

    Limits: 100 requests per minute per user/IP
    """

    def __init__(self, app, requests_per_minute: int = 100):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.window_seconds = 60
        # Store request timestamps per client
        self.request_history: Dict[str, deque] = defaultdict(lambda: deque())

    def get_client_identifier(self, request: Request) -> str:
        """Get unique identifier for client (user_id or IP)"""

        # Try to get user_id from JWT token (will be added in US-INT-002)
        user_id = request.state.__dict__.get('user_id', None)

        if user_id:
            return f"user:{user_id}"

        # Fall back to IP address
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return f"ip:{forwarded.split(',')[0]}"

        client_host = request.client.host if request.client else "unknown"
        return f"ip:{client_host}"

    def is_rate_limited(self, client_id: str) -> tuple[bool, int]:
        """
        Check if client has exceeded rate limit

        Returns:
            (is_limited, remaining_requests)
        """
        now = time.time()
        window_start = now - self.window_seconds

        # Get request history for this client
        history = self.request_history[client_id]

        # Remove timestamps outside the window
        while history and history[0] < window_start:
            history.popleft()

        # Check if limit exceeded
        if len(history) >= self.requests_per_minute:
            return True, 0

        # Add current request timestamp
        history.append(now)

        remaining = self.requests_per_minute - len(history)
        return False, remaining

    async def dispatch(self, request: Request, call_next: Callable):
        """Process request with rate limiting"""

        # Skip rate limiting for health check endpoints
        if request.url.path.endswith("/health"):
            return await call_next(request)

        # Get client identifier
        client_id = self.get_client_identifier(request)

        # Check rate limit
        is_limited, remaining = self.is_rate_limited(client_id)

        if is_limited:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": "Rate limit exceeded",
                    "message": f"Maximum {self.requests_per_minute} requests per minute allowed",
                    "retry_after": self.window_seconds,
                    "client_id": client_id.split(':')[0]  # Don't expose full ID
                },
                headers={
                    "X-RateLimit-Limit": str(self.requests_per_minute),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(time.time() + self.window_seconds)),
                    "Retry-After": str(self.window_seconds)
                }
            )

        # Process request
        response = await call_next(request)

        # Add rate limit headers to response
        response.headers["X-RateLimit-Limit"] = str(self.requests_per_minute)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(int(time.time() + self.window_seconds))

        return response


def cleanup_old_entries(rate_limiter: RateLimitMiddleware):
    """
    Background task to clean up old rate limit entries

    Should be called periodically (e.g., every 5 minutes) to prevent memory bloat
    """
    now = time.time()
    window_start = now - rate_limiter.window_seconds

    cleaned_count = 0

    for client_id in list(rate_limiter.request_history.keys()):
        history = rate_limiter.request_history[client_id]

        # Remove old timestamps
        while history and history[0] < window_start:
            history.popleft()

        # Remove empty histories
        if not history:
            del rate_limiter.request_history[client_id]
            cleaned_count += 1

    return cleaned_count
