"""
Application Configuration

Uses pydantic-settings for type-safe configuration management.
All settings can be overridden via environment variables.
"""

from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    # Application
    APP_NAME: str = "Second Brain"
    DEBUG: bool = False
    API_VERSION: str = "v1"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",  # Vite dev server
        "http://localhost:5174",  # Vite alternate port
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "null",  # Allow file:// protocol (shows as null origin)
        "https://duyng-portfolio.com",  # Production portfolio site
        "https://www.duyng-portfolio.com",
        "*",  # Allow all for demo purposes - restrict in production
    ]

    # PostgreSQL Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/secondbrain"

    # Qdrant Vector Database
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_API_KEY: str | None = None
    QDRANT_COLLECTION_NAME: str = "knowledge_chunks"

    # Redis (optional - caching disabled if not set)
    REDIS_URL: str = ""

    # Authentication
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALGORITHM: str = "HS256"

    # AI Services
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-sonnet-4-20250514"

    VOYAGE_API_KEY: str = ""
    VOYAGE_MODEL: str = "voyage-2"

    # Embedding Configuration
    EMBEDDING_DIMENSION: int = 1024  # Voyage-2 dimension
    MAX_CHUNK_TOKENS: int = 512
    CHUNK_OVERLAP_TOKENS: int = 50

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60

    # Feature Flags
    ENABLE_SPACED_REPETITION: bool = True
    ENABLE_AUTO_TAGGING: bool = True
    ENABLE_CONNECTION_DISCOVERY: bool = True


settings = Settings()
