"""
Redis connection pool manager for optimal performance.
"""

import redis.asyncio as redis
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)


class RedisPoolManager:
    """
    Manage Redis connection pool for the application.

    Provides a singleton connection pool for optimal resource usage.
    """

    _instance: Optional['RedisPoolManager'] = None
    _pool: Optional[redis.ConnectionPool] = None
    _client: Optional[redis.Redis] = None

    def __new__(cls):
        """Ensure singleton instance."""
        if cls._instance is None:
            cls._instance = super(RedisPoolManager, cls).__new__(cls)
        return cls._instance

    def __init__(self):
        """Initialize pool manager."""
        if not hasattr(self, 'initialized'):
            self.initialized = True
            self.config = {
                'host': 'localhost',
                'port': 6379,
                'db': 0,
                'max_connections': 50,
                'socket_keepalive': True,
                'socket_keepalive_options': {
                    1: 1,  # TCP_KEEPIDLE
                    2: 1,  # TCP_KEEPINTVL
                    3: 3,  # TCP_KEEPCNT
                },
                'decode_responses': True,
                'health_check_interval': 30
            }

    async def initialize(self, config: Optional[Dict[str, Any]] = None) -> None:
        """
        Initialize Redis connection pool.

        Args:
            config: Optional configuration override
        """
        if config:
            self.config.update(config)

        if self._pool is None:
            try:
                # Create connection pool
                self._pool = redis.ConnectionPool(
                    host=self.config['host'],
                    port=self.config['port'],
                    db=self.config['db'],
                    max_connections=self.config['max_connections'],
                    socket_keepalive=self.config['socket_keepalive'],
                    socket_keepalive_options=self.config['socket_keepalive_options'],
                    decode_responses=self.config['decode_responses'],
                    health_check_interval=self.config['health_check_interval']
                )

                # Create client with pool
                self._client = redis.Redis(connection_pool=self._pool)

                # Test connection
                await self._client.ping()

                logger.info(f"Redis connection pool initialized with {self.config['max_connections']} max connections")

            except Exception as e:
                logger.error(f"Failed to initialize Redis pool: {e}")
                self._pool = None
                self._client = None
                raise

    async def get_client(self) -> Optional[redis.Redis]:
        """
        Get Redis client from pool.

        Returns:
            Redis client or None if not available
        """
        if self._client is None:
            await self.initialize()

        return self._client

    async def execute(self, command: str, *args, **kwargs) -> Any:
        """
        Execute Redis command with automatic retry.

        Args:
            command: Redis command name
            *args: Command arguments
            **kwargs: Command keyword arguments

        Returns:
            Command result

        Raises:
            RedisError: If command fails after retries
        """
        client = await self.get_client()
        if client is None:
            logger.warning("Redis client not available")
            return None

        max_retries = 3
        for attempt in range(max_retries):
            try:
                method = getattr(client, command)
                result = await method(*args, **kwargs)
                return result

            except redis.ConnectionError as e:
                logger.warning(f"Redis connection error on attempt {attempt + 1}: {e}")
                if attempt == max_retries - 1:
                    raise

                # Reset connection pool on connection errors
                await self.reset_pool()

            except Exception as e:
                logger.error(f"Redis command {command} failed: {e}")
                raise

        return None

    async def get_pool_stats(self) -> Dict[str, Any]:
        """
        Get connection pool statistics.

        Returns:
            Pool statistics dictionary
        """
        if self._pool is None:
            return {"status": "not_initialized"}

        return {
            "status": "active",
            "max_connections": self._pool.max_connections,
            "created_connections": self._pool.created_connections,
            "available_connections": len(self._pool._available_connections),
            "in_use_connections": len(self._pool._in_use_connections)
        }

    async def reset_pool(self) -> None:
        """Reset connection pool."""
        if self._pool:
            await self._pool.disconnect()

        self._pool = None
        self._client = None

        # Reinitialize
        await self.initialize()

    async def close(self) -> None:
        """Close all connections in the pool."""
        if self._client:
            await self._client.close()

        if self._pool:
            await self._pool.disconnect()

        self._pool = None
        self._client = None
        logger.info("Redis connection pool closed")

    async def health_check(self) -> bool:
        """
        Perform health check on Redis connection.

        Returns:
            True if healthy, False otherwise
        """
        try:
            client = await self.get_client()
            if client:
                await client.ping()
                return True
            return False
        except Exception as e:
            logger.error(f"Redis health check failed: {e}")
            return False


# Global pool manager instance
redis_pool = RedisPoolManager()