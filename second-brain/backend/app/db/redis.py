"""
Redis Connection

Handles caching, rate limiting, and job queues.
"""

from typing import Optional, Any
import json

import redis.asyncio as redis

from app.core.config import settings


# Global Redis client
_redis_client: Optional[redis.Redis] = None


async def get_redis_client() -> Optional[redis.Redis]:
    """Get the Redis client instance (may be None if Redis disabled)."""
    global _redis_client
    return _redis_client


async def init_redis() -> None:
    """Initialize Redis connection (optional - gracefully handles missing Redis)."""
    global _redis_client

    if not settings.REDIS_URL:
        print("Redis URL not configured - caching disabled")
        return

    try:
        _redis_client = redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )

        # Test connection
        await _redis_client.ping()
        print(f"Redis connected: {settings.REDIS_URL.split('@')[-1] if '@' in settings.REDIS_URL else settings.REDIS_URL}")
    except Exception as e:
        print(f"Redis connection failed (caching disabled): {e}")
        _redis_client = None


async def close_redis() -> None:
    """Close Redis connection."""
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None
    print("Redis connection closed.")


# === Caching Utilities ===


async def cache_get(key: str) -> Optional[Any]:
    """
    Get a value from cache.

    Args:
        key: Cache key

    Returns:
        Cached value or None if not found
    """
    client = await get_redis_client()
    if client is None:
        return None

    value = await client.get(key)

    if value is None:
        return None

    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


async def cache_set(
    key: str,
    value: Any,
    expire_seconds: int = 3600,
) -> None:
    """
    Set a value in cache.

    Args:
        key: Cache key
        value: Value to cache (will be JSON serialized)
        expire_seconds: TTL in seconds (default 1 hour)
    """
    client = await get_redis_client()
    if client is None:
        return

    if isinstance(value, (dict, list)):
        value = json.dumps(value)

    await client.set(key, value, ex=expire_seconds)


async def cache_delete(key: str) -> None:
    """Delete a cached value."""
    client = await get_redis_client()
    if client is None:
        return
    await client.delete(key)


async def cache_delete_pattern(pattern: str) -> None:
    """Delete all keys matching a pattern."""
    client = await get_redis_client()
    if client is None:
        return

    cursor = 0
    while True:
        cursor, keys = await client.scan(cursor=cursor, match=pattern, count=100)
        if keys:
            await client.delete(*keys)
        if cursor == 0:
            break


# === Rate Limiting ===


async def check_rate_limit(
    key: str,
    limit: int = settings.RATE_LIMIT_PER_MINUTE,
    window_seconds: int = 60,
) -> tuple[bool, int]:
    """
    Check if a rate limit has been exceeded.

    Args:
        key: Unique identifier for rate limiting (e.g., user_id)
        limit: Maximum requests allowed
        window_seconds: Time window in seconds

    Returns:
        Tuple of (is_allowed, remaining_requests)
    """
    client = await get_redis_client()
    if client is None:
        # No rate limiting when Redis is disabled
        return True, limit

    rate_key = f"rate_limit:{key}"

    # Increment counter
    current = await client.incr(rate_key)

    # Set expiry on first request
    if current == 1:
        await client.expire(rate_key, window_seconds)

    remaining = max(0, limit - current)
    is_allowed = current <= limit

    return is_allowed, remaining


# === Session Management ===


async def set_session(
    session_id: str,
    data: dict,
    expire_seconds: int = 86400,  # 24 hours
) -> None:
    """Store session data."""
    await cache_set(f"session:{session_id}", data, expire_seconds)


async def get_session(session_id: str) -> Optional[dict]:
    """Retrieve session data."""
    return await cache_get(f"session:{session_id}")


async def delete_session(session_id: str) -> None:
    """Delete a session."""
    await cache_delete(f"session:{session_id}")
