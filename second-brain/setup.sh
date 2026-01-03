#!/bin/bash
#
# Second Brain Setup Script
#
# This script sets up Second Brain for use with Claude Code.
# Run this once to configure everything.
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/venv"
CLAUDE_SETTINGS="$HOME/.claude/settings.json"

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║              🧠 Second Brain Setup                            ║"
echo "║                                                               ║"
echo "║   AI-Powered Knowledge Retention for Claude Code              ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Step 1: Check prerequisites
echo -e "${YELLOW}Step 1: Checking prerequisites...${NC}"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker is not installed. Please install Docker first.${NC}"
    echo "  Visit: https://docs.docker.com/get-docker/"
    exit 1
fi
echo -e "${GREEN}✓ Docker installed${NC}"

# Check Docker is running
if ! docker info &> /dev/null; then
    echo -e "${RED}✗ Docker is not running. Please start Docker.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker is running${NC}"

# Check Node.js (for frontend)
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}⚠ Node.js not found. Frontend won't be available locally.${NC}"
else
    echo -e "${GREEN}✓ Node.js installed${NC}"
fi

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}✗ Python 3 is not installed.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Python 3 installed${NC}"

# Step 2: Start Docker services
echo ""
echo -e "${YELLOW}Step 2: Starting Docker services...${NC}"
cd "$SCRIPT_DIR"

docker-compose up -d 2>&1 | grep -E "(Creating|Starting|Started|Running)" || true
sleep 5

# Check if services are healthy
if curl -s http://localhost:8000/health | grep -q "healthy"; then
    echo -e "${GREEN}✓ Backend API is running${NC}"
else
    echo -e "${YELLOW}⏳ Waiting for backend to start...${NC}"
    sleep 10
    if curl -s http://localhost:8000/health | grep -q "healthy"; then
        echo -e "${GREEN}✓ Backend API is running${NC}"
    else
        echo -e "${RED}✗ Backend failed to start. Check: docker-compose logs api${NC}"
        exit 1
    fi
fi

# Step 3: Setup Python virtual environment for MCP server
echo ""
echo -e "${YELLOW}Step 3: Setting up MCP server environment...${NC}"

if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
fi

echo "Installing MCP dependencies..."
"$VENV_DIR/bin/pip" install -q mcp httpx python-dotenv 2>&1 | tail -1 || true
echo -e "${GREEN}✓ MCP server dependencies installed${NC}"

# Step 4: Start frontend (if Node.js available)
echo ""
echo -e "${YELLOW}Step 4: Starting frontend...${NC}"

if command -v node &> /dev/null; then
    cd "$FRONTEND_DIR"
    if [ ! -d "node_modules" ]; then
        echo "Installing frontend dependencies..."
        npm install --silent 2>&1 | tail -1 || true
    fi

    # Check if frontend is already running
    if curl -s http://localhost:5173 &> /dev/null; then
        echo -e "${GREEN}✓ Frontend already running at http://localhost:5173${NC}"
    else
        echo "Starting frontend dev server..."
        npm run dev &> /dev/null &
        sleep 3
        echo -e "${GREEN}✓ Frontend started at http://localhost:5173${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Skipping frontend (Node.js not installed)${NC}"
fi

# Step 5: User registration
echo ""
echo -e "${YELLOW}Step 5: Account setup...${NC}"
echo ""
echo -e "${BLUE}Please register or login to Second Brain:${NC}"
echo ""
echo "  1. Open: ${GREEN}http://localhost:5173${NC}"
echo "  2. Click 'Create account' if you're new"
echo "  3. Login with your credentials"
echo ""

# Open browser
if command -v open &> /dev/null; then
    open "http://localhost:5173" 2>/dev/null || true
elif command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:5173" 2>/dev/null || true
fi

# Wait for user
read -p "Press Enter after you've registered/logged in..."

# Step 6: Get API key from user
echo ""
echo -e "${YELLOW}Step 6: Configure Claude Code...${NC}"
echo ""
echo -e "${BLUE}For now, we'll use the default development API key.${NC}"
echo "(In production, you'd generate a personal API key from the dashboard)"
echo ""

API_KEY="sb-mcp-dev-key-change-in-production"

# Step 7: Configure Claude Code settings
echo -e "${YELLOW}Step 7: Configuring Claude Code...${NC}"

# Create .claude directory if it doesn't exist
mkdir -p "$HOME/.claude"

# Backup existing settings
if [ -f "$CLAUDE_SETTINGS" ]; then
    cp "$CLAUDE_SETTINGS" "$CLAUDE_SETTINGS.backup"
    echo "Backed up existing settings to $CLAUDE_SETTINGS.backup"
fi

# Read existing settings or create new
if [ -f "$CLAUDE_SETTINGS" ]; then
    # Merge with existing settings using Python
    python3 << EOF
import json
import os

settings_path = "$CLAUDE_SETTINGS"
backend_dir = "$BACKEND_DIR"
venv_dir = "$VENV_DIR"
api_key = "$API_KEY"

# Read existing settings
with open(settings_path, 'r') as f:
    settings = json.load(f)

# Add/update Second Brain MCP server
if 'mcpServers' not in settings:
    settings['mcpServers'] = {}

settings['mcpServers']['second-brain'] = {
    "command": f"{venv_dir}/bin/python3",
    "args": [f"{backend_dir}/mcp_server.py"],
    "env": {
        "SECOND_BRAIN_API_URL": "http://localhost:8000",
        "SECOND_BRAIN_API_KEY": api_key
    }
}

# Add hooks for auto-capture
settings['hooks'] = {
    "PostToolUse": [{
        "matcher": "Edit|Bash",
        "command": f"{venv_dir}/bin/python3 {backend_dir}/hooks/auto_capture.py"
    }]
}

# Write updated settings
with open(settings_path, 'w') as f:
    json.dump(settings, f, indent=2)

print("Settings updated successfully!")
EOF
else
    # Create new settings file
    cat > "$CLAUDE_SETTINGS" << EOF
{
  "mcpServers": {
    "second-brain": {
      "command": "$VENV_DIR/bin/python3",
      "args": ["$BACKEND_DIR/mcp_server.py"],
      "env": {
        "SECOND_BRAIN_API_URL": "http://localhost:8000",
        "SECOND_BRAIN_API_KEY": "$API_KEY"
      }
    }
  },
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Bash",
      "command": "$VENV_DIR/bin/python3 $BACKEND_DIR/hooks/auto_capture.py"
    }]
  }
}
EOF
fi

echo -e "${GREEN}✓ Claude Code configured${NC}"

# Done!
echo ""
echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                                                               ║"
echo "║              ✅ Setup Complete!                               ║"
echo "║                                                               ║"
echo "╠═══════════════════════════════════════════════════════════════╣"
echo "║                                                               ║"
echo "║   To start using Second Brain:                                ║"
echo "║                                                               ║"
echo "║   1. Start (or restart) Claude Code:                          ║"
echo "║      $ claude                                                 ║"
echo "║                                                               ║"
echo "║   2. Ask Claude to capture learnings:                         ║"
echo "║      'Capture this: [your learning]'                          ║"
echo "║                                                               ║"
echo "║   3. Search your knowledge:                                   ║"
echo "║      'What do I know about [topic]?'                          ║"
echo "║                                                               ║"
echo "║   4. View in web dashboard:                                   ║"
echo "║      http://localhost:5173                                    ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo ""
echo -e "${YELLOW}Tip: Errors you fix will be auto-captured to your Second Brain!${NC}"
echo ""
