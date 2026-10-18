import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '' } }))

const { inlineFotos } = await import('./inlineFotos')
const { neuerOrdner, onlineAdresse, ORDNER_RE, slug, zufall } = await import('./onlineAblage')

const H = 'a'.repeat(64)
const B = 'b'.repeat(64)

describe('Online-Ablage', () => {
  it('Adresse wie bei pCloud: Basis des Public Folders + Ordner + index.html', () => {
    expect(onlineAdresse('https://filedn.eu/llBIn2VtMT8YMNyN4Vaac98', 'messe-k7f3q2x9')).toBe(
      'https://filedn.eu/llBIn2VtMT8YMNyN4Vaac98/messe-k7f3q2x9/index.html'
    )
    expect(onlineAdresse(' https://filedn.eu/abc/ ', 'messe-k7f3q2x9')).toBe(
      'https://filedn.eu/abc/messe-k7f3q2x9/index.html'
    )
  })

  it('nur https, keine Abfragen, nur selbst erzeugte Ordnernamen', () => {
    expect(onlineAdresse('http://filedn.eu/abc/', 'messe-k7f3q2x9')).toBeNull()
    expect(onlineAdresse('javascript:alert(1)', 'messe-k7f3q2x9')).toBeNull()
    expect(onlineAdresse('https://filedn.eu/abc/?x=1', 'messe-k7f3q2x9')).toBeNull()
    expect(onlineAdresse('kein link', 'messe-k7f3q2x9')).toBeNull()
    for (const o of ['../x', 'a/b', 'Messe', '-ab', 'ab', 'x'.repeat(61)])
      expect(onlineAdresse('https://filedn.eu/abc/', o)).toBeNull()
  })

  it('Ordnername: lesbarer Teil aus dem Projekt plus Zufall, passt immer zur Prüfung', () => {
    expect(slug('Messe Dornbirn 2026')).toBe('messe-dornbirn-2026')
    expect(slug('Bühne – Süd/Ost')).toBe('buehne-sued-ost')
    expect(slug('Café Résumé')).toBe('cafe-resume')
    expect(slug('Ein sehr langer Projektname für die Halle')).toBe('ein-sehr-langer-proj')
    expect(neuerOrdner('Messe Dornbirn', 'k7f3q2x9')).toBe('messe-dornbirn-k7f3q2x9')
    expect(neuerOrdner('', 'k7f3q2x9')).toBe('anleitung-k7f3q2x9')
    expect(neuerOrdner('???', 'k7f3q2x9')).toBe('anleitung-k7f3q2x9')
    const z = zufall()
    expect(z).toMatch(/^[a-z2-9]{8}$/)
    expect(zufall()).not.toBe(z)
    for (const n of ['Messe', 'Ä', '  ', 'Projekt 1 – Halle 3 / Stand 12 (Nord)'])
      expect(neuerOrdner(n)).toMatch(ORDNER_RE)
  })

  it('Fotos werden als data:-URL eingesetzt, unbekannte zu einem leeren Bild', async () => {
    const html = `<img src="foto://bild/${H}"><img src="foto://bild/${B}"><img src="foto://bild/${H}">`
    const out = await inlineFotos(
      html,
      async (h) => (h === H ? { path: '/a.jpg', ext: 'jpg' } : null),
      async () => Buffer.from('JPEG')
    )
    expect(out).toBe(
      '<img src="data:image/jpeg;base64,SlBFRw=="><img src="data:,"><img src="data:image/jpeg;base64,SlBFRw==">'
    )
    expect(out).not.toContain('foto://')
  })
})
