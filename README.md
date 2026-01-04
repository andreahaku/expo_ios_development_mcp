# Expo iOS Development MCP Server

An MCP (Model Context Protocol) server that enables LLM tools like Claude Code, Cursor, and Codex to control iOS Simulator, Expo/Metro, and run UI automation via Detox.

## Features

- **Simulator Control**: Boot, shutdown, erase simulators via `simctl`
- **Screenshots & Video**: Capture screenshots and record videos
- **Log Streaming**: Real-time simulator log capture with ring buffer
- **Expo/Metro**: Start/stop Expo development server
- **UI Automation**: Execute Detox actions (tap, swipe, type, wait, assert)
- **Visual Regression**: Screenshot comparison with pixelmatch
- **Concurrency Control**: Lock manager prevents conflicting operations
- **Retry with Backoff**: Automatic retry for transient failures

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

### Detox Session

| Tool | Description |
|------|-------------|
| `detox.session.start` | Initialize Detox session |
| `detox.session.stop` | Terminate Detox session |
| `detox.healthcheck` | Verify Detox is ready |

### UI Automation

| Tool | Description |
|------|-------------|
| `ui.tap` | Tap an element |
| `ui.long_press` | Long press an element |
| `ui.type` | Type text into an input |
| `ui.swipe` | Swipe gesture |
| `ui.scroll` | Scroll in a direction |
| `ui.press_key` | Press a keyboard key |
| `ui.wait_for` | Wait for element visibility |
| `ui.assert_text` | Assert element text content |
| `ui.assert_visible` | Assert element is visible |

### Visual Regression

| Tool | Description |
|------|-------------|
| `visual.baseline.save` | Save baseline screenshot |
| `visual.baseline.list` | List saved baselines |
| `visual.baseline.delete` | Delete a baseline |
| `visual.compare` | Compare against baseline (uses pixelmatch) |

### Flow

| Tool | Description |
|------|-------------|
| `flow.run` | Execute a sequence of tool calls |

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
- `resource://logs/expo/latest` - Recent Expo logs
- `resource://logs/detox/latest` - Recent Detox logs
- `resource://artifacts/latest` - Artifact manifest

---

## Usage Guide

### Getting Started

Once the MCP server is configured in your LLM client (Claude Code, Cursor, etc.), you can interact with it using natural language. The LLM will automatically invoke the appropriate tools.

### Step 1: Set Up Your Development Session

Before running UI automation, you need to:

1. **Boot the simulator** - Start an iOS Simulator device
2. **Start Expo** - Launch the Metro bundler and load your app
3. **Initialize Detox** - Set up the Detox session for UI automation

### Step 2: Develop and Test

With the session ready, you can:
- Run UI interactions (tap, type, swipe)
- Take screenshots at any point
- Assert element states and text content
- Record videos of interactions
- Perform visual regression tests

### Step 3: Debug Issues

When something goes wrong:
- Check logs from Expo/Metro and simulator
- Take screenshots to see current state
- Use the debug prompts to investigate crashes

---

## Example Prompts

Here are example prompts you can use with Claude Code, Cursor, or other MCP-enabled LLM tools during Expo app development:

### Session Setup

```
Boot the iPhone 15 Pro simulator and start my Expo app
```

```
Set up a fresh test session - boot the simulator, start Expo, and initialize Detox
```

```
List all available iOS simulators and tell me which ones are booted
```

### Taking Screenshots

```
Take a screenshot of the current screen and save it as "home-screen"
```

```
Take a screenshot after each step of the login flow
```

```
Start recording a video, then stop it after I tell you the flow is complete
```

### UI Automation - Navigation

```
Tap the "Login" button on the home screen
```

```
Navigate to the Settings screen by tapping the settings icon (testID: settings-tab)
```

```
Scroll down on the main feed until you see the "Load More" button
```

### UI Automation - Forms

```
Fill in the login form:
- Email: test@example.com
- Password: password123
Then tap the Submit button
```

```
Type "Hello World" into the search input (testID: search-input) and wait for results to appear
```

```
Clear the text in the email field and type a new email address
```

### UI Automation - Gestures

```
Swipe left on the first item in the list to reveal delete button
```

```
Swipe down to refresh the feed and wait for new content to load
```

```
Long press on the profile picture to open the context menu
```

### Assertions and Verification

```
Verify that the welcome message shows "Hello, John!"
```

```
Wait for the loading spinner to disappear and then check if the data loaded correctly
```

```
Assert that the error message "Invalid credentials" is visible after failed login
```

### Visual Regression Testing

```
Save a baseline screenshot of the login screen for visual regression testing
```

```
Compare the current settings page against the baseline and tell me if there are any visual differences
```

```
Run visual regression on all saved baselines and report any failures
```

### Debugging and Logs

```
Show me the last 100 lines of Expo logs - I'm seeing a crash
```

```
The app crashed after tapping the submit button. Collect evidence: take a screenshot,
get the logs, and help me debug what went wrong
```

```
Start streaming simulator logs so we can monitor for errors during testing
```

### Complex Flows

```
Test the complete signup flow:
1. Tap "Create Account"
2. Fill in name, email, password
3. Accept terms and conditions
4. Tap "Sign Up"
5. Verify the welcome screen appears
Take screenshots at each step
```

```
Run through the checkout flow and compare each screen against baselines:
1. Add item to cart
2. Go to cart
3. Proceed to checkout
4. Enter shipping info
5. Confirm order
```

```
Reproduce bug #123:
The app crashes when tapping the profile button while on the settings page.
Collect all evidence including screenshots and logs.
```

### Using Flow Runner

```
Execute this test flow:
- Wait for element "welcome-screen"
- Tap "get-started-button"
- Wait for element "onboarding-step-1"
- Swipe left
- Wait for element "onboarding-step-2"
- Swipe left
- Tap "finish-button"
```

### Expo Development

```
Check the status of Metro - is it running and what's the bundle URL?
```

```
Reload the app to pick up my latest code changes
```

```
Stop Expo, clear the cache, and restart it fresh
```

### Cleanup

```
Stop the Detox session and shut down the simulator
```

```
Erase the simulator to start with a clean slate
```

---

## Common Workflows

### Workflow 1: Daily Development Cycle

```
1. "Boot iPhone 15 and start Expo for my app"
2. Make code changes...
3. "Reload the app"
4. "Take a screenshot of the updated UI"
5. "Tap the new button I added and verify it works"
6. Repeat...
```

### Workflow 2: Bug Reproduction

```
1. "Set up a test session with iPhone 15 Pro"
2. "Start recording a video"
3. "Navigate to the screen where the bug occurs"
4. "Perform the actions that trigger the bug"
5. "Stop recording and collect logs"
6. "Take a final screenshot and summarize what happened"
```

### Workflow 3: Visual Regression Suite

```
1. "Boot simulator and start Expo"
2. "Initialize Detox session"
3. "List all saved baselines"
4. "Compare each major screen against its baseline"
5. "Generate a report of any visual differences"
```

### Workflow 4: End-to-End Testing

```
1. "Set up fresh test session - erase simulator first for clean state"
2. "Run the complete user registration flow with test data"
3. "Verify the user lands on the dashboard"
4. "Save baseline screenshots for key screens"
5. "Stop session and generate test summary"
```

---

## Tips for Effective Prompts

1. **Use testIDs**: Reference elements by their `testID` prop for reliable targeting
   ```
   Tap the button with testID "submit-button"
   ```

2. **Be specific about selectors**: Specify whether you're using id, text, or label
   ```
   Tap the element with text "Continue" (not the testID)
   ```

3. **Chain actions clearly**: Break complex flows into clear steps
   ```
   First wait for the login screen, then fill the form, then tap submit
   ```

4. **Request evidence**: Ask for screenshots and logs when debugging
   ```
   Take a screenshot before and after tapping the button
   ```

5. **Use flow.run for sequences**: For repeatable test flows, use the flow runner
   ```
   Execute this as a flow: tap login, type email, type password, tap submit
   ```

---

## Development

```bash
# Run with hot reload
pnpm dev

# Build for production
pnpm build

# Run production build
pnpm start

# Enable debug logging
MCP_DEBUG=true pnpm dev
```

## Architecture

The server is organized into modular subsystems:

```
src/
  index.ts          # MCP stdio entrypoint
  config/           # Configuration loading and validation
  core/             # State machine, errors, logger, artifacts, lock, retry
  mcp/              # MCP server, schemas, prompt templates
  simulator/        # simctl wrapper (devices, screenshots, video, logs)
  expo/             # Expo/Metro control (start, stop, logs, flow runner)
  detox/            # Detox micro-test runner (actions, selectors, output parsing)
  visual/           # Visual regression (baseline management, pixelmatch diff)
```

### Key Patterns

- **State Machine**: Tracks simulator, Expo, and Detox states; UI commands require `simulator.booted + detox.ready`
- **Detox Micro-Tests**: UI actions generate temporary Jest tests, run via Detox CLI, parse `[MCP_RESULT]` markers
- **Error Taxonomy**: LLM-friendly error codes with auto-populated remediation hints
- **Ring Buffer Logging**: Per-source log retention (20,000 entries each)

### Code Metrics

| Metric | Value |
|--------|-------|
| Total Files | 27 |
| Total Lines | 4,768 |
| Avg Complexity | 12.9 |
| Code Consistency | 99% |
| Circular Deps | 0 |

## Documentation

- **[Architecture Documentation](docs/ARCHITECTURE.md)** - Detailed technical architecture with diagrams
- **[Implementation Plan](docs/mcp_development_plan.md)** - Full implementation document with code examples

## Author

Andrea Salvatore <andreahaku@gmail.com>

## License

MIT
