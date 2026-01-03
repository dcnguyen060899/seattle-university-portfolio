"""
Search API Endpoints

Semantic search and retrieval.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.api.deps import get_current_user
from app.models.db_models import User
from app.models.schemas import SearchQuery, SearchResult
from app.services.search import SearchService


router = APIRouter()


@router.post("", response_model=SearchResult)
async def search_notes(
    query: SearchQuery,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Semantic search across your knowledge base.

    This endpoint supports:
    - Natural language queries ("that API thing from last month")
    - Fuzzy temporal references ("last week", "a few days ago")
    - Tag filtering
    - Project filtering
    - Date range filtering

    The search uses vector similarity to find semantically relevant notes,
    not just keyword matching.

    Args:
        query: Search query with optional filters

    Returns:
        SearchResult with matched notes ranked by relevance
    """
    search_service = SearchService(db)
    result = await search_service.search(
        user_id=user.id,
        query=query.query,
        filters=query.filters,
        top_k=query.top_k,
    )
    return result
