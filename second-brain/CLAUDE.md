# Second Brain - Claude Code Integration

## Quick Start

If this is your first time, run the setup script:
```bash
./setup.sh
```

## What is Second Brain?

An AI-powered knowledge retention system that captures what you learn while coding and helps you retrieve it later using semantic search and RAG.

## How to Use

### Capture Learnings
When you solve a problem or learn something useful, ask me to capture it:
- "Capture this learning: [description]"
- "Save to my second brain: [what you learned]"
- "Remember this: [pattern/solution]"

### Search Knowledge
When you face a problem you might have solved before:
- "What do I know about [topic]?"
- "Search my knowledge for [query]"
- "Have I solved [problem] before?"

### Auto-Capture
Errors you fix are automatically captured (after running setup.sh).

## Services

| Service | URL | Purpose |
|---------|-----|---------|
| Backend API | http://localhost:8000 | REST API |
| API Docs | http://localhost:8000/docs | Swagger UI |
| Web Dashboard | http://localhost:5173 | UI for search/chat/review |
| PostgreSQL | localhost:5432 | Metadata storage |
| Qdrant | localhost:6333 | Vector database |
| Redis | localhost:6379 | Caching |

## Starting Services

```bash
# Start all services
docker-compose up -d

# Start frontend
cd frontend && npm run dev
```

## MCP Tools Available

When properly configured, I have access to:
- `capture_learning` - Save insights to your knowledge base
- `search_knowledge` - Semantic search across your learnings
- `get_recent_learnings` - View recent captures

## Project Structure

```
second-brain/
├── backend/           # FastAPI backend
│   ├── app/          # Application code
│   ├── mcp_server.py # MCP server for Claude Code
│   └── hooks/        # Auto-capture hooks
├── frontend/         # React dashboard
├── docker-compose.yml
└── setup.sh          # One-time setup script
```
