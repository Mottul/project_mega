// Stream fürs Heimnetz vom Stage-Timer: echter Server, echtes ffmpeg, ein Empfänger wie die
// Heimkino-Box (ffprobe liest den Strom über HTTP). Ohne gebündeltes ffmpeg übersprungen.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import net from 'node:net'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { findFfmpeg, launchApp, portFree, runSteps, Skip, sleep, waitFor } from './harness.mjs'
import { mitschneiden, zeitachse } from './tsMitschnitt.mjs'

const pexec = promisify(execFile)
const ffmpeg = findFfmpeg()
const ffprobe = ffmpeg?.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1') ?? null

const ctx = await launchApp()
const { app, page } = ctx

const status = () => page.evaluate(() => window.api.timer.streamStatus())
const offscreenWindows = () =>
  app.evaluate(
    ({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.webContents.isOffscreen())
        .length
  )
const PORT = 18093
const cfg = { width: 640, height: 360, fps: 15, port: PORT, bitrateKbps: 1000 }
const url = `http://127.0.0.1:${PORT}/live.ts`

/** Liest ein paar Sekunden vom Strom und meldet, was darin steckt (wie ein Empfänger). */
async function probe() {
  const { stdout } = await pexec(
    ffprobe,
    [
      '-v',
      'error',
      '-read_intervals',
      '%+3',
      '-show_entries',
      'stream=codec_name,width,height,profile',
      '-count_frames',
      '-of',
      'json',
      url
    ],
    { timeout: 30_000 }
  )
  return JSON.parse(stdout).streams[0]
}

const needFfmpeg = () => {
  if (!ffmpeg) throw new Skip('kein gebündeltes ffmpeg (resources/ffmpeg)')
}

try {
  await runSteps('Stream fürs Heimnetz (Stage-Timer)', [
    [
      'aus beim Start',
      async () => {
        const st = await status()
        assert.equal(st.running, false)
        assert.deepEqual(st.urls, [])
      }
    ],
    [
      'Start: Server lauscht, ein Offscreen-Fenster, der Startbildschirm weiß davon',
      async () => {
        assert.equal(await portFree(PORT), true, `Port ${PORT} ist belegt`)
        const st = await page.evaluate((c) => window.api.timer.streamStart(c), cfg)
        assert.equal(st.running, true, st.error ?? '')
        assert.equal(st.clients, 0)
        assert.ok(
          st.urls.every((u) => u.endsWith(`:${PORT}/live.ts`)),
          st.urls.join(' ')
        )
        assert.equal(await offscreenWindows(), 1)
        assert.equal(await portFree(PORT), false)
        assert.equal((await page.evaluate(() => window.api.timer.getState())).streamActive, true)
      }
    ],
    [
      'ein Empfänger bekommt H.264 in der eingestellten Größe',
      async () => {
        needFfmpeg()
        const s = await probe()
        assert.equal(s.codec_name, 'h264')
        assert.equal(s.width, 640)
        assert.equal(s.height, 360)
        assert.equal(s.profile, 'High')
      }
    ],
    [
      'zwei Empfänger gleichzeitig; Status zählt sie und misst die Datenrate',
      async () => {
        needFfmpeg()
        const beide = Promise.all([probe(), probe()])
        const st = await waitFor(async () => {
          const s = await status()
          return s.clients === 2 && s.kbps > 0 && s.encoder ? s : null
        }, 15_000)
        assert.ok(st, 'Status meldet nicht 2 Empfänger mit Datenrate')
        const [a, b] = await beide
        assert.equal(a.codec_name, 'h264')
        assert.equal(b.codec_name, 'h264')
      }
    ],
    [
      'Empfänger weg -> Zähler 0 (ffmpeg läuft noch kurz nach)',
      async () => {
        needFfmpeg()
        assert.ok(await waitFor(async () => (await status()).clients === 0, 10_000))
      }
    ],
    [
      'Zeit im Strom läuft mit der Uhr, auch wenn der main-Prozess hängt',
      async () => {
        needFfmpeg()
        // Hänger nachstellen: Der main-Prozess rechnet fünfmal 0,8 s am Stück (wie ein großer
        // GC-Lauf oder ein Bild, das lange umgerechnet wird). Stufe 1 ließ danach Bilder aus –
        // die Zeit im Strom blieb jedes Mal dauerhaft zurück, bis der Puffer des Empfängers leer
        // war und er sekundenlang stockte (gemeldet am 21.11.2026 aus VLC am PC und am Handy).
        const st = await page.evaluate((c) => window.api.timer.streamStart(c), {
          ...cfg,
          width: 1280,
          height: 720,
          fps: 30,
          bitrateKbps: 2000
        })
        assert.equal(st.running, true, st.error ?? '')
        const haenger = async () => {
          await sleep(4000)
          for (let i = 0; i < 5; i++) {
            await app.evaluate(() => {
              const ende = Date.now() + 800
              while (Date.now() < ende) {
                // blockiert absichtlich
              }
            })
            await sleep(2500)
          }
        }
        const m = await mitschneiden(url, 24_000, { waehrend: haenger })
        const z = zeitachse(m.video)
        assert.ok(z, 'kein Bild empfangen')
        const skala = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().scaleFactor)
        console.log(
          `    ${m.video.length} Bilder über ${z.dauer.toFixed(1)} s Strom-Zeit ` +
            `(${z.bilderJeSekunde.toFixed(1)}/s), Rückstand am Ende ${z.rueckstand.toFixed(2)} s, ` +
            `größter Versatz ${z.puffer.toFixed(2)} s, Bildschirm-Skalierung ${skala}, ` +
            `Abstand ${z.schrittMs.toFixed(1)} ms` +
            (z.spruenge.length
              ? `, Sprünge: ${z.spruenge.map((s) => `${s.umS.toFixed(2)} s bei ${s.beiS.toFixed(1)} s`).join(', ')}`
              : '')
        )
        const ok = z.rueckstand < 0.3 && Math.abs(z.bilderJeSekunde - 30) < 1.5
        if (!ok) {
          // Was der Sender dabei protokolliert hat (Encoder, Neustarts, Abbrüche)
          const log = readFileSync(join(ctx.userData, 'avtoolbox-debug.log'), 'utf8')
          const zeilen = log.split(/\r?\n/).filter((l) => l.includes('[timer-stream]'))
          console.log(
            zeilen
              .slice(-25)
              .map((l) => `      ${l}`)
              .join('\n')
          )
        }
        // Fünf Hänger zu 0,8 s: Stufe 1 verlor dabei gemessen 3,98 s. Erlaubt ist Zittern, kein
        // Verlust – nach jedem Hänger muss die Zeit im Strom wieder mit der Uhr laufen.
        assert.ok(z.rueckstand < 0.3, `Strom-Zeit bleibt ${z.rueckstand.toFixed(2)} s zurück`)
        assert.ok(Math.abs(z.bilderJeSekunde - 30) < 1.5, `${z.bilderJeSekunde} Bilder/s`)
      }
    ],
    [
      'Werte aus dem Renderer begrenzt',
      async () => {
        const st = await page.evaluate(
          (p) =>
            window.api.timer.streamStart({
              width: 641,
              height: 99999,
              fps: 500,
              port: p,
              bitrateKbps: 1
            }),
          PORT
        )
        assert.deepEqual(
          [st.config.width, st.config.height, st.config.fps, st.config.bitrateKbps],
          [640, 2160, 60, 500]
        )
        assert.equal(st.running, true)
        await waitFor(async () => (await offscreenWindows()) === 1)
        assert.equal(await offscreenWindows(), 1)
      }
    ],
    [
      'Stopp: Fenster weg, Port frei, Startbildschirm zurück',
      async () => {
        const st = await page.evaluate(() => window.api.timer.streamStop())
        assert.equal(st.running, false)
        assert.ok(await waitFor(async () => (await offscreenWindows()) === 0, 5000))
        assert.ok(await waitFor(() => portFree(PORT), 5000), 'Port bleibt belegt')
        assert.equal((await page.evaluate(() => window.api.timer.getState())).streamActive, false)
      }
    ],
    [
      'belegter Port: verständliche Meldung statt Absturz',
      async () => {
        const blocker = net.createServer()
        await new Promise((r) => blocker.listen(PORT, r))
        try {
          const st = await page.evaluate((c) => window.api.timer.streamStart(c), cfg)
          assert.equal(st.running, false)
          assert.match(st.error ?? '', /belegt/)
          assert.equal(await offscreenWindows(), 0)
        } finally {
          blocker.close()
        }
      }
    ]
  ])
} finally {
  await ctx.close()
}

// Bildschirm-Skalierung 150 %: Das Offscreen-Fenster malt dann nicht genau in der eingestellten
// Größe (gemessen 641 × 362 statt 640 × 360). Stufe 1 skalierte deshalb JEDES Bild im
// main-Prozess zurück – bei jeder Skalierung über 100 % (Verdacht für die Hänger). Jetzt bekommt
// ffmpeg das Bild, wie es kommt, und skaliert selbst.
const hidpi = await launchApp({ args: ['--force-device-scale-factor=1.5'] })
try {
  await runSteps('Stream bei Bildschirm-Skalierung 150 %', [
    [
      'ffmpeg bekommt das Bild ungeändert, der Empfänger die eingestellte Größe',
      async () => {
        needFfmpeg()
        const st = await hidpi.page.evaluate((c) => window.api.timer.streamStart(c), cfg)
        assert.equal(st.running, true, st.error ?? '')
        const s = await probe()
        assert.equal(s.codec_name, 'h264')
        assert.deepEqual([s.width, s.height], [640, 360])
        await hidpi.page.evaluate(() => window.api.timer.streamStop())
        // Die letzte Startzeile nennt die Eingangsgröße. Kam der Empfänger vor dem ersten Bild,
        // startete ffmpeg zuerst in der eingestellten Größe und danach neu – auch das ist recht.
        const log = readFileSync(join(hidpi.userData, 'avtoolbox-debug.log'), 'utf8')
        const starts = [...log.matchAll(/\[timer-stream\] ffmpeg läuft: \S+ (\d+)x(\d+)/g)]
        assert.ok(starts.length, 'keine Logzeile „ffmpeg läuft“')
        const [, w, h] = starts.at(-1)
        if (w === '640' && h === '360') throw new Skip('Electron malt genau 640 × 360')
        console.log(`    paint-Bild ${w} × ${h}, ffmpeg skaliert auf 640 × 360`)
      }
    ]
  ])
} finally {
  await hidpi.close()
}
