#!/usr/bin/env node

/**
 * Duy Nguyen Portfolio MCP Server
 *
 * An MCP server that allows Claude Code users to query
 * Duy Nguyen's portfolio, projects, skills, and experience.
 *
 * Usage: Add to Claude Code settings, then ask Claude about Duy!
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  projects,
  skills,
  experience,
  contact,
  availability,
  searchProjects,
  getProjectsByTechnology,
  getSkillsByCategory,
  getFeaturedProjects,
  getTopSkills,
  type Project,
  type Skill,
} from "./data/portfolio.js";

// Create MCP server
const server = new Server(
  {
    name: "duy-portfolio-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// === TOOL DEFINITIONS ===

const TOOLS = [
  {
    name: "get_portfolio_overview",
    description: "Get a high-level overview of Duy Nguyen's portfolio, including key metrics and featured projects. Use this as a starting point to learn about Duy.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "search_projects",
    description: "Search Duy's projects by keyword, technology, or topic. Returns matching projects with details.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query (e.g., 'machine learning', 'RAG', 'healthcare', 'PyTorch')",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_project_details",
    description: "Get detailed information about a specific project by name or ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project_name: {
          type: "string",
          description: "Project name or ID (e.g., 'MOSAIC', 'berkeley-capstone', 'NASA')",
        },
      },
      required: ["project_name"],
    },
  },
  {
    name: "get_skills",
    description: "Get Duy's technical skills, optionally filtered by category.",
    inputSchema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          enum: ["languages", "ml_frameworks", "data_tools", "specialties", "all"],
          description: "Skill category to filter by (default: all)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_experience",
    description: "Get Duy's education and work experience history.",
    inputSchema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: ["education", "work", "volunteer", "all"],
          description: "Type of experience to filter by (default: all)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_contact_info",
    description: "Get Duy's contact information and links.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_availability",
    description: "Get information about Duy's job search status and availability.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "check_technology_experience",
    description: "Check if Duy has experience with specific technologies and get related projects.",
    inputSchema: {
      type: "object" as const,
      properties: {
        technologies: {
          type: "array",
          items: { type: "string" },
          description: "List of technologies to check (e.g., ['Python', 'PyTorch', 'RAG'])",
        },
      },
      required: ["technologies"],
    },
  },
  {
    name: "get_impact_metrics",
    description: "Get quantified impact metrics from Duy's projects (users served, cost savings, accuracy scores).",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "ask_about_duy",
    description: "Ask a free-form question about Duy. This tool provides relevant context based on the question.",
    inputSchema: {
      type: "object" as const,
      properties: {
        question: {
          type: "string",
          description: "Your question about Duy (e.g., 'What makes him a good fit for an ML role?')",
        },
      },
      required: ["question"],
    },
  },
];

// === TOOL HANDLERS ===

function handleGetPortfolioOverview(): object {
  const featured = getFeaturedProjects();
  const topSkills = getTopSkills(8);

  return {
    summary: "Duy Nguyen is an MS Data Science student at Seattle University with a track record of building production ML systems that deliver measurable business impact.",
    seeking: availability.seeking,
    key_metrics: featured.map(p => p.metrics).filter(Boolean),
    featured_projects: featured.map(p => ({
      name: p.name,
      impact: p.impact,
      technologies: p.technologies.slice(0, 4),
    })),
    top_skills: topSkills.map(s => ({ name: s.name, proficiency: s.proficiency })),
    portfolio_url: contact.portfolio,
    tip: "Use 'search_projects' or 'get_project_details' to learn more about specific work.",
  };
}

function handleSearchProjects(query: string): object {
  const results = searchProjects(query);

  if (results.length === 0) {
    // Try technology search as fallback
    const techResults = getProjectsByTechnology(query);
    if (techResults.length > 0) {
      return {
        query,
        match_type: "technology",
        count: techResults.length,
        projects: techResults.map(p => ({
          name: p.name,
          description: p.description,
          technologies: p.technologies,
          type: p.type,
        })),
      };
    }
    return {
      query,
      count: 0,
      message: "No projects found matching that query. Try different keywords or use 'get_portfolio_overview' to see all projects.",
    };
  }

  return {
    query,
    count: results.length,
    projects: results.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      impact: p.impact,
      technologies: p.technologies,
      type: p.type,
    })),
  };
}

function handleGetProjectDetails(projectName: string): object {
  const lowerName = projectName.toLowerCase();
  const project = projects.find(p =>
    p.id.toLowerCase().includes(lowerName) ||
    p.name.toLowerCase().includes(lowerName)
  );

  if (!project) {
    return {
      error: `Project "${projectName}" not found.`,
      available_projects: projects.map(p => p.name),
      tip: "Use one of the available project names listed above.",
    };
  }

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    impact: project.impact,
    technologies: project.technologies,
    highlights: project.highlights,
    links: project.links,
    metrics: project.metrics,
    type: project.type,
  };
}

function handleGetSkills(category?: string): object {
  if (!category || category === "all") {
    const grouped = {
      languages: getSkillsByCategory("languages"),
      ml_frameworks: getSkillsByCategory("ml_frameworks"),
      data_tools: getSkillsByCategory("data_tools"),
      specialties: getSkillsByCategory("specialties"),
    };

    return {
      total_skills: skills.length,
      by_category: Object.fromEntries(
        Object.entries(grouped).map(([cat, skillList]) => [
          cat,
          skillList.map(s => ({
            name: s.name,
            proficiency: s.proficiency,
            projects_used: s.projects.length,
          })),
        ])
      ),
    };
  }

  const categorySkills = getSkillsByCategory(category as Skill["category"]);
  return {
    category,
    skills: categorySkills.map(s => ({
      name: s.name,
      proficiency: s.proficiency,
      years_experience: s.yearsExperience,
      projects_used: s.projects,
    })),
  };
}

function handleGetExperience(type?: string): object {
  const filtered = type && type !== "all"
    ? experience.filter(e => e.type === type)
    : experience;

  return {
    count: filtered.length,
    experience: filtered.map(e => ({
      type: e.type,
      organization: e.organization,
      role: e.role,
      location: e.location,
      dates: `${e.startDate} - ${e.endDate}`,
      description: e.description,
      highlights: e.highlights,
    })),
  };
}

function handleGetContactInfo(): object {
  return {
    ...contact,
    note: "Feel free to reach out via email or LinkedIn!",
  };
}

function handleGetAvailability(): object {
  return {
    ...availability,
    summary: `Duy is seeking a ${availability.seeking} position in ${availability.roles.join(" or ")}. Available to start ${availability.startDate}.`,
  };
}

function handleCheckTechnologyExperience(technologies: string[]): object {
  const results = technologies.map(tech => {
    const matchingSkill = skills.find(s =>
      s.name.toLowerCase() === tech.toLowerCase()
    );

    const matchingProjects = getProjectsByTechnology(tech);

    return {
      technology: tech,
      has_experience: matchingSkill !== undefined || matchingProjects.length > 0,
      proficiency: matchingSkill?.proficiency ?? null,
      years_experience: matchingSkill?.yearsExperience ?? null,
      projects_using_it: matchingProjects.map(p => p.name),
    };
  });

  const hasAll = results.every(r => r.has_experience);
  const hasSome = results.some(r => r.has_experience);

  return {
    technologies_checked: technologies,
    summary: hasAll
      ? "Duy has experience with ALL of these technologies."
      : hasSome
        ? "Duy has experience with SOME of these technologies."
        : "Duy doesn't have direct experience with these specific technologies, but may have related skills.",
    details: results,
  };
}

function handleGetImpactMetrics(): object {
  const metricsProjects = projects.filter(p => p.metrics);

  return {
    summary: "Quantified impact from Duy's projects:",
    metrics: metricsProjects.map(p => ({
      project: p.name,
      metric: p.metrics!.value,
      description: p.metrics!.label,
      context: p.impact,
    })),
    note: "These metrics represent real, measurable outcomes from production systems.",
  };
}

function handleAskAboutDuy(question: string): object {
  const lowerQ = question.toLowerCase();

  // Determine relevant context based on question keywords
  let relevantContext: Record<string, unknown> = {};

  if (lowerQ.includes("project") || lowerQ.includes("work") || lowerQ.includes("built") || lowerQ.includes("experience")) {
    relevantContext.projects = getFeaturedProjects().map(p => ({
      name: p.name,
      impact: p.impact,
      technologies: p.technologies,
    }));
  }

  if (lowerQ.includes("skill") || lowerQ.includes("know") || lowerQ.includes("proficient") || lowerQ.includes("technology") || lowerQ.includes("tech")) {
    relevantContext.top_skills = getTopSkills(10).map(s => ({
      name: s.name,
      proficiency: s.proficiency,
    }));
  }

  if (lowerQ.includes("education") || lowerQ.includes("school") || lowerQ.includes("degree") || lowerQ.includes("study")) {
    relevantContext.education = experience.filter(e => e.type === "education");
  }

  if (lowerQ.includes("contact") || lowerQ.includes("reach") || lowerQ.includes("email") || lowerQ.includes("linkedin")) {
    relevantContext.contact = contact;
  }

  if (lowerQ.includes("available") || lowerQ.includes("hiring") || lowerQ.includes("intern") || lowerQ.includes("job") || lowerQ.includes("position")) {
    relevantContext.availability = availability;
  }

  if (lowerQ.includes("fit") || lowerQ.includes("strength") || lowerQ.includes("why") || lowerQ.includes("good")) {
    relevantContext.strengths = {
      production_experience: "Built systems serving 660K+ real users",
      quantified_impact: "Projects with measurable ROI ($30.4M projected savings)",
      technical_depth: "Strong foundation in ML theory and practice",
      diverse_domains: "Healthcare, immigration services, aviation, research",
    };
    relevantContext.featured_projects = getFeaturedProjects().map(p => ({
      name: p.name,
      impact: p.impact,
    }));
  }

  // If no specific context matched, provide overview
  if (Object.keys(relevantContext).length === 0) {
    relevantContext = {
      overview: handleGetPortfolioOverview(),
    };
  }

  return {
    question,
    relevant_context: relevantContext,
    tip: "Use the provided context to answer the question. For more details, use specific tools like 'get_project_details' or 'get_skills'.",
  };
}

// === REGISTER HANDLERS ===

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: object;

    switch (name) {
      case "get_portfolio_overview":
        result = handleGetPortfolioOverview();
        break;
      case "search_projects":
        result = handleSearchProjects((args as { query: string }).query);
        break;
      case "get_project_details":
        result = handleGetProjectDetails((args as { project_name: string }).project_name);
        break;
      case "get_skills":
        result = handleGetSkills((args as { category?: string }).category);
        break;
      case "get_experience":
        result = handleGetExperience((args as { type?: string }).type);
        break;
      case "get_contact_info":
        result = handleGetContactInfo();
        break;
      case "get_availability":
        result = handleGetAvailability();
        break;
      case "check_technology_experience":
        result = handleCheckTechnologyExperience((args as { technologies: string[] }).technologies);
        break;
      case "get_impact_metrics":
        result = handleGetImpactMetrics();
        break;
      case "ask_about_duy":
        result = handleAskAboutDuy((args as { question: string }).question);
        break;
      default:
        result = { error: `Unknown tool: ${name}` };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: String(error) }),
        },
      ],
      isError: true,
    };
  }
});

// List available resources (portfolio as a resource)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "portfolio://overview",
        name: "Duy Nguyen Portfolio Overview",
        description: "Complete overview of Duy's portfolio, projects, and skills",
        mimeType: "application/json",
      },
      {
        uri: "portfolio://resume",
        name: "Duy Nguyen Resume Data",
        description: "Structured resume data including experience and education",
        mimeType: "application/json",
      },
    ],
  };
});

// Read resources
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === "portfolio://overview") {
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(handleGetPortfolioOverview(), null, 2),
        },
      ],
    };
  }

  if (uri === "portfolio://resume") {
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify({
            contact,
            experience,
            skills: skills.map(s => ({ name: s.name, category: s.category, proficiency: s.proficiency })),
            projects: projects.map(p => ({ name: p.name, technologies: p.technologies, type: p.type })),
          }, null, 2),
        },
      ],
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// === START SERVER ===

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Duy Portfolio MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
