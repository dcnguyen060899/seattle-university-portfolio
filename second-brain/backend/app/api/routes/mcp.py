"""
MCP Integration API Endpoints

Endpoints for Claude Code MCP server integration.
Uses API key authentication for simplicity.
"""

from typing import List, Dict, Any, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, status, Header, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field

from app.db.postgres import get_db
from app.models.db_models import User
from app.models.schemas import CaptureResult
from app.services.capture import CaptureService
from app.services.embeddings import get_embedding_service
from app.db.qdrant import search_vectors
from app.core.config import settings


router = APIRouter()


# MCP API Key - in production, this should be per-user
MCP_API_KEY = "sb-mcp-dev-key-change-in-production"


class MCPCaptureRequest(BaseModel):
    """Schema for MCP capture request."""
    content: str = Field(..., description="The learning content")
    learning_type: str = Field(default="insight", description="Type: insight, solution, pattern, debug, concept, tool, config")
    tags: List[str] = Field(default=[], description="Tags for categorization")
    source: str = Field(default="claude-code", description="Source of the learning")
    context: Optional[Dict[str, Any]] = Field(default=None, description="Additional context")


class MCPSearchRequest(BaseModel):
    """Schema for MCP search request."""
    query: str = Field(..., description="Search query")
    limit: int = Field(default=5, ge=1, le=20, description="Max results")
    learning_type: Optional[str] = Field(default=None, description="Filter by type")
    tags: Optional[List[str]] = Field(default=None, description="Filter by tags")


class MCPSearchResult(BaseModel):
    """Schema for MCP search result."""
    id: str
    content: str
    learning_type: str
    tags: List[str]
    source: str
    relevance_score: float
    created_at: str


async def verify_mcp_api_key(x_api_key: str = Header(..., alias="X-API-Key")) -> str:
    """Verify MCP API key."""
    if x_api_key != MCP_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )
    return x_api_key


async def get_default_user(db: AsyncSession = Depends(get_db)) -> User:
    """
    Get or create the default user for MCP captures.
    In production, this would be tied to API keys per user.
    """
    result = await db.execute(select(User).limit(1))
    user = result.scalar_one_or_none()

    if not user:
        # Create default user for MCP
        from app.core.security import get_password_hash
        user = User(
            email="mcp@second-brain.local",
            hashed_password=get_password_hash("mcp-default-password"),
            settings={"name": "Claude Code MCP"},
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return user


@router.post("/capture", response_model=CaptureResult, status_code=status.HTTP_201_CREATED)
async def mcp_capture(
    request: MCPCaptureRequest,
    api_key: str = Depends(verify_mcp_api_key),
    user: User = Depends(get_default_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Capture a learning from Claude Code MCP server.

    This endpoint is called by the MCP server to store learnings
    in the same database as the web app.

    Args:
        request: The learning to capture

    Returns:
        CaptureResult with note_id, tags, entities, connections
    """
    # Build context with learning type
    context = request.context or {}
    context["learning_type"] = request.learning_type
    context["mcp_capture"] = True

    # Use the same capture service as the web app
    capture_service = CaptureService(db)
    result = await capture_service.capture(
        user_id=user.id,
        content=request.content,
        source=request.source,
        tags=request.tags,
        context=context,
    )

    return result


@router.post("/search", response_model=List[MCPSearchResult])
async def mcp_search(
    request: MCPSearchRequest,
    api_key: str = Depends(verify_mcp_api_key),
    user: User = Depends(get_default_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Search knowledge base from Claude Code MCP server.

    Performs semantic search across all captured learnings.

    Args:
        request: Search parameters

    Returns:
        List of matching learnings with relevance scores
    """
    # Get embedding for query
    embedding_service = get_embedding_service()
    query_embedding = await embedding_service.embed([request.query], input_type="query")

    if not query_embedding:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate query embedding",
        )

    # Search vectors
    results = await search_vectors(
        query_vector=query_embedding[0],
        user_id=str(user.id),
        limit=request.limit,
        score_threshold=0.5,
    )

    # Format results
    formatted_results = []
    for r in results:
        payload = r.get("payload", {})
        formatted_results.append(MCPSearchResult(
            id=str(r.get("id", "")),
            content=payload.get("content", ""),
            learning_type=payload.get("learning_type", payload.get("context", {}).get("learning_type", "insight")),
            tags=payload.get("tags", []),
            source=payload.get("source", "unknown"),
            relevance_score=round(r.get("score", 0), 3),
            created_at=payload.get("created_at", "unknown"),
        ))

    return formatted_results


@router.get("/recent", response_model=List[MCPSearchResult])
async def mcp_recent(
    limit: int = 10,
    api_key: str = Depends(verify_mcp_api_key),
    user: User = Depends(get_default_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get recent learnings from the knowledge base.

    Args:
        limit: Maximum number of results

    Returns:
        List of recent learnings
    """
    from app.models.db_models import Note
    from sqlalchemy.orm import selectinload
    from app.models.db_models import NoteTag

    result = await db.execute(
        select(Note)
        .where(Note.user_id == user.id)
        .options(selectinload(Note.note_tags).selectinload(NoteTag.tag))
        .order_by(Note.created_at.desc())
        .limit(limit)
    )
    notes = result.scalars().all()

    formatted_results = []
    for note in notes:
        formatted_results.append(MCPSearchResult(
            id=str(note.id),
            content=note.content[:500] + "..." if len(note.content) > 500 else note.content,
            learning_type=note.context.get("learning_type", "insight") if note.context else "insight",
            tags=[nt.tag.name for nt in note.note_tags],
            source=note.source or "unknown",
            relevance_score=1.0,
            created_at=note.created_at.isoformat(),
        ))

    return formatted_results


@router.get("/health")
async def mcp_health():
    """Health check for MCP integration."""
    return {
        "status": "healthy",
        "service": "second-brain-mcp",
        "message": "MCP integration is ready",
    }
