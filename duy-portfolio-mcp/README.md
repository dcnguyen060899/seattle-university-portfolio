# Duy Nguyen Portfolio MCP Server

An MCP (Model Context Protocol) server that allows **Claude Code** users to query my portfolio, projects, skills, and experience directly from their terminal.

## What is this?

Instead of browsing a website, you can ask Claude about my background directly in Claude Code. This demonstrates:

- **MCP Server Development** - Building tools for Claude's ecosystem
- **Meta-creativity** - Using AI tools to showcase AI skills
- **Production-ready code** - TypeScript, proper typing, clean architecture

## Quick Start

### Option 1: npx (Recommended)

Add to your Claude Code settings (`~/.claude.json` or via Claude Code settings):

```json
{
  "mcpServers": {
    "duy-portfolio": {
      "command": "npx",
      "args": ["-y", "duy-portfolio-mcp"]
    }
  }
}
```

### Option 2: Local Installation

```bash
# Clone and install
git clone https://github.com/dcnguyen060899/duy-portfolio-mcp.git
cd duy-portfolio-mcp
npm install
npm run build

# Add to Claude Code settings
{
  "mcpServers": {
    "duy-portfolio": {
      "command": "node",
      "args": ["/path/to/duy-portfolio-mcp/dist/index.js"]
    }
  }
}
```

## Available Tools

Once configured, Claude Code has access to these tools:

| Tool | Description |
|------|-------------|
| `get_portfolio_overview` | High-level overview of my portfolio and key metrics |
| `search_projects` | Search projects by keyword or technology |
| `get_project_details` | Detailed info about a specific project |
| `get_skills` | Technical skills by category with proficiency levels |
| `get_experience` | Education and work experience history |
| `get_contact_info` | Email, LinkedIn, GitHub links |
| `get_availability` | Current job search status and preferences |
| `check_technology_experience` | Check if I have experience with specific technologies |
| `get_impact_metrics` | Quantified impact from my projects |
| `ask_about_duy` | Free-form questions with relevant context |

## Example Usage

After configuring, just ask Claude naturally:

```
You: "What projects has Duy worked on?"
Claude: *uses get_portfolio_overview* → Returns featured projects

You: "Does he have experience with PyTorch and RAG systems?"
Claude: *uses check_technology_experience* → Shows proficiency and projects

You: "Tell me about the MOSAIC chatbot project"
Claude: *uses get_project_details* → Full project breakdown

You: "Is he available for a summer 2026 internship?"
Claude: *uses get_availability* → Shows availability and preferences
```

## Key Highlights

### Featured Projects

- **MOSAIC AI Chatbot** - 660K+ users, Top 4 SFU CS Diversity Award
- **UC Berkeley Capstone** - $30.4M projected savings, selected as Exemplar
- **NASA Flight Analysis** - 95.9% R², challenged industry assumptions

### Technical Skills

- **Languages**: Python (95%), SQL (85%), R (75%), TypeScript (70%)
- **ML/AI**: PyTorch, scikit-learn, TensorFlow, HuggingFace
- **Specialties**: RAG Systems, Knowledge Graphs, Transfer Learning, Causal Inference

### Currently Seeking

**Summer 2026 Internship** in Data Science, ML Engineering, or AI/ML roles.

## Resources

The server also exposes resources:

- `portfolio://overview` - Complete portfolio data as JSON
- `portfolio://resume` - Structured resume data

## Architecture

```
duy-portfolio-mcp/
├── src/
│   ├── index.ts          # MCP server & tool handlers
│   └── data/
│       └── portfolio.ts  # Embedded portfolio data
├── package.json
└── tsconfig.json
```

All portfolio data is embedded directly - no external API calls needed. The server runs entirely locally and works offline.

## Why MCP?

This project demonstrates that I:

1. Understand Claude's tool ecosystem deeply
2. Can build production-quality MCP servers
3. Think creatively about AI applications
4. Ship clean, well-documented code

## Contact

- **Email**: dcnguyen060899@gmail.com
- **LinkedIn**: [linkedin.com/in/duwe-ng](https://www.linkedin.com/in/duwe-ng/)
- **GitHub**: [github.com/dcnguyen060899](https://github.com/dcnguyen060899)
- **Portfolio**: [duyng-portfolio.com](https://duyng-portfolio.com)

## License

MIT License - Feel free to use this as a template for your own portfolio MCP server!

---

*Built with TypeScript and the [MCP SDK](https://github.com/anthropics/model-context-protocol)*
