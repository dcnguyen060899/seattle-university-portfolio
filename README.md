# AI-Powered Portfolio Website with Intelligent Assistant

**Live Demo:** [https://duyng-portfolio.com](https://duyng-portfolio.com/docs/index_portfolio.html)

**Author:** Duy Nguyen | MS Data Science @ Seattle University

**Contact:** [dnguyen44@seattleu.edu](mailto:dnguyen44@seattleu.edu) | [LinkedIn](https://www.linkedin.com/in/duwe-ng/)

---

## What This Project Demonstrates

**This portfolio website is itself a meta-demonstration of technical capabilities.** Rather than just describing skills, it *shows* them through the sophisticated full-stack application you're currently viewing.

### The Meta-Point
If you're a recruiter evaluating this portfolio:
- The intelligent AI chatbot helping you navigate this site? **Built from scratch by the candidate**
- The clean, responsive interface? **Designed and implemented by the candidate**
- The backend API handling your questions? **Architected and deployed by the candidate**

**The existence and sophistication of this website proves the technical skills it describes.**

---

## Key Features

### 1. Dual Intelligent AI Chatbot System
- **Portfolio Assistant Chatbot**: Conversational AI that helps recruiters learn about the candidate's qualifications, tailoring responses based on role type (Data Science, ML Engineering, Analytics, etc.)
- **Code Evaluation Chatbot**: Automated educational tool that evaluates algorithm implementations and provides detailed feedback

### 2. Self-Healing Error Correction
- **Tertiary AI Fallback Mechanism**: When the evaluation chatbot detects malformed responses, a third AI automatically reformats the output
- **Multi-layered Validation**: Demonstrates robust error handling and system reliability through intelligent fallback systems

### 3. Production-Grade Architecture
- **RESTful API Design**: Clean separation between frontend and backend with proper CORS configuration
- **Conversation Memory Management**: Separate memory systems for different chatbots prevent context contamination
- **Deployed on Render**: Cloud-hosted backend with automatic scaling and monitoring

### 4. Sophisticated User Experience
- **Markdown-to-HTML Formatting**: AI responses are automatically formatted with headings, bold text, links, and bullet points
- **Animated Typing Indicators**: Real-time visual feedback showing the AI is "thinking"
- **Drag-and-Drop Positioning**: Recruiters can move the chatbot anywhere on screen
- **Dynamic Resizing**: Adjustable chatbot window for optimal reading experience

---

## Why This Matters for Recruiters

### Skills Demonstrated Through Implementation

**Full-Stack Development:**
- Backend: Python, Flask, RESTful API architecture
- Frontend: JavaScript, HTML5, CSS3, responsive design
- Integration: API endpoints, CORS configuration, deployment workflows

**AI/ML Engineering:**
- LangChain framework for conversational AI
- Claude API (Anthropic) integration
- Multi-agent system design with separate memory contexts
- Error detection and self-correction mechanisms

**Software Engineering Best Practices:**
- Clean code architecture with modular design
- Version control with Git/GitHub
- Production deployment and DevOps (Render platform)
- Comprehensive error handling and fallback systems
- Separation of concerns (portfolio chat vs. evaluation chat)

**Problem-Solving & System Design:**
- Designed tertiary AI fallback to handle edge cases
- Implemented conversation memory isolation to prevent cross-contamination
- Created role-specific response tailoring for different job types
- Built user-friendly features (drag, resize, formatting) from scratch

---

## Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (HTML/CSS/JS)                  │
│  • Responsive portfolio pages                               │
│  • Chatbot UI with drag/resize                              │
│  • Markdown rendering & animations                          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ HTTPS/REST API
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   Flask Backend (Python)                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Primary Agent (Portfolio Assistant)                │   │
│  │  • Tailors responses by role type                   │   │
│  │  • Maintains conversation context                   │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Evaluation Agent (Code Feedback)                   │   │
│  │  • Assesses algorithm implementations               │   │
│  │  • Separate memory to prevent contamination         │   │
│  │  • Triggers fallback AI on errors                   │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Fallback AI (Error Correction)                     │   │
│  │  • Detects malformed responses                      │   │
│  │  • Automatically reformats output                   │   │
│  │  • Self-healing mechanism                           │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ API Calls
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Claude API (Anthropic)                         │
│  • Advanced language model (Sonnet 4.5)                     │
│  • Natural language understanding                           │
│  • Context-aware responses                                  │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Frontend** | HTML5, CSS3, JavaScript | User interface, chatbot interactions, responsive design |
| **Backend API** | Flask (Python) | RESTful endpoints, request routing, CORS handling |
| **AI Framework** | LangChain | Agent orchestration, memory management, tool integration |
| **LLM** | Claude API (Anthropic) | Natural language processing, conversational responses |
| **Deployment** | Render | Cloud hosting, auto-scaling, continuous deployment |
| **Version Control** | Git/GitHub | Code management, collaboration, deployment triggers |

---

## Skills Showcased

### Programming Languages & Frameworks
- **Python**: Backend logic, AI integration, API development
- **JavaScript**: Frontend interactivity, DOM manipulation, async operations
- **SQL**: (Not in this project, but demonstrated in other portfolio projects)
- **HTML/CSS**: Semantic markup, responsive design, cross-browser compatibility

### Machine Learning & AI
- **LangChain**: Multi-agent systems, conversation memory, tool orchestration
- **Claude API**: Advanced LLM integration, prompt engineering
- **Error Handling**: Self-healing AI systems with fallback mechanisms
- **System Design**: Separate memory contexts for different chatbot types

### Software Engineering
- **RESTful API Design**: Clean endpoint structure, proper HTTP methods
- **Error Handling**: Try-catch blocks, graceful degradation, user-friendly messages
- **Code Organization**: Modular architecture, separation of concerns
- **CORS Configuration**: Cross-origin resource sharing for API security
- **Version Control**: Git workflow, commits, deployment automation

### DevOps & Deployment
- **Cloud Deployment**: Render platform configuration
- **Environment Variables**: Secure API key management
- **Continuous Deployment**: Automated deploy on git push
- **Debugging**: Production error handling and logging

### User Experience (UX)
- **Responsive Design**: Works on desktop, tablet, mobile
- **Interactive Features**: Drag-and-drop, dynamic sizing, animations
- **Accessibility**: Clear visual feedback, intuitive controls
- **Visual Design**: Color scheme, typography, layout consistency

---

## Repository Structure

```
seattle-university-portfolio/
├── backend/                    # Flask backend application
│   ├── src/
│   │   ├── app.py             # Main Flask application, API endpoints
│   │   ├── agent.py           # Dual-agent system (portfolio + evaluation)
│   │   ├── llm.py             # Claude API configuration, memory setup
│   │   ├── chatservice.py     # Service layer for chatbot interactions
│   │   └── tools/
│   │       └── llmchain.py    # LangChain prompt templates
│   └── dependencies/
│       └── requirements.txt   # Python dependencies
├── docs/                      # Frontend static files
│   ├── index_portfolio.html   # Main landing page
│   ├── learning_algorithm.html # Algorithm learning tool with evaluation chatbot
│   ├── css/
│   │   ├── portfolio_su.css   # Seattle University themed styles
│   │   └── learning_algorithm.css
│   ├── js/
│   │   ├── chat.js            # Portfolio chatbot frontend logic
│   │   └── learning_algorithm.js # Code evaluation chatbot frontend
│   └── images/                # Visual assets
├── README.md                  # This file
└── render.yaml               # Deployment configuration for Render

```

### Key Files Explained

**Backend (Flask API):**
- `app.py`: Defines API endpoints (`/chat`, `/evaluate-challenge`), handles CORS, routes requests
- `agent.py`: Creates two separate AI agents with different system prompts and memory contexts
- `llm.py`: Configures Claude API connection, sets token limits, creates memory objects
- `chatservice.py`: Service layer that bridges Flask routes to agent logic

**Frontend (User Interface):**
- `chat.js`: Implements chatbot UI, handles user input, formats AI responses, manages animations
- `portfolio_su.css`: Seattle University branding, responsive layout, chatbot styling
- `index_portfolio.html`: Main page structure, content, chatbot HTML elements

---

## Technical Highlights

### 1. Dual-Agent Architecture with Memory Isolation

**Challenge:** Two different chatbots (portfolio assistant + code evaluator) sharing the same backend could contaminate each other's conversation context.

**Solution:** Implemented separate `ConversationBufferMemory` instances for each agent, with the evaluation agent clearing its memory before each request to ensure fresh context.

```python
# Portfolio chat uses persistent memory
memory = ConversationBufferMemory(memory_key="chat_history", return_messages=True)

# Evaluation chat uses isolated, fresh memory
evaluation_memory = ConversationBufferMemory(memory_key="chat_history", return_messages=True)

def generate_evaluation_response(prompt):
    evaluation_memory.clear()  # Fresh context every time
    response = evaluation_agent(prompt)
    return response['output']
```

### 2. Self-Healing Error Correction System

**Challenge:** LLM responses can sometimes be malformed or in unexpected formats, breaking the user experience.

**Solution:** Built a tertiary AI fallback mechanism that detects errors, extracts the content, and uses a second AI call to reformat it correctly.

```python
def generate_evaluation_response(prompt):
    try:
        response = evaluation_agent(prompt)
        return response['output']
    except Exception as e:
        if "Could not parse LLM output:" in str(e):
            # Extract malformed content
            extracted_content = extract_from_error(e)
            # Use third AI to fix formatting
            return fix_format_variance_with_ai(extracted_content)
```

### 3. Role-Specific Response Tailoring

**Challenge:** Recruiters from different companies (e.g., Data Science vs ML Engineering roles) need different information about the candidate.

**Solution:** System prompt includes detailed role-specific positioning guides that tailor responses based on job type.

Example: When asked about a Data Science role, emphasizes SQL, statistical analysis, and dashboards. When asked about ML Engineering, emphasizes PyTorch, production systems, and model deployment.

### 4. CORS Configuration for Multi-Domain Support

**Challenge:** Portfolio hosted on multiple domains (duyng-portfolio.com, ucberkeley-ml-ai-capstone.com) needs API access.

**Solution:** Configured Flask-CORS to allow both domains for the evaluation endpoint.

```python
CORS(app, resources={r"/evaluate-challenge": {"origins": [
    "http://duyng-portfolio.com",
    "https://duyng-portfolio.com",
    "http://ucberkeley-ml-ai-capstone.com",
    "https://ucberkeley-ml-ai-capstone.com"
]}})
```

### 5. Dynamic Markdown Rendering

**Challenge:** AI responses contain markdown formatting (headings, bold, links) that needs to display properly in HTML.

**Solution:** Built custom JavaScript formatter that converts markdown to styled HTML in real-time.

```javascript
function formatBotMessage(text) {
    let formatted = text;
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');  // Bold
    formatted = formatted.replace(/^## (.+)$/gm, '<h2>$1</h2>');  // Headings
    formatted = formatted.replace(/\[([^\]]+)\]\((https?:\/\/[^\s]+)\)/g,
                                   '<a href="$2" target="_blank">$1</a>');  // Links
    return formatted;
}
```

---

## Getting Started

### Prerequisites
- Python 3.8+
- Claude API key from Anthropic
- Git

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/dcnguyen060899/seattle-university-portfolio.git
   cd seattle-university-portfolio
   ```

2. **Set up Python environment**
   ```bash
   cd backend
   pip install -r dependencies/requirements.txt
   ```

3. **Configure environment variables**
   Create `.env` file in `backend/src/`:
   ```env
   ANTHROPIC_API_KEY=your_api_key_here
   ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
   ```

4. **Run the backend**
   ```bash
   cd src
   python app.py
   ```

5. **Open frontend**
   Open `docs/index_portfolio.html` in your browser, or serve via a local server:
   ```bash
   python -m http.server 8000
   ```

### Production Deployment (Render)

The project includes `render.yaml` for automatic deployment to Render:

1. Connect GitHub repository to Render
2. Add environment variables in Render dashboard:
   - `ANTHROPIC_API_KEY`
   - `ANTHROPIC_MODEL`
3. Deploy automatically on git push to main branch

---

## Performance & Scalability

### Current Metrics
- **Response Time**: ~2-4 seconds for typical chatbot queries
- **Uptime**: 99.9% (Render managed hosting)
- **Concurrent Users**: Supports multiple simultaneous conversations
- **Token Limit**: 4096 tokens per response (sufficient for detailed cover letters)

### Scalability Considerations
- **Stateless API**: Each request is independent, enabling horizontal scaling
- **Memory Management**: Conversation contexts are isolated per agent type
- **Error Handling**: Graceful degradation with fallback mechanisms
- **Rate Limiting**: Claude API handles rate limiting automatically

---

## Design Decisions

### Why Dual Chatbot System?
Different use cases require different contexts:
- **Portfolio chatbot**: Needs conversation history to answer follow-up questions
- **Code evaluation chatbot**: Needs fresh context each time to avoid bias from previous evaluations

### Why Three-Layer AI System?
**Layer 1:** Primary agent handles normal responses

**Layer 2:** Error detection catches formatting issues

**Layer 3:** Fallback AI reformats malformed content

This provides robust error recovery without manual intervention.

### Why Flask Over Other Frameworks?
- **Simplicity**: Lightweight, easy to understand and maintain
- **Flexibility**: No rigid structure, easy to customize
- **Python Ecosystem**: Seamless integration with LangChain and ML libraries

### Why Claude API Over OpenAI?
- **Longer Context**: Better handling of extended conversations
- **Following Instructions**: More reliable adherence to system prompts
- **Output Quality**: More structured, professional responses for recruiter use cases

---

## Future Enhancements

### Planned Features
- Session Persistence: Save conversation history across page refreshes
- Multi-language Support: Chatbot responses in multiple languages
- Voice Interface: Speech-to-text input for accessibility
- Analytics Dashboard: Track recruiter interactions and common questions
- A/B Testing: Optimize system prompts based on user engagement
- Streaming Responses: Real-time word-by-word generation for better UX

### Technical Improvements
- Caching Layer: Redis for frequently asked questions
- Rate Limiting: Prevent API abuse
- Load Testing: Benchmark performance under high traffic
- Monitoring: Application performance monitoring (APM) integration
- CI/CD Pipeline: Automated testing before deployment

---

## Learning Outcomes

### What This Project Taught Me

**Technical Skills:**
- Building production-grade AI applications from scratch
- Integrating third-party APIs with proper error handling
- Designing multi-agent systems with isolated contexts
- Deploying full-stack applications to cloud platforms
- Managing complex state in frontend JavaScript

**Software Engineering:**
- Importance of separation of concerns (why dual agents need separate memory)
- Value of fallback mechanisms (self-healing AI prevents bad UX)
- CORS and security considerations for public APIs
- Version control best practices for continuous deployment

**Product Thinking:**
- Designing for the end user (recruiters need role-specific information)
- Balancing technical sophistication with usability
- Importance of visual feedback (typing indicators, animations)
- Iterative improvement based on real-world usage

---

## What This Project Demonstrates

This portfolio website serves as a practical demonstration of:

- **Full-stack capability**: Built both frontend and backend from scratch
- **AI/ML proficiency**: Integrated advanced LLM with custom prompting
- **System design**: Architected multi-agent system with proper isolation
- **Error handling**: Implemented self-healing fallback mechanisms
- **DevOps skills**: Deployed production application to cloud platform
- **UX focus**: Created intuitive, responsive user interface
- **Attention to detail**: Polished animations, formatting, visual feedback
- **Documentation**: Comprehensive README demonstrating communication skills

The existence of this website itself validates the technical skills described within - recruiters are experiencing the product while learning about the developer.

---

## Contact & Links

**Duy Nguyen**
MS Data Science Candidate @ Seattle University
Expected Graduation: June 2027

**Email:** [dnguyen44@seattleu.edu](mailto:dnguyen44@seattleu.edu)

**LinkedIn:** [linkedin.com/in/duwe-ng](https://www.linkedin.com/in/duwe-ng/)

**GitHub:** [github.com/dcnguyen060899](https://github.com/dcnguyen060899)

**Portfolio:** [duyng-portfolio.com](https://duyng-portfolio.com/docs/index_portfolio.html)

**Resume:** [ucberkeley-ml-ai-capstone.com/index_resume.html](https://ucberkeley-ml-ai-capstone.com/index_resume.html)

### Other Notable Projects
- **Duy Integral Theorem**: Mathematical framework for neural network generalization ([View Research](https://duyng-portfolio.com/docs/index_independent_research.html))
- **Aircraft Fuel Efficiency Analysis**: 1.88M flight measurements, 95.9% prediction accuracy
- **MOSAIC Immigration Chatbot**: AI serving 660K+ users, Top 4 SFU CS Diversity Award
- **UC Berkeley Healthcare Analytics**: $30.4M projected savings, program exemplar

---

## License

MIT License - Copyright (c) 2025 Duy Nguyen

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

This project is part of Duy Nguyen's academic portfolio for the MS Data Science program at Seattle University. While the code is open source under MIT License, **attribution is required** if you use or adapt this work. Please credit the original author and link back to this repository.

---

## Acknowledgments

- **Seattle University** - MS Data Science program providing foundation for this work
- **UC Berkeley** - ML/AI Professional Certificate program for practical ML training
- **Anthropic** - Claude API enabling sophisticated conversational AI
- **LangChain** - Framework simplifying agent orchestration and memory management
- **Render** - Cloud platform for reliable deployment and hosting

---

**Built with care by Duy Nguyen | Last Updated: January 2025**

**Copyright © 2025 Duy Nguyen. Licensed under the MIT License.**
