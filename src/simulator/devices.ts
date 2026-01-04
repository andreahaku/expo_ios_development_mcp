/**
 * Simulator device management
 */

import { simctl, parseSimctlError } from "./simctl.js";
import { createError } from "../core/errors.js";
import { logger } from "../core/logger.js";
import { stateManager } from "../core/state.js";

export interface SimulatorDevice {
  udid: string;
  name: string;
  state: "Shutdown" | "Booted" | "Booting" | "ShuttingDown";
  runtime: string;
  isAvailable: boolean;
}

export interface SimulatorRuntime {
  identifier: string;
  name: string;
  version: string;
}

export interface ListDevicesResult {
  devices: SimulatorDevice[];
  runtimes: SimulatorRuntime[];
}

export async function listDevices(): Promise<ListDevicesResult> {
  logger.info("simulator", "Listing available simulator devices");

  const result = await simctl(["list", "devices", "--json"]);

  if (result.exitCode !== 0) {
    const { code, message } = parseSimctlError(result.stderr);
    throw createError(code, message, { details: result.stderr });
  }

  try {
    const data = JSON.parse(result.stdout);
    const devices: SimulatorDevice[] = [];
    const runtimes: SimulatorRuntime[] = [];

    // Parse runtimes
    if (data.runtimes) {
      for (const runtime of data.runtimes) {
        runtimes.push({
          identifier: runtime.identifier,
          name: runtime.name,
          version: runtime.version,
        });
      }
    }

    // Parse devices grouped by runtime
    for (const [runtimeId, deviceList] of Object.entries(data.devices)) {
      const runtimeName = runtimeId.replace("com.apple.CoreSimulator.SimRuntime.", "");

      for (const device of deviceList as Array<Record<string, unknown>>) {
        devices.push({
          udid: device.udid as string,
          name: device.name as string,
          state: device.state as SimulatorDevice["state"],
          runtime: runtimeName,
          isAvailable: device.isAvailable as boolean,
        });
      }
    }

    logger.info("simulator", `Found ${devices.length} devices across ${runtimes.length} runtimes`);

    return { devices, runtimes };
  } catch (error) {
    throw createError("SIMCTL_FAILED", "Failed to parse device list", {
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function findDevice(nameOrUdid: string): Promise<SimulatorDevice | null> {
  const { devices } = await listDevices();

  // First try to match by UDID
  let device = devices.find((d) => d.udid === nameOrUdid);

  // Then try to match by name (prefer iOS devices)
  if (!device) {
    device = devices.find(
      (d) => d.name === nameOrUdid && d.runtime.startsWith("iOS") && d.isAvailable
    );
  }

  // Fallback to any matching name
  if (!device) {
    device = devices.find((d) => d.name === nameOrUdid && d.isAvailable);
  }

  return device ?? null;
}

export async function bootDevice(nameOrUdid: string): Promise<SimulatorDevice> {
  logger.info("simulator", `Booting simulator: ${nameOrUdid}`);

  const device = await findDevice(nameOrUdid);

  if (!device) {
    throw createError("SIM_NOT_FOUND", `Simulator not found: ${nameOrUdid}`, {
      details: "Use simulator.list_devices to see available simulators",
    });
  }

  if (device.state === "Booted") {
    logger.info("simulator", `Device ${device.name} is already booted`);
    stateManager.updateSimulator({
      state: "booted",
      udid: device.udid,
      deviceName: device.name,
    });
    return device;
  }

  stateManager.updateSimulator({ state: "booting", udid: device.udid, deviceName: device.name });

  const result = await simctl(["boot", device.udid], { timeoutMs: 120000 });

  if (result.exitCode !== 0) {
    stateManager.updateSimulator({ state: "unknown" });
    const { code, message } = parseSimctlError(result.stderr);
    throw createError(code, message, { details: result.stderr });
  }

  stateManager.updateSimulator({ state: "booted" });
  logger.info("simulator", `Device ${device.name} booted successfully`);

  return { ...device, state: "Booted" };
}

export async function shutdownDevice(nameOrUdid: string): Promise<void> {
  logger.info("simulator", `Shutting down simulator: ${nameOrUdid}`);

  const device = await findDevice(nameOrUdid);

  if (!device) {
    throw createError("SIM_NOT_FOUND", `Simulator not found: ${nameOrUdid}`, {
      details: "Use simulator.list_devices to see available simulators",
    });
  }

  if (device.state === "Shutdown") {
    logger.info("simulator", `Device ${device.name} is already shut down`);
    stateManager.updateSimulator({ state: "shutdown" });
    return;
  }

  const result = await simctl(["shutdown", device.udid]);

  if (result.exitCode !== 0) {
    const { code, message } = parseSimctlError(result.stderr);
    throw createError(code, message, { details: result.stderr });
  }

  stateManager.updateSimulator({ state: "shutdown", udid: undefined, deviceName: undefined });
  logger.info("simulator", `Device ${device.name} shut down successfully`);
}

export async function eraseDevice(nameOrUdid: string): Promise<void> {
  logger.info("simulator", `Erasing simulator: ${nameOrUdid}`);

  const device = await findDevice(nameOrUdid);

  if (!device) {
    throw createError("SIM_NOT_FOUND", `Simulator not found: ${nameOrUdid}`, {
      details: "Use simulator.list_devices to see available simulators",
    });
  }

  // Must be shut down before erasing
  if (device.state !== "Shutdown") {
    await shutdownDevice(device.udid);
  }

  const result = await simctl(["erase", device.udid]);

  if (result.exitCode !== 0) {
    const { code, message } = parseSimctlError(result.stderr);
    throw createError(code, message, { details: result.stderr });
  }

  logger.info("simulator", `Device ${device.name} erased successfully`);
}

export async function getBootedDevice(): Promise<SimulatorDevice | null> {
  const { devices } = await listDevices();
  return devices.find((d) => d.state === "Booted" && d.runtime.startsWith("iOS")) ?? null;
}
