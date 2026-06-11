// Gemeinsame Domain-Typen fuer main, preload und renderer.
// Single source of truth -- nur hier werden Datenstrukturen definiert.

export type ToolCategoryId = 'media' | 'calc' | 'database' | 'utility'

/* ----------------------------- ffmpeg / HAP ----------------------------- */

export type HapFormat = 'hap' | 'hap_alpha' | 'hap_q'

// snappy = kleinere Dateien (Standard), none = schnelleres Encoding, groessere Dateien
export type HapCompressor = 'snappy' | 'none'

export interface HapCheckResult {
  available: boolean
  ffmpegFound: boolean
  version: string | null
  hapEncoders: string[] // z.B. ['hap']
  error?: string
}

export interface ProbeResult {
  path: string
  width: number | null
  height: number | null
  durationSec: number | null
  fps: number | null
  codec: string | null
  hasVideo: boolean
}

export type ChunksMode = { kind: 'auto' } | { kind: 'manual'; value: number }

export interface HapEnqueueRequest {
  inputs: string[] // Dateien und/oder Ordner (Ordner werden rekursiv durchsucht)
  format: HapFormat
  chunks: ChunksMode
  outputDir: string | null // null => neben der Quelldatei ablegen
  concurrency: number // 1 = sequentiell (Default)
  compressor: HapCompressor // snappy (kleiner) | none (schneller)
}

export type JobStatus = 'queued' | 'probing' | 'running' | 'done' | 'error' | 'canceled'

export interface HapJob {
  id: string
  inputPath: string
  outputPath: string
  format: HapFormat
  compressor: HapCompressor
  status: JobStatus
  progress: number // 0..1
  width: number | null
  height: number | null
  chunks: number | null
  durationSec: number | null
  error?: string
  createdAt: number
}

/* ------------------------------- Manuals -------------------------------- */

export interface ManualMeta {
  id: number
  title: string
  manufacturer: string | null
  category: string | null
  tags: string | null
  filename: string
  pageCount: number | null
  sizeBytes: number | null
  addedAt: number
}

export interface ManualDetail extends ManualMeta {
  fileUrl: string // manual://<hash>.pdf  (per custom protocol bereitgestellt)
}

export interface ManualSearchHit {
  manualId: number
  title: string
  manufacturer: string | null
  pageNo: number // 0 = Treffer in den Metadaten (Titel/Hersteller/Tags)
  snippet: string // HTML mit <mark>...</mark>
  score: number
}

export interface ManualPatch {
  title?: string
  manufacturer?: string | null
  category?: string | null
  tags?: string | null
}

// Treffer der Suche INNERHALB eines geoeffneten PDFs
export interface InDocHit {
  pageNo: number
  snippet: string // HTML mit <mark>
}

export type ImportPhase =
  | 'hashing'
  | 'copying'
  | 'extracting'
  | 'indexing'
  | 'done'
  | 'skipped'
  | 'error'

export interface ImportProgress {
  phase: ImportPhase
  file: string
  fileIndex: number
  fileCount: number
  page?: number
  pageCount?: number
  message?: string
}

export interface ImportSummary {
  imported: number
  skipped: number
  failed: { path: string; error: string }[]
}

/* --------------------------- Testbildgenerator -------------------------- */

export type PatternId =
  | 'solid'
  | 'bars-smpte'
  | 'bars-ebu'
  | 'grayscale-steps'
  | 'grayscale-ramp'
  | 'grid'
  | 'checkerboard'
  | 'geometry'
  | 'frame-info'
  | 'colorcycle'
  | 'siemens'
  | 'convergence'
  | 'scroll'
  | 'timecode'

export type SolidColor =
  | 'white'
  | 'black'
  | 'red'
  | 'green'
  | 'blue'
  | 'cyan'
  | 'magenta'
  | 'yellow'
  | 'gray18'
  | 'gray50'

export interface PatternConfig {
  pattern: PatternId
  width: number
  height: number
  solid: SolidColor // fuer 'solid'
  gridSpacing: number // px, fuer checkerboard (Zellgroesse)
  gridScale: number // Multiplikator der Modul-Zellanzahl (Gitter + Geometrie-Eckkreise)
  cycleColors: string[] // fuer 'colorcycle' (Pixelcheck): Hex-Farben in Reihenfolge
  cycleSeconds: number // fuer 'colorcycle': Dauer je Farbe
  scrollSpeed: number // fuer 'scroll' (Tearing): Geschwindigkeitsfaktor (1 = Standard)
  label: string // frei waehlbarer Output-Name (frame-info)
  showInfo: boolean // Auflösung/Label einblenden
}

export const DEFAULT_PATTERN_CONFIG: PatternConfig = {
  pattern: 'grid',
  width: 1920,
  height: 1080,
  solid: 'white',
  gridSpacing: 64,
  gridScale: 1,
  cycleColors: ['#ffffff', '#ff0000', '#00ff00', '#0000ff', '#000000'],
  cycleSeconds: 2,
  scrollSpeed: 1,
  label: '',
  showInfo: true
}

export interface ColorLoopRequest {
  width: number
  height: number
  colors: string[] // Hex (#rrggbb), Reihenfolge = Abspielreihenfolge
  secondsPerColor: number
  fps: number
  format: PatternVideoFormat
}

export interface DisplayInfo {
  id: number
  label: string
  x: number
  y: number
  width: number // DIP-Bounds
  height: number
  scaleFactor: number
  primary: boolean
}

export type PatternVideoFormat = 'mp4' | 'hap_q'

export interface PatternVideoRequest {
  png: Uint8Array // gerendertes Standbild in Zielauflösung
  durationSec: number
  fps: number
  format: PatternVideoFormat
}

export interface PatternVideoProgress {
  progress: number // 0..1
  done: boolean
  outputPath?: string
  error?: string
}

/* ------------------------------ Video-Player ----------------------------- */
// LED-Wall-/Playlist-Player. Medien werden auf die Wand-Auflösung "eingebacken"
// (Fit-Modus) und nach H.264/MP4 konvertiert -> Chromium spielt das
// hardwarebeschleunigt ab (HAP kann der Browser NICHT dekodieren, das bleibt
// dem HAP-Konverter/Resolume vorbehalten). Stehende Bilder werden als JPG in
// Wand-Auflösung gebacken und mit einstellbarer Standzeit gezeigt.

export type MediaKind = 'video' | 'image' | 'gif'

// blur  = unscharfer, formatfüllender Hintergrund + scharfer Inhalt mittig
// bars  = Letter-/Pillarbox (schwarze Ränder), Originalformat erhalten
// stretch = auf exakte Wand-Auflösung ziehen (verzerrt; gut bei Mini-Abweichungen)
export type FitMode = 'blur' | 'bars' | 'stretch'

export type LoopMode = 'none' | 'one' | 'all'

// cut = harter Schnitt, crossfade = weiche Überblendung (Opazität + Audio-Fade)
export type TransitionMode = 'cut' | 'crossfade'

export interface WallResolution {
  width: number
  height: number
}

/** Ein konvertiertes, abspielbereites Medium in der verwalteten Bibliothek. */
export interface MediaItem {
  id: string
  kind: MediaKind
  title: string
  originalName: string
  /** media://library/<stored> – konvertierte Datei (mp4/jpg) in Wand-Auflösung. */
  url: string
  /** media://library/<thumb> – Vorschaubild, oder null. */
  thumbUrl: string | null
  width: number // Ziel-/Wand-Auflösung, in der eingebacken wurde
  height: number
  durationSec: number | null // null = Standbild (freie Standzeit)
  fitMode: FitMode
  hasAudio: boolean
  sizeBytes: number
  /** Originalquelle (für Neu-Konvertierung bei Auflösungswechsel); null = unbekannt. */
  sourcePath: string | null
  addedAt: number
}

export type ConvertStatus =
  | 'queued'
  | 'probing'
  | 'converting'
  | 'thumbnail'
  | 'done'
  | 'error'
  | 'canceled'

export interface ConvertJob {
  id: string
  sourcePath: string
  title: string
  status: ConvertStatus
  progress: number // 0..1
  fitMode: FitMode
  targetWidth: number
  targetHeight: number
  kind: MediaKind | null
  mediaId: string | null // gesetzt, sobald in der Bibliothek
  encoder: string | null // tatsächlich genutzter Encoder
  error?: string
  createdAt: number
}

export interface PlayerImportRequest {
  sources: string[] // Dateien und/oder Ordner (rekursiv)
  fitMode: FitMode
  wall: WallResolution
}

/** Gespeicherte, benannte Playlist (als Tab umschaltbar). */
export interface SavedPlaylist {
  name: string
  mediaIds: string[]
}

export interface RemoteStatus {
  running: boolean
  port: number
  urls: string[] // erreichbare http://<lan-ip>:<port>-Adressen
}

export interface EncoderInfo {
  id: string // ffmpeg-Encodername, z.B. 'h264_nvenc' | 'libx264'
  label: string
  hardware: boolean
}

export interface PlayerEncoderStatus {
  ffmpegFound: boolean
  version: string | null
  available: EncoderInfo[] // geprüfte, funktionierende Encoder
  recommended: string // Encoder-id für "Automatisch"
  error?: string
}

/** Vollständiger Player-Zustand (main -> alle Fenster + Tablet). */
export interface PlayerState {
  playlist: MediaItem[]
  index: number // -1 = leer
  playing: boolean
  loop: LoopMode
  shuffle: boolean
  muted: boolean
  volume: number // 0..1
  positionSec: number
  durationSec: number
  imageDurationSec: number
  transition: TransitionMode
  transitionMs: number // Dauer der Überblendung (crossfade)
  idlePattern: PatternId | 'off' | 'custom' // Idle-Anzeige, wenn nichts läuft
  idleMediaUrl: string | null // bei 'custom': media://-URL des eigenen Bilds/Videos
  idleMediaKind: 'image' | 'video' | null
  outputOpen: boolean
  wall: WallResolution
  seekSeq: number // monotone Seek-Marke -> Ausgabefenster setzt currentTime
  /** Bei Shuffle: VORAB gewürfelter nächster Index (-1 = keiner). Main würfelt,
   *  alle Fenster lesen denselben Wert -> das vorgeladene Medium ist garantiert
   *  das, das beim Track-Ende auch wirklich gespielt wird (gapless). */
  shuffleNext: number
}

/** Leichtgewichtiger Positions-Tick (häufig; ohne Playlist-Payload). */
export interface PlayerTick {
  positionSec: number
  durationSec: number
}

/** Steuerbefehle von Desktop-UI oder Tablet an den main-Player. */
export type PlayerCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'goto'; index: number }
  | { type: 'seek'; positionSec: number }
  | { type: 'add'; mediaIds: string[]; at?: number }
  | { type: 'replace'; mediaIds: string[] } // Playlist atomar ersetzen (nahtloser Wechsel)
  | { type: 'remove'; index: number }
  | { type: 'move'; from: number; to: number }
  | { type: 'clear' }
  | { type: 'setLoop'; loop: LoopMode }
  | { type: 'setShuffle'; shuffle: boolean }
  | { type: 'setMuted'; muted: boolean }
  | { type: 'setVolume'; volume: number }
  | { type: 'setImageDuration'; seconds: number }
  | { type: 'setTransition'; transition: TransitionMode; transitionMs?: number }
  | { type: 'setDefaultFit'; fit: FitMode } // Aufbereitung für neue Importe/Uploads (Tablet)
  | { type: 'setIdlePattern'; pattern: PatternId | 'off' }
  | { type: 'setIdleMedia'; url: string | null; kind: 'image' | 'video' | null }
  | { type: 'ended' } // vom Ausgabefenster gemeldet: aktuelles Medium fertig

/* --------------------------- Stage-Timer & Uhr --------------------------- */
// Sprechzeit-Timer mit Vollbild-Ausgabe (Referentenmonitor). Der main-Prozess
// tickt autoritativ; Steuer-UI und Ausgabefenster spiegeln denselben Zustand
// (gleiche Architektur wie der Video-Player).

export type TimerDisplayMode = 'timer' | 'clock'

// stop     = bei 0:00 stehen bleiben
// overtime = ins Minus weiterzaehlen (rot blinkend)
// next     = automatisch zum naechsten Abschnitt springen
export type TimerEndBehavior = 'stop' | 'overtime' | 'next'

export interface TimerSegment {
  id: string
  label: string
  durationSec: number
}

export interface TimerMessage {
  text: string
  flash: boolean
  /** monoton steigend -> Ausgabe kann die Einblende-Animation je Senden neu starten */
  seq: number
}

export interface StageTimerState {
  segments: TimerSegment[]
  current: number // Index in segments, -1 = keiner
  running: boolean
  remainingSec: number // kann bei 'overtime' negativ werden
  endBehavior: TimerEndBehavior
  warnSec: number // ab dieser Restzeit: gelb
  alertSec: number // ab dieser Restzeit: rot
  message: TimerMessage | null
  displayMode: TimerDisplayMode
  showClockInTimer: boolean // kleine Uhrzeit zusaetzlich im Timer-Modus
  outputOpen: boolean
}

/** Leichter, haeufiger Tick (Restzeit), analog PlayerTick. */
export interface StageTimerTick {
  remainingSec: number
  running: boolean
  current: number
}

export type TimerCommand =
  | { type: 'setSegments'; segments: TimerSegment[] }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'reset' } // aktuellen Abschnitt auf volle Zeit
  | { type: 'resetAll' } // zurueck zum ersten Abschnitt, gestoppt
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'goto'; index: number }
  | { type: 'adjust'; deltaSec: number } // Restzeit live korrigieren (+/- Minute)
  | { type: 'setEndBehavior'; behavior: TimerEndBehavior }
  | { type: 'setThresholds'; warnSec: number; alertSec: number }
  | { type: 'setDisplayMode'; mode: TimerDisplayMode }
  | { type: 'setShowClock'; show: boolean }
  | { type: 'message'; text: string; flash: boolean }
  | { type: 'clearMessage' }

/* -------------------------------- Dialog -------------------------------- */

export interface SelectPathsOptions {
  title?: string
  filters?: { name: string; extensions: string[] }[]
  multi?: boolean
  directories?: boolean // true => Ordnerauswahl
}

/* ------------------------------- Settings ------------------------------- */

export interface PatternPreset {
  name: string
  config: PatternConfig
}

export interface PlayerSettings {
  wallWidth: number
  wallHeight: number
  defaultFit: FitMode
  outputDisplayId: number | null
  imageDurationSec: number
  transition: TransitionMode
  transitionMs: number
  idlePattern: PatternId | 'off' | 'custom'
  idleMediaUrl: string | null
  idleMediaKind: 'image' | 'video' | null
  encoder: string // 'auto' | 'cpu' | konkrete Encoder-id
  remoteEnabled: boolean
  remotePort: number
  savedPlaylists: SavedPlaylist[]
}

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  wallWidth: 1920,
  wallHeight: 1080,
  defaultFit: 'blur',
  outputDisplayId: null,
  imageDurationSec: 10,
  transition: 'cut',
  transitionMs: 500,
  idlePattern: 'off',
  idleMediaUrl: null,
  idleMediaKind: null,
  encoder: 'auto',
  remoteEnabled: false,
  remotePort: 8088,
  savedPlaylists: []
}

/** Farbschema der Oberfläche. 'system' folgt der OS-Einstellung. */
export type ThemeMode = 'system' | 'light' | 'dark'

export interface AppSettings {
  lastHapOutputDir: string | null
  lastHapFormat: HapFormat
  lastImportDir: string | null
  patternPresets: PatternPreset[]
  theme: ThemeMode
  player: PlayerSettings
}

export const DEFAULT_SETTINGS: AppSettings = {
  lastHapOutputDir: null,
  lastHapFormat: 'hap_q',
  lastImportDir: null,
  patternPresets: [],
  theme: 'dark', // bisheriges Erscheinungsbild bleibt Standard
  player: DEFAULT_PLAYER_SETTINGS
}
