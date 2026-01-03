"""
Demo Seed Data - Portfolio Content for Duy Nguyen

This module contains pre-populated knowledge for the portfolio demo.
Based on actual portfolio content from duyng-portfolio.com
"""

PORTFOLIO_KNOWLEDGE = [
    # === About Me ===
    {
        "content": """Duy Nguyen is a MS Data Science student at Seattle University (starting Fall 2025),
        with a track record of building production ML systems that deliver measurable business impact.
        He has served 660K+ users through AI chatbots, projected $30.4M in savings through ML models,
        and achieved 95.9% variance explanation in flight analysis.

        He is seeking Summer 2026 data science or AI/ML engineering internships where he can apply
        production experience while developing expertise in causal reasoning and scalable analytics.""",
        "source": "portfolio",
        "tags": ["about", "introduction", "background", "seattle-university"],
        "context": {"category": "about", "priority": "high"}
    },

    # === Education ===
    {
        "content": """Seattle University - Master of Science in Data Science (Starting Fall 2025)

        Previous Education:
        - UC Berkeley - Professional Certificate in Machine Learning & AI (Capstone Exemplar)
        - Simon Fraser University - Research experience in medical AI

        Relevant Coursework and Areas:
        - Machine Learning & Deep Learning
        - Statistical Methods and Causal Inference
        - Natural Language Processing
        - Computer Vision
        - Data Engineering & MLOps""",
        "source": "portfolio",
        "tags": ["education", "seattle-university", "masters", "uc-berkeley", "sfu"],
        "context": {"category": "education", "priority": "high"}
    },

    # === MOSAIC Project ===
    {
        "content": """Project: MOSAIC - AI Immigration Chatbot

        Built an AI-powered chatbot with SFU Blueprint for MOSAIC, serving 660,000+ users
        across Canadian immigration services. Recognized as Top 4 in SFU CS Diversity Award.

        Key Achievements:
        - Analyzed 660K+ user interactions to build structured query categorization system
        - Designed knowledge graph (Neo4j) mapping programs, services, eligibility criteria
        - Built validation pipeline achieving 90% accuracy with full lineage tracking
        - Partnered with legal/operations teams to codify domain requirements

        Tech Stack: Python, Neo4j, NLP, RAG Systems

        Impact: Directly served over 660,000 users seeking immigration assistance.""",
        "source": "portfolio",
        "tags": ["project", "mosaic", "chatbot", "nlp", "neo4j", "featured", "production"],
        "context": {"category": "projects", "priority": "high", "status": "completed"}
    },

    # === UC Berkeley Capstone ===
    {
        "content": """Project: UC Berkeley ML/AI Capstone - Hospital Resource Optimization

        Selected as Capstone Project Exemplar for UC Berkeley's ML/AI certification.
        Developed predictive models projecting $30.4M annual savings in hospital resource management.

        Key Achievements:
        - Built neural network achieving 80% accuracy predicting patient length of stay
        - Analyzed 180K+ patient records to identify key predictive factors
        - Quantified business impact: $30.4M savings vs baseline approach
        - Integrated AI chatbot for stakeholder decision-making guidance

        Tech Stack: PyTorch, TensorFlow, scikit-learn, Python

        Recognition: Selected as official Capstone Exemplar by UC Berkeley.""",
        "source": "portfolio",
        "tags": ["project", "uc-berkeley", "healthcare", "neural-network", "featured", "exemplar"],
        "context": {"category": "projects", "priority": "high", "status": "completed"}
    },

    # === NASA Flight Analysis ===
    {
        "content": """Project: NASA Flight Data Analysis - Aircraft Fuel Optimization

        Analyzed 1.88 million NASA flight recorder measurements to identify fuel consumption drivers.
        Findings challenge industry conventional wisdom about flight optimization.

        Key Achievements:
        - Achieved 95.9% predictive accuracy (R² = 0.959) across 312 flights
        - Discovered engine performance explains 64.4% of fuel variance - 2.2x more than flight planning
        - Applied ANOVA, nested F-tests, variance decomposition, and interaction analysis
        - Provided evidence-based recommendations prioritizing engine monitoring

        Tech Stack: R, Python, Statistical Modeling, ANOVA

        Impact: Evidence-based recommendations for airline fuel optimization strategies.""",
        "source": "portfolio",
        "tags": ["project", "nasa", "statistical-analysis", "r", "featured", "research"],
        "context": {"category": "projects", "priority": "high", "status": "completed"}
    },

    # === Image Classification ===
    {
        "content": """Project: Garbage Classification - Deep Learning

        Computer vision project achieving 94% accuracy with 100% minority class recall.
        Uses ResNet34 transfer learning with live interactive demo.

        Key Features:
        - 94% overall accuracy on waste classification
        - 100% recall on minority classes (critical for waste sorting)
        - Transfer learning with ResNet34 architecture
        - Interactive live demo available on portfolio

        Tech Stack: PyTorch, Hugging Face, Gradio, Transfer Learning""",
        "source": "portfolio",
        "tags": ["project", "computer-vision", "deep-learning", "pytorch", "transfer-learning"],
        "context": {"category": "projects", "priority": "medium", "status": "completed"}
    },

    # === SFU Faisal Lab ===
    {
        "content": """Project: SFU Faisal Lab - Medical RAG System

        Research project developing RAG system for medical imaging retrieval.
        Translates natural language queries to JSON for CT/MRI scan retrieval.

        Key Features:
        - Natural language to structured query translation
        - Medical imaging database integration
        - RAG architecture for accurate retrieval

        Tech Stack: Python, RAG, NLP, Medical AI""",
        "source": "portfolio",
        "tags": ["project", "medical-ai", "rag", "research", "sfu"],
        "context": {"category": "projects", "priority": "medium", "status": "completed"}
    },

    # === Technical Skills ===
    {
        "content": """Programming Languages and Proficiency:
        - Python: Advanced (95%) - NumPy, Pandas, scikit-learn, PyTorch, TensorFlow, FastAPI
        - SQL: Advanced (85%) - PostgreSQL, complex queries, optimization
        - R: Proficient (70%) - Statistical analysis, visualization, tidyverse

        Duy writes production-quality Python code with emphasis on testing,
        documentation, and maintainability.""",
        "source": "portfolio",
        "tags": ["skills", "programming", "python", "sql", "r"],
        "context": {"category": "skills", "priority": "high"}
    },
    {
        "content": """Machine Learning & Deep Learning Skills:
        - PyTorch: Advanced (85%) - Custom models, transfer learning
        - scikit-learn: Advanced (90%) - Full ML pipeline development
        - TensorFlow: Proficient (75%) - Model building and deployment

        Specialties:
        - Causal Inference
        - A/B Testing
        - Statistical Modeling
        - NLP & RAG Systems
        - Knowledge Graphs
        - Transfer Learning
        - Experimental Design""",
        "source": "portfolio",
        "tags": ["skills", "machine-learning", "deep-learning", "pytorch", "tensorflow"],
        "context": {"category": "skills", "priority": "high"}
    },

    # === Career Goals ===
    {
        "content": """Duy is seeking Summer 2026 internships in:
        - Data Science
        - AI/ML Engineering
        - Machine Learning Research

        Particularly interested in:
        - Building AI-powered products with measurable impact
        - Working with large language models and RAG systems
        - Causal inference and experimental design
        - Developing end-to-end ML pipelines

        Location: Open to relocation, remote-friendly

        What makes Duy unique: Production ML experience (660K+ users served),
        strong statistical foundation, and ability to quantify business impact.""",
        "source": "portfolio",
        "tags": ["career", "internship", "job-search", "goals"],
        "context": {"category": "career", "priority": "high"}
    },

    # === Contact ===
    {
        "content": """Contact Information for Duy Nguyen:

        - Email: dcnguyen060899@gmail.com
        - LinkedIn: linkedin.com/in/duwe-ng
        - GitHub: github.com/dcnguyen060899
        - Portfolio: duyng-portfolio.com

        Duy is actively seeking Summer 2026 internship opportunities and is
        always open to connecting with fellow data scientists and ML engineers.""",
        "source": "portfolio",
        "tags": ["contact", "email", "linkedin", "github"],
        "context": {"category": "contact", "priority": "high"}
    },

    # === Second Brain Project (This Demo) ===
    {
        "content": """Project: Second Brain - AI-Powered Knowledge Retention System

        This demo showcases a RAG (Retrieval-Augmented Generation) system architecture.
        It demonstrates how modern AI applications retrieve and synthesize information.

        Key Features:
        - Semantic search using vector embeddings (Voyage AI + Qdrant)
        - RAG-powered responses using Claude API
        - Real-time pipeline visualization
        - Knowledge graph connections

        Tech Stack:
        - Backend: FastAPI, Python, SQLAlchemy
        - Frontend: React, TypeScript, Tailwind CSS
        - Vector DB: Qdrant
        - Embeddings: Voyage AI
        - LLM: Anthropic Claude
        - Infrastructure: Docker, PostgreSQL, Redis

        This project demonstrates full-stack AI development capabilities.""",
        "source": "portfolio",
        "tags": ["project", "second-brain", "rag", "ai", "full-stack", "this-demo"],
        "context": {"category": "projects", "priority": "high", "status": "active"}
    },

    # === Impact Metrics ===
    {
        "content": """Duy Nguyen's Quantified Impact:

        - 660,000+ Users Served: Through the MOSAIC Immigration Chatbot
        - $30.4M Projected Savings: UC Berkeley Hospital Resource Optimization
        - 95.9% Variance Explained: NASA Flight Data Analysis (R² = 0.959)
        - 94% Accuracy: Deep Learning Image Classification
        - 90% Accuracy: MOSAIC validation pipeline

        These metrics demonstrate Duy's ability to build ML systems that
        deliver measurable real-world impact.""",
        "source": "portfolio",
        "tags": ["impact", "metrics", "achievements", "quantified"],
        "context": {"category": "achievements", "priority": "high"}
    },
]


def get_portfolio_knowledge():
    """Return all portfolio knowledge for seeding."""
    return PORTFOLIO_KNOWLEDGE
