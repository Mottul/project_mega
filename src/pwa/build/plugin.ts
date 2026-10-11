// Vite-Plugins der Rechner-PWA (vite.pwa.config.ts):
// - Wächter: Die Rechner laufen im Browser ohne Electron. Zieht ein Rechner (auch über Umwege)
//   die Programmbrücke oder die Einstellungen herein, bricht der Build ab – statt dass die
//   Seite erst auf dem Handy mit „window.api ist undefined“ scheitert.
// - Manifest und Service Worker: entstehen erst am Ende des Builds, weil der Worker die fertige
//   Dateiliste (Namen mit Hash) zum Vorladen braucht.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Plugin } from 'vite'
import { PWA_BACKGROUND } from '../colors'
import { SW_FILE, serviceWorkerSource } from './serviceWorker'

/** Module, die window.api/Electron voraussetzen (Pfad nach der Alias-Auflösung) */
const FORBIDDEN = /[\\/]renderer[\\/]src[\\/]lib[\\/](api|settings)(\.tsx?)?$/


const MANIFEST_FILE = 'manifest.webmanifest'

function manifest(): string {
  return JSON.stringify(
    {
      name: 'Mottulbox Rechner',
      short_name: 'Rechner',
      description:
        'Die Rechner der Mottulbox fürs Handy: Kreis, Projektion, Objektiv, Lumen, DMX, Strom, Audio-Delay, Rigging und Timecode – offline.',
      lang: 'de',
      start_url: './',
      scope: './',
      display: 'standalone',
      background_color: PWA_BACKGROUND.dark,
      theme_color: PWA_BACKGROUND.dark,
      icons: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    null,
    2
  )
}

/** Dateien aus public/ als Pfade mit „/“ (landen unverändert im Build-Ordner) */
function publicFiles(dir: string): string[] {
  if (!dir) return []
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split(sep).join('/'))
}

export function pwaPlugins(): Plugin[] {
  const guard: Plugin = {
    name: 'mottulbox-pwa-guard',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === 'electron') {
        this.error(`Rechner-PWA: „electron“ ist im Browser nicht verfügbar (aus ${importer})`)
      }
      return null
    },
    load(id) {
      if (FORBIDDEN.test(id)) {
        this.error(
          `Rechner-PWA: ${id} braucht die Electron-Programmbrücke. Ein Rechner für die PWA darf ` +
            'weder api noch Einstellungen nutzen (src/pwa/tools.ts).'
        )
      }
      return null
    }
  }

  let publicDir = ''
  const output: Plugin = {
    name: 'mottulbox-pwa-output',
    apply: 'build',
    // nach Vites eigenem HTML-Plugin, damit index.html schon im Bundle liegt
    enforce: 'post',
    configResolved(config) {
      publicDir = config.publicDir
    },
    generateBundle(_options, bundle) {
      this.emitFile({ type: 'asset', fileName: MANIFEST_FILE, source: manifest() })
      // Alles Erzeugte samt public/ (Icons) vorladen; Quellkarten braucht offline niemand
      const hash = createHash('sha256')
      const files: string[] = []
      for (const [f, item] of Object.entries(bundle)) {
        if (f.endsWith('.map')) continue
        files.push(f)
        hash.update(f).update(item.type === 'chunk' ? item.code : item.source)
      }
      for (const f of publicFiles(publicDir)) {
        files.push(f)
        hash.update(f).update(readFileSync(join(publicDir, f)))
      }
      files.sort()
      this.emitFile({
        type: 'asset',
        fileName: SW_FILE,
        source: serviceWorkerSource(files, hash.digest('hex').slice(0, 12))
      })
    }
  }

  return [guard, output]
}
