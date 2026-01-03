/**
 * Duy Nguyen's Portfolio Data
 * Embedded directly for standalone MCP functionality
 */

export interface Project {
  id: string;
  name: string;
  description: string;
  impact: string;
  technologies: string[];
  highlights: string[];
  links: {
    demo?: string;
    github?: string;
    article?: string;
  };
  type: "featured" | "other";
  metrics?: {
    value: string;
    label: string;
  };
}

export interface Skill {
  name: string;
  category: "languages" | "ml_frameworks" | "data_tools" | "cloud" | "specialties";
  proficiency: number; // 0-100
  yearsExperience?: number;
  projects: string[]; // project IDs where this skill was used
}

export interface Experience {
  type: "education" | "work" | "volunteer";
  organization: string;
  role: string;
  location: string;
  startDate: string;
  endDate: string | "Present";
  description: string;
  highlights: string[];
}

export interface Contact {
  email: string;
  linkedin: string;
  github: string;
  portfolio: string;
  location: string;
}

// === PROJECTS ===
export const projects: Project[] = [
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
    links: {
      demo: "https://duyng-portfolio.com/docs/index_mosaic_chatbot.html"
    },
    type: "featured",
    metrics: {
      value: "660K+",
      label: "Users Served"
    }
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
    links: {
      demo: "https://duyng-portfolio.com/docs/index.html",
      article: "https://www.linkedin.com/posts/duwe-ng_professional-certificate-in-machine-learning-activity-7229560019187326976-ShNS"
    },
    type: "featured",
    metrics: {
      value: "$30.4M",
      label: "Projected Savings"
    }
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
    links: {
      demo: "https://duyng-portfolio.com/docs/index_data5100_project.html"
    },
    type: "featured",
    metrics: {
      value: "95.9%",
      label: "Variance Explained"
    }
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
    links: {
      demo: "https://duyng-portfolio.com/docs/index_image_classification.html",
      github: "https://huggingface.co/spaces/dnguyen44/garbage-classification"
    },
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
    links: {
      demo: "https://duyng-portfolio.com/docs/index_independent_research.html"
    },
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
    links: {
      github: "https://github.com/dcnguyen060899/SFU_Faisal_Lab_roi_slab_retrieval_engine"
    },
    type: "other"
  },
  {
    id: "ai-agent-alignment",
    name: "AI Agent - ML-Business Alignment",
    description: "Agent system bridging ML teams and business stakeholders for strategic alignment.",
    impact: "Demonstrates understanding of AI in business contexts.",
    technologies: ["Python", "LangChain", "Prompt Engineering", "Agent Design"],
    highlights: [
      "Designed agent architecture for cross-functional communication",
      "Built tools for translating technical metrics to business KPIs",
      "Created decision-support workflows"
    ],
    links: {
      demo: "https://duyng-portfolio.com/docs/index_ai_agent_project.html"
    },
    type: "other"
  },
  {
    id: "mcp-portfolio",
    name: "Portfolio MCP Server",
    description: "This very MCP server - allowing Claude Code users to query my portfolio directly.",
    impact: "Meta-demonstration of MCP development skills.",
    technologies: ["TypeScript", "MCP SDK", "Node.js"],
    highlights: [
      "Built custom MCP server for portfolio queries",
      "Demonstrates understanding of Claude's tool ecosystem",
      "Enables technical recruiters to explore portfolio via CLI"
    ],
    links: {
      github: "https://github.com/dcnguyen060899/duy-portfolio-mcp"
    },
    type: "other"
  }
];

// === SKILLS ===
export const skills: Skill[] = [
  // Languages
  { name: "Python", category: "languages", proficiency: 95, yearsExperience: 4, projects: ["mosaic-chatbot", "berkeley-capstone", "garbage-classification", "sfu-faisal-lab"] },
  { name: "SQL", category: "languages", proficiency: 85, yearsExperience: 3, projects: ["berkeley-capstone", "mosaic-chatbot"] },
  { name: "R", category: "languages", proficiency: 75, yearsExperience: 2, projects: ["nasa-flight-analysis"] },
  { name: "TypeScript", category: "languages", proficiency: 70, yearsExperience: 1, projects: ["mcp-portfolio"] },

  // ML Frameworks
  { name: "PyTorch", category: "ml_frameworks", proficiency: 85, yearsExperience: 2, projects: ["garbage-classification", "duy-integral-theorem"] },
  { name: "scikit-learn", category: "ml_frameworks", proficiency: 90, yearsExperience: 3, projects: ["berkeley-capstone", "nasa-flight-analysis"] },
  { name: "TensorFlow", category: "ml_frameworks", proficiency: 75, yearsExperience: 2, projects: ["berkeley-capstone"] },
  { name: "HuggingFace", category: "ml_frameworks", proficiency: 80, yearsExperience: 1, projects: ["garbage-classification", "mosaic-chatbot"] },

  // Data Tools
  { name: "Pandas", category: "data_tools", proficiency: 95, yearsExperience: 4, projects: ["berkeley-capstone", "nasa-flight-analysis", "mosaic-chatbot"] },
  { name: "Neo4j", category: "data_tools", proficiency: 75, yearsExperience: 1, projects: ["mosaic-chatbot"] },
  { name: "PostgreSQL", category: "data_tools", proficiency: 80, yearsExperience: 2, projects: ["berkeley-capstone"] },
  { name: "Qdrant", category: "data_tools", proficiency: 70, yearsExperience: 1, projects: ["sfu-faisal-lab", "mcp-portfolio"] },

  // Specialties
  { name: "RAG Systems", category: "specialties", proficiency: 85, projects: ["mosaic-chatbot", "sfu-faisal-lab", "mcp-portfolio"] },
  { name: "Knowledge Graphs", category: "specialties", proficiency: 80, projects: ["mosaic-chatbot"] },
  { name: "Transfer Learning", category: "specialties", proficiency: 85, projects: ["garbage-classification"] },
  { name: "Statistical Modeling", category: "specialties", proficiency: 90, projects: ["nasa-flight-analysis", "berkeley-capstone"] },
  { name: "Causal Inference", category: "specialties", proficiency: 75, projects: ["nasa-flight-analysis"] },
  { name: "A/B Testing", category: "specialties", proficiency: 80, projects: [] },
  { name: "NLP", category: "specialties", proficiency: 85, projects: ["mosaic-chatbot", "sfu-faisal-lab"] },
  { name: "Experimental Design", category: "specialties", proficiency: 80, projects: ["nasa-flight-analysis"] }
];

// === EXPERIENCE ===
export const experience: Experience[] = [
  {
    type: "education",
    organization: "Seattle University",
    role: "MS Data Science",
    location: "Seattle, WA",
    startDate: "2025-09",
    endDate: "2027-06",
    description: "Master's program focusing on advanced data science, machine learning, and AI systems.",
    highlights: [
      "Focus areas: Causal Inference, Statistical Learning, Scalable Analytics",
      "NASA Flight Data Analysis project (95.9% R²)",
      "Building expertise in production ML systems"
    ]
  },
  {
    type: "education",
    organization: "UC Berkeley Extension",
    role: "Professional Certificate in Machine Learning & AI",
    location: "Online",
    startDate: "2023-01",
    endDate: "2024-06",
    description: "Intensive ML/AI program covering deep learning, neural networks, and practical applications.",
    highlights: [
      "Capstone selected as Project Exemplar",
      "Hospital resource optimization: $30.4M projected savings",
      "Comprehensive coverage of ML algorithms and deployment"
    ]
  },
  {
    type: "volunteer",
    organization: "SFU Blueprint",
    role: "Data Science Lead",
    location: "Vancouver, BC",
    startDate: "2024-01",
    endDate: "2024-12",
    description: "Led AI development for MOSAIC immigration chatbot serving 660K+ users.",
    highlights: [
      "Top 4 SFU CS Diversity Award",
      "Built knowledge graph for immigration services",
      "90% accuracy validation pipeline"
    ]
  },
  {
    type: "volunteer",
    organization: "SFU Faisal Lab",
    role: "Research Assistant",
    location: "Vancouver, BC",
    startDate: "2024-06",
    endDate: "2024-12",
    description: "Developed RAG system for medical imaging retrieval.",
    highlights: [
      "Natural language to JSON query translation",
      "Medical imaging database accessibility research"
    ]
  }
];

// === CONTACT ===
export const contact: Contact = {
  email: "dcnguyen060899@gmail.com",
  linkedin: "https://www.linkedin.com/in/duwe-ng/",
  github: "https://github.com/dcnguyen060899",
  portfolio: "https://duyng-portfolio.com",
  location: "Seattle, WA (Open to relocation)"
};

// === AVAILABILITY ===
export const availability = {
  seeking: "Summer 2026 Internship",
  roles: ["Data Science Intern", "ML Engineer Intern", "AI/ML Intern"],
  startDate: "June 2026",
  workAuthorization: "F-1 OPT/CPT eligible",
  openTo: ["Remote", "On-site", "Hybrid"],
  preferredLocations: ["Seattle", "San Francisco Bay Area", "New York", "Open to others"]
};

// === HELPER FUNCTIONS ===
export function searchProjects(query: string): Project[] {
  const lowerQuery = query.toLowerCase();
  return projects.filter(p =>
    p.name.toLowerCase().includes(lowerQuery) ||
    p.description.toLowerCase().includes(lowerQuery) ||
    p.technologies.some(t => t.toLowerCase().includes(lowerQuery)) ||
    p.highlights.some(h => h.toLowerCase().includes(lowerQuery))
  );
}

export function getProjectsByTechnology(tech: string): Project[] {
  const lowerTech = tech.toLowerCase();
  return projects.filter(p =>
    p.technologies.some(t => t.toLowerCase().includes(lowerTech))
  );
}

export function getSkillsByCategory(category: Skill["category"]): Skill[] {
  return skills.filter(s => s.category === category).sort((a, b) => b.proficiency - a.proficiency);
}

export function getFeaturedProjects(): Project[] {
  return projects.filter(p => p.type === "featured");
}

export function getTopSkills(n: number = 5): Skill[] {
  return [...skills].sort((a, b) => b.proficiency - a.proficiency).slice(0, n);
}
