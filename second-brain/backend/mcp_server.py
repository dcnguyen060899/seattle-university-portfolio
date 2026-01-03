#!/usr/bin/env python3
"""
Second Brain MCP Server (Unified)

Model Context Protocol server that integrates with Claude Code to:
- Capture learnings, solutions, and insights automatically
- Search past knowledge semantically
- Retrieve related concepts and solutions

This version calls the Second Brain backend API, so all data
is stored in the same database as the web dashboard.

Usage:
    python mcp_server.py

Configure in ~/.claude/settings.json:
{
  "mcpServers": {
    "second-brain": {
      "command": "python",
      "args": ["/path/to/second-brain/backend/mcp_server.py"],
      "env": {
        "SECOND_BRAIN_API_URL": "http://localhost:8000",
        "SECOND_BRAIN_API_KEY": "sb-mcp-dev-key-change-in-production"
      }
    }
  }
}
"""

import asyncio
import os
import sys
from typing import Any

# MCP SDK imports
try:
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp.types import (
        Tool,
        TextContent,
    )
except ImportError:
    print("MCP SDK not installed. Run: pip install mcp", file=sys.stderr)
    sys.exit(1)

import httpx

# Configuration
API_URL = os.getenv("SECOND_BRAIN_API_URL", "http://localhost:8000")
API_KEY = os.getenv("SECOND_BRAIN_API_KEY", "sb-mcp-dev-key-change-in-production")

# HTTP client
http_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    """Get or create HTTP client."""
    global http_client
    if http_client is None:
        http_client = httpx.AsyncClient(
            base_url=API_URL,
            timeout=30.0,
            headers={
                "X-API-Key": API_KEY,
                "Content-Type": "application/json",
            },
        )
    return http_client


async def capture_learning(
    content: str,
    learning_type: str = "insight",
    tags: list[str] | None = None,
    source: str = "claude-code",
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Capture a learning/insight to the Second Brain via API.

    Args:
        content: The main content/learning to capture
        learning_type: Type of learning (insight, solution, pattern, debug, concept, tool, config)
        tags: Optional list of tags for categorization
        source: Source of the learning (default: claude-code)
        context: Additional context about when/why this was learned

    Returns:
        Confirmation with the stored learning ID
    """
    client = get_http_client()

    payload = {
        "content": content,
        "learning_type": learning_type,
        "tags": tags or [],
        "source": source,
        "context": context,
    }

    response = await client.post("/api/v1/mcp/capture", json=payload)
    response.raise_for_status()
    data = response.json()

    return {
        "status": "captured",
        "note_id": data.get("note_id"),
        "tags": data.get("tags", []),
        "entities": data.get("entities", []),
        "connections": data.get("connections", []),
        "content_preview": content[:100] + "..." if len(content) > 100 else content,
    }


async def search_knowledge(
    query: str,
    limit: int = 5,
    learning_type: str | None = None,
    tags: list[str] | None = None,
) -> list[dict[str, Any]]:
    """
    Search past learnings semantically via API.

    Args:
        query: Search query
        limit: Maximum number of results (default: 5)
        learning_type: Filter by learning type
        tags: Filter by tags

    Returns:
        List of relevant past learnings
    """
    client = get_http_client()

    payload = {
        "query": query,
        "limit": limit,
    }
    if learning_type:
        payload["learning_type"] = learning_type
    if tags:
        payload["tags"] = tags

    response = await client.post("/api/v1/mcp/search", json=payload)
    response.raise_for_status()

    return response.json()


async def get_recent_learnings(
    limit: int = 10,
    learning_type: str | None = None,
) -> list[dict[str, Any]]:
    """
    Get recent learnings from the knowledge base via API.

    Args:
        limit: Maximum number of results
        learning_type: Filter by learning type

    Returns:
        List of recent learnings
    """
    client = get_http_client()

    params = {"limit": limit}
    if learning_type:
        params["learning_type"] = learning_type

    response = await client.get("/api/v1/mcp/recent", params=params)
    response.raise_for_status()

    return response.json()


# Create MCP server
server = Server("second-brain")


@server.list_tools()
async def list_tools() -> list[Tool]:
    """List available tools."""
    return [
        Tool(
            name="capture_learning",
            description="""Capture a learning, insight, solution, or pattern to your Second Brain.

Use this when you:
- Solve a tricky bug or debugging issue
- Learn a new pattern or best practice
- Discover a useful library or tool
- Figure out a configuration or setup
- Understand a concept better

The learning will be stored in the unified database and visible in the web dashboard.""",
            inputSchema={
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "The learning content - be descriptive! Include the problem, solution, and why it works.",
                    },
                    "learning_type": {
                        "type": "string",
                        "enum": ["insight", "solution", "pattern", "debug", "concept", "tool", "config"],
                        "description": "Type of learning",
                        "default": "insight",
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Tags for categorization (e.g., ['python', 'async', 'database'])",
                    },
                    "context": {
                        "type": "string",
                        "description": "Additional context about when/why this was learned",
                    },
                },
                "required": ["content"],
            },
        ),
        Tool(
            name="search_knowledge",
            description="""Search your Second Brain for past learnings, solutions, and insights.

Use this when you:
- Face a problem you might have solved before
- Want to recall how you did something
- Need to find related patterns or solutions
- Looking for past debugging approaches

Results include both Claude Code captures AND manual entries from the web dashboard.""",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "What are you looking for? Describe the problem or concept.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum results to return",
                        "default": 5,
                    },
                    "learning_type": {
                        "type": "string",
                        "enum": ["insight", "solution", "pattern", "debug", "concept", "tool", "config"],
                        "description": "Filter by learning type",
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Filter by tags",
                    },
                },
                "required": ["query"],
            },
        ),
        Tool(
            name="get_recent_learnings",
            description="Get your most recent learnings from the Second Brain (from both Claude Code and web dashboard).",
            inputSchema={
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Maximum results to return",
                        "default": 10,
                    },
                    "learning_type": {
                        "type": "string",
                        "enum": ["insight", "solution", "pattern", "debug", "concept", "tool", "config"],
                        "description": "Filter by learning type",
                    },
                },
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    """Handle tool calls."""
    try:
        if name == "capture_learning":
            # Parse context if it's a string
            context = arguments.get("context")
            if isinstance(context, str):
                context = {"description": context}

            result = await capture_learning(
                content=arguments["content"],
                learning_type=arguments.get("learning_type", "insight"),
                tags=arguments.get("tags", []),
                context=context,
            )

            output = f"✓ Captured to Second Brain!\n\n"
            output += f"Note ID: {result['note_id']}\n"
            output += f"Tags: {', '.join(result['tags']) if result['tags'] else 'auto-generated'}\n"
            if result.get('entities'):
                output += f"Entities: {', '.join(result['entities'])}\n"
            if result.get('connections'):
                output += f"Connected to {len(result['connections'])} related notes\n"
            output += f"\n📝 Preview: {result['content_preview']}\n"
            output += f"\n→ View in web dashboard: http://localhost:5173"

            return [TextContent(type="text", text=output)]

        elif name == "search_knowledge":
            results = await search_knowledge(
                query=arguments["query"],
                limit=arguments.get("limit", 5),
                learning_type=arguments.get("learning_type"),
                tags=arguments.get("tags"),
            )

            if not results:
                return [TextContent(
                    type="text",
                    text="No matching learnings found in your Second Brain.\n\nTip: Try a different query or capture new knowledge!"
                )]

            output = f"Found {len(results)} relevant learnings:\n\n"
            for i, r in enumerate(results, 1):
                output += f"{'─' * 50}\n"
                output += f"**{i}. [{r.get('learning_type', 'insight').upper()}]** "
                output += f"(relevance: {r.get('relevance_score', 0):.0%})\n"
                tags = r.get('tags', [])
                if tags:
                    output += f"Tags: {', '.join(tags)}\n"
                output += f"Source: {r.get('source', 'unknown')}\n\n"
                output += f"{r.get('content', '')}\n\n"

            return [TextContent(type="text", text=output)]

        elif name == "get_recent_learnings":
            results = await get_recent_learnings(
                limit=arguments.get("limit", 10),
                learning_type=arguments.get("learning_type"),
            )

            if not results:
                return [TextContent(
                    type="text",
                    text="No learnings in your Second Brain yet.\n\nStart capturing by solving problems or manually adding knowledge in the web dashboard!"
                )]

            output = f"Your {len(results)} most recent learnings:\n\n"
            for i, r in enumerate(results, 1):
                output += f"{'─' * 50}\n"
                output += f"**{i}. [{r.get('learning_type', 'insight').upper()}]**\n"
                tags = r.get('tags', [])
                if tags:
                    output += f"Tags: {', '.join(tags)}\n"
                output += f"Source: {r.get('source', 'unknown')}\n"
                created = r.get('created_at', '')[:10] if r.get('created_at') else 'unknown'
                output += f"Captured: {created}\n\n"
                content = r.get('content', '')
                content_preview = content[:200] + "..." if len(content) > 200 else content
                output += f"{content_preview}\n\n"

            return [TextContent(type="text", text=output)]

        else:
            return [TextContent(type="text", text=f"Unknown tool: {name}")]

    except httpx.HTTPStatusError as e:
        error_detail = str(e)
        try:
            error_detail = e.response.json().get("detail", str(e))
        except Exception:
            pass
        return [TextContent(
            type="text",
            text=f"API Error: {error_detail}\n\nMake sure the Second Brain backend is running (docker-compose up -d)"
        )]
    except httpx.ConnectError:
        return [TextContent(
            type="text",
            text="Connection Error: Cannot connect to Second Brain API.\n\nMake sure the backend is running:\n  cd second-brain && docker-compose up -d"
        )]
    except Exception as e:
        return [TextContent(
            type="text",
            text=f"Error: {str(e)}"
        )]


async def main():
    """Run the MCP server."""
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )


if __name__ == "__main__":
    asyncio.run(main())
