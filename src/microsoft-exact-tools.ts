// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { WebApi } from "azure-devops-node-api";
import { WikiPagesBatchRequest } from "azure-devops-node-api/interfaces/WikiInterfaces.js";

// Tool definition interface to match Microsoft's exact format
export interface MicrosoftTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (args: any, connection: WebApi, tokenProvider?: () => Promise<{ token: string }>) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;
}

// Helper function to stream to string - exactly as Microsoft implements
function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => (data += chunk));
    stream.on("end", () => resolve(data));
    stream.on("error", reject);
  });
}

// Exact Microsoft implementation of all tools
export const microsoftExactTools: MicrosoftTool[] = [
  // ============================================================================
  // WIKI TOOLS - Exact Microsoft Implementation
  // ============================================================================
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
          return { content: [{ type: "text", text: "No wiki found" }], isError: true };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(wiki, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error fetching wiki: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  },

  {
    name: "wiki_list_wikis",
    description: "Retrieve a list of wikis for an organization or project.",
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

        if (!wikis) {
          return { content: [{ type: "text", text: "No wikis found" }], isError: true };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(wikis, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error fetching wikis: ${errorMessage}` }],
          isError: true,
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

        const pagesBatchRequest: WikiPagesBatchRequest = {
          top: args.top || 20,
          continuationToken: args.continuationToken,
          pageViewsForDays: args.pageViewsForDays,
        };

        const pages = await wikiApi.getPagesBatch(pagesBatchRequest, args.project, args.wikiIdentifier);

        if (!pages) {
          return { content: [{ type: "text", text: "No wiki pages found" }], isError: true };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(pages, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error fetching wiki pages: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  },

  {
    name: "wiki_get_page_content",
    description: "Retrieve wiki page content by wikiIdentifier and path.",
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
          return { content: [{ type: "text", text: "No wiki page content found" }], isError: true };
        }

        const content = await streamToString(stream);

        return {
          content: [{ type: "text", text: JSON.stringify(content, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error fetching wiki page content: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  },

  {
    name: "wiki_create_or_update_page",
    description: "Create or update a wiki page with content.",
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
    handler: async (args, connection, tokenProvider) => {
      try {
        if (!tokenProvider) {
          throw new Error("Token provider is required for wiki page creation/update");
        }
        
        const accessToken = await tokenProvider();

        // Normalize the path
        const normalizedPath = args.path.startsWith("/") ? args.path : `/${args.path}`;
        const encodedPath = encodeURIComponent(normalizedPath);

        // Build the URL for the wiki page API
        const baseUrl = connection.serverUrl;
        const projectParam = args.project || "";
        const url = `${baseUrl}/${projectParam}/_apis/wiki/wikis/${args.wikiIdentifier}/pages?path=${encodedPath}&api-version=7.1`;

        // First, try to create a new page (PUT without ETag)
        try {
          const createResponse = await fetch(url, {
            method: "PUT",
            headers: {
              "Authorization": `Bearer ${accessToken.token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ content: args.content }),
          });

          if (createResponse.ok) {
            const result = await createResponse.json();
            return {
              content: [
                {
                  type: "text",
                  text: `Successfully created wiki page at path: ${normalizedPath}. Response: ${JSON.stringify(result, null, 2)}`,
                },
              ],
            };
          }

          // If creation failed with 409 (Conflict) or 500 (Page exists), try to update it
          if (createResponse.status === 409 || createResponse.status === 500) {
            // Page exists, we need to get the ETag and update it
            let currentEtag = args.etag;

            if (!currentEtag) {
              // Fetch current page to get ETag
              const getResponse = await fetch(url, {
                method: "GET",
                headers: {
                  Authorization: `Bearer ${accessToken.token}`,
                },
              });

              if (getResponse.ok) {
                currentEtag = getResponse.headers.get("etag") || getResponse.headers.get("ETag") || undefined;
                if (!currentEtag) {
                  const pageData = await getResponse.json();
                  currentEtag = pageData.eTag;
                }
              }

              if (!currentEtag) {
                throw new Error("Could not retrieve ETag for existing page");
              }
            }

            // Now update the existing page with ETag
            const updateResponse = await fetch(url, {
              method: "PUT",
              headers: {
                "Authorization": `Bearer ${accessToken.token}`,
                "Content-Type": "application/json",
                "If-Match": currentEtag,
              },
              body: JSON.stringify({ content: args.content }),
            });

            if (updateResponse.ok) {
              const result = await updateResponse.json();
              return {
                content: [
                  {
                    type: "text",
                    text: `Successfully updated wiki page at path: ${normalizedPath}. Response: ${JSON.stringify(result, null, 2)}`,
                  },
                ],
              };
            } else {
              const errorText = await updateResponse.text();
              throw new Error(`Failed to update page (${updateResponse.status}): ${errorText}`);
            }
          } else {
            const errorText = await createResponse.text();
            throw new Error(`Failed to create page (${createResponse.status}): ${errorText}`);
          }
        } catch (fetchError) {
          throw fetchError;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

        return {
          content: [{ type: "text", text: `Error creating/updating wiki page: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  }
];