"""
MCP HTTP Client

Connects to the MCP HTTP server to execute portfolio tools.
This bridges the web chatbot with the MCP tool ecosystem.
"""

import httpx
from typing import Dict, Any, List, Optional
import os


# MCP HTTP Server URL - default to localhost:3001
MCP_HTTP_URL = os.getenv("MCP_HTTP_URL", "http://localhost:3001")


# Tool definitions for Claude API (matching MCP tools)
PORTFOLIO_TOOLS = [
    {
        "name": "get_portfolio_overview",
        "description": "Get a high-level overview of Duy's portfolio including key metrics, featured projects, and top skills. Use this for general questions about Duy.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "search_projects",
        "description": "Search Duy's projects by keyword or technology. Use this when asked about specific types of projects or technologies.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query (e.g., 'machine learning', 'RAG', 'PyTorch')"
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "get_project_details",
        "description": "Get detailed information about a specific project including highlights, technologies, and impact.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_name": {
                    "type": "string",
                    "description": "Project name (e.g., 'MOSAIC', 'Berkeley Capstone', 'NASA')"
                }
            },
            "required": ["project_name"]
        }
    },
    {
        "name": "get_skills",
        "description": "Get Duy's technical skills with proficiency levels. Can filter by category.",
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "enum": ["languages", "ml_frameworks", "data_tools", "specialties", "all"],
                    "description": "Skill category to filter by"
                }
            },
            "required": []
        }
    },
    {
        "name": "get_experience",
        "description": "Get Duy's education and work experience history.",
        "input_schema": {
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "enum": ["education", "work", "volunteer", "all"],
                    "description": "Type of experience"
                }
            },
            "required": []
        }
    },
    {
        "name": "get_contact_info",
        "description": "Get Duy's contact information including email, LinkedIn, and GitHub.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "get_availability",
        "description": "Get information about Duy's job search status and availability for internships.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "check_technology_experience",
        "description": "Check if Duy has experience with specific technologies and see related projects.",
        "input_schema": {
            "type": "object",
            "properties": {
                "technologies": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of technologies to check (e.g., ['Python', 'PyTorch'])"
                }
            },
            "required": ["technologies"]
        }
    },
    {
        "name": "get_impact_metrics",
        "description": "Get quantified impact metrics from Duy's projects (users served, cost savings, accuracy).",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    }
]


async def execute_mcp_tool(tool_name: str, tool_args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute a tool via the MCP HTTP API.

    Args:
        tool_name: Name of the tool to execute
        tool_args: Arguments for the tool

    Returns:
        Tool execution result
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{MCP_HTTP_URL}/execute",
                json={
                    "tool": tool_name,
                    "args": tool_args
                }
            )

            if response.status_code == 200:
                data = response.json()
                return {
                    "success": True,
                    "tool": tool_name,
                    "result": data.get("result", {}),
                }
            else:
                return {
                    "success": False,
                    "tool": tool_name,
                    "error": f"HTTP {response.status_code}: {response.text}"
                }

    except httpx.ConnectError:
        # MCP server not running - return fallback
        return {
            "success": False,
            "tool": tool_name,
            "error": "MCP HTTP server not available",
            "fallback": True
        }
    except Exception as e:
        return {
            "success": False,
            "tool": tool_name,
            "error": str(e)
        }


async def check_mcp_health() -> bool:
    """Check if MCP HTTP server is running."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{MCP_HTTP_URL}/health")
            return response.status_code == 200
    except:
        return False


def get_portfolio_tools() -> List[Dict[str, Any]]:
    """Get the list of portfolio tools for Claude API."""
    return PORTFOLIO_TOOLS
