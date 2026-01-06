"""
Portfolio Function Calling Tools

These tools enable Claude to perform structured actions in the portfolio chatbot,
providing richer, more interactive responses for recruiters.
"""

import httpx
import os
from typing import Any, Dict, List, Optional
from datetime import datetime

# GitHub configuration
GITHUB_USERNAME = "dcnguyen060899"
GITHUB_API_BASE = "https://api.github.com"

# Portfolio data (structured for tool access)
PORTFOLIO_DATA = {
    "contact": {
        "name": "Duy Nguyen",
        "email": "dcnguyen060899@gmail.com",
        "linkedin": "https://linkedin.com/in/duwe-ng",
        "github": f"https://github.com/{GITHUB_USERNAME}",
        "portfolio": "https://duyng-portfolio.com",
        "resume": "https://duyng-portfolio.com/docs/index_resume.html",
        "location": "Seattle, WA",
    },
    "availability": {
        "seeking": "Summer 2026 Internship",
        "roles": ["Data Science", "AI/ML Engineering", "Machine Learning Research"],
        "start_date": "June 2026",
        "duration": "10-12 weeks",
        "location_preference": "Open to relocation, remote-friendly",
        "visa_status": "Authorized to work in US",
    },
    "projects": {
        "mosaic": {
            "name": "MOSAIC - AI Immigration Chatbot",
            "description": "AI-powered chatbot serving 660,000+ users across Canadian immigration services",
            "impact": "660K+ users served, Top 4 SFU CS Diversity Award",
            "tech_stack": ["Python", "Neo4j", "NLP", "RAG Systems", "Knowledge Graphs"],
            "type": "production",
            "metrics": {
                "users_served": 660000,
                "accuracy": "90%",
                "recognition": "Top 4 SFU CS Diversity Award"
            },
            "demo_url": "https://duyng-portfolio.com/docs/index_mosaic_chatbot.html",
            "github_url": None,  # Private project
            "status": "completed"
        },
        "uc_berkeley_capstone": {
            "name": "UC Berkeley ML/AI Capstone - Hospital Resource Optimization",
            "description": "Predictive models for hospital resource management, selected as Capstone Exemplar",
            "impact": "$30.4M projected annual savings",
            "tech_stack": ["PyTorch", "TensorFlow", "scikit-learn", "Python", "Neural Networks"],
            "type": "research",
            "metrics": {
                "accuracy": "80%",
                "savings": "$30.4M",
                "records_analyzed": 180000,
                "recognition": "Capstone Project Exemplar"
            },
            "demo_url": "https://duyng-portfolio.com/docs/index.html",
            "github_url": None,
            "status": "completed"
        },
        "nasa_flight": {
            "name": "NASA Flight Data Analysis - Aircraft Fuel Optimization",
            "description": "Analyzed 1.88M flight recorder measurements to identify fuel consumption drivers",
            "impact": "95.9% variance explained, challenged industry conventional wisdom",
            "tech_stack": ["R", "Python", "Statistical Modeling", "ANOVA", "Regression"],
            "type": "research",
            "metrics": {
                "r_squared": 0.959,
                "measurements": 1880000,
                "flights": 312,
                "key_finding": "Engine performance explains 64.4% of fuel variance"
            },
            "demo_url": "https://duyng-portfolio.com/docs/index_data5100_project.html",
            "github_url": None,
            "status": "completed"
        },
        "garbage_classification": {
            "name": "Garbage Classification - Deep Learning",
            "description": "Computer vision for waste classification using transfer learning",
            "impact": "94% accuracy, 100% minority class recall",
            "tech_stack": ["PyTorch", "Hugging Face", "Gradio", "Transfer Learning", "ResNet34"],
            "type": "demo",
            "metrics": {
                "accuracy": "94%",
                "minority_recall": "100%",
                "model": "ResNet34"
            },
            "demo_url": "https://duyng-portfolio.com/docs/index_image_classification.html",
            "live_demo": "https://huggingface.co/spaces/dnguyen44/garbage-classification",
            "github_url": None,
            "status": "completed"
        },
        "sfu_faisal_lab": {
            "name": "SFU Faisal Lab - Medical RAG System",
            "description": "RAG system for medical imaging retrieval, translating natural language to JSON queries",
            "impact": "Research contribution to medical AI",
            "tech_stack": ["Python", "RAG", "NLP", "Medical AI", "LangChain"],
            "type": "research",
            "metrics": {},
            "demo_url": None,
            "github_url": "https://github.com/dcnguyen060899/SFU_Faisal_Lab_roi_slab_retrieval_engine",
            "status": "completed"
        },
        "second_brain": {
            "name": "Second Brain - AI Knowledge Retention System",
            "description": "This demo! RAG-powered knowledge management with vector search and Claude integration",
            "impact": "Demonstrates full-stack AI development capabilities",
            "tech_stack": ["FastAPI", "React", "Qdrant", "Voyage AI", "Claude API", "PostgreSQL", "Docker"],
            "type": "demo",
            "metrics": {
                "embedding_dim": 1024,
                "vector_db": "Qdrant",
                "llm": "Claude"
            },
            "demo_url": "https://duyng-portfolio.com/docs/index_portfolio.html",
            "github_url": "https://github.com/dcnguyen060899",
            "status": "active"
        }
    },
    "skills": {
        "languages": {
            "Python": {"level": 95, "description": "Advanced - NumPy, Pandas, scikit-learn, PyTorch, FastAPI"},
            "SQL": {"level": 85, "description": "Advanced - PostgreSQL, complex queries, optimization"},
            "R": {"level": 70, "description": "Proficient - Statistical analysis, tidyverse, ggplot2"},
        },
        "ml_frameworks": {
            "PyTorch": {"level": 85, "description": "Custom models, transfer learning, production deployment"},
            "scikit-learn": {"level": 90, "description": "Full ML pipeline development"},
            "TensorFlow": {"level": 75, "description": "Model building and deployment"},
        },
        "specialties": [
            "Causal Inference",
            "A/B Testing",
            "Statistical Modeling",
            "NLP & RAG Systems",
            "Knowledge Graphs",
            "Transfer Learning",
            "Experimental Design",
            "Computer Vision"
        ],
        "tools": ["Docker", "Git", "PostgreSQL", "Redis", "Neo4j", "Qdrant", "Hugging Face"]
    },
    "education": {
        "current": {
            "institution": "Seattle University",
            "degree": "Master of Science in Data Science",
            "status": "Starting Fall 2025",
            "location": "Seattle, WA"
        },
        "certifications": [
            {
                "name": "Professional Certificate in Machine Learning & AI",
                "institution": "UC Berkeley",
                "recognition": "Capstone Project Exemplar"
            }
        ],
        "research": [
            {
                "institution": "Simon Fraser University",
                "lab": "Faisal Lab",
                "focus": "Medical AI / RAG Systems"
            }
        ]
    },
    "experience": [
        {
            "role": "Data Science Volunteer / ML Engineer",
            "organization": "SFU Blueprint (for MOSAIC)",
            "period": "2023 - 2024",
            "type": "Production",
            "highlights": [
                "Built AI immigration chatbot serving 660K+ users",
                "Designed Neo4j knowledge graph architecture",
                "Achieved 90% accuracy in query validation",
                "Recognized Top 4 in SFU CS Diversity Award"
            ]
        },
        {
            "role": "Research Assistant",
            "organization": "SFU Faisal Lab",
            "period": "2024",
            "type": "Research",
            "highlights": [
                "Developed RAG system for medical image retrieval",
                "Natural language to JSON schema translation",
                "CT/MRI scan retrieval optimization"
            ]
        }
    ],
    "research": {
        "independent": [
            {
                "title": "Duy Integral Theorem",
                "description": "Novel mathematical framework for understanding generalization in neural networks",
                "status": "Independent research",
                "link": "index_independent_research.html"
            }
        ],
        "lab_experience": [
            {
                "institution": "Simon Fraser University",
                "lab": "Faisal Lab",
                "focus": "Medical AI / RAG Systems",
                "contribution": "RAG system for CT/MRI scan retrieval"
            }
        ]
    }
}


# === Tool Definitions (for Claude API) ===

PORTFOLIO_TOOLS = [
    {
        "name": "search_projects",
        "description": "Search Duy's portfolio projects by technology, type, or keywords. Use this to find specific projects or filter by tech stack.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query - can be technology name, project type, or keyword"
                },
                "tech_filter": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Filter by specific technologies (e.g., ['Python', 'PyTorch'])"
                },
                "project_type": {
                    "type": "string",
                    "enum": ["production", "research", "demo", "all"],
                    "description": "Filter by project type"
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "get_project_details",
        "description": "Get detailed information about a specific project including tech stack, impact metrics, and links.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {
                    "type": "string",
                    "enum": ["mosaic", "uc_berkeley_capstone", "nasa_flight", "garbage_classification", "sfu_faisal_lab", "second_brain"],
                    "description": "The project identifier"
                }
            },
            "required": ["project_id"]
        }
    },
    {
        "name": "get_github_activity",
        "description": "Fetch live GitHub activity and statistics for Duy's profile. Shows recent repositories, contributions, and coding activity.",
        "input_schema": {
            "type": "object",
            "properties": {
                "include_repos": {
                    "type": "boolean",
                    "description": "Include list of public repositories",
                    "default": True
                },
                "repo_limit": {
                    "type": "integer",
                    "description": "Maximum number of repos to return",
                    "default": 5
                }
            }
        }
    },
    {
        "name": "get_skills_assessment",
        "description": "Analyze how Duy's skills match specific job requirements or technologies. Useful for recruiters evaluating fit.",
        "input_schema": {
            "type": "object",
            "properties": {
                "requirements": {
                    "type": "string",
                    "description": "Job requirements or technologies to match against (e.g., 'Python, ML, healthcare experience')"
                }
            },
            "required": ["requirements"]
        }
    },
    {
        "name": "get_contact_info",
        "description": "Get Duy's contact information for reaching out about opportunities.",
        "input_schema": {
            "type": "object",
            "properties": {
                "include_resume": {
                    "type": "boolean",
                    "description": "Include link to downloadable resume",
                    "default": True
                }
            }
        }
    },
    {
        "name": "get_availability",
        "description": "Get information about Duy's internship availability, preferred roles, and timeline.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "get_impact_metrics",
        "description": "Get quantified impact metrics across all projects - useful for understanding real-world results.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "compare_technologies",
        "description": "Compare Duy's experience across different technologies or frameworks.",
        "input_schema": {
            "type": "object",
            "properties": {
                "technologies": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of technologies to compare (e.g., ['PyTorch', 'TensorFlow'])"
                }
            },
            "required": ["technologies"]
        }
    },
    {
        "name": "get_education_details",
        "description": "Get detailed education history including current program, certifications, and research experience.",
        "input_schema": {
            "type": "object",
            "properties": {
                "include_coursework": {
                    "type": "boolean",
                    "description": "Include relevant coursework areas",
                    "default": True
                }
            }
        }
    },
    {
        "name": "get_work_experience",
        "description": "Get detailed work experience including roles, organizations, and key achievements.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "search_by_impact",
        "description": "Find projects that demonstrate specific types of impact like scale, cost savings, accuracy, or awards.",
        "input_schema": {
            "type": "object",
            "properties": {
                "impact_type": {
                    "type": "string",
                    "enum": ["scale", "cost_savings", "accuracy", "awards", "production"],
                    "description": "Type of impact to search for"
                },
                "min_value": {
                    "type": "number",
                    "description": "Minimum threshold (e.g., 100000 for users, 90 for accuracy %)"
                }
            },
            "required": ["impact_type"]
        }
    },
    {
        "name": "get_publications_research",
        "description": "Get information about research work, independent research, and academic contributions.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    }
]


# === Tool Handlers ===

async def search_projects(query: str, tech_filter: List[str] = None, project_type: str = "all") -> Dict[str, Any]:
    """Search projects by query, technology, or type."""
    results = []
    query_lower = query.lower()

    for project_id, project in PORTFOLIO_DATA["projects"].items():
        # Check query match
        matches_query = (
            query_lower in project["name"].lower() or
            query_lower in project["description"].lower() or
            any(query_lower in tech.lower() for tech in project["tech_stack"])
        )

        # Check type filter
        matches_type = project_type == "all" or project["type"] == project_type

        # Check tech filter
        matches_tech = True
        if tech_filter:
            project_techs_lower = [t.lower() for t in project["tech_stack"]]
            matches_tech = any(t.lower() in project_techs_lower for t in tech_filter)

        if matches_query and matches_type and matches_tech:
            results.append({
                "id": project_id,
                "name": project["name"],
                "description": project["description"],
                "impact": project["impact"],
                "tech_stack": project["tech_stack"],
                "type": project["type"],
                "demo_url": project.get("demo_url")
            })

    return {
        "query": query,
        "filters": {"tech": tech_filter, "type": project_type},
        "results_count": len(results),
        "projects": results
    }


async def get_project_details(project_id: str) -> Dict[str, Any]:
    """Get detailed information about a specific project."""
    project = PORTFOLIO_DATA["projects"].get(project_id)
    if not project:
        return {"error": f"Project '{project_id}' not found"}

    return {
        "project_id": project_id,
        **project
    }


async def get_github_activity(include_repos: bool = True, repo_limit: int = 5) -> Dict[str, Any]:
    """Fetch live GitHub activity."""
    try:
        async with httpx.AsyncClient() as client:
            # Get user profile
            user_response = await client.get(
                f"{GITHUB_API_BASE}/users/{GITHUB_USERNAME}",
                headers={"Accept": "application/vnd.github.v3+json"},
                timeout=10.0
            )

            if user_response.status_code != 200:
                return {"error": "Could not fetch GitHub profile", "fallback": True}

            user_data = user_response.json()

            result = {
                "username": GITHUB_USERNAME,
                "profile_url": f"https://github.com/{GITHUB_USERNAME}",
                "public_repos": user_data.get("public_repos", 0),
                "followers": user_data.get("followers", 0),
                "following": user_data.get("following", 0),
                "created_at": user_data.get("created_at"),
                "bio": user_data.get("bio"),
            }

            if include_repos:
                # Get recent repos
                repos_response = await client.get(
                    f"{GITHUB_API_BASE}/users/{GITHUB_USERNAME}/repos",
                    params={"sort": "updated", "per_page": repo_limit},
                    headers={"Accept": "application/vnd.github.v3+json"},
                    timeout=10.0
                )

                if repos_response.status_code == 200:
                    repos_data = repos_response.json()
                    result["recent_repos"] = [
                        {
                            "name": repo["name"],
                            "description": repo.get("description", ""),
                            "language": repo.get("language"),
                            "stars": repo.get("stargazers_count", 0),
                            "forks": repo.get("forks_count", 0),
                            "url": repo["html_url"],
                            "updated_at": repo["updated_at"]
                        }
                        for repo in repos_data
                    ]

            return result

    except Exception as e:
        return {
            "error": str(e),
            "fallback": True,
            "profile_url": f"https://github.com/{GITHUB_USERNAME}",
            "message": "Live GitHub data unavailable, but you can view the profile directly"
        }


async def get_skills_assessment(requirements: str) -> Dict[str, Any]:
    """Analyze skill match for job requirements."""
    requirements_lower = requirements.lower()

    # Find matching skills
    matched_skills = []
    skill_coverage = []

    # Check programming languages
    for lang, info in PORTFOLIO_DATA["skills"]["languages"].items():
        if lang.lower() in requirements_lower:
            matched_skills.append({
                "skill": lang,
                "level": info["level"],
                "category": "Programming Language",
                "details": info["description"]
            })
            skill_coverage.append(lang)

    # Check ML frameworks
    for framework, info in PORTFOLIO_DATA["skills"]["ml_frameworks"].items():
        if framework.lower() in requirements_lower:
            matched_skills.append({
                "skill": framework,
                "level": info["level"],
                "category": "ML Framework",
                "details": info["description"]
            })
            skill_coverage.append(framework)

    # Check specialties
    for specialty in PORTFOLIO_DATA["skills"]["specialties"]:
        if specialty.lower() in requirements_lower:
            matched_skills.append({
                "skill": specialty,
                "level": "Experienced",
                "category": "Specialty",
                "details": "Demonstrated in portfolio projects"
            })
            skill_coverage.append(specialty)

    # Check for domain experience
    relevant_projects = []
    domain_keywords = ["healthcare", "medical", "nlp", "chatbot", "computer vision", "deep learning", "ml", "ai"]
    for keyword in domain_keywords:
        if keyword in requirements_lower:
            for project_id, project in PORTFOLIO_DATA["projects"].items():
                if keyword in project["description"].lower() or keyword in " ".join(project["tech_stack"]).lower():
                    if project_id not in [p["id"] for p in relevant_projects]:
                        relevant_projects.append({
                            "id": project_id,
                            "name": project["name"],
                            "relevance": f"Matches '{keyword}' requirement"
                        })

    return {
        "requirements_analyzed": requirements,
        "matched_skills": matched_skills,
        "match_count": len(matched_skills),
        "relevant_projects": relevant_projects,
        "coverage_summary": f"Found {len(matched_skills)} matching skills and {len(relevant_projects)} relevant projects",
        "recommendation": "Strong match" if len(matched_skills) >= 3 else "Partial match - see portfolio for more details"
    }


async def get_contact_info(include_resume: bool = True) -> Dict[str, Any]:
    """Get contact information."""
    contact = PORTFOLIO_DATA["contact"].copy()

    if not include_resume:
        contact.pop("resume", None)

    return {
        **contact,
        "best_way_to_reach": "Email or LinkedIn",
        "response_time": "Usually within 24-48 hours"
    }


async def get_availability() -> Dict[str, Any]:
    """Get internship availability information."""
    return {
        **PORTFOLIO_DATA["availability"],
        "current_status": "Actively seeking opportunities",
        "education": PORTFOLIO_DATA["education"]["current"]
    }


async def get_impact_metrics() -> Dict[str, Any]:
    """Get quantified impact metrics across all projects."""
    metrics = {
        "headline_metrics": [
            {"metric": "660,000+", "label": "Users Served", "project": "MOSAIC Immigration Chatbot"},
            {"metric": "$30.4M", "label": "Projected Savings", "project": "UC Berkeley Capstone"},
            {"metric": "95.9%", "label": "Variance Explained (R²)", "project": "NASA Flight Analysis"},
            {"metric": "94%", "label": "Model Accuracy", "project": "Garbage Classification"},
        ],
        "detailed_metrics": {}
    }

    for project_id, project in PORTFOLIO_DATA["projects"].items():
        if project.get("metrics"):
            metrics["detailed_metrics"][project["name"]] = project["metrics"]

    return metrics


async def compare_technologies(technologies: List[str]) -> Dict[str, Any]:
    """Compare experience across technologies."""
    comparison = []

    for tech in technologies:
        tech_lower = tech.lower()
        result = {
            "technology": tech,
            "proficiency": None,
            "projects_using": [],
            "details": None
        }

        # Check in languages
        for lang, info in PORTFOLIO_DATA["skills"]["languages"].items():
            if lang.lower() == tech_lower:
                result["proficiency"] = info["level"]
                result["details"] = info["description"]
                break

        # Check in ML frameworks
        for framework, info in PORTFOLIO_DATA["skills"]["ml_frameworks"].items():
            if framework.lower() == tech_lower:
                result["proficiency"] = info["level"]
                result["details"] = info["description"]
                break

        # Find projects using this tech
        for project_id, project in PORTFOLIO_DATA["projects"].items():
            if any(tech_lower in t.lower() for t in project["tech_stack"]):
                result["projects_using"].append(project["name"])

        comparison.append(result)

    return {
        "technologies_compared": technologies,
        "comparison": comparison
    }


async def get_education_details(include_coursework: bool = True) -> Dict[str, Any]:
    """Get detailed education history."""
    result = {
        "current_education": PORTFOLIO_DATA["education"]["current"],
        "certifications": PORTFOLIO_DATA["education"]["certifications"],
        "research_experience": PORTFOLIO_DATA["education"]["research"]
    }

    if include_coursework:
        result["relevant_coursework"] = [
            "Machine Learning & Deep Learning",
            "Statistical Methods and Causal Inference",
            "Natural Language Processing",
            "Computer Vision",
            "Data Engineering & MLOps"
        ]

    return result


async def get_work_experience() -> Dict[str, Any]:
    """Get work experience details."""
    return {
        "experiences": PORTFOLIO_DATA["experience"],
        "total_positions": len(PORTFOLIO_DATA["experience"]),
        "experience_types": list(set(exp["type"] for exp in PORTFOLIO_DATA["experience"])),
        "summary": "Production ML systems and research experience"
    }


async def search_by_impact(impact_type: str, min_value: float = None) -> Dict[str, Any]:
    """Search projects by impact type."""
    results = []

    for project_id, project in PORTFOLIO_DATA["projects"].items():
        metrics = project.get("metrics", {})

        if impact_type == "scale":
            if "users_served" in metrics:
                users = metrics["users_served"]
                if min_value is None or users >= min_value:
                    results.append({
                        "project": project["name"],
                        "metric": f"{users:,} users served",
                        "type": "scale"
                    })
            if "records_analyzed" in metrics:
                records = metrics["records_analyzed"]
                if min_value is None or records >= min_value:
                    results.append({
                        "project": project["name"],
                        "metric": f"{records:,} records analyzed",
                        "type": "scale"
                    })
            if "measurements" in metrics:
                measurements = metrics["measurements"]
                if min_value is None or measurements >= min_value:
                    results.append({
                        "project": project["name"],
                        "metric": f"{measurements:,} measurements analyzed",
                        "type": "scale"
                    })

        elif impact_type == "cost_savings":
            if "savings" in metrics:
                results.append({
                    "project": project["name"],
                    "metric": metrics["savings"],
                    "type": "cost_savings"
                })

        elif impact_type == "accuracy":
            if "accuracy" in metrics:
                acc = metrics["accuracy"]
                acc_val = float(acc.replace("%", "")) if isinstance(acc, str) else acc
                if min_value is None or acc_val >= min_value:
                    results.append({
                        "project": project["name"],
                        "metric": f"{acc} accuracy",
                        "type": "accuracy"
                    })
            if "r_squared" in metrics:
                r2 = metrics["r_squared"] * 100
                if min_value is None or r2 >= min_value:
                    results.append({
                        "project": project["name"],
                        "metric": f"{r2}% variance explained (R²)",
                        "type": "accuracy"
                    })

        elif impact_type == "awards":
            if "recognition" in metrics:
                results.append({
                    "project": project["name"],
                    "metric": metrics["recognition"],
                    "type": "award"
                })

        elif impact_type == "production":
            if project["type"] == "production":
                results.append({
                    "project": project["name"],
                    "metric": project["impact"],
                    "type": "production",
                    "status": project["status"]
                })

    return {
        "impact_type": impact_type,
        "min_value": min_value,
        "results_count": len(results),
        "projects": results
    }


async def get_publications_research() -> Dict[str, Any]:
    """Get publications and research information."""
    return {
        "independent_research": PORTFOLIO_DATA["research"]["independent"],
        "lab_experience": PORTFOLIO_DATA["research"]["lab_experience"],
        "note": "Additional publications expected during MS program at Seattle University"
    }


# === Tool Execution Router ===

async def execute_tool(tool_name: str, tool_input: Dict[str, Any]) -> Dict[str, Any]:
    """Execute a tool by name with given input."""
    tool_handlers = {
        "search_projects": search_projects,
        "get_project_details": get_project_details,
        "get_github_activity": get_github_activity,
        "get_skills_assessment": get_skills_assessment,
        "get_contact_info": get_contact_info,
        "get_availability": get_availability,
        "get_impact_metrics": get_impact_metrics,
        "compare_technologies": compare_technologies,
        "get_education_details": get_education_details,
        "get_work_experience": get_work_experience,
        "search_by_impact": search_by_impact,
        "get_publications_research": get_publications_research,
    }

    handler = tool_handlers.get(tool_name)
    if not handler:
        return {"error": f"Unknown tool: {tool_name}"}

    try:
        return await handler(**tool_input)
    except Exception as e:
        return {"error": f"Tool execution failed: {str(e)}"}
