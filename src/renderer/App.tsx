import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type {
  AgentMessage,
  DesktopProject,
  DesktopSessionSummary,
  ExtensionUIRequest,
  ImageAttachment,
  PiBootstrap,
  PiSessionState,
  PiUpdateStatus,
  RpcEvent,
  RpcResponse,
  SessionStats,
  ThinkingLevel,
} from "../shared/types";
import { ActivityPanel } from "./components/ActivityPanel";
import { Composer } from "./components/Composer";
import { Conversation } from "./components/Conversation";
import { LeftSidebar } from "./components/LeftSidebar";
import {
  CommandPalette,
  ExtensionDialog,
  ForkDialog,
  NameDialog,
  SettingsModal,
  Toasts,
  type LocalCommand,
  type ToastItem,
} from "./components/Modals";
import { ResizeHandle } from "./components/ResizeHandle";
import { SessionBar, type ResponsePerformance } from "./components/SessionBar";
import { TopBar } from "./components/TopBar";
import { desktopApi, isBrowserPreview } from "./lib/desktop-api";
import { extractToolActivity, mergeToolActivity, type ToolActivity } from "./lib/messages";

interface QueueState {
  steering: string[];
  followUp: string[];
}

interface ExtensionWidget {
  key: string;
  lines: string[];
  placement?: "aboveEditor" | "belowEditor";
}

export default function App() {
  const api = useMemo(() => desktopApi(), []);
  const [bootstrap, setBootstrap] = useState<PiBootstrap>();
  const [projects, setProjects] = useState<DesktopProject[]>([]);
  const [sessions, setSessions] = useState<DesktopSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [streamingThinking, setStreamingThinking] = useState("");
  const [liveTools, setLiveTools] = useState<ToolActivity[]>([]);
  const [queue, setQueue] = useState<QueueState>({ steering: [], followUp: [] });
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [widgets, setWidgets] = useState<ExtensionWidget[]>([]);
  const [extensionRequest, setExtensionRequest] = useState<ExtensionUIRequest>();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [piUpdateStatus, setPiUpdateStatus] = useState<PiUpdateStatus>();
  const [checkingPiUpdate, setCheckingPiUpdate] = useState(false);
  const [updatingPi, setUpdatingPi] = useState(false);
  const [piUpdateError, setPiUpdateError] = useState<string>();
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [forkMessages, setForkMessages] = useState<Array<{ entryId: string; text: string }> | null>(null);
  const [retryEnabled, setRetryEnabled] = useState(true);
  const [menuAction, setMenuAction] = useState<string>();
  const [focusToken, setFocusToken] = useState(0);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [leftWidth, setLeftWidth] = useState(278);
  const [rightWidth, setRightWidth] = useState(348);
  const [responsePerformance, setResponsePerformance] = useState<ResponsePerformance>();
  const refreshTimer = useRef<number | undefined>(undefined);
  const responseTiming = useRef<{ startedAt: number; firstOutputAt?: number } | undefined>(undefined);
  const initialized = useRef(false);
  const eventHandlerRef = useRef<(event: RpcEvent) => void>(() => undefined);

  const pushToast = useCallback((message: string, type: ToastItem["type"] = "info") => {
    const id = crypto.randomUUID();
    setToasts((items) => [...items.slice(-3), { id, message, type }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4_500);
  }, []);

  const refreshIndex = useCallback(async () => {
    const [nextProjects, nextSessions] = await Promise.all([api.listProjects(), api.listSessions()]);
    setProjects(nextProjects);
    setSessions(nextSessions);
    return { projects: nextProjects, sessions: nextSessions };
  }, [api]);

  const connect = useCallback(async (cwd: string, sessionPath?: string) => {
    setLoading(true);
    setError(undefined);
    setStreamingText("");
    setStreamingThinking("");
    setLiveTools([]);
    setQueue({ steering: [], followUp: [] });
    responseTiming.current = undefined;
    setResponsePerformance(undefined);
    try {
      const next = await api.start({ cwd, sessionPath });
      setBootstrap(next);
      localStorage.setItem("pi-desktop:last-cwd", cwd);
      void refreshIndex();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [api, refreshIndex]);

  const refreshRuntime = useCallback(async () => {
    if (!bootstrap) return;
    const [stateResponse, messagesResponse, statsResponse] = await Promise.all([
      api.command<PiSessionState>({ type: "get_state" }),
      api.command<{ messages: AgentMessage[] }>({ type: "get_messages" }),
      api.command<SessionStats>({ type: "get_session_stats" }).catch(() => undefined),
    ]);

    setBootstrap((current) => {
      if (!current) return current;
      return {
        ...current,
        state: responseData(stateResponse, current.state),
        messages: responseData(messagesResponse, { messages: current.messages }).messages,
        stats: statsResponse ? responseData(statsResponse, current.stats) : current.stats,
      };
    });
  }, [api, bootstrap]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => void refreshRuntime(), 60);
  }, [refreshRuntime]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void (async () => {
      try {
        const index = await refreshIndex();
        const remembered = localStorage.getItem("pi-desktop:last-cwd");
        const cwd = index.projects.find((project) => project.path === remembered)?.path ?? index.projects[0]?.path;
        if (!cwd) throw new Error("No project directory is available");
        await connect(cwd);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => () => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
  }, []);

  useEffect(() => {
    if (!responsePerformance?.active) return;
    const timer = window.setInterval(() => {
      const timing = responseTiming.current;
      if (!timing) return;
      setResponsePerformance((current) => current?.active ? { ...current, durationMs: Date.now() - timing.startedAt } : current);
    }, 100);
    return () => window.clearInterval(timer);
  }, [responsePerformance?.active]);

  const handleEvent = (event: RpcEvent): void => {
    if (event.type === "desktop_menu") {
      setMenuAction(String(event.action));
      return;
    }

    if (event.type === "agent_start") {
      setBootstrap((current) => current ? { ...current, state: { ...current.state, isStreaming: true } } : current);
      setStreamingText("");
      setStreamingThinking("");
      return;
    }

    if (event.type === "turn_start") {
      responseTiming.current = { startedAt: Date.now() };
      setResponsePerformance({ durationMs: 0, active: true });
      return;
    }

    if (event.type === "message_start") {
      const message = event.message as AgentMessage | undefined;
      if (message?.role === "assistant" && !responseTiming.current) {
        responseTiming.current = { startedAt: Date.now() };
        setResponsePerformance({ durationMs: 0, active: true });
      }
      return;
    }

    if (event.type === "agent_settled") {
      setBootstrap((current) => current ? { ...current, state: { ...current.state, isStreaming: false } } : current);
      setStreamingText("");
      setStreamingThinking("");
      responseTiming.current = undefined;
      setResponsePerformance((current) => current ? { ...current, active: false } : current);
      scheduleRefresh();
      void refreshIndex();
      return;
    }

    if (event.type === "message_update") {
      const update = event.assistantMessageEvent as { type?: string; delta?: string } | undefined;
      if (update?.delta && responseTiming.current && !responseTiming.current.firstOutputAt) responseTiming.current.firstOutputAt = Date.now();
      if (update?.type === "text_delta" && update.delta) setStreamingText((text) => text + update.delta);
      if (update?.type === "thinking_delta" && update.delta) setStreamingThinking((text) => text + update.delta);
      return;
    }

    if (event.type === "message_end") {
      const message = event.message as AgentMessage | undefined;
      if (message?.role === "assistant" && responseTiming.current) {
        const endedAt = Date.now();
        const timing = responseTiming.current;
        const outputDurationMs = endedAt - (timing.firstOutputAt ?? timing.startedAt);
        const outputTokens = message.usage?.output;
        setResponsePerformance({
          durationMs: endedAt - timing.startedAt,
          tokensPerSecond: outputTokens !== undefined && outputDurationMs > 0 ? outputTokens / (outputDurationMs / 1_000) : undefined,
          active: false,
        });
        responseTiming.current = undefined;
      }
      scheduleRefresh();
      return;
    }

    if (event.type === "tool_execution_start") {
      const id = String(event.toolCallId);
      setLiveTools((tools) => [
        ...tools.filter((tool) => tool.id !== id),
        {
          id,
          name: String(event.toolName),
          args: (event.args as Record<string, unknown>) ?? {},
          status: "running",
          startedAt: Date.now(),
        },
      ]);
      return;
    }

    if (event.type === "tool_execution_update") {
      const id = String(event.toolCallId);
      setLiveTools((tools) => tools.map((tool) => tool.id === id ? { ...tool, partial: event.partialResult } : tool));
      return;
    }

    if (event.type === "tool_execution_end") {
      const id = String(event.toolCallId);
      setLiveTools((tools) => tools.map((tool) => tool.id === id ? {
        ...tool,
        result: event.result,
        partial: undefined,
        status: event.isError ? "error" : "success",
      } : tool));
      scheduleRefresh();
      return;
    }

    if (event.type === "queue_update") {
      setQueue({
        steering: Array.isArray(event.steering) ? event.steering.map(String) : [],
        followUp: Array.isArray(event.followUp) ? event.followUp.map(String) : [],
      });
      return;
    }

    if (event.type === "extension_ui_request") {
      const request = event as ExtensionUIRequest;
      if (request.method === "notify") {
        pushToast(request.message ?? "Extension notification", request.notifyType ?? "info");
      } else if (request.method === "setStatus" && request.statusKey) {
        setStatuses((current) => {
          const next = { ...current };
          if (request.statusText) next[request.statusKey!] = request.statusText;
          else delete next[request.statusKey!];
          return next;
        });
      } else if (request.method === "setWidget" && request.widgetKey) {
        setWidgets((current) => {
          const remaining = current.filter((widget) => widget.key !== request.widgetKey);
          return request.widgetLines ? [...remaining, { key: request.widgetKey!, lines: request.widgetLines, placement: request.widgetPlacement }] : remaining;
        });
      } else if (request.method === "set_editor_text") {
        setDraft(request.text ?? "");
        setFocusToken((value) => value + 1);
      } else if (request.method === "setTitle" && request.title) {
        document.title = request.title;
      } else {
        setExtensionRequest(request);
      }
      return;
    }

    if (event.type === "extension_error") {
      pushToast(String(event.error ?? "An extension failed"), "error");
      return;
    }
    if (event.type === "auto_retry_start") {
      pushToast(`Pi is retrying in ${Math.round(Number(event.delayMs ?? 0) / 1_000)}s`, "warning");
      return;
    }
    if (event.type === "compaction_start") {
      pushToast("Compacting older context…", "info");
      return;
    }
    if (event.type === "desktop_process_exit" && !loading) {
      pushToast("The Pi runtime stopped", "error");
    }
  };
  eventHandlerRef.current = handleEvent;

  useEffect(() => api.onEvent((event) => eventHandlerRef.current(event)), [api]);

  const sendPrompt = useCallback(async (text: string, attachments: ImageAttachment[], behavior?: "steer" | "followUp") => {
    const trimmed = text.trim();
    try {
      let response: RpcResponse;
      if (trimmed.startsWith("!") && attachments.length === 0) {
        const excludeFromContext = trimmed.startsWith("!!");
        const command = trimmed.slice(excludeFromContext ? 2 : 1).trim();
        if (!command) return;
        response = await api.command({ type: "bash", command, excludeFromContext });
      } else {
        response = await api.command({
          type: "prompt",
          message: trimmed,
          images: attachments.map((attachment) => ({ type: "image", data: attachment.data, mimeType: attachment.mimeType })),
          ...(behavior ? { streamingBehavior: behavior } : {}),
        });
        if (!behavior) {
          setBootstrap((current) => current ? { ...current, state: { ...current.state, isStreaming: true } } : current);
        }
      }
      if (!response.success) throw new Error(response.error ?? `Pi rejected ${response.command}`);
      scheduleRefresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      pushToast(message, "error");
      throw cause;
    }
  }, [api, pushToast, scheduleRefresh]);

  const abort = useCallback(() => {
    void api.command({ type: "abort" }).then(() => {
      setStreamingText("");
      setStreamingThinking("");
    });
  }, [api]);

  const newSession = useCallback(async () => {
    const response = await api.command<{ cancelled: boolean }>({ type: "new_session" });
    if (!response.success || response.data?.cancelled) return;
    setBootstrap((current) => current ? { ...current, messages: [], stats: undefined, state: { ...current.state, sessionName: undefined, messageCount: 0 } } : current);
    setLiveTools([]);
    setDraft("");
    responseTiming.current = undefined;
    setResponsePerformance(undefined);
    await refreshRuntime();
    void refreshIndex();
  }, [api, refreshIndex, refreshRuntime]);

  const compact = useCallback(async () => {
    pushToast("Compacting context…");
    const response = await api.command({ type: "compact" });
    if (!response.success) pushToast(response.error ?? "Compaction failed", "error");
    else {
      pushToast("Context compacted");
      await refreshRuntime();
    }
  }, [api, pushToast, refreshRuntime]);

  const exportSession = useCallback(async () => {
    const response = await api.command<{ path: string }>({ type: "export_html" });
    if (!response.success || !response.data?.path) {
      pushToast(response.error ?? "Export failed", "error");
      return;
    }
    const openError = await api.openPath(response.data.path);
    if (openError) pushToast(openError, "error");
  }, [api, pushToast]);

  const openForkDialog = useCallback(async () => {
    const response = await api.command<{ messages: Array<{ entryId: string; text: string }> }>({ type: "get_fork_messages" });
    if (!response.success) {
      pushToast(response.error ?? "Could not load fork points", "error");
      return;
    }
    setForkMessages(response.data?.messages ?? []);
  }, [api, pushToast]);

  const cloneSession = useCallback(async () => {
    const response = await api.command<{ cancelled: boolean }>({ type: "clone" });
    if (!response.success || response.data?.cancelled) return;
    pushToast("Session cloned");
    await refreshRuntime();
    void refreshIndex();
  }, [api, pushToast, refreshIndex, refreshRuntime]);

  const runLocalCommand = useCallback((command: LocalCommand) => {
    setCommandPaletteOpen(false);
    if (command === "new") void newSession();
    if (command === "rename") setNameDialogOpen(true);
    if (command === "fork") void openForkDialog();
    if (command === "clone") void cloneSession();
    if (command === "compact") void compact();
    if (command === "export") void exportSession();
    if (command === "settings") setSettingsOpen(true);
  }, [cloneSession, compact, exportSession, newSession, openForkDialog]);

  useEffect(() => {
    if (!menuAction) return;
    setMenuAction(undefined);
    if (menuAction === "commands") setCommandPaletteOpen(true);
    else if (menuAction === "add-project") void addProject();
    else if (menuAction === "focus-composer") setFocusToken((value) => value + 1);
    else if (menuAction === "abort") abort();
    else runLocalCommand(menuAction === "new-session" ? "new" : menuAction as LocalCommand);
  }, [menuAction, abort, runLocalCommand]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const addProject = async (): Promise<void> => {
    const project = await api.addProject();
    if (!project) return;
    await refreshIndex();
    await connect(project.path);
  };

  const checkPiUpdate = useCallback(async () => {
    setCheckingPiUpdate(true);
    setPiUpdateError(undefined);
    try {
      setPiUpdateStatus(await api.getPiUpdateStatus());
    } catch (cause) {
      setPiUpdateError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCheckingPiUpdate(false);
    }
  }, [api]);

  const updatePi = useCallback(async () => {
    if (!bootstrap) return;
    setUpdatingPi(true);
    setPiUpdateError(undefined);
    try {
      const result = await api.updatePi();
      setPiUpdateStatus(result);
      pushToast(`Pi updated to ${result.currentVersion}`);
      await connect(bootstrap.cwd, bootstrap.state.sessionFile);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setPiUpdateError(message);
      pushToast(message, "error");
      await connect(bootstrap.cwd, bootstrap.state.sessionFile);
    } finally {
      setUpdatingPi(false);
    }
  }, [api, bootstrap, connect, pushToast]);

  useEffect(() => {
    if (settingsOpen && !piUpdateStatus && !checkingPiUpdate) void checkPiUpdate();
  }, [settingsOpen, piUpdateStatus, checkingPiUpdate, checkPiUpdate]);

  const settingsChange = async (setting: "autoCompaction" | "autoRetry" | "steeringMode" | "followUpMode", value: boolean | string): Promise<void> => {
    const command = setting === "autoCompaction"
      ? { type: "set_auto_compaction", enabled: value }
      : setting === "autoRetry"
        ? { type: "set_auto_retry", enabled: value }
        : setting === "steeringMode"
          ? { type: "set_steering_mode", mode: value }
          : { type: "set_follow_up_mode", mode: value };
    const response = await api.command(command);
    if (!response.success) {
      pushToast(response.error ?? "Could not update setting", "error");
      return;
    }
    if (setting === "autoRetry") setRetryEnabled(Boolean(value));
    setBootstrap((current) => {
      if (!current) return current;
      const state = { ...current.state };
      if (setting === "autoCompaction") state.autoCompactionEnabled = Boolean(value);
      if (setting === "steeringMode") state.steeringMode = value as PiSessionState["steeringMode"];
      if (setting === "followUpMode") state.followUpMode = value as PiSessionState["followUpMode"];
      return { ...current, state };
    });
  };

  const persistedTools = useMemo(() => extractToolActivity(bootstrap?.messages ?? []), [bootstrap?.messages]);
  const allTools = useMemo(() => mergeToolActivity(persistedTools, liveTools), [persistedTools, liveTools]);
  const gridStyle = {
    "--left-width": `${leftCollapsed ? 64 : leftWidth}px`,
    "--right-width": `${rightCollapsed ? 0 : rightWidth}px`,
  } as CSSProperties;

  if (!bootstrap) {
    return (
      <div className="launch-screen">
        <div className="launch-logo">π</div>
        <h1>Pi Desktop</h1>
        {loading && <><div className="launch-loader"><span /></div><p>Connecting to your Pi runtime…</p></>}
        {error && <><p className="launch-error">{error}</p><button className="primary-button" onClick={() => window.location.reload()}>Try again</button></>}
      </div>
    );
  }

  return (
    <div className="app-shell" style={gridStyle}>
      {isBrowserPreview && <div className="preview-ribbon">Browser preview</div>}
      <LeftSidebar
        projects={projects}
        sessions={sessions}
        activeCwd={bootstrap.cwd}
        activeSessionPath={bootstrap.state.sessionFile}
        collapsed={leftCollapsed}
        onProjectSelect={(path) => void connect(path)}
        onSessionSelect={(session) => void connect(session.cwd, session.path)}
        onNewSession={() => void newSession()}
        onAddProject={() => void addProject()}
      />
      {!leftCollapsed && <ResizeHandle side="left" onResize={(delta) => setLeftWidth((width) => Math.max(230, Math.min(390, width + delta)))} />}

      <section className="workspace">
        <TopBar
          cwd={bootstrap.cwd}
          state={bootstrap.state}
          leftCollapsed={leftCollapsed}
          rightCollapsed={rightCollapsed}
          onToggleLeft={() => setLeftCollapsed((value) => !value)}
          onToggleRight={() => setRightCollapsed((value) => !value)}
          onCommands={() => setCommandPaletteOpen(true)}
          onCompact={() => void compact()}
          onSettings={() => setSettingsOpen(true)}
        />
        <SessionBar
          cwd={bootstrap.cwd}
          executable={bootstrap.executable}
          state={bootstrap.state}
          stats={bootstrap.stats}
          performance={responsePerformance}
        />
        <div className="conversation-workspace">
          <Conversation
            messages={bootstrap.messages}
            streamingText={streamingText}
            streamingThinking={streamingThinking}
            isStreaming={bootstrap.state.isStreaming}
            sessionName={bootstrap.state.sessionName}
            onStarter={(prompt) => {
              setDraft(prompt);
              setFocusToken((value) => value + 1);
            }}
          />
          <Composer
            draft={draft}
            commands={bootstrap.commands}
            models={bootstrap.models}
            selectedModel={bootstrap.state.model}
            thinkingLevels={bootstrap.thinkingLevels}
            thinkingLevel={bootstrap.state.thinkingLevel}
            isStreaming={bootstrap.state.isStreaming}
            pendingSteering={queue.steering}
            pendingFollowUp={queue.followUp}
            widgets={widgets}
            focusToken={focusToken}
            onDraftChange={setDraft}
            onModelChange={(provider, modelId) => {
              void api.command({ type: "set_model", provider, modelId }).then(async (response) => {
                if (!response.success) pushToast(response.error ?? "Could not switch model", "error");
                else {
                  const levels = await api.command<{ levels: ThinkingLevel[] }>({ type: "get_available_thinking_levels" });
                  setBootstrap((current) => current ? {
                    ...current,
                    state: { ...current.state, model: response.data as PiBootstrap["state"]["model"] },
                    thinkingLevels: responseData(levels, { levels: current.thinkingLevels }).levels,
                  } : current);
                }
              });
            }}
            onThinkingChange={(level) => {
              void api.command({ type: "set_thinking_level", level }).then((response) => {
                if (!response.success) pushToast(response.error ?? "Could not change thinking level", "error");
                else setBootstrap((current) => current ? { ...current, state: { ...current.state, thinkingLevel: level } } : current);
              });
            }}
            onSubmit={sendPrompt}
            onAbort={abort}
          />
        </div>
      </section>

      {!rightCollapsed && <ResizeHandle side="right" onResize={(delta) => setRightWidth((width) => Math.max(300, Math.min(500, width + delta)))} />}
      <ActivityPanel
        tools={allTools}
        cwd={bootstrap.cwd}
        statuses={statuses}
        collapsed={rightCollapsed}
      />

      {commandPaletteOpen && (
        <CommandPalette
          commands={bootstrap.commands}
          onClose={() => setCommandPaletteOpen(false)}
          onLocalCommand={runLocalCommand}
          onSlashCommand={(command) => {
            setCommandPaletteOpen(false);
            setDraft(`/${command.name} `);
            setFocusToken((value) => value + 1);
          }}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          state={bootstrap.state}
          retryEnabled={retryEnabled}
          updateStatus={piUpdateStatus}
          checkingUpdate={checkingPiUpdate}
          updatingPi={updatingPi}
          updateError={piUpdateError}
          onCheckUpdate={() => void checkPiUpdate()}
          onUpdatePi={() => void updatePi()}
          onClose={() => setSettingsOpen(false)}
          onChange={(setting, value) => void settingsChange(setting, value)}
        />
      )}
      {nameDialogOpen && (
        <NameDialog
          currentName={bootstrap.state.sessionName}
          onClose={() => setNameDialogOpen(false)}
          onSave={(name) => {
            void api.command({ type: "set_session_name", name }).then((response) => {
              if (response.success) {
                setBootstrap((current) => current ? { ...current, state: { ...current.state, sessionName: name } } : current);
                setNameDialogOpen(false);
                void refreshIndex();
              }
            });
          }}
        />
      )}
      {forkMessages && (
        <ForkDialog
          messages={forkMessages}
          onClose={() => setForkMessages(null)}
          onFork={(entryId) => {
            void api.command<{ text: string; cancelled: boolean }>({ type: "fork", entryId }).then(async (response) => {
              if (!response.success || response.data?.cancelled) return;
              setForkMessages(null);
              setDraft(response.data?.text ?? "");
              setFocusToken((value) => value + 1);
              await refreshRuntime();
              void refreshIndex();
            });
          }}
        />
      )}
      {extensionRequest && (
        <ExtensionDialog
          request={extensionRequest}
          onRespond={(response) => {
            setExtensionRequest(undefined);
            void api.extensionResponse(response);
          }}
        />
      )}
      <Toasts items={toasts} onDismiss={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />
      {loading && <div className="reconnect-overlay"><div className="launch-loader"><span /></div><span>Switching session…</span></div>}
    </div>
  );
}

function responseData<T>(response: RpcResponse<T>, fallback: T): T {
  return response.success && response.data !== undefined ? response.data : fallback;
}
