"""
Qdrant Vector Database Connection

Handles vector storage and similarity search.
"""

from typing import Optional, List, Dict, Any

from qdrant_client import QdrantClient, AsyncQdrantClient
from qdrant_client.http import models as qdrant_models
from qdrant_client.http.exceptions import UnexpectedResponse

from app.core.config import settings


# Global client instances
_qdrant_client: Optional[AsyncQdrantClient] = None


async def get_qdrant_client() -> AsyncQdrantClient:
    """Get the Qdrant client instance."""
    global _qdrant_client
    if _qdrant_client is None:
        raise RuntimeError("Qdrant client not initialized. Call init_qdrant() first.")
    return _qdrant_client


async def init_qdrant() -> None:
    """
    Initialize Qdrant connection and ensure collection exists.
    """
    global _qdrant_client

    # Create async client
    if settings.QDRANT_API_KEY:
        _qdrant_client = AsyncQdrantClient(
            host=settings.QDRANT_HOST,
            port=settings.QDRANT_PORT,
            api_key=settings.QDRANT_API_KEY,
            https=True,
        )
    else:
        _qdrant_client = AsyncQdrantClient(
            host=settings.QDRANT_HOST,
            port=settings.QDRANT_PORT,
        )

    # Ensure collection exists
    await _ensure_collection_exists()

    print(f"Qdrant connected: {settings.QDRANT_HOST}:{settings.QDRANT_PORT}")


async def _ensure_collection_exists() -> None:
    """Create the knowledge collection if it doesn't exist."""
    global _qdrant_client

    try:
        await _qdrant_client.get_collection(settings.QDRANT_COLLECTION_NAME)
        print(f"Qdrant collection '{settings.QDRANT_COLLECTION_NAME}' exists.")
    except UnexpectedResponse:
        # Collection doesn't exist, create it
        await _qdrant_client.create_collection(
            collection_name=settings.QDRANT_COLLECTION_NAME,
            vectors_config=qdrant_models.VectorParams(
                size=settings.EMBEDDING_DIMENSION,
                distance=qdrant_models.Distance.COSINE,
            ),
            # Optimized for filtering
            optimizers_config=qdrant_models.OptimizersConfigDiff(
                indexing_threshold=10000,
            ),
        )

        # Create payload indexes for common filters
        await _qdrant_client.create_payload_index(
            collection_name=settings.QDRANT_COLLECTION_NAME,
            field_name="user_id",
            field_schema=qdrant_models.PayloadSchemaType.KEYWORD,
        )
        await _qdrant_client.create_payload_index(
            collection_name=settings.QDRANT_COLLECTION_NAME,
            field_name="tags",
            field_schema=qdrant_models.PayloadSchemaType.KEYWORD,
        )
        await _qdrant_client.create_payload_index(
            collection_name=settings.QDRANT_COLLECTION_NAME,
            field_name="created_at",
            field_schema=qdrant_models.PayloadSchemaType.DATETIME,
        )

        print(f"Qdrant collection '{settings.QDRANT_COLLECTION_NAME}' created.")


async def close_qdrant() -> None:
    """Close Qdrant connection."""
    global _qdrant_client
    if _qdrant_client:
        await _qdrant_client.close()
        _qdrant_client = None
    print("Qdrant connection closed.")


# === Vector Operations ===


async def upsert_vectors(
    points: List[Dict[str, Any]],
) -> None:
    """
    Insert or update vectors in Qdrant.

    Args:
        points: List of dicts with 'id', 'vector', and 'payload'
    """
    client = await get_qdrant_client()

    qdrant_points = [
        qdrant_models.PointStruct(
            id=point["id"],
            vector=point["vector"],
            payload=point["payload"],
        )
        for point in points
    ]

    await client.upsert(
        collection_name=settings.QDRANT_COLLECTION_NAME,
        points=qdrant_points,
    )


async def search_vectors(
    query_vector: List[float],
    user_id: str,
    limit: int = 10,
    filters: Optional[Dict[str, Any]] = None,
    score_threshold: float = 0.5,
) -> List[Dict[str, Any]]:
    """
    Search for similar vectors.

    Args:
        query_vector: The query embedding
        user_id: Filter by user (required for security)
        limit: Maximum results to return
        filters: Additional filters (tags, date_range, etc.)
        score_threshold: Minimum similarity score

    Returns:
        List of matching documents with scores
    """
    client = await get_qdrant_client()

    # Build filter conditions
    must_conditions = [
        qdrant_models.FieldCondition(
            key="user_id",
            match=qdrant_models.MatchValue(value=user_id),
        )
    ]

    if filters:
        if "tags" in filters and filters["tags"]:
            must_conditions.append(
                qdrant_models.FieldCondition(
                    key="tags",
                    match=qdrant_models.MatchAny(any=filters["tags"]),
                )
            )

        if "date_after" in filters:
            must_conditions.append(
                qdrant_models.FieldCondition(
                    key="created_at",
                    range=qdrant_models.DatetimeRange(
                        gte=filters["date_after"],
                    ),
                )
            )

        if "date_before" in filters:
            must_conditions.append(
                qdrant_models.FieldCondition(
                    key="created_at",
                    range=qdrant_models.DatetimeRange(
                        lte=filters["date_before"],
                    ),
                )
            )

    # Execute search using query_points (new Qdrant API)
    results = await client.query_points(
        collection_name=settings.QDRANT_COLLECTION_NAME,
        query=query_vector,
        query_filter=qdrant_models.Filter(must=must_conditions),
        limit=limit,
        score_threshold=score_threshold,
        with_payload=True,
    )

    # Format results (results.points contains the matches)
    return [
        {
            "id": str(result.id),
            "score": result.score,
            "payload": result.payload,
        }
        for result in results.points
    ]


async def delete_vectors(
    user_id: str,
    note_id: Optional[str] = None,
) -> None:
    """
    Delete vectors for a user or specific note.

    Args:
        user_id: The user ID
        note_id: Optional specific note to delete
    """
    client = await get_qdrant_client()

    conditions = [
        qdrant_models.FieldCondition(
            key="user_id",
            match=qdrant_models.MatchValue(value=user_id),
        )
    ]

    if note_id:
        conditions.append(
            qdrant_models.FieldCondition(
                key="note_id",
                match=qdrant_models.MatchValue(value=note_id),
            )
        )

    await client.delete(
        collection_name=settings.QDRANT_COLLECTION_NAME,
        points_selector=qdrant_models.FilterSelector(
            filter=qdrant_models.Filter(must=conditions),
        ),
    )
