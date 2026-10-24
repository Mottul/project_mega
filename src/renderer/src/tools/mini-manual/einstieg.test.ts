import { describe, expect, it } from 'vitest'
import { ledWallFileData, sanitizeLedWallConfig } from '../led-wall/config'
import { istFrisch, kapitelVorschlag, mitKapitelVorschlag } from './einstieg'
import { kopieAus } from './ledWallKopie'
import { leeresGeraet, type Anleitung, type KapitelId } from './model'
import { neueAnleitung } from './vorlage'

const an = (a: Anleitung, id: KapitelId): boolean => !!a.kapitel.find((k) => k.id === id)?.an

describe('Geführter Einstieg', () => {
  it('eine neue Anleitung ist frisch, ein Projektname oder ein Gerät nicht mehr', () => {
    expect(istFrisch(neueAnleitung())).toBe(true)
    const a = neueAnleitung()
    a.deckblatt.projekt = 'Messe'
    expect(istFrisch(a)).toBe(false)
    const b = neueAnleitung()
    b.geraete = [leeresGeraet()]
    expect(istFrisch(b)).toBe(false)
  })

  it('ohne Wand fallen die LED-Kapitel weg; Bedienfeld und Software nur mit passendem Gerät', () => {
    const a = neueAnleitung()
    expect(kapitelVorschlag(a)).toEqual({ ledWall: false, verkabelung: false })
    a.geraete = [leeresGeraet('bedienfeld'), leeresGeraet('zuspieler')]
    a.ledWall = kopieAus(
      ledWallFileData('Messe', '', [
        { id: 'w', name: 'Bühne', config: sanitizeLedWallConfig({ widthM: '2', heightM: '1' }) }
      ]),
      null
    )
    const b = mitKapitelVorschlag(a)
    expect(
      ['ledWall', 'verkabelung', 'bedienfeld', 'software'].map((k) => an(b, k as KapitelId))
    ).toEqual([true, true, true, true])
    // was sich nicht ableiten lässt, bleibt wie es war
    expect(an(b, 'pflege')).toBe(an(a, 'pflege'))
  })
})
