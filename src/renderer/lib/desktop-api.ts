import type {
  AgentMessage,
  DesktopApi,
  DesktopProject,
  DesktopSessionSummary,
  PiBootstrap,
  RpcCommand,
  RpcResponse,
} from "../../shared/types";

const now = Date.now();
const mockMessages: AgentMessage[] = [
  {
    role: "user",
    content: "Can you inspect this project and make the settings screen easier to use?",
    timestamp: now - 90_000,
  },
  {
    role: "assistant",
    content: [
      { type: "thinking", thinking: "I should inspect the existing settings components and preserve the current data flow." },
      {
        type: "text",
        text: "I found the main issue. The settings are split across three components, but the hierarchy doesn't match how people use them. I'm consolidating the controls without changing their behavior.",
      },
      { type: "toolCall", id: "mock-read", name: "read", arguments: { path: "src/components/Settings.tsx" } },
      { type: "toolCall", id: "mock-edit", name: "edit", arguments: { path: "src/components/Settings.tsx" } },
    ],
    provider: "openai-codex",
    model: "gpt-5.6",
    timestamp: now - 75_000,
  },
  {
    role: "toolResult",
    toolCallId: "mock-read",
    toolName: "read",
    content: [{ type: "text", text: "Read 284 lines from src/components/Settings.tsx" }],
    isError: false,
    timestamp: now - 65_000,
  },
  {
    role: "toolResult",
    toolCallId: "mock-edit",
    toolName: "edit",
    content: [{ type: "text", text: "Updated src/components/Settings.tsx" }],
    isError: false,
    timestamp: now - 40_000,
  },
  {
    role: "assistant",
    content: [{ type: "text", text: "The settings screen now has a clear model section, session controls, and advanced options. The existing behavior is unchanged, and the build passes." }],
    provider: "openai-codex",
    model: "gpt-5.6",
    timestamp: now - 30_000,
  },
];

const mockBootstrap: PiBootstrap = {
  cwd: "/Users/ronnie/Code/pi-desktop",
  executable: "/opt/homebrew/bin/pi",
  state: {
    model: {
      id: "gpt-5.6",
      name: "GPT-5.6",
      provider: "openai-codex",
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 400_000,
      maxTokens: 64_000,
    },
    thinkingLevel: "high",
    isStreaming: false,
    isCompacting: false,
    steeringMode: "one-at-a-time",
    followUpMode: "one-at-a-time",
    sessionFile: "/Users/ronnie/.pi/agent/sessions/mock.jsonl",
    sessionId: "mock-session",
    sessionName: "Polish settings screen",
    autoCompactionEnabled: true,
    messageCount: mockMessages.length,
    pendingMessageCount: 0,
  },
  messages: mockMessages,
  models: [
    {
      id: "gpt-5.6",
      name: "GPT-5.6",
      provider: "openai-codex",
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 400_000,
      maxTokens: 64_000,
    },
    {
      id: "claude-opus-4-6",
      name: "Claude Opus 4.6",
      provider: "anthropic",
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 200_000,
      maxTokens: 32_000,
    },
  ],
  thinkingLevels: ["off", "minimal", "low", "medium", "high", "xhigh"],
  commands: [
    { name: "review", description: "Review the current changes", source: "prompt" },
    { name: "skill:obsidian-cli", description: "Work with Obsidian vaults", source: "skill" },
    { name: "stats", description: "Show detailed session statistics", source: "extension" },
  ],
  stats: {
    sessionId: "mock-session",
    userMessages: 1,
    assistantMessages: 2,
    toolCalls: 2,
    toolResults: 2,
    totalMessages: 5,
    tokens: { input: 28_400, output: 2_190, cacheRead: 21_000, cacheWrite: 0, total: 51_590 },
    cost: 0.17,
    contextUsage: { tokens: 31_200, contextWindow: 400_000, percent: 7.8 },
  },
};

const mockSessions: DesktopSessionSummary[] = [
  {
    path: mockBootstrap.state.sessionFile!,
    id: "mock-session",
    cwd: mockBootstrap.cwd,
    name: "Polish settings screen",
    firstMessage: "Make the settings screen easier to use",
    lastMessage: "The settings screen now has a clear model section",
    updatedAt: now - 30_000,
    size: 48_200,
    messageCount: 5,
  },
  {
    path: "/Users/ronnie/.pi/agent/sessions/second.jsonl",
    id: "mock-second",
    cwd: mockBootstrap.cwd,
    name: "Fix session loading",
    firstMessage: "Track down the session loading race",
    updatedAt: now - 3_600_000,
    size: 30_000,
    messageCount: 12,
  },
  {
    path: "/Users/ronnie/.pi/agent/sessions/third.jsonl",
    id: "mock-third",
    cwd: "/Users/ronnie/Code/another-project",
    firstMessage: "Review the release checklist",
    updatedAt: now - 86_400_000,
    size: 12_000,
    messageCount: 8,
  },
];

const mockProjects: DesktopProject[] = [
  { path: mockBootstrap.cwd, name: "pi-desktop", pinned: true, lastUsedAt: now, sessionCount: 2 },
  { path: "/Users/ronnie/Code/another-project", name: "another-project", pinned: true, lastUsedAt: now - 86_400_000, sessionCount: 1 },
  { path: "/Users/ronnie", name: "Home", pinned: true, sessionCount: 0 },
];

function successful<T>(command: string, data?: T): RpcResponse<T> {
  return { type: "response", command, success: true, data };
}

const mockApi: DesktopApi = {
  start: async (options) => ({ ...mockBootstrap, cwd: options.cwd }),
  stop: async () => undefined,
  command: async <T>(command: RpcCommand) => {
    if (command.type === "get_messages") return successful(command.type, { messages: mockMessages }) as RpcResponse<T>;
    if (command.type === "get_state") return successful(command.type, mockBootstrap.state) as RpcResponse<T>;
    if (command.type === "get_session_stats") return successful(command.type, mockBootstrap.stats) as RpcResponse<T>;
    if (command.type === "get_available_thinking_levels") {
      return successful(command.type, { levels: mockBootstrap.thinkingLevels }) as RpcResponse<T>;
    }
    if (command.type === "get_fork_messages") {
      return successful(command.type, { messages: [{ entryId: "mock", text: "Can you inspect this project?" }] }) as RpcResponse<T>;
    }
    return successful(command.type) as RpcResponse<T>;
  },
  extensionResponse: async () => undefined,
  listSessions: async () => mockSessions,
  listProjects: async () => mockProjects,
  addProject: async () => null,
  removeProject: async () => undefined,
  openPath: async () => "",
  revealPath: async () => undefined,
  openExternal: async () => undefined,
  getPiUpdateStatus: async () => ({ currentVersion: "0.84.1", latestVersion: "0.85.0", updateAvailable: true, executable: mockBootstrap.executable }),
  updatePi: async () => ({ currentVersion: "0.85.0", latestVersion: "0.85.0", updateAvailable: false, executable: mockBootstrap.executable, output: "Pi updated" }),
  onEvent: () => () => undefined,
};

export function desktopApi(): DesktopApi {
  return window.piDesktop ?? mockApi;
}

export const isBrowserPreview = !window.piDesktop;
