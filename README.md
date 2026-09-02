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
- **Algorithm Challenge Tutor**: Evidence-first AI code review inside the interactive subtree lesson (`docs/learning_algorithm.html`, Challenge mode); see *Evaluation pipeline v2* below

### 3. Admin Authentication System
- **Secure Password Authentication**: SHA-256 hashed password verification
- **Admin Panel**: Manage knowledge base content through web interface
- **Force Reseed Capability**: Update vector database without redeployment

### 4. Live ML Demo Integration
- **In-Chat Image Classification**: Upload images for real-time garbage classification
- **ResNet34 Model**: Deep learning with 94% accuracy, 100% minority class recall
- **AI-Interpreted Results**: ML predictions translated to natural language with disposal guidance

### 5. Evaluation Pipeline v2 (Challenge Mode of the Subtree Lesson)
- **Learner code runs in the browser**: a Web Worker executes the submission against a versioned test catalog (41 tests across three challenges) with a 2 s per-test watchdog; nothing is executed on the server
- **Evidence before opinion**: the verdict and the correctness / edge-case scores are computed from the test results; Claude Sonnet 5 scores concepts, efficiency and code quality inside evidence-derived caps
- **Structured, guarded output**: JSON-schema output, a leak guard that withholds any sentence quoting the reference solution, and a hint policy fixed by the attempt number (conceptual -> targeted -> near-explicit)
- **Ask the tutor**: Socratic follow-up questions about the problem, an approach, complexity, or highlighted lines of the learner's own code
- **Visualize my solution**: a step-by-step replay of the learner's own code on one small test input, captured as a deterministic execution trace in the browser sandbox; "Explain this step" hands the current step to the tutor
- **Works without a key**: rule-based feedback, retrieved misconception cards and fallback hints when the model is unavailable

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
│  │  Evaluation pipeline v2      │  │  │  └──────────────────────────────┘  │
│  │  • Test evidence -> scores   │  │  │  ┌──────────────────────────────┐  │
│  │  • Sonnet 5 judge (JSON)     │  │  │  │  Admin System                │  │
│  │  • Guardrails + tutor        │  │  │  │  • Knowledge CRUD            │  │
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
│ Sonnet 5│ │ voyage-3│ │ Vector   │    │ Notes,     │    │ ResNet34   │
│ (RAG: 4)│ │ Embed   │ │ Search   │    │ Users      │    │ 94% acc    │
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
| **Code sandbox** | Web Worker (browser) | Runs learner JavaScript against the challenge test catalog with a 2 s per-test watchdog |
| **Main Backend** | Flask (Python) | Portfolio chatbot, image classification proxy |
| **RAG Backend** | FastAPI (Python) | Second Brain pipeline, function calling, admin API |
| **LLM** | Claude Sonnet 5 (Anthropic) | Chatbot answers and the evaluation judge (structured output, adaptive thinking); the Second Brain RAG pins Sonnet 4 |
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
| **Claude API** | LLM inference (Sonnet 5 chatbot and judge, Sonnet 4 RAG) | ~$15-30/mo |
| **Voyage AI** | Embedding generation | ~$3-10/mo |
| **Qdrant Cloud** | Vector database | Free tier |
| **Neon PostgreSQL** | Relational database | Free tier |
| **Namecheap** | Domain registration | $1.25/mo |
| **GitHub Pages** | Static file hosting | Free |

**Total: ~ $60-80/month (~$720-960/year)**

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
- **LLM-as-Judge Design**: Evidence-first scoring, JSON-schema output, prompt caching, leak guards and hint policies

### Full-Stack Development
- **Backend**: Python, Flask, FastAPI, async programming
- **Frontend**: JavaScript, HTML5, CSS3, responsive design
- **Databases**: PostgreSQL (relational), Qdrant (vector)
- **APIs**: RESTful design, CORS configuration, authentication

### Cloud & DevOps
- **Deployment**: Render, HuggingFace Spaces, GitHub Pages
- **Infrastructure**: Multi-service architecture, environment management
- **CI/CD**: GitHub Actions (pytest, Node tests, registry sync check) and automatic deployment on git push
- **Monitoring**: Production error handling, logging

### Software Engineering
- **System Design**: Microservices, separation of concerns
- **Security**: Password hashing (SHA-256), secure authentication
- **Error Handling**: Typed SDK error mapping, graceful degradation without an API key
- **Documentation**: Comprehensive README, inline comments

---

## Repository Structure

```
seattle-university-portfolio/
├── backend/                        # Flask backend (main chatbot + evaluation service)
│   ├── src/
│   │   ├── app.py                 # Flask app: /chat, /classify-image; serves docs/ locally
│   │   ├── agent.py               # Portfolio agent (LangChain ReAct)
│   │   ├── llm.py                 # Claude configuration for the chatbot (claude-sonnet-5)
│   │   ├── chatservice.py         # Service layer
│   │   └── evaluation/            # Evaluation pipeline v2 (raw anthropic SDK, no LangChain)
│   │       ├── registry.py        # Challenge data model, validation, hashes, exports
│   │       ├── challenge_data/    # countSubtrees, fuzzySubtree, mirrorSubtree + generic cards
│   │       ├── evidence.py        # Re-checks browser results against server expected values, static checks
│   │       ├── retrieval.py       # Misconception-card retrieval (Jaccard over failing test ids)
│   │       ├── prompts.py         # Cached system blocks, submission message, tutor turn
│   │       ├── schema.py          # JSON schemas for structured output
│   │       ├── judge.py           # Model call, typed error mapping, FakeJudge
│   │       ├── postcheck.py       # Verdict/scores from evidence, issue filter, leak guard, hint policy
│   │       ├── degraded.py        # Rule-based feedback when the model is unavailable
│   │       ├── pipeline.py        # Orchestration, pipeline trace, legacy text, tutor
│   │       ├── ratelimit.py       # Per-IP token bucket
│   │       └── routes.py          # /evaluate-challenge, /evaluate-challenge/health, /evaluate-challenge/tutor
│   ├── scripts/
│   │   ├── export_challenges.py   # Registry -> docs/data/*.json (--check in CI and in the Render build)
│   │   └── verify_challenges.mjs  # Runs references and known-bad submissions through the real worker
│   ├── tests/                     # pytest suite (tests/*.py) + Node tests
│   │   └── js/
│   │       ├── challenges.test.mjs       # Every reference and known-bad through the real worker
│   │       ├── worker_contract.test.mjs  # Worker message protocol
│   │       └── trace.test.mjs            # Execution tracer, worker `trace` protocol, replay steps and captions
│   ├── .env.example               # Every evaluation env var with its default
│   └── dependencies/
│       ├── requirements.txt
│       └── requirements-dev.txt   # pytest
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
│   ├── learning_algorithm.html    # Interactive subtree lesson (Learn / Practice / Challenge)
│   ├── data/                      # Generated challenge definitions (do not edit by hand)
│   │   ├── challenges.json        # Specs, tests, hints, public misconception cards
│   │   └── challenge_solutions.json  # Reference solutions, fetched only on reveal
│   ├── css/
│   │   ├── portfolio_su.css       # Seattle University theme
│   │   └── learning_algorithm.css # Lesson page (same tokens, not linked to portfolio_su.css)
│   ├── js/
│   │   ├── chat.js                # Chatbot with RAG integration
│   │   ├── learning_algorithm.js  # Learn / Practice modes
│   │   ├── challenge_mode.js      # Challenge mode: results, hints, solution lock, tutor box, replay wiring
│   │   ├── challenge_runner.js    # Spawns the worker, watchdogs, hashes, local card retrieval, trace requests
│   │   ├── challenge_worker.js    # Web Worker sandbox (compiles and runs learner code; traces it on demand)
│   │   ├── challenge_trace.js     # acorn instrumentation + tracer, loaded by the worker for a replay
│   │   ├── challenge_viz.js       # "Visualize my solution": tree layout, replay steps, captions, playback
│   │   ├── vendor/
│   │   │   ├── acorn.js           # acorn 8.14.0, vendored so the sandbox never fetches a parser
│   │   │   └── LICENSE-acorn      # MIT
│   │   └── sidebar_port.js
│   └── images/
│
├── ml-demos/                      # ML models (HuggingFace Spaces)
│   └── garbage-classification/
│       ├── app.py                 # Gradio interface
│       └── model_2_conservative_augmentation.pkl
│
├── .github/workflows/
│   ├── backend-tests.yml          # CI: pytest, Node tests, export --check, verify script
│   └── deploy-hf-space.yml        # Syncs ml-demos/ to the HuggingFace Space
├── README.md                      # This file
├── LICENSE                        # MIT License
└── render.yaml                    # Left unchanged; the live service is configured in the Render dashboard (see Deploy)
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

### 5. Evaluation Pipeline v2

**Challenge:** The first version of the challenge grader sent the learner's code to a LangChain agent and trusted whatever prose came back. Nothing executed the code, so the score was an opinion; nothing checked the claims against real test results; and nothing stopped the model from quoting the reference solution.

**Solution:** A rewrite that treats the model as a judge of evidence, not as the source of truth. Learner code never runs on the server; the server re-checks what the browser reports, retrieves context, calls Claude Sonnet 5 with a JSON schema, and then cross-checks the answer against the evidence.

```
BROWSER (docs/)                                      SERVER (backend/src/evaluation/)
challenge_mode.js loads data/challenges.json         routes.py    size cap, validation, per-IP rate limit
challenge_runner.js -> challenge_worker.js           evidence.py  recompute pass/fail from SERVER expected values, static checks
   compile + tests (watchdog) -> client_results      retrieval.py error cards, uniform rules, Jaccard misconception cards
   trace (acorn-instrumented) -> challenge_viz.js    (replay stays in the browser)
POST /evaluate-challenge {code, client_results} ---> prompts.py   2 cached system blocks + volatile submission message
                                                     judge.py     claude-sonnet-5, json_schema output, typed error mapping
                                                     postcheck.py verdict/scores from evidence, caps, issue filter, leak guard, hint policy
                                                     pipeline.py  orchestration, pipeline_trace, legacy text; degraded.py
<-- {response, evaluation, tests, retrieval, pipeline, ai, ...}
```

**Stages.** The page shows them as a pipeline strip (Static checks -> Sandbox tests -> Context -> AI judge -> Consistency) and replays the server's `pipeline.trace` when the review arrives.

1. **Static checks + sandbox tests (browser).** `challenge_worker.js` compiles the submission with `new Function` in strict mode and runs the challenge's test catalog (41 tests across `countSubtrees`, `fuzzySubtree` and `mirrorSubtree`; trees are LeetCode level-order arrays). `challenge_runner.js` arms a 2 s per-test watchdog and a 15 s total budget, terminates and respawns the worker on a hang (at most twice), and builds `client_results`: per-test `actual`, `error` and `ms`, the catalog's `tests_hash` and the SHA-256 of the code. "Run tests" is free and unlimited and never calls the API.
2. **Evidence (server).** `evidence.py` re-derives every pass/fail from the server's own expected values (the browser reports only `actual`), discards results whose `tests_hash` or `code_sha256` do not match (`evidence_note` says why), and runs six static checks (entry function present, size, compiles, helper present, recursion present, input mutation).
3. **Context / retrieval.** `retrieval.py` maps the failing-test set to misconception cards: two uniform rules (every result `undefined` -> a missing `return`; boolean results on the counting challenge), error-message cards (null dereference, stack overflow, undefined identifier) and Jaccard similarity between the failing ids and each card's known failing-set signature. Every card was verified against a known-bad submission that fails exactly that set (`backend/scripts/verify_challenges.mjs`). No code regexes, and nothing is retrieved on a full pass.
4. **AI judge.** `judge.py` calls `claude-sonnet-5` through the raw `anthropic` SDK with `output_config={"effort": "medium", "format": {"type": "json_schema", ...}}` and adaptive thinking (`max_tokens=16000`, 40 s timeout, one fast retry on overload or connection errors). Two 1-hour cached system blocks (the judge instructions and the challenge pack with the reference solution, test catalog, rubric anchors and misconception catalog) plus a 5-minute breakpoint on the submission message keep the volatile part of every request small. Every SDK exception maps to a typed `ai.reason` (`rate_limited`, `timeout`, `auth_error`, `upstream_unavailable`, ...) with a fixed user-facing message; nothing from the exception text reaches the client.
5. **Consistency (post-checks).** `postcheck.py` overrides the model wherever evidence exists and records every change in `pipeline.guardrails`, so the page can say "Correctness set to 85 from 11/13 passing tests (the model said 62)."

**Evidence-first scoring.** The verdict (`PASS | PARTIAL | FAIL | ERROR | UNVERIFIED`) and the `correctness` and `edge_cases` scores come from the test results (each test is tagged, and the tag decides the dimension); the judge scores `key_concepts`, `efficiency` and `code_quality` inside caps derived from the evidence: a failed core test caps key concepts at 70, fewer than half the tests passing caps every judge dimension at 60, a timeout caps efficiency at 20, a full pass floors key concepts at 70, a `hardcoded_tests` flag caps correctness at 30. `overall` is server arithmetic over the rubric weights (0.45 / 0.15 / 0.20 / 0.05 / 0.15). Every issue must cite a failing test id, a line that exists in the code, or a failed static check; citations of passing tests are dropped and the drop is counted.

**Leak guard and hint policy.** Every 60-character window of the normalised reference solution (and of each accepted alternative) that does not also occur in the starter code or in the learner's own code is a leak window; any sentence of the summary, issues, strengths, next steps or hint that contains one is withheld, and a leaking hint is replaced by a deterministic fallback built from the top retrieved card. The learner pulls a static three-level hint ladder (hint 1 free, hint 2 after one counted attempt, hint 3 after two; unchanged code never counts as an attempt). The AI adds exactly one hint per review whose level is fixed by the attempt number (`conceptual` at attempt 1, `targeted` at 2, `near_explicit` from 3 on, `extension` on a pass); a hint at the wrong level, or one that contains code it should not, is replaced the same way. The reference solution unlocks when all tests pass, after four attempts, or when the learner gives up after two (recorded and sent with every later request as `learner_state`).

**Ask the tutor.** `POST /evaluate-challenge/tutor` answers short Socratic questions at any point in Challenge mode: free text, three quick prompts (explain the problem, suggest an approach, time and space complexity) and questions about a highlighted range of the learner's own code. Selecting lines in the editor shows an "Ask tutor about Ln 13-14" popover; the page sends `{start_line, end_line, text}` and the prompt tells the model to talk about those lines specifically. The request replays the byte-identical submission message (so the cache prefix is shared with the review), the last evaluation as completed assistant history and up to three previous turns; the answer passes through the same leak guard and a level clamp ("I'm stuck" raises the level by exactly one). Five questions per challenge; the budget refills when a new AI review completes or when tests run on changed code.

**Visualize my solution.** Once a run compiles, "Visualize my solution" replays the learner's own code step by step on one small test input (at most 15 nodes; the first failing one is preselected) in the same visual language as Learn mode: both trees as SVG, the nodes the current call is comparing highlighted (solid red ring), visited nodes greyed, boolean returns marked on the main tree (green = matched, dashed red ring = rejected; a legend under the trees names the states), a "Current step" caption, the call stack, the last returned value, prev / play / next / end controls at 0.5x, 1x or 2x, a step slider and keyboard navigation. The replay is a deterministic execution trace, not model output: on a `trace` message the Web Worker lazily loads the vendored parser (acorn 8.14.0, MIT, `docs/js/vendor/acorn.js` next to its `LICENSE-acorn`), `challenge_trace.js` rewrites every function of the submission so that each call, return and throw is recorded (capped at 600 events, under the same 2 s watchdog), and the worker returns the events plus the node metadata; `challenge_viz.js` turns them into steps and templated captions ("Call countMismatches(main node 2, pattern node 2) at depth 1.", "Final answer: true. Expected false: your answer differs from the expected result."). Nothing is persisted and nothing reaches the server until the learner clicks "Explain this step", which sends the current step (`mode: "explain_step"` with its index, caption, call, stack and returned value, plus the enclosing function as the selection) to `/evaluate-challenge/tutor` and spends one of the five tutor questions; the answer appears under the step caption as well as in the tutor thread, and the button only appears when the tutor is available.

**Degraded mode.** Without `ANTHROPIC_API_KEY` (or with `EVAL_AI_DISABLED=1`, or when the model call fails) `/evaluate-challenge` still answers HTTP 200 with the same shape: verdict and evidence scores from the tests, heuristic scores for the judge-owned dimensions (`source: "heuristic"`), one issue per retrieved misconception card citing every failing test it explains (failing tests without a card get their own issue), a fallback hint, `ai.degraded: true` with a fixed `ai.message`, and the judge stage marked `skipped` or `degraded` in `pipeline.trace`. The page shows a banner and keeps the local results; the tutor box shows "AI tutor not configured on this server" with disabled controls.

**Fake judge for tests.** `EVAL_FAKE_JUDGE=1` (test only, never set in production) swaps the SDK judge for a `FakeJudge` that returns a deterministic, schema-valid evaluation built from the evidence (all tests pass -> `PASS` with an extension hint; failures -> `PARTIAL` with one issue citing the first failing test and the top card) and a canned tutor answer that echoes the selected line range (and the step index for `explain_step`). `/evaluate-challenge/health` then reports `"model": "fake-judge"`. It lets Playwright drive the whole AI path (pipeline replay, rubric bars, guardrails panel, tutor thread) without a key.

**Legacy compatibility.** The old body `{"code": "...", "challenge_type": "fuzzySubtree"}` still works (no browser results -> verdict `UNVERIFIED`), and every response carries the old plain-text `response` field next to the structured fields.

---

## Getting Started

### Prerequisites
- Python 3.10+ (3.11 in CI and on Render)
- Node.js 20+ (only for the JavaScript tests and the challenge verify script)
- Claude API key (Anthropic) - optional for the evaluation backend, which runs in degraded (rule-based) mode without one
- Voyage AI API key, Qdrant Cloud account and Neon PostgreSQL account (Second Brain only, free tiers)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/dcnguyen060899/seattle-university-portfolio.git
   cd seattle-university-portfolio
   ```

2. **Set up main backend (Flask + evaluation service)**
   ```bash
   cd backend
   pip install -r dependencies/requirements.txt -r dependencies/requirements-dev.txt

   # Create backend/.env (python-dotenv finds it from backend/src/app.py).
   # Leave ANTHROPIC_API_KEY empty to run the evaluation backend in degraded mode.
   cp .env.example .env
   #   ANTHROPIC_API_KEY=your_key
   #   ANTHROPIC_MODEL=claude-sonnet-5

   # Serve the API and the docs/ pages from the same origin
   cd src
   flask --app app run --port 5000
   # Open http://localhost:5000/learning_algorithm.html and switch to Challenge mode
   ```
   `python app.py` from `backend/src` (the Flask debug server, also port 5000) works too. The Flask app serves `docs/` as its static folder, so on `localhost` / `127.0.0.1` the page calls the API on the same origin (no CORS); on any other host it calls `https://uc-berkeley-ml-ai-capstone-work-sample.onrender.com`, and `<meta name="eval-api-base" content="...">` in `learning_algorithm.html` overrides both. To see the whole AI path without a key, start the server with `EVAL_FAKE_JUDGE=1` (see *Environment variables*).

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

4. **Serve frontend (portfolio pages)**
   ```bash
   cd docs
   python -m http.server 8000
   # Open http://localhost:8000/index_portfolio.html
   ```
   A plain static server is enough for the portfolio and for the Learn / Practice / "Run tests" parts of the lesson (the sandbox is browser-only); "Get AI feedback" and the tutor need the Flask origin from step 2.

### Environment variables (evaluation backend)

All of them live in `backend/.env.example` with their defaults. The chatbot (`/chat`) only reads `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`.

| Variable | Default | Purpose |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | (empty) | Enables the AI judge and the tutor. Empty -> degraded mode: tests, cards and fallback hints still work |
| `ANTHROPIC_MODEL` / `EVAL_MODEL` | `claude-sonnet-5` | Model id. `EVAL_MODEL` overrides `ANTHROPIC_MODEL` for the judge and tutor only; the chatbot keeps `ANTHROPIC_MODEL` |
| `EVAL_EFFORT` | `medium` | `low`, `medium`, `high`, `xhigh` or `max`; used by both the judge and the tutor call |
| `EVAL_MAX_TOKENS` | `16000` | Clamped to 1024..32000; thinking shares the budget (the tutor call uses 4000) |
| `EVAL_TIMEOUT_S` | `40` | SDK request timeout in seconds; the judge does one fast retry on overload or connection errors |
| `EVAL_AI_DISABLED` | `0` | `1` forces degraded mode even with a key |
| `EVAL_RATE_PER_MIN` | `10` | Per-IP token bucket (burst 5) on `POST /evaluate-challenge` and `/tutor`, also in degraded mode; raise it for local Playwright runs |
| `EVAL_FAKE_JUDGE` | `0` | **Test only.** `1` replaces the model with the deterministic `FakeJudge` (`health.model` = `fake-judge`) |
| `ALLOWED_ORIGINS` | portfolio + localhost origins | Comma-separated CORS allow-list for `/evaluate-challenge*`; the other routes keep `*` |

### Running the tests

No network and no key are needed; `conftest.py` forces `ANTHROPIC_API_KEY` empty.

```bash
# from the repository root
python -m pytest backend/tests -q                   # 206 tests: registry, evidence, retrieval, prompts, judge, post-checks, routes, tutor
node --test 'backend/tests/js/*.test.mjs'           # 125 tests: worker contract, execution tracer + replay helpers, every reference/known-bad through the real worker
python backend/scripts/export_challenges.py --check # docs/data/*.json is in sync with the registry (exit 1 when stale)
node backend/scripts/verify_challenges.mjs          # references pass, every known-bad fails exactly its expected set, tests < 100 ms
(cd backend/src && python -c "import app")          # the app still boots without a key
```

Quote the glob: on Node 22 `node --test backend/tests/js/` treats the directory as a file. The Node tests and the verify script spawn Python for the private registry export (`PYTHON` env var, else `python3`, else `python`; 3.10+, stdlib only). `.github/workflows/backend-tests.yml` runs exactly this set on every push or pull request that touches `backend/**`, `docs/js/challenge_*.js`, `docs/data/**` or `render.yaml`.

To drive the page end to end without a key (Playwright or by hand):

```bash
cd backend/src && ANTHROPIC_API_KEY= EVAL_FAKE_JUDGE=1 EVAL_RATE_PER_MIN=600 flask --app app run --port 5055
# http://localhost:5055/learning_algorithm.html -> Challenge mode -> Get AI feedback / Ask the tutor / Visualize my solution
```

### Adding a challenge

The Python registry is the single source of truth; the page renders everything from the exported JSON.

1. Create `backend/src/evaluation/challenge_data/<name>.py` with `CHALLENGE = Challenge(...)` (copy `mirror_subtree.py`): spec text, examples, constraints, signature, starter code, a Python `reference_py` (the ground truth for every `expected`), the JavaScript `reference_solution` and `accepted_alternatives`, tests (`TestCase` with level-order tree tuples, `None` = missing child; omit the last argument to exercise a JavaScript default parameter), a 3-level hint ladder, 4 fallback hints (one per hint level), misconception cards (exactly one of `signature_failing_ids`, `error_pattern` or `uniform_rule` each), `known_bad` submissions with their `expected_failing_ids`, rubric weights, `judge_notes` and `next_challenge_id`.
2. Import it in `challenge_data/__init__.py` (the `CHALLENGES` tuple is sorted by `order`) and point the previous challenge's `next_challenge_id` at it. Importing the registry runs `validate_registry()`: unique ids, known tags, tree limits (<= 100 nodes, values in [-100, 100]), `reference_py` reproducing every expected value, weights summing to 1, exactly 3 hints and 4 fallbacks, referenced ids existing.
3. `python backend/scripts/export_challenges.py` regenerates `docs/data/challenges.json` (public view: no references, no known-bads, no judge notes) and `docs/data/challenge_solutions.json`; commit both (CI and the Render build run `--check`).
4. `node backend/scripts/verify_challenges.mjs` proves the reference and alternatives pass, each known-bad fails exactly its set, the starter fails, and every test runs under 100 ms; `pytest` and the Node tests pick the new challenge up automatically.
5. Add a tab in `docs/learning_algorithm.html` (`button.challenge-tab` with `data-challenge-id="<id>"` inside `#challenge-tabs`); `challenge_mode.js` renders the card, tests, hints and solution lock from the JSON.

### Deploy (Render)

The live service was created in the Render dashboard, and `render.yaml` is intentionally left alone (it still says `YourServiceName`; linking it as a Blueprint would create a second service). Paste these into the dashboard for the existing service:

| Setting | Value |
|---------|-------|
| Build command | `pip install -r backend/dependencies/requirements.txt && python backend/scripts/export_challenges.py --check` |
| Start command | `gunicorn app:app --chdir backend/src --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 120` |
| `ANTHROPIC_API_KEY` | your key (mark it secret) |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` |
| `PYTHON_VERSION` | optional, e.g. `3.11.9` |

Then redeploy and open `https://<service>.onrender.com/evaluate-challenge/health` (expect `"ai_configured": true`, `"model": "claude-sonnet-5"` and the `registry_hash` printed by the export script) and `/api-check` (the chatbot on Sonnet 5). One worker keeps the chatbot memory and the rate limiter coherent, four threads keep `/chat` responsive during a judge call, and `--timeout 120` covers the ~51 s worst case of a judge call (gunicorn's 30 s default would kill it mid-call). The `--check` in the build fails the deploy when `docs/data/*.json` is out of sync with the registry. A workspace spend limit in the Anthropic console is the recommended cost guard next to the per-IP limiter.

---

## API Endpoints

### Main Backend (Flask)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/chat` | POST | Portfolio chatbot conversation |
| `/evaluate-challenge/health` | GET | Capability check and Render warm-up: `ai_configured`, `ai_disabled`, `model`, `effort`, `registry_hash`, per-challenge `tests_hash`, `followup`. No model call, not rate limited |
| `/evaluate-challenge` | POST | Evaluate a submission with browser test evidence. Always 200 once the body validates (degraded mode included); the legacy `{code, challenge_type}` body is still accepted |
| `/evaluate-challenge/tutor` | POST | Socratic follow-up: `mode` = `question`, `explain_problem`, `suggest_approach`, `complexity` or `explain_step` (requires `step`: `index`, `total`, `caption`, `call`, `stack`, `returned`), optional `selection` (highlighted lines), `history` (last 3 turns), `stuck`. Judge failures map to 429 / 502 / 503 / 504 |

Both POST routes require `Content-Type: application/json` (any other content type gets the 400 envelope, which also keeps cross-site "simple" requests out) and reject bodies over 96 KB with 413, chunked bodies included.
| `/classify-image` | POST | Image classification proxy |
| `/api-check` | GET | Chatbot connectivity check |

Evaluation request (the page sends this after running the tests in the browser; `client_results` is optional):

```json
{ "challenge_id": "fuzzySubtree", "code": "function fuzzySubtree(root, subRoot, maxDifferences = 1) { ... }",
  "attempt": 2, "hints_used": [1], "previous": {"failed_test_ids": ["fz-06", "fz-15"], "hint_level": "conceptual"},
  "learner_state": {"gave_up": false, "solution_revealed": false},
  "client_results": { "harness_version": "1", "tests_hash": "eacb852c69f7effd", "code_sha256": "<sha256 of code>",
    "compile": {"ok": true, "error": null, "error_kind": null, "entry_found": true, "defined_functions": ["fuzzySubtree", "countMismatches"]},
    "tests": [{"id": "fz-06", "status": "fail", "actual": true, "actual_type": "boolean", "error": null, "ms": 0.12}, "..."],
    "total_ms": 4.1 } }
```

Evaluation response (200): `ok`, `request_id`, `challenge_id`, `attempt`, `evaluation_id`, `verdict`, `overall`, `evaluation` (`verdict`, `summary`, `progress_note`, `scores` with `score` / `justification` / `source` per dimension, `strengths`, `issues` with evidence citations, `misconception_tags`, `complexity`, `next_hint` with its level and Socratic question, `what_to_try_next`, `encouragement`, `flags`), `tests` (summary, per-tag counts, failed rows with input / expected / actual), `retrieval` (cards with `similarity` and `matched_by`), `pipeline` (`trace` of the six stages and `guardrails`), `ai` (`enabled`, `degraded`, `reason`, `message`, `model`, `usage`), `solution_unlocked`, and the legacy plain-text `response`. Limits: 96 KB body (413), 20,000 characters / 600 lines of code (400), 10 requests per minute per IP with a burst of 5 (429 with `Retry-After`). Every error uses `{"ok": false, "request_id", "error": {"code", "message", "field"}, "response": "Error: ..."}`.

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
- **Rate Limiting**: Extend the per-IP limiter (already on `/evaluate-challenge*`) to `/chat`
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

*Built with care by Duy Nguyen | Last Updated: September 2026*

**Self-funded production deployment demonstrating end-to-end AI engineering capabilities.**
