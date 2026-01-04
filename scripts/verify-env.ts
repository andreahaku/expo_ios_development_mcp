/**
 * Environment verification script
 * Checks that all required tools and dependencies are available
 */

import { execa } from "execa";

interface CheckResult {
  name: string;
  status: "ok" | "warn" | "error";
  message: string;
  version?: string;
}

async function checkCommand(
  name: string,
  command: string,
  args: string[],
  versionPattern?: RegExp
): Promise<CheckResult> {
  try {
    const result = await execa(command, args, { reject: false });
    if (result.exitCode !== 0) {
      return {
        name,
        status: "error",
        message: `Command failed with exit code ${result.exitCode}`,
      };
    }

    let version: string | undefined;
    if (versionPattern) {
      const match = result.stdout.match(versionPattern);
      version = match ? match[1] : result.stdout.trim().slice(0, 50);
    }

    return {
      name,
      status: "ok",
      message: "Available",
      version,
    };
  } catch (error) {
    return {
      name,
      status: "error",
      message: error instanceof Error ? error.message : "Command not found",
    };
  }
}

async function checkXcode(): Promise<CheckResult> {
  const result = await checkCommand(
    "Xcode Command Line Tools",
    "xcode-select",
    ["-p"]
  );

  if (result.status === "ok") {
    const versionResult = await execa("xcodebuild", ["-version"], { reject: false });
    if (versionResult.exitCode === 0) {
      const match = versionResult.stdout.match(/Xcode (\d+\.\d+)/);
      result.version = match ? match[1] : undefined;
    }
  }

  return result;
}

async function checkSimctl(): Promise<CheckResult> {
  return checkCommand(
    "simctl",
    "xcrun",
    ["simctl", "help"],
  );
}

async function checkNode(): Promise<CheckResult> {
  return checkCommand(
    "Node.js",
    "node",
    ["--version"],
    /v(\d+\.\d+\.\d+)/
  );
}

async function checkPnpm(): Promise<CheckResult> {
  return checkCommand(
    "pnpm",
    "pnpm",
    ["--version"],
    /(\d+\.\d+\.\d+)/
  );
}

async function checkWatchman(): Promise<CheckResult> {
  const result = await checkCommand(
    "Watchman",
    "watchman",
    ["--version"],
    /(\d+\.\d+\.\d+)/
  );

  if (result.status === "error") {
    result.status = "warn";
    result.message = "Not installed (optional but recommended for React Native)";
  }

  return result;
}

async function listSimulators(): Promise<void> {
  console.log("\n📱 Available iOS Simulators:\n");

  try {
    const result = await execa("xcrun", ["simctl", "list", "devices", "--json"]);
    const data = JSON.parse(result.stdout);

    const iosRuntimes = Object.keys(data.devices).filter((r) =>
      r.includes("iOS")
    );

    for (const runtime of iosRuntimes.slice(-2)) {
      const runtimeName = runtime.replace(
        "com.apple.CoreSimulator.SimRuntime.",
        ""
      );
      const devices = data.devices[runtime] as Array<{
        name: string;
        state: string;
        isAvailable: boolean;
      }>;

      const availableDevices = devices.filter((d) => d.isAvailable);

      if (availableDevices.length > 0) {
        console.log(`  ${runtimeName}:`);
        for (const device of availableDevices.slice(0, 5)) {
          const stateIcon = device.state === "Booted" ? "🟢" : "⚪";
          console.log(`    ${stateIcon} ${device.name}`);
        }
        if (availableDevices.length > 5) {
          console.log(`    ... and ${availableDevices.length - 5} more`);
        }
      }
    }
  } catch {
    console.log("  (Unable to list simulators)");
  }
}

async function main() {
  console.log("🔍 Verifying MCP iOS Detox Server Environment\n");
  console.log("=".repeat(50) + "\n");

  const checks: CheckResult[] = [];

  // Run all checks
  checks.push(await checkXcode());
  checks.push(await checkSimctl());
  checks.push(await checkNode());
  checks.push(await checkPnpm());
  checks.push(await checkWatchman());

  // Print results
  let hasErrors = false;

  for (const check of checks) {
    const icon =
      check.status === "ok" ? "✅" : check.status === "warn" ? "⚠️" : "❌";
    const version = check.version ? ` (${check.version})` : "";
    console.log(`${icon} ${check.name}${version}`);

    if (check.status === "error") {
      console.log(`   └─ ${check.message}`);
      hasErrors = true;
    } else if (check.status === "warn") {
      console.log(`   └─ ${check.message}`);
    }
  }

  // List available simulators
  await listSimulators();

  console.log("\n" + "=".repeat(50));

  if (hasErrors) {
    console.log("\n❌ Some required dependencies are missing.");
    console.log("   Please install them before running the MCP server.\n");
    process.exit(1);
  } else {
    console.log("\n✅ All required dependencies are available!");
    console.log("   You can start the MCP server with: pnpm dev\n");
  }
}

main().catch((err) => {
  console.error("Error running verification:", err);
  process.exit(1);
});
