/**
 * MCP iOS Detox Server - Entrypoint
 *
 * Provides MCP tools for controlling iOS Simulator, Expo/Metro, and Detox
 * for UI automation and testing.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./mcp/server.js";
import { loadConfig } from "./config/load.js";
import { logger } from "./core/logger.js";

async function main() {
  logger.info("mcp", "Starting MCP iOS Detox Server");

  // Load configuration if available
  try {
    await loadConfig();
  } catch (error) {
    // Config is optional for basic simulator operations
    logger.warn("mcp", "Configuration not loaded - some features may be limited", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  // Create and connect server
  const server = createMcpServer();
  const transport = new StdioServerTransport();

  logger.info("mcp", "Connecting to stdio transport");

  await server.connect(transport);

  logger.info("mcp", "MCP server connected and ready");
}

main().catch((err) => {
  // IMPORTANT: stdout is reserved for JSON-RPC, write errors to stderr
  console.error("Fatal error:", err);
  process.exit(1);
});
