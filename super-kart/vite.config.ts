import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

/**
 * Sammelt alle Dateien unter public/, damit der Service Worker auch Icons und
 * Manifest offline vorhält (Vite listet public-Assets nicht im Bundle auf).
 */
function listPublicFiles(dir: string, root = dir): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listPublicFiles(full, root))
    else out.push(relative(root, full).split('\\').join('/'))
  }
  return out
}

/**
 * Minimaler, selbst gebauter Service Worker: Wir kennen die gehashten
 * Dateinamen erst nach dem Build, deshalb wird sw.js hier generiert statt
 * statisch ausgeliefert. Kein Workbox nötig - das Spiel ist ein einziges
 * Bundle ohne Laufzeit-Nachladen.
 */
function pwaServiceWorker(): Plugin {
  return {
    name: 'super-kart-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
      let publicFiles: string[] = []
      try {
        publicFiles = listPublicFiles('public')
      } catch {
        // public/ darf fehlen
      }
      // Relative Pfade: Der SW liegt neben index.html, damit funktioniert die
      // App auch unter einem Unterpfad (z. B. GitHub Pages).
      const precache = [...new Set(['./', 'index.html', ...assets, ...publicFiles])]
      const version = `v${Date.now().toString(36)}`
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: swSource(version, precache),
      })
    },
  }
}

function swSource(version: string, precache: string[]): string {
  return `// Automatisch generiert von vite.config.ts - nicht von Hand bearbeiten.
const CACHE = 'super-kart-${version}'
const PRECACHE = ${JSON.stringify(precache, null, 2)}.map((p) => new URL(p, self.location).href)
const SHELL = new URL('index.html', self.location).href

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return

  // Navigationen immer auf die gecachte Shell zurückfallen lassen (Offline-Start).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match(SHELL).then((r) => r || Response.error()))
    )
    return
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit
      return fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
    })
  )
})
`
}

export default defineConfig({
  // Relative Basis: läuft so auch unter github.io/<repo>/ oder in einem Unterordner.
  base: './',
  plugins: [pwaServiceWorker()],
  build: { target: 'es2022', assetsInlineLimit: 0 },
})
