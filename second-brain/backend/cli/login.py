#!/usr/bin/env python3
"""
Second Brain CLI Login

This script handles the OAuth-like authentication flow for Claude Code.
It initiates a session, opens the browser for login, and saves the API key.

Usage:
    python login.py

Flow:
    1. Calls /initiate to get a session token
    2. Opens browser to auth URL
    3. Polls /status until authentication completes
    4. Saves the API key to the credentials file
"""

import os
import sys
import json
import time
import webbrowser
from pathlib import Path

try:
    import httpx
except ImportError:
    print("Error: httpx not installed. Run: pip install httpx")
    sys.exit(1)


# Configuration
API_BASE_URL = os.environ.get("SECOND_BRAIN_API_URL", "http://localhost:8000")
CREDENTIALS_FILE = Path.home() / ".second-brain" / "credentials.json"
POLL_INTERVAL = 2  # seconds
MAX_POLL_TIME = 600  # 10 minutes


def print_banner():
    """Print welcome banner."""
    print("\n" + "=" * 60)
    print("  🧠 Second Brain - CLI Authentication")
    print("=" * 60 + "\n")


def initiate_auth() -> dict:
    """Initiate the CLI auth flow."""
    try:
        response = httpx.post(f"{API_BASE_URL}/api/v1/cli-auth/initiate")
        response.raise_for_status()
        return response.json()
    except httpx.HTTPError as e:
        print(f"Error: Failed to initiate authentication: {e}")
        print(f"Make sure the Second Brain backend is running at {API_BASE_URL}")
        sys.exit(1)


def poll_status(session_token: str) -> dict:
    """Poll for authentication status."""
    try:
        response = httpx.get(f"{API_BASE_URL}/api/v1/cli-auth/status/{session_token}")
        response.raise_for_status()
        return response.json()
    except httpx.HTTPError as e:
        print(f"Error polling status: {e}")
        return {"status": "error"}


def save_credentials(api_key: str, user_email: str):
    """Save the API key to credentials file."""
    CREDENTIALS_FILE.parent.mkdir(parents=True, exist_ok=True)

    credentials = {
        "api_key": api_key,
        "user_email": user_email,
        "api_url": API_BASE_URL,
    }

    with open(CREDENTIALS_FILE, "w") as f:
        json.dump(credentials, f, indent=2)

    # Secure the file
    os.chmod(CREDENTIALS_FILE, 0o600)

    print(f"\n✅ Credentials saved to: {CREDENTIALS_FILE}")


def update_claude_settings(api_key: str):
    """Update Claude Code settings with the new API key."""
    claude_settings_path = Path.home() / ".claude" / "settings.json"

    if not claude_settings_path.exists():
        print(f"\n⚠️  Claude Code settings not found at {claude_settings_path}")
        print("   You may need to manually configure the API key.")
        return

    try:
        with open(claude_settings_path, "r") as f:
            settings = json.load(f)

        # Update the API key in MCP server config
        if "mcpServers" in settings and "second-brain" in settings["mcpServers"]:
            if "env" not in settings["mcpServers"]["second-brain"]:
                settings["mcpServers"]["second-brain"]["env"] = {}
            settings["mcpServers"]["second-brain"]["env"]["SECOND_BRAIN_API_KEY"] = api_key

            with open(claude_settings_path, "w") as f:
                json.dump(settings, f, indent=2)

            print(f"✅ Updated Claude Code settings with your API key")
            print("\n⚠️  Please restart Claude Code for changes to take effect.")
        else:
            print("\n⚠️  Second Brain MCP server not configured in Claude Code.")
            print("   Run ./setup.sh to configure it.")

    except Exception as e:
        print(f"\n⚠️  Could not update Claude settings: {e}")
        print(f"   API Key: {api_key}")
        print("   Please update manually if needed.")


def main():
    print_banner()

    # Step 1: Initiate authentication
    print("📡 Initiating authentication...")
    auth_data = initiate_auth()

    session_token = auth_data["session_token"]
    auth_url = auth_data["auth_url"]
    expires_in = auth_data["expires_in"]

    print(f"✅ Session created (expires in {expires_in // 60} minutes)")

    # Step 2: Open browser
    print(f"\n🌐 Opening browser for login...")
    print(f"   URL: {auth_url}")

    try:
        webbrowser.open(auth_url)
        print("   Browser opened. Please log in to continue.")
    except Exception:
        print(f"\n⚠️  Could not open browser automatically.")
        print(f"   Please open this URL manually:\n")
        print(f"   {auth_url}\n")

    # Step 3: Poll for completion
    print("\n⏳ Waiting for authentication...")
    print("   (Press Ctrl+C to cancel)\n")

    start_time = time.time()

    try:
        while time.time() - start_time < MAX_POLL_TIME:
            status = poll_status(session_token)

            if status["status"] == "completed":
                api_key = status.get("api_key")
                user_email = status.get("user_email")

                print("\n" + "=" * 60)
                print("  🎉 Authentication Successful!")
                print("=" * 60)
                print(f"\n   Logged in as: {user_email}")

                # Save credentials
                save_credentials(api_key, user_email)

                # Update Claude settings
                update_claude_settings(api_key)

                print("\n" + "=" * 60)
                print("  You're all set! Second Brain will now capture your learnings.")
                print("=" * 60 + "\n")
                return 0

            elif status["status"] == "expired":
                print("\n❌ Session expired. Please try again.")
                return 1

            elif status["status"] == "error":
                print("\n❌ Authentication error. Please try again.")
                return 1

            # Still pending, wait and poll again
            sys.stdout.write(".")
            sys.stdout.flush()
            time.sleep(POLL_INTERVAL)

        print("\n\n❌ Authentication timed out. Please try again.")
        return 1

    except KeyboardInterrupt:
        print("\n\n⚠️  Authentication cancelled.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
