export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface PiModel {
  id: string;
  name: string;
  provider: string;
  api?: string;
  reasoning: boolean;
  input: string[];
  contextWindow: number;
  maxTokens: number;
  cost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export interface ThinkingContent {
  type: "thinking";
  thinking: string;
}

export interface ToolCallContent {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type MessageContent = TextContent | ImageContent | ThinkingContent | ToolCallContent;

export interface AgentMessage {
  role: "user" | "assistant" | "toolResult" | "bashExecution" | "custom" | "branchSummary" | "compactionSummary";
  content?: string | MessageContent[];
  timestamp?: number;
  provider?: string;
  model?: string;
  stopReason?: string;
  errorMessage?: string;
  usage?: Usage;
  toolCallId?: string;
  toolName?: string;
  details?: unknown;
  isError?: boolean;
  command?: string;
  output?: string;
  exitCode?: number;
  cancelled?: boolean;
  truncated?: boolean;
  fullOutputPath?: string;
  excludeFromContext?: boolean;
  customType?: string;
  display?: boolean;
  summary?: string;
}

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens?: number;
  cost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

export interface PiSessionState {
  model?: PiModel;
  thinkingLevel: ThinkingLevel;
  isStreaming: boolean;
  isCompacting: boolean;
  steeringMode: "all" | "one-at-a-time";
  followUpMode: "all" | "one-at-a-time";
  sessionFile?: string;
  sessionId: string;
  sessionName?: string;
  autoCompactionEnabled: boolean;
  messageCount: number;
  pendingMessageCount: number;
}

export interface SessionStats {
  sessionFile?: string;
  sessionId: string;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  toolResults: number;
  totalMessages: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;
  contextUsage?: {
    tokens: number | null;
    contextWindow: number;
    percent: number | null;
  };
}

export interface SlashCommand {
  name: string;
  description?: string;
  source: "extension" | "prompt" | "skill";
  sourceInfo?: {
    path?: string;
    source?: string;
    scope?: "user" | "project" | "temporary";
    origin?: "package" | "top-level";
  };
}

export interface RpcCommand {
  type: string;
  id?: string;
  [key: string]: unknown;
}

export interface RpcResponse<T = unknown> {
  id?: string;
  type: "response";
  command: string;
  success: boolean;
  data?: T;
  error?: string;
}

export interface RpcEvent {
  type: string;
  [key: string]: unknown;
}

export interface ExtensionUIRequest extends RpcEvent {
  type: "extension_ui_request";
  id: string;
  method: "select" | "confirm" | "input" | "editor" | "notify" | "setStatus" | "setWidget" | "setTitle" | "set_editor_text";
  title?: string;
  options?: string[];
  message?: string;
  placeholder?: string;
  prefill?: string;
  timeout?: number;
  notifyType?: "info" | "warning" | "error";
  statusKey?: string;
  statusText?: string;
  widgetKey?: string;
  widgetLines?: string[];
  widgetPlacement?: "aboveEditor" | "belowEditor";
  text?: string;
}

export interface PiUpdateStatus {
  currentVersion: string;
  latestVersion?: string;
  updateAvailable: boolean;
  executable: string;
}

export interface PiUpdateResult extends PiUpdateStatus {
  output: string;
}

export interface PiBootstrap {
  cwd: string;
  executable: string;
  state: PiSessionState;
  messages: AgentMessage[];
  models: PiModel[];
  thinkingLevels: ThinkingLevel[];
  commands: SlashCommand[];
  stats?: SessionStats;
}

export interface DesktopSessionSummary {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  firstMessage: string;
  lastMessage?: string;
  updatedAt: number;
  size: number;
  messageCount: number;
}

export interface DesktopProject {
  path: string;
  name: string;
  pinned: boolean;
  lastUsedAt?: number;
  sessionCount: number;
}

export interface StartPiOptions {
  cwd: string;
  sessionPath?: string;
}

export interface ImageAttachment {
  id: string;
  name: string;
  mimeType: string;
  data: string;
  previewUrl: string;
}

export interface DesktopApi {
  start(options: StartPiOptions): Promise<PiBootstrap>;
  stop(): Promise<void>;
  command<T = unknown>(command: RpcCommand): Promise<RpcResponse<T>>;
  extensionResponse(response: Record<string, unknown>): Promise<void>;
  listSessions(): Promise<DesktopSessionSummary[]>;
  listProjects(): Promise<DesktopProject[]>;
  addProject(): Promise<DesktopProject | null>;
  removeProject(path: string): Promise<void>;
  openPath(path: string): Promise<string>;
  revealPath(path: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  getPiUpdateStatus(): Promise<PiUpdateStatus>;
  updatePi(): Promise<PiUpdateResult>;
  onEvent(listener: (event: RpcEvent) => void): () => void;
}

declare global {
  interface Window {
    piDesktop?: DesktopApi;
  }
}
