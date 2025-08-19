// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { WebApi } from "azure-devops-node-api";

// Comprehensive tool definitions without external dependencies
export interface ComprehensiveTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (args: any, connection: WebApi) => Promise<string>;
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
      
      const projectList = filteredProjects.map(p => 
        `- **${p.name}**: ${p.description || "No description"} (ID: ${p.id}, State: ${p.state})`
      ).join('\\n');
      
      return `# Projects (${filteredProjects.length})\\n\\n${projectList}`;
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
      const coreApi = await connection.getCoreApi();
      const teams = await coreApi.getTeams(args.project, args.mine, args.top, args.skip, false);
      
      if (!teams || teams.length === 0) {
        return `No teams found for project: ${args.project}`;
      }
      
      const teamList = teams.map(t => 
        `- **${t.name}**: ${t.description || "No description"} (ID: ${t.id})`
      ).join('\\n');
      
      return `# Teams in ${args.project} (${teams.length})\\n\\n${teamList}`;
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
      // This requires REST API call since the SDK doesn't expose identity search directly
      const orgName = connection.serverUrl.split("/")[3];
      const baseUrl = `https://vssps.dev.azure.com/${orgName}/_apis/identities`;
      
      const params = new URLSearchParams({
        "api-version": "7.2-preview.1",
        "searchFilter": "General",
        "filterValue": args.searchFilter,
      });

      // Note: This would require proper token handling in a real implementation
      return `Identity search functionality requires direct REST API implementation with proper authentication.\\nSearch filter: "${args.searchFilter}"\\nEndpoint: ${baseUrl}?${params}`;
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
      const witApi = await connection.getWorkItemTrackingApi();
      const workItem = await witApi.getWorkItem(args.id, undefined, undefined, args.expand);
      
      if (!workItem) {
        return `Work item ${args.id} not found.`;
      }
      
      const fields = workItem.fields || {};
      return `# Work Item ${workItem.id}: ${fields["System.Title"]}\\n\\n` +
             `**Type**: ${fields["System.WorkItemType"]}\\n` +
             `**State**: ${fields["System.State"]}\\n` +
             `**Assigned To**: ${fields["System.AssignedTo"]?.displayName || "Unassigned"}\\n` +
             `**Created**: ${fields["System.CreatedDate"]}\\n` +
             `**Area Path**: ${fields["System.AreaPath"]}\\n` +
             `**Iteration Path**: ${fields["System.IterationPath"]}\\n` +
             `**Tags**: ${fields["System.Tags"] || "None"}\\n\\n` +
             `**Description**: ${fields["System.Description"] || "No description"}`;
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
      
      return `# Work Item Created: ${workItem.id}\\n\\n` +
             `**Title**: ${args.title}\\n` +
             `**Type**: ${args.type}\\n` +
             `**Project**: ${args.project}\\n` +
             `**State**: ${workItem.fields?.["System.State"]}\\n` +
             `**URL**: ${workItem._links?.html?.href || "N/A"}`;
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
        return `No updates specified for work item ${args.id}`;
      }
      
      const workItem = await witApi.updateWorkItem(null, patchDocument as any, args.id);
      
      return `# Work Item Updated: ${workItem.id}\\n\\n` +
             `**Title**: ${workItem.fields?.["System.Title"]}\\n` +
             `**State**: ${workItem.fields?.["System.State"]}\\n` +
             `**Assigned To**: ${workItem.fields?.["System.AssignedTo"]?.displayName || "Unassigned"}\\n` +
             `**URL**: ${workItem._links?.html?.href || "N/A"}`;
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
      const witApi = await connection.getWorkItemTrackingApi();
      const queryResult = await witApi.queryByWiql({ query: args.wiql });
      
      if (!queryResult.workItems || queryResult.workItems.length === 0) {
        return "No work items found matching the query.";
      }
      
      const workItemIds = queryResult.workItems.map(wi => wi.id!);
      const workItems = await witApi.getWorkItems(workItemIds);
      
      const formattedItems = workItems.map(item => {
        const fields = item.fields || {};
        return `- **${item.id}**: ${fields["System.Title"]} (${fields["System.State"]}) - ${fields["System.WorkItemType"]}`;
      }).join('\\n');
      
      return `# Query Results (${workItems.length} items)\\n\\n${formattedItems}`;
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
      const witApi = await connection.getWorkItemTrackingApi();
      
      const result = await witApi.deleteWorkItem(args.id, undefined, args.destroy);
      
      const action = args.destroy ? "permanently deleted" : "moved to recycle bin";
      return `Work item ${args.id} has been ${action}.\\nResult: ${JSON.stringify(result, null, 2)}`;
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
        return `No build definitions found for project: ${args.project}`;
      }

      const defList = buildDefinitions.map(d => 
        `- **${d.name}** (ID: ${d.id}): ${(d as any).description || "No description"} - Type: ${d.type} - Repository: ${(d as any).repository?.name}`
      ).join('\\n');

      return `# Build Definitions for ${args.project} (${buildDefinitions.length})\\n\\n${defList}`;
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
        return `No builds found for project: ${args.project}`;
      }

      const buildList = builds.map(b => 
        `- **Build ${b.buildNumber}**: ${b.definition?.name} - ${b.status} (${b.result || "In Progress"}) - Branch: ${b.sourceBranch}`
      ).join('\\n');

      return `# Recent builds for ${args.project} (${builds.length})\\n\\n${buildList}`;
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
      
      return `# Build Triggered Successfully\\n\\n` +
             `**Pipeline Run ID**: ${pipelineRun.id}\\n` +
             `**Definition**: ${definition.name}\\n` +
             `**Branch**: ${args.sourceBranch || definition.repository?.defaultBranch || "refs/heads/main"}\\n` +
             `**State**: ${pipelineRun.state}\\n` +
             `**URL**: ${pipelineRun._links?.web?.href || "N/A"}`;
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
      const buildApi = await connection.getBuildApi();
      const build = await buildApi.getBuild(args.project, args.buildId);

      if (!build) {
        return `Build ${args.buildId} not found in project ${args.project}`;
      }

      return `# Build Status: ${build.buildNumber}\\n\\n` +
             `**ID**: ${build.id}\\n` +
             `**Status**: ${build.status}\\n` +
             `**Result**: ${build.result || "In Progress"}\\n` +
             `**Definition**: ${build.definition?.name}\\n` +
             `**Source Branch**: ${build.sourceBranch}\\n` +
             `**Started**: ${build.startTime}\\n` +
             `**Finished**: ${build.finishTime || "Not finished"}\\n` +
             `**Requested For**: ${build.requestedFor?.displayName}\\n` +
             `**URL**: ${build._links?.web?.href || "N/A"}`;
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
      const buildApi = await connection.getBuildApi();
      const logs = await buildApi.getBuildLogs(args.project, args.buildId);

      if (!logs || logs.length === 0) {
        return `No logs found for build ${args.buildId}`;
      }

      const logList = logs.map(log => 
        `- **Log ${log.id}**: ${log.type} - ${log.lineCount} lines`
      ).join('\\n');

      return `# Build Logs for Build ${args.buildId}\\n\\n${logList}`;
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
      const buildApi = await connection.getBuildApi();
      const logLines = await buildApi.getBuildLogLines(args.project, args.buildId, args.logId, args.startLine, args.endLine);

      if (!logLines || logLines.length === 0) {
        return `No log content found for build ${args.buildId}, log ${args.logId}`;
      }

      const content = logLines.join('\\n');
      return `# Build Log Content (Build ${args.buildId}, Log ${args.logId})\\n\\n\`\`\`\\n${content}\\n\`\`\``;
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
      const buildApi = await connection.getBuildApi();
      const changes = await buildApi.getBuildChanges(args.project, args.buildId, undefined, args.top || 100);

      if (!changes || changes.length === 0) {
        return `No changes found for build ${args.buildId}`;
      }

      const changesList = changes.map(change => 
        `- **${change.id}**: ${change.message} - by ${change.author?.displayName} at ${change.timestamp}`
      ).join('\\n');

      return `# Build Changes (${changes.length} changes)\\n\\n${changesList}`;
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
      const buildApi = await connection.getBuildApi();
      const revisions = await buildApi.getDefinitionRevisions(args.project, args.definitionId);

      if (!revisions || revisions.length === 0) {
        return `No revisions found for build definition ${args.definitionId}`;
      }

      const revisionsList = revisions.map(rev => 
        `- **Revision ${rev.revision}**: ${rev.changedDate} - ${rev.comment || "No comment"}`
      ).join('\\n');

      return `# Build Definition Revisions (${revisions.length} revisions)\\n\\n${revisionsList}`;
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
      // This requires direct REST API call
      const orgUrl = connection.serverUrl;
      const endpoint = `${orgUrl}/${args.project}/_apis/build/builds/${args.buildId}/stages/${args.stageName}?api-version=7.2-preview.1`;
      
      return `Build stage update functionality requires direct REST API implementation.\\nEndpoint: ${endpoint}\\nStage: ${args.stageName}\\nStatus: ${args.status}`;
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
      const gitApi = await connection.getGitApi();
      const repositories = await gitApi.getRepositories(args.project);
      
      if (!repositories || repositories.length === 0) {
        return args.project ? `No repositories found for project: ${args.project}` : "No repositories found.";
      }
      
      const repoList = repositories.map(repo => 
        `- **${repo.name}**: ${repo.defaultBranch || "No default branch"} (ID: ${repo.id})\\n  Project: ${repo.project?.name} - Size: ${repo.size || "Unknown"} bytes\\n  URL: ${repo.webUrl}`
      ).join('\\n');
      
      return `# Repositories (${repositories.length})\\n\\n${repoList}`;
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
      const gitApi = await connection.getGitApi();
      const repository = await gitApi.getRepository(args.repositoryId, args.project);
      
      if (!repository) {
        return `Repository ${args.repositoryId} not found.`;
      }
      
      return `# Repository: ${repository.name}\\n\\n` +
             `**ID**: ${repository.id}\\n` +
             `**Default Branch**: ${repository.defaultBranch || "Not set"}\\n` +
             `**Size**: ${repository.size || "Unknown"} bytes\\n` +
             `**URL**: ${repository.webUrl || repository.remoteUrl || "N/A"}\\n` +
             `**Project**: ${repository.project?.name || "Unknown"}\\n` +
             `**Is Fork**: ${repository.isFork ? "Yes" : "No"}\\n` +
             `**Is Disabled**: ${repository.isDisabled ? "Yes" : "No"}`;
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
      const gitApi = await connection.getGitApi();
      const branches = await gitApi.getBranches(args.repositoryId, args.project);
      
      if (!branches || branches.length === 0) {
        return `No branches found for repository: ${args.repositoryId}`;
      }
      
      const branchList = branches.map(branch => 
        `- **${branch.name}**: ${(branch as any).objectId} - ${(branch as any).isBaseVersion ? "(Default)" : ""}`
      ).join('\\n');
      
      return `# Branches for ${args.repositoryId} (${branches.length})\\n\\n${branchList}`;
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
      const gitApi = await connection.getGitApi();
      const searchCriteria = {
        itemVersion: args.branch ? { version: args.branch } : undefined,
        $top: args.top || 10
      };
      
      const commits = await gitApi.getCommits(args.repositoryId, searchCriteria, args.project);
      
      if (!commits || commits.length === 0) {
        return `No commits found for repository: ${args.repositoryId}`;
      }
      
      const commitList = commits.map(commit => 
        `- **${commit.commitId?.substring(0, 8)}**: ${commit.comment} - by ${commit.author?.name} at ${commit.author?.date}`
      ).join('\\n');
      
      return `# Recent Commits for ${args.repositoryId} (${commits.length})\\n\\n${commitList}`;
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
      const gitApi = await connection.getGitApi();
      const searchCriteria = {
        status: args.status === "active" ? 1 : args.status === "completed" ? 3 : args.status === "abandoned" ? 2 : undefined,
        $top: args.top || 10
      };
      
      const pullRequests = await gitApi.getPullRequests(args.repositoryId, searchCriteria, args.project);
      
      if (!pullRequests || pullRequests.length === 0) {
        return `No pull requests found for repository: ${args.repositoryId}`;
      }
      
      const prList = pullRequests.map(pr => 
        `- **PR #${pr.pullRequestId}**: ${pr.title} - ${pr.status} - by ${pr.createdBy?.displayName}\\n  Source: ${pr.sourceRefName} → Target: ${pr.targetRefName}`
      ).join('\\n');
      
      return `# Pull Requests for ${args.repositoryId} (${pullRequests.length})\\n\\n${prList}`;
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
      const gitApi = await connection.getGitApi();
      const recursionLevel = args.recursionLevel === "none" ? 0 : args.recursionLevel === "oneLevel" ? 1 : 120;
      
      const items = await gitApi.getItems(
        args.repositoryId, 
        args.project, 
        args.scopePath, 
        recursionLevel
      );
      
      if (!items || items.length === 0) {
        return `No items found in repository: ${args.repositoryId}`;
      }
      
      const itemList = items.map(item => 
        `- ${item.isFolder ? "📁" : "📄"} **${item.path}**: ${(item as any).size || 0} bytes - ${item.gitObjectType}`
      ).join('\\n');
      
      return `# Repository Items for ${args.repositoryId} (${items.length})\\n\\n${itemList}`;
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
      const wikiApi = await connection.getWikiApi();
      const wikis = await wikiApi.getAllWikis(args.project);

      if (!wikis || wikis.length === 0) {
        return "No wikis found";
      }

      const wikiList = wikis.map(wiki => 
        `- **${wiki.name}**: ${wiki.type} - Project: ${wiki.projectId}\\n  ID: ${wiki.id} - URL: ${wiki.url}`
      ).join('\\n');

      return `# Wikis (${wikis.length})\\n\\n${wikiList}`;
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
      const wikiApi = await connection.getWikiApi();
      const wiki = await wikiApi.getWiki(args.wikiIdentifier, args.project);

      if (!wiki) {
        return "No wiki found";
      }

      return `# Wiki: ${wiki.name}\\n\\n` +
             `**ID**: ${wiki.id}\\n` +
             `**Type**: ${wiki.type}\\n` +
             `**Project**: ${wiki.projectId}\\n` +
             `**Repository**: ${wiki.repositoryId}\\n` +
             `**Mapped Path**: ${wiki.mappedPath}\\n` +
             `**URL**: ${wiki.url}`;
    }
  },

  {
    name: "wiki_list_pages",
    description: "Retrieve a list of wiki pages for a specific wiki and project",
    inputSchema: {
      type: "object",
      properties: {
        wikiIdentifier: { type: "string", description: "The unique identifier of the wiki." },
        project: { type: "string", description: "The project name or ID where the wiki is located." },
        top: { type: "number", description: "The maximum number of pages to return. Defaults to 20." },
        continuationToken: { type: "string", description: "Token for pagination to retrieve the next set of pages." }
      },
      required: ["wikiIdentifier", "project"]
    },
    handler: async (args, connection) => {
      const wikiApi = await connection.getWikiApi();

      const pagesBatchRequest = {
        top: args.top || 20,
        continuationToken: args.continuationToken
      };

      const pages = await wikiApi.getPagesBatch(pagesBatchRequest, args.project, args.wikiIdentifier);

      if (!pages) {
        return "No wiki pages found";
      }

      // Convert pages iterator to array
      const pageArray = Array.from(pages);
      
      if (pageArray.length === 0) {
        return "No wiki pages found";
      }

      const pageList = pageArray.map(page => 
        `- **${page.path}**: ${(page as any).gitItemType || 'Page'} - ID: ${page.id}`
      ).join('\\n');

      return `# Wiki Pages (${pageArray.length})\\n\\n${pageList}`;
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
      const wikiApi = await connection.getWikiApi();

      const stream = await wikiApi.getPageText(args.project, args.wikiIdentifier, args.path, undefined, undefined, true);

      if (!stream) {
        return "No wiki page content found";
      }

      const content = await streamToString(stream);

      return `# Wiki Page Content: ${args.path}\\n\\n\`\`\`markdown\\n${content}\\n\`\`\``;
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
      // This requires direct REST API call with proper authentication
      const normalizedPath = args.path.startsWith("/") ? args.path : `/${args.path}`;
      const encodedPath = encodeURIComponent(normalizedPath);
      
      const baseUrl = connection.serverUrl;
      const projectParam = args.project || "";
      const url = `${baseUrl}/${projectParam}/_apis/wiki/wikis/${args.wikiIdentifier}/pages?path=${encodedPath}&api-version=7.1`;

      return `Wiki page create/update functionality requires direct REST API implementation with proper authentication.\\n` +
             `Endpoint: ${url}\\n` +
             `Path: ${normalizedPath}\\n` +
             `Content Length: ${args.content.length} characters`;
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

      return `Code search functionality requires direct REST API implementation with proper authentication.\\n` +
             `Search: "${args.searchText}"\\n` +
             `Endpoint: ${url}\\n` +
             `Filters: ${JSON.stringify(filters, null, 2)}`;
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
      // This requires direct REST API call to the search service
      const orgName = connection.serverUrl.split("/")[3];
      const url = `https://almsearch.dev.azure.com/${orgName}/_apis/search/wikisearchresults?api-version=7.2-preview.1`;

      const filters: Record<string, string[]> = {};
      if (args.project && args.project.length > 0) filters.Project = args.project;
      if (args.wiki && args.wiki.length > 0) filters.Wiki = args.wiki;

      return `Wiki search functionality requires direct REST API implementation with proper authentication.\\n` +
             `Search: "${args.searchText}"\\n` +
             `Endpoint: ${url}\\n` +
             `Filters: ${JSON.stringify(filters, null, 2)}`;
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
      // This requires direct REST API call to the search service
      const orgName = connection.serverUrl.split("/")[3];
      const url = `https://almsearch.dev.azure.com/${orgName}/_apis/search/workitemsearchresults?api-version=7.2-preview.1`;

      const filters: Record<string, string[]> = {};
      if (args.project && args.project.length > 0) filters["System.TeamProject"] = args.project;
      if (args.areaPath && args.areaPath.length > 0) filters["System.AreaPath"] = args.areaPath;
      if (args.workItemType && args.workItemType.length > 0) filters["System.WorkItemType"] = args.workItemType;
      if (args.state && args.state.length > 0) filters["System.State"] = args.state;
      if (args.assignedTo && args.assignedTo.length > 0) filters["System.AssignedTo"] = args.assignedTo;

      return `Work item search functionality requires direct REST API implementation with proper authentication.\\n` +
             `Search: "${args.searchText}"\\n` +
             `Endpoint: ${url}\\n` +
             `Filters: ${JSON.stringify(filters, null, 2)}`;
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
      const workApi = await connection.getWorkApi();
      const iterations = await workApi.getTeamIterations(
        { project: args.project, team: args.team }, 
        args.timeframe as any
      );
      
      if (!iterations || iterations.length === 0) {
        return `No iterations found for team ${args.team} in project ${args.project}`;
      }
      
      const iterationList = iterations.map(iter => 
        `- **${iter.name}**: ${iter.path}\\n  Start: ${iter.attributes?.startDate} - End: ${iter.attributes?.finishDate}\\n  State: ${iter.attributes?.timeFrame}`
      ).join('\\n');
      
      return `# Iterations for ${args.team} (${iterations.length})\\n\\n${iterationList}`;
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
      const workApi = await connection.getWorkApi();
      const teamSettings = await workApi.getTeamSettings({ project: args.project, team: args.team });
      
      if (!teamSettings) {
        return `No settings found for team ${args.team} in project ${args.project}`;
      }
      
      return `# Team Settings for ${args.team}\\n\\n` +
             `**Default Iteration**: ${teamSettings.defaultIteration?.name}\\n` +
             `**Backlog Iteration**: ${teamSettings.backlogIteration?.name}\\n` +
             `**Working Days**: ${teamSettings.workingDays?.join(', ')}\\n` +
             `**Bug Behavior**: ${teamSettings.bugsBehavior}`;
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
      const workApi = await connection.getWorkApi();
      const teamFieldValues = await workApi.getTeamFieldValues({ project: args.project, team: args.team });
      
      if (!teamFieldValues) {
        return `No field values found for team ${args.team} in project ${args.project}`;
      }
      
      return `# Team Field Values for ${args.team}\\n\\n` +
             `**Field**: ${(teamFieldValues.field as any)?.name}\\n` +
             `**Default Value**: ${teamFieldValues.defaultValue}\\n` +
             `**Values**: ${teamFieldValues.values?.map(v => v.value).join(', ')}`;
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
      const releaseApi = await connection.getReleaseApi();
      const definitions = await releaseApi.getReleaseDefinitions(
        args.project, 
        args.searchText
      );
      
      if (!definitions || definitions.length === 0) {
        return `No release definitions found for project: ${args.project}`;
      }
      
      const defList = definitions.map(d => 
        `- **${d.name}** (ID: ${d.id}): ${d.description || "No description"}\\n  Created: ${d.createdOn} - Modified: ${d.modifiedOn}`
      ).join('\\n');
      
      return `# Release Definitions for ${args.project} (${definitions.length})\\n\\n${defList}`;
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
        return `No releases found for project: ${args.project}`;
      }
      
      const releaseList = releases.map(r => 
        `- **${r.name}**: ${r.status} - Created: ${r.createdOn}\\n  Definition: ${r.releaseDefinition?.name} - Created by: ${r.createdBy?.displayName}`
      ).join('\\n');
      
      return `# Recent Releases for ${args.project} (${releases.length})\\n\\n${releaseList}`;
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
      const releaseApi = await connection.getReleaseApi();
      
      const releaseStartMetadata = {
        definitionId: args.definitionId,
        description: args.description || `Release created on ${new Date().toISOString()}`
      };
      
      const release = await releaseApi.createRelease(releaseStartMetadata, args.project);
      
      return `# Release Created: ${release.name}\\n\\n` +
             `**ID**: ${release.id}\\n` +
             `**Status**: ${release.status}\\n` +
             `**Definition**: ${release.releaseDefinition?.name}\\n` +
             `**Created**: ${release.createdOn}\\n` +
             `**Created by**: ${release.createdBy?.displayName}\\n` +
             `**Description**: ${release.description}`;
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
      const releaseApi = await connection.getReleaseApi();
      const release = await releaseApi.getRelease(args.project, args.releaseId);
      
      if (!release) {
        return `Release ${args.releaseId} not found in project ${args.project}`;
      }
      
      const environments = release.environments?.map(env => 
        `  - **${env.name}**: ${env.status} (${env.deploySteps?.length || 0} steps)`
      ).join('\\n') || "No environments";
      
      return `# Release: ${release.name}\\n\\n` +
             `**ID**: ${release.id}\\n` +
             `**Status**: ${release.status}\\n` +
             `**Definition**: ${release.releaseDefinition?.name}\\n` +
             `**Created**: ${release.createdOn}\\n` +
             `**Created by**: ${release.createdBy?.displayName}\\n` +
             `**Description**: ${release.description}\\n\\n` +
             `**Environments**:\\n${environments}`;
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
        return `No test plans found for project: ${args.project}`;
      }

      const planList = testPlans.map(plan => 
        `- **${plan.name}** (ID: ${plan.id}): ${plan.description || "No description"}\\n  State: ${plan.state} - Area: ${plan.areaPath}`
      ).join('\\n');

      return `# Test Plans for ${args.project} (${testPlans.length})\\n\\n${planList}`;
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
      const testPlanApi = await connection.getTestPlanApi();
      
      const testPlanCreateParams = {
        name: args.name,
        description: args.description,
        areaPath: args.areaPath,
        iteration: args.iterationPath
      };
      
      const testPlan = await testPlanApi.createTestPlan(testPlanCreateParams, args.project);
      
      return `# Test Plan Created: ${testPlan.name}\\n\\n` +
             `**ID**: ${testPlan.id}\\n` +
             `**State**: ${testPlan.state}\\n` +
             `**Area Path**: ${testPlan.areaPath}\\n` +
             `**Iteration**: ${testPlan.iteration}\\n` +
             `**Description**: ${testPlan.description}`;
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
      
      return `# Test Case Created: ${testCase.id}\\n\\n` +
             `**Title**: ${args.title}\\n` +
             `**State**: ${testCase.fields?.["System.State"]}\\n` +
             `**Area Path**: ${testCase.fields?.["System.AreaPath"]}\\n` +
             `**URL**: ${testCase._links?.html?.href || "N/A"}`;
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
      // Use WIQL query to find test cases
      const witApi = await connection.getWorkItemTrackingApi();
      const wiql = `SELECT [System.Id], [System.Title], [System.State] FROM WorkItems WHERE [System.WorkItemType] = 'Test Case' AND [System.TeamProject] = '${args.project}' ORDER BY [System.Id] DESC`;
      
      const queryResult = await witApi.queryByWiql({ query: wiql });
      
      if (!queryResult.workItems || queryResult.workItems.length === 0) {
        return `No test cases found for project: ${args.project}`;
      }
      
      const limitedIds = queryResult.workItems.slice(0, args.top || 10).map(wi => wi.id!);
      const workItems = await witApi.getWorkItems(limitedIds);
      
      const testCaseList = workItems.map(item => {
        const fields = item.fields || {};
        return `- **${item.id}**: ${fields["System.Title"]} (${fields["System.State"]})`;
      }).join('\\n');
      
      return `# Test Cases for ${args.project} (${workItems.length})\\n\\n${testCaseList}`;
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
      // This requires direct API calls to test plan services
      return `Adding test cases to suite functionality requires direct REST API implementation.\\n` +
             `Plan ID: ${args.planId}\\n` +
             `Suite ID: ${args.suiteId}\\n` +
             `Test Case IDs: ${args.testCaseIds.join(', ')}`;
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
      const testApi = await connection.getTestApi();
      const testResults = await testApi.getTestResults(args.project, undefined, undefined, undefined, args.buildId);
      
      if (!testResults || testResults.length === 0) {
        return `No test results found for build ${args.buildId}`;
      }
      
      const resultList = testResults.map(result => 
        `- **${result.testCase?.name || result.automatedTestName}**: ${result.outcome}\\n  Duration: ${result.durationInMs}ms - Run: ${result.testRun?.name}`
      ).join('\\n');
      
      return `# Test Results for Build ${args.buildId} (${testResults.length})\\n\\n${resultList}`;
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
      
      return `Advanced Security alerts functionality requires direct REST API implementation with proper authentication.\\n` +
             `Repository: ${args.repository}\\n` +
             `Endpoint: ${url}\\n` +
             `Filters: Alert Type: ${args.alertType || 'all'}, States: ${args.states?.join(', ') || 'all'}, Severities: ${args.severities?.join(', ') || 'all'}`;
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
      // This requires direct REST API call to Advanced Security APIs
      const orgName = connection.serverUrl.split("/")[3];
      const endpoint = `https://advsec.dev.azure.com/${orgName}/${args.project}/_apis/alert/repositories/${args.repository}/alerts/${args.alertId}`;
      
      return `Advanced Security alert details functionality requires direct REST API implementation with proper authentication.\\n` +
             `Repository: ${args.repository}\\n` +
             `Alert ID: ${args.alertId}\\n` +
             `Endpoint: ${endpoint}`;
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
      const witApi = await connection.getWorkItemTrackingApi();
      const workItem = await witApi.getWorkItem(args.workItemId);
      
      if (!workItem) {
        return `Work item ${args.workItemId} not found.`;
      }
      
      const fields = workItem.fields || {};
      return `# Work Item ${workItem.id}: ${fields["System.Title"]}\\n\\n` +
             `**Type**: ${fields["System.WorkItemType"]}\\n` +
             `**State**: ${fields["System.State"]}\\n` +
             `**Assigned To**: ${fields["System.AssignedTo"]?.displayName || "Unassigned"}\\n` +
             `**Created**: ${fields["System.CreatedDate"]}`;
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
      const coreApi = await connection.getCoreApi();
      const projects = await coreApi.getProjects();
      
      let filteredProjects = projects;
      if (args.nameFilter) {
        const lowerFilter = args.nameFilter.toLowerCase();
        filteredProjects = projects.filter(p => p.name?.toLowerCase().includes(lowerFilter));
      }
      
      const projectList = filteredProjects.map(p => 
        `- **${p.name}**: ${p.description || "No description"} (ID: ${p.id})`
      ).join('\\n');
      
      return `# Projects (${filteredProjects.length})\\n\\n${projectList}`;
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
      const buildApi = await connection.getBuildApi();
      const definitions = await buildApi.getDefinitions(args.project, args.name);
      
      if (!definitions || definitions.length === 0) {
        return `No build definitions found for project: ${args.project}`;
      }
      
      const defList = definitions.map(d => 
        `- **${d.name}** (ID: ${d.id}): ${(d as any).description || "No description"} - Type: ${d.type}`
      ).join('\\n');
      
      return `# Build Definitions for ${args.project} (${definitions.length})\\n\\n${defList}`;
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
        return `No builds found for project: ${args.project}`;
      }
      
      const buildList = builds.map(b => 
        `- **Build ${b.buildNumber}**: ${b.definition?.name} - ${b.status} (${b.result || "In Progress"})`
      ).join('\\n');
      
      return `# Recent builds for ${args.project} (${builds.length})\\n\\n${buildList}`;
    }
  }
];