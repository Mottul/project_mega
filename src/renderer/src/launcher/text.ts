// Weiche Trennstellen (U+00AD) für lange zusammengesetzte Werkzeugnamen in kleinen
// Kacheln. Automatische Silbentrennung (hyphens: auto) greift in Electron nur unter
// macOS – unter Windows/Linux fehlen Chromium die Wörterbücher, dann bräche
// „Testbildgenerator" an beliebiger Stelle.

// Wortteile, vor denen getrennt werden darf (Fachbegriffe der Werkzeugnamen)
const TAILS = [
  'generator',
  'verhältnis',
  'objektiv',
  'konfigurator',
  'steuerung',
  'bibliothek',
  'downloader',
  'konverter',
  'absicherung',
  'schalter',
  'scanner',
  'rechner'
]

export function softHyphenate(name: string): string {
  return name.replace(/\p{L}{12,}/gu, (word) => {
    const lower = word.toLowerCase()
    for (const tail of TAILS) {
      const i = lower.lastIndexOf(tail)
      if (i >= 4 && i + tail.length === word.length) return `${word.slice(0, i)}­${word.slice(i)}`
    }
    return word
  })
}
