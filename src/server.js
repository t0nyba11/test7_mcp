import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AzureDevOpsService } from "./azureDevOpsService.js";

const toolInputSchema = {
  wiql: z.string().min(1).describe("WIQL query to run."),
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
        "Runs a WIQL query against Azure DevOps Work Item Tracking and returns the query result.",
      inputSchema: toolInputSchema
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

  return server;
}

export async function startServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
