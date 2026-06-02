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

/* -------------------------------- Dialog -------------------------------- */

export interface SelectPathsOptions {
  title?: string
  filters?: { name: string; extensions: string[] }[]
  multi?: boolean
  directories?: boolean // true => Ordnerauswahl
}

/* ------------------------------- Settings ------------------------------- */

export interface AppSettings {
  lastHapOutputDir: string | null
  lastHapFormat: HapFormat
  lastImportDir: string | null
}

export const DEFAULT_SETTINGS: AppSettings = {
  lastHapOutputDir: null,
  lastHapFormat: 'hap_q',
  lastImportDir: null
}
