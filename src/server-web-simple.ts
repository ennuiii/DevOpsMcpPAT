#!/usr/bin/env node

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import express from "express";
import cors from "cors";
import * as azdev from "azure-devops-node-api";
import { IRequestHandler } from "azure-devops-node-api/interfaces/common/VsoBaseInterfaces.js";

import { packageVersion } from "./version.js";
import { ToolCollector } from "./tool-collector.js";
import { ToolDefinition } from "./tool-registry.js";

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

// Tool Registry Setup
const toolCollector = new ToolCollector();
let allTools: ToolDefinition[] = [];

// Providers for tool registration
const tokenProvider = async () => ({
  token: AZURE_DEVOPS_PAT!,
  expiresOnTimestamp: Date.now() + 3600000 // 1 hour from now
});

const connectionProvider = async () => getAzureDevOpsClient();

const userAgentProvider = () => `AzureDevOps.MCP.Web/${packageVersion}`;

// Initialize all tools
async function initializeTools() {
  console.log("🚀 Initializing comprehensive tool registry...");
  try {
    allTools = await toolCollector.collectAllTools(tokenProvider, connectionProvider, userAgentProvider);
    console.log(`✅ Successfully initialized ${allTools.length} tools`);
    console.log("📋 Available tools:", allTools.map(t => t.name).join(", "));
  } catch (error) {
    console.error("❌ Failed to initialize tools:", error);
    allTools = []; // Fallback to empty tools
  }
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

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    } catch (error) {
      console.log('💔 Heartbeat failed, client disconnected');
      clearInterval(heartbeat);
    }
  }, 30000);

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    console.log(`🔌 SSE client disconnected: ${sessionId}`);
  });
});

// POST /message endpoint for MCP JSON-RPC requests (AzureMcpProxy style)
app.post("/message", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  console.log(`📨 MCP JSON-RPC Request received on POST /message with session: ${sessionId}`);
  console.log("📝 Request body:", JSON.stringify(req.body, null, 2));
  
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
          tools: toolCollector.getToolsForMcp()
        }
      };
    } else if (mcpRequest.method === "tools/call") {
      const { name, arguments: args } = mcpRequest.params;
      
      try {
        console.log(`🎯 Calling tool: ${name} with args:`, args);
        
        // Find the tool in our registry
        const tool = toolCollector.getTool(name);
        if (!tool) {
          throw new Error(`Tool ${name} not found`);
        }
        
        // Execute the tool
        const connection = await getAzureDevOpsClient();
        const result = await tool.handler(args, connection);
        
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
      response = {
        jsonrpc: "2.0",
        id: mcpRequest.id,
        result: {}
      };
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

    console.log("📤 MCP Response:", JSON.stringify(response, null, 2));
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
  console.log("📝 Request body:", JSON.stringify(req.body, null, 2));
  
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
          tools: toolCollector.getToolsForMcp()
        }
      };
    } else if (mcpRequest.method === "tools/call") {
      const { name, arguments: args } = mcpRequest.params;
      
      try {
        console.log(`🎯 Calling tool: ${name} with args:`, args);
        
        // Find the tool in our registry
        const tool = toolCollector.getTool(name);
        if (!tool) {
          throw new Error(`Tool ${name} not found`);
        }
        
        // Execute the tool
        const connection = await getAzureDevOpsClient();
        const result = await tool.handler(args, connection);
        
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
      response = {
        jsonrpc: "2.0",
        id: mcpRequest.id,
        result: {}
      };
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

    console.log("📤 MCP Response:", JSON.stringify(response, null, 2));
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

// Get work item endpoint
app.post("/api/tools/wit_get_work_item", async (req, res) => {
  try {
    const { id, project } = req.body;
    
    if (!id) {
      return res.status(400).json({ error: "Work item ID is required" });
    }
    
    const client = await getAzureDevOpsClient();
    const witApi = await client.getWorkItemTrackingApi();
    const workItem = await witApi.getWorkItem(id);
    
    res.json({
      success: true,
      result: {
        content: [{
          type: "text",
          text: JSON.stringify({
            id: workItem.id,
            title: workItem.fields!["System.Title"],
            type: workItem.fields!["System.WorkItemType"],
            state: workItem.fields!["System.State"],
            assignedTo: workItem.fields!["System.AssignedTo"]?.displayName,
            createdDate: workItem.fields!["System.CreatedDate"],
            description: workItem.fields!["System.Description"]
          }, null, 2)
        }]
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// List projects endpoint
app.post("/api/tools/core_list_projects", async (req, res) => {
  try {
    const client = await getAzureDevOpsClient();
    const coreApi = await client.getCoreApi();
    const projects = await coreApi.getProjects();
    
    res.json({
      success: true,
      result: {
        content: [{
          type: "text",
          text: JSON.stringify(projects.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description,
            state: p.state
          })), null, 2)
        }]
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get builds endpoint
app.post("/api/tools/build_get_builds", async (req, res) => {
  try {
    const { project } = req.body;
    
    if (!project) {
      return res.status(400).json({ error: "Project name is required" });
    }
    
    const client = await getAzureDevOpsClient();
    const buildApi = await client.getBuildApi();
    const builds = await buildApi.getBuilds(project, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 10);
    
    res.json({
      success: true,
      result: {
        content: [{
          type: "text",
          text: JSON.stringify(builds.map(b => ({
            id: b.id,
            buildNumber: b.buildNumber,
            status: b.status,
            result: b.result,
            startTime: b.startTime,
            finishTime: b.finishTime
          })), null, 2)
        }]
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// List available tools endpoint
app.get("/api/tools", (req, res) => {
  res.json({
    success: true,
    tools: [
      {
        name: "wit_get_work_item",
        description: "Get a single work item by ID",
        parameters: ["id", "project?"]
      },
      {
        name: "core_list_projects",
        description: "List all projects in the organization",
        parameters: []
      },
      {
        name: "build_get_builds",
        description: "Get builds for a project",
        parameters: ["project"]
      }
    ]
  });
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

    // Handle initialize request
    if (request.method === "initialize") {
      const response = {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: "2024-11-05",
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
          tools: toolCollector.getToolsForMcp()
        }
      };
      return res.json(response);
    }

    // Handle tools/call request
    if (request.method === "tools/call") {
      const { name, arguments: args } = request.params;
      
      try {
        let result;
        
        if (name === "get_work_item") {
          const { workItemId } = args;
          if (!workItemId) {
            throw new Error("workItemId is required");
          }
          
          const client = await getAzureDevOpsClient();
          const witApi = await client.getWorkItemTrackingApi();
          const workItem = await witApi.getWorkItem(workItemId);
          
          result = {
            content: [{
              type: "text",
              text: `# Work Item ${workItem.id}: ${workItem.fields!["System.Title"]}\n\n` +
                    `**Type**: ${workItem.fields!["System.WorkItemType"]}\n` +
                    `**State**: ${workItem.fields!["System.State"]}\n` +
                    `**Assigned To**: ${workItem.fields!["System.AssignedTo"]?.displayName || "Unassigned"}\n` +
                    `**Created**: ${workItem.fields!["System.CreatedDate"]}`
            }]
          };
        } else if (name === "list_projects") {
          const client = await getAzureDevOpsClient();
          const coreApi = await client.getCoreApi();
          const projects = await coreApi.getProjects();
          
          const projectList = projects.map((project: any) => {
            return `- **${project.name}**: ${project.description || "No description"} (ID: ${project.id})`;
          }).join('\n');
          
          result = {
            content: [{
              type: "text",
              text: `# Projects (${projects.length})\n\n${projectList}`
            }]
          };
        } else if (name === "get_project") {
          const { projectId } = args;
          if (!projectId) {
            throw new Error("projectId is required");
          }
          
          const client = await getAzureDevOpsClient();
          const coreApi = await client.getCoreApi();
          const project = await coreApi.getProject(projectId);
          
          if (!project) {
            result = {
              content: [{
                type: "text",
                text: `Project ${projectId} not found.`
              }]
            };
          } else {
            result = {
              content: [{
                type: "text",
                text: `# Project: ${project.name}\n\n` +
                      `**ID**: ${project.id}\n` +
                      `**Description**: ${project.description || "No description"}\n` +
                      `**State**: ${project.state}\n` +
                      `**Visibility**: ${project.visibility}\n` +
                      `**URL**: ${project.url}`
              }]
            };
          }
        } else {
          throw new Error(`Unknown tool: ${name}`);
        }
        
        const response = {
          jsonrpc: "2.0",
          id: request.id,
          result
        };
        return res.json(response);
        
      } catch (error: any) {
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

// Root endpoint with API documentation
app.get("/", (req, res) => {
  res.json({
    name: "Azure DevOps MCP Server (Web)",
    version: packageVersion,
    organization: orgName,
    endpoints: {
      health: "GET /health - Health check",
      mcp: "POST /mcp - MCP JSON-RPC 2.0 endpoint",
      tools: "GET /api/tools - List available tools",
      getWorkItem: "POST /api/tools/wit_get_work_item - Get work item by ID",
      listProjects: "POST /api/tools/core_list_projects - List projects",
      getBuilds: "POST /api/tools/build_get_builds - Get project builds"
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
    
    // Initialize comprehensive tool registry
    await initializeTools();
    
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