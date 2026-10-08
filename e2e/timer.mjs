// Stage-Timer: Status am Startbildschirm, Bühnen-Anzeige im Browser (/anzeige) samt
// Verbindungsabbruch, Neuverbindung, Zeitzone und „totem“ Strom (halboffene Verbindung).
// Aus den Cloud-Läufen vom 7. Oktober 2026 übernommen (dort mit Playwright-Chromium und xvfb).
//
// Die Anzeige läuft hier in einem unsichtbaren Electron-Fenster ohne Preload-Brücke – so
// verhält sie sich wie der Browser eines Fernsehers. Der Timer-Fernsteuerport ist ein
// anderer als der Standardport 8092, damit eine laufende Mottulbox nicht stört.
// Hinweis: Der Schritt „Ausgabefenster“ öffnet kurz das Timer-Ausgabefenster auf dem ersten
// Bildschirm.

import assert from 'node:assert/strict'
import net from 'node:net'
import {
  launchApp,
  openBrowserWindow,
  openRoute,
  portFree,
  runSteps,
  Skip,
  sleep,
  waitFor
} from './harness.mjs'

const TIMER_PORT = 18092
const PROXY_PORT = 18099
const BASE = `http://127.0.0.1:${TIMER_PORT}`
const remoteAppFree = await portFree(8090)

const ctx = await launchApp()
const { app, page: w } = ctx

const timer = (cmd) => w.evaluate((c) => window.api.timer.command(c), cmd)
const segments = (durationSec) =>
  timer({
    type: 'setSegments',
    segments: [{ id: 'a', speaker: 'Anna', title: 'Keynote', durationSec }]
  })
const badge = () =>
  w.evaluate(() => document.querySelector('[aria-label="Stage-Timer & Uhr"]')?.textContent ?? '')
const hhmm = (d) =>
  String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
const show = (page, id) => page.evaluate((i) => document.getElementById(i)?.textContent ?? '', id)
const visible = (page, id) =>
  page.evaluate((i) => {
    const e = document.getElementById(i)
    return !!e && getComputedStyle(e).display !== 'none'
  }, id)

// TCP-Weiterleitung, die Verbindungen „einfrieren“ kann (halboffener Socket nach WLAN-Aussetzer)
const pairs = []
let freezeNew = false
const proxy = net
  .createServer((c) => {
    const u = net.connect(TIMER_PORT, '127.0.0.1')
    const p = { frozen: freezeNew }
    c.on('data', (d) => !p.frozen && u.write(d))
    u.on('data', (d) => !p.frozen && c.write(d))
    c.on('error', () => {})
    u.on('error', () => {})
    c.on('close', () => u.destroy())
    u.on('close', () => c.destroy())
    pairs.push(p)
  })
  .listen(PROXY_PORT, '127.0.0.1')
const freezeAll = () => pairs.forEach((p) => (p.frozen = true))

let pg
const deviceZone =
  Intl.DateTimeFormat().resolvedOptions().timeZone === 'America/New_York'
    ? 'Asia/Tokyo'
    : 'America/New_York'

try {
  await w.getByText('Video-Player').first().waitFor({ timeout: 30_000 })

  await runSteps('Stage-Timer: Status am Startbildschirm', [
    [
      'läuft: „läuft“ ohne Ausgabe',
      async () => {
        await segments(300)
        await timer({ type: 'start' })
        assert.ok(
          await waitFor(
            async () => (await badge()).includes('läuft') && !(await badge()).includes('Ausgabe')
          )
        )
      }
    ],
    [
      'läuft + Ausgabefenster: „läuft · Ausgabe“',
      async () => {
        const displays = await w.evaluate(() => window.api.screen.list())
        await w.evaluate((id) => window.api.timer.openOutput(id), displays[0].id)
        assert.ok(
          await waitFor(async () => (await badge()).includes('läuft · Ausgabe')),
          await badge()
        )
      }
    ],
    [
      'pausiert + Ausgabefenster: „Ausgabe offen“ mit pulsierendem Punkt',
      async () => {
        await timer({ type: 'pause' })
        assert.ok(
          await waitFor(async () => (await badge()).includes('Ausgabe offen')),
          await badge()
        )
        assert.ok(
          await w.evaluate(
            () => !!document.querySelector('[aria-label="Stage-Timer & Uhr"] .animate-pulse')
          )
        )
      }
    ],
    [
      'Ausgabe geschlossen: kein Hinweis mehr',
      async () => {
        await w.evaluate(() => window.api.timer.closeOutput())
        assert.ok(await waitFor(async () => !(await badge()).includes('Ausgabe')))
      }
    ],
    [
      'Hauptfenster minimiert, Ausgabe geschlossen: die App läuft weiter',
      async () => {
        // Windows meldet ein minimiertes Fenster als unsichtbar – früher beendete sich die App
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize())
        const displays = await w.evaluate(() => window.api.screen.list())
        await w.evaluate((id) => window.api.timer.openOutput(id), displays[0].id)
        assert.ok(await waitFor(async () => (await badge()).includes('Ausgabe')), await badge())
        await w.evaluate(() => window.api.timer.closeOutput())
        await sleep(1000)
        const alive = await app
          .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
          .catch(() => 0)
        assert.ok(alive >= 1, 'die App hat sich beendet')
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore())
      }
    ]
  ])

  await runSteps('Stage-Timer: Anzeige im Browser', [
    [
      'Restzeit, Redner und Titel kommen an, die Zeit läuft live',
      async () => {
        await w.evaluate((p) => window.api.timer.remoteStart(p), TIMER_PORT)
        await segments(300)
        await timer({ type: 'start' })
        pg = await openBrowserWindow(app, 'about:blank')
        await pg.goto(`${BASE}/anzeige`)
        assert.ok(
          await waitFor(async () => /^4:5\d$|^5:00$/.test(await show(pg, 'digits'))),
          await show(pg, 'digits')
        )
        assert.equal(await show(pg, 'title'), 'Keynote')
        assert.equal(await show(pg, 'speaker'), 'Anna')
        const t1 = await show(pg, 'digits')
        await sleep(2200)
        assert.notEqual(t1, await show(pg, 'digits'))
      }
    ],
    [
      'Nachricht an die Bühne erscheint',
      async () => {
        await timer({ type: 'message', text: 'Noch 2 Minuten', flash: true })
        assert.ok(
          await waitFor(
            async () =>
              (await visible(pg, 'msg')) && (await show(pg, 'msgtext')) === 'Noch 2 Minuten'
          )
        )
      }
    ],
    [
      'Warnfarbe rot unter der Alarmschwelle',
      async () => {
        await timer({ type: 'adjust', deltaSec: -250 })
        assert.ok(
          await waitFor(() =>
            pg.evaluate(() => document.getElementById('digits').style.color === 'rgb(239, 68, 68)')
          )
        )
      }
    ],
    [
      'Uhr-Modus zeigt die Uhrzeit des Rechners',
      async () => {
        await timer({ type: 'setDisplayMode', mode: 'clock' })
        const t = hhmm(new Date())
        assert.ok(
          await waitFor(async () => (await show(pg, 'cbig')).startsWith(t)),
          await show(pg, 'cbig')
        )
        await timer({ type: 'setDisplayMode', mode: 'timer' })
      }
    ],
    [
      'Fernsteuerung aus: „Verbindung getrennt“, wieder an: verbindet sich selbst',
      async () => {
        await w.evaluate(() => window.api.timer.remoteStop())
        assert.ok(await waitFor(() => visible(pg, 'conn'), 15_000), 'Hinweis erscheint nicht')
        await w.evaluate((p) => window.api.timer.remoteStart(p), TIMER_PORT)
        assert.ok(
          await waitFor(async () => !(await visible(pg, 'conn')), 15_000),
          'verbindet nicht neu'
        )
      }
    ],
    [
      'Werkzeug zeigt die Adresse …/anzeige',
      async () => {
        await openRoute(w, '/tool/stage-timer')
        await w.getByText('Anzeige im Browser').first().waitFor({ timeout: 15_000 })
        await w.getByRole('button', { name: /Anzeige im Browser/ }).click()
        assert.ok(
          await waitFor(() =>
            w.evaluate(() =>
              [...document.querySelectorAll('button')].some((b) =>
                /\/anzeige$/.test(b.textContent ?? '')
              )
            )
          )
        )
      }
    ]
  ])

  await runSteps('Stage-Timer: Korrekturen aus dem Review', [
    [
      '/anzeige/ mit Schrägstrich wird umgeleitet und verbindet',
      async () => {
        await segments(600)
        await timer({ type: 'start' })
        pg = await openBrowserWindow(app, 'about:blank', { timezoneId: deviceZone })
        await pg.goto(`${BASE}/anzeige/`)
        assert.equal(new URL(pg.url()).pathname, '/anzeige')
        assert.ok(await waitFor(async () => /^\d+:\d\d$/.test(await show(pg, 'digits'))))
      }
    ],
    [
      `Uhrzeit des Rechners, nicht die des Geräts (Zone ${deviceZone})`,
      async () => {
        const t = hhmm(new Date())
        assert.ok(
          await waitFor(async () => (await show(pg, 'hclock')).startsWith(t)),
          `${await show(pg, 'hclock')} statt ${t}`
        )
      }
    ],
    [
      'Fernsteuer-App: Link zur Anzeige und /timer/anzeige/ wird umgeleitet',
      async () => {
        if (!remoteAppFree) throw new Skip('Port 8090 ist belegt (läuft eine Mottulbox?)')
        const up = await fetch('http://127.0.0.1:8090/', {
          signal: AbortSignal.timeout(3000)
        }).then(
          (r) => r.ok,
          () => false
        )
        if (!up) throw new Skip('Fernsteuer-App läuft nicht')
        const p2 = await openBrowserWindow(app, 'about:blank')
        await p2.goto('http://127.0.0.1:8090/')
        assert.ok(
          await waitFor(() =>
            p2.evaluate(() => !!document.querySelector('a.more[href="timer/anzeige"]'))
          )
        )
        await p2.goto('http://127.0.0.1:8090/timer/anzeige/')
        assert.equal(new URL(p2.url()).pathname, '/timer/anzeige')
        assert.ok(await waitFor(async () => /^\d+:\d\d$/.test(await show(p2, 'digits'))))
        await p2.close()
      }
    ],
    [
      'eingefrorener Strom wird neu aufgebaut, Zeit läuft weiter',
      async () => {
        await pg.goto(`http://127.0.0.1:${PROXY_PORT}/anzeige`)
        assert.ok(
          await waitFor(async () => /^\d+:\d\d$/.test(await show(pg, 'digits'))),
          'nicht verbunden'
        )
        freezeAll()
        const a = await show(pg, 'digits')
        // Erkennen (ca. 3 s) und Neuaufbau; hängt die Anfrage zuerst an einer toten Keep-Alive-
        // Verbindung, braucht es einen zweiten Anlauf – deshalb großzügig warten.
        assert.ok(
          await waitFor(async () => (await show(pg, 'digits')) !== a, 12_000),
          'Anzeige steht'
        )
        assert.equal(await visible(pg, 'conn'), false, 'Dauer-Hinweis trotz Neuaufbau')
      }
    ],
    [
      'Netz ganz weg: „Verbindung getrennt“; Netz zurück: verbindet sich selbst und zählt wieder',
      async () => {
        freezeNew = true
        freezeAll()
        assert.ok(await waitFor(() => visible(pg, 'conn'), 10_000), 'Hinweis erscheint nicht')
        freezeNew = false
        assert.ok(
          await waitFor(async () => !(await visible(pg, 'conn')), 15_000),
          'verbindet nicht neu'
        )
        const c = await show(pg, 'digits')
        await sleep(1500)
        assert.notEqual(c, await show(pg, 'digits'))
      }
    ],
    [
      'pausiert, Stand ändert sich über toten Strom: spätestens nach 10 s richtig, Start läuft live',
      async () => {
        await timer({ type: 'pause' })
        await sleep(800)
        freezeNew = true
        freezeAll()
        await timer({ type: 'adjust', deltaSec: -120 })
        freezeNew = false
        assert.ok(
          await waitFor(async () => Number((await show(pg, 'digits')).split(':')[0]) < 8, 14_000),
          await show(pg, 'digits')
        )
        await timer({ type: 'start' })
        assert.ok(
          await waitFor(async () => {
            const x = await show(pg, 'digits')
            await sleep(1300)
            return x !== (await show(pg, 'digits'))
          }, 8000)
        )
      }
    ]
  ])
} finally {
  proxy.close()
  await w.evaluate(() => window.api.timer.remoteStop()).catch(() => {})
  await ctx.close()
}
