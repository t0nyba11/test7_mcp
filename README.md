# Azure DevOps WIQL MCP Server

An MCP server that lets MCP clients run Azure DevOps WIQL queries through a local or `npx`-launched JavaScript package.

## Features

- Exposes a `run_wiql` MCP tool.
- Exposes a `get_work_items` MCP tool for fetching requested fields by ID.
- Runs WIQL against Azure DevOps Work Item Tracking.
- Can hydrate WIQL results with full work item fields.
- Reads authentication only from the current process environment.
- Stores no credentials and uses no external storage.
- Works locally with `npm start` or after publishing with `npx`.

## Requirements

- Node.js 20.11 or newer.
- An Azure DevOps PAT or bearer token with access to Work Item Tracking.

## Authentication

Credentials are passed through at runtime with environment variables. They are not written to disk by this package.

Use one of:

```bash
AZURE_DEVOPS_PAT=your-personal-access-token
AZURE_DEVOPS_BEARER_TOKEN=your-bearer-token
```

The bearer token is preferred when both are present.

Common defaults:

```bash
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-organization
AZURE_DEVOPS_PROJECT=your-project
AZURE_DEVOPS_API_VERSION=7.1
```

## Local Usage

Install dependencies:

```bash
npm install
```

Run the MCP server over stdio:

```bash
npm start
```

Or run the executable directly:

```bash
npx ./
```

## MCP Client Configuration

Example stdio configuration:

```json
{
  "mcpServers": {
    "azure-devops-wiql": {
      "command": "npx",
      "args": ["azure-devops-wiql-mcp-server"],
      "env": {
        "AZURE_DEVOPS_ORG_URL": "https://dev.azure.com/your-organization",
        "AZURE_DEVOPS_PROJECT": "your-project",
        "AZURE_DEVOPS_PAT": "your-personal-access-token"
      }
    }
  }
}
```

For local development before publishing:

```json
{
  "mcpServers": {
    "azure-devops-wiql": {
      "command": "node",
      "args": ["C:/path/to/azure-devops-wiql-mcp-server/src/index.js"],
      "env": {
        "AZURE_DEVOPS_ORG_URL": "https://dev.azure.com/your-organization",
        "AZURE_DEVOPS_PROJECT": "your-project",
        "AZURE_DEVOPS_PAT": "your-personal-access-token"
      }
    }
  }
}
```

## Tool

### `run_wiql`

Input:

```json
{
  "wiql": "SELECT [System.Id], [System.Title] FROM WorkItems WHERE [System.TeamProject] = @project",
  "organizationUrl": "https://dev.azure.com/your-organization",
  "project": "your-project",
  "includeWorkItems": true,
  "fields": ["System.Id", "System.Title", "System.State"],
  "top": 100,
  "timePrecision": true,
  "errorPolicy": "omit",
  "apiVersion": "7.1"
}
```

For tool input, only `wiql` is required when `AZURE_DEVOPS_ORG_URL` and `AZURE_DEVOPS_PROJECT` are set. At runtime, the server also requires either `AZURE_DEVOPS_PAT` or `AZURE_DEVOPS_BEARER_TOKEN`.

By default, output is the raw Azure DevOps WIQL JSON response. Azure DevOps returns only IDs and URLs from WIQL. Set `includeWorkItems` to `true` and pass `fields` to fetch matching work item field values after WIQL returns the IDs.

Hydrated output includes:

```json
{
  "wiqlResult": {
    "workItems": [{ "id": 123, "url": "https://dev.azure.com/..." }]
  },
  "workItems": [
    {
      "id": 123,
      "fields": {
        "System.Id": 123,
        "System.Title": "Example",
        "System.State": "Active"
      }
    }
  ],
  "workItemsResult": {
    "count": 1,
    "value": [
      {
        "id": 123,
        "fields": {
          "System.Id": 123,
          "System.Title": "Example",
          "System.State": "Active"
        }
      }
    ]
  }
}
```

### `get_work_items`

Input:

```json
{
  "ids": [123, 124],
  "organizationUrl": "https://dev.azure.com/your-organization",
  "project": "your-project",
  "fields": ["System.Id", "System.Title", "System.State"],
  "errorPolicy": "omit",
  "expand": "relations",
  "apiVersion": "7.1"
}
```

For tool input, only `ids` is required when `AZURE_DEVOPS_ORG_URL` and `AZURE_DEVOPS_PROJECT` are set. At runtime, the server also requires either `AZURE_DEVOPS_PAT` or `AZURE_DEVOPS_BEARER_TOKEN`. The server automatically splits large ID lists into Azure DevOps batch requests of 200 IDs each.

## Development

Run syntax checks:

```bash
npm run check
```

Run tests:

```bash
npm test
```
