"""
Notes API Endpoints

CRUD operations for knowledge notes.
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.postgres import get_db
from app.api.deps import get_current_user, get_pagination, Pagination
from app.models.db_models import User, Note, Tag, NoteTag
from app.models.schemas import (
    NoteCreate,
    NoteResponse,
    NoteUpdate,
    CaptureResult,
)
from app.services.capture import CaptureService


router = APIRouter()


@router.post("", response_model=CaptureResult, status_code=status.HTTP_201_CREATED)
async def create_note(
    note_data: NoteCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Capture new knowledge.

    This endpoint:
    1. Stores the note content
    2. Generates embeddings for semantic search
    3. Extracts entities (concepts, tools, etc.)
    4. Auto-generates relevant tags
    5. Finds connections to existing knowledge

    Args:
        note_data: The knowledge to capture

    Returns:
        CaptureResult with note_id, tags, entities, and connections
    """
    capture_service = CaptureService(db)
    result = await capture_service.capture(
        user_id=user.id,
        content=note_data.content,
        source=note_data.source,
        source_url=note_data.source_url,
        tags=note_data.tags,
        context=note_data.context,
    )
    return result


@router.get("", response_model=List[NoteResponse])
async def list_notes(
    tags: Optional[List[str]] = None,
    project: Optional[str] = None,
    pagination: Pagination = Depends(get_pagination),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List notes with optional filters.

    Args:
        tags: Filter by tags (OR logic)
        project: Filter by project name in context
        pagination: Limit and offset

    Returns:
        List of notes matching filters
    """
    query = (
        select(Note)
        .where(Note.user_id == user.id)
        .options(selectinload(Note.note_tags).selectinload(NoteTag.tag))
        .order_by(Note.created_at.desc())
        .limit(pagination.limit)
        .offset(pagination.offset)
    )

    # Apply filters
    if project:
        query = query.where(Note.context["project"].astext == project)

    result = await db.execute(query)
    notes = result.scalars().all()

    # Transform to response
    response = []
    for note in notes:
        note_dict = {
            "id": note.id,
            "content": note.content,
            "content_type": note.content_type,
            "source": note.source,
            "source_url": note.source_url,
            "tags": [nt.tag.name for nt in note.note_tags],
            "entities": [],  # TODO: Load entities
            "context": note.context,
            "created_at": note.created_at,
            "updated_at": note.updated_at,
            "connection_count": note.connection_count,
        }
        response.append(NoteResponse(**note_dict))

    return response


@router.get("/{note_id}", response_model=NoteResponse)
async def get_note(
    note_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get a specific note by ID.

    Args:
        note_id: The note's UUID

    Returns:
        Note details including tags, entities, and connection count
    """
    result = await db.execute(
        select(Note)
        .where(Note.id == note_id, Note.user_id == user.id)
        .options(selectinload(Note.note_tags).selectinload(NoteTag.tag))
    )
    note = result.scalar_one_or_none()

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found",
        )

    return NoteResponse(
        id=note.id,
        content=note.content,
        content_type=note.content_type,
        source=note.source,
        source_url=note.source_url,
        tags=[nt.tag.name for nt in note.note_tags],
        entities=[],
        context=note.context,
        created_at=note.created_at,
        updated_at=note.updated_at,
        connection_count=note.connection_count,
    )


@router.put("/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: UUID,
    note_data: NoteUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update a note.

    Note: Updating content will re-generate embeddings and connections.

    Args:
        note_id: The note's UUID
        note_data: Fields to update

    Returns:
        Updated note
    """
    result = await db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == user.id)
    )
    note = result.scalar_one_or_none()

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found",
        )

    # Update fields
    if note_data.content is not None:
        note.content = note_data.content
        # TODO: Re-generate embeddings

    if note_data.context is not None:
        note.context = {**note.context, **note_data.context}

    if note_data.tags is not None:
        # TODO: Update tags
        pass

    await db.commit()
    await db.refresh(note)

    return NoteResponse(
        id=note.id,
        content=note.content,
        content_type=note.content_type,
        source=note.source,
        source_url=note.source_url,
        tags=[],  # TODO: Load tags
        entities=[],
        context=note.context,
        created_at=note.created_at,
        updated_at=note.updated_at,
        connection_count=note.connection_count,
    )


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete a note.

    This also removes:
    - Associated embeddings from vector database
    - Connections to/from this note
    - Review history

    Args:
        note_id: The note's UUID
    """
    result = await db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == user.id)
    )
    note = result.scalar_one_or_none()

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found",
        )

    # Delete from vector database
    from app.db.qdrant import delete_vectors

    await delete_vectors(user_id=str(user.id), note_id=str(note_id))

    # Delete from PostgreSQL (cascades to related tables)
    await db.delete(note)
    await db.commit()
