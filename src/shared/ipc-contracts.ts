// IPC-Kanalnamen + die typisierte API-Form, die preload via contextBridge
// als window.api bereitstellt. Von main (Handler) und renderer (Aufruf) importiert.

import type {
  AppSettings,
  ColorLoopRequest,
  ConvertJob,
  DisplayInfo,
  HapCheckResult,
  HapEnqueueRequest,
  HapJob,
  ImportProgress,
  ImportSummary,
  ManualDetail,
  InDocHit,
  ManualMeta,
  ManualPatch,
  ManualSearchHit,
  MediaItem,
  PatternConfig,
  PatternVideoProgress,
  PatternVideoRequest,
  PlayerCommand,
  PlayerEncoderStatus,
  PlayerImportRequest,
  PlayerState,
  PlayerTick,
  ProbeResult,
  RemoteStatus,
  SelectPathsOptions,
  StageTimerState,
  StageTimerTick,
  TimerCommand,
  WallResolution,
  JingleImportResult,
  JingleRemoteCommand,
  JingleRemoteSnapshot,
  YtEnqueueRequest,
  YtJob,
  YtToolStatus
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
  manualsSearchInDoc: 'manuals:searchInDoc',
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
  patternExportColorLoop: 'pattern:exportColorLoop',
  patternVideoProgress: 'pattern:videoProgress', // Event: PatternVideoProgress
  // Video-Player – Bibliothek & Konvertierung
  playerEncoders: 'player:encoders',
  playerImport: 'player:import',
  playerConvertList: 'player:convertList',
  playerConvertCancel: 'player:convertCancel',
  playerConvertClear: 'player:convertClearFinished',
  playerConvertUpdate: 'player:convertUpdate', // Event: ConvertJob
  playerLibraryList: 'player:libraryList',
  playerLibraryDelete: 'player:libraryDelete',
  playerLibraryClear: 'player:libraryClear',
  playerReconvert: 'player:reconvert',
  playerPickIdleMedia: 'player:pickIdleMedia',
  playerMediaDir: 'player:mediaDir',
  playerLibraryChanged: 'player:libraryChanged', // Event (kein Payload)
  // Video-Player – Wiedergabe & Ausgabe
  playerGetState: 'player:getState',
  playerCommand: 'player:command',
  playerReport: 'player:report', // Ausgabefenster -> main (Position/Dauer)
  playerOpenOutput: 'player:openOutput',
  playerCloseOutput: 'player:closeOutput',
  playerState: 'player:state', // Event: PlayerState (main -> alle)
  playerTick: 'player:tick', // Event: PlayerTick (main -> alle, häufig)
  // Video-Player – Fernsteuerung (eingebetteter Webserver)
  playerRemoteStatus: 'player:remoteStatus',
  playerRemoteStart: 'player:remoteStart',
  playerRemoteStop: 'player:remoteStop',
  playerRemoteChanged: 'player:remoteChanged', // Event: RemoteStatus
  // Stage-Timer & Uhr
  timerGetState: 'timer:getState',
  timerCommand: 'timer:command',
  timerOpenOutput: 'timer:openOutput',
  timerCloseOutput: 'timer:closeOutput',
  timerState: 'timer:state', // Event: StageTimerState (main -> alle)
  timerTick: 'timer:tick', // Event: StageTimerTick (main -> alle, häufig)
  // Fenster
  windowOpenTool: 'window:openTool', // Tool in eigenem Fenster öffnen
  // Werkzeuge
  utilExportPdf: 'util:exportPdf', // HTML -> PDF (Save-Dialog), z.B. LED-Wall-Doku
  // Jingle-Player
  jingleImport: 'jingle:import',
  jingleCleanup: 'jingle:cleanup',
  // Jingle-Fernsteuerung
  jinglePublish: 'jingle:publish', // Renderer -> main: Schnappschuss der Bank
  jingleRemoteCommand: 'jingle:remoteCommand', // main -> Renderer: Trigger/Stopp
  jingleRemoteStatus: 'jingle:remoteStatus',
  jingleRemoteStart: 'jingle:remoteStart',
  jingleRemoteStop: 'jingle:remoteStop',
  jingleRemoteChanged: 'jingle:remoteChanged', // Event: RemoteStatus
  // YouTube-Downloader (yt-dlp)
  ytStatus: 'yt:status',
  ytUpdate: 'yt:update', // yt-dlp-Binary herunterladen/aktualisieren
  ytEnqueue: 'yt:enqueue',
  ytList: 'yt:list',
  ytCancel: 'yt:cancel',
  ytClearFinished: 'yt:clearFinished',
  ytJobUpdate: 'yt:jobUpdate' // Event: YtJob
} as const

export type ChannelName = (typeof Channels)[keyof typeof Channels]

/** Custom-Protocol, ueber das der renderer importierte PDFs laden darf. */
export const MANUAL_PROTOCOL = 'manual'

/** Custom-Protocol fuer konvertierte Player-Medien (Video/Bild + Thumbnails).
 *  Unterstuetzt Range-Requests -> HTML5-`<video>` kann seeken/streamen. */
export const MEDIA_PROTOCOL = 'media'

/** Custom-Protocol fuer Jingle-Audiodateien (userData/jingles). */
export const JINGLE_PROTOCOL = 'jingle'

/** Die komplette, getypte Bruecke window.api. */
export interface ToolboxApi {
  selectPaths(options: SelectPathsOptions): Promise<string[]>
  openPath(target: string): Promise<void>
  showItemInFolder(target: string): Promise<void>
  getSettings(): Promise<AppSettings>
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  /** Pfad zur Debug-Logdatei (zum Anzeigen/Mitschicken). */
  getLogPath(): Promise<string>
  /** Absoluter Pfad einer per Drag&Drop fallengelassenen Datei (Electron webUtils). */
  pathForFile(file: File): string
  /** Öffnet ein Tool in einem eigenen Fenster (parallele Nutzung). */
  openToolWindow(id: string): Promise<void>

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
    /** Volltextsuche innerhalb eines geoeffneten PDFs. */
    searchInDoc(manualId: number, query: string): Promise<InDocHit[]>
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
    /** Pixelcheck-Loop (zyklische Vollfarben) als Video exportieren. */
    exportColorLoop(req: ColorLoopRequest): Promise<string | null>
    onVideoProgress(cb: (p: PatternVideoProgress) => void): () => void
  }

  player: {
    /** Verfügbare (geprüfte) Encoder + ffmpeg-Status. */
    encoders(): Promise<PlayerEncoderStatus>
    /** Medien importieren + auf Wand-Auflösung konvertieren (Queue). */
    import(req: PlayerImportRequest): Promise<{ jobIds: string[] }>
    convertList(): Promise<ConvertJob[]>
    convertCancel(id: string): Promise<void>
    convertClearFinished(): Promise<void>
    onConvertUpdate(cb: (job: ConvertJob) => void): () => void
    /** Bibliothek (alle abspielbereiten Medien). */
    libraryList(): Promise<MediaItem[]>
    libraryDelete(id: string): Promise<void>
    libraryClear(): Promise<void>
    /** Medien neu auf die angegebene Wand-Auflösung konvertieren (gleiche id). */
    reconvert(mediaIds: string[], wall: WallResolution): Promise<{ jobIds: string[]; skipped: number }>
    /** Datei-Dialog für ein eigenes Idle-Bild/-Video; kopiert es in den Medienordner. */
    pickIdleMedia(): Promise<{ url: string; kind: 'image' | 'video' } | null>
    /** Speicherort der konvertierten Medien (userData/player-media). */
    mediaDir(): Promise<string>
    onLibraryChanged(cb: () => void): () => void
    /** Aktueller Player-Zustand. */
    getState(): Promise<PlayerState>
    command(cmd: PlayerCommand): Promise<void>
    /** Vom Ausgabefenster: aktuelle Position/Dauer melden. */
    report(positionSec: number, durationSec: number): Promise<void>
    openOutput(displayId: number): Promise<void>
    closeOutput(): Promise<void>
    onState(cb: (state: PlayerState) => void): () => void
    onTick(cb: (tick: PlayerTick) => void): () => void
    /** Status der Tablet-Fernsteuerung (Webserver). */
    remoteStatus(): Promise<RemoteStatus>
    remoteStart(port: number): Promise<RemoteStatus>
    remoteStop(): Promise<RemoteStatus>
    onRemoteChanged(cb: (status: RemoteStatus) => void): () => void
  }

  timer: {
    /** Aktueller Timer-Zustand (Steuer-UI und Ausgabefenster holen ihn beim Start). */
    getState(): Promise<StageTimerState>
    command(cmd: TimerCommand): Promise<void>
    /** Vollbild-Timeranzeige auf dem gewählten Monitor öffnen/schließen. */
    openOutput(displayId: number): Promise<void>
    closeOutput(): Promise<void>
    onState(cb: (state: StageTimerState) => void): () => void
    onTick(cb: (tick: StageTimerTick) => void): () => void
  }

  util: {
    /** Fertiges HTML als PDF speichern (verstecktes Fenster + printToPDF).
     *  Liefert den gewählten Pfad oder null (abgebrochen). */
    exportPdf(html: string, suggestedName: string, landscape?: boolean): Promise<string | null>
  }

  jingles: {
    /** Audiodateien nach userData/jingles kopieren; liefert die sicheren Namen. */
    import(paths: string[]): Promise<JingleImportResult[]>
    /** Nicht mehr belegte Dateien aufräumen (alles außer `keep`). */
    cleanup(keep: string[]): Promise<void>
    /** Aktuellen Bank-/Wiedergabe-Schnappschuss an den Fernsteuer-Server geben. */
    publish(snapshot: JingleRemoteSnapshot): Promise<void>
    /** Trigger/Stopp-Befehle vom Handy (main -> Renderer). Liefert Cleanup. */
    onRemoteCommand(cb: (cmd: JingleRemoteCommand) => void): () => void
    remoteStatus(): Promise<RemoteStatus>
    remoteStart(port: number): Promise<RemoteStatus>
    remoteStop(): Promise<RemoteStatus>
    onRemoteChanged(cb: (status: RemoteStatus) => void): () => void
  }

  youtube: {
    /** yt-dlp-Status (vorhanden? Version? ffmpeg?). */
    status(): Promise<YtToolStatus>
    /** yt-dlp-Binary herunterladen/aktualisieren. Liefert den neuen Status. */
    updateTool(): Promise<YtToolStatus>
    enqueue(req: YtEnqueueRequest): Promise<{ jobId: string }>
    list(): Promise<YtJob[]>
    cancel(id: string): Promise<void>
    clearFinished(): Promise<void>
    onJobUpdate(cb: (job: YtJob) => void): () => void
  }
}
