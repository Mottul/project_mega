import { describe, expect, it } from 'vitest'
import { DEFAULT_FIRMENPROFIL } from '@shared/types'
import { ledWallFileData, sanitizeLedWallConfig } from '../led-wall/config'
import { kopieAus } from './ledWallKopie'
import { leererAusgang, leeresGeraet, type Anleitung, type Geraet } from './model'
import { pruefung } from './pruefung'
import { sanitizeAnleitung } from './sanitize'
import { vorschau, type SeitenKontext } from './seiten'
import { erreichteWaende, pruefeSignalwege, signalwege } from './signalwege'
import { neueAnleitung } from './vorlage'

const ctx: SeitenKontext = {
  stufe: 3,
  lern: false,
  firma: DEFAULT_FIRMENPROFIL,
  datum: '17.10.2026',
  modus: 'druck'
}

const c = sanitizeLedWallConfig({})
/** 496 (1920 × 1200 px bei 8 × 5) und uS2+ (ab Werk Vollkreis: 8 × 2 Module, 1536 × 384 px) */
function anleitung(waende = 2): Anleitung {
  const a = neueAnleitung()
  a.geraete = []
  a.ledWall = kopieAus(
    ledWallFileData(
      '',
      '',
      [
        { id: 'buehne', name: 'Bühne', config: c },
        { id: 'bar', name: 'Bar', config: { ...c, moduleKey: 'uS2+', widthM: '2', heightM: '1' } }
      ].slice(0, waende)
    ),
    null
  )
  return a
}
const geraet = (rolle: Geraet['rolle'], id: string, name: string, p: Partial<Geraet> = {}) => ({
  ...leeresGeraet(rolle),
  id,
  name,
  ...p
})
const kurz = (a: Anleitung) =>
  signalwege(a).map((w) =>
    [w.wand.name, w.zuspieler?.name, w.ausgang?.name, w.verteiler?.name, w.prozessor?.name]
      .filter(Boolean)
      .join(' / ')
  )

describe('Signalwege', () => {
  it('eine Wand, ein Prozessor, ein Zuspieler: verbunden ohne jede Angabe', () => {
    const a = anleitung(1)
    a.geraete = [geraet('zuspieler', 'pc', 'Laptop'), geraet('prozessor', 'p', 'NovaPro')]
    expect(kurz(a)).toEqual(['Bühne / Laptop / NovaPro'])
    expect(pruefeSignalwege(a)).toEqual([])
  })

  it('ein Laptop, zwei Ausgänge, zwei Prozessoren für zwei Wände', () => {
    const a = anleitung()
    a.geraete = [
      geraet('zuspieler', 'pc', 'Laptop', {
        ausgaenge: [
          { ...leererAusgang('HDMI 1'), an: ['p1'] },
          { ...leererAusgang('HDMI 2'), an: ['p2'] }
        ]
      }),
      geraet('prozessor', 'p1', 'NovaPro', { waende: ['buehne'] }),
      geraet('prozessor', 'p2', 'Tessera', { waende: ['bar'] })
    ]
    expect(kurz(a)).toEqual([
      'Bühne / Laptop / HDMI 1 / NovaPro',
      'Bar / Laptop / HDMI 2 / Tessera'
    ])
    expect(pruefeSignalwege(a)).toEqual([])
    const html = vorschau(a, ctx, 'system').html
    // Ausgang am Pfeil, Liste der Wege darunter
    expect(html).toContain('>HDMI 1</text>')
    expect(html).toContain('<li><b>Bar</b>: Laptop (HDMI 2) → Tessera</li>')
    // je Kante ein Pfeil: 2 Zuspieler → Prozessor, 2 Prozessor → Wand
    expect(html.match(/<path d="M[\d.]+ /g)).toHaveLength(4)
  })

  it('ein Ausgang über einen HDMI-Splitter an zwei Prozessoren', () => {
    const a = anleitung()
    a.geraete = [
      geraet('zuspieler', 'pc', 'Laptop', {
        ausgaenge: [{ ...leererAusgang('HDMI'), ueber: 'sp', an: ['p1', 'p2'] }]
      }),
      geraet('verteiler', 'sp', 'Splitter'),
      geraet('prozessor', 'p1', 'VX4S A', { waende: ['buehne'] }),
      geraet('prozessor', 'p2', 'VX4S B', { waende: ['bar'] })
    ]
    expect(kurz(a)).toEqual([
      'Bühne / Laptop / HDMI / Splitter / VX4S A',
      'Bar / Laptop / HDMI / Splitter / VX4S B'
    ])
    // Laptop → Splitter einmal, Splitter → je Prozessor, Prozessor → Wand: 5 Pfeile
    expect(vorschau(a, ctx, 'system').html.match(/<path d="M[\d.]+ /g)).toHaveLength(5)
  })

  it('Gesamtbild: ein Prozessor für beide Wände, Ausschnitt je Wand; Prüfung misst nach', () => {
    const a = anleitung()
    a.geraete = [
      geraet('zuspieler', 'pc', 'Laptop', {
        ausgaenge: [
          {
            ...leererAusgang('DP'),
            breite: 3840,
            hoehe: 1200,
            ausschnitte: [
              { wand: 'buehne', x: 0, y: 0, b: 1920, h: 1200 },
              { wand: 'bar', x: 3000, y: 0, b: 1000, h: 384 }
            ]
          }
        ]
      }),
      geraet('prozessor', 'p', 'NovaPro', { waende: ['buehne', 'bar'] })
    ]
    const wege = signalwege(a)
    expect(wege.map((w) => w.ausschnitt?.x)).toEqual([0, 3000])
    expect(erreichteWaende(a.geraete[0].ausgaenge[0], a).map((w) => w.id)).toEqual([
      'buehne',
      'bar'
    ])
    const p = pruefeSignalwege(a)
    expect(p).toEqual([
      {
        schwere: 'warnung',
        text: '„Laptop“ DP → „Bar“: Der Ausschnitt ragt über das Bild (3840 × 1200 px).'
      },
      {
        schwere: 'info',
        text: '„Laptop“ DP → „Bar“: Ausschnitt 1000 × 384 px, die Wand hat 1536 × 384 px – das Bild wird skaliert.'
      }
    ])
    expect(vorschau(a, ctx, 'system').html).toContain('Ausschnitt ab 0, 0 · 1920 × 1200 px')
  })

  it('Prüfung: Wand ohne Prozessor, Prozessor ohne Wand, Zuspieler ohne Ziel', () => {
    const a = anleitung()
    a.geraete = [
      geraet('zuspieler', 'pc', 'Laptop'),
      geraet('prozessor', 'p1', 'NovaPro', { waende: ['buehne'] }),
      geraet('prozessor', 'p2', '')
    ]
    expect(pruefeSignalwege(a).map((x) => x.text)).toEqual([
      'Wand „Bar“: kein Prozessor bespielt sie.',
      'Prozessor „ohne Namen“: Welche Wand bespielt er?',
      'Zuspieler „Laptop“: An welchen Prozessor geht er?'
    ])
    // in der Prüfung vor dem Export beim Kapitel Geräte
    expect(
      pruefung(a, ctx, { ledWallNeuer: null }).filter((x) => x.text.startsWith('Signalweg:'))
    ).toHaveLength(3)
    // Wand ohne Prozessor steht in der Liste
    expect(vorschau(a, ctx, 'system').html).toContain(
      '<b>Bar</b>: <span class="muted">noch kein Prozessor'
    )
  })

  it('Prüfung beim Laden: Verweise nur auf vorhandene Geräte passender Rolle', () => {
    const a = sanitizeAnleitung({
      geraete: [
        {
          id: 'pc',
          rolle: 'zuspieler',
          ausgaenge: [
            { id: 'o', name: 'HDMI', ueber: 'p', an: ['p', 'weg', 'pc'], ausschnitte: [] }
          ]
        },
        { id: 'p', rolle: 'prozessor', waende: ['buehne', 'buehne', 7] }
      ]
    })
    const o = a.geraete[0].ausgaenge[0]
    expect([o.ueber, o.an]).toEqual([null, ['p']])
    expect(a.geraete[1].waende).toEqual(['buehne'])
    // was die App selbst erzeugt, übersteht die Prüfung unverändert
    const b = anleitung()
    b.geraete = [
      geraet('zuspieler', 'pc', 'Laptop', {
        ausgaenge: [{ ...leererAusgang('DP'), breite: 3840, hoehe: 1080, ausschnitte: [] }]
      })
    ]
    expect(sanitizeAnleitung(structuredClone(b)).geraete).toEqual(b.geraete)
  })
})
