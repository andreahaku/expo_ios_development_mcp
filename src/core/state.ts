/**
 * Global state machine for MCP iOS Detox Server
 */

export type SimulatorState = "unknown" | "booting" | "booted" | "shutdown";
export type ExpoState = "stopped" | "starting" | "running" | "crashed";
export type DetoxState = "idle" | "starting" | "ready" | "running" | "failed";

export interface SimulatorInfo {
  state: SimulatorState;
  udid?: string;
  deviceName?: string;
}

export interface ExpoInfo {
  state: ExpoState;
  processId?: number;
  metroUrl?: string;
}

export interface DetoxInfo {
  state: DetoxState;
  sessionId?: string;
  configuration?: string;
}

export interface GlobalState {
  simulator: SimulatorInfo;
  expo: ExpoInfo;
  detox: DetoxInfo;
}

class StateManager {
  private state: GlobalState;

  constructor() {
    this.state = {
      simulator: { state: "unknown" },
      expo: { state: "stopped" },
      detox: { state: "idle" },
    };
  }

  getState(): GlobalState {
    return { ...this.state };
  }

  getSimulator(): SimulatorInfo {
    return { ...this.state.simulator };
  }

  getExpo(): ExpoInfo {
    return { ...this.state.expo };
  }

  getDetox(): DetoxInfo {
    return { ...this.state.detox };
  }

  updateSimulator(update: Partial<SimulatorInfo>): void {
    this.state.simulator = { ...this.state.simulator, ...update };
  }

  updateExpo(update: Partial<ExpoInfo>): void {
    this.state.expo = { ...this.state.expo, ...update };
  }

  updateDetox(update: Partial<DetoxInfo>): void {
    this.state.detox = { ...this.state.detox, ...update };
  }

  isSimulatorReady(): boolean {
    return this.state.simulator.state === "booted";
  }

  isExpoRunning(): boolean {
    return this.state.expo.state === "running";
  }

  isDetoxReady(): boolean {
    return this.state.detox.state === "ready";
  }

  canRunUiCommands(): boolean {
    return this.isSimulatorReady() && this.isDetoxReady();
  }

  reset(): void {
    this.state = {
      simulator: { state: "unknown" },
      expo: { state: "stopped" },
      detox: { state: "idle" },
    };
  }
}

export const stateManager = new StateManager();
