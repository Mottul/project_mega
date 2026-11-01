import { describe, expect, it } from 'vitest'
import {
  InternalPortType,
  MediaSourceType,
  MixEffectKeyType,
  SourceAvailability,
  TransitionSelection,
  TransitionStyle,
  VideoMode
} from 'atem-connection/dist/enums'
import {
  ATEM_HINTERGRUND,
  ATEM_KEY_ARTEN,
  keyerBit,
  QUELLE_FUER_AUX,
  QUELLE_FUER_KEY
} from './atem'
import {
  atemViewAus,
  bildrateAusModus,
  protokollText,
  STIL_NACH_NUMMER,
  type AtemRoh,
  type AtemRohMe,
  type AtemRohQuelle
} from './atemView'

function me(p: Partial<AtemRohMe> = {}): AtemRohMe {
  return {
    programInput: 1,
    previewInput: 2,
    transitionPosition: { inTransition: false, remainingFrames: 0, handlePosition: 0 },
    transitionProperties: { nextStyle: 0, nextSelection: [1] },
    transitionSettings: { mix: { rate: 25 }, dip: { rate: 30 }, wipe: { rate: 35 } },
    upstreamKeyers: [],
    ...p
  }
}

const quelle = (
  inputId: number,
  internalPortType: number,
  meAvailability = 0b1111,
  sourceAvailability = 0
): AtemRohQuelle => ({
  inputId,
  longName: `Quelle ${inputId}`,
  shortName: `Q${inputId}`,
  internalPortType,
  meAvailability,
  sourceAvailability
})

function roh(p: Partial<AtemRoh> = {}): AtemRoh {
  return {
    info: { apiVersion: 131104, capabilities: { DVEs: 0, stingers: 0 } },
    video: { mixEffects: [me()], downstreamKeyers: [], auxilliaries: [] },
    inputs: {},
    settings: { videoMode: VideoMode.P1080p50 },
    macro: {
      macroPlayer: { isRunning: false, isWaiting: false, macroIndex: 0 },
      macroProperties: []
    },
    media: { stillPool: [], clipPool: [], players: [] },
    ...p
  }
}

describe('atemViewAus', () => {
  it('stellt Eingänge vor interne Quellen und behält Quellen, die keine M/E nimmt', () => {
    const v = atemViewAus(
      roh({
        inputs: {
          0: quelle(0, InternalPortType.Black),
          3010: quelle(3010, InternalPortType.MediaPlayerFill),
          2: quelle(2, InternalPortType.External),
          1: quelle(1, InternalPortType.External),
          1000: quelle(1000, InternalPortType.ColorBars),
          9001: quelle(9001, InternalPortType.MultiViewer, 0, SourceAvailability.Auxiliary),
          9002: quelle(9002, InternalPortType.AudioMonitor, 0, 0)
        }
      }),
      []
    )
    // Der AUX-Bus darf das Multiview zeigen, was nirgends taugt, fällt weg
    expect(v.quellen.map((q) => q.id)).toEqual([1, 2, 0, 1000, 3010, 9001])
    expect(v.quellen.map((q) => q.extern)).toEqual([true, true, false, false, false, false])
  })

  it('kennt mehrere M/Es und je M/E die eigene Ruhelage des Hebels', () => {
    const v = atemViewAus(
      roh({
        video: {
          mixEffects: [me(), me({ programInput: 7 }), undefined],
          downstreamKeyers: [],
          auxilliaries: []
        }
      }),
      [false, true]
    )
    expect(v.mes.map((m) => [m.programm, m.hebelOben])).toEqual([
      [1, false],
      [7, true]
    ])
  })

  it('zeigt nur Stile, die die Hardware kann', () => {
    expect(atemViewAus(roh(), []).stile).toEqual(['mix', 'dip', 'wipe'])
    const voll = roh({
      info: { apiVersion: 1, capabilities: { DVEs: 1, stingers: 1 } }
    })
    expect(atemViewAus(voll, []).stile).toEqual(['mix', 'dip', 'wipe', 'dve', 'sting'])
  })

  it('meldet Dauer, Übergang und Fade to Black', () => {
    const v = atemViewAus(
      roh({
        video: {
          mixEffects: [
            me({
              transitionPosition: { inTransition: true, remainingFrames: 7, handlePosition: 4000 },
              transitionProperties: { nextStyle: TransitionStyle.WIPE, nextSelection: [1, 4] },
              fadeToBlack: { isFullyBlack: true, inTransition: false, remainingFrames: 0, rate: 12 }
            })
          ],
          downstreamKeyers: [],
          auxilliaries: []
        }
      }),
      []
    ).mes[0]
    expect(v).toMatchObject({
      stil: 'wipe',
      raten: { mix: 25, dip: 30, wipe: 35 },
      hebel: 4000,
      uebergang: true,
      rest: 7,
      ftb: { schwarz: true, laeuft: false, rate: 12 },
      naechster: 5
    })
  })

  it('meldet Keyer und DSKs', () => {
    const v = atemViewAus(
      roh({
        video: {
          mixEffects: [
            me({
              upstreamKeyers: [
                {
                  onAir: true,
                  mixEffectKeyType: MixEffectKeyType.DVE,
                  fillSource: 3,
                  cutSource: 4
                },
                undefined
              ]
            })
          ],
          downstreamKeyers: [
            {
              onAir: true,
              inTransition: true,
              remainingFrames: 3,
              sources: { fillSource: 5, cutSource: 6 },
              properties: { tie: true, rate: 12 }
            },
            { onAir: false, inTransition: false, remainingFrames: 0 }
          ],
          auxilliaries: []
        }
      }),
      []
    )
    expect(v.mes[0].keyer).toEqual([{ onAir: true, art: 'dve', fill: 3, cut: 4 }])
    expect(v.dsk).toEqual([
      { onAir: true, laeuft: true, rest: 3, tie: true, rate: 12, fill: 5, cut: 6 },
      { onAir: false, laeuft: false, rest: 0, tie: false, rate: 0, fill: 0, cut: 0 }
    ])
  })

  it('zeigt nur belegte Makros, unbenannte mit ihrer Nummer', () => {
    const v = atemViewAus(
      roh({
        info: { apiVersion: 1, macroPool: { macroCount: 100 } },
        macro: {
          macroPlayer: { isRunning: true, isWaiting: true, macroIndex: 2 },
          macroProperties: [
            { isUsed: false, name: '', description: '' },
            undefined,
            { isUsed: true, name: 'Abspann', description: 'Ende' },
            { isUsed: true, name: '', description: '' }
          ]
        }
      }),
      []
    )
    expect(v.makros).toEqual([
      { index: 2, name: 'Abspann', beschreibung: 'Ende' },
      { index: 3, name: 'Makro 4', beschreibung: '' }
    ])
    expect(v.makroPlaetze).toBe(100)
    expect(v.makroPlayer).toEqual({ laeuft: true, wartet: true, index: 2 })
  })

  it('zeigt belegte Plätze im Media-Pool und was die Player gewählt haben', () => {
    const player = { playing: false, loop: true, atBeginning: true, stillIndex: 2, clipIndex: 1 }
    const v = atemViewAus(
      roh({
        media: {
          stillPool: [
            { isUsed: false, fileName: '' },
            { isUsed: true, fileName: 'Logo' },
            { isUsed: true, fileName: '' }
          ],
          clipPool: [undefined, { isUsed: true, name: 'Opener' }],
          players: [
            { ...player, sourceType: MediaSourceType.Still },
            { ...player, sourceType: MediaSourceType.Clip, playing: true }
          ]
        }
      }),
      []
    ).medien
    expect(v.stills).toEqual([
      { index: 1, name: 'Logo' },
      { index: 2, name: '3' }
    ])
    expect(v.clips).toEqual([{ index: 1, name: 'Opener' }])
    expect(v.player).toEqual([
      { art: 'still', index: 2, spielt: false, schleife: true, amAnfang: true },
      { art: 'clip', index: 1, spielt: true, schleife: true, amAnfang: true }
    ])
  })

  it('nennt AUX-Busse beim Namen des Mischers, sonst nach Nummer', () => {
    const v = atemViewAus(
      roh({
        video: { mixEffects: [me()], downstreamKeyers: [], auxilliaries: [3, undefined] },
        inputs: { 8001: quelle(8001, InternalPortType.Auxiliary, 0) }
      }),
      []
    )
    expect(v.aux).toEqual([
      { name: 'Quelle 8001', quelle: 3 },
      { name: 'AUX 2', quelle: 0 }
    ])
  })
})

describe('Abgleich mit der Bibliothek', () => {
  it('Bits und Arten haben dieselben Werte wie die Enums', () => {
    expect(QUELLE_FUER_KEY).toBe(SourceAvailability.KeySource)
    expect(QUELLE_FUER_AUX).toBe(
      SourceAvailability.Auxiliary |
        SourceAvailability.Auxiliary1 |
        SourceAvailability.Auxiliary2 |
        SourceAvailability.WebcamOut
    )
    expect(ATEM_HINTERGRUND).toBe(TransitionSelection.Background)
    expect(keyerBit(0)).toBe(TransitionSelection.Key1)
    expect(keyerBit(3)).toBe(TransitionSelection.Key4)
    expect(ATEM_KEY_ARTEN[MixEffectKeyType.Luma]).toBe('luma')
    expect(ATEM_KEY_ARTEN[MixEffectKeyType.Chroma]).toBe('chroma')
    expect(ATEM_KEY_ARTEN[MixEffectKeyType.Pattern]).toBe('pattern')
    expect(ATEM_KEY_ARTEN[MixEffectKeyType.DVE]).toBe('dve')
  })

  it('Stile haben dieselben Nummern wie TransitionStyle', () => {
    expect(STIL_NACH_NUMMER[TransitionStyle.MIX]).toBe('mix')
    expect(STIL_NACH_NUMMER[TransitionStyle.DIP]).toBe('dip')
    expect(STIL_NACH_NUMMER[TransitionStyle.WIPE]).toBe('wipe')
    expect(STIL_NACH_NUMMER[TransitionStyle.DVE]).toBe('dve')
    expect(STIL_NACH_NUMMER[TransitionStyle.STING]).toBe('sting')
  })

  it('Bildraten passen zu VideoMode', () => {
    expect(bildrateAusModus(VideoMode.P1080p25)).toBe(25)
    expect(bildrateAusModus(VideoMode.P1080p50)).toBe(50)
    expect(bildrateAusModus(VideoMode.N1080p5994)).toBe(59.94)
    expect(bildrateAusModus(VideoMode.N1080p2398)).toBe(23.98)
    expect(bildrateAusModus(VideoMode.P1080i50)).toBe(25)
    expect(bildrateAusModus(VideoMode.P4KHDp5000)).toBe(50)
    expect(bildrateAusModus(VideoMode.P8KHDp25)).toBe(25)
    expect(bildrateAusModus(VideoMode.N1080p30)).toBe(30)
    expect(bildrateAusModus(VideoMode.N1080p60)).toBe(60)
    expect(bildrateAusModus(99)).toBeNull()
  })
})

describe('protokollText', () => {
  it('zeigt Haupt- und Nebenversion', () => {
    expect(protokollText(131104)).toBe('2.32')
  })
})
