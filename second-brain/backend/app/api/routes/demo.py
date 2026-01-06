"""
Demo API Endpoints - AI Architecture Showcase

This demo shows the RAG (Retrieval-Augmented Generation) pipeline in action,
visualizing how AI systems retrieve and process information.

Different from a simple chatbot - this demonstrates the ENGINEERING behind AI.
"""

from typing import List, Optional, Dict, Any
from uuid import uuid4
from datetime import datetime, timezone
import time

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel, Field

from app.db.postgres import get_db
from app.db.qdrant import search_vectors, upsert_vectors
from app.models.db_models import User, Note, Tag, NoteTag, Connection
from app.services.capture import CaptureService
from app.services.embeddings import get_embedding_service
from app.core.config import settings

import anthropic
import os


router = APIRouter()

DEMO_USER_EMAIL = "demo@second-brain.local"


# === Schemas ===

class RAGQueryRequest(BaseModel):
    """Request for RAG pipeline demonstration."""
    query: str = Field(..., min_length=1, max_length=500)
    show_internals: bool = Field(default=True, description="Show pipeline internals")


class RetrievedChunk(BaseModel):
    """A retrieved knowledge chunk with metadata."""
    content: str
    similarity_score: float
    tags: List[str]
    source: str
    chunk_id: str


class RAGPipelineStep(BaseModel):
    """A step in the RAG pipeline with timing."""
    step_name: str
    description: str
    duration_ms: float
    data: Optional[Dict[str, Any]] = None


class RAGQueryResponse(BaseModel):
    """Full RAG pipeline response with visualization data."""
    query: str
    answer: str
    pipeline_steps: List[RAGPipelineStep]
    retrieved_chunks: List[RetrievedChunk]
    total_duration_ms: float
    embedding_dimension: int
    model_used: str


class KnowledgeGraphNode(BaseModel):
    """A node in the knowledge graph."""
    id: str
    label: str
    type: str  # "note", "tag", "entity"
    size: int = 1


class KnowledgeGraphEdge(BaseModel):
    """An edge connecting nodes."""
    source: str
    target: str
    weight: float


class KnowledgeGraphResponse(BaseModel):
    """Knowledge graph visualization data."""
    nodes: List[KnowledgeGraphNode]
    edges: List[KnowledgeGraphEdge]
    stats: Dict[str, int]


class SystemMetrics(BaseModel):
    """System metrics for the demo."""
    total_knowledge_items: int
    total_embeddings: int
    total_connections: int
    embedding_dimension: int
    vector_db: str
    llm_model: str
    avg_query_time_ms: float


# === Helper Functions ===

async def get_or_create_demo_user(db: AsyncSession) -> User:
    """Get or create the demo user."""
    result = await db.execute(select(User).where(User.email == DEMO_USER_EMAIL))
    user = result.scalar_one_or_none()

    if not user:
        from app.core.security import get_password_hash
        user = User(
            email=DEMO_USER_EMAIL,
            hashed_password=get_password_hash("demo-not-for-login"),
            settings={"name": "Second Brain Demo", "is_demo": True},
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return user


async def ensure_demo_seeded(db: AsyncSession, user: User) -> int:
    """Ensure demo data is seeded. Returns note count."""
    result = await db.execute(
        select(func.count(Note.id)).where(Note.user_id == user.id)
    )
    count = result.scalar()

    if count > 0:
        return count

    # Seed the data
    from app.demo.seed_data import get_portfolio_knowledge
    capture_service = CaptureService(db)

    for item in get_portfolio_knowledge():
        try:
            await capture_service.capture(
                user_id=user.id,
                content=item["content"],
                source=item["source"],
                tags=item["tags"],
                context=item["context"],
            )
        except Exception as e:
            print(f"Seed error: {e}")
            continue

    # Get final count
    result = await db.execute(
        select(func.count(Note.id)).where(Note.user_id == user.id)
    )
    return result.scalar()


# === Endpoints ===

@router.get("/metrics", response_model=SystemMetrics)
async def get_system_metrics(db: AsyncSession = Depends(get_db)):
    """
    Get system metrics for the AI architecture showcase.

    Shows the technical specifications of the RAG system.
    """
    user = await get_or_create_demo_user(db)
    note_count = await ensure_demo_seeded(db, user)

    # Get connection count
    result = await db.execute(
        select(func.count(Connection.id))
        .where(Connection.user_id == user.id)
    )
    connection_count = result.scalar() or 0

    return SystemMetrics(
        total_knowledge_items=note_count,
        total_embeddings=note_count,  # 1:1 for demo
        total_connections=connection_count,
        embedding_dimension=settings.EMBEDDING_DIMENSION,
        vector_db="Qdrant",
        llm_model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
        avg_query_time_ms=150.0  # Estimated
    )


@router.post("/rag-pipeline", response_model=RAGQueryResponse)
async def demonstrate_rag_pipeline(
    request: RAGQueryRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    🔬 RAG Pipeline Demonstration

    This endpoint shows the complete RAG (Retrieval-Augmented Generation)
    pipeline step-by-step:

    1. Query Embedding - Convert question to vector
    2. Vector Search - Find similar knowledge chunks
    3. Context Assembly - Prepare retrieved context
    4. LLM Generation - Generate answer with context

    Each step includes timing and internal data for visualization.
    """
    start_time = time.time()
    pipeline_steps = []

    # Get demo user and ensure data
    user = await get_or_create_demo_user(db)
    await ensure_demo_seeded(db, user)

    # === STEP 1: Query Embedding ===
    step1_start = time.time()
    embedding_service = get_embedding_service()
    query_embedding = await embedding_service.embed([request.query], input_type="query")

    if not query_embedding:
        raise HTTPException(status_code=500, detail="Embedding generation failed")

    step1_duration = (time.time() - step1_start) * 1000
    pipeline_steps.append(RAGPipelineStep(
        step_name="Query Embedding",
        description=f"Converted query to {settings.EMBEDDING_DIMENSION}-dimensional vector using Voyage AI",
        duration_ms=round(step1_duration, 2),
        data={
            "input_text": request.query,
            "embedding_model": "voyage-2",
            "dimensions": settings.EMBEDDING_DIMENSION,
            "vector_preview": query_embedding[0][:5] + ["..."] if request.show_internals else None
        }
    ))

    # === STEP 2: Vector Search ===
    step2_start = time.time()
    search_results = await search_vectors(
        query_vector=query_embedding[0],
        user_id=str(user.id),
        limit=5,
        score_threshold=0.3,
    )
    step2_duration = (time.time() - step2_start) * 1000

    retrieved_chunks = []
    for r in search_results:
        retrieved_chunks.append(RetrievedChunk(
            content=r["payload"].get("content", ""),
            similarity_score=round(r["score"], 4),
            tags=r["payload"].get("tags", []),
            source=r["payload"].get("source", "unknown"),
            chunk_id=str(r["id"])[:8]
        ))

    pipeline_steps.append(RAGPipelineStep(
        step_name="Vector Search",
        description=f"Searched Qdrant vector database, found {len(retrieved_chunks)} relevant chunks",
        duration_ms=round(step2_duration, 2),
        data={
            "database": "Qdrant",
            "search_type": "Cosine Similarity",
            "results_found": len(retrieved_chunks),
            "score_threshold": 0.3,
            "top_score": retrieved_chunks[0].similarity_score if retrieved_chunks else 0
        }
    ))

    # === STEP 3: Context Assembly ===
    step3_start = time.time()
    context_parts = [chunk.content for chunk in retrieved_chunks]
    assembled_context = "\n\n---\n\n".join(context_parts)
    context_tokens = len(assembled_context.split())  # Rough estimate
    step3_duration = (time.time() - step3_start) * 1000

    pipeline_steps.append(RAGPipelineStep(
        step_name="Context Assembly",
        description=f"Assembled {len(context_parts)} chunks into context ({context_tokens} words)",
        duration_ms=round(step3_duration, 2),
        data={
            "chunks_used": len(context_parts),
            "context_words": context_tokens,
            "context_preview": assembled_context[:200] + "..." if request.show_internals else None
        }
    ))

    # === STEP 4: LLM Generation ===
    step4_start = time.time()
    api_key = os.getenv("ANTHROPIC_API_KEY")
    model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")

    if not api_key:
        answer = "AI service not configured. This would normally generate a contextual response."
    else:
        client = anthropic.Anthropic(api_key=api_key)

        system_prompt = """You are demonstrating a RAG (Retrieval-Augmented Generation) system.
Answer the question based on the provided context about Duy Nguyen's portfolio.
Be concise but informative. This is a technical demo showing AI architecture."""

        try:
            response = client.messages.create(
                model=model,
                max_tokens=512,
                system=system_prompt,
                messages=[{
                    "role": "user",
                    "content": f"Context:\n{assembled_context}\n\nQuestion: {request.query}"
                }]
            )
            answer = response.content[0].text
        except Exception as e:
            answer = f"Generation error: {str(e)}"

    step4_duration = (time.time() - step4_start) * 1000
    pipeline_steps.append(RAGPipelineStep(
        step_name="LLM Generation",
        description=f"Generated response using {model}",
        duration_ms=round(step4_duration, 2),
        data={
            "model": model,
            "max_tokens": 512,
            "response_length": len(answer)
        }
    ))

    total_duration = (time.time() - start_time) * 1000

    return RAGQueryResponse(
        query=request.query,
        answer=answer,
        pipeline_steps=pipeline_steps,
        retrieved_chunks=retrieved_chunks,
        total_duration_ms=round(total_duration, 2),
        embedding_dimension=settings.EMBEDDING_DIMENSION,
        model_used=model
    )


@router.get("/knowledge-graph", response_model=KnowledgeGraphResponse)
async def get_knowledge_graph(db: AsyncSession = Depends(get_db)):
    """
    🕸️ Knowledge Graph Visualization

    Returns the knowledge graph structure showing how concepts,
    tags, and notes are connected in the Second Brain.

    Use this data to render an interactive graph visualization.
    """
    user = await get_or_create_demo_user(db)
    await ensure_demo_seeded(db, user)

    nodes = []
    edges = []

    # Get all notes
    result = await db.execute(
        select(Note)
        .where(Note.user_id == user.id)
        .options()
    )
    notes = result.scalars().all()

    # Get all tags
    result = await db.execute(
        select(Tag).where(Tag.user_id == user.id)
    )
    tags = result.scalars().all()

    # Get note-tag relationships
    result = await db.execute(
        select(NoteTag)
        .join(Note, NoteTag.note_id == Note.id)
        .where(Note.user_id == user.id)
    )
    note_tags = result.scalars().all()

    # Get connections
    result = await db.execute(
        select(Connection).where(Connection.user_id == user.id)
    )
    connections = result.scalars().all()

    # Build nodes
    for note in notes:
        category = note.context.get("category", "general") if note.context else "general"
        nodes.append(KnowledgeGraphNode(
            id=f"note_{note.id}",
            label=note.content[:30] + "...",
            type="note",
            size=2
        ))

    for tag in tags:
        nodes.append(KnowledgeGraphNode(
            id=f"tag_{tag.id}",
            label=tag.name,
            type="tag",
            size=tag.usage_count + 1
        ))

    # Build edges (note -> tag)
    for nt in note_tags:
        edges.append(KnowledgeGraphEdge(
            source=f"note_{nt.note_id}",
            target=f"tag_{nt.tag_id}",
            weight=nt.confidence
        ))

    # Build edges (note -> note connections)
    for conn in connections:
        edges.append(KnowledgeGraphEdge(
            source=f"note_{conn.source_note_id}",
            target=f"note_{conn.target_note_id}",
            weight=conn.strength
        ))

    return KnowledgeGraphResponse(
        nodes=nodes,
        edges=edges,
        stats={
            "total_notes": len(notes),
            "total_tags": len(tags),
            "total_connections": len(connections),
            "total_edges": len(edges)
        }
    )


@router.get("/architecture")
async def get_architecture_diagram():
    """
    🏗️ System Architecture Information

    Returns the system architecture for visualization.
    """
    return {
        "title": "Second Brain - RAG Architecture",
        "description": "AI-powered knowledge retention system demonstrating modern RAG architecture",
        "components": [
            {
                "name": "Frontend",
                "tech": ["React", "TypeScript", "Tailwind CSS"],
                "description": "Interactive UI for knowledge capture and retrieval"
            },
            {
                "name": "API Layer",
                "tech": ["FastAPI", "Python 3.11", "Async/Await"],
                "description": "High-performance async REST API"
            },
            {
                "name": "Embedding Service",
                "tech": ["Voyage AI", "voyage-2 model"],
                "description": "1024-dimensional semantic embeddings"
            },
            {
                "name": "Vector Database",
                "tech": ["Qdrant", "HNSW Index", "Cosine Similarity"],
                "description": "Efficient similarity search at scale"
            },
            {
                "name": "Relational Database",
                "tech": ["PostgreSQL", "SQLAlchemy", "Async"],
                "description": "Structured data and relationships"
            },
            {
                "name": "LLM Integration",
                "tech": ["Anthropic Claude", "claude-sonnet-4"],
                "description": "Context-aware response generation"
            },
            {
                "name": "Cache Layer",
                "tech": ["Redis"],
                "description": "Session management and caching"
            }
        ],
        "data_flow": [
            "User Query → API",
            "Query → Embedding Service → Vector",
            "Vector → Qdrant → Similar Chunks",
            "Chunks → Context Assembly",
            "Context + Query → Claude → Response",
            "Response → User"
        ],
        "github": "https://github.com/dcnguyen060899/second-brain",
        "author": "Duy Nguyen"
    }


@router.post("/seed")
async def seed_demo_data(db: AsyncSession = Depends(get_db)):
    """Seed demo data for the showcase."""
    user = await get_or_create_demo_user(db)
    count = await ensure_demo_seeded(db, user)
    return {
        "status": "success",
        "knowledge_items": count,
        "message": "Demo data ready for showcase"
    }


# === Function Calling Enhanced Endpoint ===

class ToolCall(BaseModel):
    """A tool call made by the LLM."""
    tool_name: str
    tool_input: Dict[str, Any]
    tool_result: Dict[str, Any]
    duration_ms: float


class EnhancedRAGResponse(BaseModel):
    """Enhanced RAG response with function calling support."""
    query: str
    answer: str
    pipeline_steps: List[RAGPipelineStep]
    retrieved_chunks: List[RetrievedChunk]
    tool_calls: List[ToolCall]
    total_duration_ms: float
    embedding_dimension: int
    model_used: str
    tools_used: bool


@router.get("/tools")
async def list_available_tools():
    """List all available function calling tools."""
    from app.demo.portfolio_tools import PORTFOLIO_TOOLS
    return {
        "tools_count": len(PORTFOLIO_TOOLS),
        "tools": [
            {
                "name": tool["name"],
                "description": tool["description"]
            }
            for tool in PORTFOLIO_TOOLS
        ]
    }


@router.post("/rag-pipeline-enhanced", response_model=EnhancedRAGResponse)
async def demonstrate_rag_pipeline_enhanced(
    request: RAGQueryRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    🔬 Enhanced RAG Pipeline with Function Calling

    This endpoint demonstrates a 5-step RAG pipeline:

    1. Query Embedding - Convert question to vector
    2. Vector Search - Find similar knowledge chunks
    3. Context Assembly - Prepare retrieved context
    4. Tool Execution - Execute function calls if needed
    5. LLM Generation - Generate final answer

    Claude can call tools to fetch live data (GitHub stats, project details, etc.)
    """
    from app.demo.portfolio_tools import PORTFOLIO_TOOLS, execute_tool
    import json

    start_time = time.time()
    pipeline_steps = []
    tool_calls = []

    # Get demo user and ensure data
    user = await get_or_create_demo_user(db)
    await ensure_demo_seeded(db, user)

    # === STEP 1: Query Embedding ===
    step1_start = time.time()
    embedding_service = get_embedding_service()
    query_embedding = await embedding_service.embed([request.query], input_type="query")

    if not query_embedding:
        raise HTTPException(status_code=500, detail="Embedding generation failed")

    step1_duration = (time.time() - step1_start) * 1000
    pipeline_steps.append(RAGPipelineStep(
        step_name="Query Embedding",
        description=f"Converted query to {settings.EMBEDDING_DIMENSION}-dimensional vector",
        duration_ms=round(step1_duration, 2),
        data={
            "input_text": request.query,
            "embedding_model": "voyage-2",
            "dimensions": settings.EMBEDDING_DIMENSION,
            "vector_preview": query_embedding[0][:5] + ["..."] if request.show_internals else None
        }
    ))

    # === STEP 2: Vector Search ===
    step2_start = time.time()
    search_results = await search_vectors(
        query_vector=query_embedding[0],
        user_id=str(user.id),
        limit=5,
        score_threshold=0.3,
    )
    step2_duration = (time.time() - step2_start) * 1000

    retrieved_chunks = []
    for r in search_results:
        retrieved_chunks.append(RetrievedChunk(
            content=r["payload"].get("content", ""),
            similarity_score=round(r["score"], 4),
            tags=r["payload"].get("tags", []),
            source=r["payload"].get("source", "unknown"),
            chunk_id=str(r["id"])[:8]
        ))

    pipeline_steps.append(RAGPipelineStep(
        step_name="Vector Search",
        description=f"Found {len(retrieved_chunks)} relevant chunks",
        duration_ms=round(step2_duration, 2),
        data={
            "database": "Qdrant",
            "search_type": "Cosine Similarity",
            "results_found": len(retrieved_chunks),
            "score_threshold": 0.3,
            "top_score": retrieved_chunks[0].similarity_score if retrieved_chunks else 0
        }
    ))

    # === STEP 3: Context Assembly ===
    step3_start = time.time()
    context_parts = [chunk.content for chunk in retrieved_chunks]
    assembled_context = "\n\n---\n\n".join(context_parts)
    context_tokens = len(assembled_context.split())
    step3_duration = (time.time() - step3_start) * 1000

    pipeline_steps.append(RAGPipelineStep(
        step_name="Context Assembly",
        description=f"Assembled {len(context_parts)} chunks ({context_tokens} words)",
        duration_ms=round(step3_duration, 2),
        data={
            "chunks_used": len(context_parts),
            "context_words": context_tokens,
            "context_preview": assembled_context[:200] + "..." if request.show_internals else None
        }
    ))

    # === STEP 4: Tool Execution (Function Calling) ===
    step4_start = time.time()
    api_key = os.getenv("ANTHROPIC_API_KEY")
    model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")

    if not api_key:
        answer = "AI service not configured."
        tools_used = False
    else:
        client = anthropic.Anthropic(api_key=api_key)

        system_prompt = """You are Duy Nguyen's portfolio assistant demonstrating a RAG system with function calling.

You have access to tools that can fetch live data about Duy's portfolio, GitHub activity, skills, and more.
Use tools when they would provide more accurate or up-to-date information than the context alone.

ADMIN AUTHENTICATION PROTOCOL:
1. If someone asks about "admin key", "admin access", "admin credentials", or "admin panel":
   - Respond EXACTLY with: "To access admin credentials, please enter your password below. [AUTH_REQUIRED]"
   - The [AUTH_REQUIRED] tag triggers a password input field in the UI.

2. If a message starts with "ADMIN_AUTH:" followed by text:
   - This is a password submission. Extract the password after "ADMIN_AUTH:"
   - IMMEDIATELY call the authenticate_admin tool with that password.
   - Example: "ADMIN_AUTH: secretpass123" → call authenticate_admin(password="secretpass123")

Be concise and professional. This is a technical demo for recruiters."""

        messages = [{
            "role": "user",
            "content": f"Context from knowledge base:\n{assembled_context}\n\nQuestion: {request.query}"
        }]

        # Initial call with tools
        try:
            response = client.messages.create(
                model=model,
                max_tokens=1024,
                system=system_prompt,
                tools=PORTFOLIO_TOOLS,
                messages=messages
            )

            # Handle tool use loop
            while response.stop_reason == "tool_use":
                # Process all tool uses in this response
                tool_use_blocks = [block for block in response.content if block.type == "tool_use"]

                tool_results = []
                for tool_use in tool_use_blocks:
                    tool_start = time.time()

                    # Execute the tool
                    result = await execute_tool(tool_use.name, tool_use.input)

                    tool_duration = (time.time() - tool_start) * 1000

                    tool_calls.append(ToolCall(
                        tool_name=tool_use.name,
                        tool_input=tool_use.input,
                        tool_result=result,
                        duration_ms=round(tool_duration, 2)
                    ))

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_use.id,
                        "content": json.dumps(result)
                    })

                # Continue conversation with tool results
                messages.append({"role": "assistant", "content": response.content})
                messages.append({"role": "user", "content": tool_results})

                response = client.messages.create(
                    model=model,
                    max_tokens=1024,
                    system=system_prompt,
                    tools=PORTFOLIO_TOOLS,
                    messages=messages
                )

            # Extract final text answer
            answer = ""
            for block in response.content:
                if hasattr(block, "text"):
                    answer += block.text

            tools_used = len(tool_calls) > 0

        except Exception as e:
            answer = f"Error: {str(e)}"
            tools_used = False

    step4_duration = (time.time() - step4_start) * 1000

    # Add Tools step to pipeline
    pipeline_steps.append(RAGPipelineStep(
        step_name="Tools",
        description=f"Executed {len(tool_calls)} tool calls" if tool_calls else "No tools needed",
        duration_ms=round(step4_duration if tool_calls else 0, 2),
        data={
            "tools_called": [tc.tool_name for tc in tool_calls],
            "tools_available": len(PORTFOLIO_TOOLS),
            "total_tool_time_ms": sum(tc.duration_ms for tc in tool_calls) if tool_calls else 0
        } if tool_calls else {"skipped": True, "reason": "No tools needed for this query"}
    ))

    # === STEP 5: LLM Generation ===
    # Note: Generation happened in step 4 as part of the tool loop
    # We just record the final generation timing here
    pipeline_steps.append(RAGPipelineStep(
        step_name="LLM Generation",
        description=f"Generated response using {model}",
        duration_ms=round(step4_duration, 2),  # Combined with tools
        data={
            "model": model,
            "max_tokens": 1024,
            "response_length": len(answer),
            "with_tools": tools_used
        }
    ))

    total_duration = (time.time() - start_time) * 1000

    return EnhancedRAGResponse(
        query=request.query,
        answer=answer,
        pipeline_steps=pipeline_steps,
        retrieved_chunks=retrieved_chunks,
        tool_calls=tool_calls,
        total_duration_ms=round(total_duration, 2),
        embedding_dimension=settings.EMBEDDING_DIMENSION,
        model_used=model,
        tools_used=tools_used
    )
