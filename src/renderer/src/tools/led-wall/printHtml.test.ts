import { describe, expect, it } from 'vitest'
import { computeWall } from './compute'
import { sanitizeLedWallConfig } from './config'
import { ledWallPrintHtml, type PrintData } from './printHtml'
import { analyzeProcessors } from './processors'

function daten(p: Partial<PrintData> = {}): PrintData {
  const d = computeWall(sanitizeLedWallConfig({ widthM: '2', heightM: '1' })) // 4 × 2 Module
  return {
    ...d,
    projectName: 'Messe <A>',
    customerName: '',
    buildMode: 'stacked',
    sig: [
      [0, 0, 1, 1],
      [0, 0, 1, 1]
    ],
    pwr: [
      [0, 0, 0, 0],
      [-1, -1, -1, -1]
    ],
    sigMeta: { '0': { start: 'bl', axis: 'row' } },
    pwrMeta: {},
    rear: false,
    landscape: true,
    curve: null,
    ...p
  }
}

describe('PDF-Doku der LED-Wall', () => {
  it('Pfeile nur für Ketten mit Verlauf; Marker je Plan eindeutig', () => {
    const { html, fileName } = ledWallPrintHtml(daten())
    expect(html).toContain('<marker id="pdf-S-0"')
    expect(html).not.toContain('pdf-S-1') // S2 ohne Verlauf
    expect(html).not.toContain('pdf-P-') // Strom ohne Verlauf
    expect(html).toContain('Messe &lt;A&gt;')
    expect(fileName).toBe('LEDWall-Messe A.pdf')
  })

  it('Signal: Prozessor, Ports, „B“ bei Backup und Warnung über der Grenze', () => {
    const d = daten({ sigMeta: { '0': { start: 'bl', axis: 'row', backup: {} } } })
    const c = sanitizeLedWallConfig({ widthM: '2', heightM: '1', sig: d.sig, sigMeta: d.sigMeta })
    const [g] = analyzeProcessors([{ id: 'a', name: 'Wand 1', config: c }])
    const { html } = ledWallPrintHtml({ ...d, wallId: 'a', signal: g })
    expect(html).toContain('<h2>Signal: Prozessor und Ports</h2>')
    expect(html).toContain('NovaPro UHD Jr · 8 bit · 60 Hz · Ports 3 von 16')
    expect(html).toContain('<td>1 · Backup 2</td>')
    expect(html).toContain('<g data-backup="0">')
    // ohne Analyse keine Tabelle (z. B. ohne Ketten)
    expect(ledWallPrintHtml(daten()).html).not.toContain('Prozessor und Ports')
  })

  it('Ansicht von hinten: Hinweis und gespiegelte Pläne mit Spaltennummern', () => {
    const vorne = ledWallPrintHtml(daten()).html
    const hinten = ledWallPrintHtml(daten({ rear: true })).html
    expect(vorne).not.toContain('Ansicht von hinten')
    expect(hinten).toContain('Ansicht von hinten – Publikum auf der anderen Seite')
    // Start von S1 unten links (vorne) liegt von hinten rechts: anderer Kreis-Mittelpunkt
    const start = (h: string): string | undefined => /<circle cx="([\d.]+)"/.exec(h)?.[1]
    expect(start(vorne)).not.toBe(start(hinten))
  })
})
