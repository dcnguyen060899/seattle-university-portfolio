"""
Reviews API Endpoints

Spaced repetition review system.
"""

from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.postgres import get_db
from app.api.deps import get_current_user, get_pagination, Pagination
from app.models.db_models import User, Note, Review
from app.models.schemas import ReviewSubmit, ReviewDue, ReviewListResponse
from app.services.review import ReviewService


router = APIRouter()


@router.get("/due", response_model=ReviewListResponse)
async def get_due_reviews(
    pagination: Pagination = Depends(get_pagination),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get notes due for review.

    Returns notes that are scheduled for review based on the
    SM-2 spaced repetition algorithm.

    Args:
        limit: Maximum number of reviews to return

    Returns:
        List of notes due for review with metadata
    """
    review_service = ReviewService(db)
    due_reviews = await review_service.get_due_reviews(
        user_id=user.id,
        limit=pagination.limit,
    )

    return ReviewListResponse(
        due_count=len(due_reviews),
        reviews=due_reviews,
    )


@router.post("/{note_id}", status_code=status.HTTP_200_OK)
async def submit_review(
    note_id: UUID,
    review_data: ReviewSubmit,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Submit a review result for a note.

    Uses the SM-2 algorithm to schedule the next review:
    - Rating 0-2: Reset (forgot the content)
    - Rating 3: Correct with difficulty
    - Rating 4: Correct with hesitation
    - Rating 5: Perfect recall

    Args:
        note_id: The note that was reviewed
        review_data: Rating 0-5

    Returns:
        Next review date and updated stats
    """
    # Verify note exists and belongs to user
    result = await db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == user.id)
    )
    note = result.scalar_one_or_none()

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found",
        )

    review_service = ReviewService(db)
    result = await review_service.process_review(
        user_id=user.id,
        note_id=note_id,
        rating=review_data.rating,
    )

    return result


@router.get("/stats")
async def get_review_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get review statistics.

    Returns:
        - Total reviews completed
        - Current streak
        - Notes due today
        - Average ease factor
    """
    review_service = ReviewService(db)
    stats = await review_service.get_stats(user_id=user.id)
    return stats
