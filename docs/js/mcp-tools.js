/**
 * MCP Tools - Browser-compatible version
 * Same logic as the MCP server, but runs client-side
 * Allows web visitors to experience MCP tool functionality
 */

const MCPTools = (function() {
    // === PORTFOLIO DATA (embedded) ===

    const projects = [
        {
            id: "mosaic-chatbot",
            name: "MOSAIC AI Immigration Chatbot",
            description: "AI-powered chatbot serving 660,000+ users for Canadian immigration services. Built with SFU Blueprint for MOSAIC organization.",
            impact: "Recognized as Top 4 in SFU CS Diversity Award. Serving real users with complex immigration queries.",
            technologies: ["Python", "Neo4j", "NLP", "Knowledge Graphs", "RAG"],
            highlights: [
                "Analyzed 660K+ user interactions to build structured query categorization",
                "Designed knowledge graph mapping programs, services, and eligibility criteria",
                "Built validation pipeline achieving 90% accuracy with full lineage tracking",
                "Partnered with legal/operations teams to codify domain requirements"
            ],
            links: { demo: "index_mosaic_chatbot.html" },
            type: "featured",
            metrics: { value: "660K+", label: "Users Served" }
        },
        {
            id: "berkeley-capstone",
            name: "UC Berkeley ML/AI Capstone - Hospital Resource Optimization",
            description: "Predictive models for hospital resource management, selected as Capstone Project Exemplar for UC Berkeley's ML/AI certification.",
            impact: "Projected $30.4M annual savings through optimized patient length-of-stay predictions.",
            technologies: ["Python", "TensorFlow", "Neural Networks", "scikit-learn", "Pandas"],
            highlights: [
                "Built neural network achieving 80% accuracy predicting patient length of stay",
                "Analyzed 180K+ patient records to identify key predictive factors",
                "Quantified business impact: $30.4M savings vs baseline approach",
                "Integrated AI chatbot for stakeholder decision-making guidance"
            ],
            links: { demo: "index.html" },
            type: "featured",
            metrics: { value: "$30.4M", label: "Projected Savings" }
        },
        {
            id: "nasa-flight-analysis",
            name: "NASA Flight Data Analysis - Aircraft Fuel Optimization",
            description: "Statistical analysis of 1.88 million NASA flight recorder measurements to identify fuel consumption drivers.",
            impact: "Findings challenge industry conventional wisdom - engine performance explains 2.2x more variance than flight planning.",
            technologies: ["R", "Statistical Modeling", "ANOVA", "Regression Analysis"],
            highlights: [
                "Achieved 95.9% predictive accuracy (R² = 0.959) across 312 flights",
                "Discovered engine performance explains 64.4% of fuel variance",
                "Applied ANOVA, nested F-tests, variance decomposition, and interaction analysis",
                "Provided evidence-based recommendations prioritizing engine monitoring"
            ],
            links: { demo: "index_data5100_project.html" },
            type: "featured",
            metrics: { value: "95.9%", label: "Variance Explained" }
        },
        {
            id: "garbage-classification",
            name: "Garbage Classification - Deep Learning",
            description: "Image classification model for waste sorting using transfer learning.",
            impact: "94% accuracy with 100% minority class recall, deployed as live demo.",
            technologies: ["PyTorch", "ResNet34", "Transfer Learning", "Gradio", "HuggingFace"],
            highlights: [
                "Fine-tuned ResNet34 achieving 94% overall accuracy",
                "Achieved 100% recall on minority classes through balanced training",
                "Deployed interactive demo on HuggingFace Spaces",
                "Integrated with portfolio chatbot for live classification"
            ],
            links: { demo: "index_image_classification.html" },
            type: "other"
        },
        {
            id: "duy-integral-theorem",
            name: "Duy Integral Theorem - ML Theory Research",
            description: "Novel mathematical framework for understanding generalization in neural networks.",
            impact: "Independent research exploring theoretical foundations of deep learning.",
            technologies: ["Mathematics", "Deep Learning Theory", "Functional Analysis"],
            highlights: [
                "Developed novel theoretical framework for neural network generalization",
                "Applied functional analysis to deep learning optimization",
                "Self-directed independent research project"
            ],
            links: { demo: "index_independent_research.html" },
            type: "other"
        },
        {
            id: "sfu-faisal-lab",
            name: "SFU Faisal Lab - Medical RAG System",
            description: "RAG system translating natural language to JSON for CT/MRI scan retrieval.",
            impact: "Research contribution to medical imaging accessibility.",
            technologies: ["Python", "RAG", "NLP", "JSON", "Medical Imaging"],
            highlights: [
                "Built natural language to structured query translation system",
                "Enabled non-technical users to query medical imaging databases",
                "Collaborated with medical research team"
            ],
            links: { github: "https://github.com/dcnguyen060899/SFU_Faisal_Lab_roi_slab_retrieval_engine" },
            type: "other"
        },
        {
            id: "mcp-portfolio",
            name: "Portfolio MCP Server",
            description: "MCP server allowing Claude Code users to query this portfolio directly from their terminal.",
            impact: "Meta-demonstration of MCP development skills and creative AI applications.",
            technologies: ["TypeScript", "MCP SDK", "Node.js"],
            highlights: [
                "Built custom MCP server with 10 specialized tools",
                "Demonstrates understanding of Claude's tool ecosystem",
                "Enables technical recruiters to explore portfolio via CLI",
                "This very demo you're using!"
            ],
            links: { github: "https://github.com/dcnguyen060899/duy-portfolio-mcp" },
            type: "other"
        }
    ];

    const skills = [
        { name: "Python", category: "languages", proficiency: 95, yearsExperience: 4, projects: ["mosaic-chatbot", "berkeley-capstone", "garbage-classification"] },
        { name: "SQL", category: "languages", proficiency: 85, yearsExperience: 3, projects: ["berkeley-capstone", "mosaic-chatbot"] },
        { name: "R", category: "languages", proficiency: 75, yearsExperience: 2, projects: ["nasa-flight-analysis"] },
        { name: "TypeScript", category: "languages", proficiency: 70, yearsExperience: 1, projects: ["mcp-portfolio"] },
        { name: "PyTorch", category: "ml_frameworks", proficiency: 85, yearsExperience: 2, projects: ["garbage-classification", "duy-integral-theorem"] },
        { name: "scikit-learn", category: "ml_frameworks", proficiency: 90, yearsExperience: 3, projects: ["berkeley-capstone", "nasa-flight-analysis"] },
        { name: "TensorFlow", category: "ml_frameworks", proficiency: 75, yearsExperience: 2, projects: ["berkeley-capstone"] },
        { name: "HuggingFace", category: "ml_frameworks", proficiency: 80, yearsExperience: 1, projects: ["garbage-classification", "mosaic-chatbot"] },
        { name: "Pandas", category: "data_tools", proficiency: 95, yearsExperience: 4, projects: ["berkeley-capstone", "nasa-flight-analysis", "mosaic-chatbot"] },
        { name: "Neo4j", category: "data_tools", proficiency: 75, yearsExperience: 1, projects: ["mosaic-chatbot"] },
        { name: "PostgreSQL", category: "data_tools", proficiency: 80, yearsExperience: 2, projects: ["berkeley-capstone"] },
        { name: "Qdrant", category: "data_tools", proficiency: 70, yearsExperience: 1, projects: ["sfu-faisal-lab", "mcp-portfolio"] },
        { name: "RAG Systems", category: "specialties", proficiency: 85, projects: ["mosaic-chatbot", "sfu-faisal-lab", "mcp-portfolio"] },
        { name: "Knowledge Graphs", category: "specialties", proficiency: 80, projects: ["mosaic-chatbot"] },
        { name: "Transfer Learning", category: "specialties", proficiency: 85, projects: ["garbage-classification"] },
        { name: "Statistical Modeling", category: "specialties", proficiency: 90, projects: ["nasa-flight-analysis", "berkeley-capstone"] },
        { name: "Causal Inference", category: "specialties", proficiency: 75, projects: ["nasa-flight-analysis"] },
        { name: "NLP", category: "specialties", proficiency: 85, projects: ["mosaic-chatbot", "sfu-faisal-lab"] }
    ];

    const experience = [
        {
            type: "education",
            organization: "Seattle University",
            role: "MS Data Science",
            location: "Seattle, WA",
            startDate: "2025-09",
            endDate: "2027-06",
            description: "Master's program focusing on advanced data science, machine learning, and AI systems.",
            highlights: ["Causal Inference focus", "NASA Flight Data Analysis project", "Production ML systems"]
        },
        {
            type: "education",
            organization: "UC Berkeley Extension",
            role: "Professional Certificate in Machine Learning & AI",
            location: "Online",
            startDate: "2023-01",
            endDate: "2024-06",
            description: "Intensive ML/AI program covering deep learning, neural networks, and practical applications.",
            highlights: ["Capstone selected as Project Exemplar", "$30.4M projected savings", "Comprehensive ML coverage"]
        },
        {
            type: "volunteer",
            organization: "SFU Blueprint",
            role: "Data Science Lead",
            location: "Vancouver, BC",
            startDate: "2024-01",
            endDate: "2024-12",
            description: "Led AI development for MOSAIC immigration chatbot serving 660K+ users.",
            highlights: ["Top 4 SFU CS Diversity Award", "Knowledge graph development", "90% accuracy pipeline"]
        },
        {
            type: "volunteer",
            organization: "SFU Faisal Lab",
            role: "Research Assistant",
            location: "Vancouver, BC",
            startDate: "2024-06",
            endDate: "2024-12",
            description: "Developed RAG system for medical imaging retrieval.",
            highlights: ["NL to JSON translation", "Medical imaging accessibility"]
        }
    ];

    const contact = {
        email: "dcnguyen060899@gmail.com",
        linkedin: "https://www.linkedin.com/in/duwe-ng/",
        github: "https://github.com/dcnguyen060899",
        portfolio: "https://duyng-portfolio.com",
        location: "Seattle, WA"
    };

    const availability = {
        seeking: "Summer 2026 Internship",
        roles: ["Data Science Intern", "ML Engineer Intern", "AI/ML Intern"],
        startDate: "June 2026",
        workAuthorization: "F-1 OPT/CPT eligible",
        openTo: ["Remote", "On-site", "Hybrid"],
        preferredLocations: ["Seattle", "San Francisco Bay Area", "New York", "Open to others"]
    };

    // === HELPER FUNCTIONS ===

    function getFeaturedProjects() {
        return projects.filter(p => p.type === "featured");
    }

    function getTopSkills(n = 5) {
        return [...skills].sort((a, b) => b.proficiency - a.proficiency).slice(0, n);
    }

    function getSkillsByCategory(category) {
        return skills.filter(s => s.category === category).sort((a, b) => b.proficiency - a.proficiency);
    }

    function searchProjects(query) {
        const lowerQuery = query.toLowerCase();
        return projects.filter(p =>
            p.name.toLowerCase().includes(lowerQuery) ||
            p.description.toLowerCase().includes(lowerQuery) ||
            p.technologies.some(t => t.toLowerCase().includes(lowerQuery))
        );
    }

    function getProjectsByTechnology(tech) {
        const lowerTech = tech.toLowerCase();
        return projects.filter(p =>
            p.technologies.some(t => t.toLowerCase().includes(lowerTech))
        );
    }

    // === TOOL HANDLERS ===

    const tools = {
        get_portfolio_overview: {
            name: "get_portfolio_overview",
            description: "High-level overview of Duy's portfolio",
            icon: "🎯",
            execute: function() {
                const featured = getFeaturedProjects();
                const topSkills = getTopSkills(8);
                return {
                    summary: "Duy Nguyen is an MS Data Science student at Seattle University with a track record of building production ML systems that deliver measurable business impact.",
                    seeking: availability.seeking,
                    key_metrics: featured.map(p => p.metrics).filter(Boolean),
                    featured_projects: featured.map(p => ({
                        name: p.name,
                        impact: p.impact,
                        technologies: p.technologies.slice(0, 4)
                    })),
                    top_skills: topSkills.map(s => ({ name: s.name, proficiency: s.proficiency })),
                    portfolio_url: contact.portfolio
                };
            }
        },

        search_projects: {
            name: "search_projects",
            description: "Search projects by keyword",
            icon: "🔍",
            requiresInput: true,
            inputPlaceholder: "e.g., 'RAG', 'healthcare', 'PyTorch'",
            execute: function(query) {
                if (!query) return { error: "Please provide a search query" };
                const results = searchProjects(query);
                if (results.length === 0) {
                    const techResults = getProjectsByTechnology(query);
                    if (techResults.length > 0) {
                        return {
                            query,
                            match_type: "technology",
                            count: techResults.length,
                            projects: techResults.map(p => ({
                                name: p.name,
                                description: p.description,
                                technologies: p.technologies
                            }))
                        };
                    }
                    return { query, count: 0, message: "No projects found. Try: 'RAG', 'healthcare', 'neural network'" };
                }
                return {
                    query,
                    count: results.length,
                    projects: results.map(p => ({
                        name: p.name,
                        description: p.description,
                        impact: p.impact,
                        technologies: p.technologies
                    }))
                };
            }
        },

        get_skills: {
            name: "get_skills",
            description: "View technical skills by category",
            icon: "💻",
            execute: function() {
                return {
                    total_skills: skills.length,
                    by_category: {
                        languages: getSkillsByCategory("languages").map(s => ({ name: s.name, proficiency: s.proficiency })),
                        ml_frameworks: getSkillsByCategory("ml_frameworks").map(s => ({ name: s.name, proficiency: s.proficiency })),
                        data_tools: getSkillsByCategory("data_tools").map(s => ({ name: s.name, proficiency: s.proficiency })),
                        specialties: getSkillsByCategory("specialties").map(s => ({ name: s.name, proficiency: s.proficiency }))
                    }
                };
            }
        },

        get_experience: {
            name: "get_experience",
            description: "Education & work history",
            icon: "📚",
            execute: function() {
                return {
                    count: experience.length,
                    experience: experience.map(e => ({
                        type: e.type,
                        organization: e.organization,
                        role: e.role,
                        location: e.location,
                        dates: `${e.startDate} - ${e.endDate}`,
                        highlights: e.highlights
                    }))
                };
            }
        },

        get_impact_metrics: {
            name: "get_impact_metrics",
            description: "Quantified project impact",
            icon: "📊",
            execute: function() {
                const metricsProjects = projects.filter(p => p.metrics);
                return {
                    summary: "Quantified impact from production systems:",
                    metrics: metricsProjects.map(p => ({
                        project: p.name,
                        metric: p.metrics.value,
                        label: p.metrics.label,
                        context: p.impact
                    }))
                };
            }
        },

        get_contact_info: {
            name: "get_contact_info",
            description: "Contact information",
            icon: "📧",
            execute: function() {
                return {
                    ...contact,
                    note: "Feel free to reach out via email or LinkedIn!"
                };
            }
        },

        get_availability: {
            name: "get_availability",
            description: "Job search status",
            icon: "📅",
            execute: function() {
                return {
                    ...availability,
                    summary: `Seeking ${availability.seeking} in ${availability.roles.join(" / ")}. Available ${availability.startDate}.`
                };
            }
        },

        check_technology: {
            name: "check_technology",
            description: "Check tech experience",
            icon: "🔧",
            requiresInput: true,
            inputPlaceholder: "e.g., 'PyTorch', 'RAG'",
            execute: function(tech) {
                if (!tech) return { error: "Please provide a technology name" };
                const matchingSkill = skills.find(s => s.name.toLowerCase() === tech.toLowerCase());
                const matchingProjects = getProjectsByTechnology(tech);
                return {
                    technology: tech,
                    has_experience: matchingSkill !== undefined || matchingProjects.length > 0,
                    proficiency: matchingSkill?.proficiency || null,
                    years_experience: matchingSkill?.yearsExperience || null,
                    projects_using_it: matchingProjects.map(p => p.name)
                };
            }
        }
    };

    // === PUBLIC API ===

    return {
        tools: tools,

        getToolList: function() {
            return Object.values(tools).map(t => ({
                name: t.name,
                description: t.description,
                icon: t.icon,
                requiresInput: t.requiresInput || false,
                inputPlaceholder: t.inputPlaceholder || ""
            }));
        },

        executeTool: function(toolName, input) {
            const tool = tools[toolName];
            if (!tool) return { error: `Unknown tool: ${toolName}` };
            try {
                return tool.execute(input);
            } catch (e) {
                return { error: e.message };
            }
        },

        // Quick access for chatbot
        getQuickActions: function() {
            return [
                { id: "overview", label: "Overview", icon: "🎯", tool: "get_portfolio_overview" },
                { id: "skills", label: "Skills", icon: "💻", tool: "get_skills" },
                { id: "projects", label: "Projects", icon: "🚀", tool: "get_impact_metrics" },
                { id: "contact", label: "Contact", icon: "📧", tool: "get_contact_info" }
            ];
        }
    };
})();

// Make available globally
window.MCPTools = MCPTools;
