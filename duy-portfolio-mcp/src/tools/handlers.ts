/**
 * Shared Tool Handlers
 * Used by both MCP server (stdio) and HTTP server
 */

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
  type Skill,
} from "../data/portfolio.js";

// Tool definitions for both MCP and HTTP exposure
export const TOOL_DEFINITIONS = [
  {
    name: "get_portfolio_overview",
    description: "Get a high-level overview of Duy Nguyen's portfolio, including key metrics and featured projects.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "search_projects",
    description: "Search Duy's projects by keyword, technology, or topic.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query (e.g., 'machine learning', 'RAG', 'PyTorch')",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_project_details",
    description: "Get detailed information about a specific project.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project_name: {
          type: "string",
          description: "Project name or ID",
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
          description: "Skill category to filter by",
        },
      },
      required: [] as string[],
    },
  },
  {
    name: "get_experience",
    description: "Get Duy's education and work experience.",
    inputSchema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: ["education", "work", "volunteer", "all"],
          description: "Type of experience to filter by",
        },
      },
      required: [] as string[],
    },
  },
  {
    name: "get_contact_info",
    description: "Get Duy's contact information.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "get_availability",
    description: "Get Duy's job search status and availability.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "check_technology_experience",
    description: "Check if Duy has experience with specific technologies.",
    inputSchema: {
      type: "object" as const,
      properties: {
        technologies: {
          type: "array",
          items: { type: "string" },
          description: "Technologies to check",
        },
      },
      required: ["technologies"],
    },
  },
  {
    name: "get_impact_metrics",
    description: "Get quantified impact metrics from Duy's projects.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
];

// === HANDLER IMPLEMENTATIONS ===

export function handleGetPortfolioOverview(): object {
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
  };
}

export function handleSearchProjects(query: string): object {
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
          technologies: p.technologies,
          type: p.type,
        })),
      };
    }
    return {
      query,
      count: 0,
      message: "No projects found matching that query.",
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

export function handleGetProjectDetails(projectName: string): object {
  const lowerName = projectName.toLowerCase();
  const project = projects.find(p =>
    p.id.toLowerCase().includes(lowerName) ||
    p.name.toLowerCase().includes(lowerName)
  );

  if (!project) {
    return {
      error: `Project "${projectName}" not found.`,
      available_projects: projects.map(p => p.name),
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

export function handleGetSkills(category?: string): object {
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

export function handleGetExperience(type?: string): object {
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

export function handleGetContactInfo(): object {
  return {
    ...contact,
    note: "Feel free to reach out via email or LinkedIn!",
  };
}

export function handleGetAvailability(): object {
  return {
    ...availability,
    summary: `Seeking ${availability.seeking} in ${availability.roles.join(" or ")}. Available ${availability.startDate}.`,
  };
}

export function handleCheckTechnologyExperience(technologies: string[]): object {
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
        : "No direct experience with these specific technologies.",
    details: results,
  };
}

export function handleGetImpactMetrics(): object {
  const metricsProjects = projects.filter(p => p.metrics);

  return {
    summary: "Quantified impact from Duy's projects:",
    metrics: metricsProjects.map(p => ({
      project: p.name,
      metric: p.metrics!.value,
      description: p.metrics!.label,
      context: p.impact,
    })),
  };
}

// === UNIFIED TOOL EXECUTOR ===

export interface ToolInput {
  query?: string;
  project_name?: string;
  category?: string;
  type?: string;
  technologies?: string[];
}

export function executeTool(toolName: string, args: ToolInput): object {
  switch (toolName) {
    case "get_portfolio_overview":
      return handleGetPortfolioOverview();
    case "search_projects":
      return handleSearchProjects(args.query || "");
    case "get_project_details":
      return handleGetProjectDetails(args.project_name || "");
    case "get_skills":
      return handleGetSkills(args.category);
    case "get_experience":
      return handleGetExperience(args.type);
    case "get_contact_info":
      return handleGetContactInfo();
    case "get_availability":
      return handleGetAvailability();
    case "check_technology_experience":
      return handleCheckTechnologyExperience(args.technologies || []);
    case "get_impact_metrics":
      return handleGetImpactMetrics();
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
