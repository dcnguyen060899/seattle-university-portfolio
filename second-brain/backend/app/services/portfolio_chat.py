"""
Portfolio Chat Service with Function Calling

This service powers the portfolio chatbot with Claude's function calling capabilities,
enabling recruiters to interactively explore Duy's qualifications, projects, and skills.
"""

import json
import anthropic
from typing import Any, Dict, List, Optional
from datetime import datetime

from app.core.config import settings
from app.demo.portfolio_tools import PORTFOLIO_TOOLS, execute_tool, PORTFOLIO_DATA


# System prompt for portfolio assistant
PORTFOLIO_SYSTEM_PROMPT = """You are an AI assistant for Duy Nguyen's portfolio website. Your role is to help recruiters and hiring managers learn about Duy's qualifications, projects, and experience.

## Your Capabilities
You have access to tools that let you:
- Search and filter Duy's projects by technology or type
- Get detailed information about specific projects
- Fetch live GitHub activity and statistics
- Assess skill matches for job requirements
- Provide contact information and availability
- Show quantified impact metrics
- Compare experience across technologies

## Guidelines
1. **Be helpful and professional** - You're representing Duy to potential employers
2. **Use tools proactively** - When asked about projects, skills, or experience, use the appropriate tools to provide accurate, structured information
3. **Highlight achievements** - Emphasize quantified impact (660K+ users, $30.4M savings, 95.9% accuracy)
4. **Be concise** - Provide clear, scannable responses suitable for busy recruiters
5. **Offer next steps** - Suggest relevant follow-up questions or actions (view demo, see resume, etc.)

## Key Facts About Duy
- MS Data Science student at Seattle University (Fall 2025)
- Seeking Summer 2026 internships in Data Science / AI/ML Engineering
- Production ML experience: 660K+ users served through MOSAIC chatbot
- UC Berkeley ML/AI Capstone Exemplar
- Strong foundation in Python, PyTorch, statistical modeling

When you don't have specific information, use the appropriate tool to look it up rather than guessing."""


class PortfolioChatService:
    """
    Service for handling portfolio chat with Claude's function calling.
    """

    def __init__(self):
        self.client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        self.tools = PORTFOLIO_TOOLS

    async def chat(
        self,
        message: str,
        conversation_history: Optional[List[Dict]] = None,
        show_tool_calls: bool = True
    ) -> Dict[str, Any]:
        """
        Process a chat message with function calling support.

        Args:
            message: User's message
            conversation_history: Previous messages in the conversation
            show_tool_calls: Whether to include tool call details in response

        Returns:
            Dict with response, tool_calls, and metadata
        """
        # Build message history
        messages = conversation_history or []
        messages.append({"role": "user", "content": message})

        # Track tool calls for transparency
        tool_calls_made = []
        tool_results = []

        # Initial API call with tools
        response = self.client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=2048,
            system=PORTFOLIO_SYSTEM_PROMPT,
            tools=self.tools,
            messages=messages,
        )

        # Handle tool use loop
        while response.stop_reason == "tool_use":
            # Extract tool use blocks
            tool_use_blocks = [
                block for block in response.content
                if block.type == "tool_use"
            ]

            # Execute each tool
            tool_results_for_api = []
            for tool_use in tool_use_blocks:
                tool_name = tool_use.name
                tool_input = tool_use.input

                # Execute the tool
                result = await execute_tool(tool_name, tool_input)

                # Track for response
                tool_calls_made.append({
                    "tool": tool_name,
                    "input": tool_input,
                    "result_summary": self._summarize_result(result)
                })
                tool_results.append({
                    "tool": tool_name,
                    "data": result
                })

                # Format for API
                tool_results_for_api.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use.id,
                    "content": json.dumps(result)
                })

            # Add assistant's response and tool results to messages
            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results_for_api})

            # Continue the conversation
            response = self.client.messages.create(
                model=settings.ANTHROPIC_MODEL,
                max_tokens=2048,
                system=PORTFOLIO_SYSTEM_PROMPT,
                tools=self.tools,
                messages=messages,
            )

        # Extract final text response
        final_response = ""
        for block in response.content:
            if hasattr(block, "text"):
                final_response += block.text

        # Build response
        result = {
            "response": final_response,
            "tool_calls": tool_calls_made if show_tool_calls else [],
            "tool_results": tool_results if show_tool_calls else [],
            "model": settings.ANTHROPIC_MODEL,
            "timestamp": datetime.utcnow().isoformat(),
        }

        return result

    def _summarize_result(self, result: Dict) -> str:
        """Create a brief summary of tool result for UI display."""
        if "error" in result:
            return f"Error: {result['error']}"

        if "results_count" in result:
            return f"Found {result['results_count']} results"

        if "project_id" in result:
            return f"Retrieved project: {result.get('name', result['project_id'])}"

        if "matched_skills" in result:
            return f"Matched {result['match_count']} skills"

        if "headline_metrics" in result:
            return f"Retrieved {len(result['headline_metrics'])} impact metrics"

        if "username" in result:
            return f"GitHub: {result.get('public_repos', 0)} repos"

        if "email" in result:
            return "Contact information retrieved"

        if "seeking" in result:
            return f"Availability: {result['seeking']}"

        if "comparison" in result:
            return f"Compared {len(result['comparison'])} technologies"

        return "Data retrieved successfully"


# Singleton instance
_portfolio_chat_service = None

def get_portfolio_chat_service() -> PortfolioChatService:
    """Get or create the portfolio chat service singleton."""
    global _portfolio_chat_service
    if _portfolio_chat_service is None:
        _portfolio_chat_service = PortfolioChatService()
    return _portfolio_chat_service
