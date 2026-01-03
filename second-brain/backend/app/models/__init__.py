"""Data models for Second Brain."""

from app.models.schemas import (
    NoteCreate,
    NoteResponse,
    NoteUpdate,
    SearchQuery,
    SearchResult,
    ChatMessage,
    ChatResponse,
    ReviewSubmit,
    ReviewDue,
    UserCreate,
    UserResponse,
    CaptureResult,
)

from app.models.db_models import (
    User,
    Note,
    Chunk,
    Tag,
    NoteTag,
    Entity,
    NoteEntity,
    Connection,
    Review,
)

__all__ = [
    # Schemas
    "NoteCreate",
    "NoteResponse",
    "NoteUpdate",
    "SearchQuery",
    "SearchResult",
    "ChatMessage",
    "ChatResponse",
    "ReviewSubmit",
    "ReviewDue",
    "UserCreate",
    "UserResponse",
    "CaptureResult",
    # DB Models
    "User",
    "Note",
    "Chunk",
    "Tag",
    "NoteTag",
    "Entity",
    "NoteEntity",
    "Connection",
    "Review",
]
