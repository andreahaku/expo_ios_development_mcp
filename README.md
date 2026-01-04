# Expo iOS Development MCP Server

An MCP (Model Context Protocol) server that enables LLM tools like Claude Code, Cursor, and Codex to control iOS Simulator, Expo/Metro, and run UI automation via Detox.

## Features

- **Simulator Control**: Boot, shutdown, erase simulators via `simctl`
- **Screenshots & Video**: Capture screenshots and record videos
- **Log Streaming**: Real-time simulator log capture with ring buffer
- **Expo/Metro**: Start/stop Expo development server
- **UI Automation**: Execute Detox actions (tap, swipe, type, wait, assert)
- **Visual Regression**: Screenshot comparison with pixelmatch

## Prerequisites

- macOS with Xcode and Command Line Tools
- Node.js 18+ (20+ recommended)
- iOS Simulator available
- An Expo/React Native project with Detox configured (for UI automation)

## Quick Start

```bash
# Install dependencies
pnpm install

# Verify environment
pnpm verify

# Build TypeScript
pnpm build

# Run in development mode
pnpm dev
```

## Configuration

Create `mcp.config.json` in the project root (see `mcp.config.example.json`):

```json
{
  "projectPath": "/path/to/your/expo-app",
  "artifactsRoot": "./artifacts",
  "defaultDeviceName": "iPhone 15",
  "detox": {
    "configuration": "ios.sim.debug"
  }
}
```

## MCP Client Configuration

### Claude Code

Add to your Claude Code MCP settings:

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

## Available Tools

### Simulator

| Tool | Description |
|------|-------------|
| `simulator.list_devices` | List all available iOS simulators |
| `simulator.boot` | Boot a simulator device |
| `simulator.shutdown` | Shut down a simulator |
| `simulator.erase` | Factory reset a simulator |
| `simulator.screenshot` | Take a screenshot |
| `simulator.record_video.start` | Start video recording |
| `simulator.record_video.stop` | Stop video recording |
| `simulator.log_stream.start` | Start log streaming |
| `simulator.log_stream.stop` | Stop log streaming |

### Expo

| Tool | Description |
|------|-------------|
| `expo.start` | Start Expo/Metro server |
| `expo.stop` | Stop Expo/Metro server |
| `expo.status` | Get Expo/Metro status |
| `expo.logs.tail` | Get recent Expo logs |
| `expo.reload` | Reload the app |

### Flow

| Tool | Description |
|------|-------------|
| `flow.run` | Execute a sequence of tool calls |

### UI Automation (Coming Soon)

| Tool | Description |
|------|-------------|
| `ui.tap` | Tap an element |
| `ui.type` | Type text into an input |
| `ui.swipe` | Swipe gesture |
| `ui.scroll` | Scroll in a direction |
| `ui.wait_for` | Wait for element visibility |
| `ui.assert_text` | Assert element text content |
| `ui.screenshot` | Capture UI screenshot |

### Visual Regression

| Tool | Description |
|------|-------------|
| `visual.baseline.save` | Save baseline screenshot |
| `visual.baseline.list` | List saved baselines |
| `visual.baseline.delete` | Delete a baseline |
| `visual.compare` | Compare against baseline (uses pixelmatch) |

## Prompt Templates

The server provides discoverable prompt templates for common workflows:

| Prompt | Description |
|--------|-------------|
| `repro_and_collect_evidence` | Reproduce a bug and collect evidence |
| `ui_regression_check` | Perform visual regression testing |
| `test_user_flow` | Test a complete user flow |
| `debug_app_crash` | Debug an app crash |
| `setup_test_session` | Set up a fresh test session |

## Resources

The server exposes these MCP resources:

- `resource://state` - Current server state (simulator, expo, detox)
- `resource://logs/simulator/latest` - Recent simulator logs
- `resource://artifacts/latest` - Artifact manifest

## Development

```bash
# Run with hot reload
pnpm dev

# Build for production
pnpm build

# Run production build
pnpm start
```

## Architecture

```
src/
  index.ts          # MCP stdio entrypoint
  config/           # Configuration loading
  core/             # State, errors, logger, artifacts
  mcp/              # MCP server and schemas
  simulator/        # simctl wrapper
  expo/             # Expo/Metro control (Phase 3)
  detox/            # Detox runner (Phase 2)
  visual/           # Visual regression (Phase 4)
```

## Author

Andrea Salvatore <andreahaku@gmail.com>

## License

MIT
