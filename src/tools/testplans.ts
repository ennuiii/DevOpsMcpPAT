// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AccessToken } from "@azure/identity";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { TestPlanCreateParams } from "azure-devops-node-api/interfaces/TestPlanInterfaces.js";
import { z } from "zod";

const Test_Plan_Tools = {
  create_test_plan: "testplan_create_test_plan",
  create_test_case: "testplan_create_test_case",
  add_test_cases_to_suite: "testplan_add_test_cases_to_suite",
  test_results_from_build_id: "testplan_show_test_results_from_build_id",
  list_test_cases: "testplan_list_test_cases",
  list_test_plans: "testplan_list_test_plans",
  list_test_suites: "testplan_list_test_suites",
  create_test_suite: "testplan_create_test_suite",
  update_test_case_steps: "testplan_update_test_case_steps",
};

function configureTestPlanTools(server: McpServer, tokenProvider: () => Promise<AccessToken>, connectionProvider: () => Promise<WebApi>) {
  /*
    LIST OF TEST PLANS
    get list of test plans by project
  */
  server.tool(
    Test_Plan_Tools.list_test_plans,
    "Retrieve a paginated list of test plans from an Azure DevOps project. Allows filtering for active plans and toggling detailed information.",
    {
      project: z.string().describe("The unique identifier (ID or name) of the Azure DevOps project."),
      filterActivePlans: z.boolean().default(true).describe("Filter to include only active test plans. Defaults to true."),
      includePlanDetails: z.boolean().default(false).describe("Include detailed information about each test plan."),
      continuationToken: z.string().optional().describe("Token to continue fetching test plans from a previous request."),
    },
    async ({ project, filterActivePlans, includePlanDetails, continuationToken }) => {
      try {
        const owner = ""; //making owner an empty string untill we can figure out how to get owner id
        const connection = await connectionProvider();
        const testPlanApi = await connection.getTestPlanApi();

        const testPlans = await testPlanApi.getTestPlans(project, owner, continuationToken, includePlanDetails, filterActivePlans);

        return {
          content: [{ type: "text", text: JSON.stringify(testPlans, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error listing test plans: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  /*
    Create Test Plan - CREATE
  */
  server.tool(
    Test_Plan_Tools.create_test_plan,
    "Creates a new test plan in the project.",
    {
      project: z.string().describe("The unique identifier (ID or name) of the Azure DevOps project where the test plan will be created."),
      name: z.string().describe("The name of the test plan to be created."),
      iteration: z.string().describe("The iteration path for the test plan"),
      description: z.string().optional().describe("The description of the test plan"),
      startDate: z.string().optional().describe("The start date of the test plan"),
      endDate: z.string().optional().describe("The end date of the test plan"),
      areaPath: z.string().optional().describe("The area path for the test plan"),
    },
    async ({ project, name, iteration, description, startDate, endDate, areaPath }) => {
      try {
        const connection = await connectionProvider();
        const testPlanApi = await connection.getTestPlanApi();

        const testPlanToCreate: TestPlanCreateParams = {
          name,
          iteration,
          description,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          areaPath,
        };

        const createdTestPlan = await testPlanApi.createTestPlan(testPlanToCreate, project);

        return {
          content: [{ type: "text", text: JSON.stringify(createdTestPlan, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error creating test plan: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  /*
    Add Test Cases to Suite - ADD
  */
  server.tool(
    Test_Plan_Tools.add_test_cases_to_suite,
    "Adds existing test cases to a test suite.",
    {
      project: z.string().describe("The unique identifier (ID or name) of the Azure DevOps project."),
      planId: z.number().describe("The ID of the test plan."),
      suiteId: z.number().describe("The ID of the test suite."),
      testCaseIds: z.string().or(z.array(z.string())).describe("The ID(s) of the test case(s) to add. "),
    },
    async ({ project, planId, suiteId, testCaseIds }) => {
      try {
        const connection = await connectionProvider();
        const testApi = await connection.getTestApi();

        // If testCaseIds is an array, convert it to comma-separated string
        const testCaseIdsString = Array.isArray(testCaseIds) ? testCaseIds.join(",") : testCaseIds;

        const addedTestCases = await testApi.addTestCasesToSuite(project, planId, suiteId, testCaseIdsString);

        return {
          content: [{ type: "text", text: JSON.stringify(addedTestCases, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error adding test cases to suite: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  /*
    Create Test Case - CREATE
  */
  server.tool(
    Test_Plan_Tools.create_test_case,
    "Creates a new test case work item.",
    {
      project: z.string().describe("The unique identifier (ID or name) of the Azure DevOps project."),
      title: z.string().describe("The title of the test case."),
      steps: z
        .string()
        .optional()
        .describe(
          "The steps to reproduce the test case. Make sure to format each step as '1. Step one|Expected result one\n2. Step two|Expected result two. USE '|' as the delimiter between step and expected result. DO NOT use '|' in the description of the step or expected result."
        ),
      priority: z.number().optional().describe("The priority of the test case."),
      areaPath: z.string().optional().describe("The area path for the test case."),
      iterationPath: z.string().optional().describe("The iteration path for the test case."),
    },
    async ({ project, title, steps, priority, areaPath, iterationPath }) => {
      try {
        const connection = await connectionProvider();
        const witClient = await connection.getWorkItemTrackingApi();

        let stepsXml;
        if (steps) {
          stepsXml = convertStepsToXml(steps);
        }

        // Create JSON patch document for work item
        const patchDocument = [];

        patchDocument.push({
          op: "add",
          path: "/fields/System.Title",
          value: title,
        });

        if (stepsXml) {
          patchDocument.push({
            op: "add",
            path: "/fields/Microsoft.VSTS.TCM.Steps",
            value: stepsXml,
          });
        }

        if (priority) {
          patchDocument.push({
            op: "add",
            path: "/fields/Microsoft.VSTS.Common.Priority",
            value: priority,
          });
        }

        if (areaPath) {
          patchDocument.push({
            op: "add",
            path: "/fields/System.AreaPath",
            value: areaPath,
          });
        }

        if (iterationPath) {
          patchDocument.push({
            op: "add",
            path: "/fields/System.IterationPath",
            value: iterationPath,
          });
        }

        const workItem = await witClient.createWorkItem({}, patchDocument, project, "Test Case");

        return {
          content: [{ type: "text", text: JSON.stringify(workItem, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error creating test case: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  /* 
    TEST PLANS
    Gets a list of test cases for a given testplan.
  */
  server.tool(
    Test_Plan_Tools.list_test_cases,
    "Gets a list of test cases in the test plan.",
    {
      project: z.string().describe("The unique identifier (ID or name) of the Azure DevOps project."),
      planid: z.number().describe("The ID of the test plan."),
      suiteid: z.number().describe("The ID of the test suite."),
    },
    async ({ project, planid, suiteid }) => {
      try {
        const connection = await connectionProvider();
        const coreApi = await connection.getTestPlanApi();
        const testcases = await coreApi.getTestCaseList(project, planid, suiteid);

        return {
          content: [{ type: "text", text: JSON.stringify(testcases, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error listing test cases: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  /*
    Gets a list of test results for a given project and build ID
  */
  server.tool(
    Test_Plan_Tools.test_results_from_build_id,
    "Gets a list of test results for a given project and build ID.",
    {
      project: z.string().describe("The unique identifier (ID or name) of the Azure DevOps project."),
      buildid: z.number().describe("The ID of the build."),
    },
    async ({ project, buildid }) => {
      try {
        const connection = await connectionProvider();
        const coreApi = await connection.getTestResultsApi();
        const testResults = await coreApi.getTestResultDetailsForBuild(project, buildid);

        return {
          content: [{ type: "text", text: JSON.stringify(testResults, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error fetching test results: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    Test_Plan_Tools.list_test_suites,
    "List test suites in a test plan.",
    {
      project: z.string().describe("The unique identifier (ID or name) of the Azure DevOps project."),
      planId: z.number().describe("The ID of the test plan."),
      continuationToken: z.string().optional().describe("Token to continue fetching test suites from a previous request."),
    },
    async ({ project, planId, continuationToken }) => {
      try {
        const connection = await connectionProvider();
        const accessToken = await tokenProvider();
        const orgUrl = connection.serverUrl;

        let url = `${orgUrl}/${project}/_apis/testplan/Plans/${planId}/Suites?api-version=7.0`;
        if (continuationToken) {
          url += `&continuationToken=${encodeURIComponent(continuationToken)}`;
        }

        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${accessToken.token}`,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to list test suites (${response.status}): ${errorText}`);
        }

        const result = await response.json();

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error listing test suites: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    Test_Plan_Tools.create_test_suite,
    "Create a test suite in a test plan.",
    {
      project: z.string().describe("The unique identifier (ID or name) of the Azure DevOps project."),
      planId: z.number().describe("The ID of the test plan."),
      parentSuiteId: z.number().describe("The ID of the parent test suite."),
      name: z.string().describe("The name of the test suite to create."),
    },
    async ({ project, planId, parentSuiteId, name }) => {
      try {
        const connection = await connectionProvider();
        const testPlanApi = await connection.getTestPlanApi();

        const maxRetries = 5;
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            const createdSuite = await testPlanApi.createTestSuite(
              {
                suiteType: 2,
                name,
                parentSuite: { id: parentSuiteId } as any,
              } as any,
              project,
              planId
            );

            return {
              content: [{ type: "text", text: JSON.stringify(createdSuite, null, 2) }],
            };
          } catch (retryError) {
            lastError = retryError instanceof Error ? retryError : new Error(String(retryError));
            // Retry on TF26071 concurrency error
            if (lastError.message && lastError.message.includes("TF26071")) {
              const delay = Math.pow(2, attempt) * 1000;
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            }
            throw lastError;
          }
        }

        throw lastError || new Error("Max retries exceeded");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error creating test suite: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    Test_Plan_Tools.update_test_case_steps,
    "Update test case steps for an existing test case work item.",
    {
      id: z.number().describe("The ID of the test case work item to update."),
      steps: z
        .string()
        .describe(
          "The steps formatted as '1. step|expected\\n2. step|expected'. Use '|' as the delimiter between step and expected result."
        ),
    },
    async ({ id, steps }) => {
      try {
        const connection = await connectionProvider();
        const workItemApi = await connection.getWorkItemTrackingApi();

        const stepsXml = convertStepsToXml(steps);

        const patchDocument = [
          {
            op: "add",
            path: "/fields/Microsoft.VSTS.TCM.Steps",
            value: stepsXml,
          },
        ];

        const result = await workItemApi.updateWorkItem({}, patchDocument, id);

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error updating test case steps: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );
}

/*
 * Helper function to convert steps text to XML format required
 */
function convertStepsToXml(steps: string): string {
  // Accepts steps in the format: '1. Step one|Expected result one\n2. Step two|Expected result two'
  const stepsLines = steps.split("\n").filter((line) => line.trim() !== "");

  let xmlSteps = `<steps id="0" last="${stepsLines.length}">`;

  for (let i = 0; i < stepsLines.length; i++) {
    const stepLine = stepsLines[i].trim();
    if (stepLine) {
      // Split step and expected result by '|', fallback to default if not provided
      const [stepPart, expectedPart] = stepLine.split("|").map((s) => s.trim());
      const stepMatch = stepPart.match(/^(\d+)\.\s*(.+)$/);
      const stepText = stepMatch ? stepMatch[2] : stepPart;
      const expectedText = expectedPart || "Verify step completes successfully";

      xmlSteps += `
                <step id="${i + 1}" type="ActionStep">
                    <parameterizedString isformatted="true">${escapeXml(stepText)}</parameterizedString>
                    <parameterizedString isformatted="true">${escapeXml(expectedText)}</parameterizedString>
                </step>`;
    }
  }

  xmlSteps += "</steps>";
  return xmlSteps;
}

/*
 * Helper function to escape XML special characters
 */
function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}

export { Test_Plan_Tools, configureTestPlanTools };
