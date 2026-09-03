import { open, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import type { AgentMessage, DesktopSessionSummary, MessageContent } from "../shared/types";

const MAX_SESSIONS = 300;
const SMALL_FILE_LIMIT = 600_000;
const SLICE_SIZE = 260_000;

export async function listSessionSummaries(): Promise<DesktopSessionSummary[]> {
  const roots = await resolveSessionRoots();
  const candidatePaths: string[] = [];
  const files: Array<{ path: string; size: number; updatedAt: number }> = [];

  for (const root of roots) {
    let rootEntries;
    try {
      rootEntries = await readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const rootEntry of rootEntries) {
      if (rootEntry.isFile() && rootEntry.name.endsWith(".jsonl")) {
        candidatePaths.push(join(root, rootEntry.name));
        continue;
      }
      if (!rootEntry.isDirectory()) continue;

      const folder = join(root, rootEntry.name);
      let entries;
      try {
        entries = await readdir(folder, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".jsonl")) candidatePaths.push(join(folder, entry.name));
      }
    }
  }

  for (let index = 0; index < candidatePaths.length; index += 64) {
    const metadata = await Promise.all(candidatePaths.slice(index, index + 64).map(async (path) => {
      try {
        const details = await stat(path);
        return { path, size: details.size, updatedAt: details.mtimeMs };
      } catch {
        return null;
      }
    }));
    files.push(...metadata.filter((item): item is { path: string; size: number; updatedAt: number } => item !== null));
  }

  files.sort((a, b) => b.updatedAt - a.updatedAt);
  const selected = files.slice(0, MAX_SESSIONS);
  const summaries: DesktopSessionSummary[] = [];

  for (let index = 0; index < selected.length; index += 32) {
    const batch = selected.slice(index, index + 32);
    const parsed = await Promise.all(batch.map((file) => parseSession(file)));
    summaries.push(...parsed.filter((item): item is DesktopSessionSummary => item !== null));
  }

  return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
}

async function resolveSessionRoots(): Promise<string[]> {
  const agentDirectory = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
  const roots = new Set<string>([process.env.PI_CODING_AGENT_SESSION_DIR ?? join(agentDirectory, "sessions")]);

  try {
    const settings = JSON.parse(await readFile(join(agentDirectory, "settings.json"), "utf8")) as { sessionDir?: string };
    if (settings.sessionDir) {
      const expanded = settings.sessionDir.startsWith("~/")
        ? join(homedir(), settings.sessionDir.slice(2))
        : settings.sessionDir;
      roots.add(isAbsolute(expanded) ? expanded : resolve(agentDirectory, expanded));
    }
  } catch {
    // Default session storage remains available without settings.json.
  }

  return [...roots];
}

async function parseSession(file: { path: string; size: number; updatedAt: number }): Promise<DesktopSessionSummary | null> {
  try {
    const text = file.size <= SMALL_FILE_LIMIT ? await readFile(file.path, "utf8") : await readLargeSession(file.path, file.size);
    const entries = text
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as Record<string, unknown>];
        } catch {
          return [];
        }
      });

    const header = entries.find((entry) => entry.type === "session");
    if (!header || typeof header.cwd !== "string") return null;

    let name: string | undefined;
    let firstMessage = "Untitled session";
    let lastMessage: string | undefined;
    let messageCount = 0;

    for (const entry of entries) {
      if (entry.type === "session_info" && typeof entry.name === "string") name = entry.name;
      if (entry.type !== "message" || !entry.message || typeof entry.message !== "object") continue;
      messageCount += 1;
      const message = entry.message as AgentMessage;
      const textContent = getMessageText(message);
      if (message.role === "user" && textContent && firstMessage === "Untitled session") firstMessage = textContent;
      if ((message.role === "assistant" || message.role === "user") && textContent) lastMessage = textContent;
    }

    return {
      path: file.path,
      id: typeof header.id === "string" ? header.id : basename(file.path, ".jsonl"),
      cwd: header.cwd,
      name,
      firstMessage: compactText(firstMessage),
      lastMessage: lastMessage ? compactText(lastMessage) : undefined,
      updatedAt: file.updatedAt,
      size: file.size,
      messageCount,
    };
  } catch {
    return null;
  }
}

async function readLargeSession(path: string, size: number): Promise<string> {
  const handle = await open(path, "r");
  try {
    const head = Buffer.alloc(SLICE_SIZE);
    const tail = Buffer.alloc(SLICE_SIZE);
    const headRead = await handle.read(head, 0, SLICE_SIZE, 0);
    const tailStart = Math.max(0, size - SLICE_SIZE);
    const tailRead = await handle.read(tail, 0, SLICE_SIZE, tailStart);
    let tailText = tail.subarray(0, tailRead.bytesRead).toString("utf8");
    const firstNewline = tailText.indexOf("\n");
    if (tailStart > 0 && firstNewline >= 0) tailText = tailText.slice(firstNewline + 1);
    return `${head.subarray(0, headRead.bytesRead).toString("utf8")}\n${tailText}`;
  } finally {
    await handle.close();
  }
}

function getMessageText(message: AgentMessage): string {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .filter((content): content is Extract<MessageContent, { type: "text" }> => content.type === "text")
    .map((content) => content.text)
    .join(" ");
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 180) || "Untitled session";
}
