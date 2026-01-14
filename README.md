# Expo iOS Development MCP Server

An MCP (Model Context Protocol) server that enables LLM tools like Claude Code, Cursor, and Codex to control iOS Simulator, Expo/Metro, and run UI automation via Detox.

## Features

- **Simulator Control**: Boot, shutdown, erase simulators via `simctl`
- **Screenshots & Video**: Capture screenshots and record videos
- **Log Streaming**: Real-time simulator log capture with ring buffer
- **Expo/Metro**: Start/stop Expo development server
- **UI Automation**: Execute Detox actions (tap, swipe, type, wait, assert)
- **Visual Regression**: Screenshot comparison with pixelmatch
- **Acceptance Criteria Testing**: Parse markdown criteria, run automated tests, report missing testIDs
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
| `visual.compare_to_design` | Compare simulator screenshot against pasted Figma/design image |

### Acceptance Criteria Testing

| Tool | Description |
|------|-------------|
| `acceptance.parse` | Parse acceptance criteria markdown file into structured data |
| `acceptance.run` | Run all acceptance tests with comprehensive reporting |
| `acceptance.run_flow` | Execute a specific test flow by name |
| `acceptance.check` | Check a single criterion by ID or description match |

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

### Design Comparison (Figma to Implementation)

The MCP server supports comparing Figma design screenshots directly against the iOS Simulator. Simply copy and paste a Figma screenshot into your prompt!

```
Here's the Figma design for the login screen. [paste screenshot]
Compare the current simulator view against this design and tell me the differences.
```

```
I've pasted the design mockup for the settings page. [paste screenshot]
Check if my implementation matches and list what needs to be fixed.
```

```
[paste Figma screenshot]
This is the target design. Please compare it against the simulator and fix any visual differences in the code.
```

```
Compare this design against my current implementation:
[paste screenshot]
Focus on the header section only (use region comparison).
```

### Acceptance Criteria Testing

The acceptance criteria testing system allows you to write human-readable acceptance criteria in markdown and have them automatically tested against your app.

#### Writing Acceptance Criteria Files

Create a markdown file with checkbox items organized into sections:

```markdown
# Login Screen Acceptance Criteria

## Visual Elements
- [ ] App logo is visible at the top of the screen
- [ ] Email input field is visible with placeholder "Enter email"
- [ ] Password input field is visible with placeholder "Enter password"
- [ ] "Sign In" button is visible and has text "Sign In"

## Interactions
- [ ] Tapping email field focuses the input
- [ ] Tapping "Sign In" button with valid credentials navigates to home screen
- [ ] Tapping "Forgot Password" link opens password reset modal

## Test Flows

### Happy Path Login
1. Wait for element `login-screen` to be visible
2. Type "test@example.com" into `email-input`
3. Type "password123" into `password-input`
4. Tap `sign-in-button`
5. Wait for element `home-screen` to be visible
```

#### Parsing Acceptance Criteria

```
Parse the acceptance criteria file at /path/to/login-criteria.md
```

```
Parse this acceptance criteria and tell me how many testable items there are:
[paste markdown content]
```

#### Running Acceptance Tests

```
Run the acceptance criteria tests from /path/to/login-criteria.md
```

```
Run acceptance tests for the login screen and generate a report
```

```
Execute only the "Visual Elements" section from the acceptance criteria
```

#### Running Specific Test Flows

```
Run the "Happy Path Login" test flow from the acceptance criteria file
```

```
Execute the signup flow from acceptance-criteria.md and take screenshots at each step
```

#### Checking Individual Criteria

```
Check if the criterion "App logo is visible" passes
```

```
Verify the single criterion with ID "visual-1" from the acceptance file
```

#### Understanding Test Results

The acceptance criteria runner produces detailed reports with:

- **Pass**: Criterion was verified successfully
- **Fail**: Criterion check failed (element not found, assertion failed)
- **Blocked**: Cannot test because required testIDs are missing

When tests are blocked, the report includes a "Missing Requirements" section:

```markdown
## Missing Requirements for Testability

| Element | Suggested testID | Type | Reason |
|---------|-----------------|------|--------|
| App logo | `app-logo` | testID | Required for "App logo is visible" |
| Sign In button | `sign-in-button` | testID | Required for "Tapping Sign In button" |
```

This helps developers add the necessary testIDs to make criteria testable.

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

### Workflow 5: Design-Driven Development

```
1. Copy a Figma design screenshot
2. "Boot simulator and start Expo"
3. Paste the design: "Implement this login screen design: [paste]"
4. Claude Code implements the UI components
5. "Compare my implementation against the design"
6. Review the diff overlay and feedback
7. "Fix the spacing issues shown in the comparison"
8. Repeat comparison until design match is satisfactory
```

### Workflow 6: Acceptance Criteria Testing

```
1. Write acceptance criteria in markdown (login-criteria.md)
2. "Boot simulator and start Expo"
3. "Initialize Detox session"
4. "Parse the acceptance criteria file at login-criteria.md"
5. "Run all acceptance tests and generate a report"
6. Review the report - fix any failing tests
7. Add missing testIDs reported in the "Missing Requirements" section
8. "Re-run the acceptance tests"
9. Repeat until all criteria pass
```

### Workflow 7: Continuous Acceptance Testing During Development

```
1. "Set up test session with iPhone 15"
2. Make code changes to your app...
3. "Reload the app"
4. "Run the acceptance criteria for the feature I'm working on"
5. Review pass/fail/blocked status
6. Fix issues and add missing testIDs
7. Repeat steps 2-6 until acceptance criteria pass
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

6. **Write acceptance criteria in markdown**: Use checkbox format for testable criteria
   ```
   - [ ] Button with testID "submit-btn" is visible
   - [ ] Tapping "Login" navigates to home screen
   ```

7. **Include test flows in acceptance criteria**: Define step-by-step flows under `## Test Flows`
   ```
   ### Login Flow
   1. Type "user@example.com" into `email-input`
   2. Tap `submit-button`
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
  acceptance/       # Acceptance criteria testing (parser, mapper, checker, reporter)
```

### Key Patterns

- **State Machine**: Tracks simulator, Expo, and Detox states; UI commands require `simulator.booted + detox.ready`
- **Detox Micro-Tests**: UI actions generate temporary Jest tests, run via Detox CLI, parse `[MCP_RESULT]` markers
- **Error Taxonomy**: LLM-friendly error codes with auto-populated remediation hints
- **Ring Buffer Logging**: Per-source log retention (20,000 entries each)

### Code Metrics

| Metric | Value |
|--------|-------|
| Total Files | 41 |
| Total Lines | 8,574 |
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
