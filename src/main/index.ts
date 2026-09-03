import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import { join } from "node:path";
import type {
  AgentMessage,
  DesktopProject,
  PiBootstrap,
  PiModel,
  PiSessionState,
  RpcCommand,
  RpcEvent,
  RpcResponse,
  SessionStats,
  SlashCommand,
  StartPiOptions,
  ThinkingLevel,
} from "../shared/types";
import { ProjectStore } from "./project-store";
import { PiRpcClient } from "./rpc-client";
import { listSessionSummaries } from "./session-index";

let mainWindow: BrowserWindow | null = null;
let quitting = false;
let sessionIndexPromise: ReturnType<typeof listSessionSummaries> | undefined;

const rpc = new PiRpcClient((event) => {
  const window = mainWindow;
  if (window && !window.isDestroyed()) window.webContents.send("pi:event", event);
});

const projectStore = new ProjectStore(join(app.getPath("userData"), "projects.json"));

function sessionIndex(): ReturnType<typeof listSessionSummaries> {
  if (!sessionIndexPromise) {
    sessionIndexPromise = listSessionSummaries().finally(() => {
      sessionIndexPromise = undefined;
    });
  }
  return sessionIndexPromise;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: "#171819",
    title: "Pi Desktop",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const current = mainWindow?.webContents.getURL();
    if (url !== current) event.preventDefault();
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function installMenu(): void {
  const sendMenu = (action: string): void => {
    const event: RpcEvent = { type: "desktop_menu", action };
    mainWindow?.webContents.send("pi:event", event);
  };

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Pi Desktop",
        submenu: [
          { role: "about" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "File",
        submenu: [
          { label: "New Session", accelerator: "CmdOrCtrl+N", click: () => sendMenu("new-session") },
          { label: "Add Project", accelerator: "CmdOrCtrl+O", click: () => sendMenu("add-project") },
          { type: "separator" },
          { label: "Export Session", accelerator: "CmdOrCtrl+Shift+E", click: () => sendMenu("export") },
        ],
      },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: [
          { label: "Command Palette", accelerator: "CmdOrCtrl+K", click: () => sendMenu("commands") },
          { label: "Focus Composer", accelerator: "CmdOrCtrl+L", click: () => sendMenu("focus-composer") },
          { type: "separator" },
          { role: "reload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { role: "togglefullscreen" },
        ],
      },
      {
        label: "Session",
        submenu: [
          { label: "Compact Context", accelerator: "CmdOrCtrl+Shift+C", click: () => sendMenu("compact") },
          { label: "Clone Session", click: () => sendMenu("clone") },
          { label: "Fork From…", click: () => sendMenu("fork") },
          { label: "Abort", accelerator: "Esc", click: () => sendMenu("abort") },
        ],
      },
      { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "front" }] },
    ]),
  );
}

function registerIpc(): void {
  ipcMain.handle("pi:start", async (_event, options: StartPiOptions): Promise<PiBootstrap> => {
    if (!options || typeof options.cwd !== "string") throw new Error("A working directory is required");
    await rpc.start(options);

    const stateResponse = await rpc.send<PiSessionState>({ type: "get_state" }, 30_000);
    if (!stateResponse.success || !stateResponse.data) throw new Error(stateResponse.error ?? "Pi did not return session state");

    const [messages, models, thinking, commands, stats] = await Promise.all([
      rpc.send<{ messages: AgentMessage[] }>({ type: "get_messages" }),
      rpc.send<{ models: PiModel[] }>({ type: "get_available_models" }),
      rpc.send<{ levels: ThinkingLevel[] }>({ type: "get_available_thinking_levels" }),
      rpc.send<{ commands: SlashCommand[] }>({ type: "get_commands" }),
      rpc.send<SessionStats>({ type: "get_session_stats" }).catch(() => undefined),
    ]);

    return {
      cwd: options.cwd,
      executable: rpc.executablePath,
      state: stateResponse.data,
      messages: responseData(messages, { messages: [] }).messages,
      models: responseData(models, { models: [] }).models,
      thinkingLevels: responseData(thinking, { levels: ["off"] as ThinkingLevel[] }).levels,
      commands: responseData(commands, { commands: [] }).commands,
      stats: stats?.success ? stats.data : undefined,
    };
  });

  ipcMain.handle("pi:stop", () => rpc.stop());
  ipcMain.handle("pi:command", (_event, command: RpcCommand) => {
    if (!command || typeof command.type !== "string") throw new Error("Invalid Pi command");
    return rpc.send(command);
  });
  ipcMain.handle("pi:extension-response", (_event, response: Record<string, unknown>) => {
    if (!response || response.type !== "extension_ui_response" || typeof response.id !== "string") {
      throw new Error("Invalid extension response");
    }
    rpc.sendExtensionResponse(response);
  });

  ipcMain.handle("sessions:list", () => sessionIndex());
  ipcMain.handle("projects:list", async () => projectStore.list(await sessionIndex()));
  ipcMain.handle("projects:add", async (): Promise<DesktopProject | null> => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "Add a project",
      buttonLabel: "Add Project",
      properties: ["openDirectory", "createDirectory"],
    });
    const path = result.filePaths[0];
    if (result.canceled || !path) return null;
    await projectStore.add(path);
    const sessions = await sessionIndex();
    return (await projectStore.list(sessions)).find((project) => project.path === path) ?? null;
  });
  ipcMain.handle("projects:remove", async (_event, path: string) => {
    if (typeof path === "string") await projectStore.remove(path);
  });

  ipcMain.handle("system:open-path", (_event, path: string) => shell.openPath(path));
  ipcMain.handle("system:reveal-path", (_event, path: string) => shell.showItemInFolder(path));
  ipcMain.handle("system:open-external", (_event, url: string) => {
    if (!/^https?:\/\//i.test(url)) throw new Error("Only HTTP and HTTPS links are allowed");
    return shell.openExternal(url);
  });
}

function responseData<T>(response: RpcResponse<T>, fallback: T): T {
  return response.success && response.data !== undefined ? response.data : fallback;
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    registerIpc();
    installMenu();
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("before-quit", (event) => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();
  void rpc.stop().finally(() => app.quit());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

