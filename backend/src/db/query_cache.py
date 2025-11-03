"""
Query Cache Layer for Database Optimization
Implements Redis-based caching with intelligent invalidation
"""

import json
import hashlib
import time
from typing import Any, Dict, Optional, List, Tuple
from datetime import datetime, timedelta
import redis
from functools import wraps
import logging

logger = logging.getLogger(__name__)


class QueryCache:
    """Redis-based query cache with intelligent invalidation"""

    def __init__(self, redis_host='localhost', redis_port=6379, redis_db=0,
                 default_ttl=900, max_cache_size_mb=100):
        """
        Initialize query cache

        Args:
            redis_host: Redis server host
            redis_port: Redis server port
            redis_db: Redis database number
            default_ttl: Default time-to-live in seconds (15 minutes)
            max_cache_size_mb: Maximum cache size in megabytes
        """
        self.redis_client = redis.StrictRedis(
            host=redis_host,
            port=redis_port,
            db=redis_db,
            decode_responses=True
        )
        self.default_ttl = default_ttl
        self.max_cache_size_mb = max_cache_size_mb * 1024 * 1024  # Convert to bytes
        self.cache_hits = 0
        self.cache_misses = 0
        self.cache_evictions = 0

        # Cache invalidation patterns
        self.invalidation_patterns = {}
        self.dependency_graph = {}

        # Initialize cache
        self._init_cache()

    def _init_cache(self):
        """Initialize cache and set up monitoring"""
        try:
            self.redis_client.ping()
            logger.info("Query cache connected to Redis")
        except redis.ConnectionError:
            logger.error("Failed to connect to Redis")
            raise

    def _generate_cache_key(self, query: str, params: Dict = None) -> str:
        """Generate cache key from query and parameters"""
        cache_data = {
            'query': query,
            'params': params or {}
        }

        # Create consistent hash
        cache_str = json.dumps(cache_data, sort_keys=True)
        hash_obj = hashlib.sha256(cache_str.encode())

        return f"query_cache:{hash_obj.hexdigest()}"

    def get(self, query: str, params: Dict = None) -> Optional[Any]:
        """Get cached query result"""
        cache_key = self._generate_cache_key(query, params)

        try:
            cached = self.redis_client.get(cache_key)
            if cached:
                self.cache_hits += 1

                # Update access metadata
                self._update_access_metadata(cache_key)

                return json.loads(cached)
            else:
                self.cache_misses += 1
                return None

        except Exception as e:
            logger.error(f"Cache get error: {e}")
            self.cache_misses += 1
            return None

    def set(self, query: str, result: Any, params: Dict = None, ttl: int = None):
        """Cache query result"""
        cache_key = self._generate_cache_key(query, params)
        ttl = ttl or self.default_ttl

        try:
            # Serialize result
            serialized = json.dumps(result)
            size = len(serialized)

            # Check cache size and evict if necessary
            if self._get_cache_size() + size > self.max_cache_size_mb:
                self._evict_lru()

            # Store in cache with TTL
            self.redis_client.setex(cache_key, ttl, serialized)

            # Store metadata
            metadata = {
                'query': query,
                'params': json.dumps(params or {}),
                'size': size,
                'created_at': time.time(),
                'ttl': ttl,
                'access_count': 0,
                'last_access': time.time()
            }

            self.redis_client.hset(f"{cache_key}:meta", mapping=metadata)
            self.redis_client.expire(f"{cache_key}:meta", ttl)

            # Extract and register table dependencies
            self._register_dependencies(cache_key, query)

        except Exception as e:
            logger.error(f"Cache set error: {e}")

    def invalidate(self, pattern: str = None, table: str = None):
        """Invalidate cache entries"""
        invalidated = 0

        try:
            if pattern:
                # Pattern-based invalidation
                keys = self.redis_client.keys(f"query_cache:*{pattern}*")
                for key in keys:
                    self.redis_client.delete(key)
                    self.redis_client.delete(f"{key}:meta")
                    invalidated += 1

            elif table:
                # Table-based invalidation
                dependent_keys = self._get_dependent_keys(table)
                for key in dependent_keys:
                    self.redis_client.delete(key)
                    self.redis_client.delete(f"{key}:meta")
                    invalidated += 1

            self.cache_evictions += invalidated
            logger.info(f"Invalidated {invalidated} cache entries")

        except Exception as e:
            logger.error(f"Cache invalidation error: {e}")

    def _register_dependencies(self, cache_key: str, query: str):
        """Register table dependencies for a cached query"""
        # Simple table extraction (can be enhanced with SQL parsing)
        tables = self._extract_tables(query)

        for table in tables:
            dep_key = f"dep:table:{table}"
            self.redis_client.sadd(dep_key, cache_key)
            self.redis_client.expire(dep_key, self.default_ttl)

    def _extract_tables(self, query: str) -> List[str]:
        """Extract table names from query (simplified)"""
        tables = []
        query_lower = query.lower()

        # Common patterns
        patterns = ['from ', 'join ', 'into ', 'update ', 'delete from ']

        for pattern in patterns:
            parts = query_lower.split(pattern)
            for i in range(1, len(parts)):
                # Extract table name
                table_part = parts[i].strip().split()[0] if parts[i].strip() else ''
                table = table_part.replace('(', '').replace(',', '').replace(';', '')
                if table and not table.startswith('select'):
                    tables.append(table)

        return list(set(tables))

    def _get_dependent_keys(self, table: str) -> List[str]:
        """Get cache keys dependent on a table"""
        dep_key = f"dep:table:{table}"
        return list(self.redis_client.smembers(dep_key))

    def _update_access_metadata(self, cache_key: str):
        """Update access metadata for cache entry"""
        try:
            self.redis_client.hincrby(f"{cache_key}:meta", 'access_count', 1)
            self.redis_client.hset(f"{cache_key}:meta", 'last_access', time.time())
        except Exception as e:
            logger.error(f"Failed to update access metadata: {e}")

    def _get_cache_size(self) -> int:
        """Get current cache size in bytes"""
        try:
            info = self.redis_client.info('memory')
            return info.get('used_memory', 0)
        except Exception:
            return 0

    def _evict_lru(self):
        """Evict least recently used entries"""
        try:
            # Get all cache keys with metadata
            keys = self.redis_client.keys("query_cache:*")
            entries = []

            for key in keys:
                if ':meta' not in key:
                    meta = self.redis_client.hgetall(f"{key}:meta")
                    if meta:
                        entries.append((
                            key,
                            float(meta.get('last_access', 0)),
                            int(meta.get('size', 0))
                        ))

            # Sort by last access time
            entries.sort(key=lambda x: x[1])

            # Evict oldest entries until we have enough space
            evicted_size = 0
            target_size = self.max_cache_size_mb * 0.2  # Free 20% of cache

            for key, _, size in entries:
                self.redis_client.delete(key)
                self.redis_client.delete(f"{key}:meta")
                evicted_size += size
                self.cache_evictions += 1

                if evicted_size >= target_size:
                    break

            logger.info(f"Evicted {evicted_size} bytes from cache")

        except Exception as e:
            logger.error(f"LRU eviction error: {e}")

    def get_stats(self) -> Dict:
        """Get cache statistics"""
        try:
            total_keys = len(self.redis_client.keys("query_cache:*"))
            memory_info = self.redis_client.info('memory')

            hit_rate = (self.cache_hits / (self.cache_hits + self.cache_misses) * 100
                       if (self.cache_hits + self.cache_misses) > 0 else 0)

            return {
                'total_keys': total_keys,
                'cache_hits': self.cache_hits,
                'cache_misses': self.cache_misses,
                'hit_rate': f"{hit_rate:.2f}%",
                'evictions': self.cache_evictions,
                'memory_used_mb': memory_info.get('used_memory', 0) / 1024 / 1024,
                'memory_peak_mb': memory_info.get('used_memory_peak', 0) / 1024 / 1024
            }
        except Exception as e:
            logger.error(f"Failed to get cache stats: {e}")
            return {}

    def clear(self):
        """Clear entire cache"""
        try:
            keys = self.redis_client.keys("query_cache:*")
            for key in keys:
                self.redis_client.delete(key)

            # Clear dependencies
            dep_keys = self.redis_client.keys("dep:*")
            for key in dep_keys:
                self.redis_client.delete(key)

            self.cache_hits = 0
            self.cache_misses = 0
            self.cache_evictions = 0

            logger.info("Query cache cleared")

        except Exception as e:
            logger.error(f"Failed to clear cache: {e}")


def cache_query(ttl: int = None):
    """Decorator for caching query results"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Get or create cache instance
            if not hasattr(wrapper, 'cache'):
                wrapper.cache = QueryCache()

            # Generate cache key from function arguments
            query = str(args) + str(kwargs)
            params = {'args': args, 'kwargs': kwargs}

            # Try to get from cache
            cached = wrapper.cache.get(query, params)
            if cached is not None:
                return cached

            # Execute query
            result = func(*args, **kwargs)

            # Cache result
            wrapper.cache.set(query, result, params, ttl)

            return result

        return wrapper
    return decorator


# Singleton cache instance
_cache_instance = None


def get_query_cache() -> QueryCache:
    """Get singleton cache instance"""
    global _cache_instance
    if _cache_instance is None:
        _cache_instance = QueryCache()
    return _cache_instance