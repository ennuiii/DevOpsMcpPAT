// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { WebApi } from "azure-devops-node-api";

// Microsoft-compatible tool definitions
export interface ComprehensiveTool {
  name: string;
  description: string;
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
    description: "Retrieve a list of projects in your Azure DevOps organization",
    inputSchema: {
      type: "object",
      properties: {
        stateFilter: { 
          type: "string", 
          enum: ["all", "wellFormed", "createPending", "deleted"],
          description: "Filter projects by their state. Defaults to 'wellFormed'." 
        },
        top: { type: "number", description: "The maximum number of projects to return. Defaults to 100." },
        skip: { type: "number", description: "The number of projects to skip for pagination. Defaults to 0." },
        continuationToken: { type: "number", description: "Continuation token for pagination." },
        projectNameFilter: { type: "string", description: "Filter projects by name. Supports partial matches." }
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
          content: [{ type: "text", text: JSON.stringify(filteredProjects, null, 2) }]
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
    description: "Retrieve a list of teams for the specified Azure DevOps project",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "The name or ID of the Azure DevOps project." },
        mine: { type: "boolean", description: "If true, only return teams that the authenticated user is a member of." },
        top: { type: "number", description: "The maximum number of teams to return. Defaults to 100." },
        skip: { type: "number", description: "The number of teams to skip for pagination. Defaults to 0." }
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
          content: [{ type: "text", text: JSON.stringify(teams, null, 2) }]
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
    description: "Retrieve Azure DevOps identity IDs for a provided search filter",
    inputSchema: {
      type: "object",
      properties: {
        searchFilter: { type: "string", description: "Search filter (unique name, display name, email) to retrieve identity IDs for." }
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
    description: "Get a work item by ID with full details",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Work item ID" },
        expand: { type: "string", description: "Expand options (All, Relations, Fields, etc.)" }
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
          content: [{ type: "text", text: JSON.stringify(workItem, null, 2) }]
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
    description: "Create a new work item",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name or ID" },
        type: { type: "string", description: "Work item type (Task, Bug, User Story, etc.)" },
        title: { type: "string", description: "Work item title" },
        description: { type: "string", description: "Work item description (optional)" },
        assignedTo: { type: "string", description: "Assigned to user email (optional)" },
        tags: { type: "string", description: "Comma-separated tags (optional)" },
        areaPath: { type: "string", description: "Area path (optional)" },
        iterationPath: { type: "string", description: "Iteration path (optional)" }
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
          content: [{ type: "text", text: JSON.stringify(workItem, null, 2) }]
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
    description: "Update an existing work item",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Work item ID to update" },
        title: { type: "string", description: "Updated title (optional)" },
        description: { type: "string", description: "Updated description (optional)" },
        assignedTo: { type: "string", description: "Updated assigned to user email (optional)" },
        state: { type: "string", description: "Updated state (optional)" },
        tags: { type: "string", description: "Updated comma-separated tags (optional)" }
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
          content: [{ type: "text", text: JSON.stringify(workItem, null, 2) }]
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
    description: "Query work items using WIQL",
    inputSchema: {
      type: "object",
      properties: {
        wiql: { type: "string", description: "WIQL query string" },
        project: { type: "string", description: "Project name or ID (optional)" }
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
          content: [{ type: "text", text: JSON.stringify(workItems, null, 2) }]
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
    description: "Delete a work item",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Work item ID to delete" },
        destroy: { type: "boolean", description: "If true, permanently delete the work item. If false, move to recycle bin." }
      },
      required: ["id"]
    },
    handler: async (args, connection) => {
      try {
        const witApi = await connection.getWorkItemTrackingApi();
        
        const result = await witApi.deleteWorkItem(args.id, undefined, args.destroy);
        
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
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
    description: "Retrieves a list of build definitions for a given project",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project ID or name to get build definitions for" },
        name: { type: "string", description: "Name of the build definition to filter" },
        repositoryId: { type: "string", description: "Repository ID to filter build definitions" },
        repositoryType: { type: "string", enum: ["TfsGit", "GitHub", "BitbucketCloud"], description: "Type of repository to filter build definitions" },
        top: { type: "number", description: "Maximum number of build definitions to return" },
        includeLatestBuilds: { type: "boolean", description: "Whether to include the latest builds for each definition" }
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
          content: [{ type: "text", text: JSON.stringify(buildDefinitions, null, 2) }]
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
    description: "Retrieves a list of builds for a given project",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project ID or name to get builds for" },
        definitions: { type: "array", items: { type: "number" }, description: "Array of build definition IDs to filter builds" },
        buildNumber: { type: "string", description: "Build number to filter builds" },
        top: { type: "number", description: "Maximum number of builds to return" },
        statusFilter: { type: "number", description: "Status filter for the build" },
        resultFilter: { type: "number", description: "Result filter for the build" },
        branchName: { type: "string", description: "Branch name to filter builds" }
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
          content: [{ type: "text", text: JSON.stringify(builds, null, 2) }]
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
    description: "Triggers a new build for a specified definition",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project ID or name to run the build in" },
        definitionId: { type: "number", description: "ID of the build definition to run" },
        sourceBranch: { type: "string", description: "Source branch to run the build from. If not provided, the default branch will be used." },
        parameters: { type: "object", description: "Custom build parameters as key-value pairs" }
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
          content: [{ type: "text", text: JSON.stringify(pipelineRun, null, 2) }]
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
    description: "Fetches the status of a specific build",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project ID or name to get the build status for" },
        buildId: { type: "number", description: "ID of the build to get the status for" }
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
          content: [{ type: "text", text: JSON.stringify(build, null, 2) }]
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
    description: "Retrieves the logs for a specific build",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project ID or name to get the build log for" },
        buildId: { type: "number", description: "ID of the build to get the log for" }
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
          content: [{ type: "text", text: JSON.stringify(logs, null, 2) }]
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
    description: "Get specific build log content by log ID",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project ID or name" },
        buildId: { type: "number", description: "ID of the build" },
        logId: { type: "number", description: "ID of the log to retrieve" },
        startLine: { type: "number", description: "Starting line number, defaults to 0" },
        endLine: { type: "number", description: "Ending line number, defaults to end of log" }
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
          content: [{ type: "text", text: JSON.stringify(logLines, null, 2) }]
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
    description: "Get the changes associated with a specific build",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project ID or name" },
        buildId: { type: "number", description: "ID of the build to get changes for" },
        top: { type: "number", description: "Number of changes to retrieve, defaults to 100" }
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
          content: [{ type: "text", text: JSON.stringify(changes, null, 2) }]
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
    description: "Retrieves a list of revisions for a specific build definition",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project ID or name" },
        definitionId: { type: "number", description: "ID of the build definition to get revisions for" }
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
          content: [{ type: "text", text: JSON.stringify(revisions, null, 2) }]
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
    description: "Updates the stage of a specific build",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project ID or name" },
        buildId: { type: "number", description: "ID of the build to update" },
        stageName: { type: "string", description: "Name of the stage to update" },
        status: { type: "string", enum: ["cancel", "retry"], description: "New status for the stage" },
        forceRetryAllJobs: { type: "boolean", description: "Whether to force retry all jobs in the stage" }
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
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
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
    description: "List Git repositories",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name or ID (optional)" }
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
          content: [{ type: "text", text: JSON.stringify(repositories, null, 2) }]
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
    description: "Get details of a specific repository",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string", description: "Repository ID or name" },
        project: { type: "string", description: "Project name or ID (optional)" }
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
          content: [{ type: "text", text: JSON.stringify(repository, null, 2) }]
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
    description: "Get branches for a repository",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string", description: "Repository ID or name" },
        project: { type: "string", description: "Project name or ID (optional)" }
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
          content: [{ type: "text", text: JSON.stringify(branches, null, 2) }]
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
    description: "Get commits for a repository",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string", description: "Repository ID or name" },
        project: { type: "string", description: "Project name or ID (optional)" },
        branch: { type: "string", description: "Branch name to get commits from" },
        top: { type: "number", description: "Maximum number of commits to return" }
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
          content: [{ type: "text", text: JSON.stringify(commits, null, 2) }]
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
    description: "Get pull requests for a repository",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string", description: "Repository ID or name" },
        project: { type: "string", description: "Project name or ID (optional)" },
        status: { type: "string", enum: ["active", "completed", "abandoned", "all"], description: "Pull request status filter" },
        top: { type: "number", description: "Maximum number of pull requests to return" }
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
          content: [{ type: "text", text: JSON.stringify(pullRequests, null, 2) }]
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
    description: "Get items (files/folders) from a repository",
    inputSchema: {
      type: "object",
      properties: {
        repositoryId: { type: "string", description: "Repository ID or name" },
        project: { type: "string", description: "Project name or ID (optional)" },
        scopePath: { type: "string", description: "Path to scope the search to (optional)" },
        recursionLevel: { type: "string", enum: ["none", "oneLevel", "full"], description: "Recursion level for getting items" }
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
          content: [{ type: "text", text: JSON.stringify(items, null, 2) }]
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
    description: "Retrieve a list of wikis for an organization or project",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "The project name or ID to filter wikis. If not provided, all wikis in the organization will be returned." }
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
          content: [{ type: "text", text: JSON.stringify(wikis, null, 2) }]
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
    description: "Get the wiki by wikiIdentifier",
    inputSchema: {
      type: "object",
      properties: {
        wikiIdentifier: { type: "string", description: "The unique identifier of the wiki." },
        project: { type: "string", description: "The project name or ID where the wiki is located. If not provided, the default project will be used." }
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
          content: [{ type: "text", text: JSON.stringify(wiki, null, 2) }]
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
    description: "Retrieve a list of wiki pages for a specific wiki and project.",
    inputSchema: {
      type: "object",
      properties: {
        wikiIdentifier: { type: "string", description: "The unique identifier of the wiki." },
        project: { type: "string", description: "The project name or ID where the wiki is located." },
        top: { type: "number", default: 20, description: "The maximum number of pages to return. Defaults to 20." },
        continuationToken: { type: "string", description: "Token for pagination to retrieve the next set of pages." },
        pageViewsForDays: { type: "number", description: "Number of days to retrieve page views for. If not specified, page views are not included." }
      },
      required: ["wikiIdentifier", "project"]
    },
    handler: async (args, connection) => {
      try {
        const wikiApi = await connection.getWikiApi();

        const pagesBatchRequest = {
          top: args.top || 20,
          continuationToken: args.continuationToken,
          pageViewsForDays: args.pageViewsForDays
        };

        const pages = await wikiApi.getPagesBatch(pagesBatchRequest, args.project, args.wikiIdentifier);

        if (!pages) {
          return { content: [{ type: "text", text: "No wiki pages found" }], isError: true };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(pages, null, 2) }]
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
    description: "Retrieve wiki page content by wikiIdentifier and path",
    inputSchema: {
      type: "object",
      properties: {
        wikiIdentifier: { type: "string", description: "The unique identifier of the wiki." },
        project: { type: "string", description: "The project name or ID where the wiki is located." },
        path: { type: "string", description: "The path of the wiki page to retrieve content for." }
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
    description: "Create or update a wiki page with content",
    inputSchema: {
      type: "object",
      properties: {
        wikiIdentifier: { type: "string", description: "The unique identifier or name of the wiki." },
        path: { type: "string", description: "The path of the wiki page (e.g., '/Home' or '/Documentation/Setup')." },
        content: { type: "string", description: "The content of the wiki page in markdown format." },
        project: { type: "string", description: "The project name or ID where the wiki is located. If not provided, the default project will be used." },
        etag: { type: "string", description: "ETag for editing existing pages (optional, will be fetched if not provided)." }
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
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
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
    description: "Search Azure DevOps Repositories for a given search text",
    inputSchema: {
      type: "object",
      properties: {
        searchText: { type: "string", description: "Keywords to search for in code repositories" },
        project: { type: "array", items: { type: "string" }, description: "Filter by projects" },
        repository: { type: "array", items: { type: "string" }, description: "Filter by repositories" },
        path: { type: "array", items: { type: "string" }, description: "Filter by paths" },
        branch: { type: "array", items: { type: "string" }, description: "Filter by branches" },
        top: { type: "number", description: "Maximum number of results to return", default: 5 }
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
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
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
    description: "Search Azure DevOps Wiki for a given search text",
    inputSchema: {
      type: "object",
      properties: {
        searchText: { type: "string", description: "Keywords to search for wiki pages" },
        project: { type: "array", items: { type: "string" }, description: "Filter by projects" },
        wiki: { type: "array", items: { type: "string" }, description: "Filter by wiki names" },
        top: { type: "number", description: "Maximum number of results to return", default: 10 }
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
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
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
    description: "Get Azure DevOps Work Item search results for a given search text",
    inputSchema: {
      type: "object",
      properties: {
        searchText: { type: "string", description: "Search text to find in work items" },
        project: { type: "array", items: { type: "string" }, description: "Filter by projects" },
        areaPath: { type: "array", items: { type: "string" }, description: "Filter by area paths" },
        workItemType: { type: "array", items: { type: "string" }, description: "Filter by work item types" },
        state: { type: "array", items: { type: "string" }, description: "Filter by work item states" },
        assignedTo: { type: "array", items: { type: "string" }, description: "Filter by assigned to users" },
        top: { type: "number", description: "Number of results to return", default: 10 }
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
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
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
    description: "List iterations for a team",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name or ID" },
        team: { type: "string", description: "Team name or ID" },
        timeframe: { type: "string", enum: ["current", "past", "future"], description: "Timeframe filter" }
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
          content: [{ type: "text", text: JSON.stringify(iterations, null, 2) }]
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
    description: "Get team settings",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name or ID" },
        team: { type: "string", description: "Team name or ID" }
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
          content: [{ type: "text", text: JSON.stringify(teamSettings, null, 2) }]
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
    description: "Get team field values",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name or ID" },
        team: { type: "string", description: "Team name or ID" }
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
          content: [{ type: "text", text: JSON.stringify(teamFieldValues, null, 2) }]
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
    description: "List release definitions",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name or ID" },
        searchText: { type: "string", description: "Search text for definition names (optional)" }
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
          content: [{ type: "text", text: JSON.stringify(definitions, null, 2) }]
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
    description: "Get releases for a project",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name or ID" },
        definitionId: { type: "number", description: "Release definition ID to filter releases" },
        top: { type: "number", description: "Maximum number of releases to return" }
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
          content: [{ type: "text", text: JSON.stringify(releases, null, 2) }]
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
    description: "Create a new release",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name or ID" },
        definitionId: { type: "number", description: "Release definition ID" },
        description: { type: "string", description: "Release description (optional)" }
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
          content: [{ type: "text", text: JSON.stringify(release, null, 2) }]
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
    description: "Get details of a specific release",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name or ID" },
        releaseId: { type: "number", description: "Release ID" }
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
          content: [{ type: "text", text: JSON.stringify(release, null, 2) }]
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
    description: "Retrieve a paginated list of test plans from an Azure DevOps project",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "The unique identifier (ID or name) of the Azure DevOps project." },
        filterActivePlans: { type: "boolean", description: "Filter to include only active test plans. Defaults to true." },
        includePlanDetails: { type: "boolean", description: "Include detailed information about each test plan." },
        continuationToken: { type: "string", description: "Token to continue fetching test plans from a previous request." }
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
          args.continuationToken, 
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
          content: [{ type: "text", text: JSON.stringify(testPlans, null, 2) }]
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
    description: "Create a new test plan",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name or ID" },
        name: { type: "string", description: "Test plan name" },
        description: { type: "string", description: "Test plan description (optional)" },
        areaPath: { type: "string", description: "Area path for the test plan (optional)" },
        iterationPath: { type: "string", description: "Iteration path for the test plan (optional)" }
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
          content: [{ type: "text", text: JSON.stringify(testPlan, null, 2) }]
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
    description: "Create a new test case",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name or ID" },
        title: { type: "string", description: "Test case title" },
        steps: { type: "string", description: "Test case steps (optional)" },
        areaPath: { type: "string", description: "Area path for the test case (optional)" }
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
          content: [{ type: "text", text: JSON.stringify(testCase, null, 2) }]
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
    description: "List test cases for a project",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name or ID" },
        top: { type: "number", description: "Maximum number of test cases to return" }
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
          content: [{ type: "text", text: JSON.stringify(workItems, null, 2) }]
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
    description: "Add test cases to a test suite",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name or ID" },
        planId: { type: "number", description: "Test plan ID" },
        suiteId: { type: "number", description: "Test suite ID" },
        testCaseIds: { type: "array", items: { type: "number" }, description: "Array of test case IDs to add" }
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
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
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
    description: "Show test results from a build ID",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name or ID" },
        buildId: { type: "number", description: "Build ID to get test results for" }
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
          content: [{ type: "text", text: JSON.stringify(testResults, null, 2) }]
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
    description: "Retrieve Advanced Security alerts for a repository",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "The name or ID of the Azure DevOps project." },
        repository: { type: "string", description: "The name or ID of the repository to get alerts for." },
        alertType: { type: "string", enum: ["dependency", "secret", "code"], description: "Filter alerts by type." },
        states: { type: "array", items: { type: "string", enum: ["active", "dismissed", "fixed"] }, description: "Filter alerts by state." },
        severities: { type: "array", items: { type: "string", enum: ["critical", "high", "medium", "low"] }, description: "Filter alerts by severity level." },
        top: { type: "number", description: "Maximum number of alerts to return. Defaults to 100." },
        onlyDefaultBranch: { type: "boolean", description: "If true, only return alerts found on the default branch. Defaults to true." }
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
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
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
    description: "Get detailed information about a specific Advanced Security alert",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "The name or ID of the Azure DevOps project." },
        repository: { type: "string", description: "The name or ID of the repository." },
        alertId: { type: "number", description: "The ID of the alert to get details for." }
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
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
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
    description: "Get a work item by ID (alias for wit_get_work_item)",
    inputSchema: {
      type: "object",
      properties: {
        workItemId: { type: "number", description: "Work item ID" }
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
          content: [{ type: "text", text: JSON.stringify(workItem, null, 2) }]
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
    description: "List all projects (alias for core_list_projects)",
    inputSchema: {
      type: "object",
      properties: {
        nameFilter: { type: "string", description: "Filter projects by name (optional)" }
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
          content: [{ type: "text", text: JSON.stringify(filteredProjects, null, 2) }]
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
    description: "List build definitions for a project (alias for build_get_definitions)",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name or ID" },
        name: { type: "string", description: "Filter by definition name (optional)" },
        type: { type: "string", description: "Definition type filter (optional)" }
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
          content: [{ type: "text", text: JSON.stringify(definitions, null, 2) }]
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
    description: "Get builds for a project (alias, already defined above)",
    inputSchema: {
      type: "object", 
      properties: {
        project: { type: "string", description: "Project name or ID" },
        definitionIds: { type: "string", description: "Comma-separated build definition IDs (optional)" },
        statusFilter: { type: "string", description: "Build status filter (inProgress, completed, etc.)" },
        top: { type: "number", description: "Maximum number of builds to return (default: 10)" }
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
          content: [{ type: "text", text: JSON.stringify(builds, null, 2) }]
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