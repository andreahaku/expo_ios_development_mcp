/**
 * MCP Prompt Templates
 * Discoverable prompts that help LLMs perform common workflows
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export interface PromptTemplate {
  name: string;
  description: string;
  arguments?: Record<string, { description: string; required?: boolean }>;
  template: (args: Record<string, string>) => string;
}

export const promptTemplates: PromptTemplate[] = [
  {
    name: "repro_and_collect_evidence",
    description: "Reproduce a bug and collect evidence (logs, screenshots)",
    arguments: {
      steps: {
        description: "Description of the steps to reproduce the bug",
        required: true,
      },
      expectedBehavior: {
        description: "What should happen",
        required: true,
      },
      actualBehavior: {
        description: "What actually happens",
        required: false,
      },
    },
    template: (args) => `
You are helping to reproduce and document a bug in an iOS app.

## Bug Report

**Steps to Reproduce:**
${args.steps}

**Expected Behavior:**
${args.expectedBehavior}

${args.actualBehavior ? `**Actual Behavior:**\n${args.actualBehavior}` : ""}

## Instructions

1. First, ensure the simulator is booted and the app is running
2. Start log streaming with \`simulator.log_stream.start\`
3. Execute each step using the appropriate UI tools:
   - \`ui.tap\` for tapping elements
   - \`ui.type\` for entering text
   - \`ui.swipe\` for swiping gestures
   - \`ui.wait_for\` to wait for elements
4. Take a screenshot at key points with \`simulator.screenshot\`
5. After reproducing, collect logs with \`expo.logs.tail\`
6. Stop log streaming with \`simulator.log_stream.stop\`

## Evidence Collection

After completing the reproduction, provide:
- All screenshots taken during reproduction
- Relevant log excerpts
- The exact steps that triggered the issue
- Any error messages or stack traces found
`,
  },
  {
    name: "ui_regression_check",
    description: "Perform visual regression testing on a screen",
    arguments: {
      screenName: {
        description: "Name of the screen to check (used as baseline name)",
        required: true,
      },
      threshold: {
        description: "Maximum allowed visual difference (0-1)",
        required: false,
      },
    },
    template: (args) => `
You are performing visual regression testing on an iOS app screen.

## Target Screen: ${args.screenName}
${args.threshold ? `## Threshold: ${args.threshold}` : "## Threshold: 0.02 (default)"}

## Instructions

1. Navigate to the target screen using UI tools if needed
2. Wait for the screen to fully load with \`ui.wait_for\`
3. Compare against baseline:
   \`\`\`
   visual.compare { name: "${args.screenName}"${args.threshold ? `, threshold: ${args.threshold}` : ""} }
   \`\`\`

4. If no baseline exists:
   - Take a screenshot first with \`visual.baseline.save { name: "${args.screenName}" }\`
   - Report that baseline was created

5. Report results:
   - If PASS: Screen matches baseline within threshold
   - If FAIL: Describe the visual differences and provide the diff image path

## Common Issues

- Size mismatch: Device or orientation changed
- Small differences: Dynamic content (timestamps, animations)
- Large differences: Layout or styling changes
`,
  },
  {
    name: "test_user_flow",
    description: "Test a complete user flow from start to finish",
    arguments: {
      flowName: {
        description: "Name of the user flow (e.g., 'login', 'checkout')",
        required: true,
      },
      flowSteps: {
        description: "JSON array of steps to execute",
        required: true,
      },
    },
    template: (args) => `
You are testing a user flow in an iOS app.

## Flow: ${args.flowName}

## Steps to Execute
${args.flowSteps}

## Instructions

1. Parse the flow steps from the JSON
2. Use \`flow.run\` to execute the steps in sequence:
   \`\`\`
   flow.run {
     steps: ${args.flowSteps},
     stopOnError: true
   }
   \`\`\`

3. If any step fails:
   - Report which step failed
   - Include the error message
   - Provide the auto-captured screenshot

4. If all steps pass:
   - Report success
   - Optionally take a final screenshot as evidence

## Available UI Actions

- \`ui.tap\`: Tap an element by testID, text, or label
- \`ui.type\`: Type text into an input field
- \`ui.swipe\`: Swipe in a direction
- \`ui.scroll\`: Scroll in a direction
- \`ui.wait_for\`: Wait for element visibility
- \`ui.assert_text\`: Assert element contains text
`,
  },
  {
    name: "debug_app_crash",
    description: "Debug an app crash by collecting logs and state",
    arguments: {
      context: {
        description: "What was happening when the crash occurred",
        required: false,
      },
    },
    template: (args) => `
You are debugging an app crash in an iOS simulator.

${args.context ? `## Context\n${args.context}` : ""}

## Investigation Steps

1. **Check current state**
   - Get simulator state: Read \`resource://state\`
   - Check if app is still running

2. **Collect logs**
   - Get Expo/Metro logs: \`expo.logs.tail { lines: 200 }\`
   - Get simulator logs: Read \`resource://logs/simulator/latest\`
   - Get Detox logs if active: Read \`resource://logs/detox/latest\`

3. **Look for crash indicators**
   - Search logs for: "crash", "exception", "fatal", "SIGABRT", "SIGSEGV"
   - Look for JavaScript errors in Metro logs
   - Check for native crash reports

4. **Capture current state**
   - Take a screenshot if possible: \`simulator.screenshot\`
   - Note the last successful action before crash

5. **Attempt recovery**
   - If Expo crashed: \`expo.stop\` then \`expo.start\`
   - If simulator is unresponsive: \`simulator.shutdown\` then \`simulator.boot\`

## Report Format

Provide a summary including:
- Crash type (JavaScript, native, hung)
- Last action before crash
- Relevant error messages
- Stack traces if available
- Suggested fixes or workarounds
`,
  },
  {
    name: "setup_test_session",
    description: "Set up a fresh test session with simulator and Expo",
    arguments: {
      deviceName: {
        description: "iOS Simulator device name (e.g., 'iPhone 15')",
        required: false,
      },
      clearCache: {
        description: "Whether to clear Metro cache (true/false)",
        required: false,
      },
    },
    template: (args) => `
You are setting up a fresh test session for iOS development.

${args.deviceName ? `## Device: ${args.deviceName}` : "## Device: Default from config"}
${args.clearCache === "true" ? "## Clear Metro Cache: Yes" : ""}

## Setup Steps

1. **Check available simulators**
   \`\`\`
   simulator.list_devices
   \`\`\`

2. **Boot simulator**
   \`\`\`
   simulator.boot { ${args.deviceName ? `device: "${args.deviceName}"` : ""} }
   \`\`\`

3. **Start Expo/Metro**
   \`\`\`
   expo.start { ${args.clearCache === "true" ? "clearCache: true" : ""} }
   \`\`\`

   Wait for Metro to be ready (check for metro URL in response)

4. **Initialize Detox session** (if running UI tests)
   \`\`\`
   detox.session.start
   \`\`\`

5. **Verify setup**
   - Check state: Read \`resource://state\`
   - Run health check: \`detox.healthcheck\`

## Ready State

Session is ready when:
- Simulator state: "booted"
- Expo state: "running" with metroUrl
- Detox state: "ready" (if initialized)

## Troubleshooting

- Simulator won't boot: Check Xcode and Simulator.app
- Expo fails to start: Check project path in config
- Detox not ready: Ensure app is installed on simulator
`,
  },
];

/**
 * Register all prompt templates with the MCP server
 */
export function registerPrompts(server: McpServer): void {
  for (const template of promptTemplates) {
    const args = template.arguments ?? {};

    // Build Zod schema for arguments
    const argSchema: Record<string, z.ZodTypeAny> = {};
    for (const [name, config] of Object.entries(args)) {
      argSchema[name] = config.required
        ? z.string().describe(config.description)
        : z.string().optional().describe(config.description);
    }

    server.prompt(
      template.name,
      template.description,
      argSchema,
      async (providedArgs) => {
        const messages = [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: template.template(providedArgs as Record<string, string>),
            },
          },
        ];
        return { messages };
      }
    );
  }
}
