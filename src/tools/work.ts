// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AccessToken } from "@azure/identity";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { z } from "zod";
import { TreeStructureGroup } from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js";

const WORK_TOOLS = {
  list_team_iterations: "work_list_team_iterations",
  create_iterations: "work_create_iterations",
  assign_iterations: "work_assign_iterations",
  list_iterations: "work_list_iterations",
  get_team_capacity: "work_get_team_capacity",
  update_team_capacity: "work_update_team_capacity",
  get_iteration_capacities: "work_get_iteration_capacities",
  get_team_settings: "work_get_team_settings",
};

function configureWorkTools(server: McpServer, tokenProvider: () => Promise<AccessToken>, connectionProvider: () => Promise<WebApi>) {
  server.tool(
    WORK_TOOLS.list_team_iterations,
    "Retrieve a list of iterations for a specific team in a project.",
    {
      project: z.string().describe("The name or ID of the Azure DevOps project."),
      team: z.string().describe("The name or ID of the Azure DevOps team."),
      timeframe: z.enum(["current"]).optional().describe("The timeframe for which to retrieve iterations. Currently, only 'current' is supported."),
    },
    async ({ project, team, timeframe }) => {
      try {
        const connection = await connectionProvider();
        const workApi = await connection.getWorkApi();
        const iterations = await workApi.getTeamIterations({ project, team }, timeframe);

        if (!iterations) {
          return { content: [{ type: "text", text: "No iterations found" }], isError: true };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(iterations, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error fetching team iterations: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.create_iterations,
    "Create new iterations in a specified Azure DevOps project.",
    {
      project: z.string().describe("The name or ID of the Azure DevOps project."),
      iterations: z
        .array(
          z.object({
            iterationName: z.string().describe("The name of the iteration to create."),
            startDate: z.string().optional().describe("The start date of the iteration in ISO format (e.g., '2023-01-01T00:00:00Z'). Optional."),
            finishDate: z.string().optional().describe("The finish date of the iteration in ISO format (e.g., '2023-01-31T23:59:59Z'). Optional."),
          })
        )
        .describe("An array of iterations to create. Each iteration must have a name and can optionally have start and finish dates in ISO format."),
    },
    async ({ project, iterations }) => {
      try {
        const connection = await connectionProvider();
        const workItemTrackingApi = await connection.getWorkItemTrackingApi();
        const results = [];

        for (const { iterationName, startDate, finishDate } of iterations) {
          // Step 1: Create the iteration
          const iteration = await workItemTrackingApi.createOrUpdateClassificationNode(
            {
              name: iterationName,
              attributes: {
                startDate: startDate ? new Date(startDate) : undefined,
                finishDate: finishDate ? new Date(finishDate) : undefined,
              },
            },
            project,
            TreeStructureGroup.Iterations
          );

          if (iteration) {
            results.push(iteration);
          }
        }

        if (results.length === 0) {
          return { content: [{ type: "text", text: "No iterations were created" }], isError: true };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error creating iterations: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.assign_iterations,
    "Assign existing iterations to a specific team in a project.",
    {
      project: z.string().describe("The name or ID of the Azure DevOps project."),
      team: z.string().describe("The name or ID of the Azure DevOps team."),
      iterations: z
        .array(
          z.object({
            identifier: z.string().describe("The identifier of the iteration to assign."),
            path: z.string().describe("The path of the iteration to assign, e.g., 'Project/Iteration'."),
          })
        )
        .describe("An array of iterations to assign. Each iteration must have an identifier and a path."),
    },
    async ({ project, team, iterations }) => {
      try {
        const connection = await connectionProvider();
        const workApi = await connection.getWorkApi();
        const teamContext = { project, team };
        const results = [];

        for (const { identifier, path } of iterations) {
          const assignment = await workApi.postTeamIteration({ path: path, id: identifier }, teamContext);

          if (assignment) {
            results.push(assignment);
          }
        }

        if (results.length === 0) {
          return { content: [{ type: "text", text: "No iterations were assigned to the team" }], isError: true };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error assigning iterations: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.list_iterations,
    "List all iterations in a project classification tree.",
    {
      project: z.string().describe("The name or ID of the Azure DevOps project."),
      depth: z.number().default(2).describe("The depth of child nodes to retrieve. Defaults to 2."),
      excludedIds: z.array(z.number()).optional().describe("Optional list of node IDs to exclude from the results along with their children."),
    },
    async ({ project, depth, excludedIds }) => {
      try {
        const connection = await connectionProvider();
        const workItemTrackingApi = await connection.getWorkItemTrackingApi();
        const result = await workItemTrackingApi.getClassificationNode(project, TreeStructureGroup.Iterations, "", depth);

        if (!result) {
          return { content: [{ type: "text", text: "No iterations found" }], isError: true };
        }

        if (excludedIds && excludedIds.length > 0) {
          const filterNodes = (node: any): any => {
            if (excludedIds.includes(node.id)) {
              return null;
            }
            if (node.children) {
              node.children = node.children.map(filterNodes).filter((n: any) => n !== null);
            }
            return node;
          };
          const filtered = filterNodes(result);
          return {
            content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }],
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error listing iterations: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.get_team_capacity,
    "Get team capacity for an iteration.",
    {
      project: z.string().optional().describe("The name or ID of the Azure DevOps project."),
      team: z.string().describe("The name or ID of the Azure DevOps team."),
      iterationId: z.string().describe("The ID of the iteration."),
    },
    async ({ project, team, iterationId }) => {
      try {
        const connection = await connectionProvider();
        const workApi = await connection.getWorkApi();
        const result = await workApi.getCapacitiesWithIdentityRefAndTotals({ project, team }, iterationId);

        if (!result) {
          return { content: [{ type: "text", text: "No capacity data found" }], isError: true };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error fetching team capacity: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.update_team_capacity,
    "Update team member capacity for an iteration.",
    {
      project: z.string().describe("The name or ID of the Azure DevOps project."),
      team: z.string().describe("The name or ID of the Azure DevOps team."),
      teamMemberId: z.string().describe("The ID of the team member."),
      iterationId: z.string().describe("The ID of the iteration."),
      activities: z
        .array(
          z.object({
            name: z.string().describe("The name of the activity."),
            capacityPerDay: z.number().describe("The capacity per day for this activity."),
          })
        )
        .describe("An array of activities with their capacity per day."),
      daysOff: z
        .array(
          z.object({
            start: z.string().describe("The start date of the day off in ISO format."),
            end: z.string().describe("The end date of the day off in ISO format."),
          })
        )
        .optional()
        .describe("Optional array of days off with start and end dates in ISO format."),
    },
    async ({ project, team, teamMemberId, iterationId, activities, daysOff }) => {
      try {
        const connection = await connectionProvider();
        const workApi = await connection.getWorkApi();

        const convertedDaysOff = daysOff
          ? daysOff.map((d) => ({ start: new Date(d.start), end: new Date(d.end) }))
          : [];

        const result = await workApi.updateCapacityWithIdentityRef(
          { activities, daysOff: convertedDaysOff },
          { project, team },
          iterationId,
          teamMemberId
        );

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error updating team capacity: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.get_iteration_capacities,
    "Get capacity for all teams in an iteration.",
    {
      project: z.string().optional().describe("The name or ID of the Azure DevOps project."),
      iterationId: z.string().describe("The ID of the iteration."),
    },
    async ({ project, iterationId }) => {
      try {
        const connection = await connectionProvider();
        const accessToken = await tokenProvider();
        const orgUrl = connection.serverUrl;
        const projectParam = project || "";
        const url = `${orgUrl}/${projectParam}/_apis/work/iterations/${iterationId}/capacities?api-version=7.0`;

        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${accessToken.token}`,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to get iteration capacities (${response.status}): ${errorText}`);
        }

        const result = await response.json();

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error fetching iteration capacities: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    WORK_TOOLS.get_team_settings,
    "Get team settings and team field values.",
    {
      project: z.string().optional().describe("The name or ID of the Azure DevOps project."),
      team: z.string().optional().describe("The name or ID of the Azure DevOps team."),
    },
    async ({ project, team }) => {
      try {
        const connection = await connectionProvider();
        const workApi = await connection.getWorkApi();

        const [teamSettings, teamFieldValues] = await Promise.all([
          workApi.getTeamSettings({ project, team }),
          workApi.getTeamFieldValues({ project, team }),
        ]);

        const result = {
          teamSettings,
          teamFieldValues,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error fetching team settings: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );
}

export { WORK_TOOLS, configureWorkTools };
