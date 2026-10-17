import { describe, expect, it } from 'vitest'
import { fotoHashesIn } from '@shared/fotos'
import { DEFAULT_FIRMENPROFIL } from '@shared/types'
import { leereAnleitung, type Anleitung } from './model'
import { pruefung } from './pruefung'
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
      },
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
