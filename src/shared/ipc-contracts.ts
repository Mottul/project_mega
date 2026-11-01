// Der IPC-Vertrag: EINE Tabelle aller Kanäle zwischen Renderer und main. Aus ihr entstehen die API
// window.api (ToolboxApi, gebaut in preload/baueApi.ts) und die Typen der Gegenseite: handle/on in
// main/ipc/kanal.ts, broadcast in services/broadcast.ts. Neuer Kanal = Eintrag hier + Handler.

import type {
  AppSettings,
  SettingsPatch,
  ColorLoopRequest,
  ConfirmOptions,
  ChooseOptions,
  ProjectOpenResult,
  ProjectSaveRequest,
  ProjectSaveResult,
  ProjectSaveTarget,
  ProjectsDirInfo,
  NotifyOptions,
  BausteinExport,
  BausteinImport,
  OnlinePublish,
  EigenerBaustein,
  FotoImport,
  PdfExportResult,
  PdfPageOptions,
  ConvertJob,
  AusgabeZiel,
  DisplayInfo,
  FitMode,
  ConvertCapabilities,
  ConverterEncoderStatus,
  ConverterEnqueueRequest,
  ConverterJob,
  ConvertFormat,
  VgenEnqueueRequest,
  VgenJob,
  VgenPreviewOutcome,
  VgenPreviewProgress,
  VgenPreviewRequest,
  ImportProgress,
  MediaCollectResult,
  MediaInfoResult,
  MediaProbeOptions,
  ImportSummary,
  ManualDetail,
  InDocHit,
  ManualMeta,
  ManualPatch,
  ManualSearchHit,
  MediaItem,
  NetDevice,
  NetInterface,
  NetInterfaceNames,
  NetScanProgress,
  OscFeedback,
  OscLogEntry,
  NovastarStatus,
  OscMessage,
  OscRemoteCommand,
  OscRemoteSnapshot,
  OscSettings,
  OscStatus,
  PatternConfig,
  PatternVideoProgress,
  PatternVideoRequest,
  PlayerCommand,
  PlayerEncoderStatus,
  PlayerImportRequest,
  NdiAudioChunk,
  PlayerNdiConfig,
  PlayerNdiStatus,
  PlayerState,
  PlayerTick,
  ProbeResult,
  FfmpegToolStatus,
  RemoteAppStatus,
  RemoteStatus,
  SelectPathsOptions,
  StageTimerState,
  StageTimerTick,
  TimerCommand,
  TimerNdiConfig,
  TimerNdiStatus,
  WallResolution,
  JingleImportResult,
  JingleRemoteCommand,
  JingleRemoteSnapshot,
  YtEnqueueRequest,
  YtJob,
  YtProbeResult,
  YtToolStatus
} from './types'
import type { AtemStatus, AtemView } from './atem'

/** Signatur eines Kanals; nur für die Typen, zur Laufzeit gibt es sie nicht. */
export type KanalFn = (...args: never[]) => unknown

/** Renderer fragt, main antwortet. F wie die API-Methode, nur das Ergebnis ohne Promise. */
export interface Anfrage<F extends KanalFn> {
  art: 'anfrage'
  kanal: string
  signatur?: F
}

/** Renderer meldet, ohne auf eine Antwort zu warten. F wie die API-Methode. */
export interface Einweg<F extends KanalFn> {
  art: 'einweg'
  kanal: string
  signatur?: F
}

/** main meldet an Fenster. F ist der Callback, den die API-Methode annimmt. */
export interface Ereignis<F extends KanalFn> {
  art: 'ereignis'
  kanal: string
  signatur?: F
}

export type Kanal = Anfrage<KanalFn> | Einweg<KanalFn> | Ereignis<KanalFn>

const anfrage = <F extends KanalFn = () => void>(kanal: string): Anfrage<F> => ({
  art: 'anfrage',
  kanal
})
const einweg = <F extends KanalFn = () => void>(kanal: string): Einweg<F> => ({
  art: 'einweg',
  kanal
})
const ereignis = <F extends KanalFn = () => void>(kanal: string): Ereignis<F> => ({
  art: 'ereignis',
  kanal
})

/** Alle Kanäle, gegliedert wie window.api. */
export const Channels = {
  selectPaths: anfrage<(options: SelectPathsOptions) => string[]>('dialog:select'),
  /** Native Ja/Nein-Rückfrage (main-Prozess). Ersetzt window.confirm(), das
   *  danach die Tastatureingabe in Textfeldern lahmlegt. true = bestätigt. */
  confirm: anfrage<(options: ConfirmOptions) => boolean>('dialog:confirm'),
  /** Native Rückfrage mit 2–4 Antworten; liefert den Index des Knopfs (Esc = cancelId). */
  choose: anfrage<(options: ChooseOptions) => number>('dialog:choose'),
  /**
   * Werkzeug meldet, dass etwas läuft, das main nicht kennt (Ton im Fenster) – die Rückfrage beim
   * Beenden nennt es. Je Fenster; ein geschlossenes Fenster zählt nicht mehr.
   */
  setAktiv: einweg<(key: 'testton' | 'jingle', an: boolean) => void>('app:setAktiv'),
  /** Native Hinweis-Meldung (main-Prozess). Ersetzt window.alert() (gleicher
   *  Tastatur-Bug). */
  notify: anfrage<(options: NotifyOptions) => void>('dialog:notify'),
  openPath: anfrage<(target: string) => void>('shell:openPath'),
  showItemInFolder: anfrage<(target: string) => void>('shell:showItemInFolder'),
  getSettings: anfrage<() => AppSettings>('settings:get'),
  /** Nur die zu ändernden Felder schicken – auch in player/osc/… (wird feldweise
   *  zusammengeführt); Listen werden als Ganzes ersetzt. */
  setSettings: anfrage<(patch: SettingsPatch) => AppSettings>('settings:set'),
  /** Einstellungen wurden anderswo geändert (anderes Fenster, Handy, main). Liefert Cleanup. */
  onSettingsChanged: ereignis<(settings: AppSettings) => void>('settings:changed'),
  /** Pfad zur Debug-Logdatei (zum Anzeigen/Mitschicken). */
  getLogPath: anfrage<() => string>('app:logPath'),
  /** Öffnet ein Tool in einem eigenen Fenster (parallele Nutzung). */
  openToolWindow: anfrage<(id: string) => void>('window:openTool'),
  /**
   * Kleines Werkzeugfenster: gemessene Inhaltshöhe (Kopfleiste + Seite, CSS-px) melden – main
   * passt die Fensterhöhe an (Schrift je System, Kompaktmodus, Breite). Andere Fenster: nichts.
   */
  fitToolWindow: anfrage<(height: number) => void>('window:fitContent'),

  ffmpeg: {
    probe: anfrage<(path: string) => ProbeResult>('ffmpeg:probe'),
    /** Welches ffmpeg läuft (mitgeliefert/aktualisiert), liegt ein neuer Build bereit? */
    status: anfrage<() => FfmpegToolStatus>('ffmpeg:status'),
    /** Jetzt nach einem neueren Build suchen (mind. 7 Tage alt), laden, prüfen – gilt ab dem
     *  nächsten Start. */
    checkUpdate: anfrage<() => FfmpegToolStatus>('ffmpeg:checkUpdate'),
    /** Ab dem nächsten Start wieder das mitgelieferte ffmpeg (falls ein Build Ärger macht). */
    useBundled: anfrage<() => FfmpegToolStatus>('ffmpeg:useBundled'),
    onStatus: ereignis<(status: FfmpegToolStatus) => void>('ffmpeg:statusUpdate')
  },

  converter: {
    /** Was kann das gebündelte ffmpeg (Formate, HDR -> SDR)? */
    capabilities: anfrage<() => ConvertCapabilities>('converter:capabilities'),
    /** Geprüfte Encoder für H.264/H.265/ProRes (GPU-Probelauf; das erste Mal dauert's kurz). */
    encoders: anfrage<() => ConverterEncoderStatus>('converter:encoders'),
    enqueue: anfrage<(req: ConverterEnqueueRequest) => { jobIds: string[] }>('converter:enqueue'),
    list: anfrage<() => ConverterJob[]>('converter:list'),
    cancel: anfrage<(id: string) => void>('converter:cancel'),
    cancelAll: anfrage('converter:cancelAll'),
    clearFinished: anfrage('converter:clearFinished'),
    /** Live-Updates einzelner Aufträge. Liefert eine Cleanup-Funktion. */
    onUpdate: ereignis<(job: ConverterJob) => void>('converter:update')
  },

  videoGen: {
    /** Vorschaubild (media://vgen/…) einer Datei; Videos zum Zeitpunkt timeSec; Breite 320 (Kachel)
     *  oder 960 (Vorschau). null = nicht lesbar. */
    thumb:
      anfrage<(path: string, timeSec: number | null, width?: 320 | 960) => string | null>(
        'vgen:thumb'
      ),
    /** Speicherdialog für das Ergebnis (merkt sich den Ordner). null = abgebrochen. */
    pickOutput:
      anfrage<(format: ConvertFormat, suggestedName: string) => string | null>('vgen:pickOutput'),
    /** Projekt rechnen (wird im main feldweise geprüft); wirft bei ungültiger Eingabe. */
    enqueue: anfrage<(req: VgenEnqueueRequest) => { jobId: string }>('vgen:enqueue'),
    list: anfrage<() => VgenJob[]>('vgen:list'),
    cancel: anfrage<(id: string) => void>('vgen:cancel'),
    clearFinished: anfrage('vgen:clearFinished'),
    /** Zwischengespeicherte Stücke löschen (der nächste Lauf rechnet alles neu). */
    clearCache: anfrage('vgen:clearCache'),
    /** Live-Updates einzelner Aufträge. Liefert eine Cleanup-Funktion. */
    onUpdate: ereignis<(job: VgenJob) => void>('vgen:update'),
    /** „Vorschau rechnen“: kleiner Probelauf um ein Element, exakt wie das Ergebnis. Eine neue
     *  Anfrage bricht die laufende ab (die meldet dann canceled). */
    preview: anfrage<(req: VgenPreviewRequest) => VgenPreviewOutcome>('vgen:preview'),
    cancelPreview: anfrage('vgen:previewCancel'),
    onPreviewProgress: ereignis<(p: VgenPreviewProgress) => void>('vgen:previewProgress'),
    /** Abspielbare Adresse (media://vgen/src/…) einer Quelldatei für die Live-Vorschau – nur
     *  Videos, GIFs und Musik; null = nicht erlaubt oder nicht vorhanden. */
    source: anfrage<(path: string) => string | null>('vgen:source')
  },

  mediaInfo: {
    /** Eckdaten einer Datei (ffprobe). Wirft NICHT bei Datei-/Formatfehlern -> ok:false. */
    probe: anfrage<(path: string, opts?: MediaProbeOptions) => MediaInfoResult>('mediaInfo:probe'),
    /** ffprobe-Rohausgabe (formatiertes JSON) oder null. */
    raw: anfrage<(path: string) => string | null>('mediaInfo:raw'),
    /** Dateien/Ordner (rekursiv) zu Mediendateien auflösen. */
    collect: anfrage<(inputs: string[]) => MediaCollectResult>('mediaInfo:collect')
  },

  manuals: {
    import: anfrage<(paths: string[]) => ImportSummary>('manuals:import'),
    list: anfrage<(query?: string) => ManualMeta[]>('manuals:list'),
    search: anfrage<(query: string) => ManualSearchHit[]>('manuals:search'),
    /** Volltextsuche innerhalb eines geoeffneten PDFs. */
    searchInDoc: anfrage<(manualId: number, query: string) => InDocHit[]>('manuals:searchInDoc'),
    get: anfrage<(id: number) => ManualDetail>('manuals:get'),
    /** Roh-Bytes des gespeicherten PDFs (fuer den In-App-Viewer). */
    bytes: anfrage<(id: number) => Uint8Array>('manuals:bytes'),
    update: anfrage<(id: number, patch: ManualPatch) => ManualMeta>('manuals:update'),
    delete: anfrage<(id: number) => void>('manuals:delete'),
    /** Fortschritt waehrend des Imports. Liefert eine Cleanup-Funktion. */
    onImportProgress: ereignis<(p: ImportProgress) => void>('manuals:importProgress')
  },

  screen: {
    list: anfrage<() => DisplayInfo[]>('screen:list')
  },

  patterns: {
    /** Ausgabefenster öffnen (Vollbild auf dem Monitor oder als Fenster) bzw. dorthin wechseln. */
    open: anfrage<(config: PatternConfig, ziel: AusgabeZiel) => void>('pattern:open'),
    update: anfrage<(config: PatternConfig) => void>('pattern:update'),
    close: anfrage('pattern:close'),
    /** Aktuelle Config (das Ausgabefenster holt sie beim Start). */
    current: anfrage<() => PatternConfig | null>('pattern:current'),
    /** Ist das Ausgabefenster offen? (Ausgabe-Leiste, auch nach Esc im Ausgabefenster) */
    isOpen: anfrage<() => boolean>('pattern:isOpen'),
    onOutputChanged: ereignis<(open: boolean) => void>('pattern:outputChanged'),
    /** Render-Anweisung an das Ausgabefenster. Liefert eine Cleanup-Funktion. */
    onRender: ereignis<(config: PatternConfig) => void>('pattern:render'),
    /** PNG speichern (Save-Dialog im main). Liefert den Pfad oder null. */
    savePng:
      anfrage<(bytes: Uint8Array, suggestedName: string) => string | null>('pattern:savePng'),
    /** Standbild als Video-Loop exportieren (ffmpeg). Liefert den Pfad oder null. */
    exportVideo: anfrage<(req: PatternVideoRequest) => string | null>('pattern:exportVideo'),
    /** Pixelcheck-Loop (zyklische Vollfarben) als Video exportieren. */
    exportColorLoop: anfrage<(req: ColorLoopRequest) => string | null>('pattern:exportColorLoop'),
    onVideoProgress: ereignis<(p: PatternVideoProgress) => void>('pattern:videoProgress')
  },

  player: {
    /** Verfügbare (geprüfte) Encoder + ffmpeg-Status. */
    encoders: anfrage<() => PlayerEncoderStatus>('player:encoders'),
    /** Medien importieren + auf Wand-Auflösung konvertieren (Queue). */
    import: anfrage<(req: PlayerImportRequest) => { jobIds: string[] }>('player:import'),
    convertList: anfrage<() => ConvertJob[]>('player:convertList'),
    convertCancel: anfrage<(id: string) => void>('player:convertCancel'),
    convertClearFinished: anfrage('player:convertClearFinished'),
    onConvertUpdate: ereignis<(job: ConvertJob) => void>('player:convertUpdate'),
    /** Bibliothek (alle abspielbereiten Medien). */
    libraryList: anfrage<() => MediaItem[]>('player:libraryList'),
    libraryDelete: anfrage<(id: string) => void>('player:libraryDelete'),
    libraryClear: anfrage('player:libraryClear'),
    /** Medien neu konvertieren (gleiche id), aus der ORIGINAL-Quelle. `fit`
     *  überschreibt die Aufbereitung (sonst bleibt der gespeicherte Fit-Modus);
     *  Blur-Stärke/Abdunkelung kommen immer aus den aktuellen Einstellungen. */
    reconvert:
      anfrage<
        (
          mediaIds: string[],
          wall: WallResolution,
          fit?: FitMode
        ) => { jobIds: string[]; skipped: number }
      >('player:reconvert'),
    /** Datei-Dialog für ein eigenes Idle-Bild/-Video; kopiert es in den Medienordner. */
    pickIdleMedia:
      anfrage<() => { url: string; kind: 'image' | 'video' } | null>('player:pickIdleMedia'),
    /** Speicherort der konvertierten Medien (userData/player-media). */
    mediaDir: anfrage<() => string>('player:mediaDir'),
    onLibraryChanged: ereignis('player:libraryChanged'),
    /** Aktueller Player-Zustand. */
    getState: anfrage<() => PlayerState>('player:getState'),
    command: anfrage<(cmd: PlayerCommand) => void>('player:command'),
    /** Vom Ausgabefenster: aktuelle Position/Dauer melden. */
    report: anfrage<(positionSec: number, durationSec: number) => void>('player:report'),
    /** Ausgabe öffnen (Vollbild auf dem Monitor oder als Fenster); das Ziel wird gemerkt. */
    openOutput: anfrage<(ziel: AusgabeZiel) => void>('player:openOutput'),
    closeOutput: anfrage('player:closeOutput'),
    onState: ereignis<(state: PlayerState) => void>('player:state'),
    onTick: ereignis<(tick: PlayerTick) => void>('player:tick'),
    /** Status der Tablet-Fernsteuerung (Webserver). */
    remoteStatus: anfrage<() => RemoteStatus>('player:remoteStatus'),
    remoteStart: anfrage<(port: number) => RemoteStatus>('player:remoteStart'),
    remoteStop: anfrage<() => RemoteStatus>('player:remoteStop'),
    onRemoteChanged: ereignis<(status: RemoteStatus) => void>('player:remoteChanged'),
    /** NDI-Ausgabe (experimentell): Wiedergabe als NDI-Quelle ins Netz senden. */
    ndiStart: anfrage<(config: PlayerNdiConfig) => PlayerNdiStatus>('player:ndiStart'),
    ndiStop: anfrage<() => PlayerNdiStatus>('player:ndiStop'),
    ndiStatus: anfrage<() => PlayerNdiStatus>('player:ndiStatus'),
    onNdiChanged: ereignis<(status: PlayerNdiStatus) => void>('player:ndiChanged'),
    /** Vom NDI-Spiegelfenster: PCM-Block des Audio-Taps (fire-and-forget). */
    ndiAudio: einweg<(chunk: NdiAudioChunk) => void>('player:ndiAudio'),
    /** Vom NDI-Spiegelfenster: Fehler beim Aufbau des Audio-Taps melden. */
    ndiTapError: einweg<(message: string) => void>('player:ndiTapError')
  },

  remoteApp: {
    /** Startseite aller Fernsteuerungen: Adresse + welche Fernsteuerungen laufen. */
    status: anfrage<() => RemoteAppStatus>('remoteApp:status'),
    onChanged: ereignis<(status: RemoteAppStatus) => void>('remoteApp:changed')
  },

  timer: {
    /** Aktueller Timer-Zustand (Steuer-UI und Ausgabefenster holen ihn beim Start). */
    getState: anfrage<() => StageTimerState>('timer:getState'),
    command: anfrage<(cmd: TimerCommand) => void>('timer:command'),
    /** Timeranzeige öffnen (Vollbild auf dem Monitor oder als Fenster) bzw. schließen. */
    openOutput: anfrage<(ziel: AusgabeZiel) => void>('timer:openOutput'),
    closeOutput: anfrage('timer:closeOutput'),
    onState: ereignis<(state: StageTimerState) => void>('timer:state'),
    onTick: ereignis<(tick: StageTimerTick) => void>('timer:tick'),
    /** NDI-Ausgabe (experimentell): Timer-Anzeige als NDI-Quelle ins Netz senden. */
    ndiStart: anfrage<(config: TimerNdiConfig) => TimerNdiStatus>('timer:ndiStart'),
    ndiStop: anfrage<() => TimerNdiStatus>('timer:ndiStop'),
    ndiStatus: anfrage<() => TimerNdiStatus>('timer:ndiStatus'),
    onNdiChanged: ereignis<(status: TimerNdiStatus) => void>('timer:ndiChanged'),
    /** Fernsteuerung per Handy/Tablet (Webserver). */
    remoteStatus: anfrage<() => RemoteStatus>('timer:remoteStatus'),
    remoteStart: anfrage<(port: number) => RemoteStatus>('timer:remoteStart'),
    remoteStop: anfrage<() => RemoteStatus>('timer:remoteStop'),
    onRemoteChanged: ereignis<(status: RemoteStatus) => void>('timer:remoteChanged')
  },

  util: {
    /** Fertiges HTML als PDF speichern (verstecktes Fenster + printToPDF, services/pdf).
     *  Liefert den gewählten Pfad oder null (abgebrochen). */
    exportPdf:
      anfrage<
        (html: string, suggestedName: string, page?: PdfPageOptions) => PdfExportResult | null
      >('util:exportPdf'),
    /** Dasselbe PDF wie exportPdf, nur ohne Speichern – für die Seitenansicht der Vorschau, die
     *  die echten Umbrüche zeigt. Bytes wie manuals.bytes, weil pdf.js sie im Renderer braucht. */
    renderPdf: anfrage<(html: string, page?: PdfPageOptions) => Uint8Array>('util:renderPdf'),
    /** Eigenständige HTML-Datei speichern (Fotos als data:-URLs eingesetzt, Speichern-Dialog) –
     *  zum Verschicken, sie lädt nichts nach. Liefert den Pfad oder null (abgebrochen). */
    exportHtml: anfrage<(html: string, suggestedName: string) => string | null>('util:exportHtml'),
    /** Text (z.B. JSON) über einen Speichern-Dialog in eine Datei schreiben.
     *  Liefert den gewählten Pfad oder null (abgebrochen). Ohne filters: JSON. */
    saveText:
      anfrage<
        (
          text: string,
          suggestedName: string,
          filters?: { name: string; extensions: string[] }[]
        ) => string | null
      >('util:saveText'),
    /** Textdatei über einen Öffnen-Dialog einlesen. Liefert den Inhalt oder null. */
    openText: anfrage<() => string | null>('util:openText'),
    /** Eine Zeile ins Debug-Log des main-Prozesses schreiben (Feld-Diagnose von
     *  Renderer-Fehlern, wenn keine DevTools offen sind). */
    log: einweg<(message: string) => void>('util:log')
  },

  /** Projektdateien: Jedes Werkzeug liest und schreibt nur seinen Abschnitt (shared/projectFile). */
  projects: {
    /** Standard-Speicherort (aufgelöst; der Renderer kennt den Dokumente-Ordner nicht). */
    dirInfo: anfrage<() => ProjectsDirInfo>('projects:dirInfo'),
    /** Öffnen: ohne `path` über den Dialog (null = abgebrochen), mit `path` aus „Zuletzt
     *  geöffnet“. Liefert alle Abschnitte und den angefragten. */
    open: anfrage<(section: string, path?: string) => ProjectOpenResult | null>('projects:open'),
    /** „Speichern unter“: Dialog (fresh = im Standard-Projektordner beginnen) und Blick in die
     *  gewählte Datei; geschrieben wird erst mit save(). null = abgebrochen. */
    chooseTarget:
      anfrage<(section: string, suggestedName: string, fresh: boolean) => ProjectSaveTarget | null>(
        'projects:chooseTarget'
      ),
    /** Nur den eigenen Abschnitt schreiben (Konflikt über baseSha, siehe ProjectSaveRequest). */
    save: anfrage<(request: ProjectSaveRequest) => ProjectSaveResult>('projects:save'),
    /** Nur lesen, ohne Binden und ohne „Zuletzt geöffnet“ – einen Abschnitt derselben Datei
     *  (die Anleitung liest die LED-Wall-Planung). null = ungültige Anfrage. */
    peek: anfrage<(section: string, path: string) => ProjectOpenResult | null>('projects:peek')
  },

  /** Fotos für Projektdateien: liegen im main, der Renderer kennt nur Hashes (shared/fotos). */
  fotos: {
    /** Bilder über den Dialog einfügen (JPG/PNG, mehrere); null = abgebrochen. */
    pick: anfrage<() => FotoImport[] | null>('fotos:pick')
  },

  /** Eigene Bausteine des Mini-Manuals: eine Datei je Baustein, später im geteilten Ordner. */
  bausteine: {
    list: anfrage<() => EigenerBaustein[]>('bausteine:list'),
    /** anlegen oder ersetzen (gleiche id); main setzt Zeit, Bearbeiter und Version */
    save: anfrage<
      (
        b: Pick<EigenerBaustein, 'id' | 'art' | 'titel' | 'kapitel' | 'daten'>
      ) => EigenerBaustein | null
    >('bausteine:save'),
    remove: anfrage<(id: string) => boolean>('bausteine:remove'),
    /**
     * Zum Weitergeben in eine Datei (Speichern-Dialog im main). Nur Kennungen gehen hinüber –
     * main schreibt, was in seiner Ablage steht. null = abgebrochen.
     */
    export: anfrage<(ids: string[]) => BausteinExport | null>('bausteine:export'),
    /**
     * Datei(en) eines Kollegen einlesen (Öffnen-Dialog im main): neu, neuere Version ersetzt,
     * gleicher Name mit „(2)“ – nie still überschreiben. null = abgebrochen; je Datei ein Ergebnis.
     */
    import: anfrage<() => BausteinImport[] | null>('bausteine:import')
  },

  /** Online-Ablage der Handy-Fassung (Ordner und Adresse in den Einstellungen, App-Menü) */
  online: {
    /**
     * HTML (Fotos setzt main ein) als index.html in einen Ordner der Ablage schreiben. `ordner`:
     * der bisherige der Anleitung (gleiche Adresse, der QR-Code bleibt gültig) oder null = neu
     * aus `name` und Zufall, nicht erratbar.
     */
    publish:
      anfrage<(html: string, ordner: string | null, name: string) => OnlinePublish>(
        'online:publish'
      )
  },

  jingles: {
    /** Audiodateien nach userData/jingles kopieren; liefert die sicheren Namen. */
    import: anfrage<(paths: string[]) => JingleImportResult[]>('jingle:import'),
    /** Nicht mehr belegte Dateien aufräumen (alles außer `keep`). */
    cleanup: anfrage<(keep: string[]) => void>('jingle:cleanup'),
    /** Roh-Bytes eines Jingles (für die Waveform). null, wenn nicht gefunden. */
    bytes: anfrage<(storedName: string) => Uint8Array | null>('jingle:bytes'),
    /** Aktuellen Bank-/Wiedergabe-Schnappschuss an den Fernsteuer-Server geben. */
    publish: anfrage<(snapshot: JingleRemoteSnapshot) => void>('jingle:publish'),
    /** Trigger/Stopp-Befehle vom Handy (main -> Renderer). Liefert Cleanup. */
    onRemoteCommand: ereignis<(cmd: JingleRemoteCommand) => void>('jingle:remoteCommand'),
    remoteStatus: anfrage<() => RemoteStatus>('jingle:remoteStatus'),
    remoteStart: anfrage<(port: number) => RemoteStatus>('jingle:remoteStart'),
    remoteStop: anfrage<() => RemoteStatus>('jingle:remoteStop'),
    onRemoteChanged: ereignis<(status: RemoteStatus) => void>('jingle:remoteChanged')
  },

  osc: {
    /** Eine OSC-Nachricht an host:outPort senden. */
    send: anfrage<(msg: OscMessage) => void>('osc:send'),
    /** Mehrere Nachrichten senden (z.B. X+Y eines Pads). */
    sendMany: anfrage<(msgs: OscMessage[]) => void>('osc:sendMany'),
    /** Aktueller Verbindungs-/Zählerstatus. */
    status: anfrage<() => OscStatus>('osc:status'),
    /** Aktuelle OSC-Einstellungen (Host/Ports/Feedback). */
    config: anfrage<() => OscSettings>('osc:config'),
    /** Einstellungen ändern (persistiert + bindet den Feedback-Socket neu). */
    setConfig: anfrage<(patch: Partial<OscSettings>) => OscStatus>('osc:configSet'),
    /** Eingehende OSC-Pakete (Feedback). Liefert eine Cleanup-Funktion. */
    onFeedback: ereignis<(fb: OscFeedback) => void>('osc:feedback'),
    /** Statusänderungen (Fehler, Feedback-Socket gebunden). Liefert Cleanup. */
    onStatus: ereignis<(status: OscStatus) => void>('osc:statusChanged'),
    /** Schnappschuss der Oberfläche an den Fernsteuer-Server. */
    publish: anfrage<(snapshot: OscRemoteSnapshot) => void>('osc:publish'),
    /** OSC-Monitor in einem eigenen Fenster öffnen. */
    openMonitor: anfrage('window:openOscMonitor'),
    /** Aktuelles Aktivitäts-Log an etwaige Monitor-Fenster spiegeln. */
    publishMonitor: anfrage<(entries: OscLogEntry[]) => void>('osc:monitorPublish'),
    /** Gespiegeltes Log empfangen (im Monitor-Fenster). Liefert Cleanup. */
    onMonitor: ereignis<(entries: OscLogEntry[]) => void>('osc:monitorLog'),
    /** Steuerbefehle vom Handy/Tablet. Liefert Cleanup. */
    onRemoteCommand: ereignis<(cmd: OscRemoteCommand) => void>('osc:remoteCommand'),
    /** Aktueller Status des Fernsteuer-Servers. */
    remoteStatus: anfrage<() => RemoteStatus>('osc:remoteStatus'),
    /** Fernsteuer-Server (eingebetteter Webserver) starten. */
    remoteStart: anfrage<(port: number) => RemoteStatus>('osc:remoteStart'),
    /** Fernsteuer-Server stoppen. */
    remoteStop: anfrage<() => RemoteStatus>('osc:remoteStop'),
    /** Statusänderungen des Fernsteuer-Servers. Liefert Cleanup. */
    onRemoteChanged: ereignis<(status: RemoteStatus) => void>('osc:remoteChanged')
  },

  novastar: {
    /** Mit einem NovaStar-Prozessor verbinden (TCP, Standard-Port 5200). */
    connect: anfrage<(host: string, port: number) => NovastarStatus>('novastar:connect'),
    /** Verbindung trennen. */
    disconnect: anfrage<() => NovastarStatus>('novastar:disconnect'),
    /** Aktueller Verbindungsstatus. */
    status: anfrage<() => NovastarStatus>('novastar:status'),
    /** Statusänderungen. Liefert Cleanup. */
    onStatus: ereignis<(s: NovastarStatus) => void>('novastar:statusChanged'),
    /** Bild-Helligkeit setzen (Prozent 0..100). */
    brightness: anfrage<(pct: number) => void>('novastar:brightness'),
    /** Empfangskarten schwarz schalten (echter Blackout) / zurück auf Normalbild. */
    blackout: anfrage<(on: boolean) => void>('novastar:blackout'),
    /** Bild einfrieren / auftauen. */
    freeze: anfrage<(on: boolean) => void>('novastar:freeze'),
    /** Preset/Szene 1..26 abrufen. */
    preset: anfrage<(n: number) => void>('novastar:preset'),
    /** Roh-Befehl als Hex senden; addChecksum ergänzt Prüfsumme automatisch. */
    raw: anfrage<(hex: string, addChecksum: boolean) => void>('novastar:raw')
  },

  atem: {
    /** Zustand der einen Verbindung im main */
    status: anfrage<() => AtemStatus>('atem:status'),
    /** Mit Mischer oder Probebetrieb verbinden; das Ziel prüft der Dienst (`AtemZiel`). */
    connect: anfrage<(ziel: unknown) => AtemStatus>('atem:connect'),
    /** Verbindung trennen. */
    disconnect: anfrage<() => AtemStatus>('atem:disconnect'),
    /** Letzte Ansicht, null ohne Verbindung. */
    view: anfrage<() => AtemView | null>('atem:view'),
    /** Befehl an den Mischer, Prüfung im Dienst (`AtemCommand`). Das Ergebnis kommt als Ansicht. */
    command: anfrage<(cmd: unknown) => void>('atem:command'),
    /** Statusänderungen. Liefert Cleanup. */
    onStatus: ereignis<(status: AtemStatus) => void>('atem:statusChanged'),
    /** Neue Ansicht, gedrosselt. Liefert Cleanup. */
    onView: ereignis<(view: AtemView) => void>('atem:viewChanged')
  },

  netscan: {
    /** Scannbare lokale IPv4-Interfaces auflisten. */
    interfaces: anfrage<() => NetInterface[]>('netscan:interfaces'),
    /** Sprechende Namen dazu; eigener Kanal, weil das Lesen unter Windows Sekunden dauert. */
    interfaceNames: anfrage<() => NetInterfaceNames>('netscan:interfaceNames'),
    /** Scan über das Subnetz des gewählten Interfaces starten. */
    start: anfrage<(interfaceAddress: string) => NetScanProgress>('netscan:start'),
    /** Laufenden Scan abbrechen. */
    stop: anfrage<() => NetScanProgress>('netscan:stop'),
    /** Fortschritt (laufend/Phase/Zähler). Liefert Cleanup. */
    onProgress: ereignis<(p: NetScanProgress) => void>('netscan:progress'),
    /** Gefundenes/aktualisiertes Gerät (Upsert nach IP). Liefert Cleanup. */
    onDevice: ereignis<(d: NetDevice) => void>('netscan:device')
  },

  youtube: {
    /** yt-dlp-Status (vorhanden? Version? ffmpeg?). */
    status: anfrage<() => YtToolStatus>('yt:status'),
    /** Auf die neueste Version prüfen und bei Bedarf laden. Neuer Status. */
    updateTool: anfrage<() => YtToolStatus>('yt:update'),
    /** Adresse analysieren: einzelnes Video oder Playlist samt Einträgen (flach). */
    probe: anfrage<(url: string) => YtProbeResult>('yt:probe'),
    enqueue: anfrage<(req: YtEnqueueRequest) => { jobId: string }>('yt:enqueue'),
    list: anfrage<() => YtJob[]>('yt:list'),
    cancel: anfrage<(id: string) => void>('yt:cancel'),
    clearFinished: anfrage('yt:clearFinished'),
    onJobUpdate: ereignis<(job: YtJob) => void>('yt:jobUpdate'),
    /** Statusänderungen (Startprüfung, Aktualisierung) beobachten. */
    onStatusUpdate: ereignis<(status: YtToolStatus) => void>('yt:statusUpdate')
  }
}

/** Die API, die eine Kanal-Tabelle ergibt. */
export type ApiAus<T> = {
  [K in keyof T]: T[K] extends Anfrage<infer F>
    ? (...args: Parameters<F>) => Promise<ReturnType<F>>
    : T[K] extends Einweg<infer F>
      ? F
      : T[K] extends Ereignis<infer F>
        ? (cb: F) => () => void
        : ApiAus<T[K]>
}

/** Die komplette, getypte Brücke window.api. */
export type ToolboxApi = ApiAus<typeof Channels> & {
  /** Absoluter Pfad einer per Drag&Drop fallengelassenen Datei (Electron webUtils). */
  pathForFile(file: File): string
}

/** Custom-Protocol, ueber das der renderer importierte PDFs laden darf. */
export const MANUAL_PROTOCOL = 'manual'

/** Custom-Protocol fuer konvertierte Player-Medien (Video/Bild + Thumbnails).
 *  Unterstuetzt Range-Requests -> HTML5-`<video>` kann seeken/streamen. */
export const MEDIA_PROTOCOL = 'media'

/** Custom-Protocol fuer Jingle-Audiodateien (userData/jingles). */
export const JINGLE_PROTOCOL = 'jingle'
