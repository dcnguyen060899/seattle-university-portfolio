# Second Brain

**AI-Powered Knowledge Retention System**

> *In the AI era, the value of a knowledge worker shifts from "knowing how to code" to "knowing what problems exist and what solutions work." Second Brain externalizes this experiential knowledge, turning it into a searchable, compounding asset.*

---

## The Problem

AI tools help us solve problems faster than ever, but we forget solutions just as quickly:

```
You + AI in one week:
├── Solved CORS issue (backend proxy pattern)
├── Fixed WebSocket error (switch to HTTP requests)
├── Debugged response parsing (array vs object format)
└── ... 20 more problems solved

Three months later:
├── "I solved this before... where?"
├── "What was that proxy thing?"
└── Re-solve from scratch. Waste 4 hours.
```

**Second Brain captures your problem-solving journeys, not just answers.**

---

## Quick Start

### Prerequisites

- Python 3.11+
- Docker & Docker Compose
- Anthropic API key
- Voyage AI API key

### 1. Clone and Configure

```bash
cd second-brain
cp .env.example .env
# Edit .env with your API keys
```

### 2. Start Services

```bash
docker-compose up -d
```

### 3. Install CLI

```bash
cd cli
pip install -e .
```

### 4. Start Using

```bash
# Capture knowledge
brain add "CORS blocks browser requests. Solution: backend proxy pattern"

# Search semantically
brain search "that API error from last month"

# Chat with your knowledge
brain chat

# Review for retention
brain review
```

---

## Features

### Capture Knowledge Effortlessly

```bash
# Quick capture
brain add "ResNet34 with conservative augmentation achieved 94% accuracy"

# With context
brain add "Backend proxy bypasses CORS" --tag debugging --project portfolio

# From any source
brain add "$(pbpaste)"  # Paste from clipboard
```

### Search by Meaning, Not Keywords

```bash
# Natural language
brain search "that thing about API errors from last month"

# Fuzzy temporal
brain search "what I learned this week"

# With filters
brain search "machine learning" --tag python --limit 10
```

### Chat with Your Knowledge

```bash
brain chat

You: What do I know about handling CORS issues?

Brain: Based on your notes from December 2025:

1. **Root Cause**: Browsers block cross-origin requests for security
2. **Solution**: Backend proxy pattern - server makes the API call
3. **Key Learning**: gradio_client uses WebSocket which fails on some hosts

You noted this while debugging the HuggingFace integration for your
portfolio chatbot project.

Related: You have 3 other notes about API integration patterns.
```

### Spaced Repetition for Retention

```bash
brain review

Review 1/5
┌─────────────────────────────────────────────────┐
│ What do you remember about this?                │
│                                                 │
│ CORS blocks browser cross-origin requests...    │
└─────────────────────────────────────────────────┘

Your rating (0-5): 4

✓ Next review in 6 days
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI / Web / Extensions                   │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FastAPI Backend                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Capture   │  │   Search    │  │Intelligence │             │
│  │   Service   │  │   Service   │  │  Service    │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└────────────────────────────────┬────────────────────────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          ▼                      ▼                      ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   PostgreSQL    │  │     Qdrant      │  │     Redis       │
│   (Metadata)    │  │   (Vectors)     │  │    (Cache)      │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Tech Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Backend | FastAPI + Python | Async API server |
| Vector DB | Qdrant | Semantic search |
| Database | PostgreSQL | Metadata storage |
| Cache | Redis | Sessions, rate limiting |
| LLM | Claude (Anthropic) | RAG, function calling |
| Embeddings | Voyage AI | Semantic embeddings |
| CLI | Click + Rich | Terminal interface |

---

## API Endpoints

### Notes

```bash
# Create note
POST /api/v1/notes
{
  "content": "Your knowledge here",
  "tags": ["optional", "tags"],
  "source": "where-it-came-from"
}

# List notes
GET /api/v1/notes?tags=debugging&limit=20

# Get note
GET /api/v1/notes/{note_id}

# Delete note
DELETE /api/v1/notes/{note_id}
```

### Search

```bash
# Semantic search
POST /api/v1/search
{
  "query": "that API error from last month",
  "filters": {
    "tags": ["debugging"],
    "date_after": "2025-12-01"
  },
  "top_k": 10
}
```

### Chat

```bash
# Chat with RAG
POST /api/v1/chat
{
  "message": "What do I know about CORS?",
  "conversation_id": "optional-for-continuity"
}
```

### Reviews

```bash
# Get due reviews
GET /api/v1/reviews/due?limit=10

# Submit review
POST /api/v1/reviews/{note_id}
{
  "rating": 4
}
```

---

## Development

### Project Structure

```
second-brain/
├── backend/
│   ├── app/
│   │   ├── api/routes/      # API endpoints
│   │   ├── core/            # Config, security
│   │   ├── db/              # Database connections
│   │   ├── models/          # SQLAlchemy & Pydantic
│   │   └── services/        # Business logic
│   ├── tests/
│   └── pyproject.toml
├── cli/
│   └── brain/               # CLI commands
├── docker-compose.yml
├── ARCHITECTURE.md          # Detailed architecture docs
└── README.md
```

### Running Locally

```bash
# Start infrastructure
docker-compose up -d postgres redis qdrant

# Install backend dependencies
cd backend
pip install -e ".[dev]"

# Run backend
uvicorn app.main:app --reload

# Install CLI
cd ../cli
pip install -e .
```

### Running Tests

```bash
cd backend
pytest --cov=app tests/
```

---

## Roadmap

### Phase 1: Core MVP ✅
- [x] Project structure
- [x] Database models
- [x] Capture service
- [x] Search service
- [x] Intelligence service (RAG)
- [x] CLI tool
- [ ] Authentication
- [ ] Basic web UI

### Phase 2: Intelligence
- [ ] Improved entity extraction (LLM)
- [ ] Auto-tagging with LLM
- [ ] Knowledge graph visualization
- [ ] Topic summarization
- [ ] Knowledge gap detection

### Phase 3: Integrations
- [ ] Browser extension
- [ ] VS Code extension
- [ ] ChatGPT/Claude conversation import
- [ ] Obsidian sync

### Phase 4: Scale
- [ ] Team knowledge bases
- [ ] Mobile app
- [ ] API for third-party integrations

---

## Contributing

Contributions welcome! Please read the architecture document before making significant changes.

```bash
# Setup pre-commit hooks
pip install pre-commit
pre-commit install
```

---

## License

MIT License - See [LICENSE](LICENSE) for details.

---

**Author:** Duy Nguyen | MS Data Science @ Seattle University

**Contact:** [dnguyen44@seattleu.edu](mailto:dnguyen44@seattleu.edu)
