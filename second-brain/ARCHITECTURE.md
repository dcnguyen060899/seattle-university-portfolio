# Second Brain: AI-Powered Knowledge Retention System

## Architecture & Product Specification

**Version:** 1.0.0
**Author:** Duy Nguyen
**Date:** January 2026
**Status:** Planning Phase

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Target Users](#target-users)
4. [Product Vision](#product-vision)
5. [Core Features](#core-features)
6. [Technical Architecture](#technical-architecture)
7. [Data Models](#data-models)
8. [API Design](#api-design)
9. [Tech Stack](#tech-stack)
10. [Development Phases](#development-phases)
11. [Scalability & Infrastructure](#scalability--infrastructure)
12. [Security & Privacy](#security--privacy)
13. [Competitive Analysis](#competitive-analysis)
14. [Business Model](#business-model)
15. [Success Metrics](#success-metrics)
16. [Risks & Mitigations](#risks--mitigations)
17. [Open Questions](#open-questions)

---

## Executive Summary

**Second Brain** is an AI-powered knowledge retention system designed for the era of AI-assisted work. As AI tools like Claude Code, GitHub Copilot, and ChatGPT accelerate how fast we solve problems, they also accelerate how fast we forget solutions. Second Brain captures problem-solving journeys, not just answers, enabling users to retrieve context from past experiences using natural, fuzzy queries.

**Key Insight:** In the AI era, the value of a knowledge worker shifts from "knowing how to code" to "knowing what problems exist and what solutions work." Second Brain externalizes this experiential knowledge, turning it into a searchable, compounding asset.

**Core Value Proposition:**
- Capture knowledge in the moment of learning
- Retrieve using fuzzy, natural language ("that API thing last month...")
- Connect ideas across time and domains
- Reinforce retention through spaced repetition
- Compound knowledge instead of re-learning

---

## Problem Statement

### The Information Overload Crisis

```
Daily Knowledge Input:
├── AI conversations (ChatGPT, Claude) → Forgotten in 24 hours
├── Stack Overflow solutions → Can't find again
├── YouTube tutorials → "Where was that one tip?"
├── Course materials → Scattered across platforms
├── Debugging sessions → Hard-won knowledge, lost
└── Team discussions → Context evaporates

Result: We re-learn the same things repeatedly.
        We can't connect ideas across sources.
        Experience doesn't compound.
```

### The AI Acceleration Problem

| Before AI Coding Tools | With AI Coding Tools |
|------------------------|----------------------|
| Solve 5 problems/week | Solve 50 problems/week |
| Slow enough to remember | Too fast to retain |
| Deep learning from struggle | Quick solutions, shallow retention |
| Limited scope of work | Broad scope, fragmented knowledge |

**The Gap:** AI makes us more productive but not more knowledgeable. We become dependent on AI without building the pattern recognition that makes senior engineers valuable.

### Why Existing Solutions Fail

| Solution | Why It Fails |
|----------|--------------|
| **Notion/Obsidian** | Manual organization burden; search is keyword-based, not semantic |
| **Bookmarks** | Graveyard of links never revisited |
| **Note-taking apps** | No retrieval cues; notes rot unread |
| **ChatGPT history** | No search, no connections, no reinforcement |
| **Google Keep** | Too simple; no intelligence layer |
| **Mem.ai / Reflect** | Close, but focused on notes, not problem-solving journeys |

---

## Target Users

### Primary: Developers & Engineers

```
Profile:
- Uses AI coding tools daily (Copilot, Claude Code, ChatGPT)
- Solves 20-50+ problems per week
- Frequently thinks "I solved this before..."
- Values efficiency and compounding knowledge
- Technical enough to appreciate the system

Pain Points:
- Re-debugging same issues
- Can't remember which approach worked
- Losing context when switching projects
- Knowledge siloed in different tools
```

### Secondary: Knowledge Workers

```
Profile:
- Researchers, analysts, consultants
- Heavy information consumers
- Need to synthesize across sources
- Build expertise over time

Pain Points:
- Information overload
- Can't find that one insight from months ago
- Knowledge doesn't transfer between projects
```

### Tertiary: Students & Lifelong Learners

```
Profile:
- Taking courses, self-learning
- Building foundational knowledge
- Need retention, not just consumption

Pain Points:
- Forgetting course material
- Can't connect concepts across subjects
- No way to test retention
```

---

## Product Vision

### The 10-Year Vision

> "Every knowledge worker has a personal AI that knows everything they've ever learned, connects ideas they wouldn't have connected themselves, and helps them build on past experience instead of starting from scratch."

### The 1-Year Vision

> "Developers can capture their problem-solving journeys in seconds and retrieve them with fuzzy natural language queries, reducing time spent re-solving problems by 50%."

### Core Principles

1. **Capture should be effortless** - If it takes more than 10 seconds, users won't do it
2. **Retrieval should be fuzzy** - "That thing last month" should work
3. **Connections should be automatic** - Surface relationships users wouldn't find
4. **Retention should be active** - Spaced repetition, not passive storage
5. **Privacy should be absolute** - User data is sacred, never used for training

---

## Core Features

### MVP Features (Phase 1)

| Feature | Description | Priority |
|---------|-------------|----------|
| **Quick Capture** | Add notes via CLI, web, or keyboard shortcut | P0 |
| **Semantic Search** | Find by meaning, not keywords | P0 |
| **Auto-Tagging** | Extract concepts, tools, languages automatically | P0 |
| **Source Tracking** | Record where knowledge came from | P0 |
| **Basic Connections** | Show related notes when viewing one | P1 |

### Growth Features (Phase 2)

| Feature | Description | Priority |
|---------|-------------|----------|
| **Conversation Capture** | Auto-save AI chat sessions | P0 |
| **Connection Graph** | Visual knowledge map | P1 |
| **Topic Summaries** | "What do I know about X?" | P1 |
| **Browser Extension** | Capture from any webpage | P1 |
| **Daily Review** | Spaced repetition prompts | P2 |

### Advanced Features (Phase 3)

| Feature | Description | Priority |
|---------|-------------|----------|
| **Quiz Generation** | Test retention on captured knowledge | P1 |
| **Knowledge Gaps** | Identify what you should learn next | P2 |
| **Team Sharing** | Share knowledge bases (opt-in) | P2 |
| **IDE Integration** | Capture from VSCode, cursor inline | P2 |
| **Voice Capture** | Speak to capture (mobile) | P3 |

### Feature: Quick Capture (Detailed)

```
┌─────────────────────────────────────────────────────────────────┐
│                        CAPTURE FLOW                              │
│                                                                  │
│  Input Methods:                                                  │
│  ├── CLI: `brain add "CORS blocks browser requests..."`         │
│  ├── Keyboard shortcut: Cmd+Shift+B → popup                     │
│  ├── Browser extension: Highlight + right-click                 │
│  ├── IDE extension: Select code + capture                       │
│  └── Voice: "Hey Brain, remember that..."                       │
│                                                                  │
│  Processing:                                                     │
│  ├── 1. Parse content                                           │
│  ├── 2. Generate embedding                                      │
│  ├── 3. Extract entities (tools, concepts, languages)           │
│  ├── 4. Auto-generate tags                                      │
│  ├── 5. Find connections to existing notes                      │
│  ├── 6. Store in vector DB + metadata DB                        │
│  └── 7. Confirm to user with connections shown                  │
│                                                                  │
│  User Effort: < 10 seconds                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Feature: Semantic Search (Detailed)

```
┌─────────────────────────────────────────────────────────────────┐
│                        SEARCH FLOW                               │
│                                                                  │
│  Query Types Supported:                                          │
│  ├── Semantic: "that API error from last month"                 │
│  ├── Conceptual: "everything about authentication"              │
│  ├── Temporal: "what I learned this week"                       │
│  ├── Contextual: "debugging issues in the portfolio project"   │
│  └── Comparative: "differences between REST and GraphQL"        │
│                                                                  │
│  Search Pipeline:                                                │
│  ├── 1. Parse query intent (LLM)                                │
│  ├── 2. Extract filters (time, project, tags)                  │
│  ├── 3. Generate query embedding                                │
│  ├── 4. Vector similarity search                                │
│  ├── 5. Metadata filtering                                      │
│  ├── 6. Re-rank results (LLM)                                   │
│  └── 7. Present with context and connections                    │
│                                                                  │
│  Response Time Target: < 2 seconds                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
│                                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │   CLI    │  │   Web    │  │ Browser  │  │   IDE    │  │  Mobile  │      │
│  │  Client  │  │   App    │  │Extension │  │Extension │  │   App    │      │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘      │
│       └─────────────┴─────────────┴─────────────┴─────────────┘            │
│                                   │                                          │
└───────────────────────────────────┼──────────────────────────────────────────┘
                                    │ HTTPS/WebSocket
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API GATEWAY                                     │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Authentication │ Rate Limiting │ Request Routing │ Load Balancing  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            APPLICATION LAYER                                 │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  Capture        │  │  Search         │  │  Intelligence   │             │
│  │  Service        │  │  Service        │  │  Service        │             │
│  │                 │  │                 │  │                 │             │
│  │ • Parse input   │  │ • Query parsing │  │ • Function call │             │
│  │ • Chunking      │  │ • Vector search │  │ • RAG pipeline  │             │
│  │ • Embedding     │  │ • Filtering     │  │ • Summarization │             │
│  │ • Entity extract│  │ • Re-ranking    │  │ • Quiz gen      │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                    │                    │                       │
│  ┌────────┴────────────────────┴────────────────────┴────────┐             │
│  │                    Shared Services                         │             │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐           │             │
│  │  │ Embedding  │  │ LLM        │  │ Background │           │             │
│  │  │ Service    │  │ Service    │  │ Jobs       │           │             │
│  │  └────────────┘  └────────────┘  └────────────┘           │             │
│  └────────────────────────────────────────────────────────────┘             │
│                                                                              │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA LAYER                                      │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │   Vector DB     │  │  Relational DB  │  │   Object Store  │             │
│  │   (Qdrant)      │  │  (PostgreSQL)   │  │   (S3/R2)       │             │
│  │                 │  │                 │  │                 │             │
│  │ • Embeddings    │  │ • Users         │  │ • Attachments   │             │
│  │ • Similarity    │  │ • Notes metadata│  │ • Exports       │             │
│  │ • Filtering     │  │ • Tags          │  │ • Backups       │             │
│  │                 │  │ • Connections   │  │                 │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                                   │
│  │   Cache         │  │   Queue         │                                   │
│  │   (Redis)       │  │   (Redis/SQS)   │                                   │
│  │                 │  │                 │                                   │
│  │ • Session       │  │ • Async jobs    │                                   │
│  │ • Query cache   │  │ • Webhooks      │                                   │
│  │ • Rate limits   │  │ • Notifications │                                   │
│  └─────────────────┘  └─────────────────┘                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL SERVICES                                  │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │   LLM API       │  │  Embedding API  │  │   Auth          │             │
│  │   (Claude)      │  │  (Voyage/OpenAI)│  │   (Clerk/Auth0) │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Details

#### Capture Service

```python
class CaptureService:
    """
    Handles all knowledge capture operations.

    Responsibilities:
    - Parse incoming content (text, code, URLs)
    - Chunk long content appropriately
    - Generate embeddings
    - Extract entities and concepts
    - Auto-generate tags
    - Find connections to existing knowledge
    - Store in vector DB and metadata DB
    """

    async def capture(
        self,
        content: str,
        source: Optional[str] = None,
        tags: Optional[List[str]] = None,
        context: Optional[dict] = None  # project, timestamp, etc.
    ) -> CaptureResult:
        # 1. Parse and clean content
        parsed = self.parser.parse(content)

        # 2. Chunk if necessary (for long content)
        chunks = self.chunker.chunk(parsed, max_tokens=512)

        # 3. Generate embeddings
        embeddings = await self.embedding_service.embed(chunks)

        # 4. Extract entities
        entities = await self.entity_extractor.extract(parsed)

        # 5. Auto-generate tags
        auto_tags = await self.tagger.generate_tags(parsed, entities)
        all_tags = list(set((tags or []) + auto_tags))

        # 6. Find connections
        connections = await self.connection_finder.find(embeddings[0], top_k=5)

        # 7. Store
        note_id = await self.storage.store(
            content=parsed,
            chunks=chunks,
            embeddings=embeddings,
            entities=entities,
            tags=all_tags,
            source=source,
            context=context,
            connections=connections
        )

        return CaptureResult(
            note_id=note_id,
            tags=all_tags,
            entities=entities,
            connections=connections
        )
```

#### Search Service

```python
class SearchService:
    """
    Handles semantic search and retrieval.

    Responsibilities:
    - Parse natural language queries
    - Extract filters (time, tags, project)
    - Perform vector similarity search
    - Apply metadata filters
    - Re-rank results using LLM
    - Return results with context
    """

    async def search(
        self,
        query: str,
        filters: Optional[SearchFilters] = None,
        top_k: int = 10
    ) -> SearchResults:
        # 1. Parse query intent
        parsed_query = await self.query_parser.parse(query)

        # 2. Extract implicit filters from query
        implicit_filters = parsed_query.extracted_filters
        merged_filters = self.merge_filters(filters, implicit_filters)

        # 3. Generate query embedding
        query_embedding = await self.embedding_service.embed([parsed_query.semantic_query])

        # 4. Vector search with filters
        candidates = await self.vector_db.search(
            embedding=query_embedding[0],
            filters=merged_filters.to_vector_filter(),
            top_k=top_k * 3  # Over-fetch for re-ranking
        )

        # 5. Re-rank with LLM
        reranked = await self.reranker.rerank(
            query=query,
            candidates=candidates,
            top_k=top_k
        )

        # 6. Enrich with connections
        enriched = await self.enricher.add_connections(reranked)

        return SearchResults(
            query=query,
            results=enriched,
            filters_applied=merged_filters
        )
```

#### Intelligence Service

```python
class IntelligenceService:
    """
    Handles AI-powered features using function calling.

    Responsibilities:
    - RAG pipeline for answering questions
    - Topic summarization
    - Quiz generation
    - Knowledge gap identification
    - Connection discovery
    """

    def __init__(self):
        self.tools = [
            self.search_knowledge,
            self.add_note,
            self.find_connections,
            self.summarize_topic,
            self.generate_quiz,
            self.find_knowledge_gaps
        ]

    async def process(self, user_message: str) -> Response:
        messages = [{"role": "user", "content": user_message}]

        response = await self.llm.create(
            model="claude-sonnet-4-20250514",
            messages=messages,
            tools=self.tools,
            system=SYSTEM_PROMPT
        )

        # Handle tool calls
        while response.stop_reason == "tool_use":
            tool_results = await self.execute_tools(response.tool_calls)
            messages.extend([response, tool_results])
            response = await self.llm.create(
                model="claude-sonnet-4-20250514",
                messages=messages,
                tools=self.tools
            )

        return response
```

---

## Data Models

### Core Entities

```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    settings JSONB DEFAULT '{}',
    subscription_tier VARCHAR(50) DEFAULT 'free'
);

-- Notes table (core knowledge unit)
CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    content_type VARCHAR(50) DEFAULT 'text', -- text, code, url, image
    source VARCHAR(255), -- where this came from
    source_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    context JSONB DEFAULT '{}', -- project, session, etc.

    -- Denormalized for faster queries
    entity_count INTEGER DEFAULT 0,
    connection_count INTEGER DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    last_reviewed_at TIMESTAMP WITH TIME ZONE,

    -- Full text search
    search_vector TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('english', content)
    ) STORED
);

CREATE INDEX idx_notes_user_id ON notes(user_id);
CREATE INDEX idx_notes_created_at ON notes(created_at);
CREATE INDEX idx_notes_search ON notes USING GIN(search_vector);

-- Chunks table (for long content)
CREATE TABLE chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    token_count INTEGER,
    embedding_id VARCHAR(255), -- Reference to vector DB
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_chunks_note_id ON chunks(note_id);

-- Tags table
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    tag_type VARCHAR(50) DEFAULT 'user', -- user, auto, entity
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(user_id, name)
);

-- Note-Tag junction
CREATE TABLE note_tags (
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    confidence FLOAT DEFAULT 1.0, -- For auto-generated tags
    PRIMARY KEY (note_id, tag_id)
);

-- Entities (concepts, tools, people extracted from notes)
CREATE TABLE entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    entity_type VARCHAR(50) NOT NULL, -- concept, tool, language, person, project
    description TEXT,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(user_id, name, entity_type)
);

-- Note-Entity junction
CREATE TABLE note_entities (
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    confidence FLOAT DEFAULT 1.0,
    PRIMARY KEY (note_id, entity_id)
);

-- Connections between notes
CREATE TABLE connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    target_note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    connection_type VARCHAR(50) DEFAULT 'semantic', -- semantic, explicit, temporal
    strength FLOAT DEFAULT 0.0, -- Similarity score
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(source_note_id, target_note_id)
);

CREATE INDEX idx_connections_source ON connections(source_note_id);
CREATE INDEX idx_connections_target ON connections(target_note_id);

-- Spaced repetition reviews
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    review_type VARCHAR(50) DEFAULT 'recall', -- recall, quiz, connection

    -- SM-2 algorithm fields
    ease_factor FLOAT DEFAULT 2.5,
    interval_days INTEGER DEFAULT 1,
    repetitions INTEGER DEFAULT 0,

    next_review_at TIMESTAMP WITH TIME ZONE,
    last_reviewed_at TIMESTAMP WITH TIME ZONE,
    last_rating INTEGER, -- 0-5 (SM-2 scale)

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_reviews_next ON reviews(user_id, next_review_at);
```

### Vector Database Schema (Qdrant)

```python
# Qdrant collection configuration
collection_config = {
    "collection_name": "knowledge_chunks",
    "vectors": {
        "size": 1536,  # OpenAI embedding size, or 1024 for Voyage
        "distance": "Cosine"
    },
    "payload_schema": {
        "user_id": "keyword",
        "note_id": "keyword",
        "chunk_index": "integer",
        "content": "text",
        "created_at": "datetime",
        "tags": "keyword[]",
        "entities": "keyword[]",
        "source": "keyword",
        "project": "keyword"
    }
}

# Example document
vector_document = {
    "id": "chunk-uuid",
    "vector": [0.123, -0.456, ...],  # 1536 dimensions
    "payload": {
        "user_id": "user-uuid",
        "note_id": "note-uuid",
        "chunk_index": 0,
        "content": "CORS blocks browser cross-origin requests...",
        "created_at": "2026-01-01T10:00:00Z",
        "tags": ["web-dev", "debugging", "api"],
        "entities": ["CORS", "backend-proxy", "HuggingFace"],
        "source": "claude-code-session",
        "project": "portfolio-chatbot"
    }
}
```

---

## API Design

### RESTful Endpoints

```yaml
# OpenAPI 3.0 Specification (abbreviated)

paths:
  # === Notes ===
  /api/v1/notes:
    post:
      summary: Capture new knowledge
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [content]
              properties:
                content:
                  type: string
                  description: The knowledge to capture
                source:
                  type: string
                  description: Where this came from
                tags:
                  type: array
                  items:
                    type: string
                context:
                  type: object
                  properties:
                    project:
                      type: string
                    session_id:
                      type: string
      responses:
        201:
          description: Note captured successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CaptureResult'

    get:
      summary: List notes with filters
      parameters:
        - name: tags
          in: query
          schema:
            type: array
            items:
              type: string
        - name: created_after
          in: query
          schema:
            type: string
            format: date-time
        - name: project
          in: query
          schema:
            type: string
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
        - name: offset
          in: query
          schema:
            type: integer
            default: 0

  /api/v1/notes/{note_id}:
    get:
      summary: Get note with connections
    put:
      summary: Update note
    delete:
      summary: Delete note

  # === Search ===
  /api/v1/search:
    post:
      summary: Semantic search
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [query]
              properties:
                query:
                  type: string
                  description: Natural language query
                filters:
                  type: object
                  properties:
                    tags:
                      type: array
                      items:
                        type: string
                    date_range:
                      type: object
                      properties:
                        start:
                          type: string
                          format: date-time
                        end:
                          type: string
                          format: date-time
                    project:
                      type: string
                top_k:
                  type: integer
                  default: 10

  # === Intelligence ===
  /api/v1/chat:
    post:
      summary: Chat with your knowledge base (RAG + Function Calling)
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [message]
              properties:
                message:
                  type: string
                conversation_id:
                  type: string
                  description: For multi-turn conversations

  /api/v1/summarize:
    post:
      summary: Summarize knowledge on a topic
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [topic]
              properties:
                topic:
                  type: string
                include_gaps:
                  type: boolean
                  default: false

  /api/v1/connections/{note_id}:
    get:
      summary: Get connections for a note
      parameters:
        - name: depth
          in: query
          schema:
            type: integer
            default: 1

  # === Reviews (Spaced Repetition) ===
  /api/v1/reviews/due:
    get:
      summary: Get notes due for review
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
            default: 10

  /api/v1/reviews/{note_id}:
    post:
      summary: Submit review result
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [rating]
              properties:
                rating:
                  type: integer
                  minimum: 0
                  maximum: 5
                  description: SM-2 rating (0=forgot, 5=perfect)

  # === Entities & Tags ===
  /api/v1/tags:
    get:
      summary: List all tags with usage counts

  /api/v1/entities:
    get:
      summary: List all entities
      parameters:
        - name: type
          in: query
          schema:
            type: string
            enum: [concept, tool, language, person, project]
```

### WebSocket API (Real-time)

```python
# WebSocket events

# Client → Server
{
    "type": "subscribe",
    "channels": ["notes", "reviews"]
}

{
    "type": "capture",
    "data": {
        "content": "Quick note about...",
        "source": "keyboard-shortcut"
    }
}

# Server → Client
{
    "type": "note_captured",
    "data": {
        "note_id": "uuid",
        "connections": [...]
    }
}

{
    "type": "review_due",
    "data": {
        "note_id": "uuid",
        "preview": "CORS blocks browser..."
    }
}
```

### CLI Interface

```bash
# Quick capture
$ brain add "CORS blocks browser requests. Solution: backend proxy"
✓ Captured. Connected to 3 notes. Tags: [web-dev, debugging, api]

# Capture with context
$ brain add "ResNet34 achieved 94% accuracy" --project garbage-classification --source experiment
✓ Captured.

# Search
$ brain search "that API error from last month"
Found 5 results:
1. [Dec 28] CORS debugging - backend proxy pattern (0.92 match)
2. [Dec 15] HuggingFace API integration issues (0.87 match)
...

# Chat interface
$ brain chat
You: What do I know about handling API errors?
Brain: Based on your notes, you've learned...

# Review
$ brain review
3 notes due for review:
[1/3] What's the backend proxy pattern for CORS?
Your answer: _

# Summarize
$ brain summarize "machine learning optimization"
Based on 12 notes, here's your knowledge on ML optimization:
...
```

---

## Tech Stack

### Core Stack (Production)

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Backend** | Python + FastAPI | Async, fast, great AI/ML ecosystem |
| **Vector DB** | Qdrant | Open-source, scalable, good filtering |
| **Relational DB** | PostgreSQL | Reliable, JSONB support, full-text search |
| **Cache** | Redis | Session, rate limiting, job queue |
| **LLM** | Claude API | Best instruction following, function calling |
| **Embeddings** | Voyage AI | Best quality/cost for retrieval |
| **Auth** | Clerk | Fast to implement, handles complexity |
| **Hosting** | Railway / Render | Simple deployment, scales with usage |

### Client Stack

| Client | Technology | Rationale |
|--------|------------|-----------|
| **Web App** | Next.js + React | SSR, great DX, fast |
| **CLI** | Python + Click | Same language as backend |
| **Browser Ext** | Plasmo + React | Cross-browser, React-based |
| **VS Code Ext** | TypeScript | Required for VS Code |
| **Mobile** | React Native | Share web components |

### Development Stack

| Purpose | Technology |
|---------|------------|
| **Testing** | pytest, Playwright |
| **CI/CD** | GitHub Actions |
| **Monitoring** | Sentry, Posthog |
| **Documentation** | Mintlify |

### Alternative Stack (Budget/Learning)

| Layer | Technology | Trade-off |
|-------|------------|-----------|
| **Vector DB** | ChromaDB | Local only, simpler, free |
| **Embeddings** | Sentence Transformers | Local, free, slightly lower quality |
| **LLM** | Ollama (local) | Free, private, slower |
| **Auth** | DIY JWT | More work, full control |
| **Hosting** | Self-hosted | Cheaper, more ops work |

---

## Development Phases

### Phase 1: Core MVP (6-8 weeks)

```
Week 1-2: Foundation
├── [ ] Project setup (FastAPI, PostgreSQL, Qdrant)
├── [ ] Database schema implementation
├── [ ] Basic authentication (Clerk)
├── [ ] Health checks and monitoring setup
└── [ ] CI/CD pipeline

Week 3-4: Capture & Storage
├── [ ] Capture API endpoint
├── [ ] Embedding generation (Voyage API)
├── [ ] Vector storage (Qdrant)
├── [ ] Entity extraction (LLM-based)
├── [ ] Auto-tagging
└── [ ] CLI client (basic)

Week 5-6: Search & Retrieval
├── [ ] Semantic search endpoint
├── [ ] Query parsing (extract filters)
├── [ ] Metadata filtering
├── [ ] Result ranking
├── [ ] Connection discovery
└── [ ] CLI search command

Week 7-8: Web Interface & Polish
├── [ ] Basic web UI (Next.js)
├── [ ] Note viewer with connections
├── [ ] Search interface
├── [ ] User onboarding
├── [ ] Documentation
└── [ ] Beta launch preparation

Deliverable: Working product for personal use
```

### Phase 2: Intelligence Layer (4-6 weeks)

```
Week 9-10: RAG & Chat
├── [ ] Chat endpoint with function calling
├── [ ] RAG pipeline (retrieve → augment → generate)
├── [ ] Conversation history
├── [ ] Topic summarization
└── [ ] "What do I know about X?" feature

Week 11-12: Connections & Discovery
├── [ ] Knowledge graph visualization
├── [ ] Connection strength scoring
├── [ ] Related notes panel
├── [ ] Knowledge gap identification
└── [ ] Daily digest generation

Week 13-14: Spaced Repetition
├── [ ] SM-2 algorithm implementation
├── [ ] Review scheduling
├── [ ] Quiz generation
├── [ ] Review interface
├── [ ] Progress tracking
└── [ ] Streak mechanics

Deliverable: AI-powered knowledge assistant
```

### Phase 3: Integrations & Scale (4-6 weeks)

```
Week 15-16: Browser Extension
├── [ ] Chrome/Firefox extension
├── [ ] Page capture
├── [ ] Highlight capture
├── [ ] Quick add popup
└── [ ] Context menu integration

Week 17-18: IDE Extension
├── [ ] VS Code extension
├── [ ] Code snippet capture
├── [ ] Inline search
├── [ ] Context-aware suggestions
└── [ ] Debug session capture

Week 19-20: Conversation Capture
├── [ ] ChatGPT export import
├── [ ] Claude conversation capture
├── [ ] Auto-chunking long conversations
├── [ ] Insight extraction
└── [ ] Deduplication

Deliverable: Capture from anywhere
```

### Phase 4: Growth & Monetization (Ongoing)

```
├── [ ] Team/shared knowledge bases
├── [ ] Mobile app
├── [ ] API for third-party integrations
├── [ ] Notion/Obsidian sync
├── [ ] Advanced analytics
├── [ ] Subscription billing
└── [ ] Enterprise features
```

---

## Scalability & Infrastructure

### Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Capture latency | < 500ms | Async embedding generation |
| Search latency | < 2s | Vector search + LLM re-ranking |
| Chat response | < 5s | RAG pipeline |
| Concurrent users | 1000+ | Per instance |
| Notes per user | 100,000+ | Efficient indexing |

### Scaling Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                     SCALING ARCHITECTURE                         │
│                                                                  │
│  Stage 1: Single Server (0-1000 users)                          │
│  ├── Single FastAPI instance                                    │
│  ├── Managed PostgreSQL (Neon/Supabase)                         │
│  ├── Managed Qdrant (Qdrant Cloud)                              │
│  └── Redis (Upstash)                                            │
│                                                                  │
│  Stage 2: Horizontal Scale (1000-10000 users)                   │
│  ├── Multiple API instances behind load balancer                │
│  ├── Read replicas for PostgreSQL                               │
│  ├── Qdrant cluster                                             │
│  ├── Background job workers (separate)                          │
│  └── CDN for static assets                                      │
│                                                                  │
│  Stage 3: Enterprise (10000+ users)                             │
│  ├── Kubernetes orchestration                                   │
│  ├── Multi-region deployment                                    │
│  ├── Dedicated instances per enterprise                         │
│  ├── Custom embedding models                                    │
│  └── On-premise deployment option                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Cost Estimation (Per 1000 Monthly Active Users)

| Service | Cost/Month | Notes |
|---------|------------|-------|
| Hosting (Railway) | $20-50 | Scales with usage |
| PostgreSQL (Neon) | $20 | Pro tier |
| Qdrant Cloud | $25 | Starter tier |
| Redis (Upstash) | $10 | Pay-per-use |
| Claude API | $50-200 | Depends on chat usage |
| Voyage Embeddings | $20-50 | $0.10 per 1M tokens |
| Clerk Auth | $25 | Pro tier |
| **Total** | **$170-380** | **$0.17-0.38 per user** |

---

## Security & Privacy

### Core Principles

1. **User data is never used for AI training**
2. **End-to-end encryption for sensitive notes** (future)
3. **User owns their data, can export/delete anytime**
4. **Minimal data collection, maximum transparency**

### Security Measures

```
┌─────────────────────────────────────────────────────────────────┐
│                      SECURITY LAYERS                             │
│                                                                  │
│  Authentication                                                  │
│  ├── OAuth 2.0 via Clerk                                        │
│  ├── JWT tokens with short expiry                               │
│  ├── Refresh token rotation                                     │
│  └── MFA support                                                │
│                                                                  │
│  Authorization                                                   │
│  ├── Row-level security in PostgreSQL                           │
│  ├── User-scoped queries enforced at ORM level                  │
│  ├── API rate limiting per user                                 │
│  └── RBAC for team features                                     │
│                                                                  │
│  Data Protection                                                 │
│  ├── TLS 1.3 for all connections                               │
│  ├── Encryption at rest (database level)                        │
│  ├── No plaintext secrets in code                               │
│  ├── Regular security audits                                    │
│  └── GDPR/CCPA compliance                                       │
│                                                                  │
│  Infrastructure                                                  │
│  ├── VPC isolation                                              │
│  ├── WAF for DDoS protection                                    │
│  ├── Regular dependency updates                                 │
│  └── Penetration testing (annual)                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Privacy Features

| Feature | Description |
|---------|-------------|
| **Data Export** | Full export in JSON/Markdown |
| **Data Deletion** | Complete deletion within 30 days |
| **Local Mode** | Run entirely locally (future) |
| **E2E Encryption** | Optional client-side encryption (future) |
| **No Tracking** | No third-party analytics by default |

---

## Competitive Analysis

### Direct Competitors

| Product | Strengths | Weaknesses | Our Differentiation |
|---------|-----------|------------|---------------------|
| **Mem.ai** | AI-first, good UX | Expensive ($15/mo), note-focused | Problem-solving journeys, not just notes |
| **Reflect** | Fast, clean, local | No AI search, manual organization | Semantic search, auto-connections |
| **Notion AI** | Familiar, team features | Clunky for quick capture, expensive | Built for speed, learning-focused |
| **Obsidian + plugins** | Powerful, local, free | Steep learning curve, manual work | Zero-config intelligence |
| **Readwise Reader** | Great for reading | No original content capture | Built for all knowledge sources |

### Indirect Competitors

| Product | Overlap | Our Differentiation |
|---------|---------|---------------------|
| **Apple Notes** | Quick capture | No intelligence, no search by meaning |
| **Google Keep** | Simple notes | No connections, no AI |
| **Roam Research** | Graph-based | Requires learning new paradigm |
| **ChatGPT history** | AI conversations | No search, no connections, no retention |

### Competitive Moat

1. **Problem-solving journey format** - Not notes, but experiences
2. **Fuzzy retrieval** - "That thing from last month" works
3. **Spaced repetition** - Active retention, not passive storage
4. **Developer-first** - CLI, IDE integration, code-aware
5. **Compound network effects** - More notes = better connections

---

## Business Model

### Pricing Tiers

| Tier | Price | Limits | Target |
|------|-------|--------|--------|
| **Free** | $0 | 100 notes, basic search | Try before buy |
| **Pro** | $12/mo | Unlimited notes, AI features, integrations | Individual power users |
| **Team** | $20/user/mo | Shared knowledge bases, admin controls | Small teams |
| **Enterprise** | Custom | SSO, on-premise, SLA, custom models | Large organizations |

### Revenue Projections

```
Year 1 Target:
├── 5,000 free users
├── 500 Pro subscribers ($72,000 ARR)
├── 10 Team accounts (avg 5 users) ($12,000 ARR)
└── Total: $84,000 ARR

Year 2 Target:
├── 25,000 free users
├── 2,500 Pro subscribers ($360,000 ARR)
├── 50 Team accounts (avg 10 users) ($120,000 ARR)
├── 2 Enterprise accounts ($50,000 ARR)
└── Total: $530,000 ARR
```

### Growth Strategy

1. **Content Marketing** - Blog posts on knowledge management, learning
2. **Developer Communities** - Hacker News, Reddit, Discord
3. **Integrations** - Obsidian plugin, Raycast extension
4. **Open Source CLI** - Free CLI drives awareness
5. **Referral Program** - Free months for referrals

---

## Success Metrics

### North Star Metric

**Weekly Active Captures (WAC)** - Users who captured at least 3 pieces of knowledge in the last 7 days

### Key Metrics by Phase

| Phase | Primary Metric | Target |
|-------|----------------|--------|
| MVP | Daily Active Users | 100 |
| Growth | WAC | 500 |
| Monetization | Paid Conversion Rate | 10% |
| Scale | Net Revenue Retention | 120% |

### Product Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Capture Rate** | Captures per user per week | 5+ |
| **Search Success** | Searches that end in note view | 70%+ |
| **Retention D7** | Users returning after 7 days | 40%+ |
| **Retention D30** | Users returning after 30 days | 25%+ |
| **Review Completion** | % of due reviews completed | 60%+ |
| **NPS** | Net Promoter Score | 50+ |

---

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **LLM costs spike** | Medium | High | Caching, batching, usage limits |
| **Competitor copies features** | High | Medium | Move fast, build moat in UX |
| **User doesn't form habit** | Medium | High | Onboarding, notifications, streaks |
| **Privacy concerns** | Medium | High | Transparency, local option, encryption |
| **Technical debt** | High | Medium | Code reviews, refactoring sprints |
| **Single founder burnout** | High | High | Scope MVP, seek co-founder |

---

## Open Questions

### Product Questions

- [ ] Should free tier include AI features?
- [ ] How to handle duplicate/similar notes?
- [ ] What's the right chunk size for different content types?
- [ ] How aggressive should auto-tagging be?
- [ ] Should connections be bidirectional by default?

### Technical Questions

- [ ] Qdrant vs Pinecone vs Weaviate - which scales better?
- [ ] Voyage vs OpenAI embeddings - quality vs cost trade-off?
- [ ] How to handle very long content (full articles)?
- [ ] Real-time sync architecture for multiple devices?
- [ ] Offline-first architecture feasibility?

### Business Questions

- [ ] Focus on developers or broader knowledge workers?
- [ ] Open-source core or fully proprietary?
- [ ] Seek funding or bootstrap?
- [ ] Solo or find co-founder?

---

## Appendix

### A. Embedding Model Comparison

| Model | Dimensions | Quality (MTEB) | Cost | Latency |
|-------|------------|----------------|------|---------|
| Voyage-2 | 1024 | 0.687 | $0.10/1M | 100ms |
| OpenAI text-embedding-3-large | 3072 | 0.654 | $0.13/1M | 80ms |
| Cohere embed-v3 | 1024 | 0.648 | $0.10/1M | 90ms |
| all-MiniLM-L6-v2 (local) | 384 | 0.589 | Free | 10ms |

### B. SM-2 Algorithm Reference

```python
def sm2(quality: int, repetitions: int, ease_factor: float, interval: int):
    """
    SM-2 Spaced Repetition Algorithm

    quality: 0-5 (0=forgot completely, 5=perfect recall)
    repetitions: number of times reviewed
    ease_factor: difficulty multiplier (starts at 2.5)
    interval: days until next review
    """
    if quality < 3:
        # Failed recall - reset
        repetitions = 0
        interval = 1
    else:
        if repetitions == 0:
            interval = 1
        elif repetitions == 1:
            interval = 6
        else:
            interval = round(interval * ease_factor)
        repetitions += 1

    # Update ease factor
    ease_factor = max(1.3, ease_factor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))

    return repetitions, ease_factor, interval
```

### C. Project Structure

```
second-brain/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── notes.py
│   │   │   │   ├── search.py
│   │   │   │   ├── chat.py
│   │   │   │   └── reviews.py
│   │   │   └── deps.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── security.py
│   │   │   └── events.py
│   │   ├── services/
│   │   │   ├── capture.py
│   │   │   ├── search.py
│   │   │   ├── intelligence.py
│   │   │   ├── embeddings.py
│   │   │   └── review.py
│   │   ├── models/
│   │   │   ├── note.py
│   │   │   ├── user.py
│   │   │   └── review.py
│   │   └── db/
│   │       ├── postgres.py
│   │       ├── qdrant.py
│   │       └── redis.py
│   ├── tests/
│   ├── alembic/
│   ├── pyproject.toml
│   └── Dockerfile
├── web/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── lib/
│   ├── package.json
│   └── Dockerfile
├── cli/
│   ├── brain/
│   │   ├── __main__.py
│   │   ├── commands/
│   │   └── client.py
│   └── pyproject.toml
├── extensions/
│   ├── browser/
│   └── vscode/
├── docs/
│   ├── api/
│   ├── guides/
│   └── architecture.md
├── docker-compose.yml
├── .github/
│   └── workflows/
└── README.md
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-01 | Initial architecture document |

---

*This document is a living specification. Update as decisions are made and learnings are captured.*
