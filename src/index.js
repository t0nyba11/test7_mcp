#!/usr/bin/env node

import { startServer } from "./server.js";

startServer().catch((error) => {
  console.error("Failed to start Azure DevOps WIQL MCP server.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
