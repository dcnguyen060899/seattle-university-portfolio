"""
Pydantic Schemas for API Request/Response

These models define the shape of data for API endpoints.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict


# === User Schemas ===


class UserCreate(BaseModel):
    """Schema for creating a new user."""

    email: str = Field(..., description="User's email address")
    password: str = Field(..., min_length=8, description="User's password")


class UserResponse(BaseModel):
    """Schema for user response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    created_at: datetime
    subscription_tier: str = "free"


# === Note Schemas ===


class NoteCreate(BaseModel):
    """Schema for creating a new note."""

    content: str = Field(..., min_length=1, description="The knowledge content to capture")
    source: Optional[str] = Field(None, description="Where this knowledge came from")
    source_url: Optional[str] = Field(None, description="URL of the source")
    tags: Optional[List[str]] = Field(default_factory=list, description="Manual tags")
    context: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Additional context (project, session, etc.)",
    )


class NoteUpdate(BaseModel):
    """Schema for updating a note."""

    content: Optional[str] = None
    tags: Optional[List[str]] = None
    context: Optional[Dict[str, Any]] = None


class NoteResponse(BaseModel):
    """Schema for note response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    content: str
    content_type: str = "text"
    source: Optional[str] = None
    source_url: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    entities: List[str] = Field(default_factory=list)
    context: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime
    connection_count: int = 0


class CaptureResult(BaseModel):
    """Schema for capture operation result."""

    note_id: UUID
    tags: List[str] = Field(default_factory=list, description="All tags (manual + auto)")
    entities: List[str] = Field(default_factory=list, description="Extracted entities")
    connections: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Related notes found",
    )
    message: str = "Knowledge captured successfully"


# === Search Schemas ===


class SearchFilters(BaseModel):
    """Filters for search queries."""

    tags: Optional[List[str]] = None
    date_after: Optional[datetime] = None
    date_before: Optional[datetime] = None
    project: Optional[str] = None
    source: Optional[str] = None


class SearchQuery(BaseModel):
    """Schema for search request."""

    query: str = Field(..., min_length=1, description="Natural language search query")
    filters: Optional[SearchFilters] = None
    top_k: int = Field(default=10, ge=1, le=100, description="Max results to return")


class SearchResultItem(BaseModel):
    """Individual search result."""

    note_id: UUID
    content: str
    score: float = Field(..., description="Similarity score 0-1")
    tags: List[str] = Field(default_factory=list)
    source: Optional[str] = None
    created_at: datetime
    preview: str = Field(..., description="Content preview (first 200 chars)")


class SearchResult(BaseModel):
    """Schema for search response."""

    query: str
    total_results: int
    results: List[SearchResultItem]
    filters_applied: Optional[SearchFilters] = None


# === Chat Schemas ===


class ChatMessage(BaseModel):
    """Schema for chat request."""

    message: str = Field(..., min_length=1, description="User's message")
    conversation_id: Optional[str] = Field(
        None,
        description="Optional conversation ID for multi-turn",
    )


class ChatResponse(BaseModel):
    """Schema for chat response."""

    response: str = Field(..., description="AI's response")
    conversation_id: str
    sources_used: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Knowledge sources referenced in response",
    )
    tool_calls: List[str] = Field(
        default_factory=list,
        description="Functions called during response",
    )


# === Review Schemas ===


class ReviewSubmit(BaseModel):
    """Schema for submitting a review result."""

    rating: int = Field(
        ...,
        ge=0,
        le=5,
        description="SM-2 rating: 0=complete blackout, 5=perfect recall",
    )


class ReviewDue(BaseModel):
    """Schema for a note due for review."""

    note_id: UUID
    content_preview: str = Field(..., description="First 200 chars of content")
    tags: List[str] = Field(default_factory=list)
    last_reviewed_at: Optional[datetime] = None
    review_count: int = 0
    ease_factor: float = 2.5


class ReviewListResponse(BaseModel):
    """Schema for list of due reviews."""

    due_count: int
    reviews: List[ReviewDue]


# === Connection Schemas ===


class ConnectionResponse(BaseModel):
    """Schema for a connection between notes."""

    source_note_id: UUID
    target_note_id: UUID
    target_preview: str
    connection_type: str = "semantic"
    strength: float = Field(..., description="Connection strength 0-1")


class ConnectionGraphResponse(BaseModel):
    """Schema for connection graph."""

    center_note_id: UUID
    connections: List[ConnectionResponse]
    depth: int = 1


# === Entity Schemas ===


class EntityResponse(BaseModel):
    """Schema for extracted entity."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    entity_type: str  # concept, tool, language, person, project
    usage_count: int = 0


# === Tag Schemas ===


class TagResponse(BaseModel):
    """Schema for tag."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    tag_type: str = "user"  # user, auto, entity
    usage_count: int = 0


class TagListResponse(BaseModel):
    """Schema for list of tags."""

    tags: List[TagResponse]
    total: int


# === Summary Schemas ===


class SummarizeRequest(BaseModel):
    """Schema for topic summarization request."""

    topic: str = Field(..., min_length=1, description="Topic to summarize")
    include_gaps: bool = Field(
        default=False,
        description="Whether to identify knowledge gaps",
    )


class SummarizeResponse(BaseModel):
    """Schema for topic summarization response."""

    topic: str
    summary: str
    note_count: int = Field(..., description="Number of notes used")
    knowledge_gaps: Optional[List[str]] = None
    related_topics: List[str] = Field(default_factory=list)
