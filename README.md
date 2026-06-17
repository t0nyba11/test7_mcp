# Azure DevOps WIQL MCP Server

An MCP server that lets MCP clients run Azure DevOps WIQL queries through a local or `npx`-launched JavaScript package.

## Features

- Exposes a `run_wiql` MCP tool.
- Runs WIQL against Azure DevOps Work Item Tracking.
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
  "top": 100,
  "timePrecision": true,
  "apiVersion": "7.1"
}
```

Only `wiql` is required when `AZURE_DEVOPS_ORG_URL` and `AZURE_DEVOPS_PROJECT` are set.

Output is the Azure DevOps WIQL JSON response.

## Development

Run syntax checks:

```bash
npm run check
```

Run tests:

```bash
npm test
```
