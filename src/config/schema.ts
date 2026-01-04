/**
 * Configuration schema using Zod
 */

import { z } from "zod";

export const DetoxConfigSchema = z.object({
  configuration: z.string().default("ios.sim.debug"),
  reuseSession: z.boolean().default(true),
  jestBinary: z.string().default("node_modules/.bin/jest"),
  detoxBinary: z.string().default("node_modules/.bin/detox"),
  testTimeoutMs: z.number().default(120000),
});

export const ExpoConfigSchema = z.object({
  startCommand: z.string().default("npx expo start --ios"),
  clearCacheFlag: z.string().default("--clear"),
});

export const VisualConfigSchema = z.object({
  baselineDir: z.string().optional(),
  thresholdDefault: z.number().min(0).max(1).default(0.02),
});

export const LogsConfigSchema = z.object({
  ringBufferLines: z.number().default(20000),
});

export const McpConfigSchema = z.object({
  projectPath: z.string(),
  artifactsRoot: z.string().optional(),
  defaultDeviceName: z.string().default("iPhone 15"),
  detox: DetoxConfigSchema.default({}),
  expo: ExpoConfigSchema.default({}),
  visual: VisualConfigSchema.default({}),
  logs: LogsConfigSchema.default({}),
});

export type McpConfig = z.infer<typeof McpConfigSchema>;
export type DetoxConfig = z.infer<typeof DetoxConfigSchema>;
export type ExpoConfig = z.infer<typeof ExpoConfigSchema>;
export type VisualConfig = z.infer<typeof VisualConfigSchema>;
export type LogsConfig = z.infer<typeof LogsConfigSchema>;
