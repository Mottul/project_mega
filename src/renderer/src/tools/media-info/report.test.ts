import { describe, expect, it } from 'vitest'
import { analyzeMedia, DEFAULT_PROFILE } from './hints'
import { factSheet, shortLine, toCsv, toJson, toTsv, type ReportRow } from './report'
import { audioTrack, mediaInfo, videoTrack } from './testFactory'

const info = mediaInfo({
  path: '/Volumes/SHOW/Intro/Opener; v3.mov',
  name: 'Opener; v3.mov',
  sizeBytes: 7_480_000_000,
  durationSec: 192.4,
  bitRate: 311_000_000,
  timecode: '01:00:00:00',
  video: [
    videoTrack({
      codecName: 'hap',
      codec: 'HAP Q',
      profile: null,
      level: null,
      codecClass: 'gpu',
      bitDepth: 8,
      chroma: 'RGB'
    })
  ],
  audio: [audioTrack({ codecName: 'pcm_s24le', codec: 'PCM 24 bit', lossy: false, bitDepth: 24 })]
})
const rows: ReportRow[] = [{ info, hints: analyzeMedia(info, DEFAULT_PROFILE) }]

describe('report', () => {
  it('Kurzzeile', () => {
    expect(shortLine(info)).toBe(
      'Opener; v3.mov — HAP Q · 1.920 × 1.080 · 25 fps · 00:03:12.40 · 7,48 GB · 311 Mbit/s · PCM 24 bit · 48 kHz · Stereo'
    )
  })

  it('Steckbrief mit Hinweisen und Prüfprofil', () => {
    const text = factSheet(info, rows[0].hints, DEFAULT_PROFILE)
    expect(text).toContain('Datei:      Opener; v3.mov (7,48 GB)')
    expect(text).toContain('Timecode:   01:00:00:00')
    expect(text).toMatch(/Hinweise: {3}WARNUNG {2}Größer als 4 GB/)
    expect(text).toContain('Profil: Allgemein')
  })

  it('CSV für Excel (Deutsch): BOM, Semikolon, Dezimalkomma, Quoting', () => {
    const csv = toCsv(rows, true)
    expect(csv.startsWith('﻿')).toBe(true)
    const [head, line] = csv.slice(1).split('\r\n')
    expect(head.split(';')[0]).toBe('Datei')
    expect(line.startsWith('"Opener; v3.mov";')).toBe(true) // Trennzeichen im Namen -> gequotet
    expect(line).toContain(';192,4;')
  })

  it('CSV Standard: Komma + Dezimalpunkt, ohne BOM', () => {
    const csv = toCsv(rows, false)
    expect(csv.startsWith('Datei,')).toBe(true)
    expect(csv).toContain(',192.4,')
  })

  it('TSV ohne Tabs/Zeilenumbrüche in Zellen; JSON enthält Hinweise', () => {
    const tsv = toTsv(rows)
    expect(tsv.split('\n')).toHaveLength(2)
    const json = JSON.parse(toJson(rows, DEFAULT_PROFILE))
    expect(json.files[0].info.name).toBe('Opener; v3.mov')
    expect(json.files[0].hints.some((h: { id: string }) => h.id === 'fat32')).toBe(true)
  })
})
