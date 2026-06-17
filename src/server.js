import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AzureDevOpsService } from "./azureDevOpsService.js";

const contextInputSchema = {
  organizationUrl: z
    .string()
    .url()
    .optional()
    .describe("Azure DevOps organization URL, for example https://dev.azure.com/my-org. Defaults to AZURE_DEVOPS_ORG_URL."),
  project: z
    .string()
    .min(1)
    .optional()
    .describe("Azure DevOps project name. Defaults to AZURE_DEVOPS_PROJECT."),
  top: z
    .number()
    .int()
    .positive()
    .max(20000)
    .optional()
    .describe("Maximum number of WIQL rows to return."),
  timePrecision: z
    .boolean()
    .optional()
    .describe("Whether Azure DevOps should evaluate date/time precision."),
  apiVersion: z
    .string()
    .min(1)
    .optional()
    .describe("Azure DevOps REST API version. Defaults to 7.1.")
};

const workItemFetchOptionsSchema = {
  fields: z
    .array(z.string().min(1))
    .optional()
    .describe("Specific work item field reference names to return, for example System.Id or System.Title."),
  asOf: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe("UTC date-time for historical field values."),
  errorPolicy: z
    .enum(["fail", "omit"])
    .optional()
    .describe("Azure DevOps batch error policy for missing or inaccessible work items."),
  expand: z
    .enum(["none", "relations", "fields", "links", "all"])
    .optional()
    .describe("Azure DevOps work item expand option.")
};

const runWiqlInputSchema = {
  wiql: z.string().min(1).describe("WIQL query to run."),
  ...contextInputSchema,
  ...workItemFetchOptionsSchema,
  includeWorkItems: z
    .boolean()
    .optional()
    .describe("When true, fetches matching work items after WIQL returns their IDs."),
  top: z
    .number()
    .int()
    .positive()
    .max(20000)
    .optional()
    .describe("Maximum number of WIQL rows to return."),
  timePrecision: z
    .boolean()
    .optional()
    .describe("Whether Azure DevOps should evaluate date/time precision.")
};

const getWorkItemsInputSchema = {
  ids: z
    .array(z.number().int().positive())
    .min(1)
    .describe("Azure DevOps work item IDs to fetch."),
  ...contextInputSchema,
  ...workItemFetchOptionsSchema
};

export function createServer({ service = new AzureDevOpsService() } = {}) {
  const server = new McpServer({
    name: "azure-devops-wiql-mcp-server",
    version: "0.1.0"
  });

  // Keep MCP transport concerns here; Azure DevOps access stays isolated in the service.
  server.registerTool(
    "run_wiql",
    {
      title: "Run Azure DevOps WIQL",
      description:
        "Runs a WIQL query against Azure DevOps Work Item Tracking. Optionally fetches matching work item fields.",
      inputSchema: runWiqlInputSchema
    },
    async (input) => {
      const result = await service.runWiql(input);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ],
        structuredContent: result
      };
    }
  );

  server.registerTool(
    "get_work_items",
    {
      title: "Get Azure DevOps Work Items",
      description:
        "Fetches Azure DevOps work items by ID, optionally limited to requested field reference names.",
      inputSchema: getWorkItemsInputSchema
    },
    async (input) => {
      const result = await service.getWorkItems(input);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ],
        structuredContent: result
      };
    }
  );

  return server;
}

export async function startServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
