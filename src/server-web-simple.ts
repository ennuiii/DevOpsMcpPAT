#!/usr/bin/env node

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import express from "express";
import cors from "cors";
import * as azdev from "azure-devops-node-api";
import { IRequestHandler } from "azure-devops-node-api/interfaces/common/VsoBaseInterfaces.js";

import { packageVersion } from "./version.js";
import { comprehensiveToolsComplete, ComprehensiveTool } from "./comprehensive-tools-complete.js";

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

// Azure DevOps Client
let azureDevOpsClient: azdev.WebApi;

async function getAzureDevOpsClient(): Promise<azdev.WebApi> {
  if (!azureDevOpsClient) {
    const authHandler = new PatAuthHandler(AZURE_DEVOPS_PAT!);
    azureDevOpsClient = new azdev.WebApi(orgUrl, authHandler, undefined, {
      productName: "AzureDevOps.MCP.Web",
      productVersion: packageVersion,
    });
  }
  return azureDevOpsClient;
}

// Comprehensive tools without problematic imports
const allTools: ComprehensiveTool[] = comprehensiveToolsComplete;

// Tool utilities with ultra-minimal optimization
function getToolsForMcp() {
  return allTools.map(tool => {
    // No description at all for maximum optimization
    const shortDesc = "";
    
    // Ultra-minimal schema with only essential MCP properties
    const optimizedSchema = {
      type: tool.inputSchema.type,
      properties: Object.fromEntries(
        Object.entries(tool.inputSchema.properties || {}).map(([key, prop]) => [
          key, 
          {
            type: (prop as any).type,
            ...(((prop as any).enum) ? { enum: (prop as any).enum } : {}),
            ...(((prop as any).items) ? { items: (prop as any).items } : {})
          }
        ])
      ),
      ...(tool.inputSchema.required ? { required: tool.inputSchema.required } : {})
    };
    
    return {
      name: tool.name,
      description: shortDesc,
      inputSchema: optimizedSchema
    };
  });
}

// Execute a tool by name with provided args using the shared WebApi connection
async function executeToolByName(name: string, args: any) {
  const tool = getTool(name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  const client = await getAzureDevOpsClient();
  const result = await tool.handler(args || {}, client);

  // Normalize result for HTTP/MCP responses
  if (typeof result === "string") {
    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
    };
  }
  return result;
}

// Token counting utility
function getTokenCount(text: string): number {
  // Rough approximation: ~4 characters per token
  return Math.ceil(text.length / 4);
}

function getTool(name: string): ComprehensiveTool | undefined {
  return allTools.find(tool => tool.name === name);
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

// SSE endpoint for MCP connection establishment
app.get("/sse", (req, res) => {
  const connectTime = Date.now();
  console.log("📡 SSE connection requested");
  
  // Set comprehensive SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  });

  // Generate session ID
  const sessionId = Math.random().toString(36).substring(2) + '-' + Date.now().toString(36);
  console.log(`🎬 SSE connection established with session: ${sessionId}`);

  // Send initial connection info
  res.write(`event: endpoint\n`);
  res.write(`data: /message?sessionId=${sessionId}\n\n`);

  // Send hello message
  const helloMessage = {
    jsonrpc: '2.0',
    method: 'hello',
    params: {
      sessionId: sessionId,
      serverName: 'azure-devops-mcp-pat',
      serverVersion: packageVersion
    },
    id: `hello-${Date.now()}`
  };
  res.write(`event: message\n`);
  res.write(`data: ${JSON.stringify(helloMessage)}\n\n`);

  // Heartbeat to keep connection alive (every 15s to prevent 60s timeouts)
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    } catch (error) {
      console.log('💔 Heartbeat failed, client disconnected');
      clearInterval(heartbeat);
    }
  }, 15000);

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    const duration = Date.now() - connectTime;
    console.log(`🔌 SSE client disconnected: ${sessionId} (lasted ${Math.round(duration/1000)}s)`);
  });
});

// POST /message endpoint for MCP JSON-RPC requests (AzureMcpProxy style)
app.post("/message", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  console.log(`📨 MCP JSON-RPC Request received on POST /message with session: ${sessionId}`);
  console.log("📝 Request body:", JSON.stringify(req.body));
  
  try {
    const mcpRequest = req.body;
    
    if (!mcpRequest || !mcpRequest.jsonrpc) {
      console.log("❌ Invalid MCP request format");
      return res.status(400).json({
        jsonrpc: "2.0",
        id: mcpRequest?.id || null,
        error: {
          code: -32600,
          message: "Invalid Request"
        }
      });
    }
    
    // Handle error responses from client
    if (mcpRequest.error) {
      console.log("⚠️ Client sent error response:", mcpRequest.error);
      return res.json({
        jsonrpc: "2.0",
        id: mcpRequest.id,
        result: { acknowledged: true }
      });
    }
    
    if (!mcpRequest.method) {
      console.log("❌ Missing method in MCP request");
      return res.status(400).json({
        jsonrpc: "2.0",
        id: mcpRequest?.id || null,
        error: {
          code: -32600,
          message: "Missing method"
        }
      });
    }

    console.log(`🔧 Processing MCP method: ${mcpRequest.method}`);
    
    let response;
    
    if (mcpRequest.method === "initialize") {
      response = {
        jsonrpc: "2.0",
        id: mcpRequest.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
            transport: {
              name: "streamable-https",
              supported: true
            }
          },
          serverInfo: {
            name: "azure-devops-mcp-pat",
            version: packageVersion,
            transport: "streamable-https"
          }
        }
      };
    } else if (mcpRequest.method === "tools/list") {
      response = {
        jsonrpc: "2.0",
        id: mcpRequest.id,
        result: {
          tools: getToolsForMcp()
        }
      };
    } else if (mcpRequest.method === "tools/call") {
      const { name, arguments: args } = mcpRequest.params;
      
      try {
        console.log(`🎯 Calling tool: ${name} with args:`, args);
        
        // Find and execute the tool
        const tool = getTool(name);
        if (!tool) {
          throw new Error(`Tool ${name} not found`);
        }
        
        const connection = await getAzureDevOpsClient();
        const result = await tool.handler(args, connection);
        
        // Handle both new Microsoft format and legacy string format
        if (typeof result === 'string') {
          response = {
            jsonrpc: "2.0",
            id: mcpRequest.id,
            result: {
              content: [{
                type: "text",
                text: result
              }]
            }
          };
        } else {
          // Microsoft format with structured content and isError
          response = {
            jsonrpc: "2.0",
            id: mcpRequest.id,
            result: result.isError ? undefined : result,
            error: result.isError ? {
              code: -32603,
              message: "Tool execution error",
              data: result.content[0]?.text || "Unknown error"
            } : undefined
          };
        }
      } catch (error: any) {
        console.error("❌ Error executing tool:", error);
        response = {
          jsonrpc: "2.0",
          id: mcpRequest.id,
          error: {
            code: -32603,
            message: "Internal error executing tool",
            data: error instanceof Error ? error.message : String(error)
          }
        };
      }
    } else if (mcpRequest.method === "notifications/initialized") {
      console.log("🎬 Client initialized notification received");
      // Notifications don't need responses in MCP protocol
      return res.status(200).end();
    } else if (mcpRequest.method === "ping") {
      console.log("🏓 Ping request received");
      response = {
        jsonrpc: "2.0",
        id: mcpRequest.id,
        result: {
          timestamp: new Date().toISOString()
        }
      };
    } else if (mcpRequest.method === "hello") {
      console.log("👋 Hello request received");
      response = {
        jsonrpc: "2.0",
        id: mcpRequest.id,
        result: {
          serverName: "azure-devops-mcp-pat",
          serverVersion: packageVersion,
          transport: "streamable-https"
        }
      };
    } else {
      response = {
        jsonrpc: "2.0",
        id: mcpRequest.id,
        error: {
          code: -32601,
          message: "Method not found"
        }
      };
    }

    const responseStr = JSON.stringify(response);
    const tokenCount = getTokenCount(responseStr);
    const sizeBytes = Buffer.byteLength(responseStr, 'utf8');
    
    // Detailed breakdown for tools/list responses
    if (mcpRequest.method === "tools/list" && response.result?.tools) {
      const tools = response.result.tools;
      const descriptionsOnly = tools.map(t => t.description).join('');
      const descriptionsSize = Buffer.byteLength(descriptionsOnly, 'utf8');
      const schemasOnly = JSON.stringify(tools.map(t => t.inputSchema));
      const schemasSize = Buffer.byteLength(schemasOnly, 'utf8');
      const namesOnly = tools.map(t => t.name).join('');
      const namesSize = Buffer.byteLength(namesOnly, 'utf8');
      
      console.log(`📤 MCP Response [${sizeBytes}B, ~${tokenCount}t] BREAKDOWN:`);
      console.log(`  📝 Descriptions: ${descriptionsSize}B (~${getTokenCount(descriptionsOnly)}t, ${Math.round(descriptionsSize/sizeBytes*100)}%)`);
      console.log(`  🔧 Schemas: ${schemasSize}B (~${getTokenCount(schemasOnly)}t, ${Math.round(schemasSize/sizeBytes*100)}%)`);
      console.log(`  🏷️ Names: ${namesSize}B (~${getTokenCount(namesOnly)}t, ${Math.round(namesSize/sizeBytes*100)}%)`);
      console.log(`  📦 Other (JSON structure): ${sizeBytes - descriptionsSize - schemasSize - namesSize}B`);
      console.log(`  📊 Total tools: ${tools.length}`);
    } else {
      console.log(`📤 MCP Response [${sizeBytes}B, ~${tokenCount}t]:`, responseStr.length > 200 ? responseStr.substring(0, 200) + '...' : responseStr);
    }
    res.json(response);
    
  } catch (error: any) {
    console.error("❌ Error processing MCP request:", error);
    res.status(500).json({
      jsonrpc: "2.0",
      id: req.body?.id || null,
      error: {
        code: -32603,
        message: "Internal error"
      }
    });
  }
});

// POST /sse endpoint for MCP JSON-RPC requests (Cursor/MCP client style)
app.post("/sse", async (req, res) => {
  console.log("📨 MCP JSON-RPC Request received on POST /sse");
  console.log("📝 Request body:", JSON.stringify(req.body));
  
  try {
    const mcpRequest = req.body;
    
    if (!mcpRequest || !mcpRequest.jsonrpc) {
      console.log("❌ Invalid MCP request format");
      return res.status(400).json({
        jsonrpc: "2.0",
        id: mcpRequest?.id || null,
        error: {
          code: -32600,
          message: "Invalid Request"
        }
      });
    }
    
    // Handle error responses from client
    if (mcpRequest.error) {
      console.log("⚠️ Client sent error response:", mcpRequest.error);
      return res.json({
        jsonrpc: "2.0",
        id: mcpRequest.id,
        result: { acknowledged: true }
      });
    }
    
    if (!mcpRequest.method) {
      console.log("❌ Missing method in MCP request");
      return res.status(400).json({
        jsonrpc: "2.0",
        id: mcpRequest?.id || null,
        error: {
          code: -32600,
          message: "Missing method"
        }
      });
    }

    console.log(`🔧 Processing MCP method: ${mcpRequest.method}`);
    
    let response;
    
    if (mcpRequest.method === "initialize") {
      response = {
        jsonrpc: "2.0",
        id: mcpRequest.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
            transport: {
              name: "streamable-https",
              supported: true
            }
          },
          serverInfo: {
            name: "azure-devops-mcp-pat",
            version: packageVersion,
            transport: "streamable-https"
          }
        }
      };
    } else if (mcpRequest.method === "tools/list") {
      response = {
        jsonrpc: "2.0",
        id: mcpRequest.id,
        result: {
          tools: getToolsForMcp()
        }
      };
    } else if (mcpRequest.method === "tools/call") {
      const { name, arguments: args } = mcpRequest.params;
      
      try {
        console.log(`🎯 Calling tool: ${name} with args:`, args);
        
        // Find and execute the tool
        const tool = getTool(name);
        if (!tool) {
          throw new Error(`Tool ${name} not found`);
        }
        
        const connection = await getAzureDevOpsClient();
        const result = await tool.handler(args, connection);
        
        // Handle both new Microsoft format and legacy string format
        if (typeof result === 'string') {
          response = {
            jsonrpc: "2.0",
            id: mcpRequest.id,
            result: {
              content: [{
                type: "text",
                text: result
              }]
            }
          };
        } else {
          // Microsoft format with structured content and isError
          response = {
            jsonrpc: "2.0",
            id: mcpRequest.id,
            result: result.isError ? undefined : result,
            error: result.isError ? {
              code: -32603,
              message: "Tool execution error",
              data: result.content[0]?.text || "Unknown error"
            } : undefined
          };
        }
      } catch (error: any) {
        console.error("❌ Error executing tool:", error);
        response = {
          jsonrpc: "2.0",
          id: mcpRequest.id,
          error: {
            code: -32603,
            message: "Internal error executing tool",
            data: error instanceof Error ? error.message : String(error)
          }
        };
      }
    } else if (mcpRequest.method === "notifications/initialized") {
      console.log("🎬 Client initialized notification received");
      // Notifications don't need responses in MCP protocol
      return res.status(200).end();
    } else if (mcpRequest.method === "ping") {
      console.log("🏓 Ping request received");
      response = {
        jsonrpc: "2.0",
        id: mcpRequest.id,
        result: {
          timestamp: new Date().toISOString()
        }
      };
    } else if (mcpRequest.method === "hello") {
      console.log("👋 Hello request received");
      response = {
        jsonrpc: "2.0",
        id: mcpRequest.id,
        result: {
          serverName: "azure-devops-mcp-pat",
          serverVersion: packageVersion,
          transport: "streamable-https"
        }
      };
    } else {
      response = {
        jsonrpc: "2.0",
        id: mcpRequest.id,
        error: {
          code: -32601,
          message: "Method not found"
        }
      };
    }

    const responseStr = JSON.stringify(response);
    const tokenCount = getTokenCount(responseStr);
    const sizeBytes = Buffer.byteLength(responseStr, 'utf8');
    
    // Detailed breakdown for tools/list responses
    if (mcpRequest.method === "tools/list" && response.result?.tools) {
      const tools = response.result.tools;
      const descriptionsOnly = tools.map(t => t.description).join('');
      const descriptionsSize = Buffer.byteLength(descriptionsOnly, 'utf8');
      const schemasOnly = JSON.stringify(tools.map(t => t.inputSchema));
      const schemasSize = Buffer.byteLength(schemasOnly, 'utf8');
      const namesOnly = tools.map(t => t.name).join('');
      const namesSize = Buffer.byteLength(namesOnly, 'utf8');
      
      console.log(`📤 MCP Response [${sizeBytes}B, ~${tokenCount}t] BREAKDOWN:`);
      console.log(`  📝 Descriptions: ${descriptionsSize}B (~${getTokenCount(descriptionsOnly)}t, ${Math.round(descriptionsSize/sizeBytes*100)}%)`);
      console.log(`  🔧 Schemas: ${schemasSize}B (~${getTokenCount(schemasOnly)}t, ${Math.round(schemasSize/sizeBytes*100)}%)`);
      console.log(`  🏷️ Names: ${namesSize}B (~${getTokenCount(namesOnly)}t, ${Math.round(namesSize/sizeBytes*100)}%)`);
      console.log(`  📦 Other (JSON structure): ${sizeBytes - descriptionsSize - schemasSize - namesSize}B`);
      console.log(`  📊 Total tools: ${tools.length}`);
    } else {
      console.log(`📤 MCP Response [${sizeBytes}B, ~${tokenCount}t]:`, responseStr.length > 200 ? responseStr.substring(0, 200) + '...' : responseStr);
    }
    res.json(response);
    
  } catch (error: any) {
    console.error("❌ Error processing MCP request:", error);
    res.status(500).json({
      jsonrpc: "2.0",
      id: req.body?.id || null,
      error: {
        code: -32603,
        message: "Internal error"
      }
    });
  }
});

// List available tools endpoint (all tools)
app.get("/api/tools", (req, res) => {
  res.json({
    success: true,
    tools: getToolsForMcp(),
  });
});

// Execute any tool by name via REST
app.post("/api/tools/:toolName", async (req, res) => {
  try {
    const toolName = req.params.toolName;
    const args = req.body || {};
    const result = await executeToolByName(toolName, args);
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || String(error) });
  }
});

// MCP JSON-RPC endpoint
app.post("/mcp", async (req, res) => {
  try {
    const request = req.body;
    
    if (!request.jsonrpc || request.jsonrpc !== "2.0") {
      return res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32600, message: "Invalid Request" },
        id: request.id || null
      });
    }

    // Treat JSON-RPC notifications (no id) as fire-and-forget
    if (request && !Object.prototype.hasOwnProperty.call(request, "id")) {
      if (typeof request.method === "string" && request.method.startsWith("notifications/")) {
        // No JSON-RPC response for notifications
        return res.status(204).end();
      }
    }

    // Handle initialize request
    if (request.method === "initialize") {
      const response = {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: (request.params && request.params.protocolVersion) || "2024-11-05",
          capabilities: {
            tools: {
              listChanged: true
            },
            transport: {
              name: "streamable-https",
              supported: true
            }
          },
          serverInfo: {
            name: "Azure DevOps MCP Server (PAT)",
            version: packageVersion,
            transport: "streamable-https"
          }
        }
      };
      return res.json(response);
    }

    // Handle tools/list request
    if (request.method === "tools/list") {
      const response = {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          tools: getToolsForMcp()
        }
      };
      return res.json(response);
    }

    // Handle tools/call request (generic dispatcher for all tools)
    if (request.method === "tools/call") {
      try {
        const { name, arguments: args } = request.params || {};
        if (!name) {
          return res.json({
            jsonrpc: "2.0",
            id: request.id,
            error: { code: -32602, message: "Missing tool name" },
          });
        }
        const result = await executeToolByName(name, args);
        return res.json({ jsonrpc: "2.0", id: request.id, result });
      } catch (error: any) {
        return res.json({
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32000, message: error?.message || "Tool execution failed" },
        });
      }
    }

    // Method not found
    const response = {
      jsonrpc: "2.0",
      id: request.id,
      error: { code: -32601, message: "Method not found" }
    };
    return res.json(response);

  } catch (error: any) {
    console.error("Error handling MCP request:", error);
    const response = {
      jsonrpc: "2.0",
      id: req.body.id || null,
      error: { code: -32603, message: "Internal error" }
    };
    return res.status(500).json(response);
  }
});

// Compatibility alias: some MCP proxies may POST to /sse with JSON-RPC
// Treat it the same as /mcp for initialize/tools/list/tools/call
app.post("/sse", async (req, res) => {
  try {
    const request = req.body;
    if (!request?.jsonrpc) {
      return res.status(400).json({
        jsonrpc: "2.0",
        id: request?.id || null,
        error: { code: -32600, message: "Invalid Request" },
      });
    }

    // Notifications: no response body
    if (request && !Object.prototype.hasOwnProperty.call(request, "id")) {
      if (typeof request.method === "string" && request.method.startsWith("notifications/")) {
        return res.status(204).end();
      }
    }

    if (request.method === "initialize") {
      return res.json({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: (request.params && request.params.protocolVersion) || "2024-11-05",
          capabilities: {
            tools: { listChanged: true },
            transport: { name: "streamable-https", supported: true },
          },
          serverInfo: {
            name: "Azure DevOps MCP Server (PAT)",
            version: packageVersion,
            transport: "streamable-https",
          },
        },
      });
    }

    if (request.method === "tools/list") {
      return res.json({ jsonrpc: "2.0", id: request.id, result: { tools: getToolsForMcp() } });
    }

    if (request.method === "tools/call") {
      try {
        const { name, arguments: args } = request.params || {};
        if (!name) {
          return res.json({ jsonrpc: "2.0", id: request.id, error: { code: -32602, message: "Missing tool name" } });
        }
        const result = await executeToolByName(name, args);
        return res.json({ jsonrpc: "2.0", id: request.id, result });
      } catch (error: any) {
        return res.json({ jsonrpc: "2.0", id: request.id, error: { code: -32000, message: error?.message || "Tool execution failed" } });
      }
    }

    return res.json({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } });
  } catch (error: any) {
    return res.status(500).json({ jsonrpc: "2.0", id: req.body?.id || null, error: { code: -32603, message: "Internal error" } });
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
      mcp: "POST /mcp - MCP JSON-RPC 2.0 endpoint",
      mcpAlias: "POST /sse - JSON-RPC alias for some MCP proxies",
      tools: "GET /api/tools - List available tools",
      callTool: "POST /api/tools/{toolName} - Execute tool by name"
    },
    documentation: "Azure DevOps MCP Server with both HTTP API and MCP protocol support"
  });
});

// Start server
async function startServer() {
  try {
    // Test connection
    console.log("🚀 Initializing Azure DevOps MCP Server...");
    console.log(`📋 Organization: ${orgName}`);
    console.log(`🔑 PAT Token: ${AZURE_DEVOPS_PAT!.substring(0, 10)}...`);

    console.log("🔍 Testing Azure DevOps connection...");
    const client = await getAzureDevOpsClient();
    const coreApi = await client.getCoreApi();
    const projects = await coreApi.getProjects();
    console.log(`✅ Connected successfully! Found ${projects.length} project(s)`);
    
    app.listen(PORT, () => {
      console.log(`🌐 Azure DevOps MCP Server running on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
      console.log(`🔧 API tools: http://localhost:${PORT}/api/tools`);
    });
  } catch (error: any) {
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
