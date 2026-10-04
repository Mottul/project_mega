// Text-/Export-Formate der Medien-Info: Kurzzeile (Chat), Steckbrief (E-Mail/Doku),
// TSV (Einfügen in Excel), CSV (Excel-Deutsch mit BOM) und JSON. Rein -> testbar.

import type { MediaAudioTrack, MediaInfo, MediaScanType, MediaVideoTrack } from '@shared/types'
import {
  audioLine,
  channelLabel,
  codecLine,
  colorLabel,
  fmtBitrate,
  fmtBytes,
  fmtDate,
  fmtDuration,
  fmtMBps,
  fmtResolution,
  aspectLabel,
  fpsLabel,
  hdrLabel,
  languageLabel,
  splitPath
} from './format'
import {
  MEDIUM_OPTIONS,
  RASTER_OPTIONS,
  TARGET_OPTIONS,
  mainVideo,
  type CheckProfile,
  type MediaHint
} from './hints'

const LEVEL_TEXT: Record<MediaHint['level'], string> = {
  problem: 'PROBLEM',
  warning: 'WARNUNG',
  info: 'INFO',
  ok: 'OK'
}

// Kurzform für Fließtext („25 fps · progressiv"); „unbekannt" allein wäre mehrdeutig.
const SCAN_SHORT: Record<MediaScanType, string> = {
  progressive: 'progressiv',
  tff: 'interlaced (TFF)',
  bff: 'interlaced (BFF)',
  unknown: 'Scan unbekannt'
}

const isInterlaced = (v: MediaVideoTrack): boolean => v.scan === 'tff' || v.scan === 'bff'

/** Eine Zeile für Chat/Messenger: „clip.mov — HAP Q · 1.920 × 1.080 · 25 fps · …". */
export function shortLine(info: MediaInfo): string {
  const v = mainVideo(info)
  const parts: string[] = []
  if (v) {
    parts.push(v.codec)
    parts.push(fmtResolution(v.displayWidth, v.displayHeight))
    // Interlaced gehört in die Kurzzeile – „25 fps" allein klingt nach fertigem Show-Material
    if (v.fpsMode !== 'still') parts.push(`${fpsLabel(v)}${isInterlaced(v) ? ' interlaced' : ''}`)
  }
  if (info.durationSec) parts.push(fmtDuration(info.durationSec))
  if (info.sizeBytes) parts.push(fmtBytes(info.sizeBytes))
  if (info.bitRate) parts.push(fmtBitrate(info.bitRate))
  const a = info.audio[0]
  parts.push(a ? audioLine(a) : 'ohne Ton')
  return `${info.name} — ${parts.join(' · ')}`
}

function profileText(p: CheckProfile): string {
  const t = TARGET_OPTIONS.find((o) => o.value === p.target)?.label.split(' (')[0] ?? p.target
  const extras = [
    p.raster !== 'none' ? RASTER_OPTIONS.find((o) => o.value === p.raster)?.label : null,
    p.medium !== 'none' ? MEDIUM_OPTIONS.find((o) => o.value === p.medium)?.label : null
  ].filter(Boolean)
  return [t, ...extras].join(', ')
}

/** Mehrzeiliger Steckbrief mit fester Labelbreite (Monospace/E-Mail). */
export function factSheet(info: MediaInfo, hints: MediaHint[], profile: CheckProfile): string {
  const L = (label: string): string => `${label}:`.padEnd(12)
  const pad = ' '.repeat(12)
  const lines: string[] = []
  lines.push(`${L('Datei')}${info.name}${info.sizeBytes ? ` (${fmtBytes(info.sizeBytes)})` : ''}`)
  lines.push(
    `${L('Container')}${[info.container, info.durationSec ? fmtDuration(info.durationSec) : null, info.bitRate ? `${fmtBitrate(info.bitRate)} (${fmtMBps(info.bitRate)})` : null].filter(Boolean).join(' · ')}`
  )
  info.video.forEach((v, i) => {
    const label = i === 0 ? L('Video') : pad
    lines.push(`${label}${codecLine(v)}`)
    const geo = `${fmtResolution(v.displayWidth, v.displayHeight)} (${aspectLabel(v.displayWidth, v.displayHeight)})`
    const fps = v.fpsMode === 'still' ? 'Standbild' : `${fpsLabel(v)} · ${SCAN_SHORT[v.scan]}`
    lines.push(`${pad}${geo} · ${fps}`)
    lines.push(`${pad}Farbe: ${colorLabel(v)}${v.bitRate ? ` · ${fmtBitrate(v.bitRate)}` : ''}`)
  })
  if (!info.audio.length) lines.push(`${L('Audio')}keine Tonspur`)
  info.audio.forEach((a, i) => {
    const line = audioLine(a)
    // PCM trägt die Bittiefe schon im Codec-Namen („PCM 24 bit") -> nicht doppelt
    const depth = a.bitDepth && !line.includes(`${a.bitDepth} bit`) ? `${a.bitDepth} bit` : null
    const extra = [depth, languageLabel(a.language)].filter(Boolean).join(' · ')
    lines.push(`${i === 0 ? L('Audio') : pad}${line}${extra ? ` · ${extra}` : ''}`)
  })
  if (info.timecode) lines.push(`${L('Timecode')}${info.timecode}`)
  const relevant = hints.filter((h) => h.level !== 'ok')
  if (!relevant.length) lines.push(`${L('Hinweise')}keine`)
  relevant.forEach((h, i) => {
    lines.push(`${i === 0 ? L('Hinweise') : pad}${LEVEL_TEXT[h.level].padEnd(9)}${h.title}`)
  })
  lines.push(`${L('Geprüft')}${fmtDate(Date.now())} · Profil: ${profileText(profile)}`)
  return lines.join('\n')
}

/** Analysierte Datei … */
export interface ReportOk {
  info: MediaInfo
  hints: MediaHint[]
}

/** … oder nicht lesbare Datei: gehört trotzdem in die Liste (sonst fehlt sie stillschweigend). */
export interface ReportFailed {
  info: null
  path: string
  error: string
  detail?: string | null
}

export type ReportRow = ReportOk | ReportFailed

type Cell = string | number | null

// Excel deutet „4:2:0" als Uhrzeit (04:02:00) und „5.1" als Datum (5. Januar) – solche
// Werte eindeutig als Text formulieren, statt sie beim Öffnen still umdeuten zu lassen.
const TIME_LIKE = /^\d+:\d+(:\d+)?$/

function chromaText(v: MediaVideoTrack): string | null {
  if (!v.chroma) return null
  return TIME_LIKE.test(v.chroma) ? `YUV ${v.chroma}` : v.chroma
}

function videoProfileText(v: MediaVideoTrack): string | null {
  if (!v.profile) return null
  return TIME_LIKE.test(v.profile) ? `${v.profile} Profile` : v.profile
}

function channelsText(a: MediaAudioTrack): string {
  const label = channelLabel(a)
  return /^\d+\.\d+$/.test(label) ? `${a.channels ?? '?'} Kanäle (${label})` : label
}

const FPS_MODE_TEXT: Record<MediaVideoTrack['fpsMode'], string> = {
  cfr: 'konstant',
  vfr: 'variabel',
  'vfr-suspect': 'variabel?',
  still: 'Standbild',
  unknown: 'unbekannt'
}

const COLUMNS: {
  head: string
  value: (r: ReportOk) => Cell
  failed?: (r: ReportFailed) => Cell
}[] = [
  {
    head: 'Datei',
    value: (r) => r.info.name,
    failed: (r) => splitPath(r.path).name
  },
  {
    head: 'Ordner',
    value: (r) => splitPath(r.info.path).dir,
    failed: (r) => splitPath(r.path).dir
  },
  { head: 'Status', value: () => 'analysiert', failed: () => 'Fehler' },
  { head: 'Probleme', value: (r) => r.hints.filter((h) => h.level === 'problem').length },
  { head: 'Warnungen', value: (r) => r.hints.filter((h) => h.level === 'warning').length },
  { head: 'Container', value: (r) => r.info.container },
  { head: 'Dauer', value: (r) => (r.info.durationSec ? fmtDuration(r.info.durationSec) : null) },
  { head: 'Dauer_s', value: (r) => r.info.durationSec },
  { head: 'Groesse_Bytes', value: (r) => r.info.sizeBytes },
  {
    head: 'Gesamt_kbps',
    value: (r) => (r.info.bitRate ? Math.round(r.info.bitRate / 1000) : null)
  },
  { head: 'Video_Codec', value: (r) => mainVideo(r.info)?.codec ?? null },
  { head: 'Profil', value: (r) => vid(r, videoProfileText) },
  { head: 'Breite', value: (r) => mainVideo(r.info)?.displayWidth ?? null },
  { head: 'Hoehe', value: (r) => mainVideo(r.info)?.displayHeight ?? null },
  { head: 'fps', value: (r) => mainVideo(r.info)?.fps ?? null },
  { head: 'fps_Modus', value: (r) => vid(r, (v) => FPS_MODE_TEXT[v.fpsMode]) },
  {
    head: 'Scan',
    value: (r) => vid(r, (v) => (v.fpsMode === 'still' ? null : SCAN_SHORT[v.scan]))
  },
  { head: 'Bittiefe', value: (r) => mainVideo(r.info)?.bitDepth ?? null },
  { head: 'Chroma', value: (r) => vid(r, chromaText) },
  { head: 'Alpha', value: (r) => vid(r, (v) => (v.alpha ? 'ja' : 'nein')) },
  { head: 'HDR', value: (r) => vid(r, (v) => hdrLabel(v) ?? 'SDR') },
  {
    head: 'Video_kbps',
    value: (r) => {
      const b = mainVideo(r.info)?.bitRate
      return b ? Math.round(b / 1000) : null
    }
  },
  { head: 'Timecode', value: (r) => r.info.timecode },
  { head: 'Audio_Spuren', value: (r) => r.info.audio.length },
  { head: 'Audio_Codec', value: (r) => r.info.audio[0]?.codec ?? null },
  { head: 'Samplerate_Hz', value: (r) => r.info.audio[0]?.sampleRate ?? null },
  { head: 'Kanaele', value: (r) => (r.info.audio[0] ? channelsText(r.info.audio[0]) : null) },
  {
    head: 'Hinweise',
    value: (r) =>
      r.hints
        .filter((h) => h.level !== 'ok')
        .map((h) => h.title)
        .join(' | '),
    failed: (r) => (r.detail ? `${r.error} (${r.detail})` : r.error)
  }
]

function vid(r: ReportOk, f: (v: MediaVideoTrack) => Cell): Cell {
  const v = mainVideo(r.info)
  return v ? f(v) : null
}

function cells(r: ReportRow): Cell[] {
  return COLUMNS.map((c) => (r.info ? c.value(r) : (c.failed?.(r) ?? null)))
}

/**
 * Formel-Injektion verhindern: Excel/Numbers werten Zellen, die mit = + - @ (oder Tab/CR)
 * beginnen, als Formel aus – Dateinamen und Tags kommen aber aus fremden Dateien
 * („=HYPERLINK(…)"). Ein vorangestellter Apostroph macht sie zu reinem Text.
 */
export function safeCell(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

/** Tabulator-getrennt mit Kopfzeile – direkt in Excel/Sheets einfügbar. */
export function toTsv(rows: ReportRow[]): string {
  const clean = (v: Cell): string =>
    v === null
      ? ''
      : typeof v === 'number'
        ? fmtNumber(v, true)
        : safeCell(v.replace(/[\t\r\n]+/g, ' '))
  return [
    COLUMNS.map((c) => c.head).join('\t'),
    ...rows.map((r) => cells(r).map(clean).join('\t'))
  ].join('\n')
}

function fmtNumber(n: number, german: boolean): string {
  const s = Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000)
  return german ? s.replace('.', ',') : s
}

/**
 * CSV. german = Excel-Deutsch (Semikolon, Dezimalkomma, UTF-8-BOM, CRLF) – ohne BOM
 * zeigt Excel Umlaute falsch an. Sonst Komma + Dezimalpunkt.
 */
export function toCsv(rows: ReportRow[], german = true): string {
  const sep = german ? ';' : ','
  const cell = (v: Cell): string => {
    if (v === null) return ''
    const s = typeof v === 'number' ? fmtNumber(v, german) : safeCell(v)
    // Nur quoten, was das Trennzeichen/Anführungszeichen/Umbrüche enthält – „192,4"
    // bleibt im deutschen CSV eine Zahl.
    const needsQuote = s.includes(sep) || /["\r\n]/.test(s)
    return needsQuote ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [
    COLUMNS.map((c) => c.head).join(sep),
    ...rows.map((r) => cells(r).map(cell).join(sep))
  ]
  return (german ? '\uFEFF' : '') + lines.join('\r\n') + '\r\n'
}

/** JSON-Export (Werte normalisiert, ohne ffprobe-Rohdaten). */
export function toJson(rows: ReportRow[], profile: CheckProfile): string {
  return JSON.stringify(
    {
      tool: 'mottulbox-media-info',
      version: 1,
      createdAt: new Date().toISOString(),
      profile,
      files: rows.map((r) =>
        r.info
          ? { info: r.info, hints: r.hints }
          : { path: r.path, error: r.error, detail: r.detail ?? null }
      )
    },
    null,
    2
  )
}
