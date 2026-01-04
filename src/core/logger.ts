/**
 * Structured logger with ring buffer for log retention
 */

export interface LogEntry {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  source: "mcp" | "simulator" | "expo" | "detox" | "visual" | "lock" | "retry";
  message: string;
  data?: Record<string, unknown>;
}

class RingBuffer<T> {
  private buffer: T[];
  private capacity: number;
  private writeIndex: number;
  private count: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
    this.writeIndex = 0;
    this.count = 0;
  }

  push(item: T): void {
    this.buffer[this.writeIndex] = item;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  getAll(): T[] {
    if (this.count === 0) return [];

    const result: T[] = [];
    const startIndex =
      this.count < this.capacity
        ? 0
        : this.writeIndex;

    for (let i = 0; i < this.count; i++) {
      const index = (startIndex + i) % this.capacity;
      result.push(this.buffer[index]);
    }

    return result;
  }

  tail(n: number): T[] {
    const all = this.getAll();
    return all.slice(-n);
  }

  clear(): void {
    this.buffer = new Array(this.capacity);
    this.writeIndex = 0;
    this.count = 0;
  }

  size(): number {
    return this.count;
  }
}

class Logger {
  private buffers: Map<LogEntry["source"], RingBuffer<LogEntry>>;
  private globalBuffer: RingBuffer<LogEntry>;
  private debugEnabled: boolean;

  constructor(bufferSize: number = 20000) {
    this.buffers = new Map();
    this.buffers.set("mcp", new RingBuffer(bufferSize));
    this.buffers.set("simulator", new RingBuffer(bufferSize));
    this.buffers.set("expo", new RingBuffer(bufferSize));
    this.buffers.set("detox", new RingBuffer(bufferSize));
    this.buffers.set("visual", new RingBuffer(bufferSize));
    this.globalBuffer = new RingBuffer(bufferSize);
    this.debugEnabled = process.env.MCP_DEBUG === "true";
  }

  private log(
    level: LogEntry["level"],
    source: LogEntry["source"],
    message: string,
    data?: Record<string, unknown>
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      data,
    };

    this.buffers.get(source)?.push(entry);
    this.globalBuffer.push(entry);

    // Write to stderr (stdout reserved for MCP JSON-RPC)
    if (level !== "debug" || this.debugEnabled) {
      const logLine = JSON.stringify(entry);
      process.stderr.write(logLine + "\n");
    }
  }

  debug(source: LogEntry["source"], message: string, data?: Record<string, unknown>): void {
    this.log("debug", source, message, data);
  }

  info(source: LogEntry["source"], message: string, data?: Record<string, unknown>): void {
    this.log("info", source, message, data);
  }

  warn(source: LogEntry["source"], message: string, data?: Record<string, unknown>): void {
    this.log("warn", source, message, data);
  }

  error(source: LogEntry["source"], message: string, data?: Record<string, unknown>): void {
    this.log("error", source, message, data);
  }

  tail(source: LogEntry["source"], lines: number = 100): LogEntry[] {
    return this.buffers.get(source)?.tail(lines) ?? [];
  }

  tailAll(lines: number = 100): LogEntry[] {
    return this.globalBuffer.tail(lines);
  }

  getLatestForSource(source: LogEntry["source"]): LogEntry[] {
    return this.buffers.get(source)?.getAll() ?? [];
  }

  formatForEvidence(source: LogEntry["source"], lines: number = 150): string {
    const entries = this.tail(source, lines);
    return entries
      .map((e) => `[${e.timestamp}] [${e.level.toUpperCase()}] ${e.message}`)
      .join("\n");
  }
}

export const logger = new Logger();
