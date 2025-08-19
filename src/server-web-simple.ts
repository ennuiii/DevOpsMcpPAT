#!/usr/bin/env node

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import express from "express";
import cors from "cors";
import * as azdev from "azure-devops-node-api";
import { IRequestHandler } from "azure-devops-node-api/interfaces/common/VsoBaseInterfaces.js";

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
            }
          },
          serverInfo: {
            name: "Azure DevOps MCP Server (PAT)",
            version: packageVersion
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
          tools: [
            {
              name: "wit_get_work_item",
              description: "Get a single work item by ID",
              inputSchema: {
                type: "object",
                properties: {
                  id: { type: "number", description: "Work item ID" },
                  project: { type: "string", description: "Project name (optional)" }
                },
                required: ["id"]
              }
            },
            {
              name: "core_list_projects",
              description: "List all projects in the organization",
              inputSchema: {
                type: "object",
                properties: {}
              }
            },
            {
              name: "build_get_builds",
              description: "Get builds for a project",
              inputSchema: {
                type: "object",
                properties: {
                  project: { type: "string", description: "Project name" }
                },
                required: ["project"]
              }
            }
          ]
        }
      };
      return res.json(response);
    }

    // Handle tools/call request
    if (request.method === "tools/call") {
      const { name, arguments: args } = request.params;
      
      try {
        let result;
        
        if (name === "wit_get_work_item") {
          const { id, project } = args;
          if (!id) {
            throw new Error("Work item ID is required");
          }
          
          const client = await getAzureDevOpsClient();
          const witApi = await client.getWorkItemTrackingApi();
          const workItem = await witApi.getWorkItem(id);
          
          result = {
            content: [{
              type: "text",
              text: `Work Item #${workItem.id}: ${workItem.fields!["System.Title"]}\n` +
                    `Type: ${workItem.fields!["System.WorkItemType"]}\n` +
                    `State: ${workItem.fields!["System.State"]}\n` +
                    `Assigned To: ${workItem.fields!["System.AssignedTo"]?.displayName || "Unassigned"}\n` +
                    `Created: ${workItem.fields!["System.CreatedDate"]}`
            }]
          };
        } else if (name === "core_list_projects") {
          const client = await getAzureDevOpsClient();
          const coreApi = await client.getCoreApi();
          const projects = await coreApi.getProjects();
          
          result = {
            content: [{
              type: "text",
              text: `Found ${projects.length} project(s):\n` +
                    projects.map(p => `- ${p.name} (${p.state})`).join('\n')
            }]
          };
        } else if (name === "build_get_builds") {
          const { project } = args;
          if (!project) {
            throw new Error("Project name is required");
          }
          
          const client = await getAzureDevOpsClient();
          const buildApi = await client.getBuildApi();
          const builds = await buildApi.getBuilds(project, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 10);
          
          result = {
            content: [{
              type: "text",
              text: `Recent builds for ${project}:\n` +
                    builds.map(b => `- Build ${b.buildNumber}: ${b.status} (${b.result || 'In Progress'})`).join('\n')
            }]
          };
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