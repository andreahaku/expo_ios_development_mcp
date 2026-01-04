/**
 * Configuration loader
 */

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { McpConfigSchema, type McpConfig } from "./schema.js";
import { createError } from "../core/errors.js";
import { logger } from "../core/logger.js";
import { artifactManager } from "../core/artifacts.js";

let loadedConfig: McpConfig | null = null;

export async function loadConfig(configPath?: string): Promise<McpConfig> {
  const path = configPath ?? process.env.MCP_CONFIG ?? "./mcp.config.json";
  const resolvedPath = resolve(path);

  logger.info("mcp", `Loading configuration from ${resolvedPath}`);

  if (!existsSync(resolvedPath)) {
    throw createError(
      "CONFIG_NOT_FOUND",
      `Configuration file not found: ${resolvedPath}`,
      {
        details: `Searched for config at: ${resolvedPath}`,
      }
    );
  }

  try {
    const content = await readFile(resolvedPath, "utf-8");
    const rawConfig = JSON.parse(content);
    const config = McpConfigSchema.parse(rawConfig);

    // Resolve relative paths to absolute based on config file location
    const configDir = dirname(resolvedPath);
    config.projectPath = resolve(configDir, config.projectPath);

    if (config.artifactsRoot) {
      config.artifactsRoot = resolve(configDir, config.artifactsRoot);
      artifactManager.setRootDir(config.artifactsRoot);
    }

    if (config.visual.baselineDir) {
      config.visual.baselineDir = resolve(configDir, config.visual.baselineDir);
    }

    loadedConfig = config;
    logger.info("mcp", "Configuration loaded successfully", {
      projectPath: config.projectPath,
      defaultDevice: config.defaultDeviceName,
    });

    return config;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw createError("CONFIG_INVALID", "Invalid JSON in configuration file", {
        details: error.message,
      });
    }
    if (error instanceof Error && error.name === "ZodError") {
      throw createError("CONFIG_INVALID", "Configuration validation failed", {
        details: error.message,
      });
    }
    throw error;
  }
}

export function getConfig(): McpConfig {
  if (!loadedConfig) {
    throw createError(
      "CONFIG_NOT_FOUND",
      "Configuration not loaded. Call loadConfig() first."
    );
  }
  return loadedConfig;
}

export function hasConfig(): boolean {
  return loadedConfig !== null;
}
