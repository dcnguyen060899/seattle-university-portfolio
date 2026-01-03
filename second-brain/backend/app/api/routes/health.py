"""
Health Check Endpoints

Used for monitoring and deployment health checks.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.db.postgres import get_db
from app.db.qdrant import get_qdrant_client
from app.db.redis import get_redis_client


router = APIRouter()


class HealthStatus(BaseModel):
    """Health check response."""

    status: str
    postgres: str
    qdrant: str
    redis: str
    version: str = "0.1.0"


@router.get("/health", response_model=HealthStatus)
async def health_check():
    """
    Check health of all services.

    Returns status of:
    - PostgreSQL database
    - Qdrant vector database
    - Redis cache
    """
    status_report = {
        "status": "healthy",
        "postgres": "unknown",
        "qdrant": "unknown",
        "redis": "unknown",
        "version": "0.1.0",
    }

    # Check PostgreSQL
    try:
        from app.db.postgres import async_session_maker
        from sqlalchemy import text

        async with async_session_maker() as session:
            await session.execute(text("SELECT 1"))
        status_report["postgres"] = "healthy"
    except Exception as e:
        status_report["postgres"] = f"unhealthy: {str(e)[:50]}"
        status_report["status"] = "degraded"

    # Check Qdrant
    try:
        client = await get_qdrant_client()
        await client.get_collections()
        status_report["qdrant"] = "healthy"
    except Exception as e:
        status_report["qdrant"] = f"unhealthy: {str(e)[:50]}"
        status_report["status"] = "degraded"

    # Check Redis
    try:
        client = await get_redis_client()
        await client.ping()
        status_report["redis"] = "healthy"
    except Exception as e:
        status_report["redis"] = f"unhealthy: {str(e)[:50]}"
        status_report["status"] = "degraded"

    return HealthStatus(**status_report)


@router.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Second Brain API",
        "version": "0.1.0",
        "docs": "/docs",
    }
