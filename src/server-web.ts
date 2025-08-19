#!/usr/bin/env node

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as azdev from "azure-devops-node-api";
import { IRequestHandler } from "azure-devops-node-api/interfaces/common/VsoBaseInterfaces.js";

import { configurePrompts } from "./prompts.js";
import { configureAllTools } from "./tools.js";
import { UserAgentComposer } from "./useragent.js";
import { packageVersion } from "./version.js";

// Environment variables
const PORT = process.env.PORT || 3000;
const AZURE_DEVOPS_ORG = process.env.AZURE_DEVOPS_ORG;
const AZURE_DEVOPS_PAT = process.env.AZURE_DEVOPS_PAT;

if (!AZURE_DEVOPS_ORG) {
  console.error("❌ AZURE_DEVOPS_ORG environment variable is required");
  process.exit(1);
}

if (!AZURE_DEVOPS_PAT) {
  console.error("❌ AZURE_DEVOPS_PAT environment variable is required");
  process.exit(1);
}

export const orgName = AZURE_DEVOPS_ORG;
const orgUrl = "https://dev.azure.com/" + orgName;

// PAT Token Authentication Handler
class PatAuthHandler implements IRequestHandler {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  prepareRequest(options: any): void {
    options.headers = options.headers || {};
    options.headers["Authorization"] = `Basic ${Buffer.from(`:${this.token}`).toString("base64")}`;
  }

  canHandleAuthentication(response: any): boolean {
    return response.statusCode === 401;
  }

  handleAuthentication(httpClient: any, requestInfo: any, data: any): Promise<any> {
    return Promise.reject(new Error("Authentication failed. Please check your PAT token."));
  }
}

async function getAzureDevOpsToken(): Promise<{ token: string; expiresOnTimestamp: number }> {
  // PAT tokens don't expire in the same way as OAuth tokens, so we set a far future date
  return { 
    token: AZURE_DEVOPS_PAT,
    expiresOnTimestamp: Date.now() + (365 * 24 * 60 * 60 * 1000) // 1 year from now
  };
}

function getAzureDevOpsClient(userAgentComposer: UserAgentComposer): () => Promise<azdev.WebApi> {
  return async () => {
    const authHandler = new PatAuthHandler(AZURE_DEVOPS_PAT);
    const connection = new azdev.WebApi(orgUrl, authHandler, undefined, {
      productName: "AzureDevOps.MCP.Web",
      productVersion: packageVersion,
      userAgent: userAgentComposer.userAgent,
    });
    return connection;
  };
}

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    version: packageVersion,
    organization: orgName,
    timestamp: new Date().toISOString()
  });
});

// MCP Server instance
let mcpServer: McpServer;
let isInitialized = false;

// Initialize MCP Server
async function initializeMCPServer() {
  if (isInitialized) return mcpServer;

  try {
    console.log("🚀 Initializing Azure DevOps MCP Server...");
    console.log(`📋 Organization: ${orgName}`);
    console.log(`🔑 PAT Token: ${AZURE_DEVOPS_PAT.substring(0, 10)}...`);

    mcpServer = new McpServer({
      name: "Azure DevOps MCP Server (Web)",
      version: packageVersion,
    });

    const userAgentComposer = new UserAgentComposer(packageVersion);

    configurePrompts(mcpServer);
    configureAllTools(mcpServer, getAzureDevOpsToken, getAzureDevOpsClient(userAgentComposer), () => userAgentComposer.userAgent);

    // Test connection
    console.log("🔍 Testing Azure DevOps connection...");
    const testConnection = await getAzureDevOpsClient(userAgentComposer)();
    const coreApi = await testConnection.getCoreApi();
    const projects = await coreApi.getProjects();
    console.log(`✅ Connected successfully! Found ${projects.length} project(s)`);

    isInitialized = true;
    return mcpServer;
  } catch (error) {
    console.error("❌ Failed to initialize MCP Server:", error.message);
    throw error;
  }
}

// MCP JSON-RPC endpoint
app.post("/mcp", async (req, res) => {
  try {
    const server = await initializeMCPServer();
    
    // Handle JSON-RPC request
    const request = req.body;
    
    if (!request.jsonrpc || request.jsonrpc !== "2.0") {
      return res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32600, message: "Invalid Request" },
        id: request.id || null
      });
    }

    // Create a mock transport for handling the request
    const mockTransport = {
      onData: null,
      write: (data: string) => {
        const response = JSON.parse(data);
        res.json(response);
      },
      close: () => {},
      onClose: null,
      onError: null
    };

    // Process the request through the MCP server
    if (request.method === "initialize") {
      const response = {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: {
            prompts: { listChanged: true },
            completions: {},
            tools: { listChanged: true }
          },
          serverInfo: {
            name: "Azure DevOps MCP Server (Web)",
            version: packageVersion
          }
        }
      };
      return res.json(response);
    }

    if (request.method === "tools/list") {
      // Get tools from the server
      const tools = await server.listTools();
      const response = {
        jsonrpc: "2.0",
        id: request.id,
        result: { tools }
      };
      return res.json(response);
    }

    if (request.method === "tools/call") {
      const { name, arguments: args } = request.params;
      try {
        const result = await server.callTool(name, args || {});
        const response = {
          jsonrpc: "2.0",
          id: request.id,
          result
        };
        return res.json(response);
      } catch (error) {
        const response = {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32000,
            message: error.message || "Tool execution failed"
          }
        };
        return res.json(response);
      }
    }

    // Method not found
    const response = {
      jsonrpc: "2.0",
      id: request.id,
      error: { code: -32601, message: "Method not found" }
    };
    return res.json(response);

  } catch (error) {
    console.error("Error handling MCP request:", error);
    const response = {
      jsonrpc: "2.0",
      id: req.body.id || null,
      error: { code: -32603, message: "Internal error" }
    };
    return res.status(500).json(response);
  }
});

// API endpoint to list available tools
app.get("/api/tools", async (req, res) => {
  try {
    const server = await initializeMCPServer();
    const tools = await server.listTools();
    res.json({
      success: true,
      count: tools.length,
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API endpoint to call a specific tool
app.post("/api/tools/:toolName", async (req, res) => {
  try {
    const server = await initializeMCPServer();
    const { toolName } = req.params;
    const args = req.body;

    const result = await server.callTool(toolName, args);
    res.json({
      success: true,
      result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Root endpoint with API documentation
app.get("/", (req, res) => {
  res.json({
    name: "Azure DevOps MCP Server (Web)",
    version: packageVersion,
    organization: orgName,
    endpoints: {
      health: "GET /health - Health check",
      mcp: "POST /mcp - JSON-RPC 2.0 endpoint for MCP protocol",
      tools: "GET /api/tools - List available tools",
      callTool: "POST /api/tools/{toolName} - Call a specific tool"
    },
    documentation: "See https://github.com/microsoft/azure-devops-mcp for more information"
  });
});

// Start server
async function startServer() {
  try {
    // Initialize MCP server at startup
    await initializeMCPServer();
    
    app.listen(PORT, () => {
      console.log(`🌐 Azure DevOps MCP Server running on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
      console.log(`🔧 API tools: http://localhost:${PORT}/api/tools`);
      console.log(`📡 MCP endpoint: http://localhost:${PORT}/mcp`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 Received SIGINT, shutting down gracefully");
  process.exit(0);
});

startServer().catch((error) => {
  console.error("❌ Fatal error starting server:", error);
  process.exit(1);
});