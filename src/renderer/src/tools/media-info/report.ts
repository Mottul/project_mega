// Text-/Export-Formate der Medien-Info: Kurzzeile (Chat), Steckbrief (E-Mail/Doku),
// TSV (Einfügen in Excel), CSV (Excel-Deutsch mit BOM) und JSON. Rein -> testbar.

import type { MediaInfo } from '@shared/types'
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
  scanLabel,
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

/** Eine Zeile für Chat/Messenger: „clip.mov — HAP Q · 1920 × 1080 · 25p · …". */
export function shortLine(info: MediaInfo): string {
  const v = mainVideo(info)
  const parts: string[] = []
  if (v) {
    parts.push(v.codec)
    parts.push(fmtResolution(v.displayWidth, v.displayHeight))
    if (v.fpsMode !== 'still') parts.push(fpsLabel(v))
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
    const fps =
      v.fpsMode === 'still' ? 'Standbild' : `${fpsLabel(v)} ${scanLabel(v.scan).toLowerCase()}`
    lines.push(`${pad}${geo} · ${fps}`)
    lines.push(`${pad}Farbe: ${colorLabel(v)}${v.bitRate ? ` · ${fmtBitrate(v.bitRate)}` : ''}`)
  })
  if (!info.audio.length) lines.push(`${L('Audio')}keine Tonspur`)
  info.audio.forEach((a, i) => {
    const extra = [a.bitDepth ? `${a.bitDepth} bit` : null, a.language].filter(Boolean).join(' · ')
    lines.push(`${i === 0 ? L('Audio') : pad}${audioLine(a)}${extra ? ` · ${extra}` : ''}`)
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

export interface ReportRow {
  info: MediaInfo
  hints: MediaHint[]
}

const COLUMNS: { head: string; value: (r: ReportRow) => string | number | null }[] = [
  { head: 'Datei', value: (r) => r.info.name },
  { head: 'Ordner', value: (r) => splitPath(r.info.path).dir },
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
  { head: 'Profil', value: (r) => mainVideo(r.info)?.profile ?? null },
  { head: 'Breite', value: (r) => mainVideo(r.info)?.displayWidth ?? null },
  { head: 'Hoehe', value: (r) => mainVideo(r.info)?.displayHeight ?? null },
  { head: 'fps', value: (r) => mainVideo(r.info)?.fps ?? null },
  { head: 'fps_Modus', value: (r) => mainVideo(r.info)?.fpsMode ?? null },
  { head: 'Scan', value: (r) => mainVideo(r.info)?.scan ?? null },
  { head: 'Bittiefe', value: (r) => mainVideo(r.info)?.bitDepth ?? null },
  { head: 'Chroma', value: (r) => mainVideo(r.info)?.chroma ?? null },
  {
    head: 'Alpha',
    value: (r) => (mainVideo(r.info) ? (mainVideo(r.info)?.alpha ? 'ja' : 'nein') : null)
  },
  { head: 'HDR', value: (r) => mainVideo(r.info)?.hdr ?? null },
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
  { head: 'Kanaele', value: (r) => (r.info.audio[0] ? channelLabel(r.info.audio[0]) : null) },
  {
    head: 'Hinweise',
    value: (r) =>
      r.hints
        .filter((h) => h.level !== 'ok')
        .map((h) => h.title)
        .join(' | ')
  }
]

/** Tabulator-getrennt mit Kopfzeile – direkt in Excel/Sheets einfügbar. */
export function toTsv(rows: ReportRow[]): string {
  const clean = (v: string | number | null): string =>
    v === null ? '' : typeof v === 'number' ? fmtNumber(v, true) : v.replace(/[\t\r\n]+/g, ' ')
  return [
    COLUMNS.map((c) => c.head).join('\t'),
    ...rows.map((r) => COLUMNS.map((c) => clean(c.value(r))).join('\t'))
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
  const cell = (v: string | number | null): string => {
    if (v === null) return ''
    const s = typeof v === 'number' ? fmtNumber(v, german) : v
    // Nur quoten, was das Trennzeichen/Anführungszeichen/Umbrüche enthält – „192,4"
    // bleibt im deutschen CSV eine Zahl.
    const needsQuote = s.includes(sep) || /["\r\n]/.test(s)
    return needsQuote ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [
    COLUMNS.map((c) => c.head).join(sep),
    ...rows.map((r) => COLUMNS.map((c) => cell(c.value(r))).join(sep))
  ]
  return (german ? '﻿' : '') + lines.join('\r\n') + '\r\n'
}

/** JSON-Export (Werte normalisiert, ohne ffprobe-Rohdaten). */
export function toJson(rows: ReportRow[], profile: CheckProfile): string {
  return JSON.stringify(
    {
      tool: 'mottulbox-media-info',
      version: 1,
      createdAt: new Date().toISOString(),
      profile,
      files: rows.map((r) => ({ info: r.info, hints: r.hints }))
    },
    null,
    2
  )
}
