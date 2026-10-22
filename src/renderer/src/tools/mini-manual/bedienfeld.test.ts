import { describe, expect, it } from 'vitest'
import { DEFAULT_FIRMENPROFIL } from '@shared/types'
import {
  ausserhalb,
  leereTaste,
  mitRaster,
  neueSeite,
  neuesBedienfeld,
  seiteEntfernen,
  setzeTaste,
  tauscheTasten
} from './bedienfeld'
import type { Anleitung, Bedienfeld, Taste } from './model'
import { pruefung } from './pruefung'
import { sanitizeAnleitung } from './sanitize'
import { vorschau, type SeitenKontext } from './seiten'
import { neueAnleitung } from './vorlage'

const taste = (spalte: number, zeile: number, p: Partial<Taste> = {}): Taste => ({
  ...leereTaste(spalte, zeile),
  ...p
})

/** Stream Deck mit zwei Seiten: Intro, Pause, eine Technik-Taste und „Weiter“ */
function beispiel(): Bedienfeld {
  const b = neuesBedienfeld('sd', 'Bühne')
  const zwei = { ...neueSeite('Licht'), id: 'licht' }
  let eins = { ...b.seiten[0], id: 'show', name: 'Show' }
  eins = setzeTaste(eins, taste(0, 0, { titel: 'Intro', funktion: 'Startet das Intro-Video' }))
  eins = setzeTaste(eins, taste(1, 0, { titel: 'Pause', hintergrund: '#c62828' }))
  eins = setzeTaste(eins, taste(2, 0, { titel: 'Neustart', stufe: 3, notiz: 'Nur Technik' }))
  eins = setzeTaste(eins, taste(4, 2, { nav: { art: 'seite', ziel: 'licht' } }))
  return { ...b, seiten: [eins, zwei] }
}

function mit(b: Bedienfeld): Anleitung {
  const a = neueAnleitung()
  a.bedienfelder = [b]
  a.kapitel = a.kapitel.map((k) => (k.id === 'bedienfeld' ? { ...k, an: true } : k))
  return a
}

const ctx = (stufe: 1 | 2 | 3, lern = false): SeitenKontext => ({
  stufe,
  lern,
  firma: DEFAULT_FIRMENPROFIL,
  datum: '22.10.2026',
  modus: 'druck'
})

describe('Bedienfeld: Tasten und Raster', () => {
  it('neues Feld hat das Raster des Geräts und eine Seite', () => {
    const b = neuesBedienfeld('sd-xl')
    expect([b.spalten, b.zeilen, b.seiten.length]).toEqual([8, 4, 1])
  })

  it('Taste setzen hält die Liste Zeile für Zeile sortiert, eine leere fällt heraus', () => {
    let s = neueSeite()
    s = setzeTaste(s, taste(1, 1, { titel: 'B' }))
    s = setzeTaste(s, taste(3, 0, { titel: 'A' }))
    expect(s.tasten.map((t) => t.titel)).toEqual(['A', 'B'])
    s = setzeTaste(s, taste(3, 0, { titel: 'A2' }))
    expect(s.tasten.map((t) => t.titel)).toEqual(['A2', 'B'])
    s = setzeTaste(s, taste(3, 0))
    expect(s.tasten.map((t) => t.titel)).toEqual(['B'])
  })

  it('Ziehen tauscht zwei Tasten bzw. setzt eine auf einen leeren Platz', () => {
    let s = neueSeite()
    s = setzeTaste(s, taste(0, 0, { titel: 'A' }))
    s = setzeTaste(s, taste(1, 0, { titel: 'B' }))
    s = tauscheTasten(s, { spalte: 0, zeile: 0 }, { spalte: 1, zeile: 0 })
    expect(s.tasten.map((t) => [t.titel, t.spalte])).toEqual([
      ['B', 0],
      ['A', 1]
    ])
    s = tauscheTasten(s, { spalte: 1, zeile: 0 }, { spalte: 4, zeile: 2 })
    expect(s.tasten.map((t) => [t.titel, t.spalte, t.zeile])).toEqual([
      ['B', 0, 0],
      ['A', 4, 2]
    ])
  })

  it('kleineres Raster: Tasten außerhalb werden gezählt und fallen weg', () => {
    const b = beispiel()
    expect(ausserhalb(b, 3, 2)).toBe(1) // die Navigation unten rechts
    const mini = mitRaster(b, 'sd-mini')
    expect([mini.spalten, mini.zeilen]).toEqual([3, 2])
    expect(mini.seiten[0].tasten.map((t) => t.titel)).toEqual(['Intro', 'Pause', 'Neustart'])
    // feste Geräte nehmen kein Wunsch-Raster an, wählbare werden begrenzt
    expect(mitRaster(b, 'sd', { spalten: 9 }).spalten).toBe(5)
    expect(mitRaster(b, 'frei', { spalten: 99, zeilen: 0 })).toMatchObject({
      spalten: 16,
      zeilen: 1
    })
  })

  it('Seite entfernen: Tasten dorthin verlieren ihr Ziel, die letzte Seite bleibt', () => {
    const b = seiteEntfernen(beispiel(), 'licht')
    expect(b.seiten.map((s) => s.id)).toEqual(['show'])
    expect(b.seiten[0].tasten.find((t) => t.spalte === 4)?.nav).toBeNull()
    expect(seiteEntfernen(b, 'show').seiten).toHaveLength(1)
  })
})

describe('Bedienfeld: Prüfung beim Laden', () => {
  it('was der Editor erzeugt, übersteht die Prüfung unverändert', () => {
    const a = mit(beispiel())
    expect(sanitizeAnleitung(structuredClone(a))).toEqual(a)
  })

  it('eine Anleitung von vor Version 6 bekommt eine leere Liste', () => {
    const alt = structuredClone(neueAnleitung()) as Partial<Anleitung>
    delete alt.bedienfelder
    expect(sanitizeAnleitung(alt).bedienfelder).toEqual([])
  })

  it('fremde Werte: Gerät, Farben, Plätze, doppelte Tasten, tote Ziele', () => {
    const [b] = sanitizeAnleitung({
      bedienfelder: [
        {
          id: 'x',
          geraet: 'stream-deck-9000',
          spalten: 40,
          zeilen: 2,
          seiten: [
            {
              id: 's1',
              tasten: [
                { spalte: 0, zeile: 0, titel: 'A', hintergrund: 'red', textfarbe: '#ABCDEF' },
                { spalte: 0, zeile: 0, titel: 'doppelt' },
                { spalte: 20, zeile: 0, titel: 'außerhalb' },
                { spalte: 1, zeile: 0, nav: { art: 'seite', ziel: 'gibt-es-nicht' }, titel: 'N' },
                { spalte: 2, zeile: 1, nav: { art: 'irgendwas' }, titel: 'M' }
              ]
            }
          ]
        },
        { id: 'y', geraet: 'sd', seiten: [] }
      ]
    }).bedienfelder
    expect([b.geraet, b.spalten, b.zeilen]).toEqual(['frei', 16, 2])
    expect(b.seiten[0].tasten.map((t) => [t.titel, t.hintergrund, t.textfarbe, t.nav])).toEqual([
      ['A', '', '#abcdef', null],
      ['N', '', '', null],
      ['M', '', '', null]
    ])
    const y = sanitizeAnleitung({ bedienfelder: [{ id: 'y', geraet: 'sd', seiten: [] }] })
      .bedienfelder[0]
    expect([y.spalten, y.zeilen, y.seiten.length]).toEqual([5, 3, 1])
  })
})

describe('Bedienfeld in der Ausgabe', () => {
  const html = (a: Anleitung, c: SeitenKontext): string => vorschau(a, c, 'bedienfeld').html

  it('Raster wie am Gerät, Liste mit Funktion; Technik-Taste erst ab Stufe Technik', () => {
    const a = mit(beispiel())
    const h1 = html(a, ctx(1))
    // 15 Plätze der Seite „Show“; die leere Seite „Licht“ erscheint nicht als Raster
    expect(h1.match(/class="taste/g)).toHaveLength(15)
    expect(h1).toContain('<h4>Show</h4>')
    expect(h1).not.toContain('<h4>Licht</h4>')
    expect(h1).toContain('<b>Intro</b> – Startet das Intro-Video')
    expect(h1).toContain('style="background:#c62828"')
    expect(h1).not.toContain('Neustart')
    // Navigation ohne Titel: Aufschrift und Erklärung aus dem Ziel
    expect(h1).toContain('<span class="t">▸ Licht</span>')
    expect(h1).toContain('Öffnet „Licht“')
    const h3 = html(a, ctx(3))
    expect(h3).toContain('<b>Neustart</b>')
    expect(h3).toContain('Nur Technik')
  })

  it('Aufschriften werden maskiert, Farben nur als #rrggbb', () => {
    const b = beispiel()
    b.seiten[0] = setzeTaste(b.seiten[0], taste(3, 1, { titel: '<img src=x onerror=alert(1)>' }))
    b.seiten[0].tasten[0].hintergrund = 'red;background-image:url(http://x)'
    const h = html(mit(b), ctx(1))
    expect(h).not.toContain('<img src=x')
    expect(h).toContain('&lt;img src=x')
    expect(h).not.toContain('url(http')
  })

  it('Prüfung: leeres Kapitel und Tasten ohne Aufschrift', () => {
    const leer = neueAnleitung()
    leer.kapitel = leer.kapitel.map((k) => (k.id === 'bedienfeld' ? { ...k, an: true } : k))
    expect(pruefung(leer, ctx(1), { ledWallNeuer: null }).map((p) => p.text)).toContain(
      'Bedienfeld: noch leer.'
    )
    const b = beispiel()
    b.seiten[1] = setzeTaste(b.seiten[1], taste(0, 0, { funktion: 'Saallicht an' }))
    const p = pruefung(mit(b), ctx(1), { ledWallNeuer: null }).map((x) => x.text)
    expect(p).not.toContain('Bedienfeld: noch leer.')
    expect(p).toContain('Bedienfeld „Bühne“: eine Taste ohne Aufschrift (nur die Nummer).')
  })
})
