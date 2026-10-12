// Quelltext des Service Workers der Rechner-PWA – erzeugt beim Build (vite.pwa.config.ts), weil
// die Liste der Dateien erst dann feststeht (Namen mit Hash). Rein und ohne Abhängigkeiten
// (kein Workbox): Die PWA ist klein, alles liegt nach dem ersten Besuch im Cache.
//
// Ablauf:
// - install: ALLE Dateien in einen Cache je Version laden -> danach komplett offline.
// - fetch: nur aus dem Cache (Seitenaufrufe bekommen index.html), sonst Netz. Die Dateinamen
//   tragen einen Hash, eine Version ist also in sich stimmig. Ausnahme: manifest.webmanifest und
//   die Symbole (feste Namen) zuerst aus dem Netz, offline aus dem Cache – sonst sähe der Browser
//   bei seiner Prüfung auf ein geändertes App-Symbol nur die alten Dateien dieses Workers, und
//   Android erneuerte Symbol und Startbildschirm der installierten App nicht (so geschehen mit dem
//   korrigierten Logo, 12. Oktober 2026). ignoreVary: Server wie Vite oder
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

// Manifest und Symbole: feste Namen, ändern sich ohne neuen Dateinamen -> Netz zuerst
const fresh = (path) => path.endsWith('/manifest.webmanifest') || path.includes('/icons/')

const fromCache = (key) =>
  caches.open(CACHE).then((c) => c.match(key, { ignoreSearch: true, ignoreVary: true }))

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  if (fresh(url.pathname)) {
    e.respondWith(
      fetch(req).catch(() => fromCache(req).then((hit) => hit || Response.error()))
    )
    return
  }
  const key = req.mode === 'navigate' ? './index.html' : req
  e.respondWith(fromCache(key).then((hit) => hit || fetch(req)))
})
`
}
