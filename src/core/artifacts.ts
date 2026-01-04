/**
 * Artifact path management and manifest tracking
 */

import { mkdir, writeFile, readFile } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";

export interface ArtifactInfo {
  type: "screenshot" | "video" | "diff" | "baseline" | "log" | "report";
  path: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface ArtifactManifest {
  sessionId: string;
  createdAt: string;
  artifacts: ArtifactInfo[];
}

class ArtifactManager {
  private rootDir: string;
  private sessionId: string;
  private manifest: ArtifactManifest;

  constructor() {
    this.rootDir = process.env.MCP_ARTIFACTS_ROOT || "./artifacts";
    this.sessionId = this.generateSessionId();
    this.manifest = {
      sessionId: this.sessionId,
      createdAt: new Date().toISOString(),
      artifacts: [],
    };
  }

  private generateSessionId(): string {
    const now = new Date();
    const date = now.toISOString().split("T")[0];
    const time = now.toTimeString().split(" ")[0].replace(/:/g, "-");
    return `${date}_${time}`;
  }

  setRootDir(dir: string): void {
    this.rootDir = dir;
  }

  getSessionDir(): string {
    return join(this.rootDir, this.sessionId);
  }

  async ensureDir(subdir?: string): Promise<string> {
    const dir = subdir ? join(this.getSessionDir(), subdir) : this.getSessionDir();
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    return dir;
  }

  async getScreenshotPath(name: string): Promise<string> {
    const dir = await this.ensureDir("screenshots");
    const timestamp = Date.now();
    const filename = `${name}_${timestamp}.png`;
    return join(dir, filename);
  }

  async getVideoPath(name: string): Promise<string> {
    const dir = await this.ensureDir("videos");
    const timestamp = Date.now();
    const filename = `${name}_${timestamp}.mp4`;
    return join(dir, filename);
  }

  async getDiffPath(name: string): Promise<string> {
    const dir = await this.ensureDir("diffs");
    const timestamp = Date.now();
    const filename = `${name}_diff_${timestamp}.png`;
    return join(dir, filename);
  }

  async getLogPath(name: string): Promise<string> {
    const dir = await this.ensureDir("logs");
    const timestamp = Date.now();
    const filename = `${name}_${timestamp}.log`;
    return join(dir, filename);
  }

  getBaselinePath(configuration: string, device: string, name: string): string {
    const baselineDir = process.env.MCP_BASELINE_DIR || join(this.rootDir, "baselines");
    const safeDevice = device.replace(/\s+/g, "_");
    return join(baselineDir, configuration, safeDevice, `${name}.png`);
  }

  async saveBaseline(
    configuration: string,
    device: string,
    name: string,
    imageBuffer: Buffer
  ): Promise<string> {
    const path = this.getBaselinePath(configuration, device, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, imageBuffer);
    return path;
  }

  async loadBaseline(
    configuration: string,
    device: string,
    name: string
  ): Promise<Buffer | null> {
    const path = this.getBaselinePath(configuration, device, name);
    if (!existsSync(path)) {
      return null;
    }
    return readFile(path);
  }

  registerArtifact(info: Omit<ArtifactInfo, "createdAt">): void {
    this.manifest.artifacts.push({
      ...info,
      createdAt: new Date().toISOString(),
    });
  }

  getManifest(): ArtifactManifest {
    return { ...this.manifest };
  }

  getLatestArtifacts(type?: ArtifactInfo["type"], count: number = 10): ArtifactInfo[] {
    let artifacts = this.manifest.artifacts;
    if (type) {
      artifacts = artifacts.filter((a) => a.type === type);
    }
    return artifacts.slice(-count);
  }

  async saveManifest(): Promise<string> {
    const dir = await this.ensureDir();
    const path = join(dir, "manifest.json");
    await writeFile(path, JSON.stringify(this.manifest, null, 2));
    return path;
  }

  newSession(): void {
    this.sessionId = this.generateSessionId();
    this.manifest = {
      sessionId: this.sessionId,
      createdAt: new Date().toISOString(),
      artifacts: [],
    };
  }
}

export const artifactManager = new ArtifactManager();
