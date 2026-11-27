// Kennung einer Version der Rechner-PWA: der Hash über alle Dateien des Builds – derselbe, der
// im Cache-Namen des Service Workers steht (plugin.ts). Bewusst weder Datum noch Commit: Dann
// wäre jeder Build eine neue Version, und die Handys meldeten „Neue Version bereit“, obwohl sich
// nichts geändert hat (der Build ist reproduzierbar, siehe .github/workflows/pwa-pages.yml).
// Der Build schreibt die Kennung als <meta> in index.html; die Startseite zeigt sie unten an,
// damit man nach „Neu laden“ sieht, dass die neue Version läuft.

export const VERSION_META = 'mottulbox-version'

/** 12 Zeichen hex, wie sie plugin.ts aus dem SHA-256 über den Build schneidet */
const VERSION = /^[0-9a-f]{12}$/

/** So viele Zeichen zeigt die Startseite – genug, um zwei Versionen zu unterscheiden */
export const VERSION_SHORT = 7

/** Kennung als <meta> vor </head> einsetzen (Build, nach dem Hash über alle Dateien) */
export function insertVersionMeta(html: string, version: string): string {
  if (!VERSION.test(version)) throw new Error(`Rechner-PWA: ungültige Versionskennung „${version}“`)
  if (html.includes(`name="${VERSION_META}"`)) {
    throw new Error('Rechner-PWA: index.html trägt schon eine Versionskennung')
  }
  const end = html.indexOf('</head>')
  if (end < 0) throw new Error('Rechner-PWA: </head> fehlt in index.html')
  const tag = `  <meta name="${VERSION_META}" content="${version}" />\n  `
  return html.slice(0, end) + tag + html.slice(end)
}

/**
 * Was readVersion vom document braucht – als eigene Form, weil diese Datei auch im Build (Node,
 * ohne DOM-Typen) übersetzt wird; `document` passt dazu.
 */
export interface MetaQuelle {
  querySelector(selector: string): { getAttribute(name: string): string | null } | null
}

/**
 * Kennung der laufenden Version aus index.html – null im Dev-Server (dort setzt sie kein Build)
 * oder wenn das <meta> fehlt bzw. nicht passt.
 */
export function readVersion(doc: MetaQuelle): string | null {
  const v = doc.querySelector(`meta[name="${VERSION_META}"]`)?.getAttribute('content') ?? ''
  return VERSION.test(v) ? v : null
}
