"""
API Dependencies

Common dependencies used across API routes.
"""

from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.postgres import get_db
from app.db.redis import check_rate_limit
from app.core.security import decode_token, TokenData
from app.models.db_models import User


# Security scheme
security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Dependency to get the current authenticated user.

    Args:
        credentials: Bearer token from Authorization header
        db: Database session

    Returns:
        User object

    Raises:
        HTTPException: If token is invalid or user not found
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Decode token
    token_data: Optional[TokenData] = decode_token(credentials.credentials)
    if token_data is None:
        raise credentials_exception

    # Get user from database
    result = await db.execute(select(User).where(User.id == token_data.user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    return user


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(
        HTTPBearer(auto_error=False)
    ),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """
    Optional user dependency - returns None if not authenticated.
    Useful for endpoints that work both with and without auth.
    """
    if credentials is None:
        return None

    try:
        return await get_current_user(credentials, db)
    except HTTPException:
        return None


async def rate_limit_check(
    user: User = Depends(get_current_user),
) -> User:
    """
    Dependency to check rate limits.

    Args:
        user: Current authenticated user

    Returns:
        User object if within rate limit

    Raises:
        HTTPException: If rate limit exceeded
    """
    is_allowed, remaining = await check_rate_limit(str(user.id))

    if not is_allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please try again later.",
            headers={"X-RateLimit-Remaining": str(remaining)},
        )

    return user


class Pagination:
    """Pagination parameters."""

    def __init__(
        self,
        limit: int = 20,
        offset: int = 0,
    ):
        self.limit = min(limit, 100)  # Max 100 items per page
        self.offset = offset


def get_pagination(
    limit: int = 20,
    offset: int = 0,
) -> Pagination:
    """Dependency for pagination parameters."""
    return Pagination(limit=limit, offset=offset)
