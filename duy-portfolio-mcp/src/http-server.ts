#!/usr/bin/env node

/**
 * HTTP Server for Portfolio MCP Tools
 *
 * Exposes the same tools as the MCP server via REST API
 * for use by the web portfolio chatbot.
 *
 * Usage: node dist/http-server.js [--port 3001]
 */

import http from "http";
import { TOOL_DEFINITIONS, executeTool, type ToolInput } from "./tools/handlers.js";

const PORT = parseInt(process.env.MCP_HTTP_PORT || "3001", 10);
const HOST = process.env.MCP_HTTP_HOST || "0.0.0.0";

// CORS headers for cross-origin requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

// Parse JSON body from request
async function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

// Request handler
async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const path = url.pathname;

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  // Health check
  if (path === "/health" || path === "/") {
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({
      status: "ok",
      service: "duy-portfolio-mcp",
      version: "1.0.0",
      endpoints: {
        tools: "/tools",
        execute: "/execute",
        health: "/health",
      },
    }));
    return;
  }

  // List available tools
  if (path === "/tools" && req.method === "GET") {
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({
      tools: TOOL_DEFINITIONS,
      usage: "POST /execute with { tool: 'tool_name', args: { ... } }",
    }));
    return;
  }

  // Execute a tool
  if (path === "/execute" && req.method === "POST") {
    try {
      const body = await parseBody(req) as { tool?: string; args?: ToolInput };

      if (!body.tool) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: "Missing 'tool' field" }));
        return;
      }

      const result = executeTool(body.tool, body.args || {});

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({
        tool: body.tool,
        result,
        timestamp: new Date().toISOString(),
      }));
      return;
    } catch (e) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: String(e) }));
      return;
    }
  }

  // Shorthand endpoints for each tool
  const toolMatch = path.match(/^\/tool\/([a-z_]+)$/);
  if (toolMatch && req.method === "POST") {
    const toolName = toolMatch[1];

    if (!TOOL_DEFINITIONS.find(t => t.name === toolName)) {
      res.writeHead(404, corsHeaders);
      res.end(JSON.stringify({ error: `Unknown tool: ${toolName}` }));
      return;
    }

    try {
      const args = await parseBody(req) as ToolInput;
      const result = executeTool(toolName, args);

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({
        tool: toolName,
        result,
        timestamp: new Date().toISOString(),
      }));
      return;
    } catch (e) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: String(e) }));
      return;
    }
  }

  // 404 for unknown routes
  res.writeHead(404, corsHeaders);
  res.end(JSON.stringify({ error: "Not found" }));
}

// Create and start server
const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(err => {
    console.error("Request error:", err);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ error: "Internal server error" }));
  });
});

server.listen(PORT, HOST, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║           Duy Portfolio MCP HTTP Server                    ║
╠════════════════════════════════════════════════════════════╣
║  Server running at: http://${HOST}:${PORT}                    ║
║                                                            ║
║  Endpoints:                                                ║
║    GET  /           - Health check & info                  ║
║    GET  /tools      - List available tools                 ║
║    POST /execute    - Execute a tool                       ║
║    POST /tool/:name - Execute tool by name                 ║
║                                                            ║
║  Example:                                                  ║
║    curl -X POST http://localhost:${PORT}/execute \\          ║
║      -H "Content-Type: application/json" \\                 ║
║      -d '{"tool":"get_portfolio_overview","args":{}}'      ║
╚════════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  server.close(() => process.exit(0));
});
