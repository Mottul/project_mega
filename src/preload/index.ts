import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { Channels, type ToolboxApi } from '@shared/ipc-contracts'
import { baueApi } from './baueApi'

/** Event-Abo mit Cleanup -- verhindert Listener-Leaks bei Renderer-Navigation. */
function subscribe(channel: string, cb: (...args: unknown[]) => void): () => void {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]): void => cb(...args)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: ToolboxApi = {
  ...baueApi(Channels, {
    invoke: (kanal, ...args) => ipcRenderer.invoke(kanal, ...args),
    send: (kanal, ...args) => ipcRenderer.send(kanal, ...args),
    subscribe
  }),
  pathForFile: (file) => webUtils.getPathForFile(file)
}

// contextIsolation ist aktiv (sichere Defaults) -> sauber via contextBridge exponieren.
if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  // Fallback (sollte mit unseren Defaults nie eintreten); globalThis statt window,
  // da der preload unter der node-tsconfig (ohne DOM-lib) typgeprueft wird.
  ;(globalThis as unknown as { api: ToolboxApi }).api = api
}
