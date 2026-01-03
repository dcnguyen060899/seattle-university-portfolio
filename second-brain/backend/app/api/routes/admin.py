"""
Admin API Endpoints - Portfolio Knowledge Management

Allows Duy to manage portfolio content that feeds the recruiter-facing chatbot.
Simple authentication using admin key for personal use.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import time

from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from pydantic import BaseModel, Field

from app.db.postgres import get_db
from app.db.qdrant import search_vectors, delete_vectors
from app.models.db_models import User, Note, Tag, NoteTag, Chunk
from app.services.capture import CaptureService
from app.services.embeddings import get_embedding_service
from app.core.config import settings

import os

router = APIRouter()

# Simple admin key - set via environment variable
ADMIN_KEY = os.getenv("ADMIN_KEY", "portfolio-admin-2025")
DEMO_USER_EMAIL = "demo@second-brain.local"


# === Authentication ===

async def verify_admin(x_admin_key: str = Header(None)) -> bool:
    """Simple admin key verification."""
    if x_admin_key != ADMIN_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin key"
        )
    return True


# === Schemas ===

class KnowledgeEntry(BaseModel):
    """A knowledge entry in the portfolio."""
    id: str
    content: str
    source: str
    tags: List[str]
    category: Optional[str] = None
    priority: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class KnowledgeCreate(BaseModel):
    """Create a new knowledge entry."""
    content: str = Field(..., min_length=10, max_length=10000)
    source: str = Field(default="portfolio")
    tags: List[str] = Field(default_factory=list)
    category: Optional[str] = Field(default="general")
    priority: Optional[str] = Field(default="medium")


class KnowledgeUpdate(BaseModel):
    """Update an existing knowledge entry."""
    content: Optional[str] = Field(None, min_length=10, max_length=10000)
    source: Optional[str] = None
    tags: Optional[List[str]] = None
    category: Optional[str] = None
    priority: Optional[str] = None


class KnowledgeListResponse(BaseModel):
    """List of knowledge entries."""
    total: int
    entries: List[KnowledgeEntry]


class TestQueryRequest(BaseModel):
    """Test a RAG query."""
    query: str = Field(..., min_length=1, max_length=500)


class TestQueryResponse(BaseModel):
    """Response from test query."""
    query: str
    answer: str
    retrieved_count: int
    top_chunks: List[Dict[str, Any]]
    duration_ms: float


class AdminStats(BaseModel):
    """Admin dashboard statistics."""
    total_entries: int
    total_chunks: int
    categories: Dict[str, int]
    tags_used: List[str]
    last_updated: Optional[datetime]


# === Helper Functions ===

async def get_demo_user(db: AsyncSession) -> User:
    """Get the demo user."""
    result = await db.execute(select(User).where(User.email == DEMO_USER_EMAIL))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Demo user not found. Run seed first."
        )

    return user


async def get_note_tags(db: AsyncSession, note_id) -> List[str]:
    """Get tags for a note."""
    result = await db.execute(
        select(Tag.name)
        .join(NoteTag, Tag.id == NoteTag.tag_id)
        .where(NoteTag.note_id == note_id)
    )
    return [row[0] for row in result.fetchall()]


# === Endpoints ===

@router.get("/stats", response_model=AdminStats)
async def get_admin_stats(
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin)
):
    """
    Get admin dashboard statistics.
    """
    user = await get_demo_user(db)

    # Total entries
    result = await db.execute(
        select(func.count(Note.id)).where(Note.user_id == user.id)
    )
    total_entries = result.scalar() or 0

    # Total chunks
    result = await db.execute(
        select(func.count(Chunk.id))
        .join(Note, Chunk.note_id == Note.id)
        .where(Note.user_id == user.id)
    )
    total_chunks = result.scalar() or 0

    # Categories (from context JSON)
    result = await db.execute(
        select(Note.context).where(Note.user_id == user.id)
    )
    categories = {}
    for row in result.fetchall():
        ctx = row[0] or {}
        cat = ctx.get("category", "uncategorized")
        categories[cat] = categories.get(cat, 0) + 1

    # Tags used
    result = await db.execute(
        select(Tag.name).distinct()
        .join(NoteTag, Tag.id == NoteTag.tag_id)
        .join(Note, NoteTag.note_id == Note.id)
        .where(Note.user_id == user.id)
    )
    tags_used = [row[0] for row in result.fetchall()]

    # Last updated
    result = await db.execute(
        select(func.max(Note.updated_at)).where(Note.user_id == user.id)
    )
    last_updated = result.scalar()

    return AdminStats(
        total_entries=total_entries,
        total_chunks=total_chunks,
        categories=categories,
        tags_used=tags_used,
        last_updated=last_updated
    )


@router.get("/knowledge", response_model=KnowledgeListResponse)
async def list_knowledge(
    category: Optional[str] = None,
    tag: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin)
):
    """
    List all knowledge entries with optional filtering.
    """
    user = await get_demo_user(db)

    # Base query
    query = select(Note).where(Note.user_id == user.id)

    # Filter by category (in context JSON)
    if category:
        query = query.where(Note.context["category"].astext == category)

    # Get total count
    count_query = select(func.count(Note.id)).where(Note.user_id == user.id)
    if category:
        count_query = count_query.where(Note.context["category"].astext == category)

    result = await db.execute(count_query)
    total = result.scalar() or 0

    # Apply pagination
    query = query.order_by(Note.created_at.desc()).offset(offset).limit(limit)

    result = await db.execute(query)
    notes = result.scalars().all()

    # Build response
    entries = []
    for note in notes:
        tags = await get_note_tags(db, note.id)

        # Filter by tag if specified
        if tag and tag not in tags:
            continue

        ctx = note.context or {}
        entries.append(KnowledgeEntry(
            id=str(note.id),
            content=note.content,
            source=note.source or "portfolio",
            tags=tags,
            category=ctx.get("category"),
            priority=ctx.get("priority"),
            created_at=note.created_at,
            updated_at=note.updated_at
        ))

    return KnowledgeListResponse(total=total, entries=entries)


@router.get("/knowledge/{entry_id}", response_model=KnowledgeEntry)
async def get_knowledge_entry(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin)
):
    """
    Get a single knowledge entry by ID.
    """
    user = await get_demo_user(db)

    result = await db.execute(
        select(Note)
        .where(Note.id == entry_id)
        .where(Note.user_id == user.id)
    )
    note = result.scalar_one_or_none()

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Knowledge entry not found"
        )

    tags = await get_note_tags(db, note.id)
    ctx = note.context or {}

    return KnowledgeEntry(
        id=str(note.id),
        content=note.content,
        source=note.source or "portfolio",
        tags=tags,
        category=ctx.get("category"),
        priority=ctx.get("priority"),
        created_at=note.created_at,
        updated_at=note.updated_at
    )


@router.post("/knowledge", response_model=KnowledgeEntry, status_code=status.HTTP_201_CREATED)
async def create_knowledge_entry(
    entry: KnowledgeCreate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin)
):
    """
    Create a new knowledge entry.

    This will:
    1. Create the note in PostgreSQL
    2. Generate embeddings via Voyage AI
    3. Store vectors in Qdrant
    4. The chatbot will immediately have access to this content
    """
    user = await get_demo_user(db)

    capture_service = CaptureService(db)

    context = {
        "category": entry.category or "general",
        "priority": entry.priority or "medium"
    }

    try:
        result = await capture_service.capture(
            user_id=user.id,
            content=entry.content,
            source=entry.source,
            tags=entry.tags,
            context=context
        )

        # Fetch the created note
        note_result = await db.execute(
            select(Note).where(Note.id == result.note_id)
        )
        note = note_result.scalar_one()

        return KnowledgeEntry(
            id=str(note.id),
            content=note.content,
            source=note.source or "portfolio",
            tags=entry.tags,
            category=entry.category,
            priority=entry.priority,
            created_at=note.created_at,
            updated_at=note.updated_at
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create entry: {str(e)}"
        )


@router.put("/knowledge/{entry_id}", response_model=KnowledgeEntry)
async def update_knowledge_entry(
    entry_id: str,
    update: KnowledgeUpdate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin)
):
    """
    Update an existing knowledge entry.

    Note: If content is changed, embeddings will be regenerated.
    """
    user = await get_demo_user(db)

    result = await db.execute(
        select(Note)
        .where(Note.id == entry_id)
        .where(Note.user_id == user.id)
    )
    note = result.scalar_one_or_none()

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Knowledge entry not found"
        )

    content_changed = False

    # Update fields
    if update.content is not None and update.content != note.content:
        note.content = update.content
        content_changed = True

    if update.source is not None:
        note.source = update.source

    # Update context
    ctx = note.context or {}
    if update.category is not None:
        ctx["category"] = update.category
    if update.priority is not None:
        ctx["priority"] = update.priority
    note.context = ctx

    note.updated_at = datetime.now(timezone.utc)

    # Handle tags
    if update.tags is not None:
        # Remove existing tags
        await db.execute(
            delete(NoteTag).where(NoteTag.note_id == note.id)
        )

        # Add new tags
        for tag_name in update.tags:
            # Get or create tag
            tag_result = await db.execute(
                select(Tag).where(Tag.user_id == user.id).where(Tag.name == tag_name)
            )
            tag = tag_result.scalar_one_or_none()

            if not tag:
                tag = Tag(user_id=user.id, name=tag_name, tag_type="user")
                db.add(tag)
                await db.flush()

            note_tag = NoteTag(note_id=note.id, tag_id=tag.id, confidence=1.0)
            db.add(note_tag)

    await db.commit()
    await db.refresh(note)

    # If content changed, regenerate embeddings
    if content_changed:
        try:
            embedding_service = get_embedding_service()
            embeddings = await embedding_service.embed([note.content], input_type="document")

            if embeddings:
                from app.db.qdrant import upsert_vectors
                await upsert_vectors(
                    embeddings=[embeddings[0]],
                    payloads=[{
                        "note_id": str(note.id),
                        "user_id": str(user.id),
                        "content": note.content[:500],
                        "source": note.source,
                        "tags": update.tags or []
                    }],
                    ids=[str(note.id)]
                )
        except Exception as e:
            print(f"Warning: Failed to update embeddings: {e}")

    tags = await get_note_tags(db, note.id)

    return KnowledgeEntry(
        id=str(note.id),
        content=note.content,
        source=note.source or "portfolio",
        tags=tags,
        category=ctx.get("category"),
        priority=ctx.get("priority"),
        created_at=note.created_at,
        updated_at=note.updated_at
    )


@router.delete("/knowledge/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_knowledge_entry(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin)
):
    """
    Delete a knowledge entry.

    This removes the entry from both PostgreSQL and Qdrant.
    """
    user = await get_demo_user(db)

    result = await db.execute(
        select(Note)
        .where(Note.id == entry_id)
        .where(Note.user_id == user.id)
    )
    note = result.scalar_one_or_none()

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Knowledge entry not found"
        )

    # Delete from Qdrant using the delete_vectors function
    try:
        await delete_vectors(user_id=str(user.id), note_id=str(entry_id))
    except Exception as e:
        print(f"Warning: Failed to delete from Qdrant: {e}")

    # Delete from PostgreSQL (cascade will handle related records)
    await db.delete(note)
    await db.commit()


@router.post("/test-query", response_model=TestQueryResponse)
async def test_rag_query(
    request: TestQueryRequest,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin)
):
    """
    Test a RAG query to see how the chatbot would respond.

    Useful for verifying that new knowledge entries are being retrieved correctly.
    """
    start_time = time.time()

    user = await get_demo_user(db)

    # Generate query embedding
    embedding_service = get_embedding_service()
    query_embedding = await embedding_service.embed([request.query], input_type="query")

    if not query_embedding:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate query embedding"
        )

    # Search vectors
    search_results = await search_vectors(
        query_vector=query_embedding[0],
        user_id=str(user.id),
        limit=5,
        score_threshold=0.3,
    )

    # Build context
    top_chunks = []
    context_parts = []

    for r in search_results:
        payload = r.get("payload", {})
        score = r.get("score", 0)
        content = payload.get("content", "")

        top_chunks.append({
            "content": content[:200] + "..." if len(content) > 200 else content,
            "score": round(score, 3),
            "tags": payload.get("tags", []),
            "source": payload.get("source", "unknown")
        })
        context_parts.append(content)

    # Generate answer using Claude
    import anthropic

    client = anthropic.Anthropic()

    context_text = "\n\n---\n\n".join(context_parts) if context_parts else "No relevant context found."

    response = client.messages.create(
        model=settings.ANTHROPIC_MODEL,
        max_tokens=500,
        messages=[{
            "role": "user",
            "content": f"""Based on the following context about Duy Nguyen's portfolio, answer this question:

CONTEXT:
{context_text}

QUESTION: {request.query}

Provide a concise, helpful answer based only on the context provided. If the context doesn't contain relevant information, say so."""
        }]
    )

    answer = response.content[0].text if response.content else "No response generated."

    duration_ms = (time.time() - start_time) * 1000

    return TestQueryResponse(
        query=request.query,
        answer=answer,
        retrieved_count=len(search_results),
        top_chunks=top_chunks,
        duration_ms=round(duration_ms, 2)
    )


@router.post("/reseed", status_code=status.HTTP_200_OK)
async def reseed_knowledge(
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin)
):
    """
    Re-seed the knowledge base from seed_data.py.

    This will:
    1. Clear existing demo data
    2. Re-import from seed_data.py
    3. Regenerate all embeddings

    Use this after updating seed_data.py with new content.
    """
    user = await get_demo_user(db)

    # Delete existing notes for demo user
    await db.execute(
        delete(Note).where(Note.user_id == user.id)
    )
    await db.commit()

    # Delete vectors from Qdrant
    try:
        await delete_vectors(user_id=str(user.id))
    except Exception as e:
        print(f"Warning: Failed to clear Qdrant: {e}")

    # Re-seed
    from app.demo.seed_data import get_portfolio_knowledge
    capture_service = CaptureService(db)

    count = 0
    errors = []

    for item in get_portfolio_knowledge():
        try:
            await capture_service.capture(
                user_id=user.id,
                content=item["content"],
                source=item["source"],
                tags=item["tags"],
                context=item["context"],
            )
            count += 1
        except Exception as e:
            errors.append(str(e))

    return {
        "status": "success",
        "entries_created": count,
        "errors": errors if errors else None
    }


@router.delete("/clear", status_code=status.HTTP_200_OK)
async def clear_all_knowledge(
    confirm: bool = False,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin)
):
    """
    Clear all knowledge entries.

    Requires confirm=true query parameter as safety measure.
    """
    if not confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Add ?confirm=true to confirm deletion"
        )

    user = await get_demo_user(db)

    # Count before delete
    result = await db.execute(
        select(func.count(Note.id)).where(Note.user_id == user.id)
    )
    count = result.scalar() or 0

    # Delete all notes
    await db.execute(
        delete(Note).where(Note.user_id == user.id)
    )
    await db.commit()

    # Clear Qdrant
    try:
        await delete_vectors(user_id=str(user.id))
    except Exception as e:
        print(f"Warning: Failed to clear Qdrant: {e}")

    return {
        "status": "cleared",
        "entries_deleted": count
    }
