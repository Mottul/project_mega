import { describe, expect, it } from 'vitest'
import { InternalPortType, TransitionStyle, VideoMode } from 'atem-connection/dist/enums'
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
    transitionProperties: { nextStyle: 0 },
    transitionSettings: { mix: { rate: 25 }, dip: { rate: 30 }, wipe: { rate: 35 } },
    ...p
  }
}

const quelle = (
  inputId: number,
  internalPortType: number,
  meAvailability = 0b1111
): AtemRohQuelle => ({
  inputId,
  longName: `Quelle ${inputId}`,
  shortName: `Q${inputId}`,
  internalPortType,
  meAvailability
})

function roh(p: Partial<AtemRoh> = {}): AtemRoh {
  return {
    info: { apiVersion: 131104, capabilities: { DVEs: 0, stingers: 0 } },
    video: { mixEffects: [me()] },
    inputs: {},
    settings: { videoMode: VideoMode.P1080p50 },
    ...p
  }
}

describe('atemViewAus', () => {
  it('stellt Eingänge vor interne Quellen und lässt reine Multiview-Quellen weg', () => {
    const v = atemViewAus(
      roh({
        inputs: {
          0: quelle(0, InternalPortType.Black),
          3010: quelle(3010, InternalPortType.MediaPlayerFill),
          2: quelle(2, InternalPortType.External),
          1: quelle(1, InternalPortType.External),
          1000: quelle(1000, InternalPortType.ColorBars),
          9001: quelle(9001, InternalPortType.MultiViewer, 0)
        }
      }),
      []
    )
    expect(v.quellen.map((q) => q.id)).toEqual([1, 2, 0, 1000, 3010])
    expect(v.quellen.map((q) => q.extern)).toEqual([true, true, false, false, false])
  })

  it('kennt mehrere M/Es und je M/E die eigene Ruhelage des Hebels', () => {
    const v = atemViewAus(
      roh({ video: { mixEffects: [me(), me({ programInput: 7 }), undefined] } }),
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
              transitionProperties: { nextStyle: TransitionStyle.WIPE },
              fadeToBlack: { isFullyBlack: true, inTransition: false, remainingFrames: 0, rate: 12 }
            })
          ]
        }
      }),
      []
    ).mes[0]
    expect(v).toMatchObject({
      stil: 'wipe',
      raten: { mix: 25, dip: 30, wipe: 35 },
      hebel: 4000,
      uebergang: true,
      restBilder: 7,
      ftb: { schwarz: true, laeuft: false, rate: 12 }
    })
  })
})

describe('Abgleich mit der Bibliothek', () => {
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
