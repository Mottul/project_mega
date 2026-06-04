import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { Channels, type ToolboxApi } from '@shared/ipc-contracts'

/** Event-Abo mit Cleanup -- verhindert Listener-Leaks bei Renderer-Navigation. */
function subscribe(channel: string, cb: (...args: unknown[]) => void): () => void {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]): void => cb(...args)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: ToolboxApi = {
  selectPaths: (options) => ipcRenderer.invoke(Channels.dialogSelect, options),
  openPath: (target) => ipcRenderer.invoke(Channels.shellOpenPath, target),
  showItemInFolder: (target) => ipcRenderer.invoke(Channels.shellShowItem, target),
  getSettings: () => ipcRenderer.invoke(Channels.settingsGet),
  setSettings: (patch) => ipcRenderer.invoke(Channels.settingsSet, patch),
  getLogPath: () => ipcRenderer.invoke(Channels.appLogPath),

  ffmpeg: {
    checkHap: () => ipcRenderer.invoke(Channels.ffmpegCheckHap),
    probe: (path) => ipcRenderer.invoke(Channels.ffmpegProbe, path)
  },

  hap: {
    enqueue: (req) => ipcRenderer.invoke(Channels.hapEnqueue, req),
    list: () => ipcRenderer.invoke(Channels.hapList),
    cancel: (id) => ipcRenderer.invoke(Channels.hapCancel, id),
    cancelAll: () => ipcRenderer.invoke(Channels.hapCancelAll),
    clearFinished: () => ipcRenderer.invoke(Channels.hapClearFinished),
    onUpdate: (cb) => subscribe(Channels.hapUpdate, (job) => cb(job as never))
  },

  manuals: {
    import: (paths) => ipcRenderer.invoke(Channels.manualsImport, paths),
    list: (query) => ipcRenderer.invoke(Channels.manualsList, query),
    search: (query) => ipcRenderer.invoke(Channels.manualsSearch, query),
    searchInDoc: (manualId, query) =>
      ipcRenderer.invoke(Channels.manualsSearchInDoc, manualId, query),
    get: (id) => ipcRenderer.invoke(Channels.manualsGet, id),
    bytes: (id) => ipcRenderer.invoke(Channels.manualsBytes, id),
    update: (id, patch) => ipcRenderer.invoke(Channels.manualsUpdate, id, patch),
    delete: (id) => ipcRenderer.invoke(Channels.manualsDelete, id),
    onImportProgress: (cb) =>
      subscribe(Channels.manualsImportProgress, (p) => cb(p as never))
  },

  screen: {
    list: () => ipcRenderer.invoke(Channels.screenList)
  },

  patterns: {
    open: (config, displayId) => ipcRenderer.invoke(Channels.patternOpen, config, displayId),
    update: (config) => ipcRenderer.invoke(Channels.patternUpdate, config),
    close: () => ipcRenderer.invoke(Channels.patternClose),
    current: () => ipcRenderer.invoke(Channels.patternCurrent),
    onRender: (cb) => subscribe(Channels.patternRender, (c) => cb(c as never)),
    savePng: (bytes, suggestedName) =>
      ipcRenderer.invoke(Channels.patternSavePng, bytes, suggestedName),
    exportVideo: (req) => ipcRenderer.invoke(Channels.patternExportVideo, req),
    exportColorLoop: (req) => ipcRenderer.invoke(Channels.patternExportColorLoop, req),
    onVideoProgress: (cb) => subscribe(Channels.patternVideoProgress, (p) => cb(p as never))
  }
}

// contextIsolation ist aktiv (sichere Defaults) -> sauber via contextBridge exponieren.
if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  // Fallback (sollte mit unseren Defaults nie eintreten); globalThis statt window,
  // da der preload unter der node-tsconfig (ohne DOM-lib) typgeprueft wird.
  ;(globalThis as unknown as { api: ToolboxApi }).api = api
}
