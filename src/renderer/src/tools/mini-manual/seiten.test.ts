import { describe, expect, it } from 'vitest'
import { fotoHashesIn } from '@shared/fotos'
import { DEFAULT_FIRMENPROFIL } from '@shared/types'
import { ledWallFileData, sanitizeLedWallConfig } from '../led-wall/config'
import { kopieAus } from './ledWallKopie'
import { leereAnleitung, type Anleitung, type Block } from './model'
import { platzhalterWerte } from './platzhalter'
import { pruefung } from './pruefung'
import { sanitizeAnleitung } from './sanitize'
import { handbuchHtml, kapitelNummern, kurzkarteHtml, vorschau, type SeitenKontext } from './seiten'
import { neueAnleitung } from './vorlage'

const ctx = (stufe: 1 | 2 | 3, extra: Partial<SeitenKontext> = {}): SeitenKontext => ({
  stufe,
  lern: false,
  firma: DEFAULT_FIRMENPROFIL,
  datum: '17.10.2026',
  modus: 'druck',
  ...extra
})

function beispiel(): Anleitung {
  const a = neueAnleitung()
  a.deckblatt.projekt = 'Messe <Dornbirn>'
  a.zugaenge.push({
    id: 'z1',
    wofuer: 'Laptop',
    benutzer: 'show',
    passwort: 'geheim123',
    notiz: '',
    stufe: 2
  })
  a.kontakte.push({
    id: 'k1',
    name: 'Matthias',
    funktion: 'Technik',
    mobil: '+43 664 123 45 67',
    buero: '',
    mail: '',
    erreichbarkeit: 'immer',
    whatsapp: true
  })
  return a
}

describe('Handbuch', () => {
  it('escapt alles aus den Daten', () => {
    const html = handbuchHtml(beispiel(), ctx(1))
    expect(html).toContain('Messe &lt;Dornbirn&gt;')
    expect(html).not.toContain('<Dornbirn>')
  })

  it('Stufe steuert, was erscheint: Zugangsdaten erst ab Betreuung, Dokumentstand ab Technik', () => {
    const a = beispiel()
    const n1 = kapitelNummern(a, ctx(1))
    expect(n1.has('zugang')).toBe(false)
    expect(n1.has('dokumentstand')).toBe(false)
    expect(kapitelNummern(a, ctx(2)).has('zugang')).toBe(true)
    expect(kapitelNummern(a, ctx(3)).has('dokumentstand')).toBe(true)
  })

  it('Passwörter: separat ist die Vorgabe, drucken nur auf Wunsch', () => {
    const a = beispiel()
    expect(handbuchHtml(a, ctx(2))).not.toContain('geheim123')
    expect(handbuchHtml(a, ctx(2))).toContain('wird separat übergeben')
    a.ausgabe.passwoerter = 'schwaerzen'
    expect(handbuchHtml(a, ctx(2))).not.toContain('geheim123')
    a.ausgabe.passwoerter = 'drucken'
    expect(handbuchHtml(a, ctx(2))).toContain('geheim123')
  })

  it('Fehlersuche: auf Bedienung „Ab hier bitte anrufen“, auf Technik nicht nötig', () => {
    const a = beispiel()
    expect(handbuchHtml(a, ctx(1))).toContain('Ab hier bitte anrufen')
    expect(handbuchHtml(a, ctx(3))).not.toContain('Ab hier bitte anrufen')
  })

  it('Fälle erscheinen in der Reihenfolge der Liste (Nummern im Text passen)', () => {
    const a = beispiel()
    const html = handbuchHtml(a, ctx(3))
    const pos = a.fehlerfaelle.map((f) => html.indexOf(`id="fall-${f.id}"`))
    expect(pos.every((p) => p > 0)).toBe(true)
    expect(pos).toEqual([...pos].sort((x, y) => x - y))
  })

  it('Lernausgabe: alles, mit Stufen-Kennzeichen', () => {
    const html = handbuchHtml(beispiel(), ctx(1, { lern: true }))
    expect(html).toContain('class="stufe s3"')
    expect(html).toContain('Lernausgabe')
  })

  it('Fotos als foto://-Adresse; Logo nur mit gültigem Hash', () => {
    const a = beispiel()
    a.deckblatt.foto = 'b'.repeat(64)
    const html = handbuchHtml(
      a,
      ctx(1, { firma: { ...DEFAULT_FIRMENPROFIL, logo: 'c'.repeat(64) } })
    )
    expect(fotoHashesIn(html)).toEqual(['c'.repeat(64), 'b'.repeat(64)])
  })

  it('Fotos: einzeln als Figur, aufeinanderfolgende nebeneinander (2 bzw. 3 je Reihe)', () => {
    const a = beispiel()
    const f = (n: number, text = ''): Block => ({
      id: `f${n}`,
      typ: 'foto',
      stufe: 1,
      foto: String(n).repeat(64),
      text
    })
    const t: Block = { id: 't', typ: 'text', stufe: 1, text: 'Dazwischen' }
    a.kapitel = a.kapitel.map((k) =>
      k.id === 'pflege'
        ? { ...k, an: true, stufe: 1, bloecke: [f(1, 'Rack'), t, f(2), f(3), f(4)] }
        : k
    )
    const html = vorschau(a, ctx(1), 'pflege').html
    expect(html).toContain('<figure><img class="foto"')
    expect(html).toContain('<figcaption>Rack</figcaption>')
    expect(html.match(/<div class="fotos n3">/g)).toHaveLength(1) // 2, 3, 4 zusammen
    expect(html.indexOf('Dazwischen')).toBeLessThan(html.indexOf('class="fotos'))
    // Foto-Block ohne Bild fällt weg und trennt keine Gruppe
    a.kapitel = a.kapitel.map((k) =>
      k.id === 'pflege' ? { ...k, bloecke: [f(1), { ...f(9), foto: null }, f(2)] } : k
    )
    expect(vorschau(a, ctx(1), 'pflege').html).toContain('<div class="fotos n2">')
  })

  it('Akzentfarbe nur als gültiges Hex – sonst die Vorgabe (CSS-Einschleusung)', () => {
    const html = handbuchHtml(
      beispiel(),
      ctx(1, { firma: { ...DEFAULT_FIRMENPROFIL, akzent: 'red;}body{display:none' } })
    )
    expect(html).not.toContain('display:none')
    expect(html).toContain('#eab308')
  })

  it('Kontakt mit QR-Code zum Anrufen', () => {
    const html = handbuchHtml(beispiel(), ctx(1))
    expect(html).toContain('href="tel:+436641234567"')
    expect(html).toContain('<svg class="qr"')
  })
})

describe('Kurzkarte und Vorschau', () => {
  it('Kurzkarte: Ein-/Ausschalten, Notfall, Kontakt', () => {
    const html = kurzkarteHtml(beispiel(), ctx(1))
    expect(html).toContain('Einschalten')
    expect(html).toContain('Ausschalten')
    expect(html).toContain('Etwas stimmt nicht?')
    expect(html).toContain('Matthias')
  })
  it('Vorschau eines abgewählten Kapitels sagt es', () => {
    const a = beispiel()
    a.kapitel = a.kapitel.map((k) => (k.id === 'pflege' ? { ...k, an: false } : k))
    expect(vorschau(a, ctx(1), 'pflege').html).toContain('erscheint in dieser Ausgabe nicht')
    expect(vorschau(a, ctx(1), 'deckblatt').html).toContain('Messe &lt;Dornbirn&gt;')
  })
})

describe('Online-Fassung', () => {
  const URL_ = 'https://filedn.eu/llBIn2VtMT8YMNyN4Vaac98/messe-dornbirn-2026-k7f3q2x9/index.html'

  it('Kurzkarte druckt die Adresse als QR-Code (Version 5 passt)', () => {
    const a = beispiel()
    expect(kurzkarteHtml(a, ctx(1))).not.toContain('class="handy"')
    a.ausgabe.online = { ordner: 'messe-dornbirn-2026-k7f3q2x9', url: URL_ }
    const html = kurzkarteHtml(a, ctx(1))
    expect(html).toContain('<b>Am Handy:</b>')
    expect(html).toContain(
      'filedn.eu/llBIn2VtMT8YMNyN4Vaac98/messe-dornbirn-2026-k7f3q2x9/index.html'
    )
    // 37 Module + 2 × 4 Ruhezone
    expect(html).toContain('viewBox="0 0 45 45"')
  })

  it('gespeichert wird nur ein Ordnername wie von main und eine https-Adresse', () => {
    const mit = (online: unknown) => sanitizeAnleitung({ ausgabe: { online } }).ausgabe.online
    expect(mit({ ordner: 'messe-k7f3q2x9', url: URL_ })).toEqual({
      ordner: 'messe-k7f3q2x9',
      url: URL_
    })
    expect(mit(null)).toBeNull()
    expect(mit({ ordner: '../x', url: URL_ })).toBeNull()
    expect(mit({ ordner: 'messe-k7f3q2x9', url: 'http://filedn.eu/x/index.html' })).toBeNull()
    expect(mit({ ordner: 'messe-k7f3q2x9', url: 'javascript:alert(1)' })).toBeNull()
    expect(mit({ ordner: 'messe-k7f3q2x9', url: 'https://x.eu/"><script>' })).toBeNull()
  })
})

describe('Kapitel Verkabelung', () => {
  function mitPlan(fiber: Record<string, unknown> | null = null): Anleitung {
    const a = beispiel()
    // 2 m × 1 m 496-2,0 = 4 × 2 Module; S1 links (Startecke), S2 rechts; P1 oben
    const c = sanitizeLedWallConfig({
      widthM: '2',
      heightM: '1',
      sig: [
        [0, 0, 1, 1],
        [0, 0, 1, 1]
      ],
      pwr: [
        [0, 0, 0, 0],
        [-1, -1, -1, -1]
      ],
      sigMeta: { '0': { start: 'bl', axis: 'row', backup: {} } },
      pwrMeta: { '0': { circuit: 'F3', phase: 'L2' } },
      fiber
    })
    a.ledWall = kopieAus(
      ledWallFileData('Messe', '', [{ id: 'a', name: 'Bühne', config: c }]),
      null
    )
    return a
  }

  it('Pläne von hinten (ab Werk), Ports und Kreise aus der Kopie', () => {
    const html = vorschau(mitPlan(), ctx(2), 'verkabelung').html
    expect(html).toContain('Ansicht von hinten – Publikum auf der anderen Seite')
    // Marker je Plan und Wand eindeutig
    expect(html).toContain('id="mm-0-S-0"')
    expect(html).toContain('<tr><td>S1</td><td>4</td><td>1 · B 2</td></tr>')
    expect(html).toContain('<tr><td>P1</td><td>4</td><td>F3 · L2</td><td>3,1 A</td></tr>')
    expect(html).toContain('<b>Prozessor:</b> NovaPro UHD Jr')
    expect(html).not.toContain('Glasfaser')
  })

  it('von vorne ohne Hinweis; Glasfaser-Strecke im Kopf', () => {
    const a = mitPlan({ box: 'cvt10', variant: 'S', redundancy: 'fiber', lengthM: 60 })
    a.kapitel = a.kapitel.map((k) => (k.id === 'verkabelung' ? { ...k, ansicht: 'vorne' } : k))
    const html = vorschau(a, ctx(2), 'verkabelung').html
    expect(html).not.toContain('Ansicht von hinten')
    expect(html).toContain(
      '<b>Glasfaser:</b> CVT10-S · 1 Box · 2 Fasern à 60 m · Faser redundant – Box A an OPT1 (Ports 1, 2, 3)'
    )
  })

  it('Überlast aus der Planung steht in der Prüfung vor dem Export', () => {
    const a = mitPlan()
    expect(
      pruefung(a, ctx(2), { ledWallNeuer: null }).some((p) => p.text.startsWith('Verkabelung:'))
    ).toBe(false)
    const voll = a.ledWall!.waende[0]
    voll.daten = { ...(voll.daten as object), mains: { voltage: 230, breakerA: 2 } }
    expect(pruefung(a, ctx(2), { ledWallNeuer: null })).toContainEqual({
      schwere: 'warnung',
      text: 'Verkabelung: P1: 4 Module = 3,1 A – über der Absicherung (2 A). Kette teilen, höchstens 2 Module je Kreis.',
      kapitel: 'verkabelung'
    })
  })

  it('ohne Kopie ein Hinweis; die Glasfaser-Frage der Fehlersuche richtet sich nach der Kopie', () => {
    const ohne = beispiel()
    ohne.ledWall = null
    expect(vorschau(ohne, ctx(2), 'verkabelung').html).toContain(
      'Noch keine LED-Wall-Planung übernommen'
    )
    const frage = 'Läuft das Signal über Glasfaser'
    const fs = (a: Anleitung): string => vorschau(a, ctx(3), 'fehlersuche').html
    expect(ohne.fehlerfaelle.map((f) => f.id)).toContain('lib-wand-dunkel')
    expect(fs(ohne)).toContain(frage)
    expect(fs(mitPlan())).not.toContain(frage)
    expect(fs(mitPlan({ box: 'cvt10' }))).not.toContain(frage)
    expect(fs(mitPlan({ box: 'cvt10' }))).toContain('Hat die Breakout-Box Strom')
  })
})

describe('mehrere LED-Wände', () => {
  function zweiWaende(): Anleitung {
    const a = beispiel()
    const c = sanitizeLedWallConfig({})
    a.ledWall = kopieAus(
      ledWallFileData('Messe', '', [
        { id: 'a', name: 'Bühne <links>', config: c },
        { id: 'b', name: 'Bar', config: { ...c, moduleKey: 'uS2+', widthM: '2', heightM: '1' } }
      ]),
      null
    )
    return a
  }

  it('Kapitel LED-Wand: je Wand eine Tabelle mit Namen; Systemübersicht nennt beide', () => {
    const a = zweiWaende()
    const wand = vorschau(a, ctx(3), 'ledWall').html
    expect(wand).toContain('<h3>Bühne &lt;links&gt;</h3>')
    expect(wand).toContain('<h3>Bar</h3>')
    expect(wand.match(/<table>/g)).toHaveLength(2)
    const sys = vorschau(a, ctx(1), 'system').html
    expect(sys).toContain('LED-Wände')
    expect(sys).toContain('Bar (uS2+)')
  })

  it('Platzhalter: {wand.…} ist die erste Wand, {wand2.…} die zweite', () => {
    const a = zweiWaende()
    const w = platzhalterWerte(a, DEFAULT_FIRMENPROFIL)
    expect(w.get('wand.name')).toBe('Bühne <links>')
    expect(w.get('wand2.name')).toBe('Bar')
    expect(w.get('wand2.modul')).toBe('uS2+')
    expect(w.has('wand3.name')).toBe(false)
  })

  it('Kurzkarte nennt die Zahl der Wände statt einer Größe', () => {
    expect(kurzkarteHtml(zweiWaende(), ctx(1))).toContain('2 LED-Wände')
  })
})

describe('Prüfung vor dem Export', () => {
  it('neue Anleitung: Kontakt fehlt, Platzhalter leer, keine Wand', () => {
    const a = neueAnleitung()
    const p = pruefung(a, ctx(1), { ledWallNeuer: null })
    expect(p.some((x) => x.schwere === 'fehler' && x.kapitel === 'kontakt')).toBe(true)
    expect(p.some((x) => x.text.includes('{prozessor.name}'))).toBe(true)
    expect(p.some((x) => x.text === 'Keine LED-Wall-Planung übernommen.')).toBe(true)
  })
  it('meldet gedruckte Passwörter und veraltete Planung', () => {
    const a = beispiel()
    a.ausgabe.passwoerter = 'drucken'
    a.ledWall = {
      waende: [
        {
          id: 'wand-1',
          name: 'Wand 1',
          daten: {},
          kennzahlen: {
            projekt: '',
            kunde: '',
            modulKey: '496-2,0',
            modul: '496-2,0',
            spalten: 8,
            reihen: 4,
            module: 32,
            breiteM: '3.97',
            hoeheM: '1.98',
            aufloesungX: 1920,
            aufloesungY: 960,
            gewichtKg: '240',
            leistungTypW: 2560,
            leistungMaxW: 5760,
            stromMaxA: '25'
          }
        }
      ],
      quelle: { rev: 7, sha256: 'a'.repeat(64) },
      uebernommen: '2026-10-16'
    }
    const p = pruefung(a, ctx(2), { ledWallNeuer: { von: 7, bis: 9 } })
    expect(p.map((x) => x.text)).toEqual(
      expect.arrayContaining([
        'Passwörter werden mitgedruckt.',
        'Planung geändert (Stand 7 → 9) – Kopie veraltet.'
      ])
    )
    expect(p.some((x) => x.kapitel === 'kontakt')).toBe(false)
  })
  it('eine leere Anleitung besteht ohne Absturz', () => {
    expect(() =>
      pruefung(leereAnleitung(), ctx(3, { lern: true }), { ledWallNeuer: null })
    ).not.toThrow()
  })
})
