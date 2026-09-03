import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi, RpcCommand, RpcEvent, StartPiOptions } from "../shared/types";

const api: DesktopApi = {
  start: (options: StartPiOptions) => ipcRenderer.invoke("pi:start", options),
  stop: () => ipcRenderer.invoke("pi:stop"),
  command: <T>(command: RpcCommand) => ipcRenderer.invoke("pi:command", command) as Promise<T>,
  extensionResponse: (response) => ipcRenderer.invoke("pi:extension-response", response),
  listSessions: () => ipcRenderer.invoke("sessions:list"),
  listProjects: () => ipcRenderer.invoke("projects:list"),
  addProject: () => ipcRenderer.invoke("projects:add"),
  removeProject: (path: string) => ipcRenderer.invoke("projects:remove", path),
  openPath: (path: string) => ipcRenderer.invoke("system:open-path", path),
  revealPath: (path: string) => ipcRenderer.invoke("system:reveal-path", path),
  openExternal: (url: string) => ipcRenderer.invoke("system:open-external", url),
  onEvent: (listener: (event: RpcEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, value: RpcEvent): void => listener(value);
    ipcRenderer.on("pi:event", wrapped);
    return () => ipcRenderer.removeListener("pi:event", wrapped);
  },
};

contextBridge.exposeInMainWorld("piDesktop", api);
