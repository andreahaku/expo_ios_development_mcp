# MCP iOS Simulator + Expo + Detox — Implementation Document

> This document describes the implementation of a Detox-first MCP Server for controlling an Expo/React Native app on iOS Simulator.

## 0) Goals and Constraints

### Goal

Build a **local MCP server** that enables LLM tools (Claude Code, Cursor, Codex) to:

- Manage iOS Simulator via `simctl`
- Start/stop Expo/Metro development server
- Execute UI actions and assertions via **Detox**
- Produce **artifacts** (screenshots, videos, diffs, reports)
- Provide **structured, queryable logs**

### Key Constraints

- Detox is not an "interactive driver" like Appium; it's a **test framework**. We implement a **Detox Action Runner** that executes dynamically-generated micro-tests and returns JSON output.
- For screenshots/video/system logs: we use `simctl` (always available and well-documented by Apple).

---

## 1) Prerequisites (macOS)

- Xcode + Command Line Tools (`xcrun`, `simctl`, iOS Simulator)
- Node.js 18+ (20+ recommended)
- An Expo/RN project with Detox already integrated
- Recommended: `watchman` (often helps with React Native)
- Working Detox configuration for iOS Simulator (e.g., `ios.sim.debug`)

**Not required:** `idbcompanion` — not needed for this architecture

---

## 2) Technology Stack

### MCP

- Official TypeScript SDK: `@modelcontextprotocol/sdk`
- Transport: **stdio** (recommended for local clients)
- Input validation: `zod`

### Simulator Control

- `xcrun simctl` for boot, install, launch, screenshot, recordVideo, log stream

### UI Automation

- Detox CLI + Jest runner (CLI approach is simpler and more stable)

### Visual Regression

- `pngjs` + `pixelmatch` for image comparison

---

## 3) Repository Layout

```
expo_ios_development_mcp/
├── package.json
├── tsconfig.json
├── README.md
├── CLAUDE.md                    # Claude Code guidance
├── mcp.config.json              # Runtime configuration
├── mcp.config.example.json      # Example configuration
├── scripts/
│   ├── verify-env.ts            # Environment verification
│   └── detox-action-template.ejs # Detox micro-test template
├── src/
│   ├── index.ts                 # MCP stdio entrypoint
│   ├── config/
│   │   ├── schema.ts            # Zod configuration schema
│   │   └── load.ts              # Configuration loader
│   ├── mcp/
│   │   ├── server.ts            # Tool registry + resources + prompts
│   │   ├── schemas.ts           # Zod input/output schemas
│   │   └── prompts.ts           # MCP prompt templates
│   ├── core/
│   │   ├── state.ts             # Global state machine
│   │   ├── errors.ts            # Error taxonomy + mapping
│   │   ├── logger.ts            # Structured logger + ring buffer
│   │   ├── artifacts.ts         # Artifact pathing + manifest
│   │   ├── lock.ts              # Concurrency lock manager
│   │   └── retry.ts             # Retry with exponential backoff
│   ├── simulator/
│   │   ├── simctl.ts            # xcrun simctl wrapper
│   │   ├── devices.ts           # Device management
│   │   ├── logs.ts              # Log streaming
│   │   ├── screenshots.ts       # Screenshot capture
│   │   └── video.ts             # Video recording
│   ├── expo/
│   │   ├── expo.ts              # Start/stop Metro/Expo
│   │   ├── metro.ts             # Metro readiness detection
│   │   ├── logs.ts              # Expo log processing
│   │   └── flow.ts              # Flow runner for step sequences
│   ├── detox/
│   │   ├── runner.ts            # Detox test runner + micro-test generation
│   │   ├── actions.ts           # Tool → Detox snippet mapping
│   │   ├── selectors.ts         # Selector to Detox expression
│   │   └── output.ts            # JSON output parsing from stdout
│   └── visual/
│       ├── diff.ts              # pixelmatch comparison pipeline
│       ├── baseline.ts          # Baseline image management
│       └── design.ts            # Figma/design comparison with LLM analysis
├── artifacts/                   # Generated artifacts (screenshots, videos, diffs, designs)
└── docs/
    ├── ARCHITECTURE.md          # Technical architecture documentation
    └── mcp_development_plan.md  # This document
```

---

## 4) Runtime Configuration

### mcp.config.json (Example)

```json
{
  "projectPath": "/path/to/your/expo-app",
  "artifactsRoot": "./artifacts",
  "defaultDeviceName": "iPhone 15",
  "detox": {
    "configuration": "ios.sim.debug",
    "timeout": 120000
  },
  "expo": {
    "command": "npx",
    "startArgs": ["expo", "start", "--ios"]
  },
  "visual": {
    "baselineDir": "./artifacts/baselines",
    "defaultThreshold": 0.02
  },
  "logs": {
    "bufferSize": 20000
  }
}
```

### Configuration Schema (Implemented)

```typescript
const McpConfigSchema = z.object({
  projectPath: z.string(),
  artifactsRoot: z.string().optional().default("./artifacts"),
  defaultDeviceName: z.string().optional().default("iPhone 15"),
  detox: DetoxConfigSchema.optional(),
  expo: ExpoConfigSchema.optional(),
  visual: VisualConfigSchema.optional(),
  logs: LogsConfigSchema.optional(),
});
```

---

## 5) State Machine (Stability Foundation)

Global state is managed by a singleton `StateManager`:

```typescript
type SimulatorState = "unknown" | "booting" | "booted" | "shutdown";
type ExpoState = "stopped" | "starting" | "running" | "crashed";
type DetoxState = "idle" | "starting" | "ready" | "running" | "failed";

interface GlobalState {
  simulator: { state: SimulatorState; udid?: string; deviceName?: string };
  expo: { state: ExpoState; processId?: number; metroUrl?: string };
  detox: { state: DetoxState; sessionId?: string; configuration?: string };
}
```

### State Rules

- `ui.*` commands require: `simulator.booted` + `detox.ready`
- `detox.session.start` can auto-boot simulator if needed
- `expo.start` is independent, but Detox in debug often benefits from Metro running

### State Checking (Implemented)

```typescript
canRunUiCommands(): boolean {
  return this.isSimulatorReady() && this.isDetoxReady();
}
```

---

## 6) Error Taxonomy (LLM-Friendly)

### Implemented Error Codes

| Code | Description |
|------|-------------|
| `SIM_NOT_BOOTED` | Simulator not booted |
| `SIM_NOT_FOUND` | Simulator device not found |
| `SIMCTL_FAILED` | simctl command failed |
| `SIMCTL_TIMEOUT` | simctl operation timed out |
| `EXPO_NOT_RUNNING` | Expo/Metro not running |
| `EXPO_START_FAILED` | Failed to start Expo |
| `EXPO_CRASHED` | Expo/Metro crashed |
| `EXPO_RELOAD_FAILED` | Failed to reload app |
| `EXPO_DEV_MENU_FAILED` | Failed to open dev menu |
| `DETOX_NOT_READY` | Detox session not initialized |
| `DETOX_SESSION_FAILED` | Detox session failed |
| `DETOX_TEST_FAILED` | Detox action failed |
| `ELEMENT_NOT_FOUND` | UI element not found |
| `ELEMENT_NOT_VISIBLE` | UI element not visible |
| `TIMEOUT` | Operation timed out |
| `VISUAL_DIFF_TOO_HIGH` | Visual difference exceeds threshold |
| `VISUAL_BASELINE_NOT_FOUND` | Baseline image not found |
| `VISUAL_BASELINE_EXISTS` | Baseline already exists |
| `VISUAL_SIZE_MISMATCH` | Image dimensions differ |
| `VISUAL_DESIGN_INVALID` | Design image is invalid or corrupted |
| `CONFIG_INVALID` | Invalid configuration |
| `CONFIG_NOT_FOUND` | Configuration file not found |
| `ARTIFACT_WRITE_FAILED` | Failed to write artifact |
| `INTERNAL_ERROR` | Unexpected internal error |

### Error Structure

Each error includes:
- `code` — Machine-readable error code
- `message` — Human-readable message
- `details` — Additional context
- `remediation` — Suggested fix (auto-populated from registry)
- `evidence` — Paths to logs/screenshots

---

## 7) MCP Server: Tools/Resources/Prompts

### 7.1 Transport: stdio

MCP defines stdio as the standard and recommended transport for local integrations. Never write to stdout (reserved for JSON-RPC); use stderr for logging.

### 7.2 Implemented Tools

#### Simulator (simctl)

| Tool | Description |
|------|-------------|
| `simulator.list_devices` | List all available iOS simulators |
| `simulator.boot` | Boot a simulator device (with concurrency lock) |
| `simulator.shutdown` | Shut down a simulator |
| `simulator.erase` | Factory reset a simulator |
| `simulator.screenshot` | Take a screenshot |
| `simulator.record_video.start` | Start video recording |
| `simulator.record_video.stop` | Stop video recording |
| `simulator.log_stream.start` | Start log streaming |
| `simulator.log_stream.stop` | Stop log streaming |

#### Expo

| Tool | Description |
|------|-------------|
| `expo.start` | Start Expo/Metro server |
| `expo.stop` | Stop Expo/Metro server |
| `expo.status` | Get Expo/Metro status |
| `expo.logs.tail` | Get recent Expo logs |
| `expo.reload` | Reload the app |

#### Detox Session

| Tool | Description |
|------|-------------|
| `detox.session.start` | Initialize Detox session |
| `detox.session.stop` | Terminate Detox session |
| `detox.healthcheck` | Verify Detox is ready |

#### UI Automation (via Detox micro-tests)

| Tool | Description |
|------|-------------|
| `ui.tap` | Tap an element |
| `ui.long_press` | Long press an element |
| `ui.swipe` | Swipe in a direction |
| `ui.scroll` | Scroll in a direction |
| `ui.type` | Type text into an input |
| `ui.press_key` | Press a keyboard key |
| `ui.wait_for` | Wait for element visibility |
| `ui.assert_text` | Assert element text content |
| `ui.assert_visible` | Assert element is visible |

#### Visual Regression

| Tool | Description |
|------|-------------|
| `visual.baseline.save` | Save baseline screenshot |
| `visual.baseline.list` | List saved baselines |
| `visual.baseline.delete` | Delete a baseline |
| `visual.compare` | Compare against baseline |
| `visual.compare_to_design` | Compare simulator screenshot against pasted Figma/design image |

#### Flow

| Tool | Description |
|------|-------------|
| `flow.run` | Execute a sequence of tool calls |

### 7.3 Resources (Read-Only Quick Context)

| Resource URI | Description |
|--------------|-------------|
| `resource://state` | Current server state |
| `resource://logs/expo/latest` | Recent Expo logs |
| `resource://logs/simulator/latest` | Recent simulator logs |
| `resource://logs/detox/latest` | Recent Detox logs |
| `resource://artifacts/latest` | Artifact manifest |

### 7.4 Prompts (Discoverable Templates)

| Prompt | Description |
|--------|-------------|
| `repro_and_collect_evidence` | Reproduce a bug with evidence collection |
| `ui_regression_check` | Perform visual regression testing |
| `test_user_flow` | Test a complete user flow |
| `debug_app_crash` | Debug an app crash |
| `setup_test_session` | Set up a fresh test session |

---

## 8) Implementation with @modelcontextprotocol/sdk

### package.json (Implemented)

```json
{
  "name": "expo_ios_development_mcp",
  "type": "module",
  "private": true,
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "verify": "tsx scripts/verify-env.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.25.23",
    "execa": "^9.6.0",
    "ejs": "^3.1.10",
    "pngjs": "^7.0.0",
    "pixelmatch": "^6.0.0"
  },
  "devDependencies": {
    "tsx": "^4.19.2",
    "typescript": "^5.8.3",
    "@types/ejs": "^3.1.5",
    "@types/pngjs": "^6.0.5",
    "@types/pixelmatch": "^5.2.6"
  }
}
```

### src/index.ts (Implemented)

```typescript
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./mcp/server.js";
import { loadConfig } from "./config/load.js";
import { logger } from "./core/logger.js";

async function main() {
  await loadConfig();
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("mcp", "MCP server connected via stdio");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

---

## 9) Simulator Controller (simctl)

### 9.1 Command Wrapper (Implemented)

Uses `execa` for:
- Timeout handling
- stdout/stderr capture
- Error mapping

```typescript
import { execa } from "execa";

export async function simctl(args: string[], timeoutMs = 60000) {
  const result = await execa("xcrun", ["simctl", ...args], {
    timeout: timeoutMs,
    reject: false,
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}
```

### 9.2 Screenshot (Implemented)

```typescript
export async function takeScreenshot(options?: {
  udid?: string;
  name?: string;
}): Promise<{ path: string; size: number }> {
  const target = options?.udid ?? "booted";
  const filename = `${options?.name ?? "screenshot"}_${Date.now()}.png`;
  const outputPath = getArtifactPath("screenshots", filename);

  await simctl(["io", target, "screenshot", outputPath]);

  return { path: outputPath, size: (await fs.stat(outputPath)).size };
}
```

---

## 10) Expo Orchestrator

### 10.1 Start Metro/Expo (Implemented)

- Spawns a long-lived process (`npx expo start --ios`)
- Captures stdout/stderr in ring buffer
- Detects "Metro ready" via regex + extracts metroUrl

```typescript
export async function startExpo(options?: {
  clearCache?: boolean;
}): Promise<ExpoStartResult> {
  const config = getConfig();
  const args = ["expo", "start", "--ios"];

  if (options?.clearCache) {
    args.push("--clear");
  }

  const child = execa("npx", args, {
    cwd: config.projectPath,
    reject: false,
  });

  // Monitor output for Metro readiness
  child.stdout?.on("data", (data) => {
    const output = data.toString();
    if (detectMetroReady(output)) {
      const url = extractMetroUrl(output);
      stateManager.updateExpo({ state: "running", metroUrl: url });
    }
  });

  return { pid: child.pid, status: "starting" };
}
```

### 10.2 Metro Readiness Detection (Implemented)

```typescript
export function detectMetroReady(output: string): boolean {
  return (
    output.includes("Metro waiting on") ||
    output.includes("Logs for your project") ||
    output.includes("› Press")
  );
}

export function extractMetroUrl(output: string): string | undefined {
  const match = output.match(/exp:\/\/[\d.]+:\d+/);
  return match?.[0];
}
```

---

## 11) Detox Action Runner (Core)

### 11.1 Concept

For each `ui.*` tool:

1. Generate a temporary Jest test file
2. Execute `detox test` with:
   - `--configuration ios.sim.debug`
   - `--testNamePattern` to isolate the test
3. Capture stdout/stderr
4. Parse JSON marker from test output
5. Return MCP result

### 11.2 Micro-Test Template (scripts/detox-action-template.ejs)

```javascript
/* eslint-disable */
const { device, element, by, expect, waitFor } = require('detox');

function mcpPrint(obj) {
  process.stdout.write(`\n[MCP_RESULT]${JSON.stringify(obj)}[/MCP_RESULT]\n`);
}

describe('mcp_action', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: false });
  });

  it('run', async () => {
    const startedAt = Date.now();
    try {
      <%- actionSnippet %>
      mcpPrint({ ok: true, elapsedMs: Date.now() - startedAt });
    } catch (error) {
      mcpPrint({
        ok: false,
        error: error.message,
        elapsedMs: Date.now() - startedAt
      });
      throw error;
    }
  });
});
```

### 11.3 Selector Mapping (Implemented)

```typescript
export function selectorToDetoxExpr(sel: Selector): string {
  switch (sel.by) {
    case "id":
      return `by.id(${JSON.stringify(sel.value)})`;
    case "text":
      return `by.text(${JSON.stringify(sel.value)})`;
    case "label":
      return `by.label(${JSON.stringify(sel.value)})`;
    default:
      throw new Error(`Unsupported selector type: ${sel.by}`);
  }
}
```

### 11.4 Action Snippet Generators (Implemented)

**Tap:**
```typescript
export function generateTapSnippet(selector: Selector): string {
  const matcher = selectorToDetoxExpr(selector);
  return `await element(${matcher}).tap();`;
}
```

**Type:**
```typescript
export function generateTypeSnippet(
  selector: Selector,
  text: string,
  options?: { clearFirst?: boolean }
): string {
  const matcher = selectorToDetoxExpr(selector);
  const lines = [`const el = element(${matcher});`, `await el.tap();`];

  if (options?.clearFirst) {
    lines.push(`await el.clearText();`);
  }

  lines.push(`await el.typeText(${JSON.stringify(text)});`);
  return lines.join("\n    ");
}
```

**Wait For:**
```typescript
export function generateWaitForSnippet(
  selector: Selector,
  options?: { timeoutMs?: number }
): string {
  const matcher = selectorToDetoxExpr(selector);
  const timeout = options?.timeoutMs ?? 30000;
  return `await waitFor(element(${matcher})).toBeVisible().withTimeout(${timeout});`;
}
```

### 11.5 Output Parsing (Implemented)

```typescript
export function parseDetoxOutput(stdout: string): DetoxResult {
  const match = stdout.match(/\[MCP_RESULT\](.*?)\[\/MCP_RESULT\]/s);

  if (!match) {
    return { ok: false, error: "No MCP_RESULT marker found" };
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    return { ok: false, error: "Failed to parse MCP_RESULT JSON" };
  }
}
```

---

## 12) Visual Regression

### 12.1 Baseline Store (Implemented)

Structure:
```
artifacts/
  baselines/
    ios.sim.debug/
      iPhone_15/
        after-login.png
```

### 12.2 Compare Pipeline (Implemented)

```typescript
export async function compareWithBaseline(
  name: string,
  options?: { threshold?: number }
): Promise<CompareResult> {
  const threshold = options?.threshold ?? 0.02;

  // Take current screenshot
  const actual = await takeScreenshotToBuffer();

  // Load baseline
  const baseline = await loadBaseline(name);

  // Compare with pixelmatch
  const { mismatchPercent, diffBuffer } = await compareImages(
    actual,
    baseline,
    threshold
  );

  // Save diff if mismatch
  if (mismatchPercent > threshold) {
    await saveDiffImage(name, diffBuffer);
  }

  return {
    pass: mismatchPercent <= threshold,
    mismatchPercent,
    threshold,
    artifacts: {
      actual: actualPath,
      baseline: baselinePath,
      diff: diffPath,
    },
  };
}
```

### 12.3 Design Comparison (Implemented)

Enables comparing iOS Simulator screenshots against pasted Figma/design mockups for design-driven development.

**Key Features:**
- Accepts base64-encoded design images (pasted from Figma)
- Handles size differences via configurable resize strategies
- Returns images for LLM visual analysis (semantic comparison)
- Generates side-by-side overlay (Design | Actual | Diff)

**Resize Strategies:**
- `actual` — Resize design to match simulator screenshot (default)
- `design` — Resize screenshot to match design dimensions
- `none` — Fail if dimensions differ

**Implementation:**

```typescript
export async function compareToDesign(
  designBase64: string,
  options?: DesignCompareOptions
): Promise<DesignCompareResult> {
  // Decode base64 design image
  const designBuffer = decodeBase64Image(designBase64);

  // Take current simulator screenshot
  const screenshot = await takeScreenshot(`actual-${name}`);

  // Handle size differences via resize strategy
  if (designPng.width !== actualPng.width || designPng.height !== actualPng.height) {
    if (resizeStrategy === "actual") {
      comparisonActual = resizePng(actualPng, designPng.width, designPng.height);
    } else if (resizeStrategy === "design") {
      comparisonDesign = resizePng(designPng, actualPng.width, actualPng.height);
    }
  }

  // Compare with pixelmatch (lenient threshold for design comparison)
  const mismatchPixels = pixelmatch(
    comparisonDesign.data,
    comparisonActual.data,
    diffPng.data,
    width,
    height,
    { threshold: 0.15, includeAA: false }
  );

  // Generate side-by-side overlay for visual analysis
  const overlayPng = createOverlay(comparisonDesign, comparisonActual, diffPng);

  return {
    match: mismatchPercent <= threshold,
    matchPercent,
    mismatchPercent,
    artifacts: { design, actual, diff, overlay },
    feedback: generateFeedback(mismatchPercent, threshold, resized),
  };
}
```

**LLM Visual Analysis:**

The tool returns overlay and diff images as base64-encoded content that Claude can visually analyze for semantic differences (layout, spacing, colors, typography) that pure pixel matching may not capture accurately.

---

## 13) Logs & Evidence

### 13.1 Ring Buffer (Implemented)

Maintains ring buffers per source with configurable capacity (default: 20,000 entries):

```typescript
class RingBuffer<T> {
  private buffer: T[];
  private capacity: number;
  private writeIndex: number;
  private count: number;

  push(item: T): void {
    this.buffer[this.writeIndex] = item;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  tail(n: number): T[] {
    return this.getAll().slice(-n);
  }
}
```

### 13.2 Log Sources

- `mcp` — MCP server operations
- `simulator` — Simulator log stream
- `expo` — Expo/Metro output
- `detox` — Detox test output
- `visual` — Visual regression operations
- `lock` — Concurrency lock events
- `retry` — Retry operations

### 13.3 Error Evidence

On UI failure, automatically attach:
- Screenshot (auto-captured)
- Last 150 log lines from detox + expo
- Remediation suggestion

---

## 14) Hardening Features

### 14.1 Concurrency Lock (Implemented)

Prevents simultaneous operations on the same resource:

```typescript
export async function withLock<T>(
  resource: string,
  operation: string,
  fn: () => Promise<T>,
  options?: { timeoutMs?: number; waitForLock?: boolean }
): Promise<T> {
  const lock = await acquireLock(resource, operation, options);
  try {
    return await fn();
  } finally {
    releaseLock(lock);
  }
}
```

### 14.2 Retry with Backoff (Implemented)

```typescript
export async function withRetry<T>(
  operation: string,
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    backoffMultiplier = 2,
    jitter = true,
  } = options ?? {};

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryable(error) || attempt >= maxAttempts) {
        throw error;
      }
      await delay(calculateBackoff(attempt, initialDelayMs, backoffMultiplier, jitter));
    }
  }
}
```

**Retryable error codes:** `SIMCTL_TIMEOUT`, `TIMEOUT`, `DETOX_TEST_FAILED`

---

## 15) Client Integration

### Claude Code

Add to MCP settings:

```json
{
  "mcpServers": {
    "expo-ios-detox": {
      "command": "node",
      "args": ["/path/to/expo_ios_development_mcp/dist/index.js"],
      "env": {
        "MCP_CONFIG": "/path/to/mcp.config.json"
      }
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "servers": {
    "expo-ios-detox": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/expo_ios_development_mcp/dist/index.js"],
      "env": {
        "MCP_CONFIG": "/path/to/mcp.config.json"
      }
    }
  }
}
```

---

## 16) Implementation Phases (Completed)

### Phase 1 — Skeleton MCP + simctl ✅

- MCP stdio server setup
- `simulator.list_devices`, `simulator.boot`, `simulator.screenshot`
- Artifact manager
- Ring buffer logger
- State machine

### Phase 2 — Detox Runner ✅

- Micro-test generator + runner
- `detox.session.start/stop`, `detox.healthcheck`
- `ui.tap`, `ui.type`, `ui.wait_for`, `ui.swipe`, etc.
- Output marker parsing
- Error mapping + auto-screenshot on failure

### Phase 3 — Expo Orchestrator ✅

- `expo.start`, `expo.stop`, `expo.status`, `expo.reload`
- Log capture + Metro readiness detection
- `flow.run` for step sequences

### Phase 4 — Visual Regression ✅

- `visual.baseline.save`, `visual.baseline.list`, `visual.baseline.delete`
- `visual.compare` with pixelmatch
- Diff artifact generation

### Phase 5 — Hardening ✅

- Concurrency lock manager
- Retry with exponential backoff
- MCP prompt templates
- Documentation (CLAUDE.md, ARCHITECTURE.md)

---

## 17) Definition of Done for UI Tools

Each `ui.*` tool is "DONE" when:

1. Works on a demo screen
2. On failure produces:
   - Consistent `error.code`
   - Attached screenshot
   - Log excerpt
   - Remediation hint

---

## 18) Practical Notes

### TextInput Handling

On iOS, some cases require using `accessibilityLabel` or focus/tap strategies before `typeText`. The implementation supports:
- `by.id(testID)` — preferred everywhere
- `by.label` — fallback for problematic inputs
- `by.text` — for text-based matching

### Selector Modifiers

Support for:
- `.atIndex(n)` — select nth matching element
- `.withAncestor(matcher)` — filter by ancestor
- `.withDescendant(matcher)` — filter by descendant

### Debug Mode

Set `MCP_DEBUG=true` to enable debug-level logging to stderr.

---

## 19) Code Metrics

| Metric | Value |
|--------|-------|
| Total Files | 27 |
| Total Lines | 4,768 |
| Average Complexity | 12.9 |
| Maximum Complexity | 43 (server.ts) |
| Code Consistency | 99% |
| Circular Dependencies | 0 |
| Try-Catch Blocks | 56 |

---

## 20) Author

Andrea Salvatore <andreahaku@gmail.com>

## License

MIT
