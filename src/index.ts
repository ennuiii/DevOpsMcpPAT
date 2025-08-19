#!/usr/bin/env node

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as azdev from "azure-devops-node-api";
import { IRequestHandler } from "azure-devops-node-api/interfaces/common/VsoBaseInterfaces.js";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { configurePrompts } from "./prompts.js";
import { configureAllTools } from "./tools.js";
import { UserAgentComposer } from "./useragent.js";
import { packageVersion } from "./version.js";

// Parse command line arguments using yargs
const argv = yargs(hideBin(process.argv))
  .scriptName("mcp-server-azuredevops")
  .usage("Usage: $0 <organization> [options]")
  .version(packageVersion)
  .command("$0 <organization>", "Azure DevOps MCP Server", (yargs) => {
    yargs.positional("organization", {
      describe: "Azure DevOps organization name",
      type: "string",
    });
  })
  .option("pat", {
    alias: "p",
    describe: "Personal Access Token for Azure DevOps",
    type: "string",
  })
  .option("pat-env", {
    describe: "Environment variable containing the PAT (default: AZURE_DEVOPS_PAT)",
    type: "string",
    default: "AZURE_DEVOPS_PAT",
  })
  .help()
  .parseSync();

export const orgName = argv.organization as string;
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

async function getPatToken(): Promise<string> {
  // Priority: 1) Command line argument, 2) Environment variable
  const pat = argv.pat || process.env[argv.patEnv as string];
  
  if (!pat) {
    throw new Error(
      `Personal Access Token not found. Please provide it via:\n` +
      `  1. Command line: --pat YOUR_PAT_TOKEN\n` +
      `  2. Environment variable: export ${argv.patEnv}=YOUR_PAT_TOKEN`
    );
  }

  return pat;
}

async function getAzureDevOpsToken(): Promise<{ token: string; expiresOnTimestamp: number }> {
  const pat = await getPatToken();
  // PAT tokens don't expire in the same way as OAuth tokens, so we set a far future date
  return { 
    token: pat,
    expiresOnTimestamp: Date.now() + (365 * 24 * 60 * 60 * 1000) // 1 year from now
  };
}

function getAzureDevOpsClient(userAgentComposer: UserAgentComposer): () => Promise<azdev.WebApi> {
  return async () => {
    const pat = await getPatToken();
    const authHandler = new PatAuthHandler(pat);
    const connection = new azdev.WebApi(orgUrl, authHandler, undefined, {
      productName: "AzureDevOps.MCP",
      productVersion: packageVersion,
      userAgent: userAgentComposer.userAgent,
    });
    return connection;
  };
}

async function main() {
  const server = new McpServer({
    name: "Azure DevOps MCP Server (PAT Auth)",
    version: packageVersion,
  });

  const userAgentComposer = new UserAgentComposer(packageVersion);
  server.server.oninitialized = () => {
    const clientInfo = server.server.getClientVersion();
    if (clientInfo && clientInfo.name) {
      userAgentComposer.appendMcpClientInfo(clientInfo);
    }
  };

  configurePrompts(server);

  configureAllTools(server, getAzureDevOpsToken, getAzureDevOpsClient(userAgentComposer), () => userAgentComposer.userAgent);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});