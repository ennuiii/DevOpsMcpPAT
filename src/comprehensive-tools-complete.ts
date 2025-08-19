// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { WebApi } from "azure-devops-node-api";

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
        expand: { type: "string" }
      },
      required: ["id"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        const workItem = await witApi.getWorkItem(args.id, undefined, undefined, args.expand);
        
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
        type: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        assignedTo: { type: "string" },
        tags: { type: "string" },
        areaPath: { type: "string" },
        iterationPath: { type: "string" }
      },
      required: ["project", "type", "title"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        
        const patchDocument = [
          { op: "add", path: "/fields/System.Title", value: args.title }
        ];
        
        if (args.description) {
          patchDocument.push({ op: "add", path: "/fields/System.Description", value: args.description });
        }
        if (args.assignedTo) {
          patchDocument.push({ op: "add", path: "/fields/System.AssignedTo", value: args.assignedTo });
        }
        if (args.tags) {
          patchDocument.push({ op: "add", path: "/fields/System.Tags", value: args.tags });
        }
        if (args.areaPath) {
          patchDocument.push({ op: "add", path: "/fields/System.AreaPath", value: args.areaPath });
        }
        if (args.iterationPath) {
          patchDocument.push({ op: "add", path: "/fields/System.IterationPath", value: args.iterationPath });
        }
        
        const workItem = await witApi.createWorkItem(null, patchDocument as any, args.project, args.type);
        
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
        title: { type: "string" },
        description: { type: "string" },
        assignedTo: { type: "string" },
        state: { type: "string" },
        tags: { type: "string" }
      },
      required: ["id"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        
        const patchDocument = [];
        
        if (args.title) {
          patchDocument.push({ op: "replace", path: "/fields/System.Title", value: args.title });
        }
        if (args.description) {
          patchDocument.push({ op: "replace", path: "/fields/System.Description", value: args.description });
        }
        if (args.assignedTo) {
          patchDocument.push({ op: "replace", path: "/fields/System.AssignedTo", value: args.assignedTo });
        }
        if (args.state) {
          patchDocument.push({ op: "replace", path: "/fields/System.State", value: args.state });
        }
        if (args.tags) {
          patchDocument.push({ op: "replace", path: "/fields/System.Tags", value: args.tags });
        }
        
        if (patchDocument.length === 0) {
          return {
            content: [{ type: "text", text: `No updates specified for work item ${args.id}` }],
            isError: true
          };
        }
        
        const workItem = await witApi.updateWorkItem(null, patchDocument as any, args.id);
        
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
      required: ["wiql"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        const queryResult = await witApi.queryByWiql({ query: args.wiql });
        
        if (!queryResult.workItems || queryResult.workItems.length === 0) {
          return {
            content: [{ type: "text", text: "No work items found matching the query." }],
            isError: true
          };
        }
        
        const workItemIds = queryResult.workItems.map(wi => wi.id!);
        const workItems = await witApi.getWorkItems(workItemIds);
        
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
  // GIT REPOSITORY TOOLS (6 tools)
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
  }
];