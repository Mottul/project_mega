// E2E-Harness: startet die GEBAUTE App (out/, `npm run e2e` baut vorher) über Playwright
// und räumt danach auf. Bewusst nur playwright-core (Electron-Treiber) – es werden keine
// Browser heruntergeladen.
//
// Jeder Lauf bekommt ein frisches userData-Verzeichnis: so landen weder Einstellungen noch
// Werkzeug-Stände des Entwicklers im Test, und die laufende eigene App bleibt unberührt.

import { _electron as electron } from 'playwright-core'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

export const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Startet die App. `env` ergänzt die Umgebung, `args` kommt vor dem Projektordner.
 * Liefert { app, page, userData, close } – `page` ist das Hauptfenster.
 */
export async function launchApp({ env = {}, args = [] } = {}) {
  const userData = mkdtempSync(join(tmpdir(), 'mottulbox-e2e-'))
  const full = { ...process.env, ...env }
  // Von einer Electron-Umgebung (z. B. der Claude-Desktop-App) geerbt, würde die Binary als
  // reines Node starten statt als App.
  delete full.ELECTRON_RUN_AS_NODE
  // Linux (Container/CI): ohne Chromium-Sandbox und mit virtuellem Display (xvfb-run).
  const sandbox = process.platform === 'linux' ? ['--no-sandbox'] : []
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [...sandbox, `--user-data-dir=${userData}`, ...args, root],
    env: full
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return {
    app,
    page,
    userData,
    async close() {
      await app.close().catch(() => {})
      rmSync(userData, { recursive: true, force: true })
    }
  }
}

/** Route im HashRouter öffnen, z. B. openRoute(page, '/tool/timecode'). */
export async function openRoute(page, route) {
  await page.evaluate((r) => {
    window.location.hash = r
  }, route)
}

/**
 * Die native Ja/Nein-Rückfrage (`api.confirm` -> dialog.showMessageBox im main) durch eine
 * feste Antwort ersetzen; sonst blockiert der Dialog den Test.
 */
export async function stubConfirm(app, accept) {
  await app.evaluate(({ dialog }, ok) => {
    dialog.showMessageBox = async () => ({ response: ok ? 0 : 1, checkboxChecked: false })
  }, accept)
}

/**
 * Kleiner Testlauf: führt Schritte der Reihe nach aus, meldet ✓/✗ und setzt den Exit-Code.
 * Ein Schritt ist `[Name, async () => …]`; er besteht, wenn er nicht wirft.
 */
export async function runSteps(title, steps) {
  console.log(title)
  let failed = 0
  for (const [name, fn] of steps) {
    try {
      await fn()
      console.log(`  ✓ ${name}`)
    } catch (e) {
      failed++
      console.log(`  ✗ ${name}\n    ${e instanceof Error ? e.message : e}`)
    }
  }
  console.log(failed ? `${failed} von ${steps.length} Schritten fehlgeschlagen` : 'alles grün')
  process.exitCode = failed ? 1 : 0
}
