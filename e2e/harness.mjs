// E2E-Harness: startet die GEBAUTE App (out/, `npm run e2e` baut vorher) über Playwright
// und räumt danach auf. Bewusst nur playwright-core (Electron-Treiber) – es werden keine
// Browser heruntergeladen.
//
// Jeder Lauf bekommt ein frisches userData-Verzeichnis: so landen weder Einstellungen noch
// Werkzeug-Stände des Entwicklers im Test, und die laufende eigene App bleibt unberührt.

import { _electron as electron } from 'playwright-core'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
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
  // E2E_DEBUG=1: Ausgabe und Ende des main-Prozesses mitschreiben (Abstürze, Fehler im main)
  if (process.env.E2E_DEBUG) {
    const proc = app.process()
    proc.stdout?.on('data', (d) => process.stdout.write(`[main] ${d}`))
    proc.stderr?.on('data', (d) => process.stdout.write(`[main!] ${d}`))
    proc.on('exit', (code, signal) => console.log(`[main] beendet: Code ${code}, Signal ${signal}`))
  }
  const page = await app.firstWindow()
  if (process.env.E2E_DEBUG) {
    page.on('close', () => console.log('[e2e] Hauptfenster geschlossen'))
    page.on('crash', () => console.log('[e2e] Hauptfenster abgestürzt'))
    app.on('window', (p) => console.log(`[e2e] neues Fenster ${p.url()}`))
  }
  // Fehler des Hauptfensters sammeln (pageerror und console.error) – siehe smoke.mjs
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)))
  await page.waitForLoadState('domcontentloaded')
  // Das Hauptfenster erscheint erst bei 'ready-to-show' – manchmal nach dem ersten Inhalt.
  // Ohne zu warten öffnete und schloss timer.mjs die Vollbild-Ausgabe, bevor das Hauptfenster
  // als gezeigt galt, und die App beendete sich („letztes Fenster geschlossen“).
  const shown = await waitFor(
    () =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.isVisible())),
    15_000,
    50
  )
  if (!shown) throw new Error('Hauptfenster wird nicht angezeigt')
  return {
    app,
    page,
    errors,
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
 * Dialog mit einer Antwortfolge ersetzen, z. B. [1, 0] = erst Abbrechen, dann Bestätigen.
 * Ist die Folge leer, antwortet er mit Abbrechen.
 */
export async function stubConfirmSequence(app, answers) {
  await app.evaluate(({ dialog }, seq) => {
    globalThis.__answers = [...seq]
    dialog.showMessageBox = async () => ({
      response: globalThis.__answers.shift() ?? 1,
      checkboxChecked: false
    })
  }, answers)
}

/**
 * Dialog offen halten, bis `resolveConfirm` ihn beantwortet – damit sich zwischen Frage und
 * Antwort etwas anderes tun lässt (z. B. „ein anderes Fenster speichert“).
 */
export async function holdConfirm(app) {
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = () =>
      new Promise((resolve) => {
        globalThis.__answer = resolve
      })
  })
}

export async function resolveConfirm(app, accept) {
  await app.evaluate((_electron, ok) => {
    globalThis.__answer({ response: ok ? 0 : 1, checkboxChecked: false })
  }, accept)
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Wartet, bis `fn` etwas Wahres liefert; gibt es zurück, nach Ablauf `null`. */
export async function waitFor(fn, ms = 20_000, step = 200) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const v = await fn()
    if (v) return v
    await sleep(step)
  }
  return null
}

/**
 * Öffnet eine Adresse in einem unsichtbaren Electron-Fenster – als „fremder Browser“ für die
 * Seiten der Fernsteuerungen (ohne Preload-Brücke). `timezoneId` stellt die Zeitzone des
 * Anzeigegeräts ein (z. B. 'America/New_York').
 */
export async function openBrowserWindow(app, url, { timezoneId } = {}) {
  const opened = app.waitForEvent('window')
  await app.evaluate(({ BrowserWindow }, u) => {
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 720,
      webPreferences: { backgroundThrottling: false }
    })
    void win.loadURL(u)
  }, url)
  const page = await opened
  if (timezoneId) {
    const cdp = await app.context().newCDPSession(page)
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId })
    await page.reload()
  }
  await page.waitForLoadState('domcontentloaded')
  return page
}

/** Pfad des gebündelten ffmpeg (für Testmedien per lavfi) oder null. */
export function findFfmpeg() {
  const dir = { win32: 'win', darwin: 'mac' }[process.platform] ?? 'linux'
  const exe = join(
    root,
    'resources',
    'ffmpeg',
    dir,
    process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  )
  return existsSync(exe) ? exe : null
}

/** true, wenn auf 127.0.0.1:port niemand lauscht. */
export function portFree(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1')
    s.once('connect', () => (s.destroy(), resolve(false)))
    s.once('error', () => resolve(true))
  })
}

/** Wirft den Marker für „Schritt übersprungen“ (wird von runSteps als – gezählt). */
export class Skip extends Error {}

/**
 * Kleiner Testlauf: führt Schritte der Reihe nach aus und meldet ✓/✗/–. Ein Schritt ist
 * `[Name, async () => …]`; er besteht, wenn er nicht wirft, und gilt als übersprungen, wenn
 * er `Skip` wirft. Schlägt einer fehl, wird der Exit-Code 1 (nie zurück auf 0 gesetzt, damit
 * mehrere Läufe in einem Prozess zusammenzählen).
 */
export async function runSteps(title, steps) {
  console.log(title)
  let failed = 0
  for (const [name, fn] of steps) {
    try {
      await fn()
      console.log(`  ✓ ${name}`)
    } catch (e) {
      if (e instanceof Skip) {
        console.log(`  – ${name} (übersprungen: ${e.message})`)
        continue
      }
      failed++
      console.log(`  ✗ ${name}\n    ${e instanceof Error ? e.message : e}`)
    }
  }
  console.log(failed ? `${failed} von ${steps.length} Schritten fehlgeschlagen` : 'alles grün')
  if (failed) process.exitCode = 1
}
