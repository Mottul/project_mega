import { describe, expect, it } from 'vitest'
import type { VgenElement } from './types'
import {
  DEFAULT_VGEN_PROJECT,
  isSafeAbsolutePath,
  sanitizeVgenProject,
  validOutputPath
} from './videoGenProject'

const el = (p: Partial<VgenElement> = {}): VgenElement => ({
  id: 'a1',
  path: 'C:\\Show\\foto.jpg',
  kind: 'image',
  durationSec: 4,
  inSec: null,
  outSec: null,
  kenBurns: { mode: 'zoom-in', strength: 'soft' },
  fit: null,
  transition: { kind: 'dissolve', durationSec: 0.8 },
  audio: true,
  ...p
})

describe('Video-Generator – Eingaben prüfen', () => {
  it('gültiges Projekt bleibt unverändert', () => {
    const p = { ...DEFAULT_VGEN_PROJECT, elements: [el()] }
    expect(sanitizeVgenProject(JSON.parse(JSON.stringify(p)))).toEqual(p)
  })

  it('ungültige Elemente fallen weg, ungültige Einzelwerte werden zur Vorgabe', () => {
    const p = sanitizeVgenProject({
      ...DEFAULT_VGEN_PROJECT,
      elements: [
        el({ id: 'ok' }),
        el({ id: 'relativ', path: 'foto.jpg' }),
        el({ id: 'protokoll', path: 'concat:a|b' }),
        el({ id: 'x', kind: 'audio' as never }),
        el({
          id: 'werte',
          transition: { kind: 'explode' as never, durationSec: 1 },
          kenBurns: { mode: 'spin' as never, strength: 'soft' },
          fit: 'stretch' as never,
          durationSec: 99999
        })
      ]
    })
    expect(p?.elements.map((e) => e.id)).toEqual(['ok', 'werte'])
    expect(p?.elements[1]).toMatchObject({
      transition: null,
      kenBurns: null,
      fit: null,
      durationSec: 3600
    })
  })

  it('Ausgabe: Maße gerade und begrenzt, nur erlaubte Raten und Formate', () => {
    const base = { ...DEFAULT_VGEN_PROJECT, elements: [] }
    const odd = sanitizeVgenProject({
      ...base,
      output: { ...base.output, width: 1921, height: 99999 }
    })
    expect(odd?.output).toMatchObject({ width: 1920, height: 8192 })
    expect(sanitizeVgenProject({ ...base, output: { ...base.output, fps: 12.5 } })).toBeNull()
    expect(sanitizeVgenProject({ ...base, output: { ...base.output, fps: 29.97 } })).toBeNull()
    expect(
      sanitizeVgenProject({ ...base, output: { ...base.output, fps: 30000 / 1001 } })?.output.fps
    ).toBe(30000 / 1001)
    expect(
      sanitizeVgenProject({ ...base, output: { ...base.output, format: 'prores_4444' } })
    ).toBeNull()
    expect(
      sanitizeVgenProject({ ...base, output: { ...base.output, background: 'red; drop' } })?.output
        .background
    ).toBe('#000000')
  })

  it('doppelte ids, kein Array, zu viele Elemente: abgelehnt', () => {
    expect(sanitizeVgenProject({ ...DEFAULT_VGEN_PROJECT, elements: [el(), el()] })).toBeNull()
    expect(sanitizeVgenProject({ ...DEFAULT_VGEN_PROJECT, elements: 'x' })).toBeNull()
    expect(
      sanitizeVgenProject({
        ...DEFAULT_VGEN_PROJECT,
        elements: Array.from({ length: 2001 }, (_, i) => el({ id: `e${i}` }))
      })
    ).toBeNull()
    expect(sanitizeVgenProject(null)).toBeNull()
  })

  it('Ausschnitt: Ende nie vor dem Start; Musik und Lautheit begrenzt', () => {
    const p = sanitizeVgenProject({
      ...DEFAULT_VGEN_PROJECT,
      elements: [el({ kind: 'video', path: '/media/clip.mov', inSec: 5, outSec: 2 })],
      music: {
        tracks: ['/media/a.mp3', 'relativ.mp3', 'http://x/b.mp3', '/media/b.flac'],
        gainDb: -99,
        fadeInSec: 2,
        fadeOutSec: 'x',
        crossfadeSec: 99,
        duckDb: 6
      },
      loudnorm: { i: -16, tp: -1.5, lra: 11 }
    })
    expect(p?.elements[0]).toMatchObject({ inSec: 5, outSec: 5 })
    expect(p?.music).toEqual({
      tracks: ['/media/a.mp3', '/media/b.flac'],
      gainDb: -40,
      fadeInSec: 2,
      fadeOutSec: 0,
      crossfadeSec: 10,
      duckDb: 0
    })
    expect(p?.loudnorm).toEqual({ i: -16, tp: -1.5, lra: 11 })
  })

  it('Musik aus Phase 1 (ein Titel unter `path`) wird übernommen; ohne Titel keine Musik', () => {
    const old = sanitizeVgenProject({
      ...DEFAULT_VGEN_PROJECT,
      music: { path: '/media/musik.mp3', gainDb: -6, fadeInSec: 2, fadeOutSec: 3 }
    })
    expect(old?.music).toEqual({
      tracks: ['/media/musik.mp3'],
      gainDb: -6,
      fadeInSec: 2,
      fadeOutSec: 3,
      crossfadeSec: 2,
      duckDb: 0
    })
    expect(
      sanitizeVgenProject({ ...DEFAULT_VGEN_PROJECT, music: { tracks: ['x.mp3'] } })?.music
    ).toBeNull()
  })

  it('eigener Ken-Burns-Rahmen: Werte begrenzt, nie als Vorgabe', () => {
    const p = sanitizeVgenProject({
      ...DEFAULT_VGEN_PROJECT,
      defaults: {
        ...DEFAULT_VGEN_PROJECT.defaults,
        kenBurns: { mode: 'custom', strength: 'soft' }
      },
      elements: [
        el({
          kenBurns: {
            mode: 'custom',
            strength: 'medium',
            from: { cx: -3, cy: 0.4, zoom: 9 },
            to: { cx: 0.7, cy: 'x' as never, zoom: 1.5 }
          }
        })
      ]
    })
    expect(p?.defaults.kenBurns).toEqual({ mode: 'auto', strength: 'soft' })
    // ungültiges Ende: wie der Start (ruhiger Rahmen statt Sprung)
    expect(p?.elements[0].kenBurns).toEqual({
      mode: 'custom',
      strength: 'medium',
      from: { cx: 0, cy: 0.4, zoom: 4 },
      to: { cx: 0, cy: 0.4, zoom: 4 }
    })
  })

  it('Pfade: nur absolute ohne Protokoll; Zieldatei mit passender Endung', () => {
    expect(isSafeAbsolutePath('C:\\a\\b.jpg')).toBe(true)
    expect(isSafeAbsolutePath('\\\\server\\share\\b.jpg')).toBe(true)
    expect(isSafeAbsolutePath('/home/a.jpg')).toBe(true)
    expect(isSafeAbsolutePath('http://x/a.jpg')).toBe(false)
    expect(isSafeAbsolutePath('a.jpg')).toBe(false)
    expect(isSafeAbsolutePath('C:\\a\nb.jpg')).toBe(false)
    expect(validOutputPath('C:\\out\\show.mp4', 'h264')).toBe(true)
    expect(validOutputPath('C:\\out\\show.mov', 'h264')).toBe(false)
    expect(validOutputPath('C:\\out\\show.MOV', 'hap_q')).toBe(true)
  })
})
