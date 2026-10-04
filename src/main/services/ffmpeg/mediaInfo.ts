// Medien-Info im main-Prozess: ffprobe aufrufen (mit Timeout, begrenzter
// Parallelität und lesbaren deutschen Fehlern), Ergebnis normalisieren, cachen.
// Die eigentlichen Regeln stecken in mediaInfoParse.ts (rein, getestet).

import { execFile } from 'node:child_process'
import { open, readdir, stat } from 'node:fs/promises'
import { extname, isAbsolute, join } from 'node:path'
import {
  AUDIO_EXTENSIONS,
  dotted,
  PROBE_EXTENSIONS,
  VIDEO_EXTENSIONS
} from '@shared/mediaExtensions'
import type {
  MediaCollectResult,
  MediaInfo,
  MediaInfoResult,
  MediaProbeOptions,
  ProbeResult
} from '@shared/types'
import { logLine } from '../log'
import { ffmpegBinPath } from './ffmpegPath'
import {
  analyzePackets,
  applyDeepAnalysis,
  describeProbeError,
  lastLine,
  PACKET_SCAN_LIMIT,
  parseFirstFrame,
  parseMediaInfo,
  type FfprobeJson
} from './mediaInfoParse'

// Großzügig für Netzlaufwerke/aufwachende USB-Platten; lokal dauert ein Lauf ~10–50 ms.
const TIMEOUT_MS = 20_000
// Mehr parallele Prozesse bringen nichts, bremsen aber USB-Sticks/Netzfreigaben.
const MAX_PARALLEL = 4
const CACHE_MAX = 500
const COLLECT_MAX = 5000
const PROBE_EXT = new Set(dotted(PROBE_EXTENSIONS))
const VIDEO_EXT = new Set(dotted(VIDEO_EXTENSIONS))
const AUDIO_EXT = new Set(dotted(AUDIO_EXTENSIONS))
// Systemmüll auf Show-Sticks (macOS AppleDouble „._clip.mov", Windows-Papierkorb …)
const SKIP_DIRS = new Set(['$recycle.bin', 'system volume information'])
const SKIP_FILES = new Set(['thumbs.db', 'desktop.ini'])

/* ------------------------------- Semaphore ------------------------------- */

let active = 0
const waiting: (() => void)[] = []

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve))
  active++
  try {
    return await fn()
  } finally {
    active--
    waiting.shift()?.()
  }
}

/* ------------------------------ ffprobe-Lauf ----------------------------- */

interface RunResult {
  ok: boolean
  stdout: string
  stderr: string
  /** Prozess konnte nicht starten (ffprobe fehlt) */
  missing: boolean
  timedOut: boolean
  /** anderer Startfehler (EACCES, EBADARCH …) – Werkzeug defekt, nicht die Datei */
  startError: string | null
  /** per Signal beendet (Absturz), ohne Zeitüberschreitung */
  signal: string | null
  tooLarge: boolean
  message: string | null
}

function runFfprobe(args: string[]): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      ffmpegBinPath('ffprobe'),
      args,
      { timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { killed?: boolean; signal?: string }) | null
        const code = typeof e?.code === 'string' ? e.code : null
        const tooLarge = code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
        const timedOut = Boolean(e?.killed) && !tooLarge
        resolve({
          ok: !e,
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
          missing: code === 'ENOENT',
          timedOut,
          startError: code && code !== 'ENOENT' && !tooLarge ? code : null,
          signal: !timedOut && !tooLarge && e?.signal ? e.signal : null,
          tooLarge,
          message: e?.message ?? null
        })
      }
    )
  })
}

/** Probleme mit ffprobe selbst (nicht mit der Datei) -> eigene, ehrliche Meldung. */
function toolProblem(run: RunResult): { error: string; detail: string | null } | null {
  if (run.missing) {
    return {
      error: 'ffprobe nicht gefunden',
      detail: 'ffmpeg/ffprobe fehlt (scripts/download-ffmpeg.mjs)'
    }
  }
  if (run.tooLarge) return { error: 'Antwort von ffprobe zu groß', detail: null }
  if (run.timedOut) {
    return {
      error: `Zeitüberschreitung (${TIMEOUT_MS / 1000} s)`,
      detail:
        'Sehr langsamer Datenträger oder Netzlaufwerk – Datei lokal kopieren und erneut versuchen.'
    }
  }
  if (run.startError) {
    return {
      error: `ffprobe konnte nicht gestartet werden (${run.startError})`,
      detail: run.message
    }
  }
  if (run.signal) {
    return { error: `ffprobe abgestürzt (${run.signal})`, detail: lastLine(run.stderr) }
  }
  return null
}

/** Erste Bytes der Datei (Signatur), z.B. um AppleDouble-„._"-Dateien zu erkennen. */
async function readHead(path: string): Promise<Uint8Array | undefined> {
  try {
    const fh = await open(path, 'r')
    try {
      const buf = Buffer.alloc(16)
      const { bytesRead } = await fh.read(buf, 0, 16, 0)
      return buf.subarray(0, bytesRead)
    } finally {
      await fh.close()
    }
  } catch {
    return undefined
  }
}

const BASE_ARGS = [
  '-v',
  'error', // statt quiet: sonst geht der Fehlergrund verloren
  '-hide_banner',
  '-print_format',
  'json',
  '-show_format',
  '-show_streams',
  '-show_chapters',
  '-show_error'
]

// Zu wenig Probedaten (lange Header, späte Streams in TS/MKV): Werte fehlen, ohne
// dass ffprobe bei -v error etwas meldet -> nur an den Werten erkennbar.
function needsDeeperProbe(json: FfprobeJson): boolean {
  return (json.streams ?? []).some(
    (s) =>
      (s.codec_type === 'video' &&
        s.codec_name &&
        s.disposition?.attached_pic !== 1 &&
        (!s.width || !s.pix_fmt)) ||
      (s.codec_type === 'audio' && s.codec_name && (!pos(s.sample_rate) || !s.channels))
  )
}

function pos(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/* --------------------------------- Cache --------------------------------- */

interface CacheEntry {
  size: number
  mtimeMs: number
  info: MediaInfo
  raw: string
}
const cache = new Map<string, CacheEntry>()

function remember(path: string, entry: CacheEntry): void {
  cache.delete(path)
  cache.set(path, entry)
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

/* ------------------------------ Tiefenanalyse ---------------------------- */

async function deepAnalyze(path: string, info: MediaInfo): Promise<MediaInfo> {
  const v = info.video.find((t) => t.fpsMode !== 'still')
  if (!v || !v.codecName) return { ...info, deepAnalyzed: true }
  const idx = String(v.index)
  // Paket-Scan nur, wo er etwas aussagt (GOP bei Long-GOP, VFR-Nachweis). Bei
  // Intra-/GPU-Codecs würde er nur viele MB lesen (HAP 4K), ohne Erkenntnis.
  const wantPackets = v.codecClass === 'longgop' || v.fpsMode === 'vfr-suspect'
  // Erstes Frame: Scan-Typ, wenn der Container ihn nicht nennt (DNx/DV/MJPEG), und
  // HDR10-Metadaten, die nur im SEI stehen.
  const wantFrame = v.scan === 'unknown' || (v.hdr === 'pq' && v.masteringMaxNits === null)

  const [packets, frame] = await Promise.all([
    wantPackets
      ? runFfprobe([
          '-v',
          'error',
          '-hide_banner',
          '-select_streams',
          idx,
          '-read_intervals',
          `%+#${PACKET_SCAN_LIMIT}`,
          '-show_entries',
          'packet=pts_time,flags',
          '-of',
          'csv=p=0',
          '-i',
          path
        ])
      : null,
    wantFrame
      ? runFfprobe([
          '-v',
          'error',
          '-hide_banner',
          '-select_streams',
          idx,
          '-read_intervals',
          '%+#1',
          '-show_frames',
          '-show_entries',
          'frame=interlaced_frame,top_field_first,side_data_list',
          '-of',
          'json',
          '-i',
          path
        ])
      : null
  ])
  const gop = packets?.ok ? analyzePackets(packets.stdout, PACKET_SCAN_LIMIT) : null
  let frameInfo = null
  if (frame?.ok) {
    try {
      frameInfo = parseFirstFrame(JSON.parse(frame.stdout))
    } catch {
      frameInfo = null
    }
  }
  return applyDeepAnalysis(info, gop, frameInfo)
}

/* ---------------------------------- API ---------------------------------- */

/**
 * Eckdaten einer Datei. Wirft NICHT bei Datei-/Formatfehlern, sondern liefert
 * { ok: false, error } – ein Ordner mit einer defekten Datei läuft so weiter.
 */
export async function probeMediaInfo(
  path: string,
  opts: MediaProbeOptions = {}
): Promise<MediaInfoResult> {
  const fail = (error: string, detail: string | null = null): MediaInfoResult => ({
    ok: false,
    path,
    error,
    detail
  })
  // ffprobe öffnet sonst auch URLs/Protokolle („http:", „concat:") -> nur echte Pfade
  if (typeof path !== 'string' || !isAbsolute(path)) return fail('Ungültiger Dateipfad')
  let st
  try {
    st = await stat(path)
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return fail('Datei nicht gefunden (verschoben oder Laufwerk getrennt?)')
    if (code === 'EACCES' || code === 'EPERM') return fail('Keine Leserechte')
    return fail('Datei nicht lesbar', (e as Error).message)
  }
  if (st.isDirectory()) return fail('Ist ein Ordner')
  if (st.size === 0) return fail('Datei ist leer (0 Byte)')

  const hit = cache.get(path)
  if (
    !opts.force &&
    hit &&
    hit.size === st.size &&
    hit.mtimeMs === st.mtimeMs &&
    (hit.info.deepAnalyzed || !opts.deep)
  ) {
    return { ok: true, info: hit.info }
  }

  return withSlot(async () => {
    let run = await runFfprobe([...BASE_ARGS, '-i', path])
    const problem = toolProblem(run)
    if (problem) return fail(problem.error, problem.detail)
    if (!run.ok) {
      const d = describeProbeError(run.stdout, run.stderr, path, await readHead(path))
      return fail(d.error, d.detail)
    }
    let json: FfprobeJson
    try {
      json = JSON.parse(run.stdout) as FfprobeJson
    } catch {
      return fail('Antwort von ffprobe nicht lesbar', lastLine(run.stderr))
    }
    if (needsDeeperProbe(json)) {
      const retry = await runFfprobe([
        ...BASE_ARGS,
        '-probesize',
        '100M',
        '-analyzeduration',
        '30000000',
        '-i',
        path
      ])
      if (retry.ok) {
        try {
          json = JSON.parse(retry.stdout) as FfprobeJson
          run = retry
        } catch {
          // erste Antwort behalten
        }
      }
    }
    // Textdateien erkennt ffprobe als „tty" mit hoher Sicherheit – keine Mediendatei.
    if (json.format?.format_name === 'tty') return fail('Keine Mediendatei (Textdatei)')
    const streams = (json.streams ?? []).filter(
      (s) => s.codec_type === 'video' || s.codec_type === 'audio'
    )
    if (!streams.length) return fail('Keine Bild- oder Tonspur gefunden')

    let info = parseMediaInfo(json, { path, sizeBytes: st.size, modifiedMs: st.mtimeMs })
    if (opts.deep) {
      try {
        info = await deepAnalyze(path, info)
      } catch (e) {
        logLine('[mediaInfo] Tiefenanalyse fehlgeschlagen:', path, (e as Error).message)
      }
    }
    remember(path, { size: st.size, mtimeMs: st.mtimeMs, info, raw: run.stdout })
    return { ok: true as const, info }
  })
}

/** Rohausgabe von ffprobe (formatiertes JSON) – aus dem Cache oder neu gelesen. */
export async function rawMediaInfo(path: string): Promise<string | null> {
  if (!cache.has(path)) await probeMediaInfo(path)
  const raw = cache.get(path)?.raw
  if (!raw) return null
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

/** Schlanke Probe für die HAP-Warteschlange (gemeinsamer Runner: Timeout, Fehlertexte). */
export async function probeBasic(path: string): Promise<ProbeResult> {
  const res = await probeMediaInfo(path)
  if (!res.ok) throw new Error(res.detail ? `${res.error} (${res.detail})` : res.error)
  const v = res.info.video[0]
  return {
    path,
    width: v?.width || null,
    height: v?.height || null,
    durationSec: res.info.durationSec ?? v?.durationSec ?? null,
    fps: v?.fps ?? null,
    codec: v?.codecName ?? null,
    hasVideo: Boolean(v)
  }
}

/* ---------------------------- Ordner einsammeln -------------------------- */

const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' })

/**
 * Eingaben (Dateien/Ordner) zu Mediendateien auflösen. Direkt gewählte Dateien
 * zählen immer (bewusst gewählt), in Ordnern nur bekannte Medien-Endungen.
 * Asynchron, überspringt Systemdateien; verlinkte Dateien zählen, verlinkte Ordner
 * nicht (sonst drohen Schleifen).
 */
export async function collectMediaFiles(inputs: string[]): Promise<MediaCollectResult> {
  const files = new Set<string>()
  const unreadable: string[] = []
  let ignored = 0
  let limited = false

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      unreadable.push(dir)
      return
    }
    entries.sort((a, b) => collator.compare(a.name, b.name))
    for (const e of entries) {
      if (files.size >= COLLECT_MAX) {
        limited = true
        return
      }
      const lower = e.name.toLowerCase()
      if (e.name.startsWith('.') || SKIP_FILES.has(lower) || SKIP_DIRS.has(lower)) {
        if (e.name.startsWith('._') || SKIP_FILES.has(lower) || e.name === '.DS_Store') ignored++
        continue
      }
      const full = join(dir, e.name)
      if (e.isDirectory()) await walk(full)
      else if (!PROBE_EXT.has(extname(e.name).toLowerCase())) continue
      else if (e.isFile()) files.add(full)
      else if (e.isSymbolicLink()) {
        try {
          if ((await stat(full)).isFile()) files.add(full)
        } catch {
          // toter Link -> ignorieren
        }
      }
    }
  }

  for (const input of inputs) {
    if (typeof input !== 'string' || !isAbsolute(input)) continue
    try {
      const st = await stat(input)
      if (st.isDirectory()) await walk(input)
      else if (files.size < COLLECT_MAX) files.add(input)
      else limited = true
    } catch {
      unreadable.push(input)
    }
  }
  return { files: [...files], ignored, unreadable, limited }
}

/**
 * Eingaben des Video-Konverters auflösen: direkt gewählte Dateien immer (auch ohne
 * bekannte Endung), aus Ordnern nur Videos – bei „nur Ton" auch Ton-Dateien.
 */
export async function collectConvertInputs(inputs: string[], withAudio = false): Promise<string[]> {
  const direct = new Set(inputs)
  const res = await collectMediaFiles(inputs)
  return res.files.filter((f) => {
    const ext = extname(f).toLowerCase()
    return direct.has(f) || VIDEO_EXT.has(ext) || (withAudio && AUDIO_EXT.has(ext))
  })
}
