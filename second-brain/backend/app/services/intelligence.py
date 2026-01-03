"""
Intelligence Service

Handles AI-powered features: RAG, function calling, summarization.
"""

from typing import Optional, List, Dict, Any
from uuid import UUID, uuid4

import anthropic
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.schemas import ChatResponse
from app.services.search import SearchService
from app.services.capture import CaptureService
from app.db.redis import cache_get, cache_set


# System prompt for the AI
SYSTEM_PROMPT = """You are a personal knowledge assistant called "Second Brain".
You help the user retrieve, connect, and build upon their own captured knowledge.

When answering questions:
1. ALWAYS search the user's knowledge base first
2. Ground your answers in their actual notes and experiences
3. Cite sources by mentioning when/where they learned something
4. If you can't find relevant knowledge, say so honestly
5. Suggest connections between ideas when relevant
6. Identify knowledge gaps if asked

You have access to these tools:
- search_knowledge: Search the user's knowledge base
- add_note: Capture new knowledge
- find_connections: Find related notes
- summarize_topic: Summarize everything on a topic

Be concise but thorough. Use the user's own words and examples when possible."""


class IntelligenceService:
    """
    Service for AI-powered intelligence features.

    Handles:
    - RAG (Retrieval Augmented Generation)
    - Function calling for knowledge operations
    - Conversation management
    - Topic summarization
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        self.search_service = SearchService(db)
        self.capture_service = CaptureService(db)

        # Define tools for function calling
        self.tools = [
            {
                "name": "search_knowledge",
                "description": "Search the user's knowledge base for relevant notes and information. Use this to find what the user has previously learned or captured.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Natural language search query"
                        },
                        "tags": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Optional tags to filter by"
                        }
                    },
                    "required": ["query"]
                }
            },
            {
                "name": "add_note",
                "description": "Capture new knowledge to the user's second brain. Use this when the user wants to remember something.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "content": {
                            "type": "string",
                            "description": "The knowledge to capture"
                        },
                        "tags": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Tags for categorization"
                        }
                    },
                    "required": ["content"]
                }
            },
            {
                "name": "find_connections",
                "description": "Find notes that are semantically related to a concept or topic.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "concept": {
                            "type": "string",
                            "description": "The concept to find connections for"
                        }
                    },
                    "required": ["concept"]
                }
            },
            {
                "name": "summarize_topic",
                "description": "Summarize everything the user knows about a topic based on their captured knowledge.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "topic": {
                            "type": "string",
                            "description": "The topic to summarize"
                        },
                        "include_gaps": {
                            "type": "boolean",
                            "description": "Whether to identify knowledge gaps"
                        }
                    },
                    "required": ["topic"]
                }
            }
        ]

    async def chat(
        self,
        user_id: UUID,
        message: str,
        conversation_id: Optional[str] = None,
    ) -> ChatResponse:
        """
        Chat with the knowledge base using RAG and function calling.

        Args:
            user_id: The user's ID
            message: User's message
            conversation_id: Optional ID for conversation continuity

        Returns:
            AI response with sources and tool calls
        """
        # Get or create conversation history
        conversation_id = conversation_id or str(uuid4())
        history = await self._get_conversation_history(conversation_id)

        # Add user message to history
        history.append({"role": "user", "content": message})

        # Make initial API call
        response = await self.client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            tools=self.tools,
            messages=history,
        )

        # Track tool calls and sources
        tool_calls = []
        sources_used = []

        # Handle tool use loop
        while response.stop_reason == "tool_use":
            # Extract tool calls from response
            tool_use_blocks = [
                block for block in response.content
                if block.type == "tool_use"
            ]

            # Execute each tool
            tool_results = []
            for tool_use in tool_use_blocks:
                tool_calls.append(tool_use.name)
                result = await self._execute_tool(
                    user_id=user_id,
                    tool_name=tool_use.name,
                    tool_input=tool_use.input,
                )

                # Track sources
                if tool_use.name == "search_knowledge" and result.get("results"):
                    sources_used.extend(result["results"][:3])

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use.id,
                    "content": str(result),
                })

            # Add assistant response and tool results to history
            history.append({"role": "assistant", "content": response.content})
            history.append({"role": "user", "content": tool_results})

            # Continue conversation
            response = await self.client.messages.create(
                model=settings.ANTHROPIC_MODEL,
                max_tokens=2048,
                system=SYSTEM_PROMPT,
                tools=self.tools,
                messages=history,
            )

        # Extract final text response
        final_text = ""
        for block in response.content:
            if hasattr(block, "text"):
                final_text += block.text

        # Add final response to history
        history.append({"role": "assistant", "content": response.content})

        # Save conversation history
        await self._save_conversation_history(conversation_id, history)

        return ChatResponse(
            response=final_text,
            conversation_id=conversation_id,
            sources_used=sources_used,
            tool_calls=tool_calls,
        )

    async def _execute_tool(
        self,
        user_id: UUID,
        tool_name: str,
        tool_input: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute a tool and return the result."""

        if tool_name == "search_knowledge":
            from app.models.schemas import SearchFilters
            filters = None
            if tool_input.get("tags"):
                filters = SearchFilters(tags=tool_input["tags"])

            result = await self.search_service.search(
                user_id=user_id,
                query=tool_input["query"],
                filters=filters,
                top_k=5,
            )
            return {
                "results": [
                    {
                        "content": r.preview,
                        "tags": r.tags,
                        "created_at": r.created_at.isoformat(),
                    }
                    for r in result.results
                ]
            }

        elif tool_name == "add_note":
            result = await self.capture_service.capture(
                user_id=user_id,
                content=tool_input["content"],
                tags=tool_input.get("tags"),
                source="chat",
            )
            return {"note_id": str(result.note_id), "message": "Note captured"}

        elif tool_name == "find_connections":
            result = await self.search_service.search(
                user_id=user_id,
                query=tool_input["concept"],
                top_k=5,
            )
            return {
                "connections": [
                    {"content": r.preview, "score": r.score}
                    for r in result.results
                ]
            }

        elif tool_name == "summarize_topic":
            # Search for all notes on topic
            result = await self.search_service.search(
                user_id=user_id,
                query=tool_input["topic"],
                top_k=10,
            )
            return {
                "notes_found": len(result.results),
                "notes": [r.preview for r in result.results],
            }

        return {"error": f"Unknown tool: {tool_name}"}

    async def _get_conversation_history(
        self,
        conversation_id: str,
    ) -> List[Dict[str, Any]]:
        """Get conversation history from cache."""
        history = await cache_get(f"conversation:{conversation_id}")
        return history or []

    async def _save_conversation_history(
        self,
        conversation_id: str,
        history: List[Dict[str, Any]],
    ) -> None:
        """Save conversation history to cache."""
        # Keep only last 20 messages to prevent context overflow
        trimmed_history = history[-20:]
        await cache_set(
            f"conversation:{conversation_id}",
            trimmed_history,
            expire_seconds=3600,  # 1 hour
        )
