// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { WebApi } from "azure-devops-node-api";
import { z } from "zod";

// Simple interface to replace Azure Identity AccessToken
interface AccessToken {
  token: string;
  expiresOnTimestamp: number;
}

// Tool definition interface
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (args: any, connection: WebApi) => Promise<string>;
}

// Mock McpServer interface for tool registration
class MockMcpServer {
  private tools: Map<string, ToolDefinition> = new Map();

  tool(name: string, description: string, schema: Record<string, z.ZodSchema>, handler: (args: any) => Promise<any>) {
    // Simplified approach - just extract basic info from Zod schemas
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, zodSchema] of Object.entries(schema)) {
      // For our purposes, we'll use a simplified schema extraction
      // Most schemas in the tools are either string, number, boolean, or optional versions
      const description = zodSchema.description || "";
      
      // Basic type detection
      const schemaString = zodSchema.toString();
      if (schemaString.includes('ZodNumber')) {
        properties[key] = { type: "number", description };
      } else if (schemaString.includes('ZodBoolean')) {
        properties[key] = { type: "boolean", description };
      } else {
        properties[key] = { type: "string", description };
      }
      
      // Check if it's optional by trying to parse undefined
      try {
        zodSchema.parse(undefined);
        // If it doesn't throw, it's optional
      } catch {
        // If it throws, it's required
        required.push(key);
      }
    }

    const toolDef: ToolDefinition = {
      name,
      description,
      inputSchema: {
        type: "object",
        properties,
        required: required.length > 0 ? required : undefined
      },
      handler: async (args: any, connection: WebApi) => {
        try {
          const result = await handler(args);
          if (result && result.content && Array.isArray(result.content)) {
            return result.content.map((c: any) => c.text || String(c)).join('\n');
          }
          return JSON.stringify(result, null, 2);
        } catch (error) {
          throw error;
        }
      }
    };

    this.tools.set(name, toolDef);
  }

  getTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }
}

export { MockMcpServer, AccessToken };