// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { WebApi } from "azure-devops-node-api";
import { WorkItemExpand } from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js";

// Microsoft-compatible tool definitions (optimized)
export interface ComprehensiveTool {
  name: string;
  description?: string; // Optional - generated dynamically for minimal size
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (args: any, connection: WebApi) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  } | string>; // Support both formats during transition
}

// Helper function to stream to string
function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => (data += chunk));
    stream.on("end", () => resolve(data));
    stream.on("error", reject);
  });
}

export const comprehensiveToolsComplete: ComprehensiveTool[] = [
  // ============================================================================
  // CORE TOOLS (3 tools)
  // ============================================================================
  {
    name: "core_list_projects",
    
    inputSchema: {
      type: "object",
      properties: {
        stateFilter: { 
          type: "string", 
          enum: ["all", "wellFormed", "createPending", "deleted"],
        },
        top: { type: "number" },
        skip: { type: "number" },
        continuationToken: { type: "number" },
        projectNameFilter: { type: "string" }
      }
    },
    handler: async (args, connection) => {
      try {
        const coreApi = await connection.getCoreApi();
        const projects = await coreApi.getProjects(
          args.stateFilter || "wellFormed", 
          args.top, 
          args.skip, 
          args.continuationToken, 
          false
        );
        
        let filteredProjects = projects;
        if (args.projectNameFilter) {
          const lowerFilter = args.projectNameFilter.toLowerCase();
          filteredProjects = projects.filter(p => p.name?.toLowerCase().includes(lowerFilter));
        }
        
        if (!filteredProjects || filteredProjects.length === 0) {
          return { content: [{ type: "text", text: "No projects found in the organization." }], isError: true };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(filteredProjects) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching projects: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "core_list_project_teams",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        mine: { type: "boolean" },
        top: { type: "number" },
        skip: { type: "number" }
      },
      required: ["project"]
    },
    handler: async (args, connection) => {
      try {
        const coreApi = await connection.getCoreApi();
        const teams = await coreApi.getTeams(args.project, args.mine, args.top, args.skip, false);
        
        if (!teams || teams.length === 0) {
          return { content: [{ type: "text", text: `No teams found for project: ${args.project}` }], isError: true };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(teams) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching teams: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "core_get_identity_ids",
    
    inputSchema: {
      type: "object",
      properties: {
        searchFilter: { type: "string" }
      },
      required: ["searchFilter"]
    },
    handler: async (args, connection) => {
      try {
        // This requires REST API call since the SDK doesn't expose identity search directly
        const orgName = connection.serverUrl.split("/")[3];
        const baseUrl = `https://vssps.dev.azure.com/${orgName}/_apis/identities`;
        
        const params = new URLSearchParams({
          "api-version": "7.2-preview.1",
          "searchFilter": "General",
          "filterValue": args.searchFilter,
        });

        // Note: This would require proper token handling in a real implementation
        return {
          content: [{ type: "text", text: `Identity search functionality requires direct REST API implementation with proper authentication.\nSearch filter: "${args.searchFilter}"\nEndpoint: ${baseUrl}?${params}` }],
          isError: true
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error in identity search: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  // ============================================================================
  // WORK ITEM TOOLS (5 tools)
  // ============================================================================
  {
    name: "wit_get_work_item",
    
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number" },
        project: { type: "string" },
        fields: { 
          type: "array",
          items: { type: "string" }
        },
        asOf: { type: "string" },
        expand: { 
          type: "string",
          enum: ["all", "fields", "links", "none", "relations"]
        }
      },
      required: ["id", "project"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        const workItem = await witApi.getWorkItem(
          args.id, 
          args.fields,
          args.asOf ? new Date(args.asOf) : undefined,
          args.expand,
          args.project
        );
        
        if (!workItem) {
          return { content: [{ type: "text", text: `Work item ${args.id} not found.` }], isError: true };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(workItem) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching work item: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_create_work_item",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        workItemType: { type: "string" },
        fields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              value: { type: "string" },
              format: { 
                type: "string",
                enum: ["Html", "Markdown"]
              }
            },
            required: ["name", "value"]
          }
        }
      },
      required: ["project", "workItemType", "fields"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        
        const patchDocument = args.fields.map((field: any) => ({
          op: "add",
          path: `/fields/${field.name}`,
          value: field.value
        }));
        
        const workItem = await witApi.createWorkItem(
          null, 
          patchDocument as any, 
          args.project, 
          args.workItemType
        );
        
        return {
          content: [{ type: "text", text: JSON.stringify(workItem) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error creating work item: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_update_work_item",
    
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number" },
        updates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: { 
                type: "string",
                enum: ["add", "replace", "remove", "copy", "move", "test"]
              },
              path: { type: "string" },
              value: { type: "string" },
              from: { type: "string" }
            },
            required: ["op", "path"]
          }
        }
      },
      required: ["id", "updates"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        
        const workItem = await witApi.updateWorkItem(
          null, 
          args.updates as any, 
          args.id
        );
        
        return {
          content: [{ type: "text", text: JSON.stringify(workItem) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error updating work item: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_query_work_items",
    
    inputSchema: {
      type: "object",
      properties: {
        wiql: { type: "string" },
        project: { type: "string" }
      },
      required: ["wiql", "project"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        const queryResult = await witApi.queryByWiql(
          { query: args.wiql },
          { project: args.project }
        );
        
        if (!queryResult.workItems || queryResult.workItems.length === 0) {
          return {
            content: [{ type: "text", text: "No work items found matching the query." }],
            isError: true
          };
        }
        
        const workItemIds = queryResult.workItems.map(wi => wi.id!);
        const workItems = await witApi.getWorkItems(
          workItemIds,
          undefined,
          undefined,
          undefined,
          undefined,
          args.project
        );
        
        return {
          content: [{ type: "text", text: JSON.stringify(workItems) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error querying work items: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_delete_work_item",
    
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number" },
        destroy: { type: "boolean" }
      },
      required: ["id"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        
        const result = await witApi.deleteWorkItem(args.id, undefined, args.destroy);
        
        return {
          content: [{ type: "text", text: JSON.stringify(result) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error deleting work item: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  // ============================================================================
  // BUILD TOOLS (9 tools)
  // ============================================================================
  {
    name: "build_get_definitions",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        name: { type: "string" },
        repositoryId: { type: "string" },
        repositoryType: { type: "string", enum: ["TfsGit", "GitHub", "BitbucketCloud"] },
        top: { type: "number" },
        includeLatestBuilds: { type: "boolean" }
      },
      required: ["project"]
    },
    handler: async (args, connection) => {
      try {
        const buildApi = await connection.getBuildApi();
        const buildDefinitions = await buildApi.getDefinitions(
          args.project,
          args.name,
          args.repositoryId,
          args.repositoryType,
          undefined, // queryOrder
          args.top,
          undefined, // continuationToken
          undefined, // minMetricsTime
          undefined, // definitionIds
          undefined, // path
          undefined, // builtAfter
          undefined, // notBuiltAfter
          undefined, // includeAllProperties
          args.includeLatestBuilds
        );

        if (!buildDefinitions || buildDefinitions.length === 0) {
          return {
            content: [{ type: "text", text: `No build definitions found for project: ${args.project}` }],
            isError: true
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(buildDefinitions) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching build definitions: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "build_get_builds",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        definitions: { type: "array", items: { type: "number" } },
        buildNumber: { type: "string" },
        top: { type: "number" },
        statusFilter: { type: "number" },
        resultFilter: { type: "number" },
        branchName: { type: "string" }
      },
      required: ["project"]
    },
    handler: async (args, connection) => {
      try {
        const buildApi = await connection.getBuildApi();
        const builds = await buildApi.getBuilds(
          args.project,
          args.definitions,
          undefined, // queues
          args.buildNumber,
          undefined, // minTime
          undefined, // maxTime
          undefined, // requestedFor
          undefined, // reasonFilter
          args.statusFilter,
          args.resultFilter,
          undefined, // tagFilters
          undefined, // properties
          args.top || 10,
          undefined, // continuationToken
          undefined, // maxBuildsPerDefinition
          undefined, // deletedFilter
          undefined, // queryOrder
          args.branchName
        );

        if (!builds || builds.length === 0) {
          return {
            content: [{ type: "text", text: `No builds found for project: ${args.project}` }],
            isError: true
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(builds) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching builds: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "build_run_build",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        definitionId: { type: "number" },
        sourceBranch: { type: "string" },
        parameters: { type: "object" }
      },
      required: ["project", "definitionId"]
    },
    handler: async (args, connection) => {
      try {
        const buildApi = await connection.getBuildApi();
        const pipelinesApi = await connection.getPipelinesApi();
        
        const definition = await buildApi.getDefinition(args.project, args.definitionId);
        const runRequest = {
          resources: {
            repositories: {
              self: {
                refName: args.sourceBranch || definition.repository?.defaultBranch || "refs/heads/main",
              },
            },
          },
          templateParameters: args.parameters,
        };

        const pipelineRun = await pipelinesApi.runPipeline(runRequest, args.project, args.definitionId);
        
        return {
          content: [{ type: "text", text: JSON.stringify(pipelineRun) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error running build: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "build_get_status",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        buildId: { type: "number" }
      },
      required: ["project", "buildId"]
    },
    handler: async (args, connection) => {
      try {
        const buildApi = await connection.getBuildApi();
        const build = await buildApi.getBuild(args.project, args.buildId);

        if (!build) {
          return {
            content: [{ type: "text", text: `Build ${args.buildId} not found in project ${args.project}` }],
            isError: true
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(build) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching build status: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "build_get_logs",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        buildId: { type: "number" }
      },
      required: ["project", "buildId"]
    },
    handler: async (args, connection) => {
      try {
        const buildApi = await connection.getBuildApi();
        const logs = await buildApi.getBuildLogs(args.project, args.buildId);

        if (!logs || logs.length === 0) {
          return {
            content: [{ type: "text", text: `No logs found for build ${args.buildId}` }],
            isError: true
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(logs) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching build logs: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "build_get_log_content",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        buildId: { type: "number" },
        logId: { type: "number" },
        startLine: { type: "number" },
        endLine: { type: "number" }
      },
      required: ["project", "buildId", "logId"]
    },
    handler: async (args, connection) => {
      try {
        const buildApi = await connection.getBuildApi();
        const logLines = await buildApi.getBuildLogLines(args.project, args.buildId, args.logId, args.startLine, args.endLine);

        if (!logLines || logLines.length === 0) {
          return {
            content: [{ type: "text", text: `No log content found for build ${args.buildId}, log ${args.logId}` }],
            isError: true
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(logLines) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching log content: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "build_get_changes",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        buildId: { type: "number" },
        top: { type: "number" }
      },
      required: ["project", "buildId"]
    },
    handler: async (args, connection) => {
      try {
        const buildApi = await connection.getBuildApi();
        const changes = await buildApi.getBuildChanges(args.project, args.buildId, undefined, args.top || 100);

        if (!changes || changes.length === 0) {
          return {
            content: [{ type: "text", text: `No changes found for build ${args.buildId}` }],
            isError: true
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(changes) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching build changes: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "build_get_definition_revisions",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        definitionId: { type: "number" }
      },
      required: ["project", "definitionId"]
    },
    handler: async (args, connection) => {
      try {
        const buildApi = await connection.getBuildApi();
        const revisions = await buildApi.getDefinitionRevisions(args.project, args.definitionId);

        if (!revisions || revisions.length === 0) {
          return {
            content: [{ type: "text", text: `No revisions found for build definition ${args.definitionId}` }],
            isError: true
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(revisions) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching definition revisions: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "build_update_stage",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        buildId: { type: "number" },
        stageName: { type: "string" },
        status: { type: "string", enum: ["cancel", "retry"] },
        forceRetryAllJobs: { type: "boolean" }
      },
      required: ["project", "buildId", "stageName", "status"]
    },
    handler: async (args, connection) => {
      try {
        // This requires direct REST API call
        const orgUrl = connection.serverUrl;
        const endpoint = `${orgUrl}/${args.project}/_apis/build/builds/${args.buildId}/stages/${args.stageName}?api-version=7.2-preview.1`;
        
        const result = {
          message: "Build stage update functionality requires direct REST API implementation.",
          endpoint: endpoint,
          stageName: args.stageName,
          status: args.status
        };
        
        return {
          content: [{ type: "text", text: JSON.stringify(result) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error updating build stage: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  // ============================================================================
  // MODERN REPOSITORY TOOLS (15 tools) - repo_* prefix
  // ============================================================================
  {
    name: "repo_list_repos_by_project",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" }
      },
      required: ["project"]
    },
    handler: async (args, connection) => {
      try {
        const gitApi = await connection.getGitApi();
        const repositories = await gitApi.getRepositories(args.project);
        
        if (!repositories || repositories.length === 0) {
          return {
            content: [{ type: "text", text: `No repositories found for project: ${args.project}` }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(repositories) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error listing repositories: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "repo_get_repo_by_name_or_id",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        repositoryId: { type: "string" }
      },
      required: ["project", "repositoryId"]
    },
    handler: async (args, connection) => {
      try {
        const gitApi = await connection.getGitApi();
        const repository = await gitApi.getRepository(args.repositoryId, args.project);
        
        if (!repository) {
          return {
            content: [{ type: "text", text: `Repository ${args.repositoryId} not found.` }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(repository) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting repository: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "repo_list_branches_by_repo",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string" },
        project: { type: "string" }
      },
      required: ["repositoryId"]
    },
    handler: async (args, connection) => {
      try {
        const gitApi = await connection.getGitApi();
        const branches = await gitApi.getBranches(args.repositoryId, args.project);
        
        if (!branches || branches.length === 0) {
          return {
            content: [{ type: "text", text: `No branches found for repository: ${args.repositoryId}` }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(branches) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting branches: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "repo_get_branch_by_name",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string" },
        branchName: { type: "string" },
        project: { type: "string" }
      },
      required: ["repositoryId", "branchName"]
    },
    handler: async (args, connection) => {
      try {
        const gitApi = await connection.getGitApi();
        const branches = await gitApi.getBranches(args.repositoryId, args.project);
        const branch = branches.find(b => b.name === args.branchName);
        
        if (!branch) {
          return {
            content: [{ type: "text", text: `Branch ${args.branchName} not found in repository: ${args.repositoryId}` }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(branch) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting branch: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "repo_list_pull_requests_by_repo",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string" },
        project: { type: "string" },
        status: { type: "string", enum: ["active", "completed", "abandoned", "all"] },
        top: { type: "number" }
      },
      required: ["repositoryId"]
    },
    handler: async (args, connection) => {
      try {
        const gitApi = await connection.getGitApi();
        const searchCriteria = {
          status: args.status === "active" ? 1 : args.status === "completed" ? 3 : args.status === "abandoned" ? 2 : undefined,
          $top: args.top || 10
        };
        
        const pullRequests = await gitApi.getPullRequests(args.repositoryId, searchCriteria, args.project);
        
        if (!pullRequests || pullRequests.length === 0) {
          return {
            content: [{ type: "text", text: `No pull requests found for repository: ${args.repositoryId}` }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(pullRequests) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting pull requests: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "repo_list_pull_requests_by_project",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        status: { type: "string", enum: ["active", "completed", "abandoned", "all"] },
        top: { type: "number" }
      },
      required: ["project"]
    },
    handler: async (args, connection) => {
      try {
        const gitApi = await connection.getGitApi();
        
        // Get all repositories for the project first
        const repositories = await gitApi.getRepositories(args.project);
        let allPullRequests = [];
        
        for (const repo of repositories) {
          try {
            const searchCriteria = {
              status: args.status === "active" ? 1 : args.status === "completed" ? 3 : args.status === "abandoned" ? 2 : undefined,
              $top: args.top || 10
            };
            
            const pullRequests = await gitApi.getPullRequests(repo.id!, searchCriteria, args.project);
            allPullRequests.push(...pullRequests);
          } catch (error) {
            // Continue with other repos if one fails
            continue;
          }
        }
        
        if (allPullRequests.length === 0) {
          return {
            content: [{ type: "text", text: `No pull requests found for project: ${args.project}` }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(allPullRequests.slice(0, args.top || 10)) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting pull requests: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "repo_get_pull_request_by_id",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string" },
        pullRequestId: { type: "number" },
        project: { type: "string" }
      },
      required: ["repositoryId", "pullRequestId"]
    },
    handler: async (args, connection) => {
      try {
        const gitApi = await connection.getGitApi();
        const pullRequest = await gitApi.getPullRequest(args.repositoryId, args.pullRequestId, args.project);
        
        if (!pullRequest) {
          return {
            content: [{ type: "text", text: `Pull request ${args.pullRequestId} not found in repository: ${args.repositoryId}` }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(pullRequest) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting pull request: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "repo_create_pull_request",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string" },
        sourceRefName: { type: "string" },
        targetRefName: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        project: { type: "string" }
      },
      required: ["repositoryId", "sourceRefName", "targetRefName", "title"]
    },
    handler: async (args, connection) => {
      try {
        const gitApi = await connection.getGitApi();
        
        const pullRequestToCreate = {
          sourceRefName: args.sourceRefName.startsWith("refs/heads/") ? args.sourceRefName : `refs/heads/${args.sourceRefName}`,
          targetRefName: args.targetRefName.startsWith("refs/heads/") ? args.targetRefName : `refs/heads/${args.targetRefName}`,
          title: args.title,
          description: args.description || ""
        };
        
        const pullRequest = await gitApi.createPullRequest(pullRequestToCreate, args.repositoryId, args.project);
        
        return {
          content: [{ type: "text", text: JSON.stringify(pullRequest) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error creating pull request: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "repo_update_pull_request_status",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string" },
        pullRequestId: { type: "number" },
        status: { type: "string", enum: ["active", "abandoned"] },
        project: { type: "string" }
      },
      required: ["repositoryId", "pullRequestId", "status"]
    },
    handler: async (args, connection) => {
      try {
        const gitApi = await connection.getGitApi();
        
        const pullRequestUpdate = {
          status: args.status === "active" ? 1 : 2 // active = 1, abandoned = 2
        };
        
        const pullRequest = await gitApi.updatePullRequest(pullRequestUpdate, args.repositoryId, args.pullRequestId, args.project);
        
        return {
          content: [{ type: "text", text: JSON.stringify(pullRequest) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error updating pull request status: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "repo_update_pull_request",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string" },
        pullRequestId: { type: "number" },
        title: { type: "string" },
        description: { type: "string" },
        isDraft: { type: "boolean" },
        targetRefName: { type: "string" },
        project: { type: "string" }
      },
      required: ["repositoryId", "pullRequestId"]
    },
    handler: async (args, connection) => {
      try {
        const gitApi = await connection.getGitApi();
        
        const pullRequestUpdate = {
          ...(args.title && { title: args.title }),
          ...(args.description && { description: args.description }),
          ...(args.isDraft !== undefined && { isDraft: args.isDraft }),
          ...(args.targetRefName && { 
            targetRefName: args.targetRefName.startsWith("refs/heads/") ? args.targetRefName : `refs/heads/${args.targetRefName}` 
          })
        };
        
        const pullRequest = await gitApi.updatePullRequest(pullRequestUpdate, args.repositoryId, args.pullRequestId, args.project);
        
        return {
          content: [{ type: "text", text: JSON.stringify(pullRequest) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error updating pull request: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "repo_list_pull_request_threads",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string" },
        pullRequestId: { type: "number" },
        project: { type: "string" }
      },
      required: ["repositoryId", "pullRequestId"]
    },
    handler: async (args, connection) => {
      try {
        const gitApi = await connection.getGitApi();
        const threads = await gitApi.getThreads(args.repositoryId, args.pullRequestId, args.project);
        
        if (!threads || threads.length === 0) {
          return {
            content: [{ type: "text", text: `No comment threads found for pull request: ${args.pullRequestId}` }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(threads) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting comment threads: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "repo_create_pull_request_thread",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string" },
        pullRequestId: { type: "number" },
        content: { type: "string" },
        project: { type: "string" }
      },
      required: ["repositoryId", "pullRequestId", "content"]
    },
    handler: async (args, connection) => {
      try {
        const gitApi = await connection.getGitApi();
        
        const thread = {
          comments: [{
            content: args.content,
            commentType: 1 // text comment
          }],
          status: 1 // active
        };
        
        const createdThread = await gitApi.createThread(thread, args.repositoryId, args.pullRequestId, args.project);
        
        return {
          content: [{ type: "text", text: JSON.stringify(createdThread) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error creating comment thread: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "repo_reply_to_comment",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string" },
        pullRequestId: { type: "number" },
        threadId: { type: "number" },
        content: { type: "string" },
        project: { type: "string" }
      },
      required: ["repositoryId", "pullRequestId", "threadId", "content"]
    },
    handler: async (args, connection) => {
      try {
        const gitApi = await connection.getGitApi();
        
        const comment = {
          content: args.content,
          commentType: 1 // text comment
        };
        
        const createdComment = await gitApi.createComment(comment, args.repositoryId, args.pullRequestId, args.threadId, args.project);
        
        return {
          content: [{ type: "text", text: JSON.stringify(createdComment) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error replying to comment: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "repo_resolve_comment",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string" },
        pullRequestId: { type: "number" },
        threadId: { type: "number" },
        project: { type: "string" }
      },
      required: ["repositoryId", "pullRequestId", "threadId"]
    },
    handler: async (args, connection) => {
      try {
        const gitApi = await connection.getGitApi();
        
        const threadUpdate = {
          status: 2 // fixed/resolved
        };
        
        const updatedThread = await gitApi.updateThread(threadUpdate, args.repositoryId, args.pullRequestId, args.threadId, args.project);
        
        return {
          content: [{ type: "text", text: JSON.stringify(updatedThread) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error resolving comment: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "repo_search_commits",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string" },
        project: { type: "string" },
        searchText: { type: "string" },
        author: { type: "string" },
        fromDate: { type: "string" },
        toDate: { type: "string" },
        top: { type: "number" }
      },
      required: ["repositoryId"]
    },
    handler: async (args, connection) => {
      try {
        const gitApi = await connection.getGitApi();
        
        const searchCriteria = {
          itemVersion: { version: "main" },
          $top: args.top || 10,
          ...(args.searchText && { searchCriteria: { searchText: args.searchText } }),
          ...(args.author && { author: args.author }),
          ...(args.fromDate && { fromDate: args.fromDate }),
          ...(args.toDate && { toDate: args.toDate })
        };
        
        const commits = await gitApi.getCommits(args.repositoryId, searchCriteria, args.project);
        
        if (!commits || commits.length === 0) {
          return {
            content: [{ type: "text", text: `No commits found for repository: ${args.repositoryId}` }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(commits) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error searching commits: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  // ============================================================================
  // LEGACY GIT REPOSITORY TOOLS (6 tools) - git_* prefix  
  // ============================================================================
  {
    name: "git_list_repositories",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" }
      }
    },
    handler: async (args, connection) => {
      try {
        const gitApi = await connection.getGitApi();
        const repositories = await gitApi.getRepositories(args.project);
        
        if (!repositories || repositories.length === 0) {
          return {
            content: [{ type: "text", text: args.project ? `No repositories found for project: ${args.project}` : "No repositories found." }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(repositories) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error listing repositories: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "git_get_repository",
    
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string" },
        project: { type: "string" }
      },
      required: ["repositoryId"]
    },
    handler: async (args, connection) => {
      try {
        const gitApi = await connection.getGitApi();
        const repository = await gitApi.getRepository(args.repositoryId, args.project);
        
        if (!repository) {
          return {
            content: [{ type: "text", text: `Repository ${args.repositoryId} not found.` }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(repository) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting repository: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "git_get_branches",
    
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string" },
        project: { type: "string" }
      },
      required: ["repositoryId"]
    },
    handler: async (args, connection) => {
      try {
        const gitApi = await connection.getGitApi();
        const branches = await gitApi.getBranches(args.repositoryId, args.project);
        
        if (!branches || branches.length === 0) {
          return {
            content: [{ type: "text", text: `No branches found for repository: ${args.repositoryId}` }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(branches) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting branches: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "git_get_commits",
    
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string" },
        project: { type: "string" },
        branch: { type: "string" },
        top: { type: "number" }
      },
      required: ["repositoryId"]
    },
    handler: async (args, connection) => {
      try {
        const gitApi = await connection.getGitApi();
        const searchCriteria = {
          itemVersion: args.branch ? { version: args.branch } : undefined,
          $top: args.top || 10
        };
        
        const commits = await gitApi.getCommits(args.repositoryId, searchCriteria, args.project);
        
        if (!commits || commits.length === 0) {
          return {
            content: [{ type: "text", text: `No commits found for repository: ${args.repositoryId}` }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(commits) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting commits: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "git_get_pull_requests",
    
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string" },
        project: { type: "string" },
        status: { type: "string", enum: ["active", "completed", "abandoned", "all"] },
        top: { type: "number" }
      },
      required: ["repositoryId"]
    },
    handler: async (args, connection) => {
      try {
        const gitApi = await connection.getGitApi();
        const searchCriteria = {
          status: args.status === "active" ? 1 : args.status === "completed" ? 3 : args.status === "abandoned" ? 2 : undefined,
          $top: args.top || 10
        };
        
        const pullRequests = await gitApi.getPullRequests(args.repositoryId, searchCriteria, args.project);
        
        if (!pullRequests || pullRequests.length === 0) {
          return {
            content: [{ type: "text", text: `No pull requests found for repository: ${args.repositoryId}` }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(pullRequests) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting pull requests: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "git_get_items",
    
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string" },
        project: { type: "string" },
        scopePath: { type: "string" },
        recursionLevel: { type: "string", enum: ["none", "oneLevel", "full"] }
      },
      required: ["repositoryId"]
    },
    handler: async (args, connection) => {
      try {
        const gitApi = await connection.getGitApi();
        const recursionLevel = args.recursionLevel === "none" ? 0 : args.recursionLevel === "oneLevel" ? 1 : 120;
        
        const items = await gitApi.getItems(
          args.repositoryId, 
          args.project, 
          args.scopePath, 
          recursionLevel
        );
        
        if (!items || items.length === 0) {
          return {
            content: [{ type: "text", text: `No items found in repository: ${args.repositoryId}` }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(items) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting repository items: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  // ============================================================================
  // WIKI TOOLS (5 tools)
  // ============================================================================
  {
    name: "wiki_list_wikis",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" }
      }
    },
    handler: async (args, connection) => {
      try {
        const wikiApi = await connection.getWikiApi();
        const wikis = await wikiApi.getAllWikis(args.project);

        if (!wikis || wikis.length === 0) {
          return { content: [{ type: "text", text: "No wikis found" }], isError: true };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(wikis) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching wikis: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wiki_get_wiki",
    
    inputSchema: {
      type: "object",
      properties: {
        wikiIdentifier: { type: "string" },
        project: { type: "string" }
      },
      required: ["wikiIdentifier"]
    },
    handler: async (args, connection) => {
      try {
        const wikiApi = await connection.getWikiApi();
        const wiki = await wikiApi.getWiki(args.wikiIdentifier, args.project);

        if (!wiki) {
          return {
            content: [{ type: "text", text: "No wiki found" }],
            isError: true
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(wiki) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting wiki: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wiki_list_pages",
    
    inputSchema: {
      type: "object",
      properties: {
        wikiIdentifier: { type: "string" },
        project: { type: "string" },
        top: { type: "number"},
        continuationToken: { type: "string" },
        pageViewsForDays: { type: "number" }
      },
      required: ["wikiIdentifier", "project"]
    },
    handler: async (args, connection) => {
      try {
        const wikiApi = await connection.getWikiApi();

        const pagesBatchRequest = {
          top: args.top || 20,
          continuationToken: args.continuationToken && args.continuationToken !== '' ? args.continuationToken : undefined,
          pageViewsForDays: args.pageViewsForDays
        };

        const pages = await wikiApi.getPagesBatch(pagesBatchRequest, args.project, args.wikiIdentifier);

        if (!pages) {
          return { content: [{ type: "text", text: "No wiki pages found" }], isError: true };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(pages) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching wiki pages: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wiki_get_page_content",
    
    inputSchema: {
      type: "object",
      properties: {
        wikiIdentifier: { type: "string" },
        project: { type: "string" },
        path: { type: "string" }
      },
      required: ["wikiIdentifier", "project", "path"]
    },
    handler: async (args, connection) => {
      try {
        const wikiApi = await connection.getWikiApi();

        const stream = await wikiApi.getPageText(args.project, args.wikiIdentifier, args.path, undefined, undefined, true);

        if (!stream) {
          return {
            content: [{ type: "text", text: "No wiki page content found" }],
            isError: true
          };
        }

        const content = await streamToString(stream);

        return {
          content: [{ type: "text", text: JSON.stringify({ path: args.path, content }, null, 2) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting wiki page content: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wiki_create_or_update_page",
    
    inputSchema: {
      type: "object",
      properties: {
        wikiIdentifier: { type: "string" },
        path: { type: "string" },
        content: { type: "string" },
        project: { type: "string" },
        etag: { type: "string" }
      },
      required: ["wikiIdentifier", "path", "content"]
    },
    handler: async (args, connection) => {
      try {
        // This requires direct REST API call with proper authentication
        const normalizedPath = args.path.startsWith("/") ? args.path : `/${args.path}`;
        const encodedPath = encodeURIComponent(normalizedPath);
        
        const baseUrl = connection.serverUrl;
        const projectParam = args.project || "";
        const url = `${baseUrl}/${projectParam}/_apis/wiki/wikis/${args.wikiIdentifier}/pages?path=${encodedPath}&api-version=7.1`;

        const result = {
          message: "Wiki page create/update functionality requires direct REST API implementation with proper authentication.",
          endpoint: url,
          path: normalizedPath,
          contentLength: args.content.length
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error creating/updating wiki page: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  // ============================================================================
  // SEARCH TOOLS (3 tools)  
  // ============================================================================
  {
    name: "search_code",
    
    inputSchema: {
      type: "object",
      properties: {
        searchText: { type: "string" },
        project: { type: "array", items: { type: "string" } },
        repository: { type: "array", items: { type: "string" } },
        path: { type: "array", items: { type: "string" } },
        branch: { type: "array", items: { type: "string" } },
        top: { type: "number"}
      },
      required: ["searchText"]
    },
    handler: async (args, connection) => {
      try {
        // This requires direct REST API call to the search service
        const orgName = connection.serverUrl.split("/")[3];
        const url = `https://almsearch.dev.azure.com/${orgName}/_apis/search/codesearchresults?api-version=7.2-preview.1`;

        const filters: Record<string, string[]> = {};
        if (args.project && args.project.length > 0) filters.Project = args.project;
        if (args.repository && args.repository.length > 0) filters.Repository = args.repository;
        if (args.path && args.path.length > 0) filters.Path = args.path;
        if (args.branch && args.branch.length > 0) filters.Branch = args.branch;

        const requestBody = {
          searchText: args.searchText,
          includeFacets: false,
          $skip: 0,
          $top: args.top || 5,
          filters: Object.keys(filters).length > 0 ? filters : undefined
        };

        const result = {
          message: "Code search functionality requires direct REST API implementation with proper authentication.",
          searchText: args.searchText,
          endpoint: url,
          filters,
          requestBody
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error searching code: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "search_wiki",
    
    inputSchema: {
      type: "object",
      properties: {
        searchText: { type: "string" },
        project: { type: "array", items: { type: "string" } },
        wiki: { type: "array", items: { type: "string" } },
        top: { type: "number"}
      },
      required: ["searchText"]
    },
    handler: async (args, connection) => {
      try {
        // This requires direct REST API call to the search service
        const orgName = connection.serverUrl.split("/")[3];
        const url = `https://almsearch.dev.azure.com/${orgName}/_apis/search/wikisearchresults?api-version=7.2-preview.1`;

        const filters: Record<string, string[]> = {};
        if (args.project && args.project.length > 0) filters.Project = args.project;
        if (args.wiki && args.wiki.length > 0) filters.Wiki = args.wiki;

        const result = {
          message: "Wiki search functionality requires direct REST API implementation with proper authentication.",
          searchText: args.searchText,
          endpoint: url,
          filters
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error searching wiki: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "search_workitem",
    
    inputSchema: {
      type: "object",
      properties: {
        searchText: { type: "string" },
        project: { type: "array", items: { type: "string" } },
        areaPath: { type: "array", items: { type: "string" } },
        workItemType: { type: "array", items: { type: "string" } },
        state: { type: "array", items: { type: "string" } },
        assignedTo: { type: "array", items: { type: "string" } },
        top: { type: "number"}
      },
      required: ["searchText"]
    },
    handler: async (args, connection) => {
      try {
        // This requires direct REST API call to the search service
        const orgName = connection.serverUrl.split("/")[3];
        const url = `https://almsearch.dev.azure.com/${orgName}/_apis/search/workitemsearchresults?api-version=7.2-preview.1`;

        const filters: Record<string, string[]> = {};
        if (args.project && args.project.length > 0) filters["System.TeamProject"] = args.project;
        if (args.areaPath && args.areaPath.length > 0) filters["System.AreaPath"] = args.areaPath;
        if (args.workItemType && args.workItemType.length > 0) filters["System.WorkItemType"] = args.workItemType;
        if (args.state && args.state.length > 0) filters["System.State"] = args.state;
        if (args.assignedTo && args.assignedTo.length > 0) filters["System.AssignedTo"] = args.assignedTo;

        const result = {
          message: "Work item search functionality requires direct REST API implementation with proper authentication.",
          searchText: args.searchText,
          endpoint: url,
          filters
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error searching work items: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  // ============================================================================
  // WORK/ITERATION TOOLS (3 tools)
  // ============================================================================
  {
    name: "work_list_team_iterations",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        team: { type: "string" },
        timeframe: { type: "string", enum: ["current", "past", "future"] }
      },
      required: ["project", "team"]
    },
    handler: async (args, connection) => {
      try {
        const workApi = await connection.getWorkApi();
        const iterations = await workApi.getTeamIterations(
          { project: args.project, team: args.team }, 
          args.timeframe as any
        );
        
        if (!iterations || iterations.length === 0) {
          return {
            content: [{ type: "text", text: `No iterations found for team ${args.team} in project ${args.project}` }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(iterations) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching team iterations: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "work_get_team_settings",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        team: { type: "string" }
      },
      required: ["project", "team"]
    },
    handler: async (args, connection) => {
      try {
        const workApi = await connection.getWorkApi();
        const teamSettings = await workApi.getTeamSettings({ project: args.project, team: args.team });
        
        if (!teamSettings) {
          return {
            content: [{ type: "text", text: `No settings found for team ${args.team} in project ${args.project}` }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(teamSettings) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching team settings: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "work_get_team_field_values",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        team: { type: "string" }
      },
      required: ["project", "team"]
    },
    handler: async (args, connection) => {
      try {
        const workApi = await connection.getWorkApi();
        const teamFieldValues = await workApi.getTeamFieldValues({ project: args.project, team: args.team });
        
        if (!teamFieldValues) {
          return {
            content: [{ type: "text", text: `No field values found for team ${args.team} in project ${args.project}` }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(teamFieldValues) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching team field values: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  // ============================================================================
  // RELEASE TOOLS (4 tools)
  // ============================================================================
  {
    name: "release_list_definitions",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        searchText: { type: "string" }
      },
      required: ["project"]
    },
    handler: async (args, connection) => {
      try {
        const releaseApi = await connection.getReleaseApi();
        const definitions = await releaseApi.getReleaseDefinitions(
          args.project, 
          args.searchText
        );
        
        if (!definitions || definitions.length === 0) {
          return {
            content: [{ type: "text", text: `No release definitions found for project: ${args.project}` }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(definitions) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching release definitions: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "release_get_releases",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        definitionId: { type: "number" },
        top: { type: "number" }
      },
      required: ["project"]
    },
    handler: async (args, connection) => {
      try {
        const releaseApi = await connection.getReleaseApi();
        const releases = await releaseApi.getReleases(
          args.project,
          args.definitionId,
          undefined, // definitionEnvironmentId
          undefined, // searchText
          undefined, // createdBy
          undefined, // statusFilter
          undefined, // environmentStatusFilter
          undefined, // minCreatedTime
          undefined, // maxCreatedTime
          undefined, // queryOrder
          args.top || 10
        );
        
        if (!releases || releases.length === 0) {
          return {
            content: [{ type: "text", text: `No releases found for project: ${args.project}` }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(releases) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching releases: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "release_create_release",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        definitionId: { type: "number" },
        description: { type: "string" }
      },
      required: ["project", "definitionId"]
    },
    handler: async (args, connection) => {
      try {
        const releaseApi = await connection.getReleaseApi();
        
        const releaseStartMetadata = {
          definitionId: args.definitionId,
          description: args.description || `Release created on ${new Date().toISOString()}`
        };
        
        const release = await releaseApi.createRelease(releaseStartMetadata, args.project);
        
        return {
          content: [{ type: "text", text: JSON.stringify(release) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error creating release: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "release_get_release",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        releaseId: { type: "number" }
      },
      required: ["project", "releaseId"]
    },
    handler: async (args, connection) => {
      try {
        const releaseApi = await connection.getReleaseApi();
        const release = await releaseApi.getRelease(args.project, args.releaseId);
        
        if (!release) {
          return {
            content: [{ type: "text", text: `Release ${args.releaseId} not found in project ${args.project}` }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(release) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching release: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  // ============================================================================
  // TEST PLAN TOOLS (6 tools)
  // ============================================================================
  {
    name: "testplan_list_test_plans",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        filterActivePlans: { type: "boolean" },
        includePlanDetails: { type: "boolean" },
        continuationToken: { type: "string" }
      },
      required: ["project"]
    },
    handler: async (args, connection) => {
      try {
        const testPlanApi = await connection.getTestPlanApi();
        const owner = ""; // Making owner empty until we figure out how to get owner ID
        
        const testPlans = await testPlanApi.getTestPlans(
          args.project, 
          owner, 
          args.continuationToken && args.continuationToken !== '' ? args.continuationToken : undefined, 
          args.includePlanDetails || false, 
          args.filterActivePlans !== false
        );

        if (!testPlans || testPlans.length === 0) {
          return {
            content: [{ type: "text", text: `No test plans found for project: ${args.project}` }],
            isError: true
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(testPlans) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching test plans: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "testplan_create_test_plan",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        areaPath: { type: "string" },
        iterationPath: { type: "string" }
      },
      required: ["project", "name"]
    },
    handler: async (args, connection) => {
      try {
        const testPlanApi = await connection.getTestPlanApi();
        
        const testPlanCreateParams = {
          name: args.name,
          description: args.description,
          areaPath: args.areaPath,
          iteration: args.iterationPath
        };
        
        const testPlan = await testPlanApi.createTestPlan(testPlanCreateParams, args.project);
        
        return {
          content: [{ type: "text", text: JSON.stringify(testPlan) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error creating test plan: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "testplan_create_test_case",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        title: { type: "string" },
        steps: { type: "string" },
        areaPath: { type: "string" }
      },
      required: ["project", "title"]
    },
    handler: async (args, connection) => {
      try {
        // Test case creation requires work item tracking API since test cases are work items
        const witApi = await connection.getWorkItemTrackingApi();
        
        const patchDocument = [
          { op: "add", path: "/fields/System.Title", value: args.title }
        ];
        
        if (args.steps) {
          patchDocument.push({ op: "add", path: "/fields/Microsoft.VSTS.TCM.Steps", value: args.steps });
        }
        if (args.areaPath) {
          patchDocument.push({ op: "add", path: "/fields/System.AreaPath", value: args.areaPath });
        }
        
        const testCase = await witApi.createWorkItem(null, patchDocument as any, args.project, "Test Case");
        
        return {
          content: [{ type: "text", text: JSON.stringify(testCase) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error creating test case: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "testplan_list_test_cases",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        top: { type: "number" }
      },
      required: ["project"]
    },
    handler: async (args, connection) => {
      try {
        // Use WIQL query to find test cases
        const witApi = await connection.getWorkItemTrackingApi();
        const wiql = `SELECT [System.Id], [System.Title], [System.State] FROM WorkItems WHERE [System.WorkItemType] = 'Test Case' AND [System.TeamProject] = '${args.project}' ORDER BY [System.Id] DESC`;
        
        const queryResult = await witApi.queryByWiql({ query: wiql });
        
        if (!queryResult.workItems || queryResult.workItems.length === 0) {
          return {
            content: [{ type: "text", text: `No test cases found for project: ${args.project}` }],
            isError: true
          };
        }
        
        const limitedIds = queryResult.workItems.slice(0, args.top || 10).map(wi => wi.id!);
        const workItems = await witApi.getWorkItems(limitedIds);
        
        return {
          content: [{ type: "text", text: JSON.stringify(workItems) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error listing test cases: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "testplan_add_test_cases_to_suite",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        planId: { type: "number" },
        suiteId: { type: "number" },
        testCaseIds: { type: "array", items: { type: "number" } }
      },
      required: ["project", "planId", "suiteId", "testCaseIds"]
    },
    handler: async (args, connection) => {
      try {
        // This requires direct API calls to test plan services
        const result = {
          message: "Adding test cases to suite functionality requires direct REST API implementation.",
          planId: args.planId,
          suiteId: args.suiteId,
          testCaseIds: args.testCaseIds
        };
        
        return {
          content: [{ type: "text", text: JSON.stringify(result) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error adding test cases to suite: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "testplan_get_test_results_from_build",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        buildId: { type: "number" }
      },
      required: ["project", "buildId"]
    },
    handler: async (args, connection) => {
      try {
        const testApi = await connection.getTestApi();
        const testResults = await testApi.getTestResults(args.project, undefined, undefined, undefined, args.buildId);
        
        if (!testResults || testResults.length === 0) {
          return {
            content: [{ type: "text", text: `No test results found for build ${args.buildId}` }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(testResults) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching test results: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  // ============================================================================
  // ADVANCED SECURITY TOOLS (2 tools)
  // ============================================================================
  {
    name: "advsec_get_alerts",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        repository: { type: "string" },
        alertType: { type: "string", enum: ["dependency", "secret", "code"] },
        states: { type: "array", items: { type: "string", enum: ["active", "dismissed", "fixed"] } },
        severities: { type: "array", items: { type: "string", enum: ["critical", "high", "medium", "low"] } },
        top: { type: "number" },
        onlyDefaultBranch: { type: "boolean" }
      },
      required: ["project", "repository"]
    },
    handler: async (args, connection) => {
      try {
        // This requires direct REST API call to Advanced Security APIs
        const orgName = connection.serverUrl.split("/")[3];
        const endpoint = `https://advsec.dev.azure.com/${orgName}/${args.project}/_apis/alert/repositories/${args.repository}/alerts`;
        
        const filters = [];
        if (args.alertType) filters.push(`alertType=${args.alertType}`);
        if (args.states) filters.push(`states=${args.states.join(',')}`);
        if (args.severities) filters.push(`severities=${args.severities.join(',')}`);
        if (args.top) filters.push(`$top=${args.top}`);
        if (args.onlyDefaultBranch !== false) filters.push('onlyDefaultBranch=true');
        
        const url = filters.length > 0 ? `${endpoint}?${filters.join('&')}` : endpoint;
        
        const result = {
          message: "Advanced Security alerts functionality requires direct REST API implementation with proper authentication.",
          repository: args.repository,
          endpoint: url,
          alertType: args.alertType || 'all',
          states: args.states || [],
          severities: args.severities || []
        };
        
        return {
          content: [{ type: "text", text: JSON.stringify(result) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching security alerts: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "advsec_get_alert_details",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        repository: { type: "string" },
        alertId: { type: "number" }
      },
      required: ["project", "repository", "alertId"]
    },
    handler: async (args, connection) => {
      try {
        // This requires direct REST API call to Advanced Security APIs
        const orgName = connection.serverUrl.split("/")[3];
        const endpoint = `https://advsec.dev.azure.com/${orgName}/${args.project}/_apis/alert/repositories/${args.repository}/alerts/${args.alertId}`;
        
        const result = {
          message: "Advanced Security alert details functionality requires direct REST API implementation with proper authentication.",
          repository: args.repository,
          alertId: args.alertId,
          endpoint
        };
        
        return {
          content: [{ type: "text", text: JSON.stringify(result) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching security alert details: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  // ============================================================================
  // LEGACY ALIASES (backward compatibility)
  // ============================================================================
  {
    name: "get_work_item",
    
    inputSchema: {
      type: "object",
      properties: {
        workItemId: { type: "number" }
      },
      required: ["workItemId"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        const workItem = await witApi.getWorkItem(args.workItemId);
        
        if (!workItem) {
          return {
            content: [{ type: "text", text: `Work item ${args.workItemId} not found.` }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(workItem) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting work item: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "list_projects",
    
    inputSchema: {
      type: "object",
      properties: {
        nameFilter: { type: "string" }
      }
    },
    handler: async (args, connection) => {
      try {
        const coreApi = await connection.getCoreApi();
        const projects = await coreApi.getProjects();
        
        let filteredProjects = projects;
        if (args.nameFilter) {
          const lowerFilter = args.nameFilter.toLowerCase();
          filteredProjects = projects.filter(p => p.name?.toLowerCase().includes(lowerFilter));
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(filteredProjects) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error listing projects: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "build_list_definitions", 
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        name: { type: "string" },
        type: { type: "string" }
      },
      required: ["project"]
    },
    handler: async (args, connection) => {
      try {
        const buildApi = await connection.getBuildApi();
        const definitions = await buildApi.getDefinitions(args.project, args.name);
        
        if (!definitions || definitions.length === 0) {
          return {
            content: [{ type: "text", text: `No build definitions found for project: ${args.project}` }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(definitions) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error listing build definitions: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "build_get_builds",
    
    inputSchema: {
      type: "object", 
      properties: {
        project: { type: "string" },
        definitionIds: { type: "string" },
        statusFilter: { type: "string" },
        top: { type: "number" }
      },
      required: ["project"]
    },
    handler: async (args, connection) => {
      try {
        const buildApi = await connection.getBuildApi();
        const top = args.top || 10;
        
        let definitionIds: number[] | undefined;
        if (args.definitionIds) {
          definitionIds = args.definitionIds.split(',').map((id: string) => parseInt(id.trim()));
        }
        
        const builds = await buildApi.getBuilds(
          args.project, 
          definitionIds, 
          undefined, undefined, undefined, undefined, undefined, undefined, 
          args.statusFilter, undefined, undefined, undefined, top
        );
        
        if (!builds || builds.length === 0) {
          return {
            content: [{ type: "text", text: `No builds found for project: ${args.project}` }],
            isError: true
          };
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(builds) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting builds: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  // ============================================================================
  // ADVANCED WORK ITEM TOOLS (16 additional tools)
  // ============================================================================
  {
    name: "wit_my_work_items",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        type: { 
          type: "string",
          enum: ["assignedtome", "myactivity"]
        },
        top: { type: "number" },
        includeCompleted: { type: "boolean" }
      },
      required: ["project"]
    },
    handler: async (args, connection) => {
      try {
        const workApi = await connection.getWorkApi();
        
        const workItems = await workApi.getPredefinedQueryResults(
          args.project,
          args.type || "assignedtome",
          args.top || 50,
          args.includeCompleted || false
        );
        
        return {
          content: [{ type: "text", text: JSON.stringify(workItems) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching my work items: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_list_backlogs",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        team: { type: "string" }
      },
      required: ["project", "team"]
    },
    handler: async (args, connection) => {
      try {
        const workApi = await connection.getWorkApi();
        const backlogs = await workApi.getBacklogs({ project: args.project, team: args.team });
        
        return {
          content: [{ type: "text", text: JSON.stringify(backlogs) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching backlogs: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_get_work_items_batch_by_ids",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        ids: { 
          type: "array",
          items: { type: "number" }
        },
        fields: {
          type: "array",
          items: { type: "string" }
        }
      },
      required: ["project", "ids"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        const defaultFields = [
          "System.Id", 
          "System.WorkItemType", 
          "System.Title", 
          "System.State", 
          "System.Parent", 
          "System.Tags", 
          "Microsoft.VSTS.Common.StackRank", 
          "System.AssignedTo"
        ];
        
        const fieldsToUse = !args.fields || args.fields.length === 0 ? defaultFields : args.fields;
        const workItems = await witApi.getWorkItemsBatch(
          { ids: args.ids, fields: fieldsToUse }, 
          args.project
        );
        
        return {
          content: [{ type: "text", text: JSON.stringify(workItems) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting work items batch: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_list_work_item_comments",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        workItemId: { type: "number" },
        top: { type: "number" }
      },
      required: ["project", "workItemId"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        const comments = await witApi.getComments(
          args.project,
          args.workItemId,
          args.top || 50
        );
        
        return {
          content: [{ type: "text", text: JSON.stringify(comments) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching work item comments: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_add_work_item_comment",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        workItemId: { type: "number" },
        comment: { type: "string" },
        format: { 
          type: "string",
          enum: ["html", "markdown"]
        }
      },
      required: ["project", "workItemId", "comment"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        const comment = await witApi.addComment(
          { text: args.comment },
          args.project,
          args.workItemId
        );
        
        return {
          content: [{ type: "text", text: JSON.stringify(comment) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error adding work item comment: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_add_child_work_items",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        parentWorkItemId: { type: "number" },
        childWorkItems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              workItemType: { type: "string" },
              fields: { type: "object" }
            },
            required: ["title", "workItemType"]
          }
        }
      },
      required: ["project", "parentWorkItemId", "childWorkItems"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        const createdItems = [];
        
        for (const childItem of args.childWorkItems) {
          const document = [
            {
              op: "add",
              path: "/fields/System.Title",
              value: childItem.title
            }
          ];
          
          if (childItem.fields) {
            Object.entries(childItem.fields).forEach(([field, value]) => {
              document.push({
                op: "add",
                path: `/fields/${field}`,
                value: value
              });
            });
          }
          
          const workItem = await witApi.createWorkItem(
            document,
            args.project,
            childItem.workItemType,
            undefined,
            undefined,
            undefined,
            undefined
          );
          
          if (workItem.id) {
            await witApi.updateWorkItem(
              [
                {
                  op: "add",
                  path: "/relations/-",
                  value: {
                    rel: "System.LinkTypes.Hierarchy-Reverse",
                    url: `${connection.serverUrl}/${args.project}/_apis/wit/workItems/${args.parentWorkItemId}`
                  }
                }
              ],
              workItem.id,
              args.project
            );
          }
          
          createdItems.push(workItem);
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(createdItems) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error adding child work items: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_link_work_item_to_pull_request",
    
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        repositoryId: { type: "string" },
        pullRequestId: { type: "number" },
        workItemId: { type: "number" },
        pullRequestProjectId: { type: "string" }
      },
      required: ["projectId", "repositoryId", "pullRequestId", "workItemId"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        const gitApi = await connection.getGitApi();
        
        const pullRequest = await gitApi.getPullRequest(
          args.repositoryId, 
          args.pullRequestId, 
          args.pullRequestProjectId || args.projectId
        );
        
        const updatedWorkItem = await witApi.updateWorkItem(
          [
            {
              op: "add",
              path: "/relations/-",
              value: {
                rel: "ArtifactLink",
                url: pullRequest._links!.web!.href,
                attributes: {
                  name: "Pull Request"
                }
              }
            }
          ],
          args.workItemId,
          args.projectId
        );
        
        return {
          content: [{ type: "text", text: JSON.stringify(updatedWorkItem) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error linking work item to pull request: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_get_work_item_relations",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        workItemId: { type: "number" }
      },
      required: ["project", "workItemId"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        // Ensure relations are included in the response
        const workItem = await witApi.getWorkItem(
          args.workItemId,
          undefined,
          undefined,
          WorkItemExpand.Relations,
          args.project
        );
        
        return {
          content: [{ type: "text", text: JSON.stringify(workItem.relations || []) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting work item relations: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_get_work_item_history",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        workItemId: { type: "number" },
        top: { type: "number" }
      },
      required: ["project", "workItemId"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        const updates = await witApi.getUpdates(args.workItemId, args.project, args.top);
        
        return {
          content: [{ type: "text", text: JSON.stringify(updates) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting work item history: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_get_work_item_types",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" }
      },
      required: ["project"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        const workItemTypes = await witApi.getWorkItemTypes(args.project);
        
        return {
          content: [{ type: "text", text: JSON.stringify(workItemTypes) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting work item types: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_get_work_item_attachments",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        workItemId: { type: "number" }
      },
      required: ["project", "workItemId"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        const workItem = await witApi.getWorkItem(args.workItemId, undefined, undefined, undefined, args.project);
        
        const attachments = workItem.relations?.filter(rel => 
          rel.rel === "AttachedFile"
        ) || [];
        
        return {
          content: [{ type: "text", text: JSON.stringify(attachments) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting work item attachments: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_batch_update_work_items",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        updates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              workItemId: { type: "number" },
              fields: { type: "object" }
            },
            required: ["workItemId", "fields"]
          }
        }
      },
      required: ["project", "updates"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        const updatedItems = [];
        
        for (const update of args.updates) {
          const document = Object.entries(update.fields).map(([field, value]) => ({
            op: "replace",
            path: `/fields/${field}`,
            value: value
          }));
          
          const updatedItem = await witApi.updateWorkItem(
            document,
            update.workItemId,
            args.project
          );
          updatedItems.push(updatedItem);
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(updatedItems) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error batch updating work items: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_get_work_item_fields",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        expand: { 
          type: "string", 
          enum: ["None", "ExtensionFields", "IncludeDeleted"]
        }
      }
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        const fields = await witApi.getFields(args.project, args.expand);
        
        return {
          content: [{ type: "text", text: JSON.stringify(fields) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting work item fields: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_get_work_item_states",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        workItemType: { type: "string" }
      },
      required: ["project", "workItemType"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        const workItemType = await witApi.getWorkItemType(args.project, args.workItemType);
        
        return {
          content: [{ type: "text", text: JSON.stringify(workItemType.states || []) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting work item states: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_create_work_item_link",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        sourceWorkItemId: { type: "number" },
        targetWorkItemId: { type: "number" },
        linkType: { type: "string" },
        comment: { type: "string" }
      },
      required: ["project", "sourceWorkItemId", "targetWorkItemId", "linkType"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        
        const updatedWorkItem = await witApi.updateWorkItem(
          [
            {
              op: "add",
              path: "/relations/-",
              value: {
                rel: args.linkType,
                url: `${connection.serverUrl}/${args.project}/_apis/wit/workItems/${args.targetWorkItemId}`,
                attributes: args.comment ? { comment: args.comment } : undefined
              }
            }
          ],
          args.sourceWorkItemId,
          args.project
        );
        
        return {
          content: [{ type: "text", text: JSON.stringify(updatedWorkItem) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error creating work item link: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_get_work_item_revisions",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        workItemId: { type: "number" },
        top: { type: "number" },
        skip: { type: "number" },
        expand: { 
          type: "string", 
          enum: ["None", "Relations", "Fields", "Links", "All"]
        }
      },
      required: ["project", "workItemId"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        const revisions = await witApi.getRevisions(
          args.workItemId,
          args.project,
          args.top,
          args.skip,
          args.expand
        );
        
        return {
          content: [{ type: "text", text: JSON.stringify(revisions) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting work item revisions: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  // Missing Microsoft work item tools
  {
    name: "wit_get_work_items_for_iteration",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        team: { type: "string" },
        iterationId: { type: "string" }
      },
      required: ["project", "iterationId"]
    },
    handler: async (args, connection) => {
      try {
        const workApi = await connection.getWorkApi();
        const workItems = await workApi.getIterationWorkItems(
          { project: args.project, team: args.team },
          args.iterationId
        );
        
        return {
          content: [{ type: "text", text: JSON.stringify(workItems) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting iteration work items: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_list_backlog_work_items",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        team: { type: "string" },
        backlogId: { type: "string" }
      },
      required: ["project", "team", "backlogId"]
    },
    handler: async (args, connection) => {
      try {
        const workApi = await connection.getWorkApi();
        const workItems = await workApi.getBacklogLevelWorkItems(
          { project: args.project, team: args.team },
          args.backlogId
        );
        
        return {
          content: [{ type: "text", text: JSON.stringify(workItems) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching backlog work items: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_get_work_item_type",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        workItemType: { type: "string" }
      },
      required: ["project", "workItemType"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        const workItemType = await witApi.getWorkItemType(args.project, args.workItemType);
        
        return {
          content: [{ type: "text", text: JSON.stringify(workItemType) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting work item type: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_get_query",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        query: { type: "string" },
        expand: { 
          type: "string",
          enum: ["all", "clauses", "minimal", "none", "wiql"]
        },
        depth: { type: "number" },
        includeDeleted: { type: "boolean" },
        useIsoDateFormat: { type: "boolean" }
      },
      required: ["project", "query"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        const queryItem = await witApi.getQuery(
          args.project,
          args.query,
          args.expand,
          args.depth || 0,
          args.includeDeleted || false,
          args.useIsoDateFormat || false
        );
        
        return {
          content: [{ type: "text", text: JSON.stringify(queryItem) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting query: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_get_query_results_by_id",
    
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        project: { type: "string" },
        team: { type: "string" },
        timePrecision: { type: "boolean" },
        top: { type: "number" }
      },
      required: ["id"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        const teamContext = args.project || args.team ? { project: args.project, team: args.team } : undefined;
        const queryResult = await witApi.queryById(
          args.id,
          teamContext,
          args.timePrecision,
          args.top || 50
        );
        
        return {
          content: [{ type: "text", text: JSON.stringify(queryResult) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting query results: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_update_work_items_batch",
    
    inputSchema: {
      type: "object",
      properties: {
        updates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: { 
                type: "string",
                enum: ["Add", "Replace", "Remove"]
              },
              id: { type: "number" },
              path: { type: "string" },
              value: { type: "string" },
              format: { 
                type: "string",
                enum: ["Html", "Markdown"]
              }
            },
            required: ["op", "id", "path"]
          }
        }
      },
      required: ["updates"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        const updatedItems = [];
        
        for (const update of args.updates) {
          const patchDoc = [{
            op: update.op.toLowerCase(),
            path: update.path,
            value: update.value
          }];
          
          const updatedItem = await witApi.updateWorkItem(
            null,
            patchDoc as any,
            update.id
          );
          updatedItems.push(updatedItem);
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(updatedItems) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error batch updating work items: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_work_items_link",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        id: { type: "number" },
        linkToId: { type: "number" },
        linkType: { 
          type: "string",
          enum: ["parent", "child", "duplicate", "duplicate of", "related", "successor", "predecessor", "tested by", "tests", "affects", "affected by"]
        },
        comment: { type: "string" }
      },
      required: ["project", "id", "linkToId", "linkType"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        
        // Map friendly names to actual link types
        const linkTypeMap: Record<string, string> = {
          "parent": "System.LinkTypes.Hierarchy-Reverse",
          "child": "System.LinkTypes.Hierarchy-Forward",
          "duplicate": "System.LinkTypes.Duplicate-Forward",
          "duplicate of": "System.LinkTypes.Duplicate-Reverse",
          "related": "System.LinkTypes.Related",
          "successor": "System.LinkTypes.Dependency-Forward",
          "predecessor": "System.LinkTypes.Dependency-Reverse",
          "tested by": "Microsoft.VSTS.Common.TestedBy-Forward",
          "tests": "Microsoft.VSTS.Common.TestedBy-Reverse",
          "affects": "Microsoft.VSTS.Common.Affects-Forward",
          "affected by": "Microsoft.VSTS.Common.Affects-Reverse"
        };
        
        const actualLinkType = linkTypeMap[args.linkType] || args.linkType;
        
        const updatedWorkItem = await witApi.updateWorkItem(
          null,
          [
            {
              op: "add",
              path: "/relations/-",
              value: {
                rel: actualLinkType,
                url: `${connection.serverUrl}/${args.project}/_apis/wit/workItems/${args.linkToId}`,
                attributes: args.comment ? { comment: args.comment } : undefined
              }
            }
          ] as any,
          args.id,
          args.project
        );
        
        return {
          content: [{ type: "text", text: JSON.stringify(updatedWorkItem) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error linking work items: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_work_item_unlink",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        id: { type: "number" },
        type: { type: "string" },
        url: { type: "string" }
      },
      required: ["project", "id"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        
        // If URL is provided, remove specific link
        if (args.url) {
          const workItem = await witApi.getWorkItem(args.id, undefined, undefined, undefined, args.project);
          const relationIndex = workItem.relations?.findIndex(rel => rel.url === args.url);
          
          if (relationIndex !== undefined && relationIndex >= 0) {
            const updatedWorkItem = await witApi.updateWorkItem(
              null,
              [
                {
                  op: "remove",
                  path: `/relations/${relationIndex}`
                }
              ] as any,
              args.id,
              args.project
            );
            
            return {
              content: [{ type: "text", text: JSON.stringify(updatedWorkItem) }]
            };
          } else {
            return {
              content: [{ type: "text", text: `Link not found for work item ${args.id}` }],
              isError: true
            };
          }
        } else {
          return {
            content: [{ type: "text", text: "URL parameter is required to unlink work items" }],
            isError: true
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error unlinking work items: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "wit_add_artifact_link",
    
    inputSchema: {
      type: "object",
      properties: {
        workItemId: { type: "number" },
        project: { type: "string" },
        artifactUri: { type: "string" },
        projectId: { type: "string" },
        repositoryId: { type: "string" },
        branchName: { type: "string" },
        commitId: { type: "string" },
        pullRequestId: { type: "number" },
        buildId: { type: "number" },
        linkType: { type: "string" },
        comment: { type: "string" }
      },
      required: ["workItemId", "project"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        
        // Build artifact URI based on provided parameters
        let artifactUri = args.artifactUri;
        if (!artifactUri) {
          if (args.pullRequestId && args.repositoryId) {
            artifactUri = `vstfs:///Git/PullRequestId/${args.projectId || args.project}%2F${args.repositoryId}%2F${args.pullRequestId}`;
          } else if (args.commitId && args.repositoryId) {
            artifactUri = `vstfs:///Git/Commit/${args.projectId || args.project}%2F${args.repositoryId}%2F${args.commitId}`;
          } else if (args.buildId) {
            artifactUri = `vstfs:///Build/Build/${args.buildId}`;
          }
        }
        
        if (!artifactUri) {
          return {
            content: [{ type: "text", text: "Unable to construct artifact URI from provided parameters" }],
            isError: true
          };
        }
        
        const updatedWorkItem = await witApi.updateWorkItem(
          null,
          [
            {
              op: "add",
              path: "/relations/-",
              value: {
                rel: args.linkType || "ArtifactLink",
                url: artifactUri,
                attributes: args.comment ? { comment: args.comment } : undefined
              }
            }
          ] as any,
          args.workItemId,
          args.project
        );
        
        return {
          content: [{ type: "text", text: JSON.stringify(updatedWorkItem) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error adding artifact link: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  // ============================================================================
  // WORK/ITERATION MANAGEMENT TOOLS (6 additional tools)
  // ============================================================================
  {
    name: "work_create_iterations",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        teamId: { type: "string" },
        iterations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              path: { type: "string" },
              startDate: { type: "string" },
              finishDate: { type: "string" }
            },
            required: ["name"]
          }
        }
      },
      required: ["project", "teamId", "iterations"]
    },
    handler: async (args, connection) => {
      try {
        const workApi = await connection.getWorkApi();
        const createdIterations = [];
        
        for (const iteration of args.iterations) {
          const iterationData = {
            name: iteration.name,
            path: iteration.path || `\\${args.project}\\Iteration\\${iteration.name}`,
            attributes: {
              startDate: iteration.startDate ? new Date(iteration.startDate) : undefined,
              finishDate: iteration.finishDate ? new Date(iteration.finishDate) : undefined
            }
          };
          
          const created = await workApi.postTeamIteration(
            iterationData,
            { projectId: args.project, team: args.teamId }
          );
          createdIterations.push(created);
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(createdIterations) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error creating iterations: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "work_assign_iterations",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        teamId: { type: "string" },
        iterationId: { type: "string" },
        workItemIds: {
          type: "array",
          items: { type: "number" }
        }
      },
      required: ["project", "teamId", "iterationId", "workItemIds"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        const workApi = await connection.getWorkApi();
        
        // Get iteration details to get the path
        const iteration = await workApi.getTeamIteration({ projectId: args.project, team: args.teamId }, args.iterationId);
        
        const updatedItems = [];
        for (const workItemId of args.workItemIds) {
          const updated = await witApi.updateWorkItem(
            [
              {
                op: "replace",
                path: "/fields/System.IterationPath",
                value: iteration.path
              }
            ],
            workItemId,
            args.project
          );
          updatedItems.push(updated);
        }
        
        return {
          content: [{ type: "text", text: JSON.stringify(updatedItems) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error assigning work items to iteration: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "work_list_team_iterations",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        teamId: { type: "string" },
        timeframe: { 
          type: "string", 
          enum: ["current", "past", "future"]
        }
      },
      required: ["project", "teamId"]
    },
    handler: async (args, connection) => {
      try {
        const workApi = await connection.getWorkApi();
        const iterations = await workApi.getTeamIterations(
          { projectId: args.project, team: args.teamId },
          args.timeframe
        );
        
        return {
          content: [{ type: "text", text: JSON.stringify(iterations) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching team iterations: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "work_get_iteration_work_items",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        teamId: { type: "string" },
        iterationId: { type: "string" }
      },
      required: ["project", "teamId", "iterationId"]
    },
    handler: async (args, connection) => {
      try {
        const workApi = await connection.getWorkApi();
        const iterationWorkItems = await workApi.getIterationWorkItems(
          { projectId: args.project, team: args.teamId },
          args.iterationId
        );
        
        return {
          content: [{ type: "text", text: JSON.stringify(iterationWorkItems) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching iteration work items: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "work_get_team_capacity",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        teamId: { type: "string" },
        iterationId: { type: "string" }
      },
      required: ["project", "teamId", "iterationId"]
    },
    handler: async (args, connection) => {
      try {
        // Simplified capacity fetch - using basic team settings API
        return {
          content: [{ type: "text", text: JSON.stringify({ message: "Team capacity API not fully compatible with current Azure DevOps Node API version" }) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error fetching team capacity: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "work_set_team_capacity",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        teamId: { type: "string" },
        iterationId: { type: "string" },
        capacities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              teamMemberId: { type: "string" },
              activitiesPerDay: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    capacityPerDay: { type: "number" },
                    name: { type: "string" }
                  }
                }
              }
            },
            required: ["teamMemberId"]
          }
        }
      },
      required: ["project", "teamId", "iterationId", "capacities"]
    },
    handler: async (args, connection) => {
      try {
        // Simplified capacity setting - using basic team settings API
        return {
          content: [{ type: "text", text: JSON.stringify({ message: "Team capacity API not fully compatible with current Azure DevOps Node API version" }) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error setting team capacity: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  // ============================================================================
  // EXTENDED BUILD TOOLS (8 additional tools)
  // ============================================================================
  {
    name: "build_queue_build",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        definitionId: { type: "number" },
        sourceBranch: { type: "string" },
        parameters: { type: "string" }
      },
      required: ["project", "definitionId"]
    },
    handler: async (args, connection) => {
      try {
        const buildApi = await connection.getBuildApi();
        
        const buildRequest = {
          definition: { id: args.definitionId },
          sourceBranch: args.sourceBranch || "refs/heads/main",
          parameters: args.parameters
        };
        
        const build = await buildApi.queueBuild(buildRequest, args.project);
        
        return {
          content: [{ type: "text", text: JSON.stringify(build) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error queuing build: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "build_cancel_build",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        buildId: { type: "number" }
      },
      required: ["project", "buildId"]
    },
    handler: async (args, connection) => {
      try {
        const buildApi = await connection.getBuildApi();
        
        const updatedBuild = await buildApi.updateBuild(
          { status: 4 }, // 4 = Cancelling
          args.project,
          args.buildId
        );
        
        return {
          content: [{ type: "text", text: JSON.stringify(updatedBuild) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error canceling build: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "build_get_build_logs",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        buildId: { type: "number" },
        logId: { type: "number" }
      },
      required: ["project", "buildId"]
    },
    handler: async (args, connection) => {
      try {
        const buildApi = await connection.getBuildApi();
        
        if (args.logId) {
          const logStream = await buildApi.getBuildLog(args.project, args.buildId, args.logId);
          const logContent = await streamToString(logStream);
          
          return {
            content: [{ type: "text", text: logContent }]
          };
        } else {
          const logs = await buildApi.getBuildLogs(args.project, args.buildId);
          return {
            content: [{ type: "text", text: JSON.stringify(logs) }]
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting build logs: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "build_get_build_timeline",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        buildId: { type: "number" },
        timelineId: { type: "string" }
      },
      required: ["project", "buildId"]
    },
    handler: async (args, connection) => {
      try {
        const buildApi = await connection.getBuildApi();
        const timeline = await buildApi.getBuildTimeline(
          args.project,
          args.buildId,
          args.timelineId
        );
        
        return {
          content: [{ type: "text", text: JSON.stringify(timeline) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting build timeline: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "build_get_build_artifacts",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        buildId: { type: "number" },
        artifactName: { type: "string" }
      },
      required: ["project", "buildId"]
    },
    handler: async (args, connection) => {
      try {
        const buildApi = await connection.getBuildApi();
        
        if (args.artifactName) {
          const artifact = await buildApi.getArtifact(args.project, args.buildId, args.artifactName);
          return {
            content: [{ type: "text", text: JSON.stringify(artifact) }]
          };
        } else {
          const artifacts = await buildApi.getArtifacts(args.project, args.buildId);
          return {
            content: [{ type: "text", text: JSON.stringify(artifacts) }]
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting build artifacts: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "build_get_build_definitions",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        name: { type: "string" },
        repositoryId: { type: "string" },
        repositoryType: { type: "string" },
        queryOrder: { 
          type: "string", 
          enum: ["None", "LastModifiedAscending", "LastModifiedDescending", "DefinitionNameAscending", "DefinitionNameDescending"]
        },
        top: { type: "number" },
        continuationToken: { type: "string" }
      },
      required: ["project"]
    },
    handler: async (args, connection) => {
      try {
        const buildApi = await connection.getBuildApi();
        const definitions = await buildApi.getDefinitions(
          args.project,
          args.name,
          args.repositoryId,
          args.repositoryType,
          args.queryOrder,
          args.top,
          args.continuationToken
        );
        
        return {
          content: [{ type: "text", text: JSON.stringify(definitions) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting build definitions: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "build_get_build_definition",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        definitionId: { type: "number" },
        revision: { type: "number" },
        includeLatestBuilds: { type: "boolean" }
      },
      required: ["project", "definitionId"]
    },
    handler: async (args, connection) => {
      try {
        const buildApi = await connection.getBuildApi();
        const definition = await buildApi.getDefinition(
          args.project,
          args.definitionId,
          args.revision,
          undefined,
          undefined,
          args.includeLatestBuilds
        );
        
        return {
          content: [{ type: "text", text: JSON.stringify(definition) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting build definition: ${errorMessage}` }],
          isError: true
        };
      }
    }
  },

  {
    name: "build_get_builds_by_definition",
    
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        definitions: {
          type: "array", 
          items: { type: "number" }
        },
        statusFilter: { 
          type: "string", 
          enum: ["None", "InProgress", "Completed", "Cancelling", "Postponed", "NotStarted", "All"]
        },
        resultFilter: { 
          type: "string", 
          enum: ["None", "Succeeded", "PartiallySucceeded", "Failed", "Canceled"]
        },
        top: { type: "number" },
        continuationToken: { type: "string" },
        branchName: { type: "string" }
      },
      required: ["project"]
    },
    handler: async (args, connection) => {
      try {
        const buildApi = await connection.getBuildApi();
        const builds = await buildApi.getBuilds(
          args.project,
          args.definitions,
          undefined, // queues
          undefined, // buildNumber
          undefined, // minTime
          undefined, // maxTime
          undefined, // requestedFor
          undefined, // reasonFilter
          args.statusFilter,
          args.resultFilter,
          undefined, // tagFilters
          undefined, // properties
          args.top,
          args.continuationToken,
          undefined, // maxBuildsPerDefinition
          undefined, // deletedFilter
          args.branchName
        );
        
        return {
          content: [{ type: "text", text: JSON.stringify(builds) }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting builds by definition: ${errorMessage}` }],
          isError: true
        };
      }
    }
  }
];
