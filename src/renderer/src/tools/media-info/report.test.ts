import { describe, expect, it } from 'vitest'
import { analyzeMedia, DEFAULT_PROFILE } from './hints'
import { factSheet, safeCell, shortLine, toCsv, toJson, toTsv, type ReportRow } from './report'
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
const hints = analyzeMedia(info, DEFAULT_PROFILE)
const rows: ReportRow[] = [{ info, hints }]

describe('report', () => {
  it('Kurzzeile', () => {
    expect(shortLine(info)).toBe(
      'Opener; v3.mov — HAP Q · 1.920 × 1.080 · 25 fps · 00:03:12.40 · 7,48 GB · 311 Mbit/s · PCM 24 bit · 48 kHz · Stereo'
    )
  })

  it('Steckbrief mit Hinweisen und Prüfprofil', () => {
    const text = factSheet(info, hints, DEFAULT_PROFILE)
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

  it('Formel-Injektion: Zellen mit = + - @ werden zu Text', () => {
    expect(safeCell('=HYPERLINK("https://x.invalid";"Klick")')).toBe(
      `'=HYPERLINK("https://x.invalid";"Klick")`
    )
    expect(safeCell('-6dB Mix.mov')).toBe("'-6dB Mix.mov")
    expect(safeCell('Intro.mov')).toBe('Intro.mov')
    const evil = mediaInfo({ name: '=1+1.mov', path: '/x/=1+1.mov' })
    const row: ReportRow[] = [{ info: evil, hints: [] }]
    expect(toCsv(row, true).split('\r\n')[1].startsWith("'=1+1.mov;")).toBe(true)
    expect(toTsv(row).split('\n')[1].startsWith("'=1+1.mov\t")).toBe(true)
  })

  it('Excel-sicher: Chroma, MPEG-2-Profil und Kanal-Layouts nicht als Uhrzeit/Datum', () => {
    const m2 = mediaInfo({
      video: [
        videoTrack({ codecName: 'mpeg2video', codec: 'MPEG-2', profile: '4:2:2', chroma: '4:2:2' })
      ],
      audio: [audioTrack({ channels: 6, channelLayout: '5.1(side)' })]
    })
    const [head, line] = toTsv([{ info: m2, hints: [] }]).split('\n')
    const col = (name: string): string => line.split('\t')[head.split('\t').indexOf(name)]
    expect(col('Chroma')).toBe('YUV 4:2:2')
    expect(col('Profil')).toBe('4:2:2 Profile')
    expect(col('Kanaele')).toBe('6 Kanäle (5.1)')
    expect(col('Scan')).toBe('progressiv')
    expect(col('HDR')).toBe('SDR')
  })

  it('nicht lesbare Dateien stehen mit Status und Fehler im Export', () => {
    const failed: ReportRow = {
      info: null,
      path: '/Volumes/SHOW/kaputt.mov',
      error: 'MP4/MOV unvollständig',
      detail: 'moov atom not found'
    }
    const [head, ok, bad] = toTsv([...rows, failed])
      .split('\n')
      .map((l) => l.split('\t'))
    expect(ok).toHaveLength(head.length)
    expect(bad).toHaveLength(head.length)
    expect(ok[head.indexOf('Status')]).toBe('analysiert')
    expect(bad[head.indexOf('Datei')]).toBe('kaputt.mov')
    expect(bad[head.indexOf('Ordner')]).toBe('/Volumes/SHOW')
    expect(bad[head.indexOf('Status')]).toBe('Fehler')
    expect(bad[head.indexOf('Hinweise')]).toBe('MP4/MOV unvollständig (moov atom not found)')
    expect(toCsv([failed], true).split('\r\n')[1]).toMatch(/^kaputt\.mov;\/Volumes\/SHOW;Fehler;/)
    expect(JSON.parse(toJson([failed], DEFAULT_PROFILE)).files[0]).toEqual({
      path: '/Volumes/SHOW/kaputt.mov',
      error: 'MP4/MOV unvollständig',
      detail: 'moov atom not found'
    })
  })

  it('Tab, Zeilenumbruch und Anführungszeichen im Namen zerlegen keine Zeile', () => {
    const name = 'Intro\t"final"\nv2.mov'
    const row: ReportRow[] = [{ info: mediaInfo({ name, path: `/x/${name}` }), hints: [] }]
    const tsv = toTsv(row).split('\n')
    expect(tsv).toHaveLength(2)
    expect(tsv[1].split('\t')).toHaveLength(tsv[0].split('\t').length)
    expect(tsv[1].split('\t')[0]).toBe('Intro "final" v2.mov')
    const csv = toCsv(row, true)
    expect(csv).toContain('"Intro\t""final""\nv2.mov";/x;')
    // Datensätze enden mit CRLF – der LF im gequoteten Namen ist kein Zeilenende
    expect(csv.slice(1).split('\r\n')).toHaveLength(3)
  })

  it('Steckbrief und Kurzzeile: Scan-Kurzform, Sprache, Bittiefe nicht doppelt', () => {
    const tff = mediaInfo({
      video: [videoTrack({ scan: 'tff' })],
      audio: [
        audioTrack({
          codecName: 'pcm_s24le',
          codec: 'PCM 24 bit',
          lossy: false,
          bitDepth: 24,
          language: 'ger'
        })
      ]
    })
    const text = factSheet(tff, [], DEFAULT_PROFILE)
    expect(text).toContain('25 fps · interlaced (TFF)')
    expect(text).toContain('PCM 24 bit · 48 kHz · Stereo · Deutsch')
    expect(text).not.toMatch(/24 bit.*24 bit/)
    expect(shortLine(tff)).toContain('· 25 fps interlaced ·')
    const unknown = mediaInfo({ video: [videoTrack({ scan: 'unknown' })] })
    expect(factSheet(unknown, [], DEFAULT_PROFILE)).toContain('25 fps · Scan unbekannt')
  })
})
