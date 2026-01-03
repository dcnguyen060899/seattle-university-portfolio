"""
Embedding Service

Handles text embedding generation using Voyage AI or OpenAI.
"""

from typing import List, Optional
import tiktoken

import voyageai

from app.core.config import settings


class EmbeddingService:
    """
    Service for generating text embeddings.

    Uses Voyage AI by default for high-quality retrieval embeddings.
    Falls back to OpenAI if Voyage is not configured.
    """

    def __init__(self):
        self.client: Optional[voyageai.AsyncClient] = None
        self.tokenizer = tiktoken.get_encoding("cl100k_base")

        if settings.VOYAGE_API_KEY:
            self.client = voyageai.AsyncClient(api_key=settings.VOYAGE_API_KEY)
            self.model = settings.VOYAGE_MODEL
        else:
            # Fallback or raise error
            raise ValueError(
                "VOYAGE_API_KEY is required. Set it in your environment variables."
            )

    async def embed(
        self,
        texts: List[str],
        input_type: str = "document",
    ) -> List[List[float]]:
        """
        Generate embeddings for a list of texts.

        Args:
            texts: List of text strings to embed
            input_type: "document" for storage, "query" for search

        Returns:
            List of embedding vectors
        """
        if not texts:
            return []

        # Voyage AI embedding
        result = await self.client.embed(
            texts=texts,
            model=self.model,
            input_type=input_type,
        )

        return result.embeddings

    async def embed_query(self, query: str) -> List[float]:
        """
        Generate embedding for a search query.

        Uses "query" input type for better retrieval performance.

        Args:
            query: Search query text

        Returns:
            Embedding vector
        """
        embeddings = await self.embed([query], input_type="query")
        return embeddings[0]

    async def embed_document(self, text: str) -> List[float]:
        """
        Generate embedding for a document/note.

        Uses "document" input type.

        Args:
            text: Document text

        Returns:
            Embedding vector
        """
        embeddings = await self.embed([text], input_type="document")
        return embeddings[0]

    def count_tokens(self, text: str) -> int:
        """Count tokens in text using tiktoken."""
        return len(self.tokenizer.encode(text))

    def chunk_text(
        self,
        text: str,
        max_tokens: int = settings.MAX_CHUNK_TOKENS,
        overlap_tokens: int = settings.CHUNK_OVERLAP_TOKENS,
    ) -> List[str]:
        """
        Split text into chunks for embedding.

        Uses token-based splitting with overlap for context preservation.

        Args:
            text: Text to chunk
            max_tokens: Maximum tokens per chunk
            overlap_tokens: Overlap between chunks

        Returns:
            List of text chunks
        """
        tokens = self.tokenizer.encode(text)

        if len(tokens) <= max_tokens:
            return [text]

        chunks = []
        start = 0

        while start < len(tokens):
            end = start + max_tokens

            # Get chunk tokens
            chunk_tokens = tokens[start:end]

            # Decode back to text
            chunk_text = self.tokenizer.decode(chunk_tokens)
            chunks.append(chunk_text)

            # Move start with overlap
            start = end - overlap_tokens

        return chunks


# Singleton instance
_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    """Get or create the embedding service singleton."""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service
