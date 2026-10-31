import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AtemCommand, AtemSimModell } from '@shared/atem'
import { atemViewAus, type AtemRoh } from '@shared/atemView'
import { simulierteVerbindung } from './atemSimulator'
import type { AtemMeldungen } from './atemVerbindung'

vi.mock('electron', () => ({ app: {} }))

function aufbau(modell: AtemSimModell = 'mini'): {
  stand: () => AtemRoh
  verbunden: () => number
  befehl: (c: AtemCommand) => Promise<void>
} {
  let roh: AtemRoh | null = null
  let verbunden = 0
  const m: AtemMeldungen = {
    verbunden: () => verbunden++,
    verloren: () => {},
    zustand: (r) => {
      roh = r
    },
    fehler: () => {}
  }
  const v = simulierteVerbindung(modell, m)
  void v.start()
  vi.advanceTimersByTime(200)
  return {
    stand: () => roh as unknown as AtemRoh,
    verbunden: () => verbunden,
    befehl: (c) => v.befehl(c)
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Probebetrieb', () => {
  it('meldet sich wie ein Mischer', () => {
    const s = aufbau()
    expect(s.verbunden()).toBe(1)
    expect(s.stand().info.productIdentifier).toBe('ATEM Mini')
  })

  it('kennt die Größe des Modells', () => {
    const quellen = (m: AtemSimModell): number =>
      atemViewAus(aufbau(m).stand(), []).quellen.filter((q) => q.extern).length
    expect(quellen('mini')).toBe(4)
    expect(quellen('mini-extreme')).toBe(8)
    expect(quellen('constellation')).toBe(40)
    const gross = atemViewAus(aufbau('constellation').stand(), [])
    expect(gross.mes).toHaveLength(4)
    expect(gross.stile).toContain('sting')
    expect(atemViewAus(aufbau('mini').stand(), []).stile).not.toContain('sting')
  })

  it('schaltet Busse und tauscht beim Cut', async () => {
    const s = aufbau()
    await s.befehl({ type: 'vorschau', me: 0, quelle: 3 })
    await s.befehl({ type: 'cut', me: 0 })
    const me = s.stand().video.mixEffects[0]
    expect([me?.programInput, me?.previewInput]).toEqual([3, 1])
  })

  it('fährt Auto Bild für Bild und endet nach der eingestellten Dauer', async () => {
    const s = aufbau() // 1080p25
    await s.befehl({ type: 'rate', me: 0, stil: 'mix', bilder: 10 })
    await s.befehl({ type: 'auto', me: 0 })
    const me = (): AtemRoh['video']['mixEffects'][0] => s.stand().video.mixEffects[0]
    vi.advanceTimersByTime(40 * 5)
    expect(me()?.transitionPosition).toMatchObject({
      inTransition: true,
      remainingFrames: 5,
      handlePosition: 5000
    })
    expect(me()?.programInput).toBe(1)
    vi.advanceTimersByTime(40 * 5)
    expect(me()?.transitionPosition.inTransition).toBe(false)
    expect(me()?.transitionPosition.handlePosition).toBe(0)
    expect(me()?.programInput).toBe(2)
  })

  it('folgt dem Hebel: Mitte läuft, Ende tauscht, zurück ändert nichts', async () => {
    const s = aufbau()
    const me = (): AtemRoh['video']['mixEffects'][0] => s.stand().video.mixEffects[0]
    await s.befehl({ type: 'hebel', me: 0, wert: 4000 })
    expect(me()?.transitionPosition).toMatchObject({ inTransition: true, handlePosition: 4000 })
    await s.befehl({ type: 'hebel', me: 0, wert: 0 })
    expect(me()?.transitionPosition.inTransition).toBe(false)
    expect(me()?.programInput).toBe(1)
    await s.befehl({ type: 'hebel', me: 0, wert: 10000 })
    expect(me()?.transitionPosition.inTransition).toBe(false)
    expect(me()?.programInput).toBe(2)
  })

  it('fährt Auto von der Stelle des Hebels zu Ende', async () => {
    const s = aufbau()
    await s.befehl({ type: 'rate', me: 0, stil: 'mix', bilder: 10 })
    await s.befehl({ type: 'hebel', me: 0, wert: 5000 })
    await s.befehl({ type: 'auto', me: 0 })
    vi.advanceTimersByTime(40 * 5)
    expect(s.stand().video.mixEffects[0]?.programInput).toBe(2)
  })

  it('blendet Fade to Black über die eingestellte Dauer, beim zweiten Mal zurück', async () => {
    const s = aufbau()
    const ftb = (): AtemRoh['video']['mixEffects'][0] => s.stand().video.mixEffects[0]
    await s.befehl({ type: 'ftbRate', me: 0, bilder: 5 })
    await s.befehl({ type: 'ftb', me: 0 })
    expect(ftb()?.fadeToBlack).toMatchObject({ inTransition: true, remainingFrames: 5 })
    vi.advanceTimersByTime(40 * 5)
    expect(ftb()?.fadeToBlack).toMatchObject({ isFullyBlack: true, inTransition: false })
    await s.befehl({ type: 'ftb', me: 0 })
    vi.advanceTimersByTime(40 * 5)
    expect(ftb()?.fadeToBlack?.isFullyBlack).toBe(false)
  })

  it('hält die M/Es auseinander', async () => {
    const s = aufbau('constellation')
    await s.befehl({ type: 'programm', me: 2, quelle: 7 })
    const mes = s.stand().video.mixEffects
    expect([mes[0]?.programInput, mes[2]?.programInput]).toEqual([1, 7])
  })
})
