"""
Second Brain - Main FastAPI Application

This is the entry point for the Second Brain API server.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import notes, search, chat, reviews, health, export, auth, mcp, demo, admin
from app.core.config import settings
from app.db.postgres import init_db, close_db
from app.db.qdrant import init_qdrant, close_qdrant
from app.db.redis import init_redis, close_redis


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    """
    Application lifespan manager.
    Handles startup and shutdown events.
    """
    # Startup
    print("Starting Second Brain API...")
    await init_db()
    await init_qdrant()
    await init_redis()
    print("All services initialized successfully!")

    yield

    # Shutdown
    print("Shutting down Second Brain API...")
    await close_db()
    await close_qdrant()
    await close_redis()
    print("Cleanup complete.")


def create_app() -> FastAPI:
    """
    Application factory for creating the FastAPI app.
    """
    app = FastAPI(
        title="Second Brain API",
        description="AI-Powered Knowledge Retention System",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # CORS configuration
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    app.include_router(health.router, tags=["Health"])
    app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
    app.include_router(notes.router, prefix="/api/v1/notes", tags=["Notes"])
    app.include_router(search.router, prefix="/api/v1/search", tags=["Search"])
    app.include_router(chat.router, prefix="/api/v1/chat", tags=["Chat"])
    app.include_router(reviews.router, prefix="/api/v1/reviews", tags=["Reviews"])
    app.include_router(export.router, prefix="/api/v1/export", tags=["Export"])
    app.include_router(mcp.router, prefix="/api/v1/mcp", tags=["MCP Integration"])
    app.include_router(demo.router, prefix="/api/v1/demo", tags=["Demo - AI Architecture Showcase"])
    app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin - Portfolio Management"])

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
    )
