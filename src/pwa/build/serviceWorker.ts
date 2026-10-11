// Quelltext des Service Workers der Rechner-PWA – erzeugt beim Build (vite.pwa.config.ts), weil
// die Liste der Dateien erst dann feststeht (Namen mit Hash). Rein und ohne Abhängigkeiten
// (kein Workbox): Die PWA ist klein, alles liegt nach dem ersten Besuch im Cache.
//
// Ablauf:
// - install: ALLE Dateien in einen Cache je Version laden -> danach komplett offline.
// - fetch: nur aus dem Cache (Seitenaufrufe bekommen index.html), sonst Netz. Die Dateinamen
//   tragen einen Hash, eine Version ist also in sich stimmig. ignoreVary: Server wie Vite oder
//   GitHub Pages schicken „Vary: Origin“, die Modul-Skripte (crossorigin) aber einen Origin-
//   Kopf, den das Vorladen nicht hatte – ohne ignoreVary fände der Cache offline nichts.
// - Neue Version: Der neue Worker wartet, bis die Seite ihn per Nachricht „skipWaiting“ startet
//   (Knopf „Neu laden“) oder alle Fenster zu sind. So lädt eine offene Seite nie Chunks einer
//   anderen Version nach. activate räumt danach die alten Caches ab.

export const SW_FILE = 'sw.js'
export const CACHE_PREFIX = 'mottulbox-rechner-'
export const SKIP_WAITING = 'skipWaiting'

/**
 * @param files Pfade relativ zum Ordner der PWA (wie im Build-Ordner, ohne führendes „/“)
 * @param version Kennung der Version (z. B. Hash über alle Dateien)
 */
export function serviceWorkerSource(files: string[], version: string): string {
  const urls = ['./', ...files.map((f) => `./${f}`)]
  return `// Erzeugt von src/pwa/build/serviceWorker.ts – nicht von Hand ändern.
const CACHE = ${JSON.stringify(CACHE_PREFIX + version)}
const FILES = ${JSON.stringify(urls)}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith(${JSON.stringify(CACHE_PREFIX)}) && k !== CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (e) => {
  if (e.data === ${JSON.stringify(SKIP_WAITING)}) self.skipWaiting()
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  const key = req.mode === 'navigate' ? './index.html' : req
  e.respondWith(
    caches
      .open(CACHE)
      .then((c) => c.match(key, { ignoreSearch: true, ignoreVary: true }))
      .then((hit) => hit || fetch(req))
  )
})
`
}
