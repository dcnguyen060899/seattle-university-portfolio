"""
Search Service

Handles semantic search and retrieval.
"""

from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.db_models import Note
from app.models.schemas import SearchQuery, SearchResult, SearchResultItem, SearchFilters
from app.services.embeddings import get_embedding_service
from app.db.qdrant import search_vectors


class SearchService:
    """
    Service for semantic search across knowledge base.

    Supports:
    - Natural language queries
    - Fuzzy temporal references
    - Tag and project filtering
    - Date range filtering
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.embedding_service = get_embedding_service()

    async def search(
        self,
        user_id: UUID,
        query: str,
        filters: Optional[SearchFilters] = None,
        top_k: int = 10,
    ) -> SearchResult:
        """
        Perform semantic search.

        Args:
            user_id: The user performing the search
            query: Natural language search query
            filters: Optional filters (tags, dates, project)
            top_k: Maximum results to return

        Returns:
            SearchResult with ranked matches
        """
        # 1. Parse query for implicit filters (future: use LLM)
        parsed_filters = self._parse_query_filters(query, filters)

        # 2. Generate query embedding
        query_embedding = await self.embedding_service.embed_query(query)

        # 3. Build filter dict for Qdrant
        qdrant_filters = self._build_qdrant_filters(parsed_filters)

        # 4. Search vector database
        vector_results = await search_vectors(
            query_vector=query_embedding,
            user_id=str(user_id),
            limit=top_k * 2,  # Over-fetch for deduplication
            filters=qdrant_filters,
            score_threshold=0.5,
        )

        # 5. Deduplicate by note_id (multiple chunks may match)
        seen_notes = set()
        unique_results = []
        for result in vector_results:
            note_id = result["payload"].get("note_id")
            if note_id not in seen_notes:
                seen_notes.add(note_id)
                unique_results.append(result)
                if len(unique_results) >= top_k:
                    break

        # 6. Enrich results with full note data
        enriched_results = await self._enrich_results(unique_results)

        return SearchResult(
            query=query,
            total_results=len(enriched_results),
            results=enriched_results,
            filters_applied=parsed_filters,
        )

    def _parse_query_filters(
        self,
        query: str,
        explicit_filters: Optional[SearchFilters],
    ) -> SearchFilters:
        """
        Parse implicit filters from query.

        Examples:
        - "that thing from last week" → date_after = 7 days ago
        - "python debugging" → could extract "python" as tag

        In production, use an LLM for better parsing.
        """
        filters = explicit_filters or SearchFilters()

        query_lower = query.lower()

        # Simple temporal parsing (replace with LLM later)
        if "last week" in query_lower or "this week" in query_lower:
            from datetime import timedelta
            filters.date_after = datetime.now() - timedelta(days=7)
        elif "last month" in query_lower or "this month" in query_lower:
            from datetime import timedelta
            filters.date_after = datetime.now() - timedelta(days=30)
        elif "yesterday" in query_lower:
            from datetime import timedelta
            filters.date_after = datetime.now() - timedelta(days=1)

        return filters

    def _build_qdrant_filters(
        self,
        filters: Optional[SearchFilters],
    ) -> Optional[Dict[str, Any]]:
        """Convert SearchFilters to Qdrant filter format."""
        if not filters:
            return None

        qdrant_filters = {}

        if filters.tags:
            qdrant_filters["tags"] = filters.tags

        if filters.date_after:
            qdrant_filters["date_after"] = filters.date_after.isoformat()

        if filters.date_before:
            qdrant_filters["date_before"] = filters.date_before.isoformat()

        if filters.project:
            qdrant_filters["project"] = filters.project

        return qdrant_filters if qdrant_filters else None

    async def _enrich_results(
        self,
        vector_results: List[Dict[str, Any]],
    ) -> List[SearchResultItem]:
        """
        Enrich vector search results with full note data.
        """
        enriched = []

        for result in vector_results:
            payload = result["payload"]
            note_id = payload.get("note_id")

            # Get full note from database
            db_result = await self.db.execute(
                select(Note).where(Note.id == UUID(note_id))
            )
            note = db_result.scalar_one_or_none()

            if note:
                enriched.append(
                    SearchResultItem(
                        note_id=note.id,
                        content=note.content,
                        score=result["score"],
                        tags=payload.get("tags", []),
                        source=note.source,
                        created_at=note.created_at,
                        preview=note.content[:200] + "..." if len(note.content) > 200 else note.content,
                    )
                )

        return enriched
