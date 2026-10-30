import { describe, expect, it } from 'vitest'
import { packingDateiname, packingHtml, type PackPdfOptionen } from './printHtml'
import type { PackItem } from './store'

const item = (category: string, name: string): PackItem => ({
  id: name,
  category,
  name,
  qty: 1,
  unit: 'Stk.',
  checked: false,
  note: ''
})

const items = [item('Ton', 'Mikrofon'), item('LED-Wall · Bar', 'Modul'), item('Licht', 'Spot')]
const opt = (p: Partial<PackPdfOptionen> = {}): PackPdfOptionen => ({
  categories: ['LED-Wall · Bar', 'Leer', 'Licht', 'Ton'],
  colors: {},
  bloeckeZusammen: false,
  datum: '24.10.2026',
  ...p
})

describe('Packliste als PDF', () => {
  it('Dateiname: nur unbedenkliche Zeichen, ohne Projekt schlicht „Packliste“', () => {
    expect(packingDateiname('Messe Dornbirn: Halle/3')).toBe('Packliste-Messe Dornbirn Halle3.pdf')
    expect(packingDateiname('  ')).toBe('Packliste.pdf')
  })

  it('Blöcke in der Reihenfolge der Liste, leere Kategorien fallen weg', () => {
    const h = packingHtml('Messe', items, opt())
    const titel = [...h.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1])
    expect(titel).toEqual(['LED-Wall · Bar', 'Licht', 'Ton'])
  })

  it('Blöcke zusammenhalten nur auf Wunsch; fortlaufend bleibt der Titel bei seiner Tabelle', () => {
    expect(packingHtml('', items, opt({ bloeckeZusammen: true }))).toContain(
      '.block{break-inside:avoid;page-break-inside:avoid}'
    )
    const fortlaufend = packingHtml('', items, opt())
    expect(fortlaufend).not.toContain('.block{break-inside:avoid')
    expect(fortlaufend).toContain('h2{break-after:avoid')
  })

  it('Farbe des Blocks als Linie unter dem Titel, nur als #rrggbb', () => {
    const h = packingHtml(
      '',
      items,
      opt({ colors: { Ton: '#22c55e', Licht: 'red;background:url(x)' } })
    )
    expect(h).toContain('<h2 style="border-bottom-color:#22c55e">Ton</h2>')
    expect(h).toContain('<h2>Licht</h2>')
    expect(h).not.toContain('url(x)')
  })
})
