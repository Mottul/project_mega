import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
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
  pathForFile: (file) => webUtils.getPathForFile(file),

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
  },

  player: {
    encoders: () => ipcRenderer.invoke(Channels.playerEncoders),
    import: (req) => ipcRenderer.invoke(Channels.playerImport, req),
    convertList: () => ipcRenderer.invoke(Channels.playerConvertList),
    convertCancel: (id) => ipcRenderer.invoke(Channels.playerConvertCancel, id),
    convertClearFinished: () => ipcRenderer.invoke(Channels.playerConvertClear),
    onConvertUpdate: (cb) => subscribe(Channels.playerConvertUpdate, (j) => cb(j as never)),
    libraryList: () => ipcRenderer.invoke(Channels.playerLibraryList),
    libraryDelete: (id) => ipcRenderer.invoke(Channels.playerLibraryDelete, id),
    libraryClear: () => ipcRenderer.invoke(Channels.playerLibraryClear),
    reconvert: (mediaIds, wall) => ipcRenderer.invoke(Channels.playerReconvert, mediaIds, wall),
    pickIdleMedia: () => ipcRenderer.invoke(Channels.playerPickIdleMedia),
    mediaDir: () => ipcRenderer.invoke(Channels.playerMediaDir),
    onLibraryChanged: (cb) => subscribe(Channels.playerLibraryChanged, () => cb()),
    getState: () => ipcRenderer.invoke(Channels.playerGetState),
    command: (cmd) => ipcRenderer.invoke(Channels.playerCommand, cmd),
    report: (positionSec, durationSec) =>
      ipcRenderer.invoke(Channels.playerReport, positionSec, durationSec),
    openOutput: (displayId) => ipcRenderer.invoke(Channels.playerOpenOutput, displayId),
    closeOutput: () => ipcRenderer.invoke(Channels.playerCloseOutput),
    onState: (cb) => subscribe(Channels.playerState, (s) => cb(s as never)),
    onTick: (cb) => subscribe(Channels.playerTick, (t) => cb(t as never)),
    remoteStatus: () => ipcRenderer.invoke(Channels.playerRemoteStatus),
    remoteStart: (port) => ipcRenderer.invoke(Channels.playerRemoteStart, port),
    remoteStop: () => ipcRenderer.invoke(Channels.playerRemoteStop),
    onRemoteChanged: (cb) => subscribe(Channels.playerRemoteChanged, (s) => cb(s as never))
  },

  timer: {
    getState: () => ipcRenderer.invoke(Channels.timerGetState),
    command: (cmd) => ipcRenderer.invoke(Channels.timerCommand, cmd),
    openOutput: (displayId) => ipcRenderer.invoke(Channels.timerOpenOutput, displayId),
    closeOutput: () => ipcRenderer.invoke(Channels.timerCloseOutput),
    onState: (cb) => subscribe(Channels.timerState, (s) => cb(s as never)),
    onTick: (cb) => subscribe(Channels.timerTick, (t) => cb(t as never))
  },

  util: {
    exportPdf: (html, suggestedName) =>
      ipcRenderer.invoke(Channels.utilExportPdf, html, suggestedName)
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
