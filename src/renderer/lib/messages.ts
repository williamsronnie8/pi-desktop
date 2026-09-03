import type { AgentMessage, MessageContent } from "../../shared/types";

export interface ToolActivity {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: "running" | "success" | "error";
  result?: unknown;
  partial?: unknown;
  startedAt?: number;
}

export function messageText(message: AgentMessage): string {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return message.summary ?? message.output ?? "";
  return message.content
    .filter((block): block is Extract<MessageContent, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

export function extractToolActivity(messages: AgentMessage[]): ToolActivity[] {
  const tools = new Map<string, ToolActivity>();
  const order: string[] = [];

  for (const message of messages) {
    if (message.role === "assistant" && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.type !== "toolCall") continue;
        if (!tools.has(block.id)) order.push(block.id);
        tools.set(block.id, {
          id: block.id,
          name: block.name,
          args: block.arguments,
          status: "running",
          startedAt: message.timestamp,
        });
      }
    }

    if (message.role === "toolResult" && message.toolCallId) {
      const existing = tools.get(message.toolCallId);
      if (!existing) order.push(message.toolCallId);
      tools.set(message.toolCallId, {
        id: message.toolCallId,
        name: message.toolName ?? existing?.name ?? "tool",
        args: existing?.args ?? {},
        status: message.isError ? "error" : "success",
        result: message,
        startedAt: existing?.startedAt ?? message.timestamp,
      });
    }
  }

  return order.map((id) => tools.get(id)).filter((item): item is ToolActivity => Boolean(item));
}

export function mergeToolActivity(persisted: ToolActivity[], live: ToolActivity[]): ToolActivity[] {
  const merged = new Map(persisted.map((tool) => [tool.id, tool]));
  for (const tool of live) merged.set(tool.id, { ...merged.get(tool.id), ...tool });
  return [...merged.values()].sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
}

export function changedFiles(tools: ToolActivity[]): string[] {
  const files = new Set<string>();
  for (const tool of tools) {
    if (!["edit", "write"].includes(tool.name)) continue;
    for (const key of ["path", "file", "filePath", "file_path"]) {
      const value = tool.args[key];
      if (typeof value === "string") files.add(value);
    }
  }
  return [...files];
}

export function resultText(result: unknown): string {
  if (!result || typeof result !== "object") return String(result ?? "");
  const candidate = result as {
    content?: Array<{ type?: string; text?: string }>;
    output?: string;
    message?: string;
  };
  if (candidate.output) return candidate.output;
  if (candidate.message) return candidate.message;
  if (Array.isArray(candidate.content)) {
    return candidate.content
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("\n");
  }
  return JSON.stringify(result, null, 2);
}
