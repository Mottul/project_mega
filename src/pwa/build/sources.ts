// Woraus die Rechner-PWA ihre Tailwind-Klassen nimmt: genau aus den Dateien, die sie einbindet.
// Nähme sie wie die App den ganzen Renderer, stünden im PWA-CSS die Klassen aller Werkzeuge –
// jede neue Klasse irgendwo in der App ergäbe eine neue PWA-Version, und das Handy meldete
// „Neue Version bereit“, obwohl sich an keinem Rechner etwas geändert hat. Dass die Liste
// vollständig bleibt, prüft der Build (plugin.ts): Er bricht ab, wenn die PWA eine Datei des
// Renderers einbindet, die hier fehlt. Pfade immer mit „/“ (Tailwind-Globs, Vite-Modul-IDs).

const slash = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '')

/**
 * Ordner und Dateien der PWA-Quellen.
 * @param root Projektordner
 * @param calcIds Werkzeug-IDs der Rechner (SMALL_TOOLS)
 */
export function pwaSources(root: string, calcIds: string[]): string[] {
  const base = slash(root)
  const ui = `${base}/src/renderer/src`
  return [
    `${base}/src/pwa`,
    `${ui}/tools/_calc`,
    ...calcIds.map((id) => `${ui}/tools/${id}`),
    `${ui}/tools/types.ts`,
    `${ui}/components/ui`,
    `${ui}/components/ErrorBoundary.tsx`,
    `${ui}/components/MottulboxLogo.tsx`,
    `${ui}/components/mottulboxLogoData.ts`,
    `${ui}/lib`
  ]
}

/** Liegt die Datei in einer der Quellen (selbst eine Datei oder in einem der Ordner)? */
export function inSources(file: string, sources: string[]): boolean {
  const f = slash(file.split('?')[0])
  return sources.some((s) => f === s || f.startsWith(`${s}/`))
}

/**
 * Tailwind-`content`: Ordner als Glob über ihre Quelltexte, Dateien wie sie sind – ohne Tests,
 * die landen nicht in der PWA (eine Klasse in einem Test darf keine neue Version auslösen).
 */
export function tailwindContent(sources: string[]): string[] {
  return [
    ...sources.map((s) => (/\.[a-z]+$/i.test(s) ? s : `${s}/**/*.{html,ts,tsx}`)),
    '!**/*.test.{ts,tsx}'
  ]
}
