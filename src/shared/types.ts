// Gemeinsame Domain-Typen fuer main, preload und renderer.
// Single source of truth -- nur hier werden Datenstrukturen definiert.

import { APP_NAME } from './brand'

export type ToolCategoryId = 'playback' | 'control' | 'visual' | 'media' | 'rigging' | 'calc'

/* ----------------------------- ffmpeg / HAP ----------------------------- */

export type HapFormat = 'hap' | 'hap_alpha' | 'hap_q'

// snappy = kleinere Dateien (Standard), none = schnelleres Encoding, groessere Dateien
export type HapCompressor = 'snappy' | 'none'

export interface ProbeResult {
  path: string
  width: number | null
  height: number | null
  durationSec: number | null
  fps: number | null
  codec: string | null
  hasVideo: boolean
}

/* ------------------------------ Medien-Info ------------------------------ */
// Normalisierte ffprobe-Auswertung einer Datei. Der main-Prozess liest und
// normalisiert (alle ffprobe-Eigenheiten an EINER Stelle), der Renderer formatiert
// nur noch und bewertet für den Show-Einsatz.

export type MediaScanType = 'progressive' | 'tff' | 'bff' | 'unknown'
// vfr-suspect: Header-Angaben widersprechen sich, Paket-Scan (Tiefenanalyse) fehlt
export type MediaFpsMode = 'cfr' | 'vfr' | 'vfr-suspect' | 'still' | 'unknown'
// gpu = Textur-Codec (HAP, DXV, NotchLC); longgop = Bilder hängen voneinander ab
export type MediaCodecClass = 'gpu' | 'intra' | 'longgop' | 'image' | 'unknown'

export interface MediaGopInfo {
  packets: number // ausgewertete Video-Pakete (Anfang der Datei)
  keyframes: number
  /** Medianer Keyframe-Abstand in Bildern; bei nur einem Keyframe: Mindestwert. */
  keyframeInterval: number | null
  /** true = im Scan nur EIN Keyframe -> Abstand ist mindestens keyframeInterval. */
  keyframeIntervalAtLeast: boolean
  allIntra: boolean
  /** Bildabstände uneinheitlich (bestätigte variable Bildrate). */
  vfr: boolean
  /** Scan lief bis zum Dateiende (ganzer Clip geprüft), sonst nur der Anfang. */
  complete: boolean
  /** Bildrate aus dem Median der Bildabstände. */
  fps: number | null
}

export interface MediaVideoTrack {
  index: number
  codecName: string | null // ffprobe codec_name (h264, hevc, prores, hap …)
  codec: string // Anzeigename: „H.264", „ProRes 422 HQ", „HAP Q"
  profile: string | null // „High", „Main 10" (bei ProRes/DNx/HAP im Namen enthalten)
  level: string | null // „4.1", „5.1"
  fourcc: string | null // avc1, hvc1, HapY, apch (nur druckbare Kennungen)
  codecClass: MediaCodecClass
  width: number // gespeicherte Pixel
  height: number
  displayWidth: number // Anzeige nach Pixel-Seitenverhältnis + Rotation
  displayHeight: number
  sar: string | null // „64:45" – nur wenn nicht quadratisch
  dar: string | null // „16:9" laut Datei
  rotation: number // Anzeige-Drehung im Uhrzeigersinn: 0 | 90 | 180 | 270
  mirrored: boolean
  fps: number | null
  fpsRational: string | null // „30000/1001" (r_frame_rate)
  fpsMode: MediaFpsMode
  scan: MediaScanType
  pixFmt: string | null
  bitDepth: number | null
  chroma: string | null // „4:2:0" | „4:2:2" | „4:4:4" | „RGB" | „Graustufen" …
  alpha: boolean
  alphaNote: string | null // Herkunft/Einschränkung, z.B. „WebM alpha_mode", „GIF: 1-bit möglich"
  colorRange: 'tv' | 'pc' | null
  colorSpace: string | null
  colorTransfer: string | null
  colorPrimaries: string | null
  hdr: 'pq' | 'hlg' | null
  dolbyVision: string | null // Profil, z.B. „8.4"
  masteringMaxNits: number | null
  maxCll: number | null
  maxFall: number | null
  bitRate: number | null // bit/s
  bitRateEstimated: boolean
  frames: number | null
  framesEstimated: boolean
  durationSec: number | null
  hasBFrames: boolean
  timecode: string | null
  language: string | null
  title: string | null
  gop: MediaGopInfo | null // nur nach Tiefenanalyse (Long-GOP / VFR-Verdacht)
}

export interface MediaAudioTrack {
  index: number
  codecName: string | null
  codec: string // „AAC", „PCM 24 bit", „Dolby Digital (AC-3)"
  profile: string | null
  channels: number | null
  channelLayout: string | null // ffprobe-Layout („5.1(side)") oder abgeleitet („stereo")
  layoutKnown: boolean // false = nur aus der Kanalzahl abgeleitet
  sampleRate: number | null // Hz
  bitDepth: number | null // nur verlustfreie Codecs
  float: boolean
  lossy: boolean
  bitRate: number | null
  bitRateEstimated: boolean
  durationSec: number | null
  language: string | null
  title: string | null
  isDefault: boolean
}

export interface MediaSubtitleTrack {
  index: number
  codecName: string | null
  codec: string
  bitmap: boolean // Bild-Untertitel (PGS/VobSub/DVB)
  language: string | null
  title: string | null
  forced: boolean
  isDefault: boolean
}

export interface MediaDataTrack {
  index: number
  kind: string // „Timecode", „GoPro-Telemetrie", FourCC …
  timecode: string | null
}

export interface MediaCover {
  index: number
  codec: string
  width: number | null
  height: number | null
}

export interface MediaChapter {
  startSec: number
  endSec: number
  title: string | null
}

export interface MediaTag {
  scope: string // „Datei" oder „Spur 2 (Audio)"
  key: string
  value: string
}

export interface MediaInfo {
  path: string
  name: string
  sizeBytes: number | null
  modifiedMs: number | null
  formatName: string | null // ffprobe format_name (Rohwert)
  container: string // Anzeigename: „QuickTime (MOV)", „MPEG-4 (MP4)", „Matroska (MKV)"
  containerLong: string | null
  extensionMismatch: boolean // Endung passt nicht zum erkannten Container
  probeScore: number | null
  isStill: boolean // Einzelbild (PNG/JPG …)
  durationSec: number | null
  startTimeSec: number | null
  bitRate: number | null // Gesamt-Bitrate bit/s
  bitRateEstimated: boolean
  timecode: string | null // Start-Timecode, Drop-Frame mit „;"
  timecodeSource: string | null
  title: string | null
  encoder: string | null
  creationTime: string | null // ISO-8601
  camera: string | null // „Apple iPhone 17"
  location: string | null // ISO-6709-Rohwert
  incomplete: boolean // Index verspricht mehr Daten als vorhanden (abgebrochene Kopie)
  video: MediaVideoTrack[]
  audio: MediaAudioTrack[]
  subtitles: MediaSubtitleTrack[]
  data: MediaDataTrack[]
  covers: MediaCover[] // eingebettete Coverbilder (kein Video!)
  attachments: number
  chapters: MediaChapter[]
  tags: MediaTag[]
  deepAnalyzed: boolean // Tiefenanalyse (Paket-/Frame-Scan) ist gelaufen
}

export type MediaInfoResult =
  { ok: true; info: MediaInfo } | { ok: false; path: string; error: string; detail: string | null }

export interface MediaProbeOptions {
  /** Paket-/Frame-Scan für GOP, VFR-Nachweis, HDR-Metadaten, Scan-Typ (ms bis ~1 s). */
  deep?: boolean
  /** Cache ignorieren und neu einlesen. */
  force?: boolean
}

export interface MediaCollectResult {
  files: string[] // gefundene Mediendateien (sortiert, ohne Duplikate)
  ignored: number // übersprungene System-/._-Dateien
  unreadable: string[] // nicht lesbare Eingaben
  limited: boolean // Obergrenze erreicht -> Liste unvollständig
}

export type ChunksMode = { kind: 'auto' } | { kind: 'manual'; value: number }

export type JobStatus = 'queued' | 'probing' | 'running' | 'done' | 'error' | 'canceled'

/* ------------------------------ Konvertierung ------------------------------ */
// Gemeinsamer Kern für Video-Konverter und Player-Import (Plan: shared/convertPlan.ts).

export type ConvertFormat =
  | 'hap'
  | 'hap_alpha'
  | 'hap_q'
  | 'h264'
  | 'hevc'
  | 'prores_proxy'
  | 'prores_lt'
  | 'prores_422'
  | 'prores_hq'
  | 'prores_4444'
  | 'wav' // nur Ton
  | 'jpg' // Standbild (Player-Bibliothek)

// bars = Letterbox/Pillarbox, crop = füllen und Ränder abschneiden, blur = unscharfer
// Hintergrund (Player)
export type ConvertFit = 'bars' | 'crop' | 'stretch' | 'blur'

export type ConvertSize =
  | { mode: 'original' }
  // höchstens so groß (Hochkant passt in die gedrehte Box), nie vergrößern
  | { mode: 'max'; width: number; height: number }
  | { mode: 'exact'; width: number; height: number; fit: ConvertFit }

export type ConvertRaster = '25' | '30' | 'ntsc' | 'film'

export type ConvertFps =
  | { mode: 'original' } // variable Bildrate wird trotzdem konstant
  | { mode: 'raster'; raster: ConvertRaster } // 25/50, 30/60, 29,97/59,94, 24/48
  | { mode: 'fixed'; fps: number }

export type ConvertQuality = 'high' | 'standard' | 'small'

export interface ConvertOptions {
  format: ConvertFormat
  quality: ConvertQuality // H.264/H.265
  compat: boolean // H.264: Level + Bitraten-Deckel für Player-Boxen/TVs
  keepAlpha: boolean // Alpha-Quelle: HAP/HAP Q -> HAP Alpha, ProRes 422 -> 4444
  size: ConvertSize
  fps: ConvertFps
  deinterlace: boolean // erkannte Halbbilder -> Vollbilder mit doppelter Rate (25i -> 50p)
  toSdr: boolean // HDR (PQ/HLG) -> SDR
  audio: 'auto' | 'stereo' | 'none'
  hapCompressor: HapCompressor
  hapChunks: ChunksMode
  /** Lautheit angleichen (EBU R128): Ziel in LUFS/dBTP/LU; gemessen und angewandt in zwei
   *  Durchgängen (shared/loudness.ts). null/fehlt = Ton unverändert. */
  loudnorm?: { i: number; tp: number; lra: number } | null
  /** Player: Blur-Rand (nur fit 'blur'). */
  blur?: { strength: number; darken: number }
  /** Player: unverändertes H.264 nur umverpacken statt neu kodieren. */
  allowCopy?: boolean
}

export interface ConvertCapabilities {
  ffmpegFound: boolean
  version: string | null
  error?: string
  /** je Format: kann das gebündelte ffmpeg es schreiben? (HAP braucht libsnappy) */
  formats: Record<ConvertFormat, boolean>
  /** HDR -> SDR (Filter zscale + tonemap) */
  tonemap: boolean
  /** libvpx-Decoder: nur sie lesen den Alpha-Kanal von VP8/VP9-WebM */
  vpxAlpha: boolean
  /** Video-Generator: Übergänge (xfade) und Ken Burns (perspective) */
  xfade: boolean
  perspective: boolean
}

export interface ConverterEnqueueRequest {
  inputs: string[] // Dateien und/oder Ordner (Ordner werden rekursiv durchsucht)
  options: ConvertOptions
  outputDir: string | null // null => neben der Quelldatei ablegen
  concurrency: number // gleichzeitige Konvertierungen (1 = sequentiell)
}

export interface ConverterJob {
  id: string
  inputPath: string
  outputPath: string | null // steht erst nach der Planung fest (Alpha-Automatik, Nummerierung)
  format: ConvertFormat // nach der Planung das tatsächliche Format
  formatLabel: string
  status: JobStatus
  progress: number // 0..1
  width: number | null // Ausgabe
  height: number | null
  fps: number | null
  chunks: number | null // nur HAP
  /** Kodiert mit (Bezeichnung, z. B. „NVIDIA NVENC (GPU)“); null = steht noch nicht fest */
  encoder: string | null
  steps: string[] // angewendete Korrekturen („Deinterlaced (25i → 50p)" …)
  durationSec: number | null
  error?: string
  createdAt: number
}

/* ---------------------------- Video-Generator ----------------------------- */
// Diashow & Montage: aus Bildern und Videos EIN Video. Das Projekt hält nur, was der Nutzer
// einstellt; Bildzahlen, Ton-Samples, Ken-Burns-Bahnen und ffmpeg-Befehle rechnet
// shared/videoGenPlan.ts (Plan und Messwerte: docs/PLAN-VIDEO-GENERATOR.md).

/** Einpassen in die Zielgröße: füllen (Rand beschnitten), Ränder in Hintergrundfarbe, Blur-Rand. */
export type VgenFit = 'crop' | 'bars' | 'blur'

/** Kuratierte xfade-Übergänge; 'cut' = harter Schnitt (ohne Übergangs-Stück). */
export type VgenTransitionKind =
  | 'cut'
  | 'fade'
  | 'fadeblack'
  | 'fadewhite'
  | 'dissolve'
  | 'wipeleft'
  | 'wiperight'
  | 'slideleft'
  | 'slideright'
  | 'slideup'
  | 'slidedown'
  | 'circleopen'
  | 'smoothleft'
  | 'smoothright'
  | 'zoomin'

export interface VgenTransition {
  kind: VgenTransitionKind
  durationSec: number
}

export type VgenKenBurnsMode =
  | 'off'
  | 'auto' // wechselnd, aus der Element-id; Hochkant schwenkt senkrecht
  | 'zoom-in'
  | 'zoom-out'
  | 'pan-left'
  | 'pan-right'
  | 'pan-up'
  | 'pan-down'
  | 'custom' // eigener Start- und Endausschnitt (nur je Bild, nicht als Vorgabe)

export type VgenKenBurnsStrength = 'soft' | 'medium' | 'strong'

/**
 * Ausschnitt eines eigenen Ken-Burns-Rahmens: Mitte in Anteilen der Zeichenfläche (0..1) und
 * Zoom relativ zum Grundfenster (1 = größter Ausschnitt im Seitenverhältnis der Ausgabe).
 */
export interface VgenKenBurnsFrame {
  cx: number
  cy: number
  zoom: number
}

export interface VgenKenBurns {
  mode: VgenKenBurnsMode
  strength: VgenKenBurnsStrength
  /** nur bei 'custom': Start- und Endausschnitt (die Bahn dazwischen wie bei allen Modi) */
  from?: VgenKenBurnsFrame
  to?: VgenKenBurnsFrame
}

/** gif = animiertes GIF (Schleife über die Standzeit); ein GIF mit einem Bild ist ein Bild. */
export type VgenElementKind = 'image' | 'video' | 'gif'

export interface VgenElement {
  /** stabil (crypto.randomUUID); Grundlage für Ken Burns „automatisch“ */
  id: string
  path: string
  kind: VgenElementKind
  /** Bild/GIF: Standzeit in s; null = Vorgabe */
  durationSec: number | null
  /** Video: Ausschnitt in s; null = Anfang bzw. Ende */
  inSec: number | null
  outSec: number | null
  /** nur Bilder; null = Vorgabe */
  kenBurns: VgenKenBurns | null
  /** null = Vorgabe */
  fit: VgenFit | null
  /** Übergang zum NÄCHSTEN Element (beim letzten: in den Anfang, nur mit Schleife); null = Vorgabe */
  transition: VgenTransition | null
  /** Originalton (nur Videos) */
  audio: boolean
}

export interface VgenMusic {
  /** Titel in Abspielreihenfolge; reicht die Liste nicht, beginnt sie von vorn */
  tracks: string[]
  gainDb: number
  fadeInSec: number
  fadeOutSec: number
  /** Überblendung zwischen zwei Titeln (auch beim Wiederholen der Liste); 0 = direkt */
  crossfadeSec: number
  /** Musik unter Videos mit Originalton absenken (dB, negativ); 0 = aus */
  duckDb: number
}

export interface VgenOutput {
  width: number
  height: number
  fps: number
  /** h264, hevc, prores_* (ohne 4444), hap, hap_q – Transparenz kommt später */
  format: ConvertFormat
  quality: ConvertQuality
  /** nahtlose Schleife: das Ende blendet in den Anfang (Sponsor-Loop) */
  loop: boolean
  /** Hintergrund für Ränder und Transparenz, „#rrggbb“ */
  background: string
}

export interface VgenDefaults {
  imageSec: number
  transition: VgenTransition
  kenBurns: VgenKenBurns
  fit: VgenFit
}

export interface VgenProject {
  elements: VgenElement[]
  output: VgenOutput
  defaults: VgenDefaults
  music: VgenMusic | null
  /** Lautheit nach EBU R128 (gemessen am fertigen Ton-Mix); null = unverändert */
  loudnorm: { i: number; tp: number; lra: number } | null
}

/** Hinweis des Plans (Fehler sperren das Erzeugen). */
export interface VgenHint {
  id: string
  level: 'error' | 'warning' | 'info'
  text: string
  elementId?: string
}

export type VgenJobStage = 'analyze' | 'elements' | 'transitions' | 'audio' | 'encode'

export interface VgenJob {
  id: string
  status: JobStatus
  stage: VgenJobStage | null
  /** „Elemente 3/12“ … */
  stageText: string
  progress: number // 0..1 über alle Stufen
  outputPath: string
  /** Name des Projekts in der Auftragsliste (Dateiname ohne Endung) */
  title: string
  durationSec: number | null
  width: number
  height: number
  fps: number
  formatLabel: string
  /** kodiert mit (Bezeichnung), sobald feststeht */
  encoder: string | null
  /** Stücke aus dem Zwischenspeicher übernommen / neu gerechnet */
  cachedPieces: number
  renderedPieces: number
  hints: VgenHint[]
  error?: string
  createdAt: number
  finishedAt?: number
}

export interface VgenEnqueueRequest {
  project: VgenProject
  /** Zieldatei (aus dem Speicherdialog) */
  outputPath: string
}

/**
 * „Vorschau rechnen“: kleiner Probelauf (längere Seite 640 px) des Bereichs um ein Element –
 * dieselben Stücke und Befehle wie das Ergebnis, nur ohne Lautheitsangleichung.
 */
export interface VgenPreviewRequest {
  /** vom Renderer vergeben; Fortschritts-Events tragen sie mit */
  requestId: string
  project: VgenProject
  elementId: string
}

export type VgenPreviewOutcome =
  | {
      ok: true
      /** media://vgen/<datei>.mp4 */
      url: string
      width: number
      height: number
      durationSec: number
      /** Lage des Elements in der Vorschau (s), für die Markierung */
      elementStartSec: number
      elementEndSec: number
      /** komplett aus dem Zwischenspeicher */
      cached: boolean
    }
  | { ok: false; canceled: boolean; error: string }

export interface VgenPreviewProgress {
  requestId: string
  /** 0..1 */
  progress: number
  text: string
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
  'hashing' | 'copying' | 'extracting' | 'indexing' | 'done' | 'skipped' | 'error'

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
  | 'mapping'

export type SolidColor =
  'white' | 'black' | 'red' | 'green' | 'blue' | 'cyan' | 'magenta' | 'yellow' | 'gray18' | 'gray50'

/**
 * Schaltbare Elemente des Mapping-Testbilds. Akzentfarbe: frame, corners, axes (mit
 * Mittenmarken an den Kanten), up und der große Kreis (circles); disc = schwarze Mittelscheibe
 * mit Sekundenring, die Logo, Titel und Kennung trägt; labels = kleine technische
 * Beschriftungen (Zellnamen, Lineal-Zahlen, Eck-Koordinaten, Grauwerte, „OBEN“); logo = Logo +
 * Titel; info = Bezeichnung, Auflösung und Seitenverhältnis; clock = laufende Uhrzeit;
 * seconds = Sekundenring der Mittelscheibe (aus: voller Ring).
 */
export type MappingElement =
  | 'grid'
  | 'ruler'
  | 'diagonals'
  | 'circles'
  | 'frame'
  | 'corners'
  | 'axes'
  | 'up'
  | 'disc'
  | 'fields'
  | 'labels'
  | 'logo'
  | 'info'
  | 'clock'
  | 'seconds'

export const MAPPING_ELEMENTS: MappingElement[] = [
  'grid',
  'ruler',
  'diagonals',
  'circles',
  'frame',
  'corners',
  'axes',
  'up',
  'disc',
  'fields',
  'labels',
  'logo',
  'info',
  'clock',
  'seconds'
]

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
  label: string // frei waehlbarer Output-Name (Info-Label; 'mapping': Bezeichnung unter der Mitte)
  showInfo: boolean // Auflösung/Label einblenden
  // 'mapping' (Mapping-Testbild). Optional, damit ältere Presets ohne diese Felder gültig
  // bleiben (Fallback: Standard).
  mappingTitle?: string // Titel neben dem Logo
  mappingAccent?: string // Hex: Rahmen, Ecken, Mittelachsen, großer Kreis, OBEN
  mappingBackground?: string // Hex: Grundfläche (Linien/Schrift passen sich hell/dunkel an)
  /** Rasterzelle in px, z. B. ein Cabinet der LED-Wand; fehlt/null = automatisch */
  mappingCell?: { w: number; h: number } | null
  /** Ausgeblendete Elemente (Standard: alle sichtbar) */
  mappingHidden?: MappingElement[]
  /** Raster in Akzentfarbe statt neutral – beim Überblenden je Beamer ein eigenes Raster */
  mappingGridAccent?: boolean
}

/** Standardfarben des Mapping-Testbilds: Gold der App auf Anthrazit. */
export const MAPPING_DEFAULT_ACCENT = '#ffce2e'
export const MAPPING_DEFAULT_BACKGROUND = '#1e1e1e'

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
  showInfo: true,
  mappingTitle: APP_NAME.toUpperCase(),
  mappingAccent: MAPPING_DEFAULT_ACCENT,
  mappingBackground: MAPPING_DEFAULT_BACKGROUND,
  mappingCell: null,
  mappingHidden: [],
  mappingGridAccent: false
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
// Video-Konverter/Medienservern vorbehalten). Stehende Bilder werden als JPG in
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
  'queued' | 'probing' | 'converting' | 'thumbnail' | 'done' | 'error' | 'canceled'

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
  /** Dieselbe Steuerseite über die Fernsteuer-App (gemeinsame Startseite aller
   *  Fernsteuerungen auf festem Port, als Web-App installierbar). Fehlt, solange
   *  diese Fernsteuerung aus ist. */
  app?: RemoteAppLink
}

/** Die Handy-Fernsteuerungen (= URL-Präfix in der Fernsteuer-App). */
export type RemoteControlId = 'player' | 'jingle' | 'osc' | 'timer'

/** Gemerkter Zustand einer Fernsteuerung (übersteht App-Neustarts). */
export interface RemoteControlSetting {
  enabled: boolean
  port: number
}

/** Status der Fernsteuer-App (Startseite aller Fernsteuerungen, fester Port). */
export interface RemoteAppStatus {
  running: boolean
  port: number
  /** Adressen der Startseite (auch wenn sie gerade nicht läuft: so wird sie heißen). */
  urls: string[]
  error?: string
  /** Welche Fernsteuerungen gerade laufen. */
  remotes: Record<RemoteControlId, boolean>
}

export interface RemoteAppLink {
  /** http://<lan-ip>:<app-port>/<id>/ – leer, wenn die App nicht starten konnte. */
  urls: string[]
  /** Grund, falls die Fernsteuer-App nicht läuft (z. B. Port belegt). */
  error?: string
}

export interface EncoderInfo {
  id: string // ffmpeg-Encodername, z.B. 'h264_nvenc' | 'libx264'
  label: string
  hardware: boolean
  /** H.264: Level- und Bitraten-Grenzen für USB-/LED-Player im Probelauf bestanden. */
  compat?: boolean
}

/** Geprüfte Encoder des Video-Konverters je Familie – Schnellster zuerst, CPU zuletzt. */
export interface ConverterEncoderStatus {
  h264: EncoderInfo[]
  hevc: EncoderInfo[]
  prores: EncoderInfo[]
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
  speaker: string // Redner (Name) – auf der Anzeige kleiner, zuerst
  title: string // Titel/Beitrag – größer
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
  clockShowSeconds: boolean // Uhr-Modus: Sekunden anzeigen
  clockShowDate: boolean // Uhr-Modus: Datum unter der Uhrzeit anzeigen
  /** Überziehen: Bild blinkt rot (aus: nur die Ziffern sind rot) */
  overtimeFlash: boolean
  outputOpen: boolean
  /** NDI-Ausgabe sendet (Startbildschirm zeigt „Ausgabe“, ohne das NDI-Modul zu laden) */
  ndiActive: boolean
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
  | { type: 'setClockOptions'; showSeconds?: boolean; showDate?: boolean }
  | { type: 'setOvertimeFlash'; flash: boolean }
  | { type: 'message'; text: string; flash: boolean }
  | { type: 'clearMessage' }

/** NDI-Ausgabe des Stage-Timers (experimentell): ein unsichtbares Offscreen-
 *  Fenster rendert die Timer-Anzeige und schickt die Frames als NDI-Quelle ins
 *  Netz. Benötigt das optionale native Modul (rse/grandiose) + NDI-Laufzeit. */
export interface TimerNdiConfig {
  name: string // NDI-Quellenname im Netz
  width: number
  height: number
  fps: number
}

export interface TimerNdiStatus {
  available: boolean // NDI-Binding geladen und sendefähig?
  running: boolean
  config: TimerNdiConfig
  framesSent: number
  error: string | null // Grund bei available=false bzw. letzter Sendefehler
}

export const DEFAULT_TIMER_NDI: TimerNdiConfig = {
  name: `${APP_NAME} Timer`,
  width: 1920,
  height: 1080,
  fps: 30
}

/** NDI-Ausgabe des Video-Players (experimentell): ein Offscreen-Spiegel der
 *  Wiedergabe sendet Bild (und optional Ton) als NDI-Quelle ins Netz. */
export interface PlayerNdiConfig {
  name: string
  width: number
  height: number
  fps: number
  /** fill = Wandbild 1:1 (gleiches Seitenverhältnis), contain = in die
   *  Zielauflösung einbetten (schwarze Ränder bei anderem Seitenverhältnis). */
  fit: 'fill' | 'contain'
  audio: boolean
}

export interface PlayerNdiStatus {
  available: boolean
  running: boolean
  config: PlayerNdiConfig
  framesSent: number
  /** Anzahl der beim Sender angekommenen PCM-Blöcke -- 0 bei laufender
   *  Wiedergabe deutet auf ein Problem im Audio-Tap des Spiegelfensters. */
  audioChunks: number
  /** Spitzenpegel des Taps (0..1, abklingend): 0 bei Blöcken = Stille (CORS/Tonspur). */
  audioLevel: number
  error: string | null
}

export const DEFAULT_PLAYER_NDI: PlayerNdiConfig = {
  name: `${APP_NAME} Player`,
  width: 1920,
  height: 1080,
  fps: 30,
  fit: 'fill',
  audio: true
}

/** PCM-Block des NDI-Audio-Taps (Renderer -> main): planare Float32-Kanäle. */
export interface NdiAudioChunk {
  sampleRate: number
  channels: Float32Array[]
}

/* -------------------------------- Dialog -------------------------------- */

export interface SelectPathsOptions {
  title?: string
  filters?: { name: string; extensions: string[] }[]
  multi?: boolean
  directories?: boolean // true => Ordnerauswahl
}

/** Optionen für eine Ja/Nein-Rückfrage. Bewusst NICHT window.confirm(): das
 *  blockierende JS-Dialog von Electron killt danach die Tastatureingabe in ALLEN
 *  Textfeldern (bekannter Bug), bis das Fenster neu fokussiert wird. Diese
 *  Rückfrage läuft als natives Dialogfenster im main-Prozess und lässt die
 *  Tastatur unberührt. */
export interface ConfirmOptions {
  message: string // Hauptfrage
  detail?: string // optionale Erläuterung darunter
  confirmLabel?: string // Text des Bestätigen-Knopfs (Default „OK")
  cancelLabel?: string // Text des Abbrechen-Knopfs (Default „Abbrechen")
  danger?: boolean // true => Bestätigen als Warn-/Löschaktion markieren
}

/** Reine Hinweis-Meldung (ein OK-Knopf). Ersetzt window.alert() aus demselben
 *  Grund wie ConfirmOptions window.confirm() ersetzt (Tastatur-Bug). */
export interface NotifyOptions {
  message: string // Hauptmeldung
  detail?: string // optionale Erläuterung darunter
  kind?: 'info' | 'warning' | 'error' // Symbol/Ton des Dialogs (Default „info")
}

/* ------------------------------- Jingles -------------------------------- */
// Jingle-Player: kurze Audios (Auftrittsmusik/Stinger) auf belegbaren Pads.
// Dateien werden nach userData/jingles kopiert und über jingle:// geladen; die
// Pad-Belegung lebt im Renderer-Store. Kein SQLite, keine Konvertierung nötig.

export interface JingleImportResult {
  storedName: string // sicherer Dateiname in userData/jingles (<uuid>.<ext>)
  originalName: string // Anzeigename der Quelldatei
}

// Fernsteuerung des Jingle-Players (Handy/Tablet). Audio läuft im Renderer-Tab,
// daher veröffentlicht der Tab einen Schnappschuss an den main-Server und führt
// die hereinkommenden Trigger aus.
export interface JinglePadPublic {
  id: string
  label: string
  color: string
  loaded: boolean // hat eine Audiodatei
}

export interface JingleRemoteSnapshot {
  connected: boolean // ist ein Jingle-Player-Tab offen?
  bankName: string
  columns: number
  pads: JinglePadPublic[]
  playing: string[] // laufende Pad-IDs
}

export type JingleRemoteCommand = { type: 'trigger'; padId: string } | { type: 'stopAll' }

/* --------------------------- OSC-Fernsteuerung -------------------------- */
// Schnappschuss der OSC-Oberfläche für die Handy-/Tablet-Seite und die
// Steuerbefehle, die von dort zurückkommen (Renderer wendet sie an + sendet OSC).

export type OscRemoteWidgetType =
  'fader' | 'button' | 'toggle' | 'xy' | 'color' | 'label' | 'meter' | 'select' | 'bank' | 'knob'

/** Serialisierbares Widget für die mobile Seite (Teilmenge des Renderer-Widgets). */
export interface OscRemoteWidget {
  id: string
  type: OscRemoteWidgetType
  label: string
  color: string
  address: string
  addressY: string
  min: number
  max: number
  gx: number
  gy: number
  cw: number
  ch: number
  value: number
  x: number
  y: number
  r: number
  g: number
  b: number
  a: number
  align: 'left' | 'center' | 'right' // Label-Ausrichtung
  meterLevel: number // Anzeige/Meter: Füllstand 0..1 (vom Rechner berechnet)
  meterText: string // Anzeige/Meter: angezeigter Text
  items: { label: string; address: string; value: number }[] // Auswahl/Bank
  orient: 'h' | 'v' // Fader/Farbe: Ausrichtung der Regler
  cols: number // Auswahl/Bank: Spalten (0 = automatisch)
  bankMode: 'momentary' | 'toggle' | 'knob' // Bank: Verhalten der Felder
  endless: boolean // Knopf: Endlos-Encoder (relative Schritte)
}

export interface OscRemoteSnapshot {
  connected: boolean // ist ein OSC-Steuerung-Tab offen?
  setName: string
  columns: number
  widgets: OscRemoteWidget[]
  sets: { id: string; name: string }[] // alle Sets – für die Umschaltleiste am Handy
  currentSetId: string // aktives Set
}

export type OscRemoteCommand =
  | { kind: 'fader'; id: string; value: number }
  | { kind: 'toggle'; id: string; on: boolean }
  | { kind: 'button'; id: string; down: boolean }
  | { kind: 'xy'; id: string; x: number; y: number }
  | { kind: 'color'; id: string; r: number; g: number; b: number; a: number }
  | { kind: 'selectSet'; id: string } // Handy/Tablet wechselt das aktive Set
  | { kind: 'select'; id: string; index: number } // Auswahl-Kachel: Option gewählt
  | { kind: 'bank'; id: string; index: number; value: number } // Bank-Feld (value je Modus)
  | { kind: 'knob'; id: string; value: number } // Knopf absolut (min..max)
  | { kind: 'knobStep'; id: string; delta: number } // Endlos-Encoder: relativer Schritt

/* --------------------------- YouTube-Download --------------------------- */
// yt-dlp-Wrapper. Binary wird (falls nicht gefunden) nach userData/bin geladen
// und per Knopf aktualisiert; ffmpeg fürs Muxen kommt aus dem Bundle.

export type YtFormatId = 'video' | 'audio-mp3' | 'audio-m4a'

export interface YtToolStatus {
  available: boolean // yt-dlp gefunden + lauffähig
  version: string | null
  location: 'managed' | 'path' | null // userData/bin oder System-PATH
  ffmpeg: boolean
  /** Neueste stabile Version laut GitHub. null = noch nicht ermittelt. */
  latest: string | null
  /** null = unbekannt (offline oder keine Binary), sonst Version === latest. */
  upToDate: boolean | null
  /** Prüfung/Aktualisierung läuft gerade. */
  checking: boolean
  /** Zeitstempel der letzten Prüfung, null = noch keine. */
  lastCheck: number | null
  /** Fehler der letzten Prüfung (z. B. kein Netz), sonst null. */
  lastError: string | null
}

/**
 * ffmpeg der App: mitgeliefert (mit dem Installer) oder in der App aktualisiert (Windows/Linux,
 * services/ffmpeg/ffmpegUpdate.ts). Ein neuer Build gilt erst ab dem nächsten Start.
 */
export interface FfmpegToolStatus {
  /** im Einsatz */
  active: {
    source: 'mitgeliefert' | 'aktualisiert' | 'system'
    /** erste Zeile von `ffmpeg -version` */
    version: string | null
    /** „N-127252-ga25ba44c0c“ bei aktualisierten Builds */
    build: string | null
  }
  /** geladen und geprüft – wird beim nächsten Start verwendet */
  ready: { build: string; publishedAt: string } | null
  /** Aktualisierung in der App möglich; sonst steht der Grund in unsupportedReason */
  supported: boolean
  unsupportedReason: string | null
  checking: boolean
  /** Download 0..1, null = keiner */
  progress: number | null
  lastCheck: number | null
  /** Ergebnis der letzten Prüfung in Worten */
  lastResult: string | null
  lastError: string | null
}

export interface YtEnqueueRequest {
  url: string
  format: YtFormatId
  maxHeight: number | null // Auflösungsdeckel (px) für 'video', null = beste
  outputDir: string
  /** Titel vorab (aus der Analyse) – bis yt-dlp den Dateinamen meldet. */
  title?: string
  /** Unterordner im Zielordner (z. B. Playlist-Name); wird für das Dateisystem bereinigt. */
  subfolder?: string
  /** Playlist-Position voranstellen: 3 von 120 -> „003 - Titel“. */
  number?: { index: number; digits: number }
}

/** Ein Eintrag einer Playlist (flache Analyse, ohne die Videos selbst abzurufen). */
export interface YtPlaylistEntry {
  /** Position in der Playlist, 1-basiert. */
  index: number
  id: string
  /** Adresse zum Laden des einzelnen Eintrags; null = nicht ladbar. */
  url: string | null
  title: string
  durationSec: number | null
  /** Privat, gelöscht, nur für Mitglieder … -> nicht wählbar. */
  unavailable: boolean
  /** Selbst eine Playlist (z. B. Kanal-Reiter) -> einzeln öffnen statt laden. */
  nested: boolean
}

/** Ergebnis der Adress-Analyse vor dem Laden. */
export type YtProbeResult =
  | { kind: 'video'; url: string; title: string | null; durationSec: number | null }
  | {
      kind: 'playlist'
      url: string
      title: string
      uploader: string | null
      entries: YtPlaylistEntry[]
      /** Gesamtzahl laut Seite (kann über der Zahl geladener Einträge liegen). */
      total: number | null
      /** Nur die ersten Einträge analysiert (sehr lange Playlist). */
      truncated: boolean
      /** Die Adresse zeigt zusätzlich auf ein einzelnes Video (watch?v=…&list=…). */
      currentId: string | null
      /** Adresse genau dieses Videos (auch wenn es nicht unter den Einträgen ist). */
      videoUrl: string | null
    }

export type YtJobStatus = 'queued' | 'running' | 'done' | 'error' | 'canceled'

export interface YtJob {
  id: string
  url: string
  format: YtFormatId
  status: YtJobStatus
  progress: number // 0..1
  title: string | null
  speed: string | null
  eta: string | null
  outputDir: string
  outputFile: string | null
  error?: string
  createdAt: number
}

/* ---------------------------------- OSC --------------------------------- */
// OSC-Steuerung (MadMapper & Co.): der main-Prozess hält einen UDP-Socket
// (node:dgram), sendet OSC-Nachrichten an host:outPort und lauscht optional auf
// inPort für Feedback. Der Renderer baut daraus eine Steueroberfläche
// (Fader/Buttons/XY/Farbe). Bewusst abhängigkeitsfrei (eigener OSC-Codec).

// Unterstützte OSC-Argumenttypen (Teilmenge von OSC 1.0, die wir senden).
export type OscArg =
  | { type: 'f'; value: number } // float32
  | { type: 'i'; value: number } // int32
  | { type: 's'; value: string } // String
  | { type: 'T' } // true
  | { type: 'F' } // false

export interface OscMessage {
  address: string // beginnt mit '/'
  args: OscArg[]
}

export interface OscSettings {
  host: string // Ziel-Host (MadMapper), z.B. '127.0.0.1'
  outPort: number // OSC-Ausgang (MadMapper-Standard 8000)
  inPort: number // OSC-Feedback-Eingang (MadMapper-Standard 9000)
  feedbackEnabled: boolean // auf inPort lauschen?
}

export const DEFAULT_OSC_SETTINGS: OscSettings = {
  host: '127.0.0.1',
  outPort: 8000,
  inPort: 9000,
  feedbackEnabled: false
}

export interface OscStatus {
  host: string
  outPort: number
  inPort: number
  listening: boolean // Feedback-Socket gebunden?
  lastError: string | null
  sentCount: number
  recvCount: number
}

/** Ein empfangenes OSC-Paket (main -> renderer: Monitor + Rückmeldung). */
export interface OscFeedback {
  address: string
  args: (number | string | boolean)[]
  at: number // epoch ms
}

/** Eintrag des OSC-Aktivitäts-Logs (für den Monitor + das Monitor-Fenster). */
export interface OscLogEntry {
  id: number
  dir: 'out' | 'in' // ausgehend (gesendet) / eingehend (Feedback)
  address: string
  args: (number | string | boolean)[]
  at: number // epoch ms
}

/* --------------------------- NovaStar (LED-Prozessor) -------------------- */
// Steuerung eines NovaStar-Prozessors (NovaPro UHD Jr & Co.) über TCP 5200
// (eigener, abhängigkeitsfreier Paket-Codec). Stand: v0, Befehls-Bytes am Gerät
// zu bestätigen.

export interface NovastarStatus {
  connected: boolean
  host: string
  port: number
  lastError: string | null
}

/* ---------------------------- Netzwerk-Scanner --------------------------- */
// Findet Geräte im lokalen Netz (LED-Prozessoren, Video-Mischer/ATEM, PTZ-
// Kameras, Projektoren …). Aktiver Scan: TCP-Ports + ARP (Hersteller über MAC)
// + Bonjour/mDNS-Namen. Alles abhängigkeitsfrei im main-Prozess.

export type NetDeviceType =
  | 'novastar' // LED-Prozessor (Port 5200)
  | 'atem' // Blackmagic ATEM (UDP 9910)
  | 'camera' // PTZ-/Netzwerkkamera (RTSP/ONVIF)
  | 'video' // sonstiges Video/Streaming
  | 'projector' // Projektor (PJLink 4352)
  | 'lighting' // Licht (Art-Net/sACN)
  | 'audio' // Audio
  | 'printer' // Drucker
  | 'computer' // PC/Laptop/Server (SSH/RDP/SMB)
  | 'mobile' // Handy/Tablet
  | 'router' // Router/Netzwerkgerät
  | 'web' // hat Web-Oberfläche
  | 'unknown'

export interface NetService {
  type: string // Bonjour-Diensttyp, z.B. _http._tcp
  name: string // Instanzname
  port: number
}

export interface NetDevice {
  ip: string
  mac: string | null // normalisiert "aa:bb:cc:dd:ee:ff"
  vendor: string | null // aus MAC-OUI (best effort)
  hostname: string | null // aus mDNS
  type: NetDeviceType
  ports: number[] // offene TCP-Ports (aufsteigend)
  services: NetService[] // Bonjour-Dienste
  rttMs: number | null // Antwortzeit des ersten offenen Ports
  seenAt: number
}

export interface NetInterface {
  address: string // lokale IPv4
  netmask: string
  mac: string
  label: string // Interface-Name (z.B. en0/eth0)
  hosts: number // Anzahl scannbarer Hosts im Subnetz (gedeckelt)
}

export type NetScanPhase = 'idle' | 'sweep' | 'resolve' | 'done'

export interface NetScanProgress {
  running: boolean
  phase: NetScanPhase
  scanned: number
  total: number
  found: number
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
  /** Gleichzeitige Importe (1–4). Mehr lohnt bei vielen kurzen Clips/Bildern und mit GPU;
   *  ein einzelner langer CPU-Lauf nutzt ohnehin alle Kerne. Während der Show lieber 1. */
  importConcurrency: number
  // Blur-Fill: Unschärfe-Stärke (0..100, 50 = bisheriger Standard) und Abdunkelung
  // des Hintergrunds (0..100 %). Wird beim Einbacken angewandt -> gilt für neu
  // importierte/neu konvertierte Medien.
  blurStrength: number
  blurDarken: number
  // Loudness-Normalisierung (EBU R128 / ffmpeg loudnorm) beim Einbacken: gleicht
  // unterschiedlich laute Clips auf ein Ziel an – gemessen und angewandt in zwei Durchgängen
  // (shared/loudness.ts). Standard AUS; gehört zum Dedup-Schlüssel, „Neu einbacken“ wendet
  // eine geänderte Einstellung an. Zielwerte: Integrated LUFS, True Peak (dBTP), Range (LU) –
  // die Range ist nur noch Untergrenze: gemessen wird nie zusammengedrückt.
  loudnormEnabled: boolean
  loudnormI: number
  loudnormTp: number
  loudnormLra: number
  remoteEnabled: boolean
  remotePort: number
  savedPlaylists: SavedPlaylist[]
  /** NDI-Panel: Quellenname, Auflösung, Bildrate, Ton mitsenden */
  ndi: PlayerNdiPrefs
}

/** Auflösung der Player-NDI-Ausgabe: Wand 1:1 / halbe Wand / eingebettet in HD. */
export type PlayerNdiMode = 'wall' | 'half' | 'hd1080' | 'hd720'

export interface PlayerNdiPrefs {
  name: string
  mode: PlayerNdiMode
  fps: number
  audio: boolean
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
  importConcurrency: 2,
  blurStrength: 50,
  blurDarken: 0,
  loudnormEnabled: false,
  loudnormI: -16,
  loudnormTp: -1.5,
  loudnormLra: 11,
  remoteEnabled: false,
  remotePort: 8088,
  savedPlaylists: [],
  ndi: { name: DEFAULT_PLAYER_NDI.name, mode: 'wall', fps: 30, audio: true }
}

/** YouTube-Downloader: Zielordner und Vorgaben für neue Downloads. */
export interface YoutubeSettings {
  /** Zielordner; leer bis zur ersten Wahl */
  outputDir: string
  format: YtFormatId
  /** Auflösungsdeckel (px) für Video, null = beste */
  maxHeight: number | null
  /** Playlists in einen Unterordner mit ihrem Namen laden */
  playlistFolder: boolean
  /** Playlist-Position voranstellen („03 - Titel“) */
  playlistNumbers: boolean
}

export const DEFAULT_YOUTUBE_SETTINGS: YoutubeSettings = {
  outputDir: '',
  format: 'video',
  maxHeight: 1080,
  playlistFolder: true,
  playlistNumbers: true
}

/** Video-Konverter: Encoder-Wahl für H.264, H.265 und ProRes. */
export interface ConverterSettings {
  /** auto = schnellster geprüfter Encoder (GPU bzw. schnelles ProRes),
   *  cpu = klassische CPU-Encoder (libx264, libx265, prores_ks) */
  encoder: 'auto' | 'cpu'
}

export const DEFAULT_CONVERTER_SETTINGS: ConverterSettings = { encoder: 'auto' }

/** Video-Generator: Vorschlag für den Speicherort (das Projekt selbst liegt im Werkzeug-Store). */
export interface VideoGenSettings {
  /** zuletzt gewählter Zielordner; leer bis zur ersten Wahl */
  outputDir: string
}

export const DEFAULT_VIDEOGEN_SETTINGS: VideoGenSettings = { outputDir: '' }

/** Eingerichteter Ablauf des Stage-Timers (ohne Laufzustand) – übersteht Neustarts. */
export interface TimerSetup {
  segments: TimerSegment[]
  warnSec: number
  alertSec: number
  endBehavior: TimerEndBehavior
  displayMode: TimerDisplayMode
  showClockInTimer: boolean
  clockShowSeconds: boolean
  clockShowDate: boolean
  overtimeFlash: boolean
}

export interface TimerSettings {
  /** Zuletzt eingerichteter Ablauf; null = noch keiner. Führt der main-Prozess. */
  setup: TimerSetup | null
  ndi: TimerNdiConfig
}

export const DEFAULT_TIMER_SETTINGS: TimerSettings = { setup: null, ndi: DEFAULT_TIMER_NDI }

/** Farbschema der Oberfläche. 'system' folgt der OS-Einstellung. */
export type ThemeMode = 'system' | 'light' | 'dark'

/** Markenakzent (Primärfarbe) der Oberfläche. 'gold' = bisherige Marke. */
export type AccentId =
  | 'gold'
  | 'amber'
  | 'teal'
  | 'blue'
  | 'violet'
  | 'pink'
  | 'green'
  | 'lime'
  | 'cyan'
  | 'indigo'
  | 'orchid'
  | 'rose'
  | 'silver'

/** UI-Dichte. 'compact' verkleinert die Wurzel-Schriftgröße -> alle rem-basierten
 *  Maße (Höhen, Abstände, Text) schrumpfen proportional -> mehr passt aufs Bild. */
export type UiDensity = 'normal' | 'compact'

/** Selbst benannte Favoriten-Kategorie im Startbildschirm. */
export interface FavoriteGroup {
  id: string
  name: string
  /** Breite in Zwölfteln einer Zeile: 12 = ganze Breite, 6 = halb, 4 = Drittel, 3 = Viertel … */
  span: number
  /** Werkzeuge in eigener Reihenfolge */
  toolIds: string[]
}

export type LauncherTileSize = 'small' | 'medium' | 'large'

/** Art eines Datei-Dialogs – je Art merkt sich die App den zuletzt benutzten Ordner. */
export type DialogDirKind = 'dateien' | 'ordner' | 'speichern'

export interface AppSettings {
  lastHapOutputDir: string | null
  lastHapFormat: HapFormat
  lastImportDir: string | null
  patternPresets: PatternPreset[]
  theme: ThemeMode
  accent: AccentId
  player: PlayerSettings
  osc: OscSettings
  /** Kundenansicht: beim Start direkt in dieses Tool springen (gesperrt, ohne
   *  Zurück). null = normaler Start mit Übersicht. Exit per Strg+Shift+K. */
  kioskToolId: string | null
  /** Als Favorit markierte Werkzeuge (Tool-IDs) -> eigene Reihe oben im
   *  Startbildschirm für schnellen Zugriff. Reihenfolge = eigene Sortierung
   *  (Ziehen/Pfeile im Startbildschirm); neu markierte kommen ans Ende. */
  favoriteToolIds: string[]
  /** Startbildschirm zeigt nur die Favoriten (Suche findet trotzdem alle). */
  launcherFavoritesOnly: boolean
  /** Eigene Kategorien der Favoriten (Name, Breite, Reihenfolge). Quelle der Wahrheit
   *  für die Anordnung; favoriteToolIds bleibt als flache Liste synchron. */
  favoriteGroups: FavoriteGroup[]
  /** Kachelgröße im Startbildschirm */
  launcherTileSize: LauncherTileSize
  /** UI-Dichte (Normal/Kompakt) der Bedienoberfläche. */
  uiDensity: UiDensity
  /** yt-dlp beim Start prüfen und bei Bedarf aktualisieren. */
  ytdlpAutoUpdate: boolean
  /** ffmpeg in der fertigen App aktuell halten (Windows/Linux; gilt ab dem nächsten Start). */
  ffmpegAutoUpdate: boolean
  /** Zuletzt benutzte Ordner der Datei-Dialoge: Seit Electron 43 merkt sie sich das
   *  Betriebssystem nicht mehr, ohne Vorgabe öffnet jeder Dialog im Downloads-Ordner. */
  dialogDirs: Record<DialogDirKind, string | null>
  /** Lage und Inhaltsgröße der Fenster kleiner Werkzeuge (je Werkzeug, siehe shared/toolWindows) */
  toolWindowBounds: Record<string, { x: number; y: number; width: number; height: number }>
  /** YouTube-Downloader: Zielordner und Vorgaben */
  youtube: YoutubeSettings
  /** Stage-Timer: gemerkter Ablauf und NDI-Ausgabe */
  timer: TimerSettings
  /** Video-Konverter: Encoder-Wahl */
  converter: ConverterSettings
  /** Video-Generator: zuletzt gewählter Zielordner */
  videoGen: VideoGenSettings
  /** Fernsteuerungen von Jingle-Player, OSC-Steuerung und Stage-Timer (der
   *  Video-Player merkt sich seine unter player.remoteEnabled/remotePort). */
  remoteControls: Record<Exclude<RemoteControlId, 'player'>, RemoteControlSetting>
}

/** Teiländerung: Objekte feldweise optional, Listen immer ganz (siehe settingsMerge.ts). */
export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T

/** Was `setSettings` annimmt: nur die zu ändernden Felder, auch in player/osc/… */
export type SettingsPatch = DeepPartial<AppSettings>

export const DEFAULT_REMOTE_CONTROLS: AppSettings['remoteControls'] = {
  jingle: { enabled: false, port: 8089 },
  osc: { enabled: false, port: 8091 },
  timer: { enabled: false, port: 8092 }
}

export const DEFAULT_SETTINGS: AppSettings = {
  lastHapOutputDir: null,
  lastHapFormat: 'hap_q',
  lastImportDir: null,
  patternPresets: [],
  theme: 'dark', // bisheriges Erscheinungsbild bleibt Standard
  accent: 'gold', // Gold-Marke bleibt Standard
  player: DEFAULT_PLAYER_SETTINGS,
  osc: DEFAULT_OSC_SETTINGS,
  kioskToolId: null,
  favoriteToolIds: [],
  launcherFavoritesOnly: false,
  favoriteGroups: [],
  launcherTileSize: 'medium',
  uiDensity: 'normal',
  ytdlpAutoUpdate: true,
  ffmpegAutoUpdate: true,
  dialogDirs: { dateien: null, ordner: null, speichern: null },
  toolWindowBounds: {},
  youtube: DEFAULT_YOUTUBE_SETTINGS,
  timer: DEFAULT_TIMER_SETTINGS,
  converter: DEFAULT_CONVERTER_SETTINGS,
  videoGen: DEFAULT_VIDEOGEN_SETTINGS,
  remoteControls: DEFAULT_REMOTE_CONTROLS
}
