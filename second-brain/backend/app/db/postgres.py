"""
PostgreSQL Database Connection

Handles async database connections using SQLAlchemy 2.0
"""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


# Create async engine
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

# Session factory
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Base class for all database models."""

    pass


async def init_db() -> None:
    """
    Initialize database connection.
    Creates tables if they don't exist.
    """
    async with engine.begin() as conn:
        # Import all models to register them
        from app.models import db_models  # noqa: F401

        # Create tables if they don't exist (safe for production - idempotent)
        await conn.run_sync(Base.metadata.create_all)

    print(f"PostgreSQL connected: {settings.DATABASE_URL.split('@')[-1]}")


async def close_db() -> None:
    """Close database connection pool."""
    await engine.dispose()
    print("PostgreSQL connection closed.")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency for getting database sessions.

    Usage:
        @app.get("/items")
        async def get_items(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
