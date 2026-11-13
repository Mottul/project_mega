import { describe, expect, it } from 'vitest'
import {
  F_MAX,
  F_MIN,
  hzToSlider,
  leertasteSchaltet,
  SLIDER_STEPS,
  sliderToHz,
  tapTempo,
  type Taste
} from './bedienung'

describe('Tempo aus Tipps', () => {
  it('Mittel der Abstände: vier Tipps im Abstand von 500 ms ergeben 120 BPM', () => {
    let taps: number[] = []
    let bpm: number | null = null
    for (const t of [1000, 1500, 2000, 2500]) ({ taps, bpm } = tapTempo(taps, t))
    expect(bpm).toBe(120)
    expect(taps).toEqual([1000, 1500, 2000, 2500])
  })

  it('ein Tipp allein ergibt nichts; nach einer Pause über 2 s zählt es neu', () => {
    expect(tapTempo([], 1000)).toEqual({ taps: [1000], bpm: null })
    expect(tapTempo([1000, 1500], 3600)).toEqual({ taps: [3600], bpm: null })
  })

  it('höchstens fünf Tipps zählen, das Ergebnis bleibt zwischen 30 und 300', () => {
    const r = tapTempo([0, 1000, 2000, 2400, 2800, 3200], 3600)
    expect(r.taps).toEqual([2000, 2400, 2800, 3200, 3600])
    expect(r.bpm).toBe(150)
    expect(tapTempo([1000], 1050).bpm).toBe(300)
    expect(tapTempo([1000], 2990).bpm).toBe(30)
  })
})

describe('Frequenz-Schieber (logarithmisch)', () => {
  it('Anfang 20 Hz, Ende 20 kHz, die Mitte bei gut 600 Hz', () => {
    expect(sliderToHz(0)).toBe(F_MIN)
    expect(sliderToHz(SLIDER_STEPS)).toBe(F_MAX)
    expect(sliderToHz(SLIDER_STEPS / 2)).toBe(632)
    expect(hzToSlider(F_MIN)).toBe(0)
    expect(hzToSlider(F_MAX)).toBe(SLIDER_STEPS)
    expect(hzToSlider(5)).toBe(0)
  })

  it('hin und zurück bleibt jede Frequenz des Schiebers dieselbe', () => {
    for (let p = 0; p <= SLIDER_STEPS; p++) {
      const f = sliderToHz(p)
      expect(sliderToHz(hzToSlider(f))).toBe(f)
    }
  })

  it('glatte Werte: drei Stellen, ganze Hz', () => {
    for (let p = 0; p <= SLIDER_STEPS; p += 37) {
      const f = sliderToHz(p)
      expect(Number.isInteger(f)).toBe(true)
      expect(String(f).replace(/0+$/, '').length).toBeLessThanOrEqual(3)
    }
  })
})

describe('Leertaste', () => {
  const space: Taste = { code: 'Space', ctrlKey: false, altKey: false, metaKey: false }
  const ziel = (tag: string, extra: object = {}): Parameters<typeof leertasteSchaltet>[1] => ({
    tag,
    editable: false,
    ...extra
  })

  it('schaltet auf der Seite und am Schieber', () => {
    expect(leertasteSchaltet(space, null)).toBe(true)
    expect(leertasteSchaltet(space, ziel('DIV'))).toBe(true)
    expect(leertasteSchaltet(space, ziel('INPUT', { type: 'range' }))).toBe(true)
  })

  it('nicht in Feldern, Listen, an Knöpfen und mit Strg/Alt/Cmd', () => {
    expect(leertasteSchaltet(space, ziel('INPUT', { type: 'text' }))).toBe(false)
    expect(leertasteSchaltet(space, ziel('INPUT', { type: 'checkbox' }))).toBe(false)
    expect(leertasteSchaltet(space, ziel('SELECT'))).toBe(false)
    expect(leertasteSchaltet(space, ziel('TEXTAREA'))).toBe(false)
    expect(leertasteSchaltet(space, ziel('BUTTON'))).toBe(false)
    expect(leertasteSchaltet(space, ziel('DIV', { role: 'button' }))).toBe(false)
    expect(leertasteSchaltet(space, ziel('DIV', { editable: true }))).toBe(false)
    expect(leertasteSchaltet({ ...space, ctrlKey: true }, null)).toBe(false)
    expect(leertasteSchaltet({ ...space, code: 'Enter' }, null)).toBe(false)
  })
})
