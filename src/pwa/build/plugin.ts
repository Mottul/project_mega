// Vite-Plugins der Rechner-PWA (vite.pwa.config.ts):
// - Wächter: Die Rechner laufen im Browser ohne Electron. Zieht ein Rechner (auch über Umwege)
//   die Programmbrücke oder die Einstellungen herein, bricht der Build ab – statt dass die
//   Seite erst auf dem Handy mit „window.api ist undefined“ scheitert.
// - Quellen-Prüfung: Das PWA-CSS enthält nur die Tailwind-Klassen der Quellen aus sources.ts.
//   Bindet die PWA eine Renderer-Datei außerhalb davon ein, fehlten deren Klassen – der Build
//   bricht dann ab, statt die Seite auf dem Handy ungestylt zu zeigen.
// - Manifest und Service Worker: entstehen erst am Ende des Builds, weil der Worker die fertige
//   Dateiliste (Namen mit Hash) zum Vorladen braucht. Der Hash über alle Dateien ist zugleich die
//   Kennung der Version (buildHash.ts): im Cache-Namen des Workers und als <meta> in index.html
//   (version.ts).
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Plugin } from 'vite'
import { PWA_BACKGROUND } from '../colors'
import { buildVersion, lfText, type BuildDatei } from './buildHash'
import { SW_FILE, serviceWorkerSource } from './serviceWorker'
import { inSources } from './sources'
import { insertVersionMeta } from './version'

/** Module, die window.api/Electron voraussetzen (Pfad nach der Alias-Auflösung) */
const FORBIDDEN = /[\\/]renderer[\\/]src[\\/]lib[\\/](api|settings)(\.tsx?)?$/


const MANIFEST_FILE = 'manifest.webmanifest'

function manifest(): string {
  return JSON.stringify(
    {
      name: 'MottulBox',
      short_name: 'MottulBox',
      description:
        'Die Rechner der Mottulbox fürs Handy: Kreis, Projektion, Objektiv, Lumen, DMX, Strom, Audio-Delay, RTA, Testtongenerator, Rigging und Timecode – offline.',
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

export function pwaPlugins({
  sources,
  rendererRoot
}: {
  /** Tailwind-Quellen der PWA (sources.ts) */
  sources: string[]
  /** src/renderer/src – nur dort liegen Klassen, die das PWA-CSS braucht */
  rendererRoot: string
}): Plugin[] {
  const renderer = rendererRoot.replace(/\\/g, '/')
  const covered: Plugin = {
    name: 'mottulbox-pwa-sources',
    apply: 'build',
    buildEnd(err) {
      if (err) return
      const missing = [...this.getModuleIds()]
        .map((id) => id.split('?')[0].replace(/\\/g, '/'))
        .filter((id) => id.startsWith(`${renderer}/`) && /\.[jt]sx?$/.test(id))
        .filter((id) => !inSources(id, sources))
      if (missing.length) {
        this.error(
          `Rechner-PWA: ${missing.join(', ')} fehlt in den Tailwind-Quellen der PWA ` +
            '(src/pwa/build/sources.ts) – dort eintragen, sonst fehlen im PWA-CSS seine Klassen.'
        )
      }
    }
  }

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

  // index.html kommt aus der Arbeitskopie: unter Windows mit CRLF (Git mit autocrlf), in der CI
  // mit LF. Vor Vites eigener Verarbeitung vereinheitlichen – danach ginge es nicht sauber: Vite
  // nimmt das <script> aus dem <body> und lässt bei CRLF ein einzelnes CR stehen. Ohne das zeigte
  // ein Build unter Windows mit demselben Inhalt eine andere Kennung als das Handy.
  const lineEnds: Plugin = {
    name: 'mottulbox-pwa-lf',
    transformIndexHtml: { order: 'pre', handler: (html) => lfText(html) }
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
      const html = bundle['index.html']
      if (html?.type !== 'asset') this.error('Rechner-PWA: index.html fehlt im Build')
      // Als Text (lineEnds hat die Zeilenenden schon vereinheitlicht)
      const htmlText = lfText(html.source)
      // Alles Erzeugte samt public/ (Icons) vorladen; Quellkarten braucht offline niemand
      const dateien: BuildDatei[] = []
      for (const [f, item] of Object.entries(bundle)) {
        if (f.endsWith('.map')) continue
        dateien.push([f, item.type === 'chunk' ? item.code : item.source])
      }
      for (const f of publicFiles(publicDir)) {
        dateien.push([f, readFileSync(join(publicDir, f))])
      }
      const files = dateien.map(([f]) => f).sort()
      const version = buildVersion(dateien)
      // Erst nach dem Hash eintragen: index.html ändert sich so nur, wenn sich der Build ändert
      html.source = insertVersionMeta(htmlText, version)
      this.emitFile({
        type: 'asset',
        fileName: SW_FILE,
        source: serviceWorkerSource(files, version)
      })
    }
  }

  return [guard, covered, lineEnds, output]
}
