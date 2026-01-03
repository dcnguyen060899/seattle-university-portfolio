"""
SQLAlchemy Database Models

These models define the database schema for PostgreSQL.
"""

from datetime import datetime, timezone
from typing import Optional, List
from uuid import uuid4

from sqlalchemy import (
    String,
    Text,
    Integer,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.postgres import Base


def utc_now() -> datetime:
    """Get current UTC timestamp."""
    return datetime.now(timezone.utc)


class User(Base):
    """User model."""

    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)
    subscription_tier: Mapped[str] = mapped_column(String(50), default="free")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    notes: Mapped[List["Note"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    tags: Mapped[List["Tag"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    entities: Mapped[List["Entity"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Note(Base):
    """Note model - core knowledge unit."""

    __tablename__ = "notes"

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    user_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(String(50), default="text")
    source: Mapped[Optional[str]] = mapped_column(String(255))
    source_url: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )
    context: Mapped[dict] = mapped_column(JSONB, default=dict)

    # Denormalized counts for faster queries
    entity_count: Mapped[int] = mapped_column(Integer, default=0)
    connection_count: Mapped[int] = mapped_column(Integer, default=0)
    review_count: Mapped[int] = mapped_column(Integer, default=0)
    last_reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Relationships
    user: Mapped["User"] = relationship(back_populates="notes")
    chunks: Mapped[List["Chunk"]] = relationship(
        back_populates="note", cascade="all, delete-orphan"
    )
    note_tags: Mapped[List["NoteTag"]] = relationship(
        back_populates="note", cascade="all, delete-orphan"
    )
    note_entities: Mapped[List["NoteEntity"]] = relationship(
        back_populates="note", cascade="all, delete-orphan"
    )
    reviews: Mapped[List["Review"]] = relationship(
        back_populates="note", cascade="all, delete-orphan"
    )

    # Connection relationships
    outgoing_connections: Mapped[List["Connection"]] = relationship(
        back_populates="source_note",
        foreign_keys="Connection.source_note_id",
        cascade="all, delete-orphan",
    )
    incoming_connections: Mapped[List["Connection"]] = relationship(
        back_populates="target_note",
        foreign_keys="Connection.target_note_id",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("idx_notes_user_id", "user_id"),
        Index("idx_notes_created_at", "created_at"),
    )


class Chunk(Base):
    """Chunk model - for long content that's been split."""

    __tablename__ = "chunks"

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    note_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("notes.id", ondelete="CASCADE"),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    token_count: Mapped[Optional[int]] = mapped_column(Integer)
    embedding_id: Mapped[Optional[str]] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    # Relationships
    note: Mapped["Note"] = relationship(back_populates="chunks")

    __table_args__ = (Index("idx_chunks_note_id", "note_id"),)


class Tag(Base):
    """Tag model."""

    __tablename__ = "tags"

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    user_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    tag_type: Mapped[str] = mapped_column(String(50), default="user")
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="tags")
    note_tags: Mapped[List["NoteTag"]] = relationship(
        back_populates="tag", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_tag_user_name"),
        Index("idx_tags_user_id", "user_id"),
    )


class NoteTag(Base):
    """Note-Tag junction table."""

    __tablename__ = "note_tags"

    note_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("notes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tag_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    )
    confidence: Mapped[float] = mapped_column(Float, default=1.0)

    # Relationships
    note: Mapped["Note"] = relationship(back_populates="note_tags")
    tag: Mapped["Tag"] = relationship(back_populates="note_tags")


class Entity(Base):
    """Entity model - extracted concepts, tools, etc."""

    __tablename__ = "entities"

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    user_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="entities")
    note_entities: Mapped[List["NoteEntity"]] = relationship(
        back_populates="entity", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("user_id", "name", "entity_type", name="uq_entity_user_name_type"),
        Index("idx_entities_user_id", "user_id"),
    )


class NoteEntity(Base):
    """Note-Entity junction table."""

    __tablename__ = "note_entities"

    note_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("notes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    entity_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        primary_key=True,
    )
    confidence: Mapped[float] = mapped_column(Float, default=1.0)

    # Relationships
    note: Mapped["Note"] = relationship(back_populates="note_entities")
    entity: Mapped["Entity"] = relationship(back_populates="note_entities")


class Connection(Base):
    """Connection model - relationships between notes."""

    __tablename__ = "connections"

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    user_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    source_note_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("notes.id", ondelete="CASCADE"),
        nullable=False,
    )
    target_note_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("notes.id", ondelete="CASCADE"),
        nullable=False,
    )
    connection_type: Mapped[str] = mapped_column(String(50), default="semantic")
    strength: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    # Relationships
    source_note: Mapped["Note"] = relationship(
        back_populates="outgoing_connections",
        foreign_keys=[source_note_id],
    )
    target_note: Mapped["Note"] = relationship(
        back_populates="incoming_connections",
        foreign_keys=[target_note_id],
    )

    __table_args__ = (
        UniqueConstraint("source_note_id", "target_note_id", name="uq_connection_notes"),
        Index("idx_connections_source", "source_note_id"),
        Index("idx_connections_target", "target_note_id"),
    )


class Review(Base):
    """Review model - spaced repetition tracking."""

    __tablename__ = "reviews"

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    user_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    note_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("notes.id", ondelete="CASCADE"),
        nullable=False,
    )
    review_type: Mapped[str] = mapped_column(String(50), default="recall")

    # SM-2 algorithm fields
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5)
    interval_days: Mapped[int] = mapped_column(Integer, default=1)
    repetitions: Mapped[int] = mapped_column(Integer, default=0)

    next_review_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_rating: Mapped[Optional[int]] = mapped_column(Integer)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    # Relationships
    note: Mapped["Note"] = relationship(back_populates="reviews")

    __table_args__ = (Index("idx_reviews_next", "user_id", "next_review_at"),)
