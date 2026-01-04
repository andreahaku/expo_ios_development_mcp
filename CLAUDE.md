# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
pnpm build          # Compile TypeScript to dist/
pnpm dev            # Run in development mode with tsx
pnpm start          # Run production build
pnpm verify         # Verify environment (Xcode, simctl, etc.)
```

## Architecture Overview

This is an **MCP (Model Context Protocol) server** that enables LLM tools to control iOS Simulator, Expo/Metro, and Detox for UI automation. It uses **stdio transport** for JSON-RPC communication.

### Core Patterns

**State Machine** (`src/core/state.ts`): Global singleton tracking simulator, Expo, and Detox states. All tools check state prerequisites before execution. UI commands require: `simulator.booted + detox.ready`.

**Error Taxonomy** (`src/core/errors.ts`): LLM-friendly errors with structured `ErrorCode`, remediation hints, and evidence paths. Use `createError()` for all errors—it auto-attaches remediation from the registry.

**Concurrency Lock** (`src/core/lock.ts`): Prevents simultaneous operations on the same resource. Wrap critical operations with `withLock()`.

### Detox Micro-Test Pattern

Detox is a **test framework**, not an interactive driver. UI automation works by:

1. Generating a temporary Jest test file from `scripts/detox-action-template.ejs`
2. Injecting action snippets (tap, type, swipe, etc.) from `src/detox/actions.ts`
3. Running `detox test` with `--testNamePattern` to isolate the micro-test
4. Parsing `[MCP_RESULT]...[/MCP_RESULT]` markers from stdout
5. Cleaning up the temp test file

Key files: `src/detox/runner.ts` (execution), `src/detox/actions.ts` (code generation), `src/detox/output.ts` (parsing).

### Module Responsibilities

- **`src/mcp/server.ts`**: Tool registry—all MCP tools defined here with Zod schemas
- **`src/mcp/schemas.ts`**: Input validation schemas (used in tool definitions)
- **`src/simulator/simctl.ts`**: Wrapper for `xcrun simctl` commands via execa
- **`src/expo/expo.ts`**: Long-running Expo process management with Metro readiness detection
- **`src/visual/diff.ts`**: pixelmatch-based screenshot comparison pipeline

### Configuration

Runtime config loaded from `MCP_CONFIG` env var or `mcp.config.json`. Schema in `src/config/schema.ts`. Required for Detox/Expo operations; optional for basic simulator commands.

### Logging

Use `logger` from `src/core/logger.ts`. Ring buffers per source (`mcp`, `simulator`, `expo`, `detox`, `visual`, `lock`, `retry`). **Never write to stdout**—it's reserved for JSON-RPC.

## Key Conventions

- All imports use `.js` extension (ESM with NodeNext resolution)
- Async functions should use try-catch and throw via `createError()`
- New error codes must be added to both `ErrorCode` type and `ErrorRemediation` record
- New log sources must be added to the `source` union type in `logger.ts`
