#!/usr/bin/env python3
"""
Second Brain Auto-Capture Hook for Claude Code

This hook automatically captures learnings when Claude Code:
- Fixes errors (Bash command fails then succeeds)
- Makes significant edits (bug fixes, new patterns)
- Solves problems

Configure in ~/.claude/settings.json:
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Bash",
      "command": "/path/to/venv/bin/python3 /path/to/auto_capture.py"
    }]
  }
}
"""

import json
import os
import sys
import re
from datetime import datetime
from pathlib import Path

import httpx

# Configuration
API_URL = os.getenv("SECOND_BRAIN_API_URL", "http://localhost:8000")
API_KEY = os.getenv("SECOND_BRAIN_API_KEY", "sb-mcp-dev-key-change-in-production")

# State file to track errors across tool calls
STATE_FILE = Path.home() / ".second-brain-hook-state.json"

# Keywords that indicate something worth capturing
ERROR_KEYWORDS = [
    "error", "exception", "failed", "failure", "traceback",
    "errno", "cannot", "could not", "unable to", "not found",
    "permission denied", "syntax error", "type error", "import error",
    "module not found", "no such file", "connection refused"
]

FIX_KEYWORDS = [
    "fix", "fixed", "solving", "solved", "resolve", "resolved",
    "bug", "issue", "problem", "workaround", "solution"
]

LEARNING_KEYWORDS = [
    "learned", "til", "today i learned", "note to self",
    "remember", "important", "gotcha", "trick", "tip",
    "pattern", "best practice", "always", "never", "should"
]


def load_state() -> dict:
    """Load state from file."""
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    return {"last_error": None, "last_error_time": None}


def save_state(state: dict) -> None:
    """Save state to file."""
    try:
        STATE_FILE.write_text(json.dumps(state))
    except Exception:
        pass


def contains_keywords(text: str, keywords: list[str]) -> bool:
    """Check if text contains any of the keywords."""
    text_lower = text.lower()
    return any(kw in text_lower for kw in keywords)


def extract_learning_type(content: str) -> str:
    """Determine the type of learning based on content."""
    content_lower = content.lower()

    if contains_keywords(content_lower, ["error", "exception", "bug", "fix"]):
        return "debug"
    elif contains_keywords(content_lower, ["pattern", "best practice", "always", "never"]):
        return "pattern"
    elif contains_keywords(content_lower, ["config", "setup", "install", "configure"]):
        return "config"
    elif contains_keywords(content_lower, ["learn", "understand", "concept"]):
        return "concept"
    else:
        return "insight"


def extract_tags(content: str) -> list[str]:
    """Extract relevant tags from content."""
    tags = ["auto-captured"]

    # Technology tags
    tech_patterns = [
        r'\b(python|javascript|typescript|rust|go|java)\b',
        r'\b(react|vue|angular|fastapi|flask|django|express)\b',
        r'\b(docker|kubernetes|postgres|redis|mongodb|qdrant)\b',
        r'\b(git|npm|pip|cargo|brew)\b',
        r'\b(api|rest|graphql|websocket)\b',
        r'\b(async|await|promise|callback)\b',
    ]

    content_lower = content.lower()
    for pattern in tech_patterns:
        matches = re.findall(pattern, content_lower)
        tags.extend(matches)

    return list(set(tags))[:10]  # Limit to 10 tags


def should_capture(tool_name: str, tool_input: dict, tool_output: str, state: dict) -> tuple[bool, str, str]:
    """
    Determine if this tool call should be captured.

    Returns: (should_capture, content, reason)
    """
    output_str = str(tool_output) if tool_output else ""

    # Case 1: Bash command with error
    if tool_name == "Bash":
        command = tool_input.get("command", "")

        # Check if this is an error
        if contains_keywords(output_str, ERROR_KEYWORDS):
            # Store the error for later (might be fixed)
            state["last_error"] = {
                "command": command,
                "output": output_str[:500],
                "time": datetime.now().isoformat()
            }
            save_state(state)
            return False, "", ""

        # Check if this might be a fix for a previous error
        if state.get("last_error"):
            last_error = state["last_error"]
            # If the command succeeded and we had a recent error
            if not contains_keywords(output_str, ERROR_KEYWORDS):
                content = f"Error fixed: {last_error['command']}\n\nOriginal error: {last_error['output'][:200]}...\n\nSolution: {command}"
                state["last_error"] = None
                save_state(state)
                return True, content, "error_fixed"

    # Case 2: Edit with fix-related content
    if tool_name == "Edit":
        file_path = tool_input.get("file_path", "")
        old_string = tool_input.get("old_string", "")
        new_string = tool_input.get("new_string", "")

        # Check if this looks like a bug fix
        if contains_keywords(new_string, FIX_KEYWORDS) or contains_keywords(old_string, ERROR_KEYWORDS):
            content = f"Code fix in {file_path}:\n\nBefore: {old_string[:200]}\n\nAfter: {new_string[:200]}"
            return True, content, "code_fix"

    # Case 3: Any tool with explicit learning keywords in output
    if contains_keywords(output_str, LEARNING_KEYWORDS):
        content = f"Learning from {tool_name}: {output_str[:500]}"
        return True, content, "explicit_learning"

    return False, "", ""


def capture_to_second_brain(content: str, learning_type: str, tags: list[str]) -> bool:
    """Send capture to Second Brain API."""
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(
                f"{API_URL}/api/v1/mcp/capture",
                headers={
                    "X-API-Key": API_KEY,
                    "Content-Type": "application/json",
                },
                json={
                    "content": content,
                    "learning_type": learning_type,
                    "tags": tags,
                    "source": "claude-code-hook",
                    "context": {"auto_captured": True}
                }
            )
            return response.status_code == 201
    except Exception as e:
        # Silently fail - don't interrupt the user's workflow
        return False


def main():
    """Main hook handler."""
    try:
        # Read tool call info from stdin
        input_data = sys.stdin.read()
        if not input_data:
            return

        hook_data = json.loads(input_data)

        tool_name = hook_data.get("tool_name", "")
        tool_input = hook_data.get("tool_input", {})
        tool_output = hook_data.get("tool_output", "")

        # Load state
        state = load_state()

        # Check if we should capture
        should, content, reason = should_capture(tool_name, tool_input, tool_output, state)

        if should and content:
            learning_type = extract_learning_type(content)
            tags = extract_tags(content)
            tags.append(reason)  # Add the capture reason as a tag

            capture_to_second_brain(content, learning_type, tags)

    except json.JSONDecodeError:
        # Invalid JSON input, ignore
        pass
    except Exception:
        # Any other error, silently fail
        pass


if __name__ == "__main__":
    main()
