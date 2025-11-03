"""Cache decorators for FastAPI endpoints"""
import asyncio
import functools
import hashlib
import inspect
import json
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional, List
from fastapi import Request, Response

from .enterprise_cache_manager import (
    EnterpriseCacheManager,
    CachePolicy,
    CachePolicyFactory,
    CacheStrategy,
    CacheLevel
)

# Global cache manager instance
_cache_manager: Optional[EnterpriseCacheManager] = None

@dataclass
class CacheConfig:
    """Configuration for cache decorators"""
    ttl: int = 300  # Default 5 minutes
    key_prefix: str = ""
    key_params: List[str] = None  # Which parameters to include in cache key
    invalidate_patterns: List[str] = None
    endpoint_type: str = "api_responses"
    data_volatility: str = "medium"
    user_specific: bool = False
    warm_on_startup: bool = False
    compress: bool = True
    encrypt: bool = False

def set_cache_manager(manager: EnterpriseCacheManager):
    """Set the global cache manager instance"""
    global _cache_manager
    _cache_manager = manager

def get_cache_manager() -> EnterpriseCacheManager:
    """Get the global cache manager instance"""
    if _cache_manager is None:
        raise RuntimeError("Cache manager not initialized. Call set_cache_manager() first.")
    return _cache_manager

def cached_response(config: CacheConfig = CacheConfig()):
    """
    Decorator for caching API responses

    Example:
        @app.get("/api/data")
        @cached_response(CacheConfig(ttl=600, endpoint_type="api_responses"))
        async def get_data(request: Request, user_id: str):
            return {"data": "expensive_computation"}
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            cache_manager = get_cache_manager()

            # Extract request object
            request = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break
            if not request:
                for value in kwargs.values():
                    if isinstance(value, Request):
                        request = value
                        break

            # Generate cache key
            cache_key = await _generate_cache_key(func, args, kwargs, config, request)

            # Try to get from cache
            cached_value = await cache_manager.get(cache_key)
            if cached_value is not None:
                # Set cache hit headers
                if request:
                    response = Response(content=json.dumps(cached_value), media_type="application/json")
                    response.headers["X-Cache-Hit"] = "true"
                    response.headers["X-Cache-Key"] = cache_key
                    return cached_value
                return cached_value

            # Execute function
            result = await func(*args, **kwargs) if inspect.iscoroutinefunction(func) else func(*args, **kwargs)

            # Create cache policy
            policy = CachePolicyFactory.create_policy(config.endpoint_type, config.data_volatility)
            policy.ttl = config.ttl
            policy.compression_enabled = config.compress
            policy.encryption_enabled = config.encrypt
            policy.invalidation_patterns = config.invalidate_patterns or []

            # Store in cache
            await cache_manager.set(cache_key, result, policy)

            # Set cache miss headers
            if request:
                response = Response(content=json.dumps(result), media_type="application/json")
                response.headers["X-Cache-Hit"] = "false"
                response.headers["X-Cache-Key"] = cache_key

            return result

        # Mark function for cache warming if configured
        if config.warm_on_startup:
            wrapper._warm_cache = True
            wrapper._warm_cache_config = config

        return wrapper

    return decorator

def invalidates_cache(patterns: List[str], cascade: bool = True):
    """
    Decorator to invalidate cache after successful execution

    Example:
        @app.post("/api/data")
        @invalidates_cache(["api:data:*", "api:summary:*"])
        async def update_data(request: Request, data: dict):
            # Update data
            return {"status": "updated"}
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # Execute function first
            result = await func(*args, **kwargs) if inspect.iscoroutinefunction(func) else func(*args, **kwargs)

            # Invalidate cache after successful execution
            cache_manager = get_cache_manager()

            # Process patterns (support dynamic pattern generation)
            processed_patterns = []
            for pattern in patterns:
                if callable(pattern):
                    # Pattern is a function, call it with result
                    processed_patterns.extend(pattern(result))
                else:
                    processed_patterns.append(pattern)

            # Perform invalidation
            invalidated_count = await cache_manager.invalidate(processed_patterns, cascade=cascade)

            # Add invalidation info to result if it's a dict
            if isinstance(result, dict):
                result["_cache_invalidated"] = invalidated_count

            return result

        return wrapper

    return decorator

def warms_cache(fetch_function: Optional[Callable] = None, config: CacheConfig = CacheConfig()):
    """
    Decorator to warm cache proactively

    Example:
        @app.on_event("startup")
        @warms_cache(config=CacheConfig(endpoint_type="static_content"))
        async def warm_static_cache():
            # Warm critical cache entries
            pass
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            cache_manager = get_cache_manager()

            # Execute the wrapped function to get warming targets
            targets = await func(*args, **kwargs) if inspect.iscoroutinefunction(func) else func(*args, **kwargs)

            if not targets:
                return {"warmed": 0}

            # Warm cache for each target
            warmed_count = 0
            policy = CachePolicyFactory.create_policy(config.endpoint_type, config.data_volatility)

            for target in targets:
                if isinstance(target, dict):
                    key = target.get("key")
                    fetch_fn = target.get("fetch", fetch_function)

                    if key and fetch_fn:
                        success = await cache_manager.warm_cache(key, fetch_fn, policy)
                        if success:
                            warmed_count += 1

            return {"warmed": warmed_count, "total": len(targets)}

        return wrapper

    return decorator

async def _generate_cache_key(func: Callable, args: tuple, kwargs: dict,
                              config: CacheConfig, request: Optional[Request]) -> str:
    """Generate cache key from function signature and arguments"""

    # Start with function name and prefix
    key_parts = []

    if config.key_prefix:
        key_parts.append(config.key_prefix)
    else:
        key_parts.append(func.__module__)
        key_parts.append(func.__name__)

    # Add user-specific component if needed
    if config.user_specific and request:
        # Try to extract user ID from request
        user_id = None
        if hasattr(request, 'user'):
            user_id = getattr(request.user, 'id', None) or getattr(request.user, 'user_id', None)
        elif hasattr(request.state, 'user_id'):
            user_id = request.state.user_id

        if user_id:
            key_parts.append(f"user:{user_id}")

    # Process function arguments
    sig = inspect.signature(func)
    bound_args = sig.bind(*args, **kwargs)
    bound_args.apply_defaults()

    # Filter parameters based on config
    if config.key_params:
        # Only include specified parameters
        for param_name in config.key_params:
            if param_name in bound_args.arguments:
                value = bound_args.arguments[param_name]
                key_parts.append(f"{param_name}:{_serialize_value(value)}")
    else:
        # Include all non-request parameters
        for param_name, value in bound_args.arguments.items():
            if not isinstance(value, (Request, Response)):
                key_parts.append(f"{param_name}:{_serialize_value(value)}")

    # Add query parameters if present
    if request and request.query_params:
        query_str = str(sorted(request.query_params.items()))
        key_parts.append(f"query:{hashlib.md5(query_str.encode()).hexdigest()}")

    # Join parts with separator
    cache_key = ":".join(key_parts)

    # Ensure key length is reasonable
    if len(cache_key) > 250:  # Redis key limit
        # Hash the key if too long
        cache_key = f"{':'.join(key_parts[:3])}:{hashlib.sha256(cache_key.encode()).hexdigest()}"

    return cache_key

def _serialize_value(value: Any) -> str:
    """Serialize value for cache key generation"""
    if value is None:
        return "none"
    elif isinstance(value, (str, int, float, bool)):
        return str(value)
    elif isinstance(value, (list, tuple)):
        return hashlib.md5(json.dumps(value, sort_keys=True, default=str).encode()).hexdigest()[:8]
    elif isinstance(value, dict):
        return hashlib.md5(json.dumps(value, sort_keys=True, default=str).encode()).hexdigest()[:8]
    else:
        # For complex objects, use hash of string representation
        return hashlib.md5(str(value).encode()).hexdigest()[:8]

class CacheMiddleware:
    """FastAPI middleware for cache management"""

    def __init__(self, cache_manager: EnterpriseCacheManager):
        self.cache_manager = cache_manager
        set_cache_manager(cache_manager)

    async def __call__(self, request: Request, call_next):
        # Add cache headers
        response = await call_next(request)

        # Add standard cache headers
        if hasattr(response, 'headers'):
            response.headers["X-Cache-Version"] = "1.0"
            response.headers["X-Cache-Provider"] = "EnterpriseCacheManager"

        return response

def conditional_cache(condition_func: Callable[[Request], bool],
                     config: CacheConfig = CacheConfig()):
    """
    Conditional caching based on runtime conditions

    Example:
        def should_cache(request: Request) -> bool:
            return request.headers.get("X-Cache-Control") != "no-cache"

        @app.get("/api/data")
        @conditional_cache(should_cache, CacheConfig(ttl=600))
        async def get_data(request: Request):
            return {"data": "value"}
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract request
            request = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break

            # Check condition
            if request and condition_func(request):
                # Apply caching
                cached_func = cached_response(config)(func)
                return await cached_func(*args, **kwargs)
            else:
                # Bypass cache
                return await func(*args, **kwargs) if inspect.iscoroutinefunction(func) else func(*args, **kwargs)

        return wrapper

    return decorator

def rate_limit_cache(max_requests: int = 100, window: int = 60,
                    config: CacheConfig = CacheConfig()):
    """
    Cache with rate limiting per user/IP

    Example:
        @app.get("/api/expensive")
        @rate_limit_cache(max_requests=10, window=60)  # 10 requests per minute
        async def expensive_operation(request: Request):
            return {"result": "expensive"}
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            cache_manager = get_cache_manager()

            # Extract request and identify client
            request = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break

            if request:
                # Get client identifier (IP or user ID)
                client_id = request.client.host if request.client else "unknown"
                if hasattr(request, 'user') and hasattr(request.user, 'id'):
                    client_id = f"user:{request.user.id}"

                # Check rate limit
                rate_key = f"rate_limit:{func.__name__}:{client_id}"
                count = await cache_manager.get(rate_key)

                if count and int(count) >= max_requests:
                    # Rate limit exceeded
                    return {"error": "Rate limit exceeded", "retry_after": window}

                # Increment counter
                new_count = int(count) + 1 if count else 1
                await cache_manager.set(
                    rate_key,
                    new_count,
                    CachePolicy(ttl=window, strategy=CacheStrategy.LRU,
                               levels=[CacheLevel.L1_MEMORY, CacheLevel.L2_REDIS])
                )

            # Apply caching with rate limit context
            cached_func = cached_response(config)(func)
            return await cached_func(*args, **kwargs)

        return wrapper

    return decorator