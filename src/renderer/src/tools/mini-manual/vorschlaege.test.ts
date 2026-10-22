import { describe, expect, it } from 'vitest'
import { ledWallFileData, sanitizeLedWallConfig } from '../led-wall/config'
import { bausteinEinfuegen } from './aktionen'
import { bausteinById } from './bibliothek'
import { kopieAus } from './ledWallKopie'
import { leeresGeraet, type Anleitung, type KapitelId } from './model'
import { neueAnleitung } from './vorlage'
import { projektText, treffer, vorschlaege } from './vorschlaege'

function mitGeraet(name: string, modell = '', notiz = ''): Anleitung {
  const a = neueAnleitung()
  a.ledWall = null
  a.geraete = [{ ...leeresGeraet(), name, modell, notiz }]
  return a
}

const kapitel = (a: Anleitung, id: KapitelId) => a.kapitel.find((k) => k.id === id)!
const ids = (a: Anleitung, id: KapitelId): string[] =>
  vorschlaege(projektText(a), kapitel(a, id)).map((v) => v.baustein.id)

describe('Baustein-Vorschläge nach Stichworten', () => {
  it('Software und Bedienfeld aus den Geräten (Name, Modell, Notiz)', () => {
    const a = mitGeraet('Medien-PC', 'Dell Precision', 'MadMapper 6, Autostart')
    a.geraete.push({
      ...leeresGeraet('bedienfeld'),
      name: 'Bedienpult',
      modell: 'Elgato Stream Deck XL'
    })
    expect(ids(a, 'software')).toEqual(['lib-madmapper'])
    expect(ids(a, 'bedienfeld')).toEqual(['lib-stream-deck'])
    expect(treffer(bausteinById('lib-autostart')!, projektText(a))).toEqual(['pc'])
  })

  it('nur ganze Wörter', () => {
    const t = projektText(mitGeraet('PCIe-Karte', 'Spc-Box', 'kein obsoleter Rechner'))
    expect(treffer(bausteinById('lib-autostart')!, t)).toEqual([])
    expect(treffer(bausteinById('lib-obs')!, t)).toEqual([])
    expect(
      treffer(bausteinById('lib-obs')!, projektText(mitGeraet('Stream-PC', '', 'OBS')))
    ).toEqual(['obs'])
  })

  it('LED-Wand mit Modul und Hersteller des Prozessors', () => {
    const a = mitGeraet('')
    const c = sanitizeLedWallConfig({ moduleKey: 'uS2+', widthM: '2', heightM: '1' })
    a.ledWall = kopieAus(
      ledWallFileData('Messe', '', [{ id: 'w', name: 'Bühne', config: c }]),
      null
    )
    const t = projektText(a)
    expect(treffer(bausteinById('lib-status-leds')!, t)).toEqual(['brompton', 'us2+'])
    expect(treffer(bausteinById('lib-nacht')!, t)).toEqual(['led-wand'])
    // ohne Wand keine LED-Bausteine
    expect(treffer(bausteinById('lib-nacht')!, projektText(mitGeraet('PC')))).toEqual([])
  })

  it('schon eingefügte Bausteine schlägt es nicht noch einmal vor', () => {
    let a = mitGeraet('Zuspieler', '', 'OBS Studio')
    expect(ids(a, 'software')).toEqual(['lib-obs'])
    a = bausteinEinfuegen(a, bausteinById('lib-obs')!)
    expect(ids(a, 'software')).toEqual([])
  })
})
