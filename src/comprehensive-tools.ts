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

export const comprehensiveTools: ComprehensiveTool[] = [
  // Core Tools
  {
    name: "core_list_projects",
    description: "List all projects in Azure DevOps organization",
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
      ).join('\n');
      
      return `# Projects (${filteredProjects.length})\\n\\n${projectList}`;
    }
  },

  {
    name: "core_list_project_teams",
    description: "List teams for a specific project",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name or ID" },
        mine: { type: "boolean", description: "Only teams I'm a member of (optional)" },
        top: { type: "number", description: "Maximum number of teams to return (optional)" }
      },
      required: ["project"]
    },
    handler: async (args, connection) => {
      const coreApi = await connection.getCoreApi();
      const teams = await coreApi.getTeams(args.project, args.mine, args.top, 0, false);
      
      if (!teams || teams.length === 0) {
        return `No teams found for project: ${args.project}`;
      }
      
      const teamList = teams.map(t => 
        `- **${t.name}**: ${t.description || "No description"} (ID: ${t.id})`
      ).join('\n');
      
      return `# Teams in ${args.project} (${teams.length})\\n\\n${teamList}`;
    }
  },

  // Work Item Tools
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
        tags: { type: "string", description: "Comma-separated tags (optional)" }
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
        return `- **${item.id}**: ${fields["System.Title"]} (${fields["System.State"]})`;
      }).join('\\n');
      
      return `# Query Results (${workItems.length} items)\\n\\n${formattedItems}`;
    }
  },

  // Build Tools
  {
    name: "build_get_builds",
    description: "Get builds for a project",
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
  },

  {
    name: "build_list_definitions",
    description: "List build definitions for a project",
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
      const definitions = await buildApi.getDefinitions(args.project, args.name, args.type);
      
      if (!definitions || definitions.length === 0) {
        return `No build definitions found for project: ${args.project}`;
      }
      
      const defList = definitions.map(d => 
        `- **${d.name}** (ID: ${d.id}): ${(d as any).description || "No description"} - Type: ${d.type}`
      ).join('\\n');
      
      return `# Build Definitions for ${args.project} (${definitions.length})\\n\\n${defList}`;
    }
  },

  // Repository Tools  
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
        `- **${repo.name}**: ${repo.defaultBranch || "No default branch"} (ID: ${repo.id}) - ${repo.webUrl}`
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
             `**Is Fork**: ${repository.isFork ? "Yes" : "No"}`;
    }
  },

  // Work Tools (Iterations, Sprints)
  {
    name: "work_list_team_iterations",
    description: "List iterations for a team",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name or ID" },
        team: { type: "string", description: "Team name or ID" },
        timeframe: { type: "string", description: "Timeframe filter (current, etc.)" }
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
        `- **${iter.name}**: ${iter.path} (${iter.attributes?.startDate} - ${iter.attributes?.finishDate})`
      ).join('\\n');
      
      return `# Iterations for ${args.team} (${iterations.length})\\n\\n${iterationList}`;
    }
  },

  // Release Tools
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
        `- **${d.name}** (ID: ${d.id}): ${(d as any).description || "No description"}`
      ).join('\\n');
      
      return `# Release Definitions for ${args.project} (${definitions.length})\\n\\n${defList}`;
    }
  },

  // Simple aliases for backward compatibility
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
  }
];