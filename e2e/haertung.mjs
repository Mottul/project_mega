// Show-Härtung in der echten App – vier Dinge, die mitten in der Show das Bild oder die Bedienung
// kosten konnten:
// - Electrons Standardmenü: Seine Tastenkürzel galten auch unsichtbar (Strg+W schloss ein
//   Ausgabefenster am „zweimal Esc“ vorbei, Strg+R lud neu, Strg+Minus zoomte, F11 nahm das
//   Vollbild). Der Zoom bleibt deshalb immer 100 %, DevTools gibt es nicht in der Kundenansicht.
// - Energiesparen: Solange etwas läuft, schläft der Rechner nicht ein; mit einer Ausgabe bleibt
//   auch der Bildschirm an.
// - Einzelinstanz: Ein zweiter Start beendet sich und holt das Fenster der laufenden App vor.
// - Fernsteuerung: Befehle fremder Websites (Origin) und fremder Namen (Host) werden abgewiesen.
// Öffnet kurz die Timer-Ausgabe als Fenster, minimiert einmal das Hauptfenster und startet die
// App ein zweites und drittes Mal.

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp, portFree, root, runSteps, Skip, sleep, waitFor } from './harness.mjs'

const require = createRequire(import.meta.url)

// Eigener Benutzerordner: Der Neustart am Ende braucht denselben wie der erste Start.
const userData = mkdtempSync(join(tmpdir(), 'mottulbox-e2e-haertung-'))
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ ytdlpAutoUpdate: false }))

/** Eigener Port: eine laufende Mottulbox (8092) stört nicht */
const PORT = 18097
/** „Strg“ der Menü-Kürzel – unter macOS die Befehlstaste */
const STRG = process.platform === 'darwin' ? 'meta' : 'control'

let ctx = await launchApp({ userData })

/** Zustand eines Fensters aus Sicht des main: 'haupt' oder 'ausgabe' (Timer-Ausgabe) */
const fenster = (welches) =>
  ctx.app
    .evaluate(({ BrowserWindow }, w) => {
      const win = BrowserWindow.getAllWindows().find(
        (x) =>
          !x.isDestroyed() &&
          !x.webContents.isDestroyed() &&
          x.webContents.getURL().includes('timer-output') === (w === 'ausgabe')
      )
      return win
        ? {
            laedt: win.webContents.isLoading(),
            zoom: win.webContents.getZoomFactor(),
            vollbild: win.isFullScreen(),
            minimiert: win.isMinimized()
          }
        : null
    }, welches)
    .catch(() => null)

/**
 * Tastendruck wie vom Betriebssystem an ein Fenster: Nur so greifen Menü-Kürzel und
 * `before-input-event` (page.keyboard erreicht beides nicht zuverlässig).
 */
const taste = (welches, keyCode, modifiers = []) =>
  ctx.app.evaluate(
    ({ BrowserWindow }, [w, keyCode, modifiers]) => {
      const win = BrowserWindow.getAllWindows().find(
        (x) =>
          !x.isDestroyed() &&
          !x.webContents.isDestroyed() &&
          x.webContents.getURL().includes('timer-output') === (w === 'ausgabe')
      )
      if (!win) return false
      win.focus()
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
      return true
    },
    [welches, keyCode, modifiers]
  )

/** Die Kürzel des früheren Standardmenüs: schließen, neu laden, zoomen, Vollbild */
const KUERZEL = [
  ['W', [STRG]],
  ['R', [STRG]],
  ['R', [STRG, 'shift']],
  ['-', [STRG]],
  ['Plus', [STRG]],
  ['F11', []]
]

/** Laufende Sperren gegen das Energiesparen (Electron vergibt fortlaufende Nummern) */
const wachSperren = () =>
  ctx.app.evaluate(
    ({ powerSaveBlocker }) =>
      Array.from({ length: 300 }, (_, i) => i).filter((i) => powerSaveBlocker.isStarted(i)).length
  )
/**
 * Letzte Zeile des Wachhaltens im Protokoll. Die letzte, nicht irgendeine: Ein früherer Schritt
 * hat dieselbe Zeile schon geschrieben, und der Abgleich im main läuft nur alle drei Sekunden.
 */
const wachZeile = () =>
  readFileSync(join(userData, 'avtoolbox-debug.log'), 'utf8')
    .split(/\r?\n/)
    .filter((z) => z.includes('[wach]'))
    .pop() ?? ''

/** Anfrage an die Fernsteuerung mit frei gesetzten Kopfzeilen (fetch übergeht einen gesetzten Host) */
const anfrage = (pfad, { method = 'GET', headers = {}, body } = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: PORT, path: pfad, method, headers },
      (res) => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (d) => (data += d))
        res.on('end', () => resolve({ status: res.statusCode, body: data }))
      }
    )
    req.on('error', reject)
    req.setTimeout(5_000, () => req.destroy(new Error('Zeitlimit')))
    req.end(body)
  })

try {
  await runSteps('Show-Härtung', [
    [
      'Kein Standardmenü von Electron – unter macOS nur Beenden und Bearbeiten',
      async () => {
        const rollen = await ctx.app.evaluate(({ Menu }) => {
          const m = Menu.getApplicationMenu()
          return m
            ? m.items.flatMap((i) => (i.submenu?.items ?? []).map((s) => s.role).filter(Boolean))
            : null
        })
        if (process.platform !== 'darwin') {
          assert.equal(rollen, null, 'Menü mit: ' + JSON.stringify(rollen))
          return
        }
        // ohne Menü gäbe es am Mac kein Cmd+Q und in Textfeldern kein Cmd+C/V
        assert.ok(rollen, 'macOS braucht ein Menü')
        const klein = rollen.map((r) => r.toLowerCase())
        for (const r of ['quit', 'copy', 'paste', 'selectall']) assert.ok(klein.includes(r), r)
        const heikel = [
          'close',
          'reload',
          'forcereload',
          'toggledevtools',
          'resetzoom',
          'zoomin',
          'zoomout',
          'togglefullscreen',
          'hide',
          'hideothers',
          'minimize'
        ]
        assert.deepEqual(
          klein.filter((r) => heikel.includes(r)),
          []
        )
      }
    ],
    [
      'Strg+W, Strg+R, Strg+Minus und F11 lassen ein Ausgabefenster in Ruhe',
      async () => {
        const offen = ctx.app.waitForEvent('window')
        await ctx.page.evaluate(() => window.api.timer.openOutput('fenster'))
        const out = await offen
        assert.ok(
          await waitFor(async () => (await fenster('ausgabe'))?.laedt === false, 15_000),
          'Ausgabefenster lädt nicht fertig'
        )
        // Marke in der Seite: Nach einem Neuladen wäre sie weg
        await out.evaluate(() => void (window.__marke = 1))
        try {
          for (const [keyCode, modifiers] of KUERZEL) {
            assert.equal(
              await taste('ausgabe', keyCode, modifiers),
              true,
              'Fenster weg vor ' + keyCode
            )
            await sleep(300)
          }
          await sleep(700)
          const stand = await fenster('ausgabe')
          assert.ok(stand, 'ein Tastenkürzel hat das Ausgabefenster geschlossen')
          assert.equal(stand.zoom, 1, 'Zoom verstellt')
          assert.equal(stand.vollbild, false, 'F11 hat das Vollbild umgeschaltet')
          assert.equal(await out.evaluate(() => window.__marke), 1, 'Ausgabe wurde neu geladen')
        } finally {
          await ctx.page.evaluate(() => window.api.timer.closeOutput())
          await waitFor(async () => (await fenster('ausgabe')) === null, 10_000)
        }
      }
    ],
    [
      'Hauptfenster: Strg+R lädt nicht neu (Jingles, Testton), Strg+Minus zoomt nicht',
      async () => {
        await ctx.page.evaluate(() => void (window.__marke = 1))
        for (const [keyCode, modifiers] of KUERZEL.filter(([k]) => k !== 'W' && k !== 'F11')) {
          await taste('haupt', keyCode, modifiers)
          await sleep(300)
        }
        await sleep(700)
        assert.equal(await ctx.page.evaluate(() => window.__marke), 1, 'Hauptfenster neu geladen')
        assert.equal((await fenster('haupt')).zoom, 1)
      }
    ],
    [
      'F12 öffnet die DevTools – in der Kundenansicht nicht',
      async () => {
        const offen = () =>
          ctx.app
            .evaluate(({ BrowserWindow }) =>
              BrowserWindow.getAllWindows().some(
                (w) => !w.isDestroyed() && w.webContents.isDevToolsOpened()
              )
            )
            .catch(() => false)
        const schliessen = async () => {
          await ctx.app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows().forEach(
              (w) => !w.isDestroyed() && w.webContents.closeDevTools()
            )
          )
          return waitFor(async () => !(await offen()), 10_000)
        }
        // Gegenprobe zuerst: Der Tastendruck kommt an, sonst bewiese der zweite Teil nichts
        await taste('haupt', 'F12')
        assert.ok(await waitFor(offen, 15_000), 'F12 öffnet die DevTools nicht')
        assert.ok(await schliessen(), 'DevTools gehen nicht zu')

        await ctx.page.evaluate(() => window.api.setSettings({ kioskToolId: 'media-info' }))
        try {
          await taste('haupt', 'F12')
          await taste('haupt', 'I', ['control', 'shift'])
          await sleep(1500)
          assert.equal(await offen(), false, 'DevTools in der Kundenansicht offen')
        } finally {
          await schliessen()
          await ctx.page.evaluate(() => window.api.setSettings({ kioskToolId: null }))
        }
      }
    ],
    [
      'Mit einer Ausgabe bleibt der Bildschirm an – danach darf der Rechner wieder schlafen',
      async () => {
        assert.ok(
          await waitFor(async () => (await wachSperren()) === 0, 15_000),
          'schon ohne Ausgabe wach gehalten: ' + wachZeile()
        )
        await ctx.page.evaluate(() => window.api.timer.openOutput('fenster'))
        try {
          assert.ok(
            await waitFor(() => /Bildschirm bleibt an: Stage-Timer/.test(wachZeile()), 15_000),
            'Protokoll: ' + wachZeile()
          )
          assert.equal(await wachSperren(), 1)
        } finally {
          await ctx.page.evaluate(() => window.api.timer.closeOutput())
        }
        assert.ok(
          await waitFor(async () => (await wachSperren()) === 0, 15_000),
          'nach dem Schließen der Ausgabe weiter wach gehalten'
        )
        assert.match(wachZeile(), /Energiesparen wieder frei/)
      }
    ],
    [
      'Ein laufender Timer hält nur den Rechner wach (der Bildschirm darf ausgehen)',
      async () => {
        await ctx.page.evaluate(async () => {
          await window.api.timer.command({
            type: 'setSegments',
            segments: [{ id: 'a', speaker: '', title: 'Probe', durationSec: 600 }]
          })
          await window.api.timer.command({ type: 'start' })
        })
        try {
          assert.ok(
            await waitFor(() => /Rechner bleibt wach: Stage-Timer läuft/.test(wachZeile()), 15_000),
            'Protokoll: ' + wachZeile()
          )
          assert.equal(await wachSperren(), 1)
        } finally {
          await ctx.page.evaluate(async () => {
            await window.api.timer.command({ type: 'resetAll' })
            await window.api.timer.command({ type: 'setSegments', segments: [] })
          })
        }
        assert.ok(await waitFor(async () => (await wachSperren()) === 0, 15_000))
      }
    ],
    [
      'Fernsteuerung: Befehle fremder Websites werden abgewiesen, das eigene Handy steuert weiter',
      async () => {
        if (!(await portFree(PORT))) throw new Skip(`Port ${PORT} ist belegt`)
        await ctx.page.evaluate((p) => window.api.timer.remoteStart(p), PORT)
        try {
          const modus = async () => JSON.parse((await anfrage('/api/state')).body).displayMode
          const befehl = (mode, headers) =>
            anfrage('/api/command', {
              method: 'POST',
              headers,
              body: JSON.stringify({ type: 'setDisplayMode', mode })
            })
          assert.equal(await modus(), 'timer')
          // fremde Website, abgeschotteter Rahmen („null“), anderer Port desselben Rechners
          for (const origin of ['http://boese.example', 'null', `http://127.0.0.1:${PORT + 1}`]) {
            assert.equal((await befehl('clock', { Origin: origin })).status, 403, origin)
          }
          assert.equal(await modus(), 'timer', 'ein abgewiesener Befehl hat trotzdem gewirkt')
          // fremder Name, der auf diesen Rechner zeigt (DNS-Rebinding): auch Lesen abgewiesen
          const fremd = await anfrage('/api/state', { headers: { Host: `boese.example:${PORT}` } })
          assert.equal(fremd.status, 403)
          // die eigene Seite (gleiche Herkunft) …
          assert.equal((await befehl('clock', { Origin: `http://127.0.0.1:${PORT}` })).status, 200)
          assert.ok(await waitFor(async () => (await modus()) === 'clock', 5_000))
          // … und Programme ohne Origin (Companion, curl) steuern wie bisher
          assert.equal((await befehl('timer', {})).status, 200)
          assert.ok(await waitFor(async () => (await modus()) === 'timer', 5_000))
        } finally {
          await ctx.page.evaluate(() => window.api.timer.remoteStop())
        }
      }
    ],
    [
      'Ein zweiter Start beendet sich selbst und holt das Hauptfenster nach vorn',
      async () => {
        await ctx.app.evaluate(({ app, BrowserWindow }) => {
          globalThis.__zweite = 0
          app.on('second-instance', () => globalThis.__zweite++)
          BrowserWindow.getAllWindows()
            .find((w) => !w.isDestroyed())
            ?.minimize()
        })
        const env = { ...process.env }
        delete env.ELECTRON_RUN_AS_NODE
        const zweite = spawn(
          require('electron'),
          [
            ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
            `--user-data-dir=${userData}`,
            root
          ],
          { env, stdio: 'ignore' }
        )
        const ende = await Promise.race([
          new Promise((resolve) => zweite.once('exit', (code) => resolve(code))),
          sleep(20_000).then(() => 'läuft weiter')
        ])
        if (ende === 'läuft weiter') zweite.kill('SIGKILL')
        assert.equal(ende, 0, 'zweite Instanz: ' + ende)
        assert.ok(
          await waitFor(
            () => ctx.app.evaluate(() => globalThis.__zweite === 1).catch(() => false),
            10_000
          ),
          'die laufende App hat vom zweiten Start nichts erfahren'
        )
        assert.ok(
          await waitFor(async () => (await fenster('haupt'))?.minimiert === false, 10_000),
          'Hauptfenster blieb minimiert'
        )
        const anzahl = await ctx.app.evaluate(
          ({ BrowserWindow }) => BrowserWindow.getAllWindows().length
        )
        assert.equal(anzahl, 1, 'zusätzliches Fenster')
      }
    ],
    [
      'keine Konsolenfehler im Hauptfenster',
      async () => {
        assert.deepEqual(ctx.errors, [])
      }
    ],
    [
      'Ein verstellter Zoom ist nach dem Neustart wieder 100 %',
      async () => {
        // wie nach einem früheren Strg+Minus: Chromium merkt sich den Zoom im Benutzerordner
        await ctx.app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((w) => !w.isDestroyed())
            .webContents.setZoomFactor(0.8)
        )
        await sleep(1000)
        await ctx.close()
        ctx = await launchApp({ userData })
        assert.ok(
          await waitFor(async () => (await fenster('haupt'))?.zoom === 1, 10_000),
          'Zoom nach dem Neustart: ' + (await fenster('haupt'))?.zoom
        )
      }
    ]
  ])
} finally {
  await ctx.close()
  try {
    rmSync(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  } catch (err) {
    console.log(`[e2e] Temp-Ordner bleibt liegen (${err.code ?? err}): ${userData}`)
  }
}
