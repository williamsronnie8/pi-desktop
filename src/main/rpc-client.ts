import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { RpcCommand, RpcEvent, RpcResponse, StartPiOptions } from "../shared/types";

interface PendingRequest {
  resolve: (response: RpcResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

interface PiLaunchTarget {
  executable: string;
  argsPrefix: string[];
  displayPath: string;
  pathEntries: string[];
}

export class PiRpcClient {
  private process?: ChildProcessWithoutNullStreams;
  private pending = new Map<string, PendingRequest>();
  private stdoutBuffer = "";
  private decoder = new StringDecoder("utf8");
  private eventListener: (event: RpcEvent) => void;
  private executable = "";
  private recentStderr = "";

  constructor(eventListener: (event: RpcEvent) => void) {
    this.eventListener = eventListener;
  }

  get executablePath(): string {
    return this.executable;
  }

  async resolveLaunchTarget(): Promise<PiLaunchTarget> {
    return resolvePiLaunchTarget();
  }

  async start(options: StartPiOptions): Promise<void> {
    await this.stop();
    const launchTarget = await resolvePiLaunchTarget();
    this.executable = launchTarget.displayPath;
    this.stdoutBuffer = "";
    this.decoder = new StringDecoder("utf8");
    this.recentStderr = "";

    const args = [...launchTarget.argsPrefix, "--mode", "rpc"];
    if (options.sessionPath) args.push("--session", options.sessionPath);

    const env = { ...process.env };
    env.PATH = mergePath(launchTarget.pathEntries, env.PATH);
    delete env.PI_SESSION_ID;
    delete env.PI_SESSION_FILE;
    delete env.PI_PROVIDER;
    delete env.PI_MODEL;
    delete env.PI_REASONING_LEVEL;

    const child = spawn(launchTarget.executable, args, {
      cwd: options.cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.process = child;

    child.stdout.on("data", (chunk: Buffer) => this.handleStdout(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      const message = chunk.toString("utf8").trim();
      if (!message) return;
      this.recentStderr = `${this.recentStderr}\n${message}`.trim().slice(-4_000);
      this.eventListener({ type: "desktop_stderr", message });
    });
    child.on("exit", (code, signal) => {
      const wasCurrent = this.process === child;
      if (wasCurrent) this.process = undefined;
      const details = this.recentStderr ? `: ${this.recentStderr}` : "";
      const error = new Error(`Pi exited (${signal ?? code ?? "unknown"})${details}`);
      for (const request of this.pending.values()) {
        clearTimeout(request.timeout);
        request.reject(error);
      }
      this.pending.clear();
      if (wasCurrent) this.eventListener({ type: "desktop_process_exit", code, signal });
    });

    await new Promise<void>((resolve, reject) => {
      const onSpawn = (): void => {
        child.off("error", onError);
        resolve();
      };
      const onError = (error: Error): void => {
        child.off("spawn", onSpawn);
        reject(error);
      };
      child.once("spawn", onSpawn);
      child.once("error", onError);
    });
  }

  async stop(): Promise<void> {
    const child = this.process;
    if (!child) return;
    this.process = undefined;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        resolve();
      };
      child.once("exit", finish);
      child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
        finish();
      }, 2_000).unref();
    });
  }

  send<T = unknown>(command: RpcCommand, timeoutMs = 30 * 60 * 1_000): Promise<RpcResponse<T>> {
    const child = this.process;
    if (!child || child.killed || !child.stdin.writable) {
      return Promise.reject(new Error("Pi is not running"));
    }

    const id = command.id ?? randomUUID();
    const payload = { ...command, id };

    return new Promise<RpcResponse<T>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Pi command timed out: ${command.type}`));
      }, timeoutMs);
      timeout.unref();

      this.pending.set(id, {
        resolve: resolve as (response: RpcResponse) => void,
        reject,
        timeout,
      });

      child.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
        if (!error) return;
        const request = this.pending.get(id);
        if (!request) return;
        clearTimeout(request.timeout);
        this.pending.delete(id);
        request.reject(error);
      });
    });
  }

  sendExtensionResponse(response: Record<string, unknown>): void {
    const child = this.process;
    if (!child || child.killed || !child.stdin.writable) {
      throw new Error("Pi is not running");
    }
    child.stdin.write(`${JSON.stringify(response)}\n`);
  }

  private handleStdout(chunk: Buffer): void {
    this.stdoutBuffer += this.decoder.write(chunk);
    while (true) {
      const newline = this.stdoutBuffer.indexOf("\n");
      if (newline === -1) break;
      let line = this.stdoutBuffer.slice(0, newline);
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line) this.handleLine(line);
    }
  }

  private handleLine(line: string): void {
    let message: RpcEvent | RpcResponse;
    try {
      message = JSON.parse(line) as RpcEvent | RpcResponse;
    } catch (error) {
      this.eventListener({
        type: "desktop_protocol_error",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (message.type === "response") {
      const response = message as RpcResponse;
      if (typeof response.id === "string") {
        const request = this.pending.get(response.id);
        if (request) {
          clearTimeout(request.timeout);
          this.pending.delete(response.id);
          request.resolve(response);
          return;
        }
      }
    }

    this.eventListener(message as RpcEvent);
  }
}

async function resolvePiLaunchTarget(): Promise<PiLaunchTarget> {
  const piPath = await resolveExecutable([
    process.env.PI_DESKTOP_PI_PATH,
    "/opt/homebrew/bin/pi",
    "/usr/local/bin/pi",
    join(homedir(), ".local", "bin", "pi"),
    join(homedir(), ".bun", "bin", "pi"),
  ]) ?? "pi";

  try {
    const resolvedPiPath = await realpath(piPath);
    const firstLine = (await readFile(resolvedPiPath, "utf8")).split("\n", 1)[0] ?? "";
    if (/^#!.*\bnode\b/.test(firstLine)) {
      const nodePath = await resolveExecutable([
        process.env.PI_DESKTOP_NODE_PATH,
        join(dirname(piPath), "node"),
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
        join(homedir(), ".local", "bin", "node"),
        join(homedir(), ".bun", "bin", "node"),
      ]);
      if (!nodePath) throw new Error("Pi requires Node.js, but no Node.js executable was found");
      return {
        executable: nodePath,
        argsPrefix: [resolvedPiPath],
        displayPath: piPath,
        pathEntries: [dirname(nodePath), dirname(piPath)],
      };
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("no Node.js executable")) throw error;
    // Native Pi binaries and command names can be launched directly.
  }

  return {
    executable: piPath,
    argsPrefix: [],
    displayPath: piPath,
    pathEntries: piPath.includes("/") ? [dirname(piPath)] : [],
  };
}

async function resolveExecutable(candidates: Array<string | undefined>): Promise<string | undefined> {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known install location.
    }
  }
  return undefined;
}

function mergePath(preferred: string[], current?: string): string {
  const defaults = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    join(homedir(), ".local", "bin"),
    join(homedir(), ".bun", "bin"),
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ];
  const entries = [...preferred, ...defaults, ...(current?.split(delimiter) ?? [])].filter(Boolean);
  return [...new Set(entries)].join(delimiter);
}
