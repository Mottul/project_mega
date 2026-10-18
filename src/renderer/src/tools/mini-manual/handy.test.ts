import { describe, expect, it } from 'vitest'
import { DEFAULT_FIRMENPROFIL } from '@shared/types'
import { handyHtml, onlineKontext } from './handy'
import type { SeitenKontext } from './seiten'
import { neueAnleitung } from './vorlage'

const ctx = (stufe: 1 | 2 | 3, lern = false): SeitenKontext => ({
  stufe,
  lern,
  firma: {
    ...DEFAULT_FIRMENPROFIL,
    kontakte: [
      {
        id: 'k',
        name: 'Matthias',
        funktion: '',
        mobil: '+43 664 1234567',
        buero: '',
        mail: '',
        erreichbarkeit: '',
        whatsapp: false
      }
    ]
  },
  datum: '18.10.2026',
  modus: 'druck'
})

function anleitung() {
  const a = neueAnleitung()
  a.zugaenge.push({
    id: 'z1',
    wofuer: 'Laptop',
    benutzer: 'show',
    passwort: 'geheim123',
    notiz: '',
    stufe: 2
  })
  a.kontakte.push(ctx(1).firma.kontakte[0])
  return a
}

describe('Handy-Fassung', () => {
  it('eine Datei: Ansicht fürs Handy, Inhalt, Skript, nichts von außen', () => {
    const html = handyHtml(anleitung(), ctx(2), { online: false })
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">')
    expect(html).toContain('<nav class="inhalt" aria-label="Inhalt">')
    expect(html).toContain('<a href="#k-fehlersuche">Fehlersuche</a>')
    expect(html).toContain('<script>(function(){')
    expect(html).not.toMatch(/<link\b|src="https?:|@import/)
    // als Datei mit allem, was die Stufe zeigt – Zugangsdaten wie im PDF (ab Werk separat)
    expect(html).toContain('id="k-zugang"')
    expect(html).not.toContain('geheim123')
    // Anrufen-Leiste mit der Nummer des ersten Kontakts
    expect(html).toContain('<a href="tel:+436641234567">Anrufen: Matthias</a>')
  })

  it('Fehlersuche: Sprungmarken je Schritt, maschinenlesbare Ziele fürs Skript', () => {
    const html = handyHtml(anleitung(), ctx(3), { online: false })
    expect(html).toContain('<div class="fall" data-fall="lib-wand-dunkel">')
    expect(html).toMatch(/<div class="fs" id="fs-lib-wand-dunkel-1" data-nr="1">/)
    expect(html).toMatch(/data-wahl="Ja" data-ziel="(s:\d+|f:[\w-]+|ende)"/)
    expect(html).toMatch(/weiter bei <a href="#fs-lib-wand-dunkel-\d+"><b>\d+<\/b><\/a>/)
  })

  it('online: nie Zugangsdaten, höchstens Betreuung, keine Lernausgabe', () => {
    const a = anleitung()
    a.ausgabe.passwoerter = 'drucken'
    const html = handyHtml(a, ctx(3), { online: true })
    expect(html).not.toContain('id="k-zugang"')
    expect(html).not.toContain('geheim123')
    expect(html).not.toContain('Zugangsdaten')
    expect(html).toContain('Stufe Betreuung')
    expect(onlineKontext(ctx(3, true))).toMatchObject({ stufe: 2, lern: false })
    expect(onlineKontext(ctx(1))).toMatchObject({ stufe: 1 })
  })
})
