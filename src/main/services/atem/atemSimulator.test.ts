import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ATEM_HINTERGRUND,
  keyerBit,
  QUELLE_FUER_AUX,
  QUELLE_FUER_KEY,
  type AtemCommand,
  type AtemSimModell
} from '@shared/atem'
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
    await s.befehl({ type: 'rate', me: 0, stil: 'mix', rate: 10 })
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

  it('läuft bei 50p wie das Gerät: Dauer 50 dauert 2 s, nicht 1 s', async () => {
    const s = aufbau('mini-extreme') // 1080p50
    await s.befehl({ type: 'rate', me: 0, stil: 'mix', rate: 50 })
    await s.befehl({ type: 'auto', me: 0 })
    const me = (): AtemRoh['video']['mixEffects'][0] => s.stand().video.mixEffects[0]
    vi.advanceTimersByTime(1900)
    expect(me()?.transitionPosition.inTransition).toBe(true)
    vi.advanceTimersByTime(200)
    expect(me()?.transitionPosition.inTransition).toBe(false)
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
    await s.befehl({ type: 'rate', me: 0, stil: 'mix', rate: 10 })
    await s.befehl({ type: 'hebel', me: 0, wert: 5000 })
    await s.befehl({ type: 'auto', me: 0 })
    vi.advanceTimersByTime(40 * 5)
    expect(s.stand().video.mixEffects[0]?.programInput).toBe(2)
  })

  it('blendet Fade to Black über die eingestellte Dauer, beim zweiten Mal zurück', async () => {
    const s = aufbau()
    const ftb = (): AtemRoh['video']['mixEffects'][0] => s.stand().video.mixEffects[0]
    await s.befehl({ type: 'ftbRate', me: 0, rate: 5 })
    await s.befehl({ type: 'ftb', me: 0 })
    expect(ftb()?.fadeToBlack).toMatchObject({ inTransition: true, remainingFrames: 5 })
    vi.advanceTimersByTime(40 * 5)
    expect(ftb()?.fadeToBlack).toMatchObject({ isFullyBlack: true, inTransition: false })
    await s.befehl({ type: 'ftb', me: 0 })
    vi.advanceTimersByTime(40 * 5)
    expect(ftb()?.fadeToBlack?.isFullyBlack).toBe(false)
  })

  it('nimmt beim Übergang mit, was ausgewählt ist', async () => {
    const s = aufbau('mini-extreme')
    const me = (): NonNullable<AtemRoh['video']['mixEffects'][0]> =>
      s.stand().video.mixEffects[0] as NonNullable<AtemRoh['video']['mixEffects'][0]>
    // nur Key 2: Der Hintergrund bleibt, der Keyer geht on air
    await s.befehl({ type: 'naechster', me: 0, maske: keyerBit(1) })
    await s.befehl({ type: 'cut', me: 0 })
    expect(me().programInput).toBe(1)
    expect(me().upstreamKeyers.map((k) => k?.onAir)).toEqual([false, true, false, false])
    // beides: Der Keyer geht wieder raus, die Busse tauschen
    await s.befehl({ type: 'naechster', me: 0, maske: ATEM_HINTERGRUND | keyerBit(1) })
    await s.befehl({ type: 'hebel', me: 0, wert: 10000 })
    expect(me().programInput).toBe(2)
    expect(me().upstreamKeyers[1]?.onAir).toBe(false)
  })

  it('schaltet Keyer direkt und lässt den Stil beim Ändern der Auswahl stehen', async () => {
    const s = aufbau('mini-extreme')
    await s.befehl({ type: 'stil', me: 0, stil: 'wipe' })
    await s.befehl({ type: 'naechster', me: 0, maske: 3 })
    await s.befehl({ type: 'uskOnAir', me: 0, keyer: 2, an: true })
    await s.befehl({ type: 'uskQuelle', me: 0, keyer: 2, art: 'cut', quelle: 4 })
    const v = atemViewAus(s.stand(), []).mes[0]
    expect(v.stil).toBe('wipe')
    expect(v.naechster).toBe(3)
    expect(v.keyer[2]).toMatchObject({ onAir: true, cut: 4 })
  })

  it('blendet einen DSK über seine Dauer und nimmt verknüpfte beim Übergang mit', async () => {
    const s = aufbau('mini-extreme')
    const dsk = (): ReturnType<typeof atemViewAus>['dsk'] => atemViewAus(s.stand(), []).dsk
    await s.befehl({ type: 'dskRate', keyer: 0, rate: 5 })
    await s.befehl({ type: 'dskAuto', keyer: 0 })
    expect(dsk()[0]).toMatchObject({ laeuft: true, rest: 5, onAir: false })
    vi.advanceTimersByTime(40 * 5)
    expect(dsk()[0]).toMatchObject({ laeuft: false, rest: 0, onAir: true })

    await s.befehl({ type: 'dskTie', keyer: 1, an: true })
    await s.befehl({ type: 'cut', me: 0 })
    expect(dsk()[1]).toMatchObject({ onAir: true, tie: true })
    await s.befehl({ type: 'dskOnAir', keyer: 1, an: false })
    await s.befehl({ type: 'dskQuelle', keyer: 1, art: 'fill', quelle: 3 })
    expect(dsk()[1]).toMatchObject({ onAir: false, fill: 3 })
  })

  it('spielt ein Makro ab und meldet das Ende', async () => {
    const s = aufbau()
    await s.befehl({ type: 'makroStart', index: 1 })
    expect(atemViewAus(s.stand(), []).makroPlayer).toEqual({
      laeuft: true,
      wartet: false,
      index: 1
    })
    vi.advanceTimersByTime(1100)
    expect(atemViewAus(s.stand(), []).makroPlayer.laeuft).toBe(false)
  })

  it('wartet an einer Pause auf „Weiter“, und Stopp beendet sofort', async () => {
    const s = aufbau()
    const makro = (): ReturnType<typeof atemViewAus>['makroPlayer'] =>
      atemViewAus(s.stand(), []).makroPlayer
    await s.befehl({ type: 'makroStart', index: 3 })
    vi.advanceTimersByTime(5000)
    expect(makro()).toMatchObject({ laeuft: true, wartet: true })
    await s.befehl({ type: 'makroWeiter' })
    expect(makro()).toMatchObject({ laeuft: false, wartet: false })
    await s.befehl({ type: 'makroStart', index: 0 })
    await s.befehl({ type: 'makroStopp' })
    expect(makro().laeuft).toBe(false)
  })

  it('wählt Medien und steuert Clips, nur große Modelle haben welche', async () => {
    expect(atemViewAus(aufbau('mini').stand(), []).medien.clips).toEqual([])
    const s = aufbau('constellation')
    const player = (): ReturnType<typeof atemViewAus>['medien']['player'][0] =>
      atemViewAus(s.stand(), []).medien.player[1]
    await s.befehl({ type: 'mediaQuelle', player: 1, art: 'clip', index: 1 })
    expect(player()).toMatchObject({ art: 'clip', index: 1 })
    await s.befehl({ type: 'clipSpielen', player: 1, an: true })
    await s.befehl({ type: 'clipSchleife', player: 1, an: true })
    expect(player()).toMatchObject({ spielt: true, schleife: true, amAnfang: false })
    await s.befehl({ type: 'clipAnfang', player: 1 })
    expect(player()).toMatchObject({ spielt: false, amAnfang: true })
    await s.befehl({ type: 'mediaQuelle', player: 1, art: 'still', index: 2 })
    expect(player()).toMatchObject({ art: 'still', index: 2 })
    expect(atemViewAus(s.stand(), []).medien.player[0]).toMatchObject({ art: 'still', index: 0 })
  })

  it('schaltet AUX-Busse einzeln', async () => {
    const s = aufbau('mini-extreme')
    await s.befehl({ type: 'aux', bus: 1, quelle: 5 })
    expect(atemViewAus(s.stand(), []).aux.map((a) => a.quelle)).toEqual([1, 5])
  })

  it('meldet auf jedem Modell Makros und taugliche Quellen für Key und AUX', () => {
    for (const modell of ['mini', 'mini-extreme', 'constellation'] as const) {
      const v = atemViewAus(aufbau(modell).stand(), [])
      expect(v.makros.length).toBeGreaterThan(0)
      expect(v.quellen.some((q) => q.verfuegbar & QUELLE_FUER_KEY)).toBe(true)
      expect(v.quellen.some((q) => q.verfuegbar & QUELLE_FUER_AUX)).toBe(true)
    }
  })

  it('hält die M/Es auseinander', async () => {
    const s = aufbau('constellation')
    await s.befehl({ type: 'programm', me: 2, quelle: 7 })
    const mes = s.stand().video.mixEffects
    expect([mes[0]?.programInput, mes[2]?.programInput]).toEqual([1, 7])
  })
})
