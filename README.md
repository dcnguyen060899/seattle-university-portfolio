# AI-Powered Portfolio with Second Brain RAG System

**Live Demo:** [https://duyng-portfolio.com](https://duyng-portfolio.com/docs/index_portfolio.html)

**Author:** Duy Nguyen | MS Data Science @ Seattle University

**Contact:** [dcnguyen060899@gmail.com](mailto:dcnguyen060899@gmail.com) | [LinkedIn](https://www.linkedin.com/in/duwe-ng/)

---

## What This Project Demonstrates

**This portfolio website is itself a meta-demonstration of technical capabilities.** Rather than just describing skills, it *shows* them through the sophisticated full-stack AI application you're currently viewing.

### The Meta-Point
If you're a recruiter evaluating this portfolio:
- The intelligent AI chatbot with RAG and function calling? **Built from scratch by the candidate**
- The Second Brain system with real-time pipeline visualization? **Architected and deployed by the candidate**
- The 12+ function calling tools providing live data? **Designed and implemented by the candidate**
- The production infrastructure running 24/7? **Self-funded and maintained by the candidate**

**The existence and sophistication of this website proves the technical skills it describes.**

---

## Key Features

### 1. Second Brain RAG System (NEW)
A production RAG (Retrieval-Augmented Generation) system demonstrating modern AI architecture:

- **5-Step Pipeline Visualization**: Watch the AI reasoning in real-time
  - Query Embedding (Voyage AI)
  - Vector Search (Qdrant)
  - Context Assembly
  - Function Calling Tools
  - LLM Generation (Claude Sonnet 4)

- **12+ Function Calling Tools**: Live data access for recruiters
  - `get_github_activity` - Real-time GitHub stats and repositories
  - `search_projects` - Semantic project search
  - `get_skills_for_role` - Role-specific skill matching
  - `get_contact_info` - Contact details
  - `get_availability` - Internship availability and work authorization
  - `get_impact_metrics` - Quantified achievements
  - `compare_technologies` - Tech stack comparisons
  - `get_education_details` - Academic background
  - `get_work_experience` - Professional history
  - `search_by_impact` - Impact-based project filtering
  - `get_publications_research` - Research and publications
  - `authenticate_admin` - Secure admin authentication

- **Unified Conversation Memory**: Context persists across chat modes
  - Image classification context carries to follow-up questions
  - Both regular chatbot and Second Brain share conversation history
  - Seamless context handoff between different AI pipelines

### 2. Dual Intelligent AI Chatbot System
- **Portfolio Assistant Chatbot**: Conversational AI that helps recruiters learn about qualifications
- **Second Brain Mode**: Toggle to see RAG pipeline internals with retrieved chunks and tool calls
- **Code Evaluation Chatbot**: Automated educational tool for algorithm feedback

### 3. Admin Authentication System
- **Secure Password Authentication**: SHA-256 hashed password verification
- **Admin Panel**: Manage knowledge base content through web interface
- **Force Reseed Capability**: Update vector database without redeployment

### 4. Live ML Demo Integration
- **In-Chat Image Classification**: Upload images for real-time garbage classification
- **ResNet34 Model**: Deep learning with 94% accuracy, 100% minority class recall
- **AI-Interpreted Results**: ML predictions translated to natural language with disposal guidance

### 5. Self-Healing Error Correction
- **Tertiary AI Fallback**: When responses are malformed, a third AI automatically reformats
- **Multi-layered Validation**: Robust error handling through intelligent fallback systems

### 6. Production-Grade Architecture
- **Dual Backend Services**: Flask (main chatbot) + FastAPI (Second Brain RAG)
- **Vector Database**: Qdrant Cloud for semantic search
- **PostgreSQL**: Neon for persistent storage
- **Real-time Streaming**: Word-by-word response generation

---

## Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Frontend (HTML/CSS/JS)                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Portfolio UI                                                        │    │
│  │  • Responsive pages with Seattle University theming                  │    │
│  │  • Draggable/resizable chatbot with image upload                    │    │
│  │  • Pipeline visualization (Embed → Search → Context → Tools → Gen)  │    │
│  │  • Retrieved chunks panel & function calls panel                    │    │
│  │  • Unified conversation memory across all modes                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└────────────────────────┬──────────────────────────┬─────────────────────────┘
                         │                          │
                         │ REST API                 │ REST API
                         ▼                          ▼
┌────────────────────────────────────┐  ┌────────────────────────────────────┐
│     Flask Backend (Python)          │  │    FastAPI Backend (Python)         │
│     Render Standard - $25/mo        │  │    Render Starter - $7/mo           │
│  ┌──────────────────────────────┐  │  │  ┌──────────────────────────────┐  │
│  │  Portfolio Agent             │  │  │  │  RAG Pipeline Engine         │  │
│  │  • Role-specific responses   │  │  │  │  • Query embedding           │  │
│  │  • Conversation memory       │  │  │  │  • Vector similarity search  │  │
│  │  • ML result interpretation  │  │  │  │  • Context assembly          │  │
│  └──────────────────────────────┘  │  │  │  • 12+ function calling tools│  │
│  ┌──────────────────────────────┐  │  │  │  • Response generation       │  │
│  │  Evaluation Agent            │  │  │  └──────────────────────────────┘  │
│  │  • Code assessment           │  │  │  ┌──────────────────────────────┐  │
│  │  • Isolated memory           │  │  │  │  Admin System                │  │
│  │  • Self-healing fallback     │  │  │  │  • Knowledge CRUD            │  │
│  └──────────────────────────────┘  │  │  │  • Force reseed              │  │
│  ┌──────────────────────────────┐  │  │  │  • Test queries              │  │
│  │  Image Classification Proxy  │  │  │  └──────────────────────────────┘  │
│  │  • HuggingFace Spaces API    │  │  └────────────────────────────────────┘
│  │  • CORS bypass               │  │
│  └──────────────────────────────┘  │
└────────────────┬───────────────────┘
                 │
    ┌────────────┼────────────┬─────────────────┬──────────────────┐
    │            │            │                 │                  │
    ▼            ▼            ▼                 ▼                  ▼
┌─────────┐ ┌─────────┐ ┌──────────┐    ┌────────────┐    ┌────────────┐
│ Claude  │ │ Voyage  │ │  Qdrant  │    │   Neon     │    │ HuggingFace│
│ API     │ │ AI      │ │  Cloud   │    │ PostgreSQL │    │ Spaces     │
│         │ │         │ │          │    │            │    │            │
│ Sonnet 4│ │ voyage-3│ │ Vector   │    │ Notes,     │    │ ResNet34   │
│ LLM     │ │ Embed   │ │ Search   │    │ Users      │    │ 94% acc    │
└─────────┘ └─────────┘ └──────────┘    └────────────┘    └────────────┘
  ~$20/mo    ~$5/mo      Free tier       Free tier         Free tier
```

### RAG Pipeline Detail

```
User Query: "What projects has Duy worked on?"
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: Query Embedding                                          │
│ Voyage AI voyage-3 → 1024-dimensional vector                    │
│ Duration: ~50ms                                                  │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 2: Vector Search                                            │
│ Qdrant similarity search → Top 5 relevant chunks                │
│ Cosine similarity scoring                                        │
│ Duration: ~30ms                                                  │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 3: Context Assembly                                         │
│ Combine chunks with metadata, tags, priority                    │
│ Build augmented prompt with retrieved context                   │
│ Duration: ~10ms                                                  │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 4: Function Calling (if needed)                             │
│ Claude decides which tools to call based on query               │
│ Example: search_projects(query="projects", tech_filter=None)    │
│ Duration: ~200-500ms per tool                                   │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 5: LLM Generation                                           │
│ Claude Sonnet 4 synthesizes final response                      │
│ Combines RAG context + tool results + conversation history      │
│ Duration: ~1-2s                                                  │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
            Final Response to User
```

### Key Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Frontend** | HTML5, CSS3, JavaScript | UI, pipeline visualization, conversation memory |
| **Main Backend** | Flask (Python) | Portfolio chatbot, image classification proxy |
| **RAG Backend** | FastAPI (Python) | Second Brain pipeline, function calling, admin API |
| **LLM** | Claude Sonnet 4 (Anthropic) | Natural language generation, tool orchestration |
| **Embeddings** | Voyage AI (voyage-3) | 1024-dim semantic embeddings |
| **Vector DB** | Qdrant Cloud | Similarity search, knowledge retrieval |
| **SQL Database** | Neon PostgreSQL | User data, notes, session management |
| **ML Model** | HuggingFace Spaces | Garbage classification (ResNet34) |
| **Hosting** | Render | Cloud deployment with zero-downtime |
| **Domain** | Namecheap + GitHub Pages | Custom domain, static file hosting |

---

## Function Calling Tools

The Second Brain system includes 12+ tools that Claude can invoke to provide live, accurate data:

### Data Retrieval Tools

| Tool | Description | Example Use |
|------|-------------|-------------|
| `get_github_activity` | Fetches real-time GitHub profile, repos, contribution stats | "Show me Duy's GitHub activity" |
| `search_projects` | Semantic search across all portfolio projects | "Find projects using PyTorch" |
| `get_skills_for_role` | Returns skills relevant to specific job roles | "What skills for ML Engineer?" |
| `get_contact_info` | Returns contact details and social links | "How can I contact Duy?" |
| `get_availability` | Internship timeline, work authorization, preferences | "Is Duy available for internships?" |
| `get_impact_metrics` | Quantified achievements with context | "What impact has Duy made?" |
| `compare_technologies` | Side-by-side tech comparison with proficiency | "Compare PyTorch vs TensorFlow" |
| `get_education_details` | Academic background, coursework, certifications | "What's Duy's education?" |
| `get_work_experience` | Professional history with achievements | "What's Duy's work experience?" |
| `search_by_impact` | Filter projects by impact metrics | "Show high-impact projects" |
| `get_publications_research` | Research papers and publications | "Any publications?" |

### Authentication Tools

| Tool | Description | Security |
|------|-------------|----------|
| `authenticate_admin` | Verifies admin password, returns admin key | SHA-256 hash comparison |

---

## Production Infrastructure

This portfolio runs on self-funded production infrastructure, demonstrating end-to-end ownership of deployment and operations.

### Monthly Operating Costs

| Service | Purpose | Cost |
|---------|---------|------|
| **Render** (Standard) | Main chatbot backend | $25.00/mo |
| **Render** (Starter) | Second Brain RAG API | $7.00/mo |
| **Render** (Starter) | Faisal Lab AI Chatbot | $7.00/mo |
| **Claude API** | LLM inference (Sonnet 4) | ~$15-30/mo |
| **Voyage AI** | Embedding generation | ~$3-10/mo |
| **Qdrant Cloud** | Vector database | Free tier |
| **Neon PostgreSQL** | Relational database | Free tier |
| **Namecheap** | Domain registration | $1.25/mo |
| **GitHub Pages** | Static file hosting | Free |

**Total: ~$60-80/month (~$720-960/year)**

### Why Self-Fund Production Infrastructure?

1. **24/7 Availability**: Recruiters can test the system anytime, not just during demos
2. **Real-World Validation**: Production deployment proves the architecture works at scale
3. **End-to-End Ownership**: Demonstrates ability to manage full application lifecycle
4. **Zero Cold Starts**: Paid tiers ensure instant response times

---

## Skills Demonstrated

### AI/ML Engineering
- **RAG Architecture**: Vector embeddings, similarity search, context augmentation
- **Function Calling**: Tool orchestration with Claude API
- **LLM Integration**: Prompt engineering, conversation memory, streaming responses
- **Transfer Learning**: ResNet34 fine-tuning for image classification
- **Multi-Agent Systems**: Isolated memory contexts, self-healing fallbacks

### Full-Stack Development
- **Backend**: Python, Flask, FastAPI, async programming
- **Frontend**: JavaScript, HTML5, CSS3, responsive design
- **Databases**: PostgreSQL (relational), Qdrant (vector)
- **APIs**: RESTful design, CORS configuration, authentication

### Cloud & DevOps
- **Deployment**: Render, HuggingFace Spaces, GitHub Pages
- **Infrastructure**: Multi-service architecture, environment management
- **CI/CD**: Automatic deployment on git push
- **Monitoring**: Production error handling, logging

### Software Engineering
- **System Design**: Microservices, separation of concerns
- **Security**: Password hashing (SHA-256), secure authentication
- **Error Handling**: Self-healing AI, graceful degradation
- **Documentation**: Comprehensive README, inline comments

---

## Repository Structure

```
seattle-university-portfolio/
├── backend/                        # Flask backend (main chatbot)
│   ├── src/
│   │   ├── app.py                 # Flask app, API endpoints
│   │   ├── agent.py               # Dual-agent system
│   │   ├── llm.py                 # Claude API configuration
│   │   └── chatservice.py         # Service layer
│   └── dependencies/
│       └── requirements.txt
│
├── second-brain/                   # FastAPI backend (RAG system)
│   ├── backend/
│   │   ├── app/
│   │   │   ├── api/routes/
│   │   │   │   ├── demo.py        # RAG pipeline endpoints
│   │   │   │   └── admin.py       # Admin CRUD endpoints
│   │   │   ├── demo/
│   │   │   │   ├── portfolio_tools.py  # 12+ function calling tools
│   │   │   │   └── seed_data.py   # Knowledge base seed data
│   │   │   ├── db/
│   │   │   │   ├── postgres.py    # PostgreSQL connection
│   │   │   │   └── qdrant.py      # Qdrant vector DB
│   │   │   └── services/
│   │   │       └── portfolio_chat.py
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   └── CLAUDE.md                  # AI assistant instructions
│
├── docs/                          # Frontend (GitHub Pages)
│   ├── index_portfolio.html       # Main portfolio page
│   ├── admin.html                 # Admin panel
│   ├── css/
│   │   └── portfolio_su.css       # Seattle University theme
│   ├── js/
│   │   ├── chat.js                # Chatbot with RAG integration
│   │   └── sidebar_port.js
│   └── images/
│
├── ml-demos/                      # ML models (HuggingFace Spaces)
│   └── garbage-classification/
│       ├── app.py                 # Gradio interface
│       └── model_2_conservative_augmentation.pkl
│
├── README.md                      # This file
├── LICENSE                        # MIT License
└── render.yaml                    # Deployment configuration
```

---

## Technical Highlights

### 1. Unified Conversation Memory

**Challenge:** Image classification uses the main chatbot API, while follow-up questions go through the Second Brain RAG pipeline. Without shared context, the AI loses track of what "this project" refers to.

**Solution:** Implemented a unified conversation history on the frontend that both systems contribute to and read from.

```javascript
// Frontend maintains shared conversation history
let conversationHistory = [];

function addToHistory(role, content) {
    conversationHistory.push({ role, content });
    // Trim to last 20 messages to manage token usage
    if (conversationHistory.length > 20) {
        conversationHistory = conversationHistory.slice(-20);
    }
}

// RAG requests include conversation history
async function callRagPipeline(query) {
    return fetch(ragPipelineUrl, {
        method: 'POST',
        body: JSON.stringify({
            query: query,
            conversation_history: conversationHistory
        })
    });
}
```

### 2. Function Calling with Tool Orchestration

**Challenge:** Static knowledge bases can't provide real-time data like current GitHub activity or dynamic availability status.

**Solution:** Implemented 12+ function calling tools that Claude can invoke to fetch live data.

```python
PORTFOLIO_TOOLS = [
    {
        "name": "get_github_activity",
        "description": "Fetch real-time GitHub profile and repository information",
        "input_schema": {
            "type": "object",
            "properties": {
                "include_repos": {"type": "boolean", "default": True}
            }
        }
    },
    # ... 11 more tools
]

# Claude decides which tools to call
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    tools=PORTFOLIO_TOOLS,
    messages=messages
)

# Handle tool use loop
while response.stop_reason == "tool_use":
    tool_results = await execute_tools(response.content)
    messages.append({"role": "assistant", "content": response.content})
    messages.append({"role": "user", "content": tool_results})
    response = client.messages.create(...)
```

### 3. Real-Time Pipeline Visualization

**Challenge:** RAG systems are often "black boxes" - users don't understand how answers are generated.

**Solution:** Built a 5-step pipeline visualization that animates in real-time as each stage completes.

```javascript
// Animate pipeline steps based on backend timing data
async function animatePipelineSteps(steps, totalDuration, toolsUsed) {
    for (const step of steps) {
        const stepIndex = stepNameToIndex[step.name];
        const stepElement = document.querySelector(`[data-step="${stepIndex}"]`);

        stepElement.classList.add('active');
        await sleep(step.duration_ms);
        stepElement.classList.remove('active');
        stepElement.classList.add('completed');
    }
}
```

### 4. Secure Admin Authentication

**Challenge:** Need to protect admin functionality while allowing the AI to authenticate users through natural conversation.

**Solution:** Implemented a structured authentication protocol with SHA-256 password hashing.

```python
import hashlib

ADMIN_PASSWORD_HASH = hashlib.sha256("password".encode()).hexdigest()

async def authenticate_admin(password: str) -> Dict[str, Any]:
    provided_hash = hashlib.sha256(password.encode()).hexdigest()
    if provided_hash == ADMIN_PASSWORD_HASH:
        return {
            "authenticated": True,
            "admin_key": ADMIN_KEY,
            "message": "Authentication successful!"
        }
    return {"authenticated": False, "message": "Incorrect password"}
```

### 5. Self-Healing Error Correction

**Challenge:** LLM responses can sometimes be malformed, breaking the user experience.

**Solution:** Tertiary AI fallback that detects and automatically fixes formatting issues.

```python
def generate_evaluation_response(prompt):
    try:
        return evaluation_agent(prompt)['output']
    except Exception as e:
        if "Could not parse LLM output:" in str(e):
            extracted = extract_from_error(e)
            return fix_format_with_fallback_ai(extracted)
```

---

## Getting Started

### Prerequisites
- Python 3.10+
- Claude API key (Anthropic)
- Voyage AI API key
- Qdrant Cloud account (free tier)
- Neon PostgreSQL account (free tier)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/dcnguyen060899/seattle-university-portfolio.git
   cd seattle-university-portfolio
   ```

2. **Set up main backend (Flask)**
   ```bash
   cd backend
   pip install -r dependencies/requirements.txt

   # Create .env file
   echo "ANTHROPIC_API_KEY=your_key" > src/.env
   echo "ANTHROPIC_MODEL=claude-sonnet-4-20250514" >> src/.env

   python src/app.py
   ```

3. **Set up Second Brain backend (FastAPI)**
   ```bash
   cd second-brain/backend
   pip install -r requirements.txt

   # Create .env file with all required keys
   cat > .env << EOF
   ANTHROPIC_API_KEY=your_key
   VOYAGE_API_KEY=your_key
   QDRANT_URL=your_qdrant_url
   QDRANT_API_KEY=your_qdrant_key
   DATABASE_URL=your_neon_postgres_url
   EOF

   uvicorn app.main:app --reload
   ```

4. **Serve frontend**
   ```bash
   cd docs
   python -m http.server 8000
   # Open http://localhost:8000/index_portfolio.html
   ```

---

## API Endpoints

### Main Backend (Flask)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/chat` | POST | Portfolio chatbot conversation |
| `/evaluate-challenge` | POST | Code evaluation feedback |
| `/classify-image` | POST | Image classification proxy |

### Second Brain Backend (FastAPI)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/demo/rag-pipeline-enhanced` | POST | Full RAG pipeline with tools |
| `/api/v1/demo/seed` | POST | Seed/reseed knowledge base |
| `/api/v1/demo/tools` | GET | List available tools |
| `/api/v1/admin/knowledge` | GET/POST | CRUD knowledge entries |
| `/api/v1/admin/stats` | GET | Knowledge base statistics |

---

## Future Enhancements

### Planned Features
- **Streaming Responses**: Real-time token-by-token generation
- **Voice Interface**: Speech-to-text for accessibility
- **Analytics Dashboard**: Track recruiter interactions
- **Multi-language Support**: Responses in multiple languages
- **Session Persistence**: Save conversations across page refreshes

### Technical Improvements
- **Redis Caching**: Cache frequent queries
- **Rate Limiting**: Prevent API abuse
- **Load Testing**: Benchmark high traffic scenarios
- **APM Integration**: Application performance monitoring

---

## Contact & Links

**Duy Nguyen**
MS Data Science Candidate @ Seattle University (Expected June 2027)

| | |
|--|--|
| **Email** | [dcnguyen060899@gmail.com](mailto:dcnguyen060899@gmail.com) |
| **LinkedIn** | [linkedin.com/in/duwe-ng](https://www.linkedin.com/in/duwe-ng/) |
| **GitHub** | [github.com/dcnguyen060899](https://github.com/dcnguyen060899) |
| **Portfolio** | [duyng-portfolio.com](https://duyng-portfolio.com/docs/index_portfolio.html) |
| **Resume** | [duyng-portfolio.com/docs/index_resume.html](https://duyng-portfolio.com/docs/index_resume.html) |

### Other Notable Projects
- **MOSAIC Immigration Chatbot**: AI serving 660K+ users, Top 4 SFU CS Diversity Award
- **UC Berkeley Healthcare Analytics**: $30.4M projected savings, program exemplar
- **NASA Flight Analysis**: 1.88M measurements, 95.9% prediction accuracy (R²=0.959)
- **Duy Integral Theorem**: Novel mathematical framework for neural network generalization

---

## License

MIT License - Copyright (c) 2026 Duy Nguyen

This project is open source under the MIT License. **Attribution is required** if you use or adapt this work. Please credit the original author and link back to this repository.

---

## Acknowledgments

- **Seattle University** - MS Data Science program
- **UC Berkeley** - ML/AI Professional Certificate (Capstone Exemplar)
- **Anthropic** - Claude API for conversational AI
- **Voyage AI** - Embedding models for semantic search
- **Qdrant** - Vector database for similarity search
- **Render** - Cloud platform for deployment
- **Neon** - Serverless PostgreSQL

---

*Built with care by Duy Nguyen | Last Updated: January 2026*

**Self-funded production deployment demonstrating end-to-end AI engineering capabilities.**
