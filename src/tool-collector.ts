// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { WebApi } from "azure-devops-node-api";
import { MockMcpServer, AccessToken, ToolDefinition } from "./tool-registry.js";

// Import all tool configurators
import { configureAdvSecTools } from "./tools/advsec.js";
import { configureBuildTools } from "./tools/builds.js";
import { configureCoreTools } from "./tools/core.js";
import { configureReleaseTools } from "./tools/releases.js";
import { configureRepoTools } from "./tools/repos.js";
import { configureSearchTools } from "./tools/search.js";
import { configureTestPlanTools } from "./tools/testplans.js";
import { configureWikiTools } from "./tools/wiki.js";
import { configureWorkTools } from "./tools/work.js";
import { configureWorkItemTools } from "./tools/workitems.js";

export class ToolCollector {
  private mockServer: MockMcpServer;
  private tools: ToolDefinition[] = [];

  constructor() {
    this.mockServer = new MockMcpServer();
  }

  async collectAllTools(tokenProvider: () => Promise<AccessToken>, connectionProvider: () => Promise<WebApi>, userAgentProvider: () => string): Promise<ToolDefinition[]> {
    try {
      console.log("🔧 Collecting Core Tools...");
      configureCoreTools(this.mockServer as any, tokenProvider, connectionProvider, userAgentProvider);
      
      console.log("🔧 Collecting Work Tools...");
      configureWorkTools(this.mockServer as any, tokenProvider, connectionProvider);
      
      console.log("🔧 Collecting Build Tools...");
      configureBuildTools(this.mockServer as any, tokenProvider, connectionProvider, userAgentProvider);
      
      console.log("🔧 Collecting Repository Tools...");
      configureRepoTools(this.mockServer as any, tokenProvider, connectionProvider, userAgentProvider);
      
      console.log("🔧 Collecting Work Item Tools...");
      configureWorkItemTools(this.mockServer as any, tokenProvider, connectionProvider, userAgentProvider);
      
      console.log("🔧 Collecting Release Tools...");
      configureReleaseTools(this.mockServer as any, tokenProvider, connectionProvider);
      
      console.log("🔧 Collecting Wiki Tools...");
      configureWikiTools(this.mockServer as any, tokenProvider, connectionProvider);
      
      console.log("🔧 Collecting Test Plan Tools...");
      configureTestPlanTools(this.mockServer as any, tokenProvider, connectionProvider);
      
      console.log("🔧 Collecting Search Tools...");
      configureSearchTools(this.mockServer as any, tokenProvider, connectionProvider, userAgentProvider);
      
      console.log("🔧 Collecting Advanced Security Tools...");
      configureAdvSecTools(this.mockServer as any, tokenProvider, connectionProvider);

      this.tools = this.mockServer.getTools();
      console.log(`✅ Collected ${this.tools.length} tools total`);
      
      return this.tools;
    } catch (error) {
      console.error("❌ Error collecting tools:", error);
      return [];
    }
  }

  getTools(): ToolDefinition[] {
    return this.tools;
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.find(tool => tool.name === name);
  }

  getToolNames(): string[] {
    return this.tools.map(tool => tool.name);
  }

  getToolsForMcp() {
    return this.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));
  }
}