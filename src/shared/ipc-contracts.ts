// IPC-Kanalnamen + die typisierte API-Form, die preload via contextBridge
// als window.api bereitstellt. Von main (Handler) und renderer (Aufruf) importiert.

import type {
  AppSettings,
  DisplayInfo,
  HapCheckResult,
  HapEnqueueRequest,
  HapJob,
  ImportProgress,
  ImportSummary,
  ManualDetail,
  ManualMeta,
  ManualPatch,
  ManualSearchHit,
  PatternConfig,
  PatternVideoProgress,
  PatternVideoRequest,
  ProbeResult,
  SelectPathsOptions
} from './types'

/** Alle ipcMain.handle / ipcRenderer.invoke Kanaele + Event-Kanaele (main -> renderer). */
export const Channels = {
  // Dialog & Shell
  dialogSelect: 'dialog:select',
  shellOpenPath: 'shell:openPath',
  shellShowItem: 'shell:showItemInFolder',
  // Settings / App
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  appLogPath: 'app:logPath',
  // ffmpeg / HAP
  ffmpegCheckHap: 'ffmpeg:checkHap',
  ffmpegProbe: 'ffmpeg:probe',
  hapEnqueue: 'hap:enqueue',
  hapList: 'hap:list',
  hapCancel: 'hap:cancel',
  hapCancelAll: 'hap:cancelAll',
  hapClearFinished: 'hap:clearFinished',
  hapUpdate: 'hap:update', // Event: HapJob
  // Manuals
  manualsImport: 'manuals:import',
  manualsList: 'manuals:list',
  manualsSearch: 'manuals:search',
  manualsGet: 'manuals:get',
  manualsBytes: 'manuals:bytes',
  manualsUpdate: 'manuals:update',
  manualsDelete: 'manuals:delete',
  manualsImportProgress: 'manuals:importProgress', // Event: ImportProgress
  // Testbildgenerator
  screenList: 'screen:list',
  patternOpen: 'pattern:open',
  patternUpdate: 'pattern:update',
  patternClose: 'pattern:close',
  patternCurrent: 'pattern:current',
  patternRender: 'pattern:render', // Event: PatternConfig (main -> Ausgabefenster)
  patternSavePng: 'pattern:savePng',
  patternExportVideo: 'pattern:exportVideo',
  patternVideoProgress: 'pattern:videoProgress' // Event: PatternVideoProgress
} as const

export type ChannelName = (typeof Channels)[keyof typeof Channels]

/** Custom-Protocol, ueber das der renderer importierte PDFs laden darf. */
export const MANUAL_PROTOCOL = 'manual'

/** Die komplette, getypte Bruecke window.api. */
export interface ToolboxApi {
  selectPaths(options: SelectPathsOptions): Promise<string[]>
  openPath(target: string): Promise<void>
  showItemInFolder(target: string): Promise<void>
  getSettings(): Promise<AppSettings>
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  /** Pfad zur Debug-Logdatei (zum Anzeigen/Mitschicken). */
  getLogPath(): Promise<string>

  ffmpeg: {
    checkHap(): Promise<HapCheckResult>
    probe(path: string): Promise<ProbeResult>
  }

  hap: {
    enqueue(req: HapEnqueueRequest): Promise<{ jobIds: string[] }>
    list(): Promise<HapJob[]>
    cancel(id: string): Promise<void>
    cancelAll(): Promise<void>
    clearFinished(): Promise<void>
    /** Live-Updates einzelner Jobs. Liefert eine Cleanup-Funktion. */
    onUpdate(cb: (job: HapJob) => void): () => void
  }

  manuals: {
    import(paths: string[]): Promise<ImportSummary>
    list(query?: string): Promise<ManualMeta[]>
    search(query: string): Promise<ManualSearchHit[]>
    get(id: number): Promise<ManualDetail>
    /** Roh-Bytes des gespeicherten PDFs (fuer den In-App-Viewer). */
    bytes(id: number): Promise<Uint8Array>
    update(id: number, patch: ManualPatch): Promise<ManualMeta>
    delete(id: number): Promise<void>
    /** Fortschritt waehrend des Imports. Liefert eine Cleanup-Funktion. */
    onImportProgress(cb: (p: ImportProgress) => void): () => void
  }

  screen: {
    list(): Promise<DisplayInfo[]>
  }

  patterns: {
    /** Vollbild-Ausgabefenster auf dem gewaehlten Monitor oeffnen/aktualisieren. */
    open(config: PatternConfig, displayId: number): Promise<void>
    update(config: PatternConfig): Promise<void>
    close(): Promise<void>
    /** Aktuelle Config (das Ausgabefenster holt sie beim Start). */
    current(): Promise<PatternConfig | null>
    /** Render-Anweisung an das Ausgabefenster. Liefert eine Cleanup-Funktion. */
    onRender(cb: (config: PatternConfig) => void): () => void
    /** PNG speichern (Save-Dialog im main). Liefert den Pfad oder null. */
    savePng(bytes: Uint8Array, suggestedName: string): Promise<string | null>
    /** Standbild als Video-Loop exportieren (ffmpeg). Liefert den Pfad oder null. */
    exportVideo(req: PatternVideoRequest): Promise<string | null>
    onVideoProgress(cb: (p: PatternVideoProgress) => void): () => void
  }
}
