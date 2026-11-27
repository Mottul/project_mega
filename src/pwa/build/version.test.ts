import { describe, expect, it } from 'vitest'
import { insertVersionMeta, readVersion, VERSION_META, type MetaQuelle } from './version'

const HTML = '<!doctype html>\n<html>\n  <head>\n    <title>MottulBox</title>\n  </head>\n</html>'
const V = '3f9a1c2b7d4e'

/** Nachgebautes document: liefert nur das <meta> mit der Kennung (Vitest läuft ohne DOM) */
function doc(content: string | null): MetaQuelle {
  return {
    querySelector: (sel: string) =>
      sel === `meta[name="${VERSION_META}"]` && content !== null
        ? { getAttribute: (a: string) => (a === 'content' ? content : null) }
        : null
  }
}

describe('Versionskennung der Rechner-PWA', () => {
  it('steht als <meta> im Kopf von index.html', () => {
    const html = insertVersionMeta(HTML, V)
    expect(html).toContain(`<meta name="${VERSION_META}" content="${V}" />`)
    expect(html.indexOf(VERSION_META)).toBeLessThan(html.indexOf('</head>'))
    // sonst unverändert
    expect(html.replace(`  <meta name="${VERSION_META}" content="${V}" />\n  `, '')).toBe(HTML)
  })

  it('bricht ab statt eine falsche Kennung oder eine zweite einzusetzen', () => {
    expect(() => insertVersionMeta(HTML, 'v1')).toThrow()
    expect(() => insertVersionMeta(HTML, '2026-11-27')).toThrow()
    expect(() => insertVersionMeta(insertVersionMeta(HTML, V), V)).toThrow()
    expect(() => insertVersionMeta('<p>ohne Kopf</p>', V)).toThrow()
  })

  it('liest die Kennung zurück, ohne Build (Dev-Server) gibt es keine', () => {
    expect(readVersion(doc(V))).toBe(V)
    expect(readVersion(doc(null))).toBeNull()
    expect(readVersion(doc(''))).toBeNull()
    expect(readVersion(doc('%MOTTULBOX_VERSION%'))).toBeNull()
  })
})
