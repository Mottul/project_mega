import { describe, expect, it } from 'vitest'
import type { MediaItem } from '@shared/types'
import type { Bank, Pad } from '../jingle-player/store'
import type { OscProject, OscWidget } from '../osc-control/store'
import { mitRaster, neuesBedienfeld } from './bedienfeld'
import type { Anleitung, Block } from './model'
import { sanitizeAnleitung } from './sanitize'
import { vorschau } from './seiten'
import {
  DESKTOP_BREITE,
  HERKUNFT_PLAYER,
  ausJingle,
  ausOsc,
  ausPlayer,
  felderEinsetzen,
  oscFlaeche,
  playerEinsetzen,
  quelleOsc
} from './uebernahme'
import { neueAnleitung } from './vorlage'
import { DEFAULT_FIRMENPROFIL } from '@shared/types'

const pad = (p: Partial<Pad> = {}): Pad => ({
  id: 'p',
  storedName: null,
  originalName: null,
  label: '',
  color: '#64748b',
  volume: 1,
  loop: false,
  mode: 'oneshot',
  fadeMs: 400,
  startSec: 0,
  endSec: null,
  ...p
})

const widget = (p: Partial<OscWidget>): OscWidget => ({
  id: 'w',
  type: 'button',
  label: '',
  color: '#3b82f6',
  address: '/x',
  addressY: '',
  min: 0,
  max: 1,
  onValue: 1,
  offValue: 0,
  gx: 0,
  gy: 0,
  cw: 3,
  ch: 2,
  value: 0,
  x: 0.5,
  y: 0.5,
  r: 0,
  g: 0,
  b: 0,
  a: 1,
  align: 'center',
  source: 'osc',
  text: '',
  items: [],
  orient: 'v',
  cols: 1,
  bankMode: 'momentary',
  endless: false,
  target: 'osc',
  nova: { fn: 'brightness', value: 10, restore: 100 },
  ...p
})

const media = (id: string, title: string, durationSec: number | null): MediaItem => ({
  id,
  kind: durationSec == null ? 'image' : 'video',
  title,
  originalName: `${title}.mp4`,
  url: '',
  thumbUrl: null,
  width: 1920,
  height: 1080,
  durationSec,
  fitMode: 'bars',
  hasAudio: false,
  sizeBytes: 0,
  sourcePath: null,
  addedAt: 0
})

const mitFeldern = (felder: Anleitung['bedienfelder']): Anleitung => {
  const a = neueAnleitung()
  a.bedienfelder = felder
  a.kapitel = a.kapitel.map((k) => (k.id === 'bedienfeld' ? { ...k, an: true } : k))
  return a
}

describe('Übernahme aus dem Jingle-Player', () => {
  const banks: Bank[] = [
    {
      id: 'b1',
      name: 'Gala',
      pads: [
        pad({ storedName: 'a.mp3', originalName: 'Applaus.mp3', color: '#EF4444' }),
        pad(),
        pad({ storedName: 'c.mp3', label: 'Fanfare', mode: 'toggle', loop: true }),
        pad(),
        pad(),
        pad({ storedName: 'f.mp3', label: 'Tusch' })
      ]
    },
    { id: 'b2', name: 'Pause', pads: [pad({ storedName: 'm.mp3', label: 'Musik' })] }
  ]

  it('Bänke als Seiten, belegte Pads als Tasten mit Farbe und Tastaturkürzel', () => {
    const b = ausJingle({ banks, columns: 4, soloMode: true })
    expect([b.geraet, b.quelle, b.spalten, b.zeilen]).toEqual(['jingle', 'jingle', 4, 2])
    expect(b.seiten.map((s) => s.name)).toEqual(['Gala', 'Pause'])
    expect(
      b.seiten[0].tasten.map((t) => [t.spalte, t.zeile, t.titel, t.hintergrund, t.notiz])
    ).toEqual([
      [0, 0, 'Applaus', '#ef4444', 'Tastatur: 1'],
      [2, 0, 'Fanfare', '#64748b', 'Tastatur: 3'],
      [1, 1, 'Tusch', '#64748b', 'Tastatur: 6']
    ])
    expect(b.seiten[0].tasten[1].funktion).toBe('Startet bzw. stoppt „Fanfare“ in Schleife')
    expect(b.notiz).toContain('immer nur ein Jingle')
  })

  it('übersteht die Prüfung der Anleitung unverändert', () => {
    const a = mitFeldern([ausJingle({ banks, columns: 4, soloMode: false })])
    expect(sanitizeAnleitung(structuredClone(a))).toEqual(a)
  })
})

describe('Übernahme aus der OSC-Steuerung', () => {
  const projekt: OscProject = {
    id: 'p1',
    name: 'Messe',
    currentSetId: 's1',
    sets: [
      {
        id: 's1',
        name: 'Bühne',
        columns: 24,
        device: 'off',
        landscape: false,
        widgets: [
          widget({ type: 'label', label: 'Licht', gx: 0, gy: 0, cw: 6, ch: 2, color: '#EAB308' }),
          widget({ type: 'fader', label: 'Dimmer', gx: 0, gy: 2, cw: 3, ch: 6 }),
          widget({
            type: 'select',
            label: 'Szene',
            gx: 3,
            gy: 2,
            cw: 3,
            ch: 6,
            items: [
              { label: 'Intro', address: '', value: 0 },
              { label: 'Show', address: '', value: 1 }
            ]
          }),
          widget({
            type: 'button',
            label: 'Hell',
            gx: 6,
            gy: 0,
            target: 'nova',
            nova: { fn: 'brightnessSet', value: 80, restore: 100 }
          }),
          // überlappt den Fader – fällt weg; nicht platziert – fällt weg
          widget({ label: 'doppelt', gx: 1, gy: 3, cw: 1, ch: 1 }),
          widget({ label: 'ohne Platz', gx: -1, gy: -1 })
        ]
      },
      { id: 's2', name: 'Ton', columns: 12, device: 'off', landscape: false, widgets: [] }
    ]
  }

  it('je Set ein Bedienfeld, Kacheln mit Spanne und Funktion in Worten', () => {
    const [b, ton] = ausOsc(projekt)
    expect([b.name, b.geraet, b.quelle, b.spalten, b.zeilen]).toEqual([
      'Messe · Bühne',
      'osc',
      quelleOsc(projekt, projekt.sets[0]),
      24,
      8
    ])
    expect(ton.spalten).toBe(12)
    expect(
      b.seiten[0].tasten.map((t) => [t.titel, t.spalte, t.zeile, t.breite, t.hoehe, t.funktion])
    ).toEqual([
      ['Licht', 0, 0, 6, 2, ''],
      ['Hell', 6, 0, 3, 2, 'LED-Prozessor (NovaStar): Helligkeit setzen auf 80 %'],
      ['Dimmer', 0, 2, 3, 6, 'Regler'],
      ['Szene', 3, 2, 3, 6, 'Auswahl: Intro · Show']
    ])
    // Überschrift farbig als Text, Kacheln farbig als Fläche
    expect([b.seiten[0].tasten[0].textfarbe, b.seiten[0].tasten[0].hintergrund]).toEqual([
      '#eab308',
      ''
    ])
  })

  it('übersteht die Prüfung; im Druck der Reihe nach nummeriert und mit Spanne angeordnet', () => {
    const a = mitFeldern(ausOsc(projekt))
    expect(sanitizeAnleitung(structuredClone(a))).toEqual(a)
    const h = vorschau(
      a,
      { stufe: 1, lern: false, firma: DEFAULT_FIRMENPROFIL, datum: '23.10.2026', modus: 'druck' },
      'bedienfeld'
    ).html
    expect(h).toContain('grid-column:1 / span 6;grid-row:1 / span 2')
    expect(h).toContain('<td class="n">4</td><td><b>Szene</b> – Auswahl: Intro · Show</td>')
  })

  it('Fläche wie in der Vorschau der Steuerung: Handy, Tablet quer, Desktop', () => {
    expect(oscFlaeche({ device: 'phone', landscape: false })).toEqual({
      geraet: 'handy',
      quer: false,
      breite: 366,
      zeile: 38,
      abstand: 8
    })
    expect(oscFlaeche({ device: 'tablet', landscape: true })).toMatchObject({
      geraet: 'tablet',
      quer: true,
      breite: 1088
    })
    expect(oscFlaeche({ device: 'off', landscape: false })).toMatchObject({
      geraet: 'desktop',
      breite: DESKTOP_BREITE
    })
  })

  it('im Druck folgen Zeilenhöhe und Breite der Fläche – ein Handy-Layout bleibt schmal', () => {
    const ctx = {
      stufe: 1 as const,
      lern: false,
      firma: DEFAULT_FIRMENPROFIL,
      datum: '23.10.2026',
      modus: 'druck' as const
    }
    const druck = (device: 'off' | 'phone'): string => {
      const p = structuredClone(projekt)
      p.sets[0].device = device
      return vorschau(mitFeldern(ausOsc(p)), ctx, 'bedienfeld').html
    }
    const handy = druck('phone')
    // 366 px Breite, 38 px Zeilen, 8 px Abstand × 0,75
    expect(handy).toContain('grid-template-rows:repeat(8,29px);gap:6px;max-width:289px')
    expect(handy).toContain('OSC-Steuerung (Mottulbox) · Handy hochkant')
    // Desktop 1200 px auf 680 px: flachere Zeilen, volle Breite
    expect(druck('off')).toContain('grid-template-rows:repeat(8,22px);gap:5px;max-width:694px')
  })

  it('ein anderes Gerät nimmt das Verhältnis der OSC-Fläche nicht mit; Prüfung beim Laden', () => {
    const [b] = ausOsc(projekt)
    expect(mitRaster(b, 'sd-xl').flaeche).toBeNull()
    expect(mitRaster(b, 'osc', { spalten: 12 }).flaeche).toEqual(b.flaeche)
    const [x] = sanitizeAnleitung({
      bedienfelder: [{ ...neuesBedienfeld('sd'), flaeche: { geraet: 'handy', breite: 366 } }]
    }).bedienfelder
    expect(x.flaeche).toBeNull()
  })

  it('erneut übernehmen ersetzt das Feld derselben Quelle an seiner Stelle', () => {
    const vonHand = neuesBedienfeld('sd', 'Stream Deck')
    const [b1, b2] = ausOsc(projekt)
    const neu = ausOsc(projekt)
    const l = felderEinsetzen([b1, vonHand, b2], [neu[0]])
    expect(l.map((x) => x.id)).toEqual([neu[0].id, vonHand.id, b2.id])
    expect(felderEinsetzen([vonHand], neu).map((x) => x.id)).toEqual([
      vonHand.id,
      neu[0].id,
      neu[1].id
    ])
  })
})

describe('Übernahme aus dem Video-Player', () => {
  const bibliothek = [
    media('m1', 'Intro', 45.4),
    media('m2', 'Logo', null),
    media('m3', 'Loop', 125)
  ]
  const zustand = {
    playlist: [],
    transition: 'crossfade' as const,
    transitionMs: 500,
    idlePattern: 'off' as const,
    imageDurationSec: 10
  }

  it('Einstellungen in Sätzen, je Playlist eine nummerierte Liste', () => {
    const b = ausPlayer({
      playlists: [{ name: 'Show', mediaIds: ['m1', 'm2', 'gelöscht', 'm3'] }],
      bibliothek,
      zustand,
      ausgabe: 'DELL U2720Q'
    })
    expect(b.map((x) => x.typ === 'text' && x.text)).toEqual([
      '**Mottulbox-Player**\n\nDas Bild geht auf den Bildschirm **DELL U2720Q**. Zwischen den Clips wird überblendet (0,5 s). Läuft nichts, bleibt die Wand schwarz.',
      '**Playlist „Show“**\n\n1. Intro – 0:45\n2. Logo – Standbild, 10 s\n3. Loop – 2:05'
    ])
    expect(
      b.every((x) => 'herkunft' in x && x.herkunft?.baustein === HERKUNFT_PLAYER.baustein)
    ).toBe(true)
  })

  it('ohne gespeicherte Playlists die geladene; erneut übernehmen ersetzt an der Stelle', () => {
    const b = ausPlayer({
      playlists: [],
      bibliothek,
      zustand: { ...zustand, playlist: [bibliothek[2]], transition: 'cut' },
      ausgabe: null
    })
    expect(b[1].typ === 'text' && b[1].text).toBe('**Playlist „Playlist“**\n\n1. Loop – 2:05')
    const eigen: Block = { id: 'e', typ: 'text', stufe: 1, text: 'eigener Text' }
    const erst = playerEinsetzen([eigen], b)
    expect(erst.map((x) => x.id)).toEqual(['e', b[0].id, b[1].id])
    const nochmal = ausPlayer({ playlists: [], bibliothek, zustand, ausgabe: null })
    const zweit = playerEinsetzen([b[0], eigen, b[1]], nochmal)
    expect(zweit.map((x) => x.id)).toEqual([nochmal[0].id, eigen.id])
  })
})
