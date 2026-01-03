"""
Capture Service

Handles knowledge capture, processing, and storage.
"""

from typing import List, Dict, Any, Optional
from uuid import UUID, uuid4
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.db_models import Note, Chunk, Tag, NoteTag, Entity, NoteEntity, Connection
from app.models.schemas import CaptureResult
from app.services.embeddings import get_embedding_service
from app.db.qdrant import upsert_vectors, search_vectors
from app.core.config import settings


class CaptureService:
    """
    Service for capturing and processing new knowledge.

    Responsibilities:
    - Parse and validate content
    - Chunk long content
    - Generate embeddings
    - Extract entities
    - Auto-generate tags
    - Find connections to existing knowledge
    - Store in databases
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.embedding_service = get_embedding_service()

    async def capture(
        self,
        user_id: UUID,
        content: str,
        source: Optional[str] = None,
        source_url: Optional[str] = None,
        tags: Optional[List[str]] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> CaptureResult:
        """
        Capture new knowledge.

        Args:
            user_id: Owner of the note
            content: The knowledge content
            source: Where it came from (e.g., "claude-code", "web")
            source_url: URL if applicable
            tags: User-provided tags
            context: Additional context (project, session, etc.)

        Returns:
            CaptureResult with note_id, tags, entities, connections
        """
        context = context or {}
        tags = tags or []

        # 1. Create the note
        note = Note(
            user_id=user_id,
            content=content,
            source=source,
            source_url=source_url,
            context=context,
        )
        self.db.add(note)
        await self.db.flush()  # Get the note ID

        # 2. Chunk content if needed
        chunks = self.embedding_service.chunk_text(content)

        # 3. Generate embeddings for each chunk
        embeddings = await self.embedding_service.embed(chunks, input_type="document")

        # 4. Store chunks in database and vector store
        vector_points = []
        for i, (chunk_text, embedding) in enumerate(zip(chunks, embeddings)):
            # Generate unique ID for this chunk (UUID for Qdrant compatibility)
            chunk_id = str(uuid4())

            # Create chunk record
            chunk = Chunk(
                note_id=note.id,
                content=chunk_text,
                chunk_index=i,
                token_count=self.embedding_service.count_tokens(chunk_text),
                embedding_id=chunk_id,
            )
            self.db.add(chunk)

            # Prepare vector for Qdrant (use UUID as ID)
            vector_points.append({
                "id": chunk_id,
                "vector": embedding,
                "payload": {
                    "user_id": str(user_id),
                    "note_id": str(note.id),
                    "chunk_index": i,
                    "content": chunk_text[:500],  # Store preview
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "tags": tags,
                    "source": source,
                    "project": context.get("project"),
                    "learning_type": context.get("learning_type", "insight"),
                },
            })

        # 5. Store vectors in Qdrant
        await upsert_vectors(vector_points)

        # 6. Extract entities (simplified - in production use LLM)
        entities = await self._extract_entities(content, user_id)

        # 7. Auto-generate tags (simplified - in production use LLM)
        auto_tags = await self._generate_tags(content, entities)
        all_tags = list(set(tags + auto_tags))

        # 8. Store tags
        await self._store_tags(note.id, user_id, all_tags)

        # 9. Store entities
        await self._store_entities(note.id, user_id, entities)

        # 10. Find connections to existing notes
        connections = await self._find_connections(
            user_id=user_id,
            note_id=note.id,
            embedding=embeddings[0],  # Use first chunk embedding
        )

        # 11. Update note counts
        note.entity_count = len(entities)
        note.connection_count = len(connections)

        await self.db.commit()

        return CaptureResult(
            note_id=note.id,
            tags=all_tags,
            entities=[e["name"] for e in entities],
            connections=connections,
        )

    async def _extract_entities(
        self,
        content: str,
        user_id: UUID,
    ) -> List[Dict[str, str]]:
        """
        Extract entities from content.

        In production, this would use an LLM for better extraction.
        For MVP, we use simple pattern matching.
        """
        entities = []

        # Simple keyword-based extraction (replace with LLM later)
        tech_keywords = [
            "python", "javascript", "typescript", "react", "flask", "fastapi",
            "postgresql", "redis", "docker", "kubernetes", "aws", "gcp",
            "machine learning", "deep learning", "neural network", "pytorch",
            "tensorflow", "langchain", "openai", "anthropic", "claude",
            "cors", "api", "rest", "graphql", "sql", "nosql",
        ]

        content_lower = content.lower()
        for keyword in tech_keywords:
            if keyword in content_lower:
                entities.append({
                    "name": keyword,
                    "type": "tool" if keyword in ["python", "javascript", "react"] else "concept",
                })

        return entities[:10]  # Limit to 10 entities

    async def _generate_tags(
        self,
        content: str,
        entities: List[Dict[str, str]],
    ) -> List[str]:
        """
        Auto-generate tags based on content and entities.

        In production, this would use an LLM.
        """
        tags = []

        # Add entity names as tags
        for entity in entities:
            tags.append(entity["name"].replace(" ", "-"))

        # Simple content-based tagging
        content_lower = content.lower()
        if "error" in content_lower or "bug" in content_lower or "fix" in content_lower:
            tags.append("debugging")
        if "learn" in content_lower or "understand" in content_lower:
            tags.append("learning")
        if "todo" in content_lower or "implement" in content_lower:
            tags.append("task")

        return list(set(tags))[:5]  # Limit to 5 auto-tags

    async def _store_tags(
        self,
        note_id: UUID,
        user_id: UUID,
        tag_names: List[str],
    ) -> None:
        """Store tags and create note-tag associations."""
        for tag_name in tag_names:
            # Get or create tag
            result = await self.db.execute(
                select(Tag).where(Tag.user_id == user_id, Tag.name == tag_name)
            )
            tag = result.scalar_one_or_none()

            if not tag:
                tag = Tag(user_id=user_id, name=tag_name, tag_type="auto")
                self.db.add(tag)
                await self.db.flush()

            # Update usage count
            tag.usage_count += 1

            # Create association
            note_tag = NoteTag(note_id=note_id, tag_id=tag.id)
            self.db.add(note_tag)

    async def _store_entities(
        self,
        note_id: UUID,
        user_id: UUID,
        entities: List[Dict[str, str]],
    ) -> None:
        """Store entities and create note-entity associations."""
        for entity_data in entities:
            # Get or create entity
            result = await self.db.execute(
                select(Entity).where(
                    Entity.user_id == user_id,
                    Entity.name == entity_data["name"],
                    Entity.entity_type == entity_data["type"],
                )
            )
            entity = result.scalar_one_or_none()

            if not entity:
                entity = Entity(
                    user_id=user_id,
                    name=entity_data["name"],
                    entity_type=entity_data["type"],
                )
                self.db.add(entity)
                await self.db.flush()

            # Update usage count
            entity.usage_count += 1

            # Create association
            note_entity = NoteEntity(note_id=note_id, entity_id=entity.id)
            self.db.add(note_entity)

    async def _find_connections(
        self,
        user_id: UUID,
        note_id: UUID,
        embedding: List[float],
        threshold: float = 0.7,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Find connections to existing notes using vector similarity.
        """
        # Search for similar notes
        results = await search_vectors(
            query_vector=embedding,
            user_id=str(user_id),
            limit=limit + 5,  # Extra buffer for filtering
            score_threshold=threshold,
        )

        connections = []
        for result in results:
            target_note_id_str = result["payload"].get("note_id")

            # Skip self
            if target_note_id_str == str(note_id):
                continue

            # Skip if target_note_id is missing
            if not target_note_id_str:
                continue

            try:
                target_note_id = UUID(target_note_id_str)
            except (ValueError, TypeError):
                continue

            # Verify target note exists in PostgreSQL
            target_result = await self.db.execute(
                select(Note).where(Note.id == target_note_id, Note.user_id == user_id)
            )
            target_note = target_result.scalar_one_or_none()

            if not target_note:
                # Skip orphan vectors that don't have a corresponding note
                continue

            # Create connection record
            connection = Connection(
                user_id=user_id,
                source_note_id=note_id,
                target_note_id=target_note_id,
                connection_type="semantic",
                strength=result["score"],
            )
            self.db.add(connection)

            connections.append({
                "note_id": target_note_id_str,
                "preview": result["payload"].get("content", "")[:100],
                "strength": result["score"],
            })

            if len(connections) >= limit:
                break

        return connections
