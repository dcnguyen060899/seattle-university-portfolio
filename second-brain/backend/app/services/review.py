"""
Review Service

Handles spaced repetition using SM-2 algorithm.
"""

from typing import List, Dict, Any, Optional
from uuid import UUID
from datetime import datetime, timezone, timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.db_models import Note, Review
from app.models.schemas import ReviewDue


class ReviewService:
    """
    Service for spaced repetition reviews.

    Implements the SM-2 algorithm for optimal review scheduling.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_due_reviews(
        self,
        user_id: UUID,
        limit: int = 10,
    ) -> List[ReviewDue]:
        """
        Get notes due for review.

        Args:
            user_id: The user's ID
            limit: Maximum reviews to return

        Returns:
            List of notes due for review
        """
        now = datetime.now(timezone.utc)

        # Query reviews due (or new notes without reviews)
        result = await self.db.execute(
            select(Review, Note)
            .join(Note, Review.note_id == Note.id)
            .where(
                Review.user_id == user_id,
                Review.next_review_at <= now,
            )
            .order_by(Review.next_review_at.asc())
            .limit(limit)
        )

        due_reviews = []
        for review, note in result.all():
            due_reviews.append(
                ReviewDue(
                    note_id=note.id,
                    content_preview=note.content[:200] + "..." if len(note.content) > 200 else note.content,
                    tags=[],  # TODO: Load tags
                    last_reviewed_at=review.last_reviewed_at,
                    review_count=review.repetitions,
                    ease_factor=review.ease_factor,
                )
            )

        return due_reviews

    async def process_review(
        self,
        user_id: UUID,
        note_id: UUID,
        rating: int,
    ) -> Dict[str, Any]:
        """
        Process a review submission using SM-2 algorithm.

        SM-2 Rating Scale:
        0 - Complete blackout, no recall
        1 - Incorrect, but recognized when shown
        2 - Incorrect, but easy to recall once reminded
        3 - Correct with serious difficulty
        4 - Correct with some hesitation
        5 - Perfect recall

        Args:
            user_id: The user's ID
            note_id: The note that was reviewed
            rating: SM-2 rating 0-5

        Returns:
            Updated review info with next review date
        """
        # Get or create review record
        result = await self.db.execute(
            select(Review).where(
                Review.user_id == user_id,
                Review.note_id == note_id,
            )
        )
        review = result.scalar_one_or_none()

        if not review:
            review = Review(
                user_id=user_id,
                note_id=note_id,
                ease_factor=2.5,
                interval_days=1,
                repetitions=0,
            )
            self.db.add(review)

        # Apply SM-2 algorithm
        new_repetitions, new_ease_factor, new_interval = self._sm2(
            quality=rating,
            repetitions=review.repetitions,
            ease_factor=review.ease_factor,
            interval=review.interval_days,
        )

        # Update review record
        review.repetitions = new_repetitions
        review.ease_factor = new_ease_factor
        review.interval_days = new_interval
        review.last_reviewed_at = datetime.now(timezone.utc)
        review.last_rating = rating
        review.next_review_at = datetime.now(timezone.utc) + timedelta(days=new_interval)

        # Update note's last reviewed timestamp
        note_result = await self.db.execute(
            select(Note).where(Note.id == note_id)
        )
        note = note_result.scalar_one()
        note.last_reviewed_at = review.last_reviewed_at
        note.review_count += 1

        await self.db.commit()

        return {
            "note_id": str(note_id),
            "next_review_at": review.next_review_at.isoformat(),
            "interval_days": new_interval,
            "ease_factor": round(new_ease_factor, 2),
            "repetitions": new_repetitions,
        }

    def _sm2(
        self,
        quality: int,
        repetitions: int,
        ease_factor: float,
        interval: int,
    ) -> tuple[int, float, int]:
        """
        SM-2 Spaced Repetition Algorithm.

        Args:
            quality: Rating 0-5
            repetitions: Number of successful reviews
            ease_factor: Difficulty multiplier (starts at 2.5)
            interval: Current interval in days

        Returns:
            Tuple of (new_repetitions, new_ease_factor, new_interval)
        """
        if quality < 3:
            # Failed recall - reset
            repetitions = 0
            interval = 1
        else:
            # Successful recall
            if repetitions == 0:
                interval = 1
            elif repetitions == 1:
                interval = 6
            else:
                interval = round(interval * ease_factor)
            repetitions += 1

        # Update ease factor
        # EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
        ease_factor = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))

        # Minimum ease factor of 1.3
        ease_factor = max(1.3, ease_factor)

        return repetitions, ease_factor, interval

    async def get_stats(self, user_id: UUID) -> Dict[str, Any]:
        """
        Get review statistics for a user.
        """
        now = datetime.now(timezone.utc)

        # Total reviews
        total_result = await self.db.execute(
            select(func.count(Review.id)).where(
                Review.user_id == user_id,
                Review.last_reviewed_at.isnot(None),
            )
        )
        total_reviews = total_result.scalar() or 0

        # Due today
        due_result = await self.db.execute(
            select(func.count(Review.id)).where(
                Review.user_id == user_id,
                Review.next_review_at <= now,
            )
        )
        due_today = due_result.scalar() or 0

        # Average ease factor
        avg_result = await self.db.execute(
            select(func.avg(Review.ease_factor)).where(
                Review.user_id == user_id,
            )
        )
        avg_ease_factor = avg_result.scalar() or 2.5

        # Calculate streak (consecutive days with reviews)
        # Simplified: just check if reviewed today
        streak_result = await self.db.execute(
            select(func.count(Review.id)).where(
                Review.user_id == user_id,
                Review.last_reviewed_at >= now - timedelta(days=1),
            )
        )
        has_reviewed_today = (streak_result.scalar() or 0) > 0

        return {
            "total_reviews": total_reviews,
            "due_today": due_today,
            "current_streak": 1 if has_reviewed_today else 0,
            "average_ease_factor": round(avg_ease_factor, 2),
        }

    async def initialize_review(
        self,
        user_id: UUID,
        note_id: UUID,
    ) -> Review:
        """
        Initialize a review record for a new note.
        Called after note capture.
        """
        review = Review(
            user_id=user_id,
            note_id=note_id,
            ease_factor=2.5,
            interval_days=1,
            repetitions=0,
            next_review_at=datetime.now(timezone.utc) + timedelta(days=1),
        )
        self.db.add(review)
        await self.db.flush()
        return review
