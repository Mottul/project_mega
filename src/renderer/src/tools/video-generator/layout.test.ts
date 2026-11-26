import { describe, expect, it } from 'vitest'
import type { VgenJob } from '@shared/types'
import {
  auftragAktiv,
  auftraegeZahl,
  auftragName,
  auftragZeile,
  storyboardZahl,
  vgenRaster
} from './layout'

describe('vgenRaster', () => {
  it('mit Aufträgen: jede Stufe kennt alle drei Felder', () => {
    for (const [stufe, r] of Object.entries(vgenRaster(true))) {
      expect([...new Set(r.areas.flat())].sort(), stufe).toEqual([
        'auftraege',
        'storyboard',
        'vorschau'
      ])
    }
  })

  it('ohne Aufträge fehlt nur ihr Bereich – keine leere Zeile', () => {
    for (const [stufe, r] of Object.entries(vgenRaster(false))) {
      expect([...new Set(r.areas.flat())].sort(), stufe).toEqual(['storyboard', 'vorschau'])
    }
  })

  it('breit und mittel: Storyboard links über die ganze Höhe, rechts Vorschau über Aufträgen', () => {
    for (const stufe of ['breit', 'mittel'] as const) {
      expect(vgenRaster(true)[stufe].areas, stufe).toEqual([
        ['storyboard', 'vorschau'],
        ['storyboard', 'auftraege']
      ])
      expect(vgenRaster(false)[stufe].areas, stufe).toEqual([['storyboard', 'vorschau']])
    }
  })

  it('schmal: Vorschau vor Storyboard vor Aufträgen', () => {
    expect(vgenRaster(true).schmal.areas.flat()).toEqual(['vorschau', 'storyboard', 'auftraege'])
    expect(vgenRaster(false).schmal.areas.flat()).toEqual(['vorschau', 'storyboard'])
  })

  it('die Spalten bleiben mit und ohne Aufträge gleich (das Storyboard springt nicht)', () => {
    for (const stufe of ['breit', 'mittel', 'schmal'] as const) {
      expect(vgenRaster(false)[stufe].columns).toBe(vgenRaster(true)[stufe].columns)
    }
  })

  it('so viele Spalten und Zeilen, wie das Raster angibt', () => {
    for (const mit of [true, false]) {
      for (const r of Object.values(vgenRaster(mit))) {
        const spalten = r.areas[0].length
        expect(r.areas.every((z) => z.length === spalten)).toBe(true)
        expect(r.columns.trim().split(/\s+(?![^(]*\))/).length).toBe(spalten)
        expect(r.rows.trim().split(/\s+(?![^(]*\))/).length).toBe(r.areas.length)
      }
    }
  })
})

describe('storyboardZahl', () => {
  it('Anzahl und Gesamtdauer', () => {
    expect(storyboardZahl(12, 48)).toBe('12 · 48 s')
    expect(storyboardZahl(3, 14.52)).toBe('3 · 14,5 s')
    expect(storyboardZahl(40, 125)).toBe('40 · 2:05,0')
  })

  it('während der Analyse nur die Anzahl, leer gar nichts', () => {
    expect(storyboardZahl(12, null)).toBe('12')
    expect(storyboardZahl(0, null)).toBeUndefined()
    expect(storyboardZahl(0, 0)).toBeUndefined()
  })
})

const job = (p: Partial<VgenJob> = {}): VgenJob => ({
  id: 'j',
  status: 'queued',
  stage: null,
  stageText: '',
  progress: 0,
  outputPath: 'C:\\Videos\\Gala-Diashow.mp4',
  title: 'Gala-Diashow',
  durationSec: 48,
  width: 1920,
  height: 1080,
  fps: 25,
  formatLabel: 'H.264',
  encoder: null,
  cachedPieces: 0,
  renderedPieces: 0,
  hints: [],
  createdAt: 0,
  ...p
})

describe('auftraegeZahl', () => {
  it('nennt nur, was es gibt', () => {
    expect(auftraegeZahl([job({ status: 'done' })])).toBe('1')
    expect(
      auftraegeZahl([
        job({ status: 'running' }),
        job({ status: 'queued' }),
        job({ status: 'queued' }),
        job({ status: 'error' })
      ])
    ).toBe('4 · 1 läuft · 2 warten')
    expect(auftraegeZahl([job({ status: 'probing' }), job({ status: 'running' })])).toBe(
      '2 · 2 laufen'
    )
    expect(auftraegeZahl([job({ status: 'queued' }), job({ status: 'canceled' })])).toBe(
      '2 · 1 wartet'
    )
  })
})

describe('auftragAktiv', () => {
  it('wartet, analysiert oder rechnet – sonst fertig', () => {
    expect(
      ['queued', 'probing', 'running'].map((s) => auftragAktiv({ status: s as never }))
    ).toEqual([true, true, true])
    expect(['done', 'error', 'canceled'].map((s) => auftragAktiv({ status: s as never }))).toEqual([
      false,
      false,
      false
    ])
  })
})

describe('auftragZeile', () => {
  it('laufend: die Stufe; im Tooltip Datei, Fakten und Stufe', () => {
    const z = auftragZeile(job({ status: 'running', stageText: 'Elemente 3/12' }))
    expect(z.zustand).toBe('Elemente 3/12')
    expect(z.ton).toBe('info')
    expect(z.info.split('\n')).toEqual([
      'C:\\Videos\\Gala-Diashow.mp4',
      'H.264 · 1920×1080 · 25 fps · 48 s',
      'Elemente 3/12'
    ])
  })

  it('ohne Stufentext ein Wort', () => {
    expect(auftragZeile(job({ status: 'running' })).zustand).toBe('Rechnet')
    expect(auftragZeile(job({ status: 'probing' })).zustand).toBe('Analyse')
    expect(auftragZeile(job({ status: 'queued' })).zustand).toBe('Wartet')
    expect(auftragZeile(job({ status: 'canceled' })).zustand).toBe('Abgebrochen')
  })

  it('gescheitert: der Fehler selbst steht in der Zeile', () => {
    const z = auftragZeile(job({ status: 'error', error: 'kaputt.jpg: keine lesbare Bildspur.' }))
    expect(z).toMatchObject({ zustand: 'kaputt.jpg: keine lesbare Bildspur.', ton: 'danger' })
    expect(auftragZeile(job({ status: 'error' })).zustand).toBe('Fehler')
  })

  it('fertig: Stücke und Encoder im Tooltip, Warnungen zählen sichtbar', () => {
    const fertig = job({
      status: 'done',
      encoder: 'libx264',
      renderedPieces: 5,
      cachedPieces: 2,
      hints: [
        { id: 'a', level: 'warning', text: 'Übergang gekürzt.' },
        { id: 'b', level: 'info', text: 'nur zur Info' }
      ]
    })
    const z = auftragZeile(fertig)
    expect(z).toMatchObject({ zustand: 'Fertig · 1 Hinweis', ton: 'warning' })
    expect(z.info).toContain('H.264 · 1920×1080 · 25 fps · 48 s · libx264')
    expect(z.info).toContain('5 Stücke gerechnet, 2 aus dem Zwischenspeicher')
    expect(z.info).toContain('Übergang gekürzt.')
    expect(z.info).not.toContain('nur zur Info')
    expect(auftragZeile(job({ status: 'done' }))).toMatchObject({
      zustand: 'Fertig',
      ton: 'success'
    })
  })

  it('Bildrate wie im Konverter, Dauer offen', () => {
    const z = auftragZeile(job({ fps: 30000 / 1001, durationSec: null }))
    expect(z.info.split('\n')[1]).toBe('H.264 · 1920×1080 · 29,97 fps')
  })
})

describe('auftragName', () => {
  it('die Zieldatei ohne Ordner', () => {
    expect(auftragName(job())).toBe('Gala-Diashow.mp4')
    expect(auftragName({ outputPath: '/home/x/Loop.mov' })).toBe('Loop.mov')
  })
})
